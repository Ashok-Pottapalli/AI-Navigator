/* ══════════════════════════════════════════════════════
   fileupload.js — Header dropdown toggle + File Upload modal
══════════════════════════════════════════════════════ */

(function () {

  /* ── Header Dropdown ── */
  const toggleBtn  = document.getElementById('hdrToggleBtn');
  const dropdown   = document.getElementById('hdrDropdown');
  const dropUpload = document.getElementById('dropFileUpload');

  if (toggleBtn && dropdown) {
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') dropdown.classList.remove('open');
    });
  }

  /* ── Open modal from dropdown ── */
  if (dropUpload) {
    dropUpload.addEventListener('click', () => {
      dropdown.classList.remove('open');
      openFuModal();
    });
  }

  /* ── Modal elements ── */
  const fuOverlay   = document.getElementById('fuOverlay');
  const fuModal     = document.getElementById('fuModal');
  const fuCloseBtn  = document.getElementById('fuCloseBtn');
  const fuCancelBtn = document.getElementById('fuCancelBtn');
  const fuDropZone  = document.getElementById('fuDropZone');
  const fuFileInput = document.getElementById('fuFileInput');
  const fuFileInfo  = document.getElementById('fuFileInfo');
  const fuFileName  = document.getElementById('fuFileName');
  const fuClearBtn  = document.getElementById('fuClearBtn');
  const fuUploadBtn = document.getElementById('fuUploadBtn');
  const fuStatus    = document.getElementById('fuStatus');

  let selectedFile = null;

  function openFuModal() {
    fuOverlay.classList.add('open');
    fuModal.classList.add('open');
  }

  function closeFuModal() {
    fuOverlay.classList.remove('open');
    fuModal.classList.remove('open');
    resetModal();
  }

  function resetModal() {
    selectedFile     = null;
    fuFileInput.value = '';
    fuFileInfo.style.display = 'none';
    fuDropZone.style.display = '';
    fuUploadBtn.disabled     = true;
    fuStatus.style.display   = 'none';
    fuStatus.className       = 'fu-status';
    fuStatus.textContent     = '';
  }

  function setFile(file) {
    if (!file || !file.name.endsWith('.xlsx')) {
      showStatus('Please select a valid .xlsx file.', 'error');
      return;
    }
    selectedFile = file;
    fuFileName.textContent       = file.name;
    fuFileInfo.style.display     = 'flex';
    fuDropZone.style.display     = 'none';
    fuUploadBtn.disabled         = false;
    fuStatus.style.display       = 'none';
  }

  function showStatus(msg, type) {
    fuStatus.textContent     = msg;
    fuStatus.className       = `fu-status ${type}`;
    fuStatus.style.display   = 'block';
  }

  /* Close triggers */
  fuCloseBtn?.addEventListener('click',  closeFuModal);
  fuCancelBtn?.addEventListener('click', closeFuModal);
  fuOverlay?.addEventListener('click',   closeFuModal);

  /* Drop zone click → file picker */
  fuDropZone?.addEventListener('click', () => fuFileInput.click());
  fuFileInput?.addEventListener('change', e => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  });

  /* Clear selected file */
  fuClearBtn?.addEventListener('click', () => {
    resetModal();
    fuDropZone.style.display = '';
  });

  /* Drag & drop */
  fuDropZone?.addEventListener('dragover', e => {
    e.preventDefault();
    fuDropZone.classList.add('dragover');
  });
  fuDropZone?.addEventListener('dragleave', () => fuDropZone.classList.remove('dragover'));
  fuDropZone?.addEventListener('drop', e => {
    e.preventDefault();
    fuDropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  /* ── Upload ── */
  fuUploadBtn?.addEventListener('click', async () => {
    if (!selectedFile) return;

    fuUploadBtn.disabled     = true;
    fuUploadBtn.textContent  = 'Uploading…';
    fuStatus.style.display   = 'none';

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res  = await fetch('/api/upload-tools-registry', {
        method: 'POST',
        body:   formData,
      });
      const data = await res.json();

      if (res.ok) {
        showStatus(`✅ ${data.tools_loaded} tools loaded successfully from "${selectedFile.name}".`, 'success');
        fuUploadBtn.textContent = 'Upload & Apply';
        // Refresh tools page if it's currently visible
        if (typeof loadTools === 'function') loadTools();
      // ✅ Auto-close modal after success (let user see message briefly)


        setTimeout(() => {
          closeFuModal(); // this also resets modal
        }, 900);
      } else {


        throw new Error(data.detail || 'Upload failed');
      }
    } catch (err) {
      showStatus(`❌ ${err.message}`, 'error');
      fuUploadBtn.disabled    = false;
      fuUploadBtn.textContent = 'Upload & Apply';
    }
  });

})();

/* ══════════════════════════════════════════════════════
   Policy Upload Modal — triggered from header dropdown
══════════════════════════════════════════════════════ */
(function () {
  const dropPolicyUpload = document.getElementById('dropPolicyUpload');
  const dropdown         = document.getElementById('hdrDropdown');

  const puOverlay   = document.getElementById('puOverlay');
  const puModal     = document.getElementById('puModal');
  const puCloseBtn  = document.getElementById('puCloseBtn');
  const puCancelBtn = document.getElementById('puCancelBtn');
  const puDropZone  = document.getElementById('puDropZone');
  const puFileInput = document.getElementById('puFileInput');
  const puFileInfo  = document.getElementById('puFileInfo');
  const puFileName  = document.getElementById('puFileName');
  const puClearBtn  = document.getElementById('puClearBtn');
  const puUploadBtn = document.getElementById('puUploadBtn');
  const puStatus    = document.getElementById('puStatus');

  let selectedPolicyFile = null;

  function openPuModal() {
    puOverlay.classList.add('open');
    puModal.classList.add('open');
  }

  function closePuModal() {
    puOverlay.classList.remove('open');
    puModal.classList.remove('open');
    resetPuModal();
  }

  function resetPuModal() {
    selectedPolicyFile   = null;
    puFileInput.value    = '';
    puFileInfo.style.display  = 'none';
    puDropZone.style.display  = '';
    puUploadBtn.disabled      = true;
    puStatus.style.display    = 'none';
    puStatus.className        = 'fu-status';
    puStatus.textContent      = '';
  }

  function setPolicyFile(file) {
    const allowed = ['.pdf', '.docx'];
    const ext     = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      showPuStatus('Please select a .pdf or .docx file.', 'error');
      return;
    }
    selectedPolicyFile           = file;
    puFileName.textContent       = file.name;
    puFileInfo.style.display     = 'flex';
    puDropZone.style.display     = 'none';
    puUploadBtn.disabled         = false;
    puStatus.style.display       = 'none';
  }

  function showPuStatus(msg, type) {
    puStatus.textContent   = msg;
    puStatus.className     = `fu-status ${type}`;
    puStatus.style.display = 'block';
  }

  // Open from dropdown
  if (dropPolicyUpload) {
    dropPolicyUpload.addEventListener('click', () => {
      if (dropdown) dropdown.classList.remove('open');
      openPuModal();
    });
  }

  puCloseBtn?.addEventListener('click',  closePuModal);
  puCancelBtn?.addEventListener('click', closePuModal);
  puOverlay?.addEventListener('click',   closePuModal);

  puDropZone?.addEventListener('click', () => puFileInput.click());
  puFileInput?.addEventListener('change', e => {
    if (e.target.files[0]) setPolicyFile(e.target.files[0]);
  });

  puClearBtn?.addEventListener('click', () => {
    resetPuModal();
    puDropZone.style.display = '';
  });

  puDropZone?.addEventListener('dragover', e => {
    e.preventDefault();
    puDropZone.classList.add('dragover');
  });
  puDropZone?.addEventListener('dragleave', () => puDropZone.classList.remove('dragover'));
  puDropZone?.addEventListener('drop', e => {
    e.preventDefault();
    puDropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setPolicyFile(e.dataTransfer.files[0]);
  });

  /* ── Upload ── */
  puUploadBtn?.addEventListener('click', async () => {
    if (!selectedPolicyFile) return;

    puUploadBtn.disabled    = true;
    puUploadBtn.textContent = 'Uploading…';
    puStatus.style.display  = 'none';

    const formData = new FormData();
    formData.append('file', selectedPolicyFile);

    try {
      const res  = await fetch('/api/upload-policy', {
        method: 'POST',
        body:   formData,
      });
      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        showPuStatus(
          `✅ "${data.filename}" indexed successfully (${data.chunks_indexed} chunks).`,
          'success'
        );
        puUploadBtn.textContent = 'Upload & Index';
        // Refresh policies list if on that page
        if (typeof loadPolicies === 'function') loadPolicies();
        if (typeof loadSidebarStats === 'function') loadSidebarStats();
        
        // ✅ Auto-close modal after success
        setTimeout(() => {
          closePuModal(); // this also resets modal
        }, 900);
      } else {
        throw new Error(data.detail || 'Upload failed');
      }
    } catch (err) {
      showPuStatus(`❌ ${err.message}`, 'error');
      puUploadBtn.disabled    = false;
      puUploadBtn.textContent = 'Upload & Index';
    }
  });

})();