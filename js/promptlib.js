/* ══════════════════════════════════════════════════════
   promptlibrary.js — Prompt Library data, rendering,
                      search, favorites, sub-tab switching
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════
   DATA — Role-Specific Prompts
══════════════════════════════════════ */
const PL_ROLE_PROMPTS = {
  consultant: [
    { title: "Strategic Analysis", body: "Analyze the strategic implications of [situation/decision]. Consider market trends, competitive positioning, and potential risks. Provide actionable recommendations with supporting rationale." },
    { title: "Client Meeting Prep", body: "Help me prepare for a client meeting about [topic]. Generate key discussion points, potential questions they might ask, and strategic talking points that demonstrate value." },
    { title: "Process Optimization", body: "Review this workflow: [describe process]. Identify inefficiencies, bottlenecks, and opportunities for improvement. Suggest concrete optimization steps." },
    { title: "Stakeholder Communication", body: "Draft a communication for [stakeholder group] about [topic]. Tone should be [professional/collaborative/urgent]. Key message: [main point]." },
    { title: "Business Case Development", body: "Help me build a business case for [initiative]. Include problem statement, proposed solution, costs/benefits, risks, and expected ROI." },
    { title: "Change Management Plan", body: "Create a change management approach for [change initiative]. Include stakeholder analysis, communication strategy, and success metrics." }
  ],
  executive: [
    { title: "Executive Summary", body: "Condense this information into an executive summary: [paste content]. Focus on key decisions needed, financial impact, and strategic implications. Limit to 300 words." },
    { title: "Board Presentation", body: "Help me structure a board presentation on [topic]. Include: current state, strategic options, recommendation, and key risks. Keep it high-level and decision-focused." },
    { title: "Leadership Message", body: "Draft a leadership message to [audience] about [change/announcement]. Tone: [inspiring/transparent/reassuring]. Address concerns while building confidence." },
    { title: "Strategic Options Analysis", body: "Present 3 strategic options for [situation]. For each: description, pros/cons, resource requirements, risks, and expected outcomes." },
    { title: "Competitive Intelligence", body: "Summarize competitive landscape for [market/segment]. Focus on: key competitors, their strategies, market positioning, and strategic implications for us." },
    { title: "Risk Assessment", body: "Conduct risk analysis for [initiative/decision]. Identify top risks, likelihood/impact, mitigation strategies, and contingency plans." }
  ],
  developer: [
    { title: "Code Review", body: "Review this code for [language]: [code snippet]. Check for: bugs, security issues, performance problems, best practices, and maintainability." },
    { title: "Architecture Design", body: "Design system architecture for [application/feature]. Consider: scalability, security, performance, maintainability, and integration with existing systems." },
    { title: "API Documentation", body: "Generate API documentation for [endpoint/service]. Include: description, parameters, response format, error codes, and usage examples." },
    { title: "Debug Assistance", body: "Help debug this issue: [describe problem]. Code: [snippet]. Error: [error message]. Analyze root cause and suggest fixes." },
    { title: "Test Cases", body: "Generate test cases for [feature/function]. Include: unit tests, integration tests, edge cases, and expected outcomes." },
    { title: "Performance Optimization", body: "Optimize this code: [snippet]. Focus on [speed/memory/database queries]. Explain improvements and trade-offs." }
  ],
  analyst: [
    { title: "Data Analysis", body: "Analyze this dataset: [describe data]. Look for patterns, trends, outliers, and insights. Present findings with visualizations recommendations." },
    { title: "Requirements Documentation", body: "Document requirements for [feature/system]. Include: user stories, acceptance criteria, dependencies, and success metrics." },
    { title: "Gap Analysis", body: "Conduct gap analysis between current state [description] and desired state [description]. Identify gaps and recommend bridging actions." },
    { title: "Impact Assessment", body: "Assess business impact of [change/initiative]. Consider: affected processes, stakeholders, systems, timeline, and resource needs." },
    { title: "Process Mapping", body: "Create process map for [business process]. Include: steps, decision points, roles, systems involved, and pain points." },
    { title: "Metrics Dashboard", body: "Design metrics dashboard for [area/initiative]. Recommend KPIs, data sources, visualization types, and update frequency." }
  ],
  sales: [
    { title: "Proposal Writing", body: "Draft proposal section for [solution/service]. Audience: [client type]. Emphasize: value proposition, ROI, differentiation, and risk mitigation." },
    { title: "Competitive Positioning", body: "Position our [product/service] against [competitor]. Highlight our strengths, address their advantages, and articulate unique value." },
    { title: "Discovery Questions", body: "Generate discovery questions for [industry/role] about [topic]. Focus on uncovering pain points, priorities, and decision criteria." },
    { title: "ROI Calculator", body: "Create ROI framework for [solution]. Include: cost components, benefit categories, assumptions, and 3-year projection format." },
    { title: "Objection Handling", body: "Develop responses to common objections about [product/service/price]. Make responses credible, specific, and value-focused." },
    { title: "Account Strategy", body: "Develop account strategy for [client]. Include: relationship map, opportunities, threats, engagement plan, and success criteria." }
  ],
  marketing: [
    { title: "Campaign Brief", body: "Create campaign brief for [product/service launch]. Include: objectives, target audience, key messages, channels, success metrics, and timeline." },
    { title: "Content Ideas", body: "Generate 10 content ideas for [audience] about [topic]. Format: [blog/social/video]. Focus on: education, engagement, and lead generation." },
    { title: "Value Proposition", body: "Craft value proposition for [offering] targeting [audience]. Address: problem solved, unique benefits, and why choose us over alternatives." },
    { title: "Social Media Plan", body: "Develop 2-week social media plan for [campaign/topic]. Include: post types, messaging themes, hashtags, and engagement tactics." },
    { title: "Email Sequence", body: "Design email nurture sequence for [audience/goal]. Include: 5 emails with subject lines, key messages, CTAs, and timing." },
    { title: "Brand Messaging", body: "Develop brand messaging framework. Include: mission, vision, values, positioning statement, and key differentiators." }
  ],
  hr: [
    { title: "Job Description", body: "Write job description for [role]. Include: responsibilities, requirements, qualifications, key competencies, and what makes this role unique." },
    { title: "Interview Questions", body: "Generate behavioral interview questions for [role/competency]. Include: question, what to look for, and follow-up questions." },
    { title: "Performance Review", body: "Structure performance review framework for [role]. Include: evaluation criteria, rating scale, development areas, and goal-setting format." },
    { title: "Training Program", body: "Design training program for [skill/topic]. Include: learning objectives, modules, delivery methods, duration, and success metrics." },
    { title: "Employee Communication", body: "Draft communication about [policy/change] for employees. Tone: [transparent/supportive]. Address: what's changing, why, and impact." },
    { title: "Onboarding Plan", body: "Create 90-day onboarding plan for [role]. Include: week-by-week goals, key relationships, training needs, and success indicators." }
  ],
  finance: [
    { title: "Budget Analysis", body: "Analyze budget variance for [department/project]. Current: [amount], Planned: [amount]. Explain variances and recommend corrective actions." },
    { title: "Financial Model", body: "Build financial model structure for [business case/investment]. Include: assumptions, revenue drivers, cost structure, and sensitivity analysis." },
    { title: "Cost Optimization", body: "Identify cost optimization opportunities in [area]. Analyze: current spend, efficiency benchmarks, reduction opportunities, and impact assessment." },
    { title: "Investment Analysis", body: "Evaluate investment opportunity: [describe]. Analyze: costs, benefits, payback period, NPV, IRR, and risk factors." },
    { title: "Cash Flow Forecast", body: "Create 12-month cash flow forecast for [entity]. Include: operating activities, investing activities, financing activities, and key assumptions." },
    { title: "Financial Report", body: "Generate financial commentary for [period] results. Address: performance vs. plan, key variances, trends, and outlook." }
  ]
};


