/* ══════════════════════════════════════════════════════
   ui.js — Navigation, sidebar, hamburger drawer,
           output tabs, step logic, processing animation,
           modal, toast, shared utils
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
function initNavigation() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });
  document.querySelectorAll('.sidebar-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { navigateTo(btn.dataset.page); closeSidebar(); });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.sidebar-item[data-page]').forEach(t =>
    t.classList.toggle('active', t.dataset.page === page));

  if (page === 'history')   loadHistory();
  if (page === 'tools')     loadTools();
  if (page === 'analytics') loadAnalytics();
  if (page === 'policies')  loadPolicies();
}


/* ══════════════════════════════════════
   SIDEBAR
══════════════════════════════════════ */
function initSidebar() {
  document.getElementById('hamburgerBtn')
    .addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  document.getElementById('sidebarOverlay')
    .addEventListener('click', closeSidebar);
}
function closeSidebar() { document.body.classList.remove('sidebar-open'); }


/* ══════════════════════════════════════
   HAMBURGER DRAWER
   Replaces the sidebar-toggle behaviour with a
   slide-in drawer.  Runs after DOMContentLoaded so
   it can clone the button and strip existing listeners.
══════════════════════════════════════ */
function initHamburgerDrawer() {
  const btn     = document.getElementById('hamburgerBtn');
  const drawer  = document.getElementById('menuDrawer');
  const overlay = document.getElementById('menuDrawerOverlay');
  if (!btn || !drawer) return;

  // Clone → removes all existing listeners (e.g. from initSidebar)
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', e => {
    e.stopPropagation();
    drawer.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    }
  });
}


/* ══════════════════════════════════════
   OUTPUT TABS
══════════════════════════════════════ */
function initOutputTabs() {
  document.querySelectorAll('.output-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.out;
      document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.output-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`out-${key}`)?.classList.add('active');
    });
  });
}


/* ══════════════════════════════════════
   STEP INDICATORS
══════════════════════════════════════ */
function goToStep(n) {
  document.querySelectorAll('.step-panel').forEach((p, i) =>
    p.classList.toggle('active', i + 1 === n));

  for (let i = 1; i <= 3; i++) {
    const ind = document.getElementById(`step-ind-${i}`);
    if (!ind) continue;
    ind.classList.remove('active', 'done');
    if (i === n)    ind.classList.add('active');
    else if (i < n) ind.classList.add('done');
  }
}


/* ══════════════════════════════════════
   PROCESSING ANIMATION
══════════════════════════════════════ */
function startProcessingAnimation() {
  for (let i = 1; i <= 5; i++) {
    const step = document.getElementById(`proc-${i}`);
    if (step) step.className = 'proc-step';
  }
}

async function finishProcessingAnimation() {
  for (let i = 1; i <= 5; i++) {
    await delay(350);
    const step = document.getElementById(`proc-${i}`);
    if (step) step.classList.add('active');
    await delay(150);
    if (step) { step.classList.remove('active'); step.classList.add('done'); }
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }


/* ══════════════════════════════════════
   LOG MODAL
══════════════════════════════════════ */
function initModal() {
  document.getElementById('btnCloseModal')
    .addEventListener('click', closeLogModal);
  document.getElementById('logModal')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeLogModal(); });
}

async function openLogModal(auditId) {
  const modal = document.getElementById('logModal');
  const body  = document.getElementById('logModalBody');
  modal.classList.add('open');
  body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const res  = await fetch(`${API.audit}?limit=200`);
    const data = await res.json();
    const row  = data.find(r => r.id === auditId);
    if (!row) { body.innerHTML = '<p style="color:var(--text2)">Log not found.</p>'; return; }

    // apply local edits if any (frontend-only persistence)
    const localEdits = getLocalAuditEdits(auditId);
    const mergedRow  = { ...row, ...localEdits };
    // Always keep policy_blocked and policy_summary from the original server row
    // so local text edits never accidentally override block status
    mergedRow.policy_blocked = row.policy_blocked;
    mergedRow.policy_summary = localEdits.policy_summary ?? row.policy_summary ?? '';

    // parse json fields
    let policyFlags = [], policies = [];
    try { policyFlags = JSON.parse(mergedRow.policy_flags       || '[]'); } catch {}
    try { policies    = JSON.parse(mergedRow.retrieved_policies || '[]'); } catch {}

    body.innerHTML = renderAuditLog(mergedRow, policyFlags, policies);
    wireEditActions(auditId, mergedRow, policyFlags, policies);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
  }
}

function closeLogModal() {
  document.getElementById('logModal').classList.remove('open');
}


/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons     = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(20px)';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}


/* ══════════════════════════════════════
   SHARED UTILS
   (used by both app.js and ui.js)
══════════════════════════════════════ */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
         + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function updateStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}










