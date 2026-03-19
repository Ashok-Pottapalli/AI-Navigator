/* ══════════════════════════════════════════════════════
   app.js — API config, state, home page / generate,
            render result, refine, feedback, history,
            tools, analytics, policies, sidebar stats
   (v2 — with role, task_type, data_sensitivity + refinement)
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════
   API ENDPOINTS
══════════════════════════════════════ */
const API = {
  run:            '/api/run',
  refine:         '/api/refine',
  feedback:       '/api/feedback',
  audit:          '/api/audit',
  analytics:      '/api/analytics',
  tools:          '/api/tools',
  policies:       '/api/policies',
  uploadPolicy:   '/api/upload-policy',
  deletePolicy:   (f) => `/api/policies/${encodeURIComponent(f)}`,
  promptVersions: '/api/prompt-versions',
};


/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let currentAuditId     = null;
let currentOutput      = '';   // latest llm output — updated on each refinement too
let currentInput       = '';   // original user question
let currentCorlo       = '';   // CORLO prompt that generated the response
let currentRole        = 'general';
let currentTaskType    = 'general';
let currentSensitivity = 'general';
let currentIntent      = 'general';
let currentIndustry    = 'general';
let currentTool        = '';


/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebar();
  initHomePage();
  initOutputTabs();
  initFeedback();
  initModal();
  initPoliciesPage();
  initSafetyBannerSync();
  loadSidebarStats();
  // Toolbar hidden until a prompt is generated
  const t = document.getElementById('promptToolbar');
  if (t) t.style.display = 'none';

  // Init hamburger drawer AFTER everything else so the
  // button clone strips the sidebar-open listener added by initSidebar
  initHamburgerDrawer();
});


/* ══════════════════════════════════════
   SAFETY BANNER — real-time sync
══════════════════════════════════════ */
function initSafetyBannerSync() {
  ['selRole', 'selTaskType', 'selSensitivity'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', syncSafetyBanner);
  });
  syncSafetyBanner();
}

function syncSafetyBanner() {
  const sensitivity = document.getElementById('selSensitivity')?.value;
  const taskType    = document.getElementById('selTaskType')?.value;

  if (sensitivity === 'client') {
    setBanner('warn', '⚠ Client / Confidential selected',
      'Use an approved secure platform for client data. Do not paste raw client info into the prompt.');
  } else if (taskType === 'automate') {
    setBanner('warn', '⚠ Automation task',
      'Automation implementations must go through governed workflows. Avoid external plugins or live system connections.');
  } else if (sensitivity === 'internal') {
    setBanner('ok', '🔒 Internal context',
      'Use general terms for sensitive internal details. Replace specific metrics with placeholders.');
  } else {
    setBanner('ok', '✓ Safe to proceed',
      'Use approved tools only. Do not include credentials or confidential data.');
  }
}

function setBanner(mode, title, text) {
  const el = document.getElementById('safetyBanner');
  el.className = `safety-banner ${mode}`;
  document.getElementById('safetyTitle').textContent = title;
  document.getElementById('safetyText').textContent  = text;
}


/* ══════════════════════════════════════
   HOME PAGE — Prompt Builder
══════════════════════════════════════ */
function initHomePage() {
  const textarea  = document.getElementById('userInput');
  const charCount = document.getElementById('charCount');

  textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length; });

  document.querySelectorAll('.chip[data-example]').forEach(chip => {
    chip.addEventListener('click', () => {
      textarea.value = chip.dataset.example;
      charCount.textContent = textarea.value.length;
      textarea.focus();
    });
  });

  document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
  document.getElementById('btnNewPrompt').addEventListener('click', resetToStep1);

  document.getElementById('btnCopyOutput').addEventListener('click', () => {
    const panel = document.querySelector('.output-panel.active .output-content');
    if (panel) navigator.clipboard.writeText(panel.textContent)
      .then(() => showToast('Copied!', 'success'));
  });

  document.getElementById('btnRefine')?.addEventListener('click', handleRefine);

  // ── Edit / Copy / Save prompt toolbar ──
  document.getElementById('btnEditPrompt')?.addEventListener('click', enterPromptEditMode);
  document.getElementById('btnCopyPrompt')?.addEventListener('click', copyPromptText);
  document.getElementById('btnSavePrompt')?.addEventListener('click', savePromptToFavorites);
  document.getElementById('btnPromptOk')?.addEventListener('click', applyPromptEdit);
  document.getElementById('btnPromptCancelEdit')?.addEventListener('click', cancelPromptEdit);
}