/* ══════════════════════════════════════
   DATA — Thinking Partner Prompts
══════════════════════════════════════ */
const PL_THINKING_PROMPTS = [
  { title: "Challenge My Thinking", body: "Here's what I'm planning: [insert your idea, plan, or strategy]\n\nAct as a critical thinker. Question my assumptions, logic, or blind spots — but don't rewrite anything. I want to stress test my own thinking, not get new ideas." },
  { title: "Reframe Through Different Lens", body: "Here's the core idea I'm working with: [insert your idea]\n\nHelp me reframe it through a different lens — like a new audience POV, emotional trigger, or brand positioning angle." },
  { title: "Translate My Gut Feeling", body: "Something about this feels off, but I can't explain why: [describe the situation, message, or tactic]\n\nHelp me put words to the tension I'm sensing. What might be misaligned or unclear?" },
  { title: "Structure My Messy Thinking", body: "Here's a braindump of what I'm thinking: [insert notes, fragments, half-formed ideas]\n\nOrganize this into a clear structure or outline — but don't change the voice or inject new ideas." },
  { title: "Help Me Face the Decision", body: "Here's the context I'm working with: [insert project/situation]\n\nWhat decision am I avoiding or overcomplicating? Reflect back where I'm hesitating or dragging things out." },
  { title: "Surface the Deeper Question", body: "Here's the situation I'm thinking through: [insert idea or challenge]\n\nHelp me surface the real strategic question underneath this. What should I actually be asking myself?" },
  { title: "Spot Execution Risks", body: "This is the strategy I'm planning to roll out: [insert plan or outline]\n\nWalk me through how this could go wrong in real-world execution. What am I missing?" },
  { title: "Reverse-Engineer My Gut Instinct", body: "Here's what I'm thinking, and it feels right to me: [insert your idea or insight]\n\nCan you help me unpack why this might be a smart move — or challenge whether my instinct is off?" }
];