function renderAuditLog(row, policyFlags, policies, editMode = false) {
  const rawInput      = row.raw_input      || '';
  const finalPrompt   = row.final_prompt   || '';
  const policySummary = row.policy_summary || '';
  const isBlocked     = row.policy_blocked === true || row.policy_blocked === 1 || row.policy_blocked === 'true';

  const viewBlock = (title, value, extraClass = '') => `
    <div class="log-section">
      <div class="log-section-title">${title}</div>
      <div class="log-value ${extraClass}">${escapeHtml(value)}</div>
    </div>
  `;

  const editBlock = (title, id, value, extraClass = '') => `
    <div class="log-section">
      <div class="log-section-title">${title}</div>
      <textarea class="log-edit-area ${extraClass}" id="${id}">${escapeHtml(value)}</textarea>
    </div>
  `;

  /* ── BLOCKED layout: just user input + block reason + metadata ── */
  if (isBlocked) {
    const blockMessage = policySummary
      || 'This request was blocked because it conflicts with one or more company policies. Please review your company\'s policy documents for guidance on what is permitted, or consult your compliance team before proceeding.';

    return `
      
      ${viewBlock('User Input', rawInput)}

      ${viewBlock('Classification', `Intent: ${capitalize(row.intent)}  |  Industry: ${capitalize(row.industry)}`)}

      <div class="log-section">
        <div class="log-section-title">Policy Status</div>
        <div style="border:1.5px solid #FCA5A5;border-radius:10px;overflow:hidden;">

          <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:#FEF2F2;">
            <span style="font-size:20px;flex-shrink:0;">🚫</span>
            <div>
              <div style="font-size:13px;font-weight:800;color:#991B1B;margin-bottom:2px;">Task blocked by company policy</div>
              <div style="font-size:11px;color:#B91C1C;">This request could not be completed due to a policy violation.</div>
            </div>
          </div>

          <div style="padding:14px 16px;background:#fff;border-top:1px solid #FCA5A5;">
            <div style="font-size:12px;color:#374151;line-height:1.7;">${escapeHtml(blockMessage)}</div>
          </div>

          ${policyFlags.length ? `
          <div style="padding:10px 16px 14px;background:#fff;border-top:1px solid #FEE2E2;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9CA3AF;margin-bottom:8px;">Flags Triggered</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${policyFlags.map(f => `
                <div style="display:flex;align-items:flex-start;gap:7px;font-size:12px;color:#991B1B;">
                  <span style="flex-shrink:0;margin-top:1px;">⚑</span>
                  <span>${escapeHtml(f)}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}

        </div>
      </div>

      ${viewBlock('Metadata', `Audit ID: ${row.id}\nTimestamp: ${formatDate(row.created_at)}\nSystem Version: ${row.system_version || '—'}`)}
    `;
  }

  /* ── ALLOWED layout ── */
  return `
    
    ${editMode ? editBlock('User Input', 'editRawInput', rawInput) : viewBlock('User Input', rawInput)}

    ${viewBlock('Classification', `Intent: ${capitalize(row.intent)}  |  Industry: ${capitalize(row.industry)}`)}

    ${policyFlags.length ? viewBlock('Policy Flags', policyFlags.map(f => `⚠ ${f}`).join('\n')) : viewBlock('Recommended Tool',
      `${row.recommended_tool || '—'} (${row.tool_confidence || '—'} confidence)\n${row.tool_reason || ''}`
    )}

    ${!policyFlags.length
      ? (editMode
          ? editBlock(`CORLO Prompt (v${row.prompt_version})`, 'editFinalPrompt', finalPrompt, 'log-edit-area-lg')
          : viewBlock(`CORLO Prompt (v${row.prompt_version})`, finalPrompt, 'code'))
      : ''
    }

    ${viewBlock('Metadata', `Audit ID: ${row.id}\nTimestamp: ${formatDate(row.created_at)}\nSystem Version: ${row.system_version || '—'}`)}
  `;
}

function wireEditActions(auditId, row, policyFlags, policies) {
  const body = document.getElementById('logModalBody');
  let editMode = false;

  const rerender = () => {
    body.innerHTML = renderAuditLog(row, policyFlags, policies, editMode);
    attach();
  };

  const attach = () => {
    const btnConfirm = document.getElementById('btnLogConfirm');

    btnConfirm?.addEventListener('click', async () => {
      const newRawInput    = document.getElementById('editRawInput')?.value ?? (row.raw_input || '');
      const newFinalPrompt = document.getElementById('editFinalPrompt')?.value ?? (row.final_prompt || '');
      const newOutput      = document.getElementById('editOutput')?.value ?? (row.output || '');

      const payload = {
        raw_input: newRawInput,
        final_prompt: newFinalPrompt,
        output: newOutput,
      };

      // 1) Save locally (works even without backend changes)
      setLocalAuditEdits(auditId, payload);

      // 2) Try backend PATCH (optional; implement in routes.py)
      try {
        const r = await fetch(`${API.audit}/${auditId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        showToast('Saved successfully.', 'success');
      } catch (e) {
        showToast('Saved locally. Backend edit API not available.', 'info');
      }

      // update UI model + exit edit
      row.raw_input = newRawInput;
      row.final_prompt = newFinalPrompt;
      row.output = newOutput;

      editMode = false;
      rerender();
    });
  };

  attach();
}

function getLocalAuditEdits(auditId) {
  try {
    const all = JSON.parse(localStorage.getItem('audit_edits') || '{}');
    return all[auditId] || {};
  } catch {
    return {};
  }
}

function setLocalAuditEdits(auditId, patch) {
  try {
    const all = JSON.parse(localStorage.getItem('audit_edits') || '{}');
    all[auditId] = { ...(all[auditId] || {}), ...patch };
    localStorage.setItem('audit_edits', JSON.stringify(all));
  } catch {}
}