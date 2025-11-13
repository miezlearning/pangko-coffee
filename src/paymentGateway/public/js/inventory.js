const FALLBACK_INGREDIENTS = ['Biji Kopi', 'Susu', 'Gula Aren', 'Air'];

const state = {
  activeSession: null,
  masterIngredients: [],
  editingIngredient: null
};

function $(id) {
  return document.getElementById(id);
}

async function api(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  };
  if (options.body) {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  try {
    const response = await fetch(`/api/inventory${path}`, config);
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      payload = { success: false, message: 'Respon server tidak valid.' };
    }
    payload = payload || {};
    payload._status = response.status;
    return payload;
  } catch (error) {
    return { success: false, message: error.message || 'Koneksi gagal.' };
  }
}

function formatCurrency(value, digits = 0) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function showInlineStatus(id, message, type = 'info') {
  const el = $(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('text-red-500', 'text-emerald-600', 'text-slate-500');
  if (!message) return;
  if (type === 'error') el.classList.add('text-red-500');
  else if (type === 'success') el.classList.add('text-emerald-600');
  else el.classList.add('text-slate-500');
}

function addIngredientRow(containerId, name = '', qty = '') {
  const container = $(containerId);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:gap-3';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nama bahan';
  nameInput.setAttribute('list', 'ingredientSuggestions');
  nameInput.className = 'ingredient-name w-full flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none';
  nameInput.value = name || '';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.step = '0.01';
  qtyInput.placeholder = '0';
  qtyInput.className = 'ingredient-qty w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none sm:w-32';
  qtyInput.value = qty !== undefined && qty !== null ? qty : '';

  // small unit label (populated from masterIngredients when available)
  const unitSpan = document.createElement('div');
  unitSpan.className = 'ingredient-unit mt-1 text-xs text-slate-500 sm:mt-0 sm:ml-2 sm:w-20 sm:text-right';
  unitSpan.textContent = '';

  function updateUnitLabel() {
    const entered = (nameInput.value || '').trim();
    if (!entered) {
      unitSpan.textContent = '';
      return;
    }
    const found = state.masterIngredients.find(it => (it.name || '').toLowerCase() === entered.toLowerCase());
    if (found && (found.unit || found.nettoUnit)) {
      unitSpan.textContent = found.unit || found.nettoUnit || '';
    } else {
      unitSpan.textContent = '';
    }
  }
  nameInput.addEventListener('input', updateUnitLabel);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100';
  removeBtn.textContent = 'Hapus';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(nameInput);
  row.appendChild(qtyInput);
  row.appendChild(unitSpan);
  row.appendChild(removeBtn);
  container.appendChild(row);

  // set unit initially if name was provided
  if (name) updateUnitLabel();
}

function setIngredientRows(containerId, map = {}, options = {}) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(map || {});
  if (entries.length) {
    entries.forEach(([name, value]) => addIngredientRow(containerId, name, value));
  } else if (options.prefill && options.prefill.length) {
    options.prefill.forEach(name => addIngredientRow(containerId, name, ''));
  } else {
    addIngredientRow(containerId);
  }
}

function collectIngredients(containerId) {
  const container = $(containerId);
  const payload = {};
  if (!container) return payload;
  const nameEls = container.querySelectorAll('.ingredient-name');
  const qtyEls = container.querySelectorAll('.ingredient-qty');
  nameEls.forEach((input, idx) => {
    const name = (input.value || '').trim();
    if (!name) return;
    const qty = parseFloat(qtyEls[idx]?.value || '0');
    payload[name] = Number.isFinite(qty) ? qty : 0;
  });
  return payload;
}

function setFormEnabled(formId, enabled) {
  const form = $(formId);
  if (!form) return;
  form.classList.toggle('opacity-60', !enabled);
  Array.from(form.querySelectorAll('input, button, textarea')).forEach((el) => {
    el.disabled = !enabled;
  });
}