/* ══════════════════════════════════════
   DATA — Research Prompts
══════════════════════════════════════ */
const PL_RESEARCH_PROMPTS = [
  { title: "Market Research", body: "Conduct comprehensive competitive analysis of the top 5 companies in [your industry]. Include pricing models, unique features, customer reviews, and distinctive selling points." },
  { title: "Trend Analysis", body: "Outline the leading [industry] trends influencing [year]. Provide examples, adoption rates, and how these trends might impact [target audience or business type]." },
  { title: "Competitor Benchmarking", body: "Evaluate [Tool/Company A] vs [Tool/Company B] vs [Tool/Company C] across pricing, features, integrations, customer reviews, and long-term scalability." },
  { title: "Customer Insights", body: "Review customer support tickets and forum discussions to identify the most frequent complaints, feature requests, and positive feedback regarding [product/service]." },
  { title: "Case Studies Analysis", body: "Share 3 real-world case studies of how companies successfully used [technology/strategy] to accomplish [specific goal]. Include measurable results." },
  { title: "Industry Reports Summary", body: "Extract key takeaways from [report name or source] on [topic]. Emphasize statistics, market data, future projections, and actionable recommendations for [audience]." },
  { title: "Expert Opinions Synthesis", body: "Capture key viewpoints of [expert name] on [topic]. Compare them with [other expert name] to highlight similarities, differences, and unique insights." },
  { title: "Technology Landscape", body: "Map the technology landscape for [domain]. Identify key players, emerging solutions, adoption barriers, and integration opportunities." }
];


/* ══════════════════════════════════════
   DATA — Quick Action Prompts
══════════════════════════════════════ */
const PL_QUICK_PROMPTS = [
  { icon: "✉️", title: "Write an Email",    body: "Write a professional email to [recipient] about [topic]. Tone: [formal/friendly]. Include a clear subject line, main message, and a specific call to action." },
  { icon: "📝", title: "Summarise a Doc",   body: "Summarize the following document in 5 bullet points. Focus on key facts, decisions, and action items: [paste document text here]." },
  { icon: "💡", title: "Brainstorm Ideas",  body: "Generate 10 creative ideas for [topic or challenge]. Focus on [goal]. Consider different angles: [cost/time/impact/innovation]." },
  { icon: "🔄", title: "Improve My Text",   body: "Improve the clarity and tone of this text: [paste your draft]. Keep the meaning intact but make it more [concise/professional/engaging]." },
  { icon: "📋", title: "Create a Plan",     body: "Create a step-by-step action plan for [goal]. Include: timeline, key milestones, dependencies, risks, and success metrics." },
  { icon: "🔍", title: "Analyse This",      body: "Analyse this [data/text/situation]: [paste content]. Identify patterns, key insights, and recommend next steps." },
  { icon: "🌐", title: "Translate & Adapt", body: "Translate this text to [language] and adapt it culturally for [target audience]: [paste text]." },
  { icon: "📊", title: "Make a Table",      body: "Convert the following information into a clear, structured table with appropriate columns and rows: [paste content]." },
  { icon: "❓", title: "Ask Better Qs",     body: "Generate 10 insightful questions to ask [person/group] about [topic]. Mix strategic, tactical, and exploratory questions." },
  { icon: "⚖️", title: "Pros & Cons",       body: "List the pros and cons of [decision or option]. Consider [short/long-term impact], [cost/benefit], and [risk/reward]." }
];