/* ══════════════════════════════════════
   PROMPT TOOLBAR — Edit / Copy / Save
══════════════════════════════════════ */

function enterPromptEditMode() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  textarea.value        = display.textContent;
  display.style.display = 'none';
  textarea.style.display = 'block';
  okBar.style.display   = 'flex';
  editBtn.textContent   = '✎ Editing…';
  editBtn.disabled      = true;
  textarea.focus();
}

function applyPromptEdit() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  display.textContent    = textarea.value;
  currentCorlo           = textarea.value;   // keep state in sync
  display.style.display  = 'block';
  textarea.style.display = 'none';
  okBar.style.display    = 'none';
  editBtn.textContent    = '✎ Edit';
  editBtn.disabled       = false;

  // Show revised banner
  const banner = document.getElementById('revisedBanner');
  if (banner) {
    banner.textContent   = '✅ Prompt updated manually.';
    banner.style.display = 'block';
  }
  showToast('Prompt updated!', 'success');
}

function cancelPromptEdit() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  display.style.display  = 'block';
  textarea.style.display = 'none';
  okBar.style.display    = 'none';
  editBtn.textContent    = '✎ Edit';
  editBtn.disabled       = false;
}

function copyPromptText() {
  const text = document.getElementById('resultPrompt').textContent;
  if (!text || text.startsWith('(')) { showToast('No prompt to copy yet.', 'error'); return; }
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btnCopyPrompt');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
    showToast('Prompt copied!', 'success');
  });
}

function savePromptToFavorites() {
  const text = document.getElementById('resultPrompt').textContent;
  if (!text || text.startsWith('(')) { showToast('No prompt to save yet.', 'error'); return; }

  // Build a title from the user input (first 50 chars)
  const title = (currentInput || 'Saved Prompt').substring(0, 50).trim()
              + (currentInput && currentInput.length > 50 ? '…' : '');

  // Read existing favorites from localStorage (same key as promptlib.js)
  let favs = [];
  try { favs = JSON.parse(localStorage.getItem('pl_favorites') || '[]'); } catch {}

  // Avoid exact duplicates by title
  if (favs.some(f => f.title === title)) {
    showToast('Already saved in Favorites.', 'info'); return;
  }

  favs.push({ title, body: currentInput, fromHome: true });
  localStorage.setItem('pl_favorites', JSON.stringify(favs));

  // Visual feedback
  const confirm = document.getElementById('saveConfirm');
  if (confirm) { confirm.style.display = 'inline'; setTimeout(() => { confirm.style.display = 'none'; }, 2500); }
  showToast('Saved to Favorites in Scenario Library!', 'success');
}