function resetOpeningForm(prefillNames = []) {
  const form = $('openForm');
  if (form) form.reset();
  const names = prefillNames.length ? prefillNames : getDefaultPrefillNames();
  setIngredientRows('openIngredients', {}, { prefill: names });
  showInlineStatus('openResult', '');
}

function resetClosingForm(prefillNames) {
  const form = $('closeForm');
  if (form) form.reset();
  const names = Array.isArray(prefillNames) && prefillNames.length ? prefillNames : getDefaultPrefillNames();
  setIngredientRows('closeIngredients', {}, { prefill: names });
  showInlineStatus('closeResult', '');
}

function populateOpeningForm(session) {
  const form = $('openForm');
  if (!form || !session) return;
  form.cashier.value = session.cashier || '';
  form.openingCash.value = session.openingCash ?? '';
  setIngredientRows('openIngredients', session.openingIngredients || {});
}

function populateClosingForm(session) {
  const form = $('closeForm');
  if (!form || !session) return;
  form.cashier.value = session.closedBy || session.cashier || '';
  form.closingCash.value = session.closingCash ?? '';
  const fallbackNames = Object.keys(session.openingIngredients || {});
  setIngredientRows('closeIngredients', session.closingIngredients || {}, { prefill: fallbackNames });
}

function updateIngredientSuggestions() {
  const datalist = $('ingredientSuggestions');
  if (!datalist) return;
  datalist.innerHTML = '';
  const names = state.masterIngredients.map(item => item.name).sort((a, b) => a.localeCompare(b, 'id'));
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  });
}

function getDefaultPrefillNames() {
  if (state.masterIngredients.length === 0) return FALLBACK_INGREDIENTS;
  return state.masterIngredients.map((item) => item.name);
}

function getContainerNames(containerId) {
  const container = $(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.ingredient-name'))
    .map((input) => (input.value || '').trim())
    .filter(Boolean);
}

function shouldReplaceWithMaster(names) {
  if (!names.length) return true;
  const fallbackSet = new Set(FALLBACK_INGREDIENTS.map((name) => name.toLowerCase()));
  return names.every((name) => fallbackSet.has(name.toLowerCase()));
}

function maybePrefillFromMaster() {
  if (!state.masterIngredients.length || state.activeSession) return;
  const masterNames = getDefaultPrefillNames();
  if (shouldReplaceWithMaster(getContainerNames('openIngredients'))) {
    setIngredientRows('openIngredients', {}, { prefill: masterNames });
  }
  if (shouldReplaceWithMaster(getContainerNames('closeIngredients'))) {
    setIngredientRows('closeIngredients', {}, { prefill: masterNames });
  }
}

async function handleOpenSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const ingredients = collectIngredients('openIngredients');
  if (Object.keys(ingredients).length === 0) {
    showInlineStatus('openResult', 'Isi minimal satu bahan.', 'error');
    return;
  }

  const payload = {
    cashier: (form.cashier.value || '').trim() || 'Kasir',
    openingCash: Number(form.openingCash.value || 0),
    ingredients
  };

  showInlineStatus('openResult', 'Menyimpan opening...');
  const response = await api('/open', { method: 'POST', body: payload });
  if (response.success) {
    showInlineStatus('openResult', `✅ Opening tersimpan (${response.session.id}).`, 'success');
    await refreshState();
  } else {
    showInlineStatus('openResult', `❌ ${response.message || 'Gagal menyimpan opening.'}`, 'error');
  }
}

async function handleCloseSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const ingredients = collectIngredients('closeIngredients');
  if (Object.keys(ingredients).length === 0) {
    showInlineStatus('closeResult', 'Isi minimal satu bahan.', 'error');
    return;
  }

  const payload = {
    cashier: (form.cashier.value || '').trim() || 'Kasir',
    closingCash: Number(form.closingCash.value || 0),
    ingredients
  };

  showInlineStatus('closeResult', 'Menyimpan closing...');
  const response = await api('/close', { method: 'POST', body: payload });
  if (response.success) {
    showInlineStatus('closeResult', `✅ Closing tersimpan (${response.session.id}).`, 'success');
    await refreshState();
    if (!state.activeSession) resetOpeningForm(getDefaultPrefillNames());
    await loadReport();
    await previewRecap();
  } else {
    showInlineStatus('closeResult', `❌ ${response.message || 'Gagal menyimpan closing.'}`, 'error');
  }
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return isoString;
  return date.toLocaleString('id-ID', { hour12: false });
}