/* ══════════════════════════════════════
   FAVORITES — localStorage persistence
══════════════════════════════════════ */
let plFavorites = JSON.parse(localStorage.getItem('pl_favorites') || '[]');

function plSaveFavorites() {
  localStorage.setItem('pl_favorites', JSON.stringify(plFavorites));
}


/* ══════════════════════════════════════
   COPY HELPER
══════════════════════════════════════ */
function plCopyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('pl-copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('pl-copied'); }, 1800);
  });
}


/* ══════════════════════════════════════
   BUILD CARD HTML
══════════════════════════════════════ */

// Safe HTML escape — CORLO prompts contain angle brackets, quotes etc.
function plEscapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plBuildCard(p) {
  const isFav   = plFavorites.some(f => f.title === p.title);
  const preview = p.body.length > 120 ? p.body.substring(0, 120) + '…' : p.body;
  return `
    <div class="pl-card">
      <div class="pl-card-title">${plEscapeHtml(p.title)}</div>
      ${p.fromHome ? '' : `<div class="pl-card-body">${plEscapeHtml(preview)}</div>`}
      <div class="pl-card-actions">
        <button class="pl-btn-generate" data-body="${encodeURIComponent(p.body)}">&#9889; Generate</button>
        <button class="pl-btn-fav ${isFav ? 'pl-fav-saved' : ''}"
          data-title="${encodeURIComponent(p.title)}"
          data-body="${encodeURIComponent(p.body)}">
          ${isFav ? '&#9733; Saved' : '&#9734; Save'}
        </button>
      </div>
    </div>`;
}


/* ══════════════════════════════════════
   BIND CARD BUTTON EVENTS
══════════════════════════════════════ */
function plBindCardActions(grid) {
  

  grid.querySelectorAll('.pl-btn-generate').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const body = decodeURIComponent(btn.dataset.body);
      // ✅ move to Home tab FIRST
    if (typeof navigateTo === 'function') navigateTo('home');

      // Switch to Home page
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const homeNav  = document.querySelector('.nav-item[data-page="home"]');
      const homePage = document.getElementById('page-home');
      if (homeNav)  homeNav.classList.add('active');
      if (homePage) homePage.classList.add('active');

      // Paste task into textarea
      const textarea  = document.getElementById('userInput');
      const charCount = document.getElementById('charCount');
      if (textarea) {
        textarea.value        = body;
        charCount.textContent = body.length;
        textarea.dispatchEvent(new Event('input'));
      }

      // Scroll to top then click Generate
      window.scrollTo(0, 0);
      setTimeout(() => {
        plOpenScenarioGenModal({ body });
      }, 100);
    });
  });

  grid.querySelectorAll('.pl-btn-fav').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const title = decodeURIComponent(btn.dataset.title);
      const body  = decodeURIComponent(btn.dataset.body);
      const idx   = plFavorites.findIndex(f => f.title === title);
      if (idx >= 0) {
        plFavorites.splice(idx, 1);
        btn.innerHTML = '&#9734; Save';
        btn.classList.remove('pl-fav-saved');
      } else {
        plFavorites.push({ title, body });
        btn.innerHTML = '&#9733; Saved';
        btn.classList.add('pl-fav-saved');
      }
      plSaveFavorites();
    });
  });
}


/* ══════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════ */
function plRenderRolePrompts(role) {
  const grid = document.getElementById('plRoleGrid');
  if (!grid) return;
  const prompts = PL_ROLE_PROMPTS[role] || [];
  grid.innerHTML = prompts.map(plBuildCard).join('');
  plBindCardActions(grid);
}

function plRenderThinkingPrompts() {
  const grid = document.getElementById('plThinkingGrid');
  if (!grid) return;
  grid.innerHTML = PL_THINKING_PROMPTS.map(plBuildCard).join('');
  plBindCardActions(grid);
}

function plRenderResearchPrompts() {
  const grid = document.getElementById('plResearchGrid');
  if (!grid) return;
  grid.innerHTML = PL_RESEARCH_PROMPTS.map(plBuildCard).join('');
  plBindCardActions(grid);
}