async function handleGenerate() {
  const input       = document.getElementById('userInput').value.trim();
  const role        = document.getElementById('selRole')?.value        || 'general';
  const taskType    = document.getElementById('selTaskType')?.value    || 'general';
  const sensitivity = document.getElementById('selSensitivity')?.value || 'general';

  if (!input) { showToast('Please describe your task first.', 'error'); return; }

  goToStep(2);
  startProcessingAnimation();

  try {
    const res = await fetch(API.run, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_input:       input,
        role:             role,
        task_type:        taskType,
        data_sensitivity: sensitivity,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();

    // Store full context so refinement has everything it needs
    currentAuditId     = data.audit_id;
    currentOutput      = data.output           || '';
    currentCorlo       = data.corlo_prompt     || '';
    currentInput       = input;
    currentRole        = role;
    currentTaskType    = taskType;
    currentSensitivity = sensitivity;
    currentIntent      = data.intent           || 'general';
    currentIndustry    = data.industry         || 'general';
    currentTool        = data.recommended_tool || '';

    await finishProcessingAnimation();
    renderResult(data);
    goToStep(3);
    loadSidebarStats();

  } catch (err) {
    goToStep(1);
    showToast(`Error: ${err.message}`, 'error');
  }
}

function resetToStep1() {
  goToStep(1);
  document.getElementById('userInput').value       = '';
  document.getElementById('charCount').textContent = '0';
  const banner = document.getElementById('revisedBanner');
  if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
  const ri = document.getElementById('refinementInput');
  if (ri) ri.value = '';
  const toolbar = document.getElementById('promptToolbar');
  if (toolbar) toolbar.style.display = 'none';
  cancelPromptEdit();
  currentAuditId     = null;
  currentOutput      = '';
  currentCorlo       = '';
  currentInput       = '';
  currentRole        = 'general';
  currentTaskType    = 'general';
  currentSensitivity = 'general';
  currentIntent      = 'general';
  currentIndustry    = 'general';
  currentTool        = '';
  document.querySelectorAll('.star').forEach(s => s.classList.remove('lit'));
  syncSafetyBanner();
}


/* ══════════════════════════════════════
   RENDER RESULT
══════════════════════════════════════ */
function renderResult(data) {
  // ── Meta badges ──
  const confClass   = data.tool_confidence === 'high'   ? 'conf-high'
                    : data.tool_confidence === 'medium' ? 'conf-med' : 'conf-low';
  const role        = data.role             || '';
  const taskType    = data.task_type        || '';
  const sensitivity = data.data_sensitivity || '';

  document.getElementById('resultMeta').innerHTML = `
    ${data.recommended_tool ? `<span class="meta-badge tool">${escapeHtml(data.tool_icon || '🤖')} ${escapeHtml(data.recommended_tool)}</span>` : ''}
    ${data.intent    ? `<span class="meta-badge intent">Intent: ${capitalize(data.intent)}</span>` : ''}
    ${data.industry  ? `<span class="meta-badge intent">Industry: ${capitalize(data.industry)}</span>` : ''}
    ${data.tool_confidence ? `<span class="meta-badge ${confClass}">${capitalize(data.tool_confidence)} confidence</span>` : ''}
    ${role        ? `<span class="meta-badge role">👤 ${capitalize(role)}</span>`        : ''}
    ${taskType    ? `<span class="meta-badge role">📌 ${capitalize(taskType)}</span>`    : ''}
    ${sensitivity ? `<span class="meta-badge sens">🔒 ${capitalize(sensitivity)}</span>` : ''}
  `;

  // ── Policy blocked banner — shown prominently above everything if blocked ──
  const blockedBox = document.getElementById('policyBlockedBox');
  if (data.policy_blocked) {
    blockedBox.style.display = 'block';
    blockedBox.innerHTML = `
      <div class="safety-banner bad" style="margin-bottom:12px">
        <span>🚫</span>
        <div>
          <strong>Task blocked by company policy</strong>
          <span>${escapeHtml(data.policy_summary || 'This request conflicts with one or more company policies.')}</span>
        </div>
      </div>`;
  } else {
    blockedBox.style.display = 'none';
    blockedBox.innerHTML = '';
  }

  // ── Tool recommendation box ──
  const toolBox = document.getElementById('toolRecBox');
  if (data.recommended_tool && !data.policy_blocked) {
    toolBox.innerHTML = `
      <div class="tool-rec-box">
        <div class="tool-rec-header">
          <div class="tool-rec-icon">${escapeHtml(data.tool_icon || '🤖')}</div>
          <div>
            <div class="tool-rec-name">${escapeHtml(data.recommended_tool)}</div>
            <div class="tool-rec-category">${escapeHtml(data.tool_category || '')}</div>
          </div>
        </div>
        <div class="tool-rec-reason">${escapeHtml(data.tool_reason || '')}</div>
        <div class="tool-rec-footer">
          ${data.tool_url ? `<a class="tool-url-btn" href="${escapeHtml(data.tool_url)}" target="_blank" rel="noopener">🚀 Open Tool</a>` : ''}
          <span style="font-size:12px;color:var(--text3)">Confidence: <strong>${capitalize(data.tool_confidence || '—')}</strong></span>
        </div>
      </div>`;
  } else {
    toolBox.innerHTML = '';
  }

  // ── Policy flags ──
  const flagsBox = document.getElementById('policyFlagsBox');
  const flags    = data.policy_flags || [];
  if (flags.length) {
    flagsBox.innerHTML = `
      <div class="policy-flag-list">
        ${flags.map(f => `<div class="policy-flag">⚠ ${escapeHtml(f)}</div>`).join('')}
      </div>`;
  } else {
    flagsBox.innerHTML = '';
  }

  // ── Alternatives ──
  const altBox = document.getElementById('alternativesBox');
  const alts   = data.tool_alternatives || [];
  if (alts.length && !data.policy_blocked) {
    altBox.innerHTML = `
      <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Also consider</div>
      <div class="alternatives-row">
        ${alts.map(a => `<span class="alt-chip">${escapeHtml(a)}</span>`).join('')}
      </div>`;
  } else {
    altBox.innerHTML = '';
  }

  // ── Output panels ──
  document.getElementById('resultPrompt').textContent = data.policy_blocked
    ? '(Prompt not generated — task was blocked by company policy.)'
    : (data.corlo_prompt || '(No prompt generated)');

// Policies Applied tab — rich HTML for both blocked and allowed cases
  const policySummary = data.policy_summary || '';
  const policyFlags   = data.policy_flags   || [];
  const policiesEl    = document.getElementById('resultPolicies');

  if (data.policy_blocked) {
    // ── BLOCKED: show a clear violation breakdown ──
    const flagItems = policyFlags.length
      ? policyFlags.map(f => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
               background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:8px;">
            <span style="font-size:16px;flex-shrink:0;">🚫</span>
            <span style="font-size:13px;color:#991B1B;font-weight:600;">${escapeHtml(f)}</span>
          </div>`).join('')
      : `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
              background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:8px;">
           <span style="font-size:16px;flex-shrink:0;">🚫</span>
           <span style="font-size:13px;color:#991B1B;font-weight:600;">Prohibited content detected</span>
         </div>`;

    policiesEl.innerHTML = `
      <div style="padding:4px 2px;">

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:20px;">🛡️</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:#991B1B;">Request Blocked by Company Policy</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">This task cannot proceed — one or more policy violations were detected.</div>
          </div>
        </div>

        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
             color:var(--text3);margin-bottom:8px;">Policy Violations Detected</div>
        ${flagItems}

        <div style="margin-top:16px;padding:12px 14px;background:#FFF7ED;border:1px solid #FCD34D;
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#92400E;margin-bottom:6px;">📋 Policy Explanation</div>
          <div style="font-size:13px;color:#78350F;line-height:1.6;">
            ${escapeHtml(policySummary || 'This request conflicts with your company\'s acceptable use policy. Prohibited topics include harmful content, dangerous instructions, and restricted subject matter.')}
          </div>
        </div>

        <div style="margin-top:14px;padding:12px 14px;background:#F0F9FF;border:1px solid #BAE6FD;
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#075985;margin-bottom:6px;">💡 What you can do instead</div>
          <div style="font-size:13px;color:#0C4A6E;line-height:1.6;">
            Please rephrase your request to focus on a permitted topic. If you believe this was flagged in error, contact your policy administrator. You can also try a different task type or industry context.
          </div>
        </div>

      </div>`;

  } else {
    // ── ALLOWED: show a green clearance summary ──
    const flagItems = policyFlags.length
      ? `<div style="margin-bottom:14px;">
           <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
                color:var(--text3);margin-bottom:8px;">⚠️ Soft Warnings (non-blocking)</div>
           ${policyFlags.map(f => `
             <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;
                  background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;margin-bottom:6px;">
               <span style="font-size:14px;flex-shrink:0;">⚠️</span>
               <span style="font-size:12px;color:#92400E;">${escapeHtml(f)}</span>
             </div>`).join('')}
         </div>`
      : '';

    policiesEl.innerHTML = `
      <div style="padding:4px 2px;">

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:20px;">✅</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:#065F46;">Request Cleared — Safe to Proceed</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">No prohibited content was detected. Your request is within policy guidelines.</div>
          </div>
        </div>

        <div style="padding:12px 14px;background:#ECFDF5;border:1px solid #6EE7B7;
             border-radius:8px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#065F46;margin-bottom:6px;">📋 Policy Assessment</div>
          <div style="font-size:13px;color:#064E3B;line-height:1.6;">
            ${escapeHtml(policySummary || 'This request was reviewed against applicable company policies and no violations were found. You may proceed using the generated CORLO prompt.')}
          </div>
        </div>

        ${flagItems}

        <div style="padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border);
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:var(--text3);margin-bottom:8px;">🔒 Enterprise Policy Reminders</div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Use only approved AI tools listed in your organisation's registry.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Do not include credentials, passwords, or confidential client data in prompts.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Review all AI-generated output before sharing externally.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Sensitive data classifications must follow your data governance framework.
            </div>
          </div>
        </div>

      </div>`;
  }

  // ── Show/hide revised prompt box based on whether task is blocked ──
  const refinementBox = document.getElementById('refinementBox');
  if (refinementBox) {
    refinementBox.style.display = data.policy_blocked ? 'none' : '';
  }

  // Show/hide Edit-Copy-Save toolbar
  const promptToolbar = document.getElementById('promptToolbar');
  if (promptToolbar) {
    promptToolbar.style.display = data.policy_blocked ? 'none' : 'flex';
  }
  // Reset edit mode if re-generating
  cancelPromptEdit();

  // Reset revised banner
  const revisedBanner = document.getElementById('revisedBanner');
  if (revisedBanner) {
    revisedBanner.style.display = 'none';
    revisedBanner.textContent   = '';
  }
  const refinementInput = document.getElementById('refinementInput');
  if (refinementInput) refinementInput.value = '';

  // Reset active tab to CORLO Prompt (first tab)
  document.querySelectorAll('.output-tab').forEach((t, i)  => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.output-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
}


/* ══════════════════════════════════════
   REFINEMENT — user adds a comment to revise the CORLO prompt
   The LLM rewrites the prompt based on the user's feedback.
══════════════════════════════════════ */
async function handleRefine() {
  const comment = document.getElementById('refinementInput').value.trim();
  if (!comment)        { showToast('Please enter a comment first.', 'error'); return; }
  if (!currentAuditId) { showToast('No result to refine yet.', 'error');     return; }

  const spinner = document.getElementById('refineSpinner');
  const btn     = document.getElementById('btnRefine');
  btn.disabled  = true;
  if (spinner) spinner.style.display = 'inline';

  try {
    const res = await fetch(API.refine, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        audit_id:         currentAuditId,
        user_input:       currentInput,
        corlo_prompt:     currentCorlo,
        llm_output:       currentOutput,
        comment:          comment,
        role:             currentRole,
        task_type:        currentTaskType,
        data_sensitivity: currentSensitivity,
        intent:           currentIntent,
        industry:         currentIndustry,
        recommended_tool: currentTool,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();

    // Update tracked corlo so a second refinement builds on this version
    currentCorlo  = data.revised_output;
    currentOutput = data.revised_output;

    // Show the revised prompt in the CORLO Prompt panel
    const promptPanel = document.getElementById('resultPrompt');
    if (promptPanel) promptPanel.textContent = data.revised_output;

    // Show revised banner
    const banner = document.getElementById('revisedBanner');
    if (banner) {
      banner.textContent     = '✅ CORLO Prompt revised based on your feedback.';
      banner.style.display   = 'block';
    }

    // Switch to CORLO Prompt tab to show the revision
    document.querySelectorAll('.output-tab').forEach((t, i)  => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.output-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

    document.getElementById('refinementInput').value = '';
    showToast('CORLO Prompt revised successfully!', 'success');

  } catch (err) {
    showToast(`Refinement failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}


/* ══════════════════════════════════════
   FEEDBACK
══════════════════════════════════════ */
function initFeedback() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const r = parseInt(star.dataset.rating);
      stars.forEach(s => s.classList.toggle('lit', parseInt(s.dataset.rating) <= r));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('lit'));
    });
    star.addEventListener('click', () => submitFeedback(parseInt(star.dataset.rating)));
  });
}

async function submitFeedback(rating) {
  if (!currentAuditId) return;
  try {
    await fetch(API.feedback, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ audit_id: currentAuditId, rating, comment: '', issue_type: '' }),
    });
    showToast(`Thanks for rating! (${rating}★)`, 'success');
    document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('lit', i < rating));
  } catch {
    showToast('Failed to submit feedback.', 'error');
  }
}




/* ══════════════════════════════════════
   HISTORY
══════════════════════════════════════ */
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const res  = await fetch(`${API.audit}?limit=30`);
    const data = await res.json();

    if (!data.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>No history yet. Generate your first prompt!</p>
        </div>`;
      return;
    }

    list.innerHTML = data.map(row => `
      <div class="history-item">
        <div class="history-item-icon">🤖</div>
        <div class="history-item-body">
          <div class="history-item-input" title="${escapeHtml(row.raw_input || '')}">${escapeHtml(row.raw_input || '—')}</div>
          <div class="history-item-meta">
            <span>🎯 ${capitalize(row.intent || '—')}</span>
            <span>🏭 ${capitalize(row.industry || '—')}</span>
            <span>🔧 ${escapeHtml(row.recommended_tool || '—')}</span>
            <span>🕐 ${formatDate(row.created_at)}</span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="openLogModal('${row.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            View
          </button>

          <button
            class="btn btn-primary btn-sm"
            onclick="openHistoryRegenerateModal('${encodeURIComponent(row.raw_input || '')}')"
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Regenerate
        </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>Failed to load history: ${err.message}</p></div>`;
  }
}

document.getElementById('btnRefreshHistory')?.addEventListener('click', loadHistory);


/* ══════════════════════════════════════
   AI TOOLS PAGE
══════════════════════════════════════ */
async function loadTools() {
  const grid = document.getElementById('toolsGrid');
  grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res  = await fetch(API.tools);
    const data = await res.json();
    grid.innerHTML = Object.entries(data).map(([name, info]) => `
      <div class="tool-card">
        <div class="tool-card-header">
          <div class="tool-icon">${info.icon || '🤖'}</div>
          <div>
            <div class="tool-name">${escapeHtml(name)}</div>
            <div class="tool-category">${escapeHtml(info.category)}</div>
          </div>
        </div>
        <p class="tool-desc">${escapeHtml(info.description)}</p>
        <div class="tool-tags">
          ${(info.best_for || []).map(t => `<span class="tool-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <a href="${escapeHtml(info.url)}" target="_blank" rel="noopener" class="tool-link">Visit →</a>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p>Failed to load tools: ${err.message}</p></div>`;
  }
}


/* ══════════════════════════════════════
   ANALYTICS PAGE
══════════════════════════════════════ */
async function loadAnalytics() {
  const container = document.getElementById('analyticsContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res  = await fetch(API.analytics);
    const data = await res.json();
    const maxIntent = Math.max(...(data.intents || []).map(r => r.c), 1);
    const maxTool   = Math.max(...(data.tools   || []).map(r => r.c), 1);

    container.innerHTML = `
      <div class="analytics-stats">
        <div class="stat-card"><div class="stat-card-label">Total Runs</div><div class="stat-card-val accent">${data.total_runs ?? 0}</div></div>
        <div class="stat-card"><div class="stat-card-label">Avg Rating</div><div class="stat-card-val accent">${data.avg_rating ?? '—'}</div></div>
        <div class="stat-card"><div class="stat-card-label">Feedback Count</div><div class="stat-card-val">${data.feedback_count ?? 0}</div></div>
        <div class="stat-card"><div class="stat-card-label">Industries</div><div class="stat-card-val">${(data.industries || []).length}</div></div>
      </div>
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="analytics-card-title">Intent Breakdown</div>
          ${(data.intents || []).map(r => `
            <div class="bar-row">
              <div class="bar-label" title="${r.intent}">${capitalize(r.intent)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxIntent*100)}%"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Tool Usage</div>
          ${(data.tools || []).map(r => `
            <div class="bar-row">
              <div class="bar-label" title="${r.recommended_tool}">${escapeHtml(r.recommended_tool)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxTool*100)}%;background:var(--success)"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Top Industries</div>
          ${(data.industries || []).map(r => `
            <div class="bar-row">
              <div class="bar-label">${capitalize(r.industry)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxIntent*100)}%;background:#8B5CF6"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Feedback Issues</div>
          ${(data.issue_types || []).length
            ? (data.issue_types || []).map(r => `
              <div class="bar-row">
                <div class="bar-label">${escapeHtml(r.issue_type || 'Other')}</div>
                <div class="bar-track"><div class="bar-fill" style="background:var(--danger)"></div></div>
                <div class="bar-count">${r.c}</div>
              </div>`).join('')
            : '<p style="color:var(--text3);font-size:13px">No issues reported yet.</p>'}
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed: ${err.message}</p></div>`;
  }
}

document.getElementById('btnRefreshAnalytics')?.addEventListener('click', loadAnalytics);


/* ══════════════════════════════════════
   POLICIES PAGE
══════════════════════════════════════ */
function initPoliciesPage() {
  const zone      = document.getElementById('uploadZone');
  const fileInput = document.getElementById('policyFileInput');
  const btnBrowse = document.getElementById('btnBrowseFile');

  btnBrowse.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadPolicyFile(fileInput.files[0]);
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) uploadPolicyFile(e.dataTransfer.files[0]);
  });

  document.getElementById('btnRefreshPolicies')?.addEventListener('click', loadPolicies);
}

async function uploadPolicyFile(file) {
  const status = document.getElementById('uploadStatus');
  status.innerHTML = `<div style="color:var(--text2);display:flex;align-items:center;gap:8px">
    <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
    Uploading ${escapeHtml(file.name)}…
  </div>`;

  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch(API.uploadPolicy, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') {
      status.innerHTML = `<span style="color:var(--success)">✅ Indexed ${data.chunks_indexed} chunks from <strong>${escapeHtml(data.filename)}</strong></span>`;
      loadPolicies();
      showToast('Policy uploaded!', 'success');
    } else { throw new Error(data.detail || 'Upload failed'); }
  } catch (err) {
    status.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}

async function loadPolicies() {
  const list = document.getElementById('policiesList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res  = await fetch(API.policies);
    const data = await res.json();
    if (!data.sources || !data.sources.length) {
      list.innerHTML = '<p style="padding:16px;color:var(--text3);font-size:13px">No policies indexed yet.</p>';
      updateStat('sbPolicies', 0);
      return;
    }
    updateStat('sbPolicies', data.sources.length);
    list.innerHTML = data.sources.map(src => `
      <div class="policy-item">
        <div class="policy-name">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            style="display:inline;vertical-align:middle;color:var(--text3)">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          ${escapeHtml(src)}
        </div>
        <button class="btn-danger" onclick="deletePolicy('${escapeHtml(src)}')">Delete</button>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="padding:16px;color:var(--danger);font-size:13px">Error: ${err.message}</p>`;
  }
}

async function deletePolicy(filename) {
  if (!confirm(`Delete policy "${filename}"?`)) return;
  try {
    await fetch(API.deletePolicy(filename), { method: 'DELETE' });
    showToast('Policy deleted.', 'success');
    loadPolicies();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}


/* ══════════════════════════════════════
   SIDEBAR STATS
══════════════════════════════════════ */
async function loadSidebarStats() {
  try {
    const [ar, pr]   = await Promise.all([fetch(API.analytics), fetch(API.policies)]);
    const analytics  = await ar.json();
    const policies   = await pr.json();
    updateStat('sbTotalRuns', analytics.total_runs ?? 0);
    updateStat('sbAvgRating', analytics.avg_rating ? `${analytics.avg_rating}★` : '—');
    updateStat('sbPolicies',  (policies.sources || []).length);
  } catch {}
}


function openHistoryRegenerateModal(encodedInput) {
  const body = decodeURIComponent(encodedInput || '');

  // move to Home first
  if (typeof navigateTo === 'function') navigateTo('home');

  // switch visible nav/page state
  document.querySelectorAll('.nav-tab').forEach(n =>
    n.classList.toggle('active', n.dataset.page === 'home'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home')?.classList.add('active');

  // open same popup used by Scenario Library Generate button
  if (typeof plOpenScenarioGenModal === 'function') {
    plOpenScenarioGenModal({ body });
  } else {
    // fallback: just populate textarea if modal function is not available
    const textarea  = document.getElementById('userInput');
    const charCount = document.getElementById('charCount');
    if (textarea) {
      textarea.value = body;
      if (charCount) charCount.textContent = body.length;
      textarea.dispatchEvent(new Event('input'));
    }
  }
}