async function loadSessionStatus() {
  const notice = $('sessionNotice');
  const openNames = getDefaultPrefillNames();
  const response = await api('/active');
  if (response.success && response.session) {
    state.activeSession = response.session;
    if (notice) {
      const formatEl = $('recapFormat');
      const fmt = formatEl ? (formatEl.value || 'detail') : 'detail';
      if (fmt === 'block') await renderRecapChecklist();
      notice.textContent = `Sesi aktif sejak ${formatDateTime(response.session.openedAt)}. Silakan lengkapi closing.`;
      notice.classList.remove('hidden');
    }
    populateOpeningForm(response.session);
    const openNamesExisting = getContainerNames('openIngredients');
    if (shouldReplaceWithMaster(openNamesExisting)) {
      resetOpeningForm(openNames);
    }
    // lock/open forms appropriately for an active session
    setFormEnabled('openForm', false);
    setFormEnabled('closeForm', true);
    populateClosingForm(response.session);
  } else {
    state.activeSession = null;
    if (notice) {
      notice.textContent = 'Belum ada sesi aktif. Mulai dengan mengisi data opening.';
      notice.classList.remove('hidden');
    }
    setFormEnabled('openForm', true);
    setFormEnabled('closeForm', false);
    resetClosingForm(openNames);
  }
}

async function renderRecapChecklist() {
  const wrap = $('recapChecklist');
  const aiStatus = $('recapAiStatus');
  const aiResult = $('recapAiResult');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (aiStatus) aiStatus.textContent = '';
  if (aiResult) aiResult.textContent = '';

  const reportRes = await api('/report');
  if (!reportRes.success || !reportRes.report) {
    wrap.textContent = 'Belum ada data untuk menandai.';
    return;
  }

  const report = reportRes.report || {};
  const ingredients = Object.keys(report.ingredients || {});
  if (!ingredients.length) {
    wrap.innerHTML = '<div class="text-xs text-slate-500">Belum ada item untuk ditandai.</div>';
    return;
  }

  ingredients.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 py-1';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'recap-mark';
    cb.dataset.name = name;

    const label = document.createElement('label');
    label.className = 'text-sm text-slate-700 flex-1';
    label.textContent = name;

    // show opening/closing numbers if available
    const entry = report.ingredients && report.ingredients[name] ? report.ingredients[name] : null;
    const meta = document.createElement('div');
    meta.className = 'text-xs text-slate-500';
    if (entry) meta.textContent = `O:${entry.opening ?? '-'} • C:${entry.closing ?? '-'} • Digunakan:${entry.used ?? '-'}`;

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(meta);
    wrap.appendChild(row);
  });
}

async function generateAiRecommendations() {
  const status = $('recapAiStatus');
  const result = $('recapAiResult');
  if (status) status.textContent = 'Meminta rekomendasi...';
  const res = await api('/recap/ai', { method: 'POST', body: {} });
  if (res.success) {
    if (result) result.textContent = res.text || '';
    if (status) status.textContent = 'Rekomendasi siap';
    return res.recommended || [];
  } else {
    if (result) result.textContent = res.message || 'Gagal membuat rekomendasi.';
    if (status) status.textContent = '';
    return [];
  }
}

async function applyAiRecommendations() {
  const recs = await generateAiRecommendations();
  if (!recs || !recs.length) return;
  const checkboxes = Array.from(document.querySelectorAll('.recap-mark'));
  checkboxes.forEach(cb => {
    const name = cb.dataset.name || '';
    if (recs.find(r => (r || '').toLowerCase() === name.toLowerCase())) cb.checked = true;
  });
}