function plRenderQuickActions() {
  const grid = document.getElementById('plQuickGrid');
  if (!grid) return;

  grid.innerHTML = PL_QUICK_PROMPTS.map(p => `
    <div class="pl-quick-card"
      data-search-title="${p.title.toLowerCase()}"
      data-search-body="${p.body.toLowerCase()}">
      <div class="pl-quick-icon">${p.icon}</div>
      <div class="pl-quick-title">${p.title}</div>
      <div class="pl-card-actions">
        <button class="pl-quick-generate" data-body="${encodeURIComponent(p.body)}">&#9889; Generate</button>
        
      </div>
    </div>`).join('');

  grid.querySelectorAll('.pl-quick-copy').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      plCopyText(decodeURIComponent(btn.dataset.body), btn);
    });
  });

  grid.querySelectorAll('.pl-quick-generate').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const body = decodeURIComponent(btn.dataset.body);

      if (typeof navigateTo === 'function') navigateTo('home');

      document.querySelectorAll('.nav-tab').forEach(n =>
        n.classList.toggle('active', n.dataset.page === 'home'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-home')?.classList.add('active');

      const textarea = document.getElementById('userInput');
      const charCount = document.getElementById('charCount');
      if (textarea) {
        textarea.value = body;
        if (charCount) charCount.textContent = body.length;
        textarea.dispatchEvent(new Event('input'));
      }

      window.scrollTo(0, 0);
      setTimeout(() => {
        plOpenScenarioGenModal({ body });
      }, 100);
    });
  });
}

function plRenderFavorites() {
  const container = document.getElementById('plFavoritesContainer'); // optional wrapper if present
  const grid  = document.getElementById('plFavoritesGrid');
  const empty = document.getElementById('plFavoritesEmpty');
  if (!grid) return;

  // Ensure a header area for the refresh button exists — create it if not present.
  // This does not modify the rest of the page; it only creates a small header inside the favorites tab.
  let header = document.getElementById('plFavoritesHeader');
  if (!header) {
    header = document.createElement('div');
    header.id = 'plFavoritesHeader';
    header.style.display = 'flex';
    header.style.justifyContent = 'flex-end';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.marginBottom = '10px';

    // Insert header before the grid if possible, otherwise prepend to the parent of grid
    if (grid.parentNode) {
      grid.parentNode.insertBefore(header, grid);
    } else if (container) {
      container.insertBefore(header, grid);
    }
  }

  // Create/refresh the refresh button
  let refreshBtn = document.getElementById('plFavoritesRefresh');
  if (!refreshBtn) {
    refreshBtn = document.createElement('button');
    refreshBtn.id = 'plFavoritesRefresh';
    refreshBtn.className = 'pl-btn-fav';
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.title = 'Refresh favorites';
    header.appendChild(refreshBtn);
  }

  // Optional small spinner element (created once)
  let spinner = document.getElementById('plFavoritesRefreshSpinner');
  if (!spinner) {
    spinner = document.createElement('span');
    spinner.id = 'plFavoritesRefreshSpinner';
    spinner.style.display = 'none';
    spinner.style.fontSize = '12px';
    spinner.style.color = 'var(--text2)';
    spinner.textContent = 'Refreshing…';
    header.appendChild(spinner);
  }

  // If there are no favorites, show empty state
  if (!plFavorites.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // Render favorites into the grid and bind actions
  grid.innerHTML = plFavorites.map(plBuildCard).join('');
  plBindCardActions(grid);

  // Wire refresh button click (idempotent)
  refreshBtn.onclick = async (e) => {
    e.stopPropagation();
    // Visual feedback
    refreshBtn.disabled = true;
    spinner.style.display = '';
    // Re-read favorites from localStorage in case they changed externally
    try {
      plFavorites = JSON.parse(localStorage.getItem('pl_favorites') || '[]');
    } catch {
      plFavorites = plFavorites || [];
    }
    // Re-render just the favorites grid
    grid.innerHTML = plFavorites.map(plBuildCard).join('');
    plBindCardActions(grid);

    // hide spinner and re-enable button
    spinner.style.display = 'none';
    refreshBtn.disabled = false;

    // small toast if available
    if (typeof showToast === 'function') showToast('Favorites refreshed', 'success');
  };
}


/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
function plApplySearch(q) {
  q = q.toLowerCase().trim();
  const emptyEl     = document.getElementById('plSearchEmpty');
  const activePanel = document.querySelector('.pltab-content.active');
  if (!activePanel) return;

  const cards = activePanel.querySelectorAll('.pl-card, .pl-quick-card');
  let count = 0;
  cards.forEach(card => {
    const match = !q
      || (card.dataset.searchTitle || '').includes(q)
      || (card.dataset.searchBody  || '').includes(q);
    card.style.display = match ? '' : 'none';
    if (match) count++;
  });
  if (emptyEl) emptyEl.classList.toggle('hidden', count > 0 || !q);
}


/* ══════════════════════════════════════
   SUB-TAB SWITCHING
══════════════════════════════════════ */
function plInitSubTabs() {
  document.querySelectorAll('.promptlib-navbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.promptlib-navbtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.pltab-content').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`pltab-${btn.dataset.pltab}`)?.classList.add('active');

      if (btn.dataset.pltab === 'my-favorites') plRenderFavorites();

      // Clear search when switching tabs
      const s = document.getElementById('promptLibSearch');
      if (s) { s.value = ''; plApplySearch(''); }
    });
  });
}


