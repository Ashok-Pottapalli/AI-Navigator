import os
import json
import uuid
import sqlite3
from datetime import datetime
from typing import List
import pandas as pd

import chromadb
from chromadb.utils import embedding_functions
from langgraph.graph import StateGraph, END

from schemas import OrchestratorState

# ══════════════════════════════════════════════════════════════════════════════
# AZURE OPENAI CLIENT
# ══════════════════════════════════════════════════════════════════════════════
try:
    from openai import AzureOpenAI

    _azure_client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        azure_endpoint=os.getenv("AZURE_OPENAI_BASE_URL", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
    )
    _AZURE_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    HAS_AZURE = bool(
        os.getenv("AZURE_OPENAI_API_KEY") and
        os.getenv("AZURE_OPENAI_BASE_URL") and
        _AZURE_DEPLOYMENT
    )
except Exception:
    _azure_client = None
    _AZURE_DEPLOYMENT = ""
    HAS_AZURE = False

SYSTEM_VERSION = "2.0"

# ══════════════════════════════════════════════════════════════════════════════
# AI TOOLS CAPABILITY REGISTRY (Loaded from Excel)
# ══════════════════════════════════════════════════════════════════════════════

def _split_list(val) -> list:
    """Split a comma-separated Excel cell value into a clean list."""
    if pd.isna(val) or str(val).strip() == "":
        return []
    return [x.strip() for x in str(val).split(",") if x.strip()]


def load_tools_registry_from_excel(
    excel_path: str = "AI_TOOLS_REGISTRY.xlsx",
    sheet_name: str = "AI_TOOLS_REGISTRY",
) -> dict:
    df = pd.read_excel(excel_path, sheet_name=sheet_name)
    registry = {}
    for _, row in df.iterrows():
        tool_name = str(row["tool_name"]).strip()
        registry[tool_name] = {
            "description": "" if pd.isna(row["description"]) else str(row["description"]),
            "best_for":    _split_list(row.get("best_for", "")),
            "not_for":     _split_list(row.get("not_for",  "")),
            # Roles column tells us which job roles should use this tool
            "roles":       _split_list(row.get("Roles",    "")),
            "category":    "" if pd.isna(row["category"]) else str(row["category"]),
            "url":         "" if pd.isna(row["url"])      else str(row["url"]),
            "icon":        "" if "icon" not in row or pd.isna(row.get("icon")) else str(row["icon"]),
        }
    return registry


# ── Live registry — mutated in-place when user uploads a new Excel ────────────
AI_TOOLS_REGISTRY: dict = {}


def reload_tools_registry(excel_bytes: bytes = None,
                           excel_path:  str   = "AI_TOOLS_REGISTRY.xlsx"):
    """
    (Re)load the registry.
    • excel_bytes — raw bytes from an uploaded file (UI upload path)
    • excel_path  — fallback disk path used on startup
    Mutates AI_TOOLS_REGISTRY in-place so every node sees the update instantly.
    """
    global AI_TOOLS_REGISTRY

    if excel_bytes:
        new = _load_from_bytes(excel_bytes)
    else:
        new = load_tools_registry_from_excel(
            excel_path=excel_path,
            sheet_name="AI_TOOLS_REGISTRY"
        )

    if not new:
        raise ValueError(
            "Excel file was parsed but no tool rows were found in sheet 'AI_TOOLS_REGISTRY'."
        )

    AI_TOOLS_REGISTRY.clear()
    AI_TOOLS_REGISTRY.update(new)


def _load_from_bytes(excel_bytes: bytes) -> dict:
    import io

    try:
        df = pd.read_excel(
            io.BytesIO(excel_bytes),
            sheet_name="AI_TOOLS_REGISTRY",
            engine="openpyxl"
        )
    except Exception as e:
        raise ValueError(f"Failed to read sheet 'AI_TOOLS_REGISTRY': {e}")

    required_cols = ["tool_name", "description", "category", "url"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    registry = {}
    for _, row in df.iterrows():
        tool_name = str(row["tool_name"]).strip()
        if not tool_name:
            continue

        registry[tool_name] = {
            "description": "" if pd.isna(row["description"]) else str(row["description"]),
            "best_for":    _split_list(row.get("best_for", "")),
            "not_for":     _split_list(row.get("not_for", "")),
            "roles":       _split_list(row.get("Roles", "")),
            "category":    "" if pd.isna(row["category"]) else str(row["category"]),
            "url":         "" if pd.isna(row["url"]) else str(row["url"]),
            "icon":        "" if "icon" not in df.columns or pd.isna(row.get("icon")) else str(row["icon"]),
        }

    if not registry:
        raise ValueError("Sheet was read successfully but contains no valid tool rows.")

    return registry


# Load from disk on startup
try:
    AI_TOOLS_REGISTRY.update(load_tools_registry_from_excel())
except Exception:
    pass


# ══════════════════════════════════════════════════════════════════════════════
# CHROMADB SETUP
# ══════════════════════════════════════════════════════════════════════════════
chroma_client = chromadb.PersistentClient(path="./chroma_db")
ef = embedding_functions.DefaultEmbeddingFunction()
policy_collection = chroma_client.get_or_create_collection(
    name="company_policies", embedding_function=ef
)


# ══════════════════════════════════════════════════════════════════════════════
# SQLITE DATABASE
# ══════════════════════════════════════════════════════════════════════════════
DB_PATH = "./orchestrator.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            raw_input TEXT,
            intent TEXT,
            industry TEXT,
            recommended_tool TEXT,
            tool_reason TEXT,
            tool_confidence TEXT,
            policy_flags TEXT,
            retrieved_policies TEXT,
            final_prompt TEXT,
            prompt_version TEXT,
            model_used TEXT,
            output TEXT,
            token_estimate INTEGER,
            system_version TEXT,
            policy_blocked INTEGER DEFAULT 0,
            policy_summary TEXT DEFAULT ''
        );
        -- Add columns to existing DB if upgrading (safe: ignored if already present)
        -- SQLite ignores "duplicate column" errors via the try/except in init_db

        CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY,
            audit_id TEXT,
            rating INTEGER,
            comment TEXT,
            issue_type TEXT,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            intent TEXT,
            industry TEXT,
            template TEXT NOT NULL,
            change_note TEXT,
            created_at TEXT,
            created_by TEXT DEFAULT 'system'
        );
    """)
    # Migrate existing DB — add new columns if they don't exist yet
    for col, definition in [("policy_blocked", "INTEGER DEFAULT 0"),
                             ("policy_summary", "TEXT DEFAULT ''")]:
        try:
            conn.execute(f"ALTER TABLE audit_log ADD COLUMN {col} {definition}")
            conn.commit()
        except Exception:
            pass  # Column already exists

    count = conn.execute("SELECT COUNT(*) as c FROM prompt_versions").fetchone()["c"]
    if count == 0:
        conn.execute(
            "INSERT INTO prompt_versions VALUES (?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()), "1.0", "general", "general",
                "## ROLE\nYou are an expert {industry} professional specializing in {intent} tasks.\n\n"
                "## CONTEXT\nUser Request: {user_input}\nIndustry: {industry} | Task Type: {intent}\nTarget Tool: {tool}\n\n"
                "## OBJECTIVE\nProduce a high-quality, professional {intent} that directly addresses the user's need.\n\n"
                "## LIMITATIONS & COMPLIANCE POLICIES\n{policy_block}\n  - No confidential or PII data\n  - Follow {industry} industry standards\n\n"
                "## OUTPUT FORMAT\n1. Executive Summary\n2. Main Content\n3. Key Recommendations\n4. Compliance Notes",
                "Initial CORLO template", datetime.utcnow().isoformat(), "system"
            )
        )
    conn.commit()
    conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# AZURE CALL HELPER
# ══════════════════════════════════════════════════════════════════════════════
def _azure_chat(messages: list, max_tokens: int = 512, temperature: float = 0.0) -> tuple:
    """Calls Azure OpenAI and returns (content_text, total_tokens). Raises on failure."""
    resp = _azure_client.chat.completions.create(
        model=_AZURE_DEPLOYMENT,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    content = resp.choices[0].message.content or ""
    tokens  = resp.usage.total_tokens if resp.usage else 0
    return content, tokens


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1024, temperature: float = 0.4) -> str:
    """
    Public helper for direct LLM calls (e.g. the /api/refine endpoint in routes.py).
    Returns the response text as a string.
    Raises RuntimeError if Azure is not configured and no fallback is possible.
    """
    if HAS_AZURE and _azure_client:
        content, _ = _azure_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return content
    else:
        # Graceful fallback when Azure env vars are not set
        return (
            "[Demo Mode — Azure OpenAI not configured]\n\n"
            "Refinement requires AZURE_OPENAI_API_KEY, AZURE_OPENAI_BASE_URL, and "
            "AZURE_OPENAI_DEPLOYMENT environment variables to be set.\n\n"
            f"Your comment was received: \"{user_prompt[:200]}...\""
        )


# ══════════════════════════════════════════════════════════════════════════════
# NODE 1 — INTENT + INDUSTRY CLASSIFIER
# ══════════════════════════════════════════════════════════════════════════════
VALID_INTENTS = [
    "proposal", "report", "email", "code", "content",
    "data analysis", "legal", "it support", "hr", "general"
]

VALID_INDUSTRIES = [
    "banking", "healthcare", "retail", "technology", "manufacturing", "general"
]

_INTENT_KEYWORDS = {
    "proposal":      ["proposal", "pitch", "offer", "bid", "rfp", "quotation"],
    "report":        ["report", "summary", "analysis", "findings", "review"],
    "email":         ["email", "mail", "message", "reply", "respond"],
    "code":          ["code", "script", "function", "program", "debug", "fix", "build", "refactor", "test"],
    "content":       ["blog", "article", "post", "content", "write", "draft", "copy"],
    "data analysis": ["analyze", "data", "insights", "chart", "trend", "metric", "dashboard", "kpi"],
    "legal":         ["contract", "legal", "compliance", "agreement", "terms", "policy", "clause"],
    "it support":    ["ticket", "incident", "issue", "support", "itsm", "helpdesk", "outage"],
    "hr":            ["hr", "employee", "leave", "payroll", "onboarding", "performance"],
}

_INDUSTRY_KEYWORDS = {
    "banking":       ["bank", "financial", "finance", "loan", "credit", "investment", "treasury"],
    "healthcare":    ["health", "medical", "hospital", "patient", "clinical", "pharma"],
    "retail":        ["retail", "store", "customer", "ecommerce", "product", "inventory"],
    "technology":    ["tech", "software", "it", "digital", "api", "system", "cloud"],
    "manufacturing": ["manufacturing", "production", "supply chain", "procurement", "warehouse"],
}


def _keyword_fallback_classify(text: str, task_type: str = None):
    text_lower = text.lower()

    # task_type from UI maps directly to intents — use it as first priority
    TASK_TYPE_TO_INTENT = {
        "research":      "report",
        "writing":       "content",
        "strategy":      "proposal",
        "data":          "data analysis",
        "code":          "code",
        "creative":      "content",
        "communication": "email",
        "learning":      "general",
        "automate":      "code",
        "decision":      "report",
    }
    detected_intent = TASK_TYPE_TO_INTENT.get(task_type, None)

    # If task_type didn't give us an intent, fall back to keyword scan
    if not detected_intent:
        detected_intent = "general"
        for intent, keywords in _INTENT_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                detected_intent = intent
                break

    detected_industry = "general"
    for industry, keywords in _INDUSTRY_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            detected_industry = industry
            break

    return detected_intent, detected_industry


def classify_intent(state: OrchestratorState) -> OrchestratorState:
    role        = state.get("role", "general")
    task_type   = state.get("task_type", "general")
    sensitivity = state.get("data_sensitivity", "general")

    if HAS_AZURE and _azure_client:
        try:
            classifier_prompt = f"""You are an enterprise task classifier. Analyze the user's request and return ONLY a JSON object.

USER REQUEST: "{state['user_input']}"

USER CONTEXT (use this to sharpen your classification):
- Role: {role}  (e.g. a developer asking something is likely a 'code' intent; an executive asking something is likely a 'report' or 'proposal')
- Task Type selected by user: {task_type}  (treat this as a strong hint for intent)
- Data Sensitivity: {sensitivity}  (client = confidential work; internal = inside the org; general = public)

CLASSIFY into exactly one INTENT from this list:
- proposal     : creating proposals, pitches, bids, RFPs, client offers, deliverables, presentations for clients
- report       : reports, summaries, analysis documents, findings, executive reviews, status updates
- email        : writing emails, messages, replies, follow-ups, communications
- code         : programming, scripting, debugging, refactoring, testing, DevOps, APIs, automation
- content      : blog posts, articles, marketing copy, social media, product descriptions, creative writing
- data analysis: data insights, dashboards, KPIs, metrics, charts, business intelligence, trend analysis
- legal        : contracts, compliance, legal review, agreements, terms, regulatory, policy documents
- it support   : IT tickets, incidents, outages, helpdesk, ITSM, change requests, infrastructure issues
- hr           : HR tasks, employee management, payroll, onboarding, performance reviews, leave requests
- general      : anything that does not clearly fit the above categories

CLASSIFY into exactly one INDUSTRY from this list:
- banking      : banking, finance, fintech, insurance, investment, wealth management, treasury, capital markets
- healthcare   : healthcare, medical, hospital, pharma, clinical, biotech, patient care, health IT
- retail       : retail, e-commerce, consumer goods, supply chain, merchandise, stores, omnichannel
- technology   : software, tech, IT services, SaaS, cloud, cybersecurity, data engineering, platforms
- manufacturing: manufacturing, production, industrial, automotive, logistics, factory, operations
- general      : cannot determine industry or does not fit above categories

RULES:
- The user's Role and Task Type are strong signals — weight them heavily alongside the request text.
- Read the FULL meaning, not just keywords. "Goldman Sachs integration" = banking. "Patient portal" = healthcare.
- If user mentions company names, infer the industry (SAP = technology, NHS = healthcare, etc.)
- Return ONLY valid JSON. No explanation. No markdown.

JSON FORMAT:
{{
  "intent": "<one of the 10 intents above>",
  "industry": "<one of the 6 industries above>",
  "intent_confidence": "HIGH or MEDIUM or LOW",
  "industry_confidence": "HIGH or MEDIUM or LOW",
  "reasoning": "<one sentence explaining your classification>"
}}"""

            raw, _ = _azure_chat(
                messages=[
                    {"role": "system", "content": "You are a JSON-only enterprise task classifier. Output valid JSON only. No markdown, no preamble, no explanation outside the JSON."},
                    {"role": "user", "content": classifier_prompt}
                ],
                max_tokens=200,
                temperature=0.0,
            )
            raw    = raw.replace("```json", "").replace("```", "").strip()
            data   = json.loads(raw)
            intent   = data.get("intent", "general")
            industry = data.get("industry", "general")
            if intent not in VALID_INTENTS:
                intent = "general"
            if industry not in VALID_INDUSTRIES:
                industry = "general"
            return {**state, "intent": intent, "industry": industry}

        except Exception:
            intent, industry = _keyword_fallback_classify(state["user_input"], state.get("task_type"))
            return {**state, "intent": intent, "industry": industry}
    else:
        intent, industry = _keyword_fallback_classify(state["user_input"], state.get("task_type"))
        return {**state, "intent": intent, "industry": industry}


# ══════════════════════════════════════════════════════════════════════════════
# NODE 2 — AI TOOL RECOMMENDER
# ══════════════════════════════════════════════════════════════════════════════
def _role_matches(user_role: str, tool_roles: list) -> bool:
    """
    Return True if the user's role appears in the tool's allowed roles list.
    An empty roles list means the tool is open to ALL roles.
    """
    if not tool_roles:
        return True
    u = user_role.lower()
    return any(u in r.lower() or r.lower() in u for r in tool_roles)


def recommend_tool(state: OrchestratorState) -> OrchestratorState:
    user_role       = state.get("role",             "general").strip()
    task_type       = state.get("task_type",        "general").strip()
    sensitivity     = state.get("data_sensitivity", "general").strip()

    # ── Policy context ────────────────────────────────────────────────────────
    try:
        pol_results = policy_collection.query(
            query_texts=[f"approved AI tools allowed forbidden {state['user_input']}"],
            n_results=3,
        )
        policy_docs = pol_results.get("documents", [[]])[0]
        policy_text = "\n".join(f"- {p}" for p in policy_docs) if policy_docs else "No specific tool-use policies found."
    except Exception:
        policy_text = "No specific tool-use policies found."

    # ── Build registry text grouped by role match ─────────────────────────────
    # Tools whose Roles column (from Excel) includes the user's role come first.
    # This is the primary signal for tool selection.
    role_matched   = []
    role_unmatched = []

    for name, info in AI_TOOLS_REGISTRY.items():
        tool_roles   = info.get("roles", [])
        roles_label  = ", ".join(tool_roles) if tool_roles else "All roles"
        entry = (
            f"TOOL: {name}\n"
            f"  Category : {info['category']}\n"
            f"  Suited Roles (from Excel): {roles_label}\n"
            f"  Best For : {', '.join(info['best_for'])}\n"
            f"  Not For  : {', '.join(info['not_for'])}\n"
            f"  Description: {info['description'][:120]}"
        )
        if _role_matches(user_role, tool_roles):
            role_matched.append((name, entry))
        else:
            role_unmatched.append((name, entry))

    registry_text = ""
    if role_matched:
        registry_text += "=== TOOLS APPROVED FOR THIS USER'S ROLE (prefer these) ===\n"
        registry_text += "\n\n".join(e for _, e in role_matched)
    if role_unmatched:
        registry_text += "\n\n=== OTHER TOOLS (lower priority — role not listed in Excel) ===\n"
        registry_text += "\n\n".join(e for _, e in role_unmatched)

    # ── Sensitivity guard ─────────────────────────────────────────────────────
    # For client/internal data, public AI tools must be flagged or avoided.
    sensitivity_instruction = ""
    if sensitivity in ("client", "internal"):
        sensitivity_instruction = (
            f"\n⚠️ DATA SENSITIVITY IS '{sensitivity.upper()}': "
            "Do NOT recommend public AI tools (e.g. ChatGPT) that have no enterprise data privacy guarantees. "
            "Prefer tools with enterprise-grade security (Microsoft Copilot, SAP Joule, GitHub Copilot, etc.)."
        )

    router_prompt = f"""You are an Enterprise AI Tool Recommender.

The MOST IMPORTANT factor is the user's Role combined with what each tool's 'Suited Roles' column says in the registry below.
Always prefer tools whose Suited Roles list includes the user's role.

AVAILABLE TOOLS (read Suited Roles carefully — they come directly from the company's Excel registry):
{registry_text}

COMPANY POLICIES:
{policy_text}
{sensitivity_instruction}

USER REQUEST: "{state['user_input']}"
Detected Intent : {state['intent']}
Detected Industry: {state['industry']}

USER CONTEXT:
- Role            : {user_role}  ← match this against each tool's Suited Roles
- Task Type       : {task_type}
- Data Sensitivity: {sensitivity}

DECISION RULES (apply in order):
1. Only recommend a tool whose Suited Roles includes "{user_role}" — unless NO tool matches, then pick closest.
2. Among role-matched tools, pick the one whose Best For keywords best match the user request and task type.
3. If sensitivity is client or internal, exclude public AI tools with no data privacy guarantees.
4. Never recommend a tool listed under a policy restriction.

Return ONLY valid JSON:
{{
  "recommended_tool": "<exact tool name from registry>",
  "confidence": "HIGH or MEDIUM or LOW",
  "reason": "<2-3 sentences: why this tool fits this role + task type + sensitivity>",
  "alternatives": ["<2nd best role-matched tool>", "<3rd best>"],
  "policy_flags": ["<any sensitivity or policy warning, else empty list>"]
}}"""

    if HAS_AZURE and _azure_client:
        try:
            raw, _ = _azure_chat(
                messages=[
                    {"role": "system", "content": "You are a JSON-only enterprise AI tool router. Respond with valid JSON only. No markdown, no preamble."},
                    {"role": "user",   "content": router_prompt},
                ],
                max_tokens=400,
                temperature=0.1,
            )
            raw  = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(raw)

            tool_name = data.get("recommended_tool", "")
            if tool_name not in AI_TOOLS_REGISTRY:
                tool_name = _fallback_tool(state["user_input"], state["intent"], user_role)

            alternatives = [
                t for t in data.get("alternatives", [])
                if t in AI_TOOLS_REGISTRY and t != tool_name
            ][:2]

            return {
                **state,
                "recommended_tool":  tool_name,
                "tool_reason":       data.get("reason", "Selected based on role and task analysis."),
                "tool_confidence":   data.get("confidence", "MEDIUM"),
                "tool_alternatives": alternatives,
                "policy_flags":      data.get("policy_flags", []),
            }
        except Exception as e:
            tool_name = _fallback_tool(state["user_input"], state["intent"], user_role)
            return {
                **state,
                "recommended_tool":  tool_name,
                "tool_reason":       f"Keyword/role fallback (router error: {str(e)[:80]})",
                "tool_confidence":   "LOW",
                "tool_alternatives": [],
                "policy_flags":      [],
            }
    else:
        tool_name = _fallback_tool(state["user_input"], state["intent"], user_role)
        info = AI_TOOLS_REGISTRY.get(tool_name, {})
        return {
            **state,
            "recommended_tool":  tool_name,
            "tool_reason":       f"[Demo] {info.get('description', '')[:150]}",
            "tool_confidence":   "MEDIUM",
            "tool_alternatives": [],
            "policy_flags":      ["Set AZURE_OPENAI_* env vars for AI-powered tool recommendation"],
        }


def _fallback_tool(user_input: str, intent: str, role: str = "general") -> str:
    """
    Keyword + role scoring fallback when the LLM is unavailable.
    Score = keyword hits in best_for  +  role bonus (2pts) if user role is in tool's roles list.
    """
    text   = user_input.lower()
    scores = {}
    for name, info in AI_TOOLS_REGISTRY.items():
        kw_score   = sum(1 for kw in info["best_for"] if kw.lower() in text)
        role_bonus = 2 if _role_matches(role, info.get("roles", [])) else 0
        scores[name] = kw_score + role_bonus

    best = max(scores, key=scores.get)
    if scores[best] == 0:
        # Hard defaults keyed by (intent, role) first, then intent alone
        defaults_by_role_intent = {
            ("code",          "Developer / Technical"): "GitHub Copilot",
            ("it support",    "Developer / Technical"): "ServiceNow AI",
            ("data analysis", "Business Analyst"):      "Power BI Copilot",
            ("data analysis", "Finance / Accounting"):  "Power BI Copilot",
            ("hr",            "HR / People Ops"):       "SAP Joule",
            ("report",        "Executive / Director"):  "Microsoft Copilot",
            ("email",         "Sales / BD"):            "Salesforce Einstein",
            ("content",       "Marketing / Comms"):     "Microsoft Copilot",
        }
        hit = defaults_by_role_intent.get((intent, role))
        if hit and hit in AI_TOOLS_REGISTRY:
            return hit
        # Fall back to intent-only defaults
        return {
            "code":          "GitHub Copilot",
            "legal":         "Claude (Anthropic)",
            "report":        "Microsoft Copilot",
            "email":         "Microsoft Copilot",
            "it support":    "ServiceNow AI",
            "data analysis": "Power BI Copilot",
            "hr":            "SAP Joule",
            "content":       "ChatGPT (OpenAI)",
        }.get(intent, "Microsoft Copilot")
    return best


# ══════════════════════════════════════════════════════════════════════════════
# NODE 3 — POLICY RAG RETRIEVAL
# ══════════════════════════════════════════════════════════════════════════════
def retrieve_policies(state: OrchestratorState) -> OrchestratorState:
    query = f"{state['intent']} {state['industry']} {state['user_input']}"
    try:
        results  = policy_collection.query(query_texts=[query], n_results=3)
        docs     = results.get("documents", [[]])[0]
        policies = docs if docs else []
    except Exception:
        policies = []
    return {**state, "policies": policies}


# ══════════════════════════════════════════════════════════════════════════════
# NODE 3b — POLICY COMPLIANCE CHECK
# Analyses retrieved policies against the user request.
# If policies are found, generates a meaningful summary explaining what applies
# and whether the task is restricted. Sets policy_blocked=True when needed.
# ══════════════════════════════════════════════════════════════════════════════

_SENSITIVE_TOPIC_KEYWORDS = [
    # Direct prohibited topics from policy PDF
    "alcohol", "drug", "drugs", "tobacco", "gambling", "skin betting",
    "weapon", "weapons", "firearm", "firearms", "explosive", "explosives",
    "non-historical weapon",
    "adult content", "pornography", "adult entertainment",
    "harassment", "discrimination", "bribery",
    "corruption", "money laundering", "insider trading", "tax evasion",
    "illegal", "unlawful", "controlled substance", "narcotics",
    "violence", "extremism", "terrorism", "abuse", "animal abuse",
    "endangered species", "politics", "political",
    "religion", "religious",

    # Dangerous / harmful requests that must be blocked even if not written exactly in policy
    "gun", "guns", "bomb", "bombs", "ammo", "ammunition", "bullet", "bullets",
    "grenade", "grenades", "rifle", "pistol", "shotgun", "sniper",
    "explosive device", "improvised explosive", "ied", "detonator",
    "make a bomb", "build a bomb", "how to make a bomb",
    "make a gun", "build a gun",
    "weaponize", "weaponise",

    # Medical matters
    "medical", "medicine", "diagnosis", "symptom", "treatment", "prescription",
    "leg pain", "chest pain", "headache", "disease", "illness", "doctor",
    "surgery", "vaccine", "infection", "injury", "pain relief", "advise me",

    # Financial/legal advice
    "financial investment", "investment advice", "legal advice",

    # Privacy, racism, geopolitical
    "privacy", "personal data", "racism", "racist", "geopolitical",

    # Sales/discounts
    "discount offer", "sales discount",
]

# Signals in policy text that confirm a topic is explicitly prohibited
_RESTRICTION_SIGNALS = [
    "do not talk about", "prohibited", "not permitted", "forbidden",
    "must not", "shall not", "not allowed", "ban", "restricted",
    "no tolerance", "zero tolerance", "do not offer", "do not provide",
]


def _detect_hard_block_topic(user_input: str):
    """
    Detect dangerous / prohibited requests directly from user text,
    even if the uploaded policy text does not contain the exact same word.
    """
    text = (user_input or "").lower().strip()

    hard_block_terms = [
        "gun", "guns", "bomb", "bombs", "ammo", "ammunition",
        "grenade", "grenades", "rifle", "pistol", "shotgun",
        "explosive device", "improvised explosive", "ied", "detonator",
        "make a bomb", "build a bomb", "how to make a bomb",
        "make a gun", "build a gun",
    ]

    for term in hard_block_terms:
        if term in text:
            return term

    return None


def check_policy_compliance(state: OrchestratorState) -> OrchestratorState:
    """
    Examines retrieved policies against the user request.
    - Hard-blocks obviously dangerous topics directly from user text
    - Then evaluates retrieved policies
    - If blocked, prompt generation + LLM execution must not run
    """
    policies = state.get("policies", [])
    user_input = state["user_input"]
    intent = state.get("intent", "general")
    existing_flags = state.get("policy_flags", [])

    # ── Hard block first: dangerous requests should never proceed ──
    hard_block_match = _detect_hard_block_topic(user_input)
    if hard_block_match:
        return {
            **state,
            "policy_summary": (
                f"This request contains prohibited harmful content related to '{hard_block_match}'. "
                "Requests involving weapons, bombs, firearms, explosives, or dangerous instructions "
                "must be blocked and cannot proceed."
            ),
            "policy_blocked": True,
            "policy_flags": list(set(existing_flags + [f"Prohibited topic detected: '{hard_block_match}'"])),
        }

    # ── No policies in the database at all ───────────────────────────────────
    if not policies:
        return {
            **state,
            "policy_summary": (
                "No company policy documents have been uploaded yet, so no specific policy excerpts "
                "were applied to this request. General enterprise best practices apply."
            ),
            "policy_blocked": False,
            "policy_flags": existing_flags,
        }

    policy_text = "\n\n".join(f"Policy excerpt {i+1}:\n{p}" for i, p in enumerate(policies))

    # ── LLM-powered compliance check ─────────────────────────────────────────
    if HAS_AZURE and _azure_client:
        try:
            compliance_prompt = f"""You are an enterprise compliance officer. A user has submitted a task request, and relevant excerpts from the company's policy documents have been retrieved.

USER REQUEST: "{user_input}"
DETECTED INTENT: {intent}

RETRIEVED POLICY EXCERPTS:
{policy_text}

Your job is to:
1. Determine whether the user's request is PERMITTED, RESTRICTED (allowed with caveats), or BLOCKED (explicitly prohibited) under the retrieved policies.
2. Write a clear, plain-English explanation (3-5 sentences) that:
   - Summarises what the retrieved policies say about this topic
   - Explains how they apply (or don't apply) to this specific request
   - States clearly what the user can and cannot do under these policies
   - If blocked: explains WHY and what the user should do instead

Return ONLY valid JSON:
{{
  "status": "PERMITTED" or "RESTRICTED" or "BLOCKED",
  "summary": "<3-5 sentence plain English explanation>",
  "flags": ["<short flag if any restriction applies, else empty list>"]
}}"""

            raw, _ = _azure_chat(
                messages=[
                    {"role": "system", "content": "You are a JSON-only enterprise compliance analyst. Return valid JSON only."},
                    {"role": "user",   "content": compliance_prompt},
                ],
                max_tokens=400,
                temperature=0.0,
            )
            raw  = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(raw)

            status  = str(data.get("status", "PERMITTED")).upper()
            summary = data.get("summary", "")
            flags   = data.get("flags", [])

            all_flags = list(set(existing_flags + flags))
            all_flags_lower = " | ".join(str(f).lower() for f in all_flags)

            # If any warning/flag clearly indicates prohibited or restricted content,
            # force the request into blocked mode.
            force_block = (
                status == "BLOCKED"
                or "prohibited" in all_flags_lower
                or "blocked" in all_flags_lower
                or "not allowed" in all_flags_lower
                or "forbidden" in all_flags_lower
                or "weapon" in all_flags_lower
                or "firearm" in all_flags_lower
                or "explosive" in all_flags_lower
                or "bomb" in all_flags_lower
                or "gun" in all_flags_lower
            )

            if force_block and not summary:
                summary = (
                    "This request was flagged as prohibited under the applicable safety and policy checks. "
                    "Because it involves restricted or dangerous subject matter, the task cannot proceed."
                )

            return {
                **state,
                "policy_summary": summary,
                "policy_blocked": force_block,
                "policy_flags":   all_flags,
            }
        except Exception:
            pass  # fall through to keyword fallback

    # ── Keyword fallback (used when Azure LLM is unavailable) ───────────────
    input_lower  = user_input.lower()
    policy_lower = policy_text.lower()

    # Step 1: find any prohibited keyword that appears in the user's input
    triggered_kw = [kw for kw in _SENSITIVE_TOPIC_KEYWORDS if kw in input_lower]

    # Step 2: check whether the policy document contains any restriction signal
    # (e.g. "do not talk about", "prohibited", "not permitted", etc.)
    has_restriction = any(sig in policy_lower for sig in _RESTRICTION_SIGNALS)

    # Step 3: BLOCK if the user mentioned a prohibited keyword AND the policy
    # document contains restriction language (we don't require the exact keyword
    # to appear in the policy text — the policy may say "do not talk about medical
    # matters" while the user says "leg pain can you suggest medical advice").







    # if triggered_kw and has_restriction:
    #     matched = triggered_kw[0]
    #     summary = (
    #         f"Your request appears to relate to '{matched}', which is covered by your "
    #         f"company's policy documents. The retrieved policies indicate that activities or content "
    #         f"related to this topic are restricted or prohibited under company guidelines. "
    #         f"This task cannot be completed as described because it conflicts with the applicable "
    #         f"policy. Please review your company's policy documents for guidance on what is "
    #         f"permitted, or consult your compliance team before proceeding."
    #     )
    #     return {
    #         **state,
    #         "policy_summary": summary,
    #         "policy_blocked": True,
    #         "policy_flags":   state.get("policy_flags", []) + [f"Prohibited topic detected: '{matched}'"],
    #     }
    # elif policies:
    #     # Policies exist and were retrieved but no hard block triggered
    #     summary = (
    #         "The following company policies are relevant to your request and have been applied "
    #         "to guide the response. These policies set out the standards and constraints that "
    #         "apply to this type of task in your organisation. The request appears to be permitted "
    #         "under these policies, but please review the compliance notes in the generated output "
    #         "and seek human review for any areas flagged as requiring it."
    #     )
    #     return {
    #         **state,
    #         "policy_summary": summary,
    #         "policy_blocked": False,
    #     }
    # else:
    #     return {
    #         **state,
    #         "policy_summary": (
    #             "No specific company policies were found that apply directly to this request. "
    #             "General enterprise best practices have been applied. You may proceed with this task."
    #         ),
    #         "policy_blocked": False,
    #     }











# ══════════════════════════════════════════════════════════════════════════════
def _build_system_prompt(role: str, task_type: str, sensitivity: str,
                          industry: str, intent: str, tool_name: str,
                          tool_info: dict) -> str:
    """
    Builds the SYSTEM prompt that tells the LLM WHO it is and HOW to behave.
    The role from the user (matched against Excel) drives the persona and tone.
    """
    effective_role = role.strip() if role and role != "general" else "expert enterprise professional"

    # Per-role behavioural instructions — derived from what each role needs
    role_behaviour = {
        "Executive / Director": (
            "Present insights at a strategic level. Be concise and outcome-focused. "
            "Lead with key decisions, business impact, and ROI. Avoid deep technical detail. "
            "Use executive-friendly language: bullet summaries, clear headers, no jargon."
        ),
        "Business Analyst": (
            "Provide structured, data-backed analysis. Use tables, bullet points, and numbered lists. "
            "Highlight assumptions, gaps, and recommendations clearly. "
            "Balance business context with analytical rigour."
        ),
        "Developer / Technical": (
            "Be technically precise and detailed. Include code snippets, commands, configurations, "
            "or architecture diagrams where relevant. Assume strong technical literacy. "
            "Use correct technical terminology. Format code in proper blocks."
        ),
        "Consultant / Manager": (
            "Balance technical accuracy with business clarity. Highlight risks, timelines, "
            "dependencies, and stakeholder considerations. Structure output for client-ready delivery. "
            "Use professional consulting language."
        ),
        "Finance / Accounting": (
            "Prioritise numerical accuracy and compliance. Use structured tabular formats where possible. "
            "Flag any figures that require validation. Align with accounting standards. "
            "Avoid ambiguous language around financial figures."
        ),
        "HR / People Ops": (
            "Use empathetic, people-first language. Ensure tone is inclusive and policy-compliant. "
            "Avoid jargon. Structure content to be accessible to all employee levels. "
            "Highlight any legal or HR compliance considerations."
        ),
        "Sales / BD": (
            "Emphasise value propositions, client benefits, and competitive differentiators. "
            "Keep tone persuasive, confident, and professional. "
            "Focus on outcomes, ROI, and solving client pain points. "
            "Structure for use in client-facing communications."
        ),
        "Marketing / Comms": (
            "Prioritise clarity, brand voice, and audience engagement. "
            "Structure content for readability and impact. "
            "Use compelling language appropriate for the target audience. "
            "Adapt tone based on channel (internal vs. external, formal vs. casual)."
        ),
    }.get(effective_role,
          "Provide a clear, professional, well-structured response appropriate for the user's context.")

    # Sensitivity-based content rules
    sensitivity_rules = {
        "client": (
            "⚠️ CONFIDENTIAL / CLIENT DATA RULES:\n"
            "- Replace all real names with [CLIENT NAME], [CONTACT NAME]\n"
            "- Replace specific figures with [VALUE] or [AMOUNT]\n"
            "- Do NOT reproduce any PII, account numbers, or contract specifics\n"
            "- Flag any section that requires human review before sharing externally"
        ),
        "internal": (
            "🔒 INTERNAL DATA RULES:\n"
            "- Use general terms for sensitive internal metrics\n"
            "- Do not disclose specific internal figures that could be sensitive if leaked\n"
            "- Mark any section intended for internal use only"
        ),
        "general": (
            "✅ GENERAL DATA: Standard professional best practices apply. "
            "No special masking required."
        ),
    }.get(sensitivity, "Standard data handling applies.")

    # Tool-specific usage hint
    tool_hint = (
        f"The output will be used in {tool_name} ({tool_info.get('category', 'AI Tool')}). "
        f"Structure and format the response to be directly usable in that tool."
    )

    return f"""You are a {effective_role} operating in the {industry} industry.

BEHAVIOURAL INSTRUCTIONS FOR THIS ROLE:
{role_behaviour}

TOOL CONTEXT:
{tool_hint}

DATA HANDLING RULES:
{sensitivity_rules}

GENERAL RULES:
- Return ONLY the final response — no meta-commentary, no preamble, no "here is your response"
- Always define clear sections with headers
- Always include a Compliance / Risk note at the end
- Tailor depth and tone exactly to the role described above
- Flag any area that requires human expert review"""


def _build_user_prompt(state: OrchestratorState, tool_info: dict, policy_block: str,
                        prompt_version: str) -> str:
    """
    Builds the CORLO prompt using a clean 5-section structure:
      1. ROLE       — rich persona narrative
      2. CONTEXT    — full situational context in flowing sentences
      3. OBJECTIVE  — precise task goal derived from all user inputs
      4. LIMITATIONS— sensitivity + policy + tool + industry constraints
      5. OUTPUT     — format instructions calibrated to role + task type
    """
    role        = state.get("role",             "general").strip()
    task_type   = state.get("task_type",        "general").strip()
    sensitivity = state.get("data_sensitivity", "general").strip()
    industry    = state["industry"]
    intent      = state["intent"]
    tool_name   = state["recommended_tool"]
    user_input  = state["user_input"]
    effective_role = role if role and role != "general" else "Enterprise Professional"

    # ═══════════════════════════════════════════════════════════
    # SECTION 1 — ROLE
    # ═══════════════════════════════════════════════════════════
    role_narratives = {
        "Executive / Director": (
            f"You are a seasoned Executive and Director with deep experience leading organisations "
            f"in the {industry} sector. Your thinking is always strategic — you cut through detail "
            f"to surface what truly matters for business outcomes, board decisions, and long-term value. "
            f"You communicate with authority and precision, avoiding jargon, and you always lead with "
            f"the key insight before elaborating. Stakeholders trust your judgment because you balance "
            f"ambition with pragmatism and back every recommendation with clear rationale."
        ),
        "Business Analyst": (
            f"You are an experienced Business Analyst operating in the {industry} industry. "
            f"Your strength lies in translating complex business problems into structured, evidence-based "
            f"analyses. You ask the right clarifying questions, surface hidden assumptions, identify gaps, "
            f"and present findings in a way that stakeholders at all levels can act on. "
            f"Your work is methodical and traceable — you document your reasoning, highlight risks, "
            f"and always ground recommendations in data."
        ),
        "Developer / Technical": (
            f"You are a Senior Developer and Technical Engineer with hands-on expertise in the {industry} "
            f"domain. You write clean, maintainable, production-grade code and take architecture decisions "
            f"seriously. You explain technical concepts precisely using correct terminology, provide working "
            f"examples, and always consider edge cases, security implications, and scalability. "
            f"You do not over-engineer, but you build things right the first time."
        ),
        "Consultant / Manager": (
            f"You are a Senior Consultant and Project Manager who has delivered complex engagements "
            f"across the {industry} sector. You are skilled at navigating stakeholder dynamics, managing "
            f"scope, and translating client needs into structured, deliverable outcomes. Your outputs are "
            f"always client-ready — polished, well-structured, and immediately actionable. "
            f"You balance strategic thinking with delivery pragmatism and flag risks before they become problems."
        ),
        "Finance / Accounting": (
            f"You are a Finance and Accounting professional with deep expertise in the {industry} industry. "
            f"You prioritise numerical accuracy above all else, and your outputs are always audit-ready. "
            f"You are familiar with applicable accounting standards, regulatory requirements, and financial "
            f"reporting obligations. You never leave figures ambiguous — you label everything clearly, "
            f"flag any data that requires validation, and always note the compliance implications of financial decisions."
        ),
        "HR / People Ops": (
            f"You are an HR and People Operations specialist with experience in the {industry} sector. "
            f"You combine deep knowledge of employment law, HR policy, and people development with genuine "
            f"empathy for employees at every level. Your communications are inclusive, plain-spoken, and "
            f"always legally sound. You balance the organisation's operational needs with the wellbeing "
            f"and rights of its people, and you flag any legal or compliance considerations proactively."
        ),
        "Sales / BD": (
            f"You are a Sales and Business Development professional with a proven track record in the "
            f"{industry} sector. You understand what motivates buyers, how to articulate value propositions "
            f"compellingly, and how to move conversations from interest to commitment. "
            f"Your outputs are persuasive without being pushy, client-focused rather than product-focused, "
            f"and always oriented toward measurable commercial outcomes. You close with a clear call to action."
        ),
        "Marketing / Comms": (
            f"You are a Marketing and Communications specialist with deep experience in the {industry} "
            f"sector. You understand audiences, brand voice, and the power of clear messaging. "
            f"You craft content that engages, informs, and motivates action — adapting tone and style "
            f"seamlessly for different channels and audiences. Your work is always on-brand, "
            f"structurally tight, and designed to land with impact from the very first line."
        ),
    }
    role_narrative = role_narratives.get(effective_role,
        f"You are a seasoned {effective_role} with extensive experience in the {industry} sector. "
        f"You bring professional rigour, contextual awareness, and clear communication to every task, "
        f"adapting your approach to the specific demands of the situation."
    )

    # ═══════════════════════════════════════════════════════════
    # SECTION 2 — CONTEXT (flowing sentences, no table)
    # ═══════════════════════════════════════════════════════════
    sensitivity_ctx = {
        "client":   "The data involved in this task is classified as client-confidential, meaning it contains or references information belonging to an external client.",
        "internal": "The data involved is internal to the organisation and must not be shared or referenced outside authorised internal channels.",
        "general":  "The data involved is general or publicly available, with no special confidentiality restrictions.",
    }.get(sensitivity, "Standard data handling applies.")

    task_type_ctx = {
        "research":      "The task type is research and analysis, requiring a thorough, evidence-based approach that surfaces key findings and actionable insights.",
        "writing":       "The task type is writing and documentation, requiring polished, well-structured content ready for its intended audience.",
        "strategy":      "The task type is strategic planning, requiring a framework that maps options, trade-offs, and a clearly reasoned recommended path forward.",
        "data":          "The task type is data analysis, requiring clear interpretation of data, identification of trends, and insights presented in a digestible format.",
        "code":          "The task type is coding and development, requiring clean, well-commented, production-ready code with clear usage guidance.",
        "creative":      "The task type is creative content generation, requiring original, engaging output tailored precisely to the intended audience and purpose.",
        "communication": "The task type is communication drafting, requiring clear, professional messaging ready to send with minimal further editing.",
        "learning":      "The task type is learning and knowledge transfer, requiring explanations that are clear, progressive, and supported by relevant examples.",
        "automate":      "The task type is process automation, requiring detailed, implementable scripts or workflow designs with step-by-step guidance.",
        "decision":      "The task type is decision support, requiring a structured framework with clearly defined options, evaluation criteria, and a recommendation.",
    }.get(task_type, "The task requires a high-quality professional response that directly addresses the stated need.")

    tool_ctx = (
        f"The recommended tool for this task is {tool_name}"
        + (f", which falls under the {tool_info.get('category', 'AI Tool')} category" if tool_info.get('category') else "")
        + ". The response should be structured so it can be used directly within that tool environment."
    )

    context_block = (
        f"This request comes from a {effective_role} working within the {industry} industry. "
        f"{sensitivity_ctx} {task_type_ctx} The intent behind this request has been identified as "
        f"'{intent}', which shapes the depth, tone, and structure of the expected output. "
        f"{tool_ctx} Prompt version {prompt_version} is in use."
    )

    # ═══════════════════════════════════════════════════════════
    # SECTION 3 — OBJECTIVE
    # ═══════════════════════════════════════════════════════════
    objective_openers = {
        "Executive / Director": "Produce a concise, board-ready",
        "Business Analyst":     "Deliver a structured, evidence-based",
        "Developer / Technical":"Generate clean, production-ready",
        "Consultant / Manager": "Create a client-ready, professionally structured",
        "Finance / Accounting": "Produce an accurate, compliance-aware",
        "HR / People Ops":      "Develop a clear, policy-aligned",
        "Sales / BD":           "Craft a compelling, outcome-focused",
        "Marketing / Comms":    "Produce engaging, on-brand",
    }
    opener = objective_openers.get(effective_role, "Produce a professional, high-quality")

    intent_descriptors = {
        "proposal":      "proposal document",
        "report":        "report",
        "email":         "email or communication",
        "code":          "code solution",
        "content":       "content piece",
        "data analysis": "data analysis",
        "legal":         "legal document or compliance review",
        "it support":    "IT support response or resolution plan",
        "hr":            "HR document or people-ops response",
        "general":       "response",
    }
    intent_desc = intent_descriptors.get(intent, "output")
    industry_qualifier = (
        f"appropriate for the {industry} industry" if industry and industry != "general"
        else "suitable for a professional enterprise context"
    )

    objective_block = (
        f"{opener} {intent_desc} that directly addresses the following user request, "
        f"{industry_qualifier}. The output must be immediately usable by a {effective_role} "
        f"without requiring significant rework. It should reflect the appropriate depth, tone, "
        f"and format for a {task_type} task — not a generic response, but one precisely calibrated "
        f"to this role, this industry, and this specific request.\n\n"
        f"USER REQUEST:\n{user_input}"
    )

    # ═══════════════════════════════════════════════════════════
    # SECTION 4 — LIMITATIONS
    # ═══════════════════════════════════════════════════════════
    sensitivity_limits = {
        "client": (
            "Data Sensitivity — Client / Confidential: All real client names must be replaced with "
            "[CLIENT NAME]. Specific financial figures must appear as [VALUE] or [AMOUNT]. "
            "Do not reproduce PII, account numbers, contract terms, or any information that could "
            "identify a client if seen outside a controlled environment. Every section containing "
            "client-sensitive content must be marked for human review before external sharing."
        ),
        "internal": (
            "Data Sensitivity — Internal / Company: Refer to sensitive internal metrics in general "
            "terms rather than quoting specific figures. Do not include information that would be "
            "problematic if seen outside the organisation. Mark any internal-only section with "
            "[INTERNAL USE ONLY]."
        ),
        "general": (
            "Data Sensitivity — General / Public: Standard professional best practices apply. "
            "No special data masking is required, but avoid including unnecessary personal details "
            "and follow general data hygiene principles."
        ),
    }.get(sensitivity, "Apply standard data handling practices appropriate to the context.")

    has_policies = bool(
        policy_block and policy_block.strip()
        and "No specific policies" not in policy_block
        and "Policy retrieval unavailable" not in policy_block
    )

    if has_policies:
        policy_limits = (
            f"Policy Compliance: The following company policies have been retrieved and apply directly "
            f"to this task. Do not produce output that conflicts with these policies. "
            f"If the user request touches on a restricted area, note the restriction clearly and "
            f"explain what is and is not permissible rather than ignoring it.\n"
            f"{policy_block}"
        )
    else:
        policy_limits = (
            "Policy Compliance: No specific company policies were retrieved for this task. "
            "Apply general enterprise best practices and standard professional conduct guidelines. "
            "Follow applicable industry regulations and flag any area where specialist human review "
            "would be advisable."
        )

    tool_limits = (
        f"Tool Constraints: The output will be used in {tool_name}. "
        f"Format and structure the response so it works well within that environment — "
        f"avoid formatting elements that would not render correctly there, "
        f"and keep the output self-contained and directly usable."
    )

    industry_limits = (
        f"Industry Standards: The response must adhere to norms applicable to the {industry} industry. "
        f"Flag any element that may require validation by a domain expert, legal counsel, or "
        f"compliance officer before use."
    )

    limitations_block = (
        f"{sensitivity_limits}\n\n"
        f"{policy_limits}\n\n"
        f"{tool_limits}\n\n"
        f"{industry_limits}"
    )

    # ═══════════════════════════════════════════════════════════
    # SECTION 5 — OUTPUT
    # ═══════════════════════════════════════════════════════════
    output_formats = {
        "Executive / Director": (
            "Lead with a one-paragraph executive summary stating the key finding or recommendation. "
            "Follow with clearly labelled sections using concise headers. Use bullet points for lists "
            "of more than three items. Keep paragraphs short — no more than 3-4 sentences each. "
            "End with prioritised recommended next steps. Do not include implementation-level detail unless asked."
        ),
        "Business Analyst": (
            "Structure with numbered sections and clear headers. Use tables where data comparison is needed. "
            "Lead each section with the key finding, followed by supporting evidence or reasoning. "
            "Include an assumptions and risks section. End with specific, numbered recommendations."
        ),
        "Developer / Technical": (
            "Use technical headers to separate logical sections. Place all code in properly formatted "
            "code blocks with language labels. Explain what the code does and why design decisions were made. "
            "Include usage examples, edge case notes, and any dependencies or prerequisites."
        ),
        "Consultant / Manager": (
            "Open with a brief executive summary suitable for a client or senior stakeholder. "
            "Use clearly labelled sections with professional headers. Include an action plan with owners "
            "and timelines where applicable. Note risks, dependencies, and assumptions explicitly. "
            "The full response should be client-presentable without further editing."
        ),
        "Finance / Accounting": (
            "Use structured sections with clear headers. Present numerical data in tables wherever possible. "
            "Label all figures clearly and note the basis or assumptions behind any calculations. "
            "Flag figures requiring external validation. Note applicable standards or regulatory requirements at the end."
        ),
        "HR / People Ops": (
            "Use plain, accessible language — avoid jargon. Structure as a guidance document with clear sections. "
            "Where legal or compliance obligations apply, state them explicitly and recommend specialist review. "
            "End with clear, actionable guidance for the reader."
        ),
        "Sales / BD": (
            "Lead with the strongest value proposition. Use bullet points to list client benefits clearly. "
            "Keep paragraphs short and punchy. Address likely objections proactively. "
            "Close with a single, clear call to action. Tone: confident, client-centric, outcome-focused."
        ),
        "Marketing / Comms": (
            "Open with a strong hook that immediately engages the reader. Use short paragraphs and subheadings. "
            "Maintain a consistent tone of voice throughout. End with a clear message or call to action. "
            "The content should be ready to publish or send with minimal further editing."
        ),
    }
    task_output_supplement = {
        "code":          "Wrap all code in labelled code blocks. Include a brief description before each block.",
        "data":          "Describe suggested charts or visualisations clearly. Present tabular data in markdown table format.",
        "writing":       "The writing should be publication-ready with varied sentence structure and no repetition.",
        "strategy":      "Present strategic options as distinct alternatives with pros, cons, and a clearly argued recommendation.",
        "research":      "Cite the basis for key claims. Highlight areas requiring further research.",
        "communication": "Write so it can be copied and sent directly. Include subject line if applicable.",
        "decision":      "Define the decision, list options, evaluate each against criteria, then recommend.",
        "automate":      "Number automation steps clearly. Include configuration values, prerequisites, and error-handling notes.",
        "creative":      "Ensure clear audience, purpose, and consistent voice. Offer one variation if the brief allows.",
        "learning":      "Progress from foundational to advanced material. Use concrete examples and analogies.",
    }.get(task_type, "")

    role_output = output_formats.get(effective_role,
        "Use clearly labelled sections with professional headers. "
        "Keep the response well-structured, accurate, and immediately usable. "
        "End with concrete next steps or recommendations."
    )
    output_block = role_output + (
        f"\n\nAdditional format note for {task_type} tasks: {task_output_supplement}"
        if task_output_supplement else ""
    )

    return (
        "## 1. ROLE\n\n"
        + role_narrative + "\n\n---\n\n"
        "## 2. CONTEXT\n\n"
        + context_block + "\n\n---\n\n"
        "## 3. OBJECTIVE\n\n"
        + objective_block + "\n\n---\n\n"
        "## 4. LIMITATIONS\n\n"
        + limitations_block + "\n\n---\n\n"
        "## 5. OUTPUT\n\n"
        + output_block + "\n\n---\n\n"
        "Now produce the response."
    )



def build_corlo_prompt(state: OrchestratorState) -> OrchestratorState:
    """
    Node 4 — builds the CORLO prompt.
    Always uses the dynamic role-aware builder.
    DB templates are only used if they explicitly contain {role} placeholder;
    otherwise the dynamic builder guarantees role is always fully injected.
    """
    conn = get_db()
    row  = conn.execute(
        "SELECT version, template FROM prompt_versions ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    conn.close()

    prompt_version = row["version"] if row else "1.0"
    policy_summary = state.get("policy_summary", "")
    if policy_summary and "No company policy documents" not in policy_summary:
        policy_block = policy_summary
    else:
        policy_block = ""
    tool_info      = AI_TOOLS_REGISTRY.get(state["recommended_tool"], {})

    # Only use the DB template if it actually references {role} — meaning it was
    # written to be role-aware. Generic old templates fall through to dynamic builder.
    if row and row["template"] and "{role}" in row["template"]:
        try:
            corlo_prompt = row["template"].format(
                industry=state["industry"],
                intent=state["intent"],
                user_input=state["user_input"],
                tool=state["recommended_tool"],
                tool_category=tool_info.get("category", "AI Tool"),
                policy_block=policy_block,
                role=state.get("role", "general"),
                task_type=state.get("task_type", "general"),
                data_sensitivity=state.get("data_sensitivity", "general"),
            )
        except Exception:
            corlo_prompt = _build_user_prompt(state, tool_info, policy_block, prompt_version)
    else:
        # Always use the dynamic builder — this guarantees role persona is injected
        corlo_prompt = _build_user_prompt(state, tool_info, policy_block, prompt_version)

    return {**state, "corlo_prompt": corlo_prompt, "prompt_version": prompt_version}


def _default_corlo(state: OrchestratorState, tool_info: dict, policy_block: str) -> str:
    """Legacy wrapper — kept so nothing breaks if called directly."""
    return _build_user_prompt(state, tool_info, policy_block, "1.0")


# ══════════════════════════════════════════════════════════════════════════════
# NODE 5 — LLM EXECUTION (Azure OpenAI)
# ══════════════════════════════════════════════════════════════════════════════
def execute_llm(state: OrchestratorState) -> OrchestratorState:
    """
    Node 5 — calls the LLM with a two-prompt structure:
      SYSTEM prompt  → who the AI is + behavioural rules (role, sensitivity, tool)
      USER   prompt  → the CORLO prompt (task + context + reasoning scaffold)
    Both are fully driven by role, task_type, sensitivity, and the Excel registry.
    """
    role        = state.get("role",             "general")
    task_type   = state.get("task_type",        "general")
    sensitivity = state.get("data_sensitivity", "general")
    tool_info   = AI_TOOLS_REGISTRY.get(state["recommended_tool"], {})

    system_msg = _build_system_prompt(
        role       = role,
        task_type  = task_type,
        sensitivity= sensitivity,
        industry   = state["industry"],
        intent     = state["intent"],
        tool_name  = state["recommended_tool"],
        tool_info  = tool_info,
    )

    if HAS_AZURE and _azure_client:
        try:
            output, tokens = _azure_chat(
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user",   "content": state["corlo_prompt"]},
                ],
                max_tokens=1024,
                temperature=0.4,
            )
            if not tokens:
                tokens = len(state["corlo_prompt"].split())
        except Exception as e:
            output = _mock_response(state, error=str(e))
            tokens = len(state["corlo_prompt"].split())
    else:
        output = _mock_response(state)
        tokens = len(state["corlo_prompt"].split())

    return {**state, "llm_output": output, "token_estimate": tokens}


def _mock_response(state: OrchestratorState, error: str = "") -> str:
    err       = f"\n⚠️ Error: {error}" if error else ""
    tool_info = AI_TOOLS_REGISTRY.get(state["recommended_tool"], {})
    role        = state.get("role", "general")
    task_type   = state.get("task_type", "general")
    sensitivity = state.get("data_sensitivity", "general")
    return f"""## Executive Summary
Demo response for **{state['intent']}** in **{state['industry']}**.
Recommended tool: **{state['recommended_tool']}** ({tool_info.get('category', '')}).
Set AZURE_OPENAI_* environment variables for live output.{err}

## Main Content
Request: "{state['user_input']}"
- Intent: {state['intent'].title()} | Industry: {state['industry'].title()}
- Role: {role.title()} | Task Type: {task_type.title()} | Sensitivity: {sensitivity.title()}
- Tool: {state['recommended_tool']} | Confidence: {state['tool_confidence']}
- Policies applied: {len(state['policies'])}

### Why {state['recommended_tool']}?
{state['tool_reason']}

## Key Recommendations
1. Open {state['recommended_tool']} using the link provided
2. Use the generated CORLO prompt above as your input
3. Review compliance notes before using the output
4. Archive output in your document management system

## Compliance Notes
{'⚠️ Flags: ' + ' | '.join(state['policy_flags']) if state['policy_flags'] else '✅ No policy violations'}
✅ All retrieved policies applied to this prompt
*[Demo Mode — configure AZURE_OPENAI_* env vars to enable live responses]*"""


# ══════════════════════════════════════════════════════════════════════════════
# LANGGRAPH PIPELINE
# ══════════════════════════════════════════════════════════════════════════════
def _skip_if_blocked(state: OrchestratorState) -> str:
    """
    Conditional router after policy compliance check.
    If the task is blocked, jump straight to END — skip prompt build and LLM call.
    """
    if state.get("policy_blocked", False):
        return "blocked"
    return "allowed"


def _noop_blocked(state: OrchestratorState) -> OrchestratorState:
    """
    Terminal node for blocked tasks.
    Sets corlo_prompt and llm_output to empty/placeholder so nothing is generated.
    """
    return {
        **state,
        "corlo_prompt": "",
        "llm_output":   "",
        "token_estimate": 0,
    }


graph = StateGraph(OrchestratorState)
graph.add_node("classify_intent",        classify_intent)
graph.add_node("recommend_tool",         recommend_tool)
graph.add_node("retrieve_policies",      retrieve_policies)
graph.add_node("check_policy_compliance",check_policy_compliance)
graph.add_node("blocked_end",            _noop_blocked)
graph.add_node("build_corlo_prompt",     build_corlo_prompt)
graph.add_node("execute_llm",            execute_llm)

graph.set_entry_point("classify_intent")
graph.add_edge("classify_intent",  "recommend_tool")
graph.add_edge("recommend_tool",   "retrieve_policies")
graph.add_edge("retrieve_policies","check_policy_compliance")

# ── Short-circuit: blocked tasks go directly to END, skipping LLM ──
graph.add_conditional_edges(
    "check_policy_compliance",
    _skip_if_blocked,
    {"blocked": "blocked_end", "allowed": "build_corlo_prompt"},
)
graph.add_edge("blocked_end",        END)
graph.add_edge("build_corlo_prompt", "execute_llm")
graph.add_edge("execute_llm",        END)

orchestrator = graph.compile()