async function loadReport() {
  const bodyEl = $('reportBody');
  const statusEl = $('reportStatus');
  const metaEl = $('reportMeta');
  if (!bodyEl || !statusEl || !metaEl) return;

  bodyEl.innerHTML = '';
  statusEl.textContent = 'Memuat laporan...';
  const response = await api('/report');
  if (!response.success || !response.report) {
    statusEl.textContent = response.message ? `ℹ️ ${response.message}` : 'ℹ️ Belum ada data untuk dihitung';
    metaEl.textContent = '';
    return;
  }

  const report = response.report;
  const openedAt = formatDateTime(report.openedAt);
  const closedAt = report.closedAt ? formatDateTime(report.closedAt) : 'Belum closing';
  metaEl.textContent = `Periode: ${openedAt} → ${closedAt} • Selisih Kas: ${formatCurrency(report.cashDifference)}`;

  const entries = Object.entries(report.ingredients || {});
  if (entries.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="px-3 py-2 text-center text-slate-400">Belum ada data bahan</td>';
    bodyEl.appendChild(row);
  } else {
    entries.forEach(([name, item]) => {
      const percent = item.percentRemaining === null || item.percentRemaining === undefined ? '-' : `${item.percentRemaining}%`;
      const master = state.masterIngredients.find(it => (it.name || '').toLowerCase() === (name || '').toLowerCase());
      const unitLabel = master ? (master.unit || master.nettoUnit || '-') : '-';
      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-100';
      tr.innerHTML = `
        <td class="px-3 py-2 font-medium text-slate-700">${name}</td>
        <td class="px-3 py-2 text-slate-600">${unitLabel}</td>
        <td class="px-3 py-2 text-slate-600">${item.opening}</td>
        <td class="px-3 py-2 text-slate-600">${item.closing}</td>
        <td class="px-3 py-2 text-slate-600">${item.used}</td>
        <td class="px-3 py-2 text-slate-600">${percent}</td>
      `;
      bodyEl.appendChild(tr);
    });
  }

  statusEl.textContent = '✅ Laporan berhasil dimuat';
}

async function previewRecap() {
  const status = $('recapStatus');
  const textarea = $('recapText');
  if (!status || !textarea) return;
  status.textContent = 'Membuat preview...';
  const formatEl = $('recapFormat');
  const fmt = formatEl ? (formatEl.value || 'detail') : 'detail';
  const response = await api(`/recap?format=${encodeURIComponent(fmt)}`);
  if (response.success && response.text) {
    textarea.value = response.text;
    status.textContent = '✅ Preview siap dikirim';
  } else {
    status.textContent = `❌ ${response.message || 'Belum ada data untuk rekap.'}`;
  }
}

async function sendRecap() {
  const status = $('recapStatus');
  const textarea = $('recapText');
  if (!status || !textarea) return;
  status.textContent = 'Mengirim ke WhatsApp...';
  const formatEl = $('recapFormat');
  const fmt = formatEl ? (formatEl.value || 'detail') : 'detail';
  let body = {};
  if (fmt === 'block') {
    const checked = Array.from(document.querySelectorAll('.recap-mark:checked')).map(cb => cb.dataset.name).filter(Boolean);
    body.marked = checked;
  }
  const response = await api(`/recap/send?format=${encodeURIComponent(fmt)}`, { method: 'POST', body });
  if (response.success) {
    if (response.text && !textarea.value) textarea.value = response.text;
    status.textContent = `✅ Rekap dikirim ke ${response.sent} penerima`;
  } else {
    status.textContent = `❌ ${response.message || 'Gagal mengirim pesan.'}`;
  }
}

async function copyRecap() {
  const textarea = $('recapText');
  const status = $('recapStatus');
  if (!textarea || !status) return;
  if (!textarea.value) {
    status.textContent = 'ℹ️ Belum ada teks rekap. Klik Preview terlebih dahulu.';
    return;
  }
  try {
    await navigator.clipboard.writeText(textarea.value);
    status.textContent = '✅ Rekap tersalin ke clipboard';
  } catch (error) {
    status.textContent = `❌ ${error.message || 'Gagal menyalin teks'}`;
  }
}

async function resetSessionHandler() {
  if (state.activeSession) {
    const confirmReset = confirm('Buang sesi aktif? Data opening akan hilang.');
    if (!confirmReset) return;
    await api('/active/discard', { method: 'POST', body: {} });
  }
  state.activeSession = null;
  resetOpeningForm(getDefaultPrefillNames());
  resetClosingForm();
  setFormEnabled('openForm', true);
  setFormEnabled('closeForm', false);
  await refreshState();
  await loadReport();
}

async function refreshState() {
  await loadSessionStatus();
}

async function refreshAll() {
  await Promise.all([refreshState(), loadReport(), loadMasterIngredients()]);
}

function computeUnitPrice(item) {
  const nettoValue = Number(item.nettoValue);
  const price = Number(item.buyPrice);
  if (!Number.isFinite(nettoValue) || nettoValue <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return price / nettoValue;
}

function renderMasterTable() {
  const tbody = $('masterTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.masterIngredients.length) {
    const emptyRow = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'px-3 py-4 text-center text-slate-400';
    cell.textContent = 'Belum ada data bahan baku.';
    emptyRow.appendChild(cell);
    tbody.appendChild(emptyRow);
    return;
  }

  state.masterIngredients.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-slate-100 text-sm';

    const nameCell = document.createElement('td');
    nameCell.className = 'px-3 py-2 font-medium text-slate-800';
    nameCell.textContent = item.name;

    const nettoCell = document.createElement('td');
    nettoCell.className = 'px-3 py-2 text-slate-600';
    const nettoValue = Number(item.nettoValue);
    const nettoUnit = item.nettoUnit || item.unit || '-';
    nettoCell.textContent = Number.isFinite(nettoValue) && nettoValue > 0 ? `${formatNumber(nettoValue, 2)} ${nettoUnit}` : '-';

    const buyPriceCell = document.createElement('td');
    buyPriceCell.className = 'px-3 py-2 text-slate-600';
    buyPriceCell.textContent = Number.isFinite(Number(item.buyPrice)) ? formatCurrency(Number(item.buyPrice)) : '-';

    const unitPriceCell = document.createElement('td');
    unitPriceCell.className = 'px-3 py-2 text-slate-600';
    const unitPrice = computeUnitPrice(item);
    const unitLabel = item.unit || item.nettoUnit || '';
    unitPriceCell.textContent = unitPrice !== null ? `${formatCurrency(unitPrice, 2)}${unitLabel ? ` / ${unitLabel}` : ''}` : '-';

    const actionsCell = document.createElement('td');
    actionsCell.className = 'px-3 py-2';
    const actionWrap = document.createElement('div');
    actionWrap.className = 'flex gap-2 text-lg';

    const simulateBtn = document.createElement('button');
    simulateBtn.type = 'button';
    simulateBtn.className = 'rounded px-2 py-1 text-amber-600 hover:bg-amber-50';
    simulateBtn.textContent = '⚗️';
    simulateBtn.title = 'Gunakan di HPP Simulator';
    simulateBtn.dataset.action = 'simulate';
    simulateBtn.dataset.name = item.name;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'rounded px-2 py-1 text-blue-600 hover:bg-blue-50';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit bahan';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.name = item.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'rounded px-2 py-1 text-red-600 hover:bg-red-50';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Hapus bahan';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.dataset.name = item.name;

    actionWrap.appendChild(simulateBtn);
    actionWrap.appendChild(editBtn);
    actionWrap.appendChild(deleteBtn);
    actionsCell.appendChild(actionWrap);

    tr.appendChild(nameCell);
    tr.appendChild(nettoCell);
    tr.appendChild(buyPriceCell);
    tr.appendChild(unitPriceCell);
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

function showMasterStatus(message, type = 'info') {
  const el = $('masterStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('text-red-500', 'text-emerald-600', 'text-slate-500');
  if (!message) return;
  if (type === 'error') el.classList.add('text-red-500');
  else if (type === 'success') el.classList.add('text-emerald-600');
  else el.classList.add('text-slate-500');
}

function populateMasterForm(item) {
  const nameInput = $('masterName');
  const unitInput = $('masterUnit');
  const nettoValueInput = $('masterNettoValue');
  const nettoUnitInput = $('masterNettoUnit');
  const buyPriceInput = $('masterBuyPrice');
  const title = $('masterFormTitle');
  const submitBtn = $('masterSubmit');
  const cancelBtn = $('masterCancelEdit');

  if (!item || !nameInput || !unitInput || !nettoValueInput || !nettoUnitInput || !buyPriceInput) return;

  nameInput.value = item.name || '';
  unitInput.value = item.unit || '';
  nettoValueInput.value = item.nettoValue !== undefined && item.nettoValue !== null ? item.nettoValue : '';
  nettoUnitInput.value = item.nettoUnit || '';
  buyPriceInput.value = item.buyPrice !== undefined && item.buyPrice !== null ? item.buyPrice : '';

  if (title) title.textContent = 'Edit Bahan Baku';
  if (submitBtn) submitBtn.textContent = 'Update Bahan';
  if (cancelBtn) cancelBtn.classList.remove('hidden');
}

function resetMasterForm() {
  const form = $('masterForm');
  if (form) form.reset();
  const title = $('masterFormTitle');
  const submitBtn = $('masterSubmit');
  const cancelBtn = $('masterCancelEdit');
  if (title) title.textContent = 'Tambah Bahan Baku';
  if (submitBtn) submitBtn.textContent = 'Simpan Bahan';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  state.editingIngredient = null;
}

async function loadMasterIngredients() {
  const response = await api('/ingredients');
  if (response.success && response.ingredients) {
    state.masterIngredients = Object.entries(response.ingredients)
      .filter(([name, meta = {}]) => {
        if (!name || typeof name !== 'string') return false;
        if (name.includes('_')) return false;
        if (meta.isMaster === true) return true;
        const hasMeta = meta.buyPrice !== undefined || meta.nettoValue !== undefined;
        const hasUppercase = /[A-Z]/.test(name);
        return hasMeta || hasUppercase;
      })
      .map(([name, meta]) => ({
        name,
        unit: meta.unit || '',
        nettoValue: meta.nettoValue ?? null,
        nettoUnit: meta.nettoUnit || '',
        buyPrice: meta.buyPrice ?? null,
        updatedAt: meta.updatedAt || null
      }));
    renderMasterTable();
    updateIngredientSuggestions();
    maybePrefillFromMaster();
  } else {
    showMasterStatus(response.message || 'Gagal memuat master bahan.', 'error');
  }
}

function handleMasterTableClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const { action, name } = btn.dataset;
  if (!name) return;
  const item = state.masterIngredients.find((entry) => entry.name === name);
  if (!item && action !== 'delete') return;

  if (action === 'simulate') {
    const url = `/tools/hpp-simulator?ingredient=${encodeURIComponent(name)}`;
    window.open(url, '_blank');
  } else if (action === 'edit') {
    state.editingIngredient = name;
    populateMasterForm(item);
    showMasterStatus('Mode edit aktif. Simpan untuk memperbarui atau klik batal.', 'info');
  } else if (action === 'delete') {
    confirmDeleteMaster(name);
  }
}

async function confirmDeleteMaster(name) {
  const ok = confirm(`Hapus bahan "${name}"?`);
  if (!ok) return;
  const response = await api(`/ingredients/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (response.success) {
    showMasterStatus(`✅ Bahan "${name}" dihapus.`, 'success');
    await loadMasterIngredients();
    resetMasterForm();
  } else {
    showMasterStatus(response.message || 'Gagal menghapus bahan.', 'error');
  }
}

async function handleMasterSubmit(event) {
  event.preventDefault();
  const nameInput = $('masterName');
  const unitInput = $('masterUnit');
  const nettoValueInput = $('masterNettoValue');
  const nettoUnitInput = $('masterNettoUnit');
  const buyPriceInput = $('masterBuyPrice');

  if (!nameInput || !unitInput || !nettoValueInput || !nettoUnitInput || !buyPriceInput) return;

  const name = (nameInput.value || '').trim();
  const unit = (unitInput.value || '').trim();
  const nettoValueRaw = nettoValueInput.value;
  const nettoUnit = (nettoUnitInput.value || '').trim();
  const buyPriceRaw = buyPriceInput.value;

  if (!name) {
    showMasterStatus('Nama bahan wajib diisi.', 'error');
    return;
  }

  const payload = {
    name,
    unit,
    nettoValue: nettoValueRaw === '' ? null : Number(nettoValueRaw),
    nettoUnit,
    buyPrice: buyPriceRaw === '' ? null : Number(buyPriceRaw)
  };

  if (payload.nettoValue !== null && !Number.isFinite(payload.nettoValue)) {
    showMasterStatus('Netto harus berupa angka.', 'error');
    return;
  }
  if (payload.buyPrice !== null && !Number.isFinite(payload.buyPrice)) {
    showMasterStatus('Harga beli harus berupa angka.', 'error');
    return;
  }

  if (state.editingIngredient && state.editingIngredient !== name) {
    payload.originalName = state.editingIngredient;
  }

  const response = await api('/ingredients', { method: 'POST', body: payload });
  if (response.success) {
    showMasterStatus('✅ Data bahan tersimpan.', 'success');
    await loadMasterIngredients();
    updateIngredientSuggestions();
    resetMasterForm();
  } else {
    showMasterStatus(response.message || 'Gagal menyimpan data bahan.', 'error');
  }
}

function bindCoreEvents() {
  const openForm = $('openForm');
  if (openForm) openForm.addEventListener('submit', handleOpenSubmit);

  const closeForm = $('closeForm');
  if (closeForm) closeForm.addEventListener('submit', handleCloseSubmit);

  const openAddRow = $('openAddRow');
  if (openAddRow) openAddRow.addEventListener('click', () => addIngredientRow('openIngredients'));

  const closeAddRow = $('closeAddRow');
  if (closeAddRow) closeAddRow.addEventListener('click', () => addIngredientRow('closeIngredients'));

  const copyBtn = $('copyFromOpen');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const ingredients = collectIngredients('openIngredients');
    if (Object.keys(ingredients).length === 0) {
      resetClosingForm();
      return;
    }
    setIngredientRows('closeIngredients', ingredients);
  });

  const refreshBtn = $('refreshData');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAll);

  const resetBtn = $('resetSession');
  if (resetBtn) resetBtn.addEventListener('click', resetSessionHandler);

  const previewBtn = $('previewRecap');
  if (previewBtn) previewBtn.addEventListener('click', previewRecap);

  const copyRecapBtn = $('copyRecap');
  if (copyRecapBtn) copyRecapBtn.addEventListener('click', copyRecap);

  const sendRecapBtn = $('sendRecap');
  if (sendRecapBtn) sendRecapBtn.addEventListener('click', sendRecap);

  const refreshReportBtn = $('refreshReport');
  if (refreshReportBtn) refreshReportBtn.addEventListener('click', loadReport);

  const masterForm = $('masterForm');
  if (masterForm) masterForm.addEventListener('submit', handleMasterSubmit);

  const masterCancel = $('masterCancelEdit');
  if (masterCancel) masterCancel.addEventListener('click', resetMasterForm);

  const masterTable = $('masterTableBody');
  if (masterTable) masterTable.addEventListener('click', handleMasterTableClick);
}

function setupInitialRows() {
  resetOpeningForm(getDefaultPrefillNames());
  resetClosingForm();
  setFormEnabled('closeForm', false);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupInitialRows();
  bindCoreEvents();
  await refreshAll();
  await previewRecap();
});