/* ══════════════════════════════════════
   SEARCH INPUT BINDING
══════════════════════════════════════ */
function plInitSearch() {
  const el = document.getElementById('promptLibSearch');
  if (!el) return;
  el.addEventListener('input', () => plApplySearch(el.value));
}


/* ══════════════════════════════════════
   ROLE SELECT BINDING
══════════════════════════════════════ */
function plInitRoleSelect() {
  const sel = document.getElementById('plRoleSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    plRenderRolePrompts(sel.value);
    const s = document.getElementById('promptLibSearch');
    if (s && s.value) plApplySearch(s.value);
  });
}


function plOpenScenarioGenModal({ body }) {
  const modal = document.getElementById('scenarioGenModal');
  const closeBtn = document.getElementById('btnCloseScenarioGenModal');
  const cancelBtn = document.getElementById('btnCancelScenarioGen');
  const confirmBtn = document.getElementById('btnConfirmScenarioGen');

  const roleHomeSel = document.getElementById('selRole');
  const taskHomeSel = document.getElementById('selTaskType');

  const roleSel = document.getElementById('scenarioRole');
  const taskSel = document.getElementById('scenarioTaskType');
  const desc    = document.getElementById('scenarioDesc');

  // Safety: if modal not in DOM, fallback to old behavior
  if (!modal || !roleSel || !taskSel || !desc) {
    document.getElementById('btnGenerate')?.click();
    return;
  }

  // Clone options from Home selects so you don’t maintain two lists
  roleSel.innerHTML = roleHomeSel ? roleHomeSel.innerHTML : '';
  taskSel.innerHTML = taskHomeSel ? taskHomeSel.innerHTML : '';

  // Default to current Home selections
  if (roleHomeSel) roleSel.value = roleHomeSel.value;
  if (taskHomeSel) taskSel.value = taskHomeSel.value;

  desc.value = body || '';

  // Placeholder hint (simple detection: [something])
  const hint = document.getElementById('scenarioPlaceholderHint');
  const matches = (desc.value.match(/\[[^\]]+\]/g) || []);
  if (hint) {
    if (matches.length) {
      const uniq = [...new Set(matches)].slice(0, 8);
      hint.style.display = 'block';
      hint.innerHTML = `Placeholders detected: ${uniq.map(x => `<code>${plEscapeHtml(x)}</code>`).join(' ')}<br/>Tip: replace these before generating.`;
    } else {
      hint.style.display = 'none';
      hint.innerHTML = '';
    }
  }

  const close = () => modal.classList.remove('open');

  // Clean previous listeners (simple re-bind approach)
  closeBtn.onclick = close;
  cancelBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  document.onkeydown = (e) => { if (e.key === 'Escape') close(); };

  confirmBtn.onclick = async () => {

    // ✅ move to Home tab FIRST
    if (typeof navigateTo === 'function') navigateTo('home');

    // Apply selections + description back to Home form
    if (roleHomeSel) roleHomeSel.value = roleSel.value;
    if (taskHomeSel) taskHomeSel.value = taskSel.value;

    const textarea  = document.getElementById('userInput');
    const charCount = document.getElementById('charCount');
    if (textarea) {
      textarea.value = desc.value.trim();
      if (charCount) charCount.textContent = textarea.value.length;
      textarea.dispatchEvent(new Event('input'));
    }
    
    close();

    // Call the real generate handler
    if (typeof handleGenerate === 'function') {
      handleGenerate();
    } else {
      document.getElementById('btnGenerate')?.click();
    }
  };

  modal.classList.add('open');
}


/* ══════════════════════════════════════
   INIT — called on DOMContentLoaded
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  plRenderRolePrompts('consultant');
  plRenderThinkingPrompts();
  plRenderResearchPrompts();
  plRenderQuickActions();
  plInitSubTabs();
  plInitSearch();
  plInitRoleSelect();
});