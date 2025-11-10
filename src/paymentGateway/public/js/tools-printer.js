'use strict';

const printerToolsState = {
  templates: [],
  active: null,
  selected: null,
  sampleText: 'Memuat preview…',
  // Presets & Custom Text
  headerPreset: 'shop-name',
  footerPreset: 'thank-you',
  customHeaderText: '',
  customFooterText: '',
  customHeaderLines: [],
  // QR Code
  footerQrEnabled: false,
  footerQrContent: '',
  footerQrLabel: '',
  footerQrType: 'qr',
  footerQrLink: '',
  footerQrImageData: '',
  footerQrSize: 2,
  qrPosition: 'after-footer',
  footerQrDefaultValue: '',
  footerQrDefaultLabel: '',
  footerQrCanRender: false,
  // Formatting
  lineSpacing: 'normal',
  showHeaderSeparator: true,
  showFooterSeparator: true,
  // Section visibility
  showOrderId: true,
  showTime: true,
  showCustomer: true,
  showPaymentMethod: true,
  showItemNotes: true,
  showItemAddons: true,
  detailedItemBreakdown: true,
  // Internal
  previewColumns: 32,
  livePreviewTimer: null,
};

let footerQrAutoSaveTimer = null;

function scheduleFooterQrAutoSave({ immediate = false } = {}) {
  if (footerQrAutoSaveTimer) {
    clearTimeout(footerQrAutoSaveTimer);
  }
  const delay = immediate ? 0 : 700;
  footerQrAutoSaveTimer = setTimeout(() => {
    footerQrAutoSaveTimer = null;
    persistFooterQrSettings({ silent: true }).catch((error) => {
      console.error('Auto-save footer QR failed:', error);
    });
  }, delay);
}

// Debounced live preview update
function schedulePreviewUpdate() {
  if (printerToolsState.livePreviewTimer) {
    clearTimeout(printerToolsState.livePreviewTimer);
  }
  printerToolsState.livePreviewTimer = setTimeout(() => {
    const templateId = printerToolsState.selected || printerToolsState.active;
    loadSamplePreview(templateId);
  }, 500); // 500ms delay
}

// Toggle custom container visibility
function toggleCustomContainer(presetValue, containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    if (presetValue === 'custom') {
      container.classList.remove('hidden');
      if (containerId === 'custom-header-container') {
        ensureHeaderLinesRendered();
      }
    } else {
      container.classList.add('hidden');
    }
  }
}

const HEADER_FONT_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'double-height', label: 'Tinggi x2' },
  { value: 'double-width', label: 'Lebar x2' },
  { value: 'double', label: 'Lebar & Tinggi x2' },
];

const HEADER_ALIGN_OPTIONS = [
  { value: 'left', label: 'Rata Kiri' },
  { value: 'center', label: 'Rata Tengah' },
  { value: 'right', label: 'Rata Kanan' },
];

let headerLineIdCounter = 0;

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createHeaderLine({ text = '', font = 'normal', align = 'center' } = {}) {
  headerLineIdCounter += 1;
  const fontOption = HEADER_FONT_OPTIONS.some(option => option.value === font) ? font : 'normal';
  const alignOption = HEADER_ALIGN_OPTIONS.some(option => option.value === align) ? align : 'center';
  return {
    id: `header-line-${Date.now()}-${headerLineIdCounter}`,
    text: String(text ?? ''),
    font: fontOption,
    align: alignOption,
  };
}

function ensureHeaderLines() {
  if (!Array.isArray(printerToolsState.customHeaderLines)) {
    printerToolsState.customHeaderLines = [];
  }
  if (!printerToolsState.customHeaderLines.length) {
    printerToolsState.customHeaderLines.push(createHeaderLine());
  }
}

function syncHeaderTextState() {
  const text = printerToolsState.customHeaderLines.map(line => line.text).join('\n');
  printerToolsState.customHeaderText = text;
  const textarea = document.getElementById('custom-header');
  if (textarea) {
    textarea.value = text;
  }
}

function ensureHeaderLinesRendered() {
  ensureHeaderLines();
  renderHeaderLinesEditor();
}

function renderHeaderLinesEditor() {
  const container = document.getElementById('header-lines-list');
  if (!container) return;
  ensureHeaderLines();

  const canDelete = printerToolsState.customHeaderLines.length > 1;
  container.innerHTML = printerToolsState.customHeaderLines.map((line, index) => {
    const fontOptions = HEADER_FONT_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value === line.font ? 'selected' : ''}>${opt.label}</option>`).join('');
    const alignOptions = HEADER_ALIGN_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value === line.align ? 'selected' : ''}>${opt.label}</option>`).join('');
    return `
      <div class="rounded-2xl border border-charcoal/10 bg-white/90 p-3 shadow-sm" data-header-line="${line.id}">
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal/40">Baris ${index + 1}</span>
          ${canDelete ? `<button data-header-line-remove="${line.id}" type="button" class="text-xs font-semibold text-rose-500 transition hover:text-rose-600">Hapus</button>` : ''}
        </div>
  <input data-header-line-text="${line.id}" type="text" class="mt-3 w-full rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-matcha focus:ring-2 focus:ring-matcha/20" placeholder="Teks header" value="${escapeAttribute(line.text)}" />
        <div class="mt-3 grid grid-cols-2 gap-2">
          <label class="text-xs font-semibold text-charcoal/60">Font
            <select data-header-line-font="${line.id}" class="mt-1 w-full rounded-lg border border-charcoal/15 bg-white px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-charcoal/70 outline-none transition focus:border-matcha focus:ring-2 focus:ring-matcha/20">${fontOptions}</select>
          </label>
          <label class="text-xs font-semibold text-charcoal/60">Posisi
            <select data-header-line-align="${line.id}" class="mt-1 w-full rounded-lg border border-charcoal/15 bg-white px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-charcoal/70 outline-none transition focus:border-matcha focus:ring-2 focus:ring-matcha/20">${alignOptions}</select>
          </label>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('input[data-header-line-text]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const id = event.currentTarget.getAttribute('data-header-line-text');
      const targetLine = printerToolsState.customHeaderLines.find(line => line.id === id);
      if (!targetLine) return;
      targetLine.text = event.currentTarget.value;
      syncHeaderTextState();
      schedulePreviewUpdate();
    });
  });

  container.querySelectorAll('select[data-header-line-font]').forEach((select) => {
    select.addEventListener('change', (event) => {
      const id = event.currentTarget.getAttribute('data-header-line-font');
      const targetLine = printerToolsState.customHeaderLines.find(line => line.id === id);
      if (!targetLine) return;
      targetLine.font = event.currentTarget.value;
      schedulePreviewUpdate();
    });
  });

  container.querySelectorAll('select[data-header-line-align]').forEach((select) => {
    select.addEventListener('change', (event) => {
      const id = event.currentTarget.getAttribute('data-header-line-align');
      const targetLine = printerToolsState.customHeaderLines.find(line => line.id === id);
      if (!targetLine) return;
      targetLine.align = event.currentTarget.value;
      schedulePreviewUpdate();
    });
  });

  container.querySelectorAll('button[data-header-line-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-header-line-remove');
      printerToolsState.customHeaderLines = printerToolsState.customHeaderLines.filter(line => line.id !== id);
      ensureHeaderLines();
      renderHeaderLinesEditor();
      syncHeaderTextState();
      schedulePreviewUpdate();
    });
  });

  syncHeaderTextState();
}

function getHeaderLinesPayload() {
  return printerToolsState.customHeaderLines
    .map((line) => ({
      text: String(line.text || '').trim(),
      font: line.font,
      align: line.align,
    }))
    .filter((line) => line.text.length > 0);
}

function setQrPanelInteractivity(enabled) {
  const panel = document.getElementById('qr-config-panel');
  if (!panel) return;
  panel.classList.toggle('pointer-events-none', !enabled);
  panel.classList.toggle('opacity-50', !enabled);
}

function updateQrInputVisibility() {
  const type = printerToolsState.footerQrType || 'qr';
  const sections = {
    qr: document.getElementById('qr-input-qr'),
    link: document.getElementById('qr-input-link'),
    image: document.getElementById('qr-input-image')
  };
  Object.entries(sections).forEach(([key, section]) => {
    if (!section) return;
    if (key === type) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  });
}

function updateQrSizeDisplay() {
  const display = document.getElementById('footer-qr-size-display');
  if (display) {
    display.textContent = printerToolsState.footerQrSize || 2;
  }
}

function updateQrDefaultBadges() {
  const labelBadge = document.getElementById('footer-qr-default-label');
  if (labelBadge) {
    labelBadge.textContent = printerToolsState.footerQrDefaultLabel || 'Scan QR';
  }
  const valueBadge = document.getElementById('footer-qr-default');
  if (valueBadge) {
    valueBadge.textContent = printerToolsState.footerQrDefaultValue || '—';
  }
}

function showPrinterToast(message, type = 'info') {
  const toast = document.getElementById('printer-toast');
  const text = document.getElementById('printer-toast-text');
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.remove('border-rose-300', 'text-rose-700');
  toast.classList.remove('border-matcha/40', 'text-matcha');
  if (type === 'error') {
    toast.classList.add('border-rose-300', 'text-rose-700');
  } else if (type === 'success') {
    toast.classList.add('border-matcha/40', 'text-matcha');
  }

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}

function getTemplateLabel(id) {
  const template = printerToolsState.templates.find(t => t.id === id);
  if (!template) {
    return id === '80mm' ? '80mm (48 kolom)' : '55-58mm (32 kolom)';
  }
  return `${template.label} (${template.width} kolom)`;
}

function updateTemplateBadges() {
  const label = getTemplateLabel(printerToolsState.active || printerToolsState.selected);
  document.querySelectorAll('[data-current-template-label]').forEach(el => {
    el.textContent = label;
  });
}

function renderTemplateCards() {
  const container = document.getElementById('template-cards');
  if (!container) return;

  if (!printerToolsState.templates.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed border-charcoal/20 bg-charcoal/5 p-6 text-sm text-charcoal/60">
        Belum ada template tersedia. Coba tekan tombol refresh.
      </div>
    `;
    return;
  }

  const cards = printerToolsState.templates.map(template => {
    const isActive = template.id === printerToolsState.active;
    const isSelected = template.id === printerToolsState.selected;
    const borderClass = isSelected ? 'border-matcha bg-matcha/5 shadow-[0_25px_50px_-40px_rgba(116,166,98,0.55)]' : 'border-charcoal/10 bg-white';
    const badge = isActive
      ? '<span class="rounded-full bg-matcha/15 px-3 py-1 text-xs font-semibold text-matcha">Aktif</span>'
      : '<span class="rounded-full bg-charcoal/10 px-3 py-1 text-xs font-semibold text-charcoal/60">Tersedia</span>';
    const selectLabel = isSelected ? 'Dipilih' : 'Pilih Template';

    return `
      <div class="rounded-2xl border ${borderClass} p-5 transition">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold text-charcoal">${template.label}</h3>
            <p class="mt-1 text-sm text-charcoal/65">${template.description}</p>
            <p class="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal/40">Lebar ${template.width} kolom</p>
          </div>
          ${badge}
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button data-action="select" data-template="${template.id}" class="inline-flex items-center gap-2 rounded-full border border-charcoal/15 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition hover:bg-charcoal/5" type="button">
            ${isSelected ? '✅' : '🎯'} ${selectLabel}
          </button>
          ${isActive ? '' : `<button data-action="activate" data-template="${template.id}" class="inline-flex items-center gap-2 rounded-full bg-matcha px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" type="button">⚡ Aktifkan Cepat</button>`}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cards;

  container.querySelectorAll('button[data-action="select"]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-template');
      printerToolsState.selected = id;
      const templateMeta = printerToolsState.templates.find(t => t.id === id);
      if (templateMeta && Number.isFinite(Number(templateMeta.width))) {
        printerToolsState.previewColumns = Number(templateMeta.width);
        applyPreviewWidth();
      }
      updateTemplateBadges();
      renderTemplateCards();
      loadSamplePreview(id);
    });
  });

  container.querySelectorAll('button[data-action="activate"]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      const id = event.currentTarget.getAttribute('data-template');
      printerToolsState.selected = id;
      const templateMeta = printerToolsState.templates.find(t => t.id === id);
      if (templateMeta && Number.isFinite(Number(templateMeta.width))) {
        printerToolsState.previewColumns = Number(templateMeta.width);
        applyPreviewWidth();
      }
      await persistTemplateSelection(id);
    });
  });
}

function renderFooterQrForm() {
  const toggle = document.getElementById('footer-qr-enabled');
  if (toggle) {
    toggle.checked = !!printerToolsState.footerQrEnabled;
  }

  // Toggle panel visibility based on enabled state
  const panel = document.getElementById('qr-config-panel');
  if (panel) {
    if (printerToolsState.footerQrEnabled) {
      panel.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      panel.classList.add('opacity-50', 'pointer-events-none');
    }
  }

  // Populate inputs
  const contentInput = document.getElementById('footer-qr-content');
  if (contentInput) {
    contentInput.value = printerToolsState.footerQrContent || '';
  }

  const labelInput = document.getElementById('footer-qr-label');
  if (labelInput) {
    labelInput.value = printerToolsState.footerQrLabel || '';
  }
  
  const positionSelect = document.getElementById('qr-position');
  if (positionSelect) {
    positionSelect.value = printerToolsState.qrPosition || 'after-footer';
  }

  const defaultLabelBadge = document.getElementById('footer-qr-default-label');
  if (defaultLabelBadge) {
    defaultLabelBadge.textContent = printerToolsState.footerQrDefaultLabel || '';
  }

  const defaultValueBadge = document.getElementById('footer-qr-default');
  if (defaultValueBadge) {
    defaultValueBadge.textContent = printerToolsState.footerQrDefault || '—';
  }

  // Show image preview if image data exists
  if (printerToolsState.footerQrImageData && printerToolsState.footerQrType === 'image') {
    const preview = document.getElementById('qr-image-preview');
    const img = document.getElementById('qr-image-preview-img');
    const name = document.getElementById('qr-image-preview-name');
    const size = document.getElementById('qr-image-preview-size');
    
    if (preview) preview.classList.remove('hidden');
    if (img) img.src = printerToolsState.footerQrImageData;
    if (name) name.textContent = printerToolsState.footerQrImageName || 'Gambar QR';
    if (size) {
      const bytes = Math.round((printerToolsState.footerQrImageData.length * 3) / 4);
      size.textContent = `${(bytes / 1024).toFixed(1)} KB`;
    }
  }

  updateQrStatusBadge();
}

function updateQrStatusBadge() {
  const badge = document.getElementById('footer-qr-status-badge');
  if (!badge) return;
  
  const enabled = !!printerToolsState.footerQrEnabled;
  const canRender = !!printerToolsState.footerQrCanRender;

  badge.classList.remove('bg-charcoal/10', 'text-charcoal/60', 'bg-matcha/15', 'text-matcha', 'bg-amber-100', 'text-amber-700');

  if (enabled && canRender) {
    badge.textContent = 'Aktif';
    badge.classList.add('bg-matcha/15', 'text-matcha');
  } else if (enabled && !canRender) {
    badge.textContent = 'Perlu konten';
    badge.classList.add('bg-amber-100', 'text-amber-700');
  } else {
    badge.textContent = 'Nonaktif';
    badge.classList.add('bg-charcoal/10', 'text-charcoal/60');
  }
}

function applyPreviewWidth() {
  const columns = Math.max(24, Number(printerToolsState.previewColumns || 32));
  const widthCh = columns + 4;
  const sample = document.getElementById('sample-preview');
  if (sample) {
    sample.style.width = `${widthCh}ch`;
    sample.style.minWidth = `${widthCh}ch`;
  }
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/printer/templates');
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Template tidak dapat dimuat');
    }
    printerToolsState.templates = Array.isArray(data.templates) ? data.templates : [];
    const fallback = printerToolsState.templates[0]?.id || '58mm';
    printerToolsState.active = data.active || fallback;
    printerToolsState.selected = printerToolsState.active;
    const activeTemplate = printerToolsState.templates.find(t => t.id === printerToolsState.selected);
    if (activeTemplate && Number.isFinite(Number(activeTemplate.width))) {
      printerToolsState.previewColumns = Number(activeTemplate.width);
      applyPreviewWidth();
    }
    updateTemplateBadges();
    renderTemplateCards();
    loadSamplePreview(printerToolsState.selected);
  } catch (error) {
    console.error('Failed to load templates:', error);
    showPrinterToast('Gagal memuat template struk', 'error');
  }
}

async function loadSamplePreview(templateId) {
  const preview = document.getElementById('sample-preview');
  const htmlPreview = document.getElementById('sample-preview-html');
  const qrContainer = document.getElementById('footer-qr-preview-container');
  const qrImage = document.getElementById('footer-qr-preview-image');
  const qrLabelEl = document.getElementById('footer-qr-preview-label');

  if (preview) {
    preview.textContent = 'Memuat preview…';
    applyPreviewWidth();
  }
  if (htmlPreview) {
    htmlPreview.innerHTML = '';
    htmlPreview.classList.add('hidden');
  }
  if (qrContainer) qrContainer.classList.add('hidden');
  if (qrImage) qrImage.src = '';

  try {
    const id = templateId || printerToolsState.active || '58mm';
    
    // Construct the query parameters from the current state
    const qrType = printerToolsState.footerQrType || 'qr';
    let qrContent = '';
    if (qrType === 'link') {
      qrContent = document.getElementById('footer-qr-link')?.value?.trim() || printerToolsState.footerQrLink || '';
    } else if (qrType === 'image') {
      qrContent = printerToolsState.footerQrImageData || '';
    } else {
      qrContent = document.getElementById('footer-qr-content')?.value?.trim() || printerToolsState.footerQrContent || '';
    }
  printerToolsState.footerQrContent = qrType === 'qr' ? qrContent : printerToolsState.footerQrContent;
  printerToolsState.footerQrLink = qrType === 'link' ? qrContent : printerToolsState.footerQrLink;
  const qrLabel = document.getElementById('footer-qr-label')?.value || printerToolsState.footerQrLabel || '';
  printerToolsState.footerQrLabel = qrLabel;

    const params = new URLSearchParams({
      template: id,
      headerPreset: printerToolsState.headerPreset,
      footerPreset: printerToolsState.footerPreset,
  customHeaderText: printerToolsState.customHeaderText || '',
      customFooterText: document.getElementById('custom-footer')?.value || '',
      lineSpacing: printerToolsState.lineSpacing,
      qrPosition: printerToolsState.qrPosition,
      // Section visibility
      showHeaderSeparator: printerToolsState.showHeaderSeparator,
      showFooterSeparator: printerToolsState.showFooterSeparator,
      showOrderId: printerToolsState.showOrderId,
      showTime: printerToolsState.showTime,
      showCustomer: printerToolsState.showCustomer,
      showPaymentMethod: printerToolsState.showPaymentMethod,
      showItemNotes: printerToolsState.showItemNotes,
      showItemAddons: printerToolsState.showItemAddons,
      detailedItemBreakdown: printerToolsState.detailedItemBreakdown,
      // QR settings for live preview
      footerQrEnabled: printerToolsState.footerQrEnabled,
      footerQrType: qrType,
      footerQrContent: qrContent,
      footerQrLabel: qrLabel,
      footerQrSize: printerToolsState.footerQrSize,
    });

    const headerLinesPayload = getHeaderLinesPayload();
    params.set('customHeaderLines', JSON.stringify(headerLinesPayload));

    const res = await fetch(`/api/printer/sample-preview?${params.toString()}`);
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Preview gagal dimuat');
    }
    printerToolsState.sampleText = data.text;
    const width = Number(data.width);
    if (Number.isFinite(width) && width > 0) {
      printerToolsState.previewColumns = width;
    }
    applyPreviewWidth();
    if (preview) {
      preview.textContent = data.text;
    }

    if (htmlPreview) {
      if (data.html) {
        htmlPreview.innerHTML = data.html;
        htmlPreview.classList.remove('hidden');
      } else {
        htmlPreview.innerHTML = '';
        htmlPreview.classList.add('hidden');
      }
    }

    const textWrapper = document.getElementById('sample-preview-text-wrapper');
    if (textWrapper) {
      textWrapper.open = !data.html;
    }

    const qrEnabled = data.footerQrEnabled ?? printerToolsState.footerQrEnabled;
    const qrCanRender = data.footerQrCanRender ?? printerToolsState.footerQrCanRender ?? qrEnabled;
    printerToolsState.footerQrEnabled = qrEnabled;
    printerToolsState.footerQrCanRender = qrCanRender;
    const qrLabelText = data.footerQrLabel || printerToolsState.footerQrLabel || printerToolsState.footerQrDefaultLabel || 'Scan QR';

    if (qrContainer) {
      if (!data.html && qrEnabled && qrCanRender && data.footerQrBase64) {
        if (qrImage) qrImage.src = data.footerQrBase64;
        if (qrLabelEl) qrLabelEl.textContent = qrLabelText;
        qrContainer.classList.remove('hidden');
      } else {
        if (qrImage) qrImage.src = '';
        qrContainer.classList.add('hidden');
      }
    }
    
    updateQrStatusBadge();
  } catch (error) {
    console.error('Failed to load sample preview:', error);
    updateQrStatusBadge();
    applyPreviewWidth();
    if (preview) {
      preview.textContent = 'Preview tidak tersedia.';
    }
    if (htmlPreview) {
      htmlPreview.innerHTML = '';
      htmlPreview.classList.add('hidden');
    }
    const textWrapper = document.getElementById('sample-preview-text-wrapper');
    if (textWrapper) {
      textWrapper.open = true;
    }
  }
}

async function loadFooterQrSettings() {
  try {
    const res = await fetch('/api/printer/footer-qr');
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Gagal memuat QR footer');
    }
    printerToolsState.footerQrEnabled = !!data.enabled;
    printerToolsState.footerQrContent = data.value || '';
    printerToolsState.footerQrLabel = data.label || '';
    printerToolsState.footerQrType = data.type || 'qr';
    printerToolsState.footerQrLink = data.type === 'link' ? (data.value || '') : '';
    printerToolsState.footerQrImageData = data.type === 'image' ? (data.imageData || '') : '';
    printerToolsState.footerQrSize = Number.isFinite(Number(data.cellSize)) ? Number(data.cellSize) : 2;
    printerToolsState.qrPosition = data.position || 'after-footer';
    printerToolsState.footerQrDefaultValue = data.defaultValue || '';
    printerToolsState.footerQrDefaultLabel = data.defaultLabel || 'Scan QR';
    printerToolsState.footerQrCanRender = data.canRender !== undefined
      ? !!data.canRender
      : (printerToolsState.footerQrEnabled && (!!printerToolsState.footerQrContent || !!printerToolsState.footerQrImageData));

    const toggle = document.getElementById('footer-qr-enabled');
    if (toggle) toggle.checked = printerToolsState.footerQrEnabled;
    setQrPanelInteractivity(printerToolsState.footerQrEnabled);

    const contentInput = document.getElementById('footer-qr-content');
    if (contentInput) contentInput.value = printerToolsState.footerQrContent;

    const linkInput = document.getElementById('footer-qr-link');
    if (linkInput) linkInput.value = printerToolsState.footerQrLink;

    const labelInput = document.getElementById('footer-qr-label');
    if (labelInput) labelInput.value = printerToolsState.footerQrLabel;

    const sizeInput = document.getElementById('footer-qr-size');
    if (sizeInput) {
      sizeInput.value = printerToolsState.footerQrSize;
    }
    updateQrSizeDisplay();

    const positionSelect = document.getElementById('qr-position');
    if (positionSelect) positionSelect.value = printerToolsState.qrPosition;

    document.querySelectorAll('input[name="qr-type"]').forEach((input) => {
      input.checked = input.value === printerToolsState.footerQrType;
    });
    updateQrInputVisibility();
    updateQrDefaultBadges();
    updateQrStatusBadge();

    await loadSamplePreview(printerToolsState.selected || printerToolsState.active);
  } catch (error) {
    console.error('Failed to load footer QR settings:', error);
    showPrinterToast('Gagal memuat pengaturan QR footer', 'error');
  }
}

async function persistTemplateSelection(templateId) {
  if (!templateId) {
    showPrinterToast('Pilih template terlebih dahulu', 'error');
    return;
  }
  try {
    const res = await fetch('/api/printer/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiptTemplate: templateId })
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Tidak dapat menyimpan template');
    }
    printerToolsState.active = data.receiptTemplate || templateId;
    printerToolsState.selected = printerToolsState.active;
    updateTemplateBadges();
    renderTemplateCards();
    loadSamplePreview(printerToolsState.active);
    showPrinterToast(`Template aktif: ${getTemplateLabel(printerToolsState.active)}`, 'success');
  } catch (error) {
    console.error('Failed to persist template:', error);
    showPrinterToast(error.message || 'Gagal menyimpan template', 'error');
  }
}

async function testPrintSample() {
  try {
    const templateId = printerToolsState.selected || printerToolsState.active;
    const res = await fetch('/api/printer/print-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateId })
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Test print gagal');
    }
    showPrinterToast('Test print dikirim ke printer', 'success');
  } catch (error) {
    console.error('Failed to run test print:', error);
    showPrinterToast(error.message || 'Tidak bisa test print', 'error');
  }
}

async function openDrawerManual() {
  try {
    const res = await fetch('/api/printer/open-drawer', { method: 'POST' });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Laci gagal dibuka');
    }
    showPrinterToast('Laci kasir dibuka', 'success');
  } catch (error) {
    console.error('Failed to open drawer:', error);
    showPrinterToast(error.message || 'Tidak bisa membuka laci', 'error');
  }
}

function bindPrinterToolEvents() {
  const refreshBtn = document.getElementById('refresh-templates');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadTemplates);
  }
  const activateBtn = document.getElementById('activate-selected');
  if (activateBtn) {
    activateBtn.addEventListener('click', () => persistTemplateSelection(printerToolsState.selected));
  }
  const testPrintBtn = document.getElementById('test-print');
  if (testPrintBtn) {
    testPrintBtn.addEventListener('click', testPrintSample);
  }
  const drawerBtn = document.getElementById('open-drawer');
  if (drawerBtn) {
    drawerBtn.addEventListener('click', openDrawerManual);
  }
  const copyBtn = document.getElementById('copy-preview');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!navigator.clipboard) {
        showPrinterToast('Clipboard tidak tersedia di browser ini', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(printerToolsState.sampleText || '');
        showPrinterToast('Preview disalin ke clipboard', 'success');
      } catch (error) {
        showPrinterToast('Clipboard tidak tersedia di browser ini', 'error');
      }
    });
  }

  const saveCustomBtn = document.getElementById('save-custom-text');
  if (saveCustomBtn) {
    saveCustomBtn.addEventListener('click', saveCustomText);
  }
  const resetCustomBtn = document.getElementById('reset-custom-text');
  if (resetCustomBtn) {
    resetCustomBtn.addEventListener('click', async () => {
      if (confirm('Anda yakin ingin mengembalikan semua pengaturan kustomisasi ke default?')) {
        await resetCustomTextToDefault();
        showPrinterToast('Pengaturan dikembalikan ke default', 'success');
      }
    });
  }
  
  // Function to toggle custom text area visibility is defined globally above
  
  // Live preview for presets
  const headerPreset = document.getElementById('header-preset');
  if (headerPreset) {
    headerPreset.addEventListener('change', (e) => {
      printerToolsState.headerPreset = e.target.value;
      toggleCustomContainer(e.target.value, 'custom-header-container');
      if (e.target.value === 'custom') {
        ensureHeaderLinesRendered();
      }
      schedulePreviewUpdate();
    });
  }
  const footerPreset = document.getElementById('footer-preset');
  if (footerPreset) {
    footerPreset.addEventListener('change', (e) => {
      printerToolsState.footerPreset = e.target.value;
      toggleCustomContainer(e.target.value, 'custom-footer-container');
      schedulePreviewUpdate();
    });
  }
  
  // Live preview for custom text areas
  const customHeader = document.getElementById('custom-header');
  if (customHeader) {
    customHeader.addEventListener('input', (e) => {
      printerToolsState.customHeaderText = e.target.value;
      const lines = String(e.target.value || '')
        .split(/\r?\n/)
        .map((text, idx) => {
          const existing = printerToolsState.customHeaderLines[idx];
          return createHeaderLine({
            text,
            font: existing?.font || 'normal',
            align: existing?.align || 'center',
          });
        });
      printerToolsState.customHeaderLines = lines.length ? lines : [createHeaderLine()];
      renderHeaderLinesEditor();
      schedulePreviewUpdate();
    });
  }
  const customFooter = document.getElementById('custom-footer');
  if (customFooter) {
    customFooter.addEventListener('input', (e) => {
      printerToolsState.customFooterText = e.target.value;
      schedulePreviewUpdate();
    });
  }
  
  // Advanced formatting controls with live preview
  const lineSpacing = document.getElementById('line-spacing');
  if (lineSpacing) {
    lineSpacing.addEventListener('change', (e) => {
      printerToolsState.lineSpacing = e.target.value;
      schedulePreviewUpdate();
    });
  }
  
  const showHeaderSeparator = document.getElementById('show-header-separator');
  if (showHeaderSeparator) {
    showHeaderSeparator.addEventListener('change', (e) => {
      printerToolsState.showHeaderSeparator = e.target.checked;
      schedulePreviewUpdate();
    });
  }
  
  const showFooterSeparator = document.getElementById('show-footer-separator');
  if (showFooterSeparator) {
    showFooterSeparator.addEventListener('change', (e) => {
      printerToolsState.showFooterSeparator = e.target.checked;
      schedulePreviewUpdate();
    });
  }

  const mapToggle = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      printerToolsState[key] = !!e.target.checked;
      schedulePreviewUpdate();
    });
  };
  mapToggle('show-order-id', 'showOrderId');
  mapToggle('show-time', 'showTime');
  mapToggle('show-customer', 'showCustomer');
  mapToggle('show-payment-method', 'showPaymentMethod');
  mapToggle('show-item-notes', 'showItemNotes');
  mapToggle('show-item-addons', 'showItemAddons');
  mapToggle('detailed-item-breakdown', 'detailedItemBreakdown');
  
  const footerQrToggle = document.getElementById('footer-qr-enabled');
  if (footerQrToggle) {
    footerQrToggle.addEventListener('change', (event) => {
      printerToolsState.footerQrEnabled = !!event.target.checked;
      printerToolsState.footerQrCanRender = printerToolsState.footerQrEnabled
        ? printerToolsState.footerQrCanRender
        : false;
      setQrPanelInteractivity(printerToolsState.footerQrEnabled);
      updateQrStatusBadge();
      schedulePreviewUpdate(); // Live preview
      scheduleFooterQrAutoSave({ immediate: true });
    });
  }

  const qrTypeInputs = document.querySelectorAll('input[name="qr-type"]');
  if (qrTypeInputs.length) {
    qrTypeInputs.forEach((input) => {
      input.addEventListener('change', (event) => {
        if (!event.target.checked) return;
        printerToolsState.footerQrType = event.target.value;
        updateQrInputVisibility();
        schedulePreviewUpdate();
        scheduleFooterQrAutoSave();
      });
    });
  }

  // Live preview for QR content and label
  const qrContentInput = document.getElementById('footer-qr-content');
  if (qrContentInput) {
    qrContentInput.addEventListener('input', (e) => {
      printerToolsState.footerQrContent = e.target.value;
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave();
    });
  }
  const qrLabelInput = document.getElementById('footer-qr-label');
  if (qrLabelInput) {
    qrLabelInput.addEventListener('input', (e) => {
      printerToolsState.footerQrLabel = e.target.value;
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave();
    });
  }

  const qrLinkInput = document.getElementById('footer-qr-link');
  if (qrLinkInput) {
    qrLinkInput.addEventListener('input', (e) => {
      printerToolsState.footerQrLink = e.target.value;
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave();
    });
  }

  const qrSizeInput = document.getElementById('footer-qr-size');
  if (qrSizeInput) {
    qrSizeInput.addEventListener('input', (e) => {
      const rawValue = Number(e.target.value);
      printerToolsState.footerQrSize = Number.isFinite(rawValue) ? rawValue : 2;
      updateQrSizeDisplay();
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave();
    });
  }

  const qrPositionSelect = document.getElementById('qr-position');
  if (qrPositionSelect) {
    qrPositionSelect.addEventListener('change', (e) => {
      printerToolsState.qrPosition = e.target.value;
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave();
    });
  }

  const useDefaultQrBtn = document.getElementById('use-default-footer-qr');
  if (useDefaultQrBtn) {
    useDefaultQrBtn.addEventListener('click', () => {
      const value = printerToolsState.footerQrDefaultValue || '';
      const contentArea = document.getElementById('footer-qr-content');
      if (contentArea && value) {
        contentArea.value = value;
        printerToolsState.footerQrContent = value;
        schedulePreviewUpdate();
        scheduleFooterQrAutoSave({ immediate: true });
        showPrinterToast('Menggunakan QR default dari pengaturan toko', 'info');
      } else {
        showPrinterToast('Tidak ada QR default tersedia', 'error');
      }
    });
  }

  const clearQrBtn = document.getElementById('clear-footer-qr');
  if (clearQrBtn) {
    clearQrBtn.addEventListener('click', () => {
      printerToolsState.footerQrContent = '';
      printerToolsState.footerQrLink = '';
      printerToolsState.footerQrLabel = '';
      const contentArea = document.getElementById('footer-qr-content');
      if (contentArea) contentArea.value = '';
      const linkArea = document.getElementById('footer-qr-link');
      if (linkArea) linkArea.value = '';
      const labelInputEl = document.getElementById('footer-qr-label');
      if (labelInputEl) labelInputEl.value = '';
      schedulePreviewUpdate();
      scheduleFooterQrAutoSave({ immediate: true });
      showPrinterToast('QR footer dibersihkan', 'info');
    });
  }
  
  // Save QR settings button
  const saveQrBtn = document.getElementById('save-footer-qr');
  if (saveQrBtn) {
    saveQrBtn.addEventListener('click', saveFooterQrSettings);
  }

  const addHeaderLineBtn = document.getElementById('add-header-line');
  if (addHeaderLineBtn) {
    addHeaderLineBtn.addEventListener('click', () => {
      printerToolsState.customHeaderLines.push(createHeaderLine());
      renderHeaderLinesEditor();
      schedulePreviewUpdate();
    });
  }

  updateQrInputVisibility();
  updateQrSizeDisplay();
  updateQrDefaultBadges();
  setQrPanelInteractivity(printerToolsState.footerQrEnabled);
}

window.addEventListener('DOMContentLoaded', () => {
  bindPrinterToolEvents();
  loadTemplates();
  loadCustomText();
  loadFooterQrSettings();
  // Load custom template state last to update toggle and textarea
  loadFullCustomTemplate();
});

async function loadCustomText() {
  try {
    const res = await fetch('/api/printer/custom-text');
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message || 'Gagal memuat custom text');
    
    printerToolsState.headerPreset = data.headerPreset || 'shop-name';
    printerToolsState.footerPreset = data.footerPreset || 'thank-you';
    printerToolsState.customHeaderText = data.customHeaderText || '';
    printerToolsState.customFooterText = data.customFooterText || '';
    const incomingHeaderLines = Array.isArray(data.customHeaderLines) ? data.customHeaderLines : [];
    if (incomingHeaderLines.length) {
      printerToolsState.customHeaderLines = incomingHeaderLines.map((line) => createHeaderLine({
        text: line?.text || '',
        font: line?.font || 'normal',
        align: line?.align || 'center',
      }));
    } else if (printerToolsState.customHeaderText) {
      printerToolsState.customHeaderLines = String(printerToolsState.customHeaderText)
        .split(/\r?\n/)
        .map(str => createHeaderLine({ text: str }))
        .filter(Boolean);
    } else {
      printerToolsState.customHeaderLines = [createHeaderLine()];
    }
    syncHeaderTextState();
    renderHeaderLinesEditor();
    printerToolsState.lineSpacing = data.lineSpacing || 'normal';
    printerToolsState.showHeaderSeparator = data.showHeaderSeparator !== false;
    printerToolsState.showFooterSeparator = data.showFooterSeparator !== false;
    printerToolsState.showOrderId = data.showOrderId !== false;
    printerToolsState.showTime = data.showTime !== false;
    printerToolsState.showCustomer = data.showCustomer !== false;
    printerToolsState.showPaymentMethod = data.showPaymentMethod !== false;
    printerToolsState.showItemNotes = data.showItemNotes !== false;
    printerToolsState.showItemAddons = data.showItemAddons !== false;
    printerToolsState.detailedItemBreakdown = data.detailedItemBreakdown !== false;
    
    const headerPresetEl = document.getElementById('header-preset');
    if (headerPresetEl) headerPresetEl.value = printerToolsState.headerPreset;
    toggleCustomContainer(printerToolsState.headerPreset, 'custom-header-container');
    
    const footerPresetEl = document.getElementById('footer-preset');
    if (footerPresetEl) footerPresetEl.value = printerToolsState.footerPreset;
    toggleCustomContainer(printerToolsState.footerPreset, 'custom-footer-container');

    const customHeaderEl = document.getElementById('custom-header');
    if (customHeaderEl) customHeaderEl.value = printerToolsState.customHeaderText;

    const customFooterEl = document.getElementById('custom-footer');
    if (customFooterEl) customFooterEl.value = printerToolsState.customFooterText;
    
    const lineSpacingEl = document.getElementById('line-spacing');
    if (lineSpacingEl) lineSpacingEl.value = printerToolsState.lineSpacing;
    
    const showHeaderSepEl = document.getElementById('show-header-separator');
    if (showHeaderSepEl) showHeaderSepEl.checked = printerToolsState.showHeaderSeparator;
    
    const showFooterSepEl = document.getElementById('show-footer-separator');
    if (showFooterSepEl) showFooterSepEl.checked = printerToolsState.showFooterSeparator;

    const setToggle = (id, value) => { const el = document.getElementById(id); if (el) el.checked = !!value; };
    setToggle('show-order-id', printerToolsState.showOrderId);
    setToggle('show-time', printerToolsState.showTime);
    setToggle('show-customer', printerToolsState.showCustomer);
    setToggle('show-payment-method', printerToolsState.showPaymentMethod);
    setToggle('show-item-notes', printerToolsState.showItemNotes);
    setToggle('show-item-addons', printerToolsState.showItemAddons);
    setToggle('detailed-item-breakdown', printerToolsState.detailedItemBreakdown);
  } catch (error) {
    console.error('Failed to load custom text:', error);
    showPrinterToast('Gagal memuat custom text', 'error');
  }
}

async function saveCustomText() {
  try {
    const payload = {
      headerPreset: document.getElementById('header-preset')?.value || 'shop-name',
      footerPreset: document.getElementById('footer-preset')?.value || 'thank-you',
      customHeaderText: printerToolsState.customHeaderText || '',
      customFooterText: document.getElementById('custom-footer')?.value || '',
      customHeaderLines: getHeaderLinesPayload(),
      lineSpacing: printerToolsState.lineSpacing,
      showHeaderSeparator: printerToolsState.showHeaderSeparator,
      showFooterSeparator: printerToolsState.showFooterSeparator,
      showOrderId: printerToolsState.showOrderId,
      showTime: printerToolsState.showTime,
      showCustomer: printerToolsState.showCustomer,
      showPaymentMethod: printerToolsState.showPaymentMethod,
      showItemNotes: printerToolsState.showItemNotes,
      showItemAddons: printerToolsState.showItemAddons,
      detailedItemBreakdown: printerToolsState.detailedItemBreakdown
    };
    const res = await fetch('/api/printer/custom-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message || 'Gagal menyimpan custom text');
    
    // Update state from server response
    printerToolsState.headerPreset = data.headerPreset || 'shop-name';
    printerToolsState.footerPreset = data.footerPreset || 'thank-you';
    printerToolsState.customHeaderText = data.customHeaderText || '';
    printerToolsState.customFooterText = data.customFooterText || '';
    if (Array.isArray(data.customHeaderLines)) {
      printerToolsState.customHeaderLines = data.customHeaderLines.map((line) => createHeaderLine({
        text: line?.text || '',
        font: line?.font || 'normal',
        align: line?.align || 'center',
      }));
      renderHeaderLinesEditor();
    }

    showPrinterToast('✅ Pengaturan kustomisasi disimpan', 'success');
    // Refresh preview to reflect changes
    loadSamplePreview(printerToolsState.selected || printerToolsState.active);
  } catch (error) {
    console.error('Failed to save custom text:', error);
    showPrinterToast('Gagal menyimpan custom text', 'error');
  }
}

async function resetCustomTextToDefault() {
  try {
    // Reset local state to defaults
    Object.assign(printerToolsState, {
      headerPreset: 'shop-name',
      footerPreset: 'thank-you',
      customHeaderText: '',
      customFooterText: '',
  customHeaderLines: [createHeaderLine()],
      lineSpacing: 'normal',
      showHeaderSeparator: true,
      showFooterSeparator: true,
      showOrderId: true,
      showTime: true,
      showCustomer: true,
      showPaymentMethod: true,
      showItemNotes: true,
      showItemAddons: true,
      detailedItemBreakdown: true
    });
    syncHeaderTextState();
    renderHeaderLinesEditor();
    await saveCustomText();
    await loadCustomText();
  } catch (_) {}
}

function collectFooterQrPayload() {
  const toggle = document.getElementById('footer-qr-enabled');
  const contentInput = document.getElementById('footer-qr-content');
  const linkInput = document.getElementById('footer-qr-link');
  const labelInput = document.getElementById('footer-qr-label');
  const sizeInput = document.getElementById('footer-qr-size');
  const type = printerToolsState.footerQrType;

  let value = '';
  if (type === 'link') {
    value = linkInput ? linkInput.value.trim() : printerToolsState.footerQrLink || '';
  } else if (type === 'image') {
    value = printerToolsState.footerQrImageData || '';
  } else {
    value = contentInput ? contentInput.value.trim() : printerToolsState.footerQrContent || '';
  }

  return {
    enabled: toggle ? !!toggle.checked : printerToolsState.footerQrEnabled,
    type,
    value,
    imageData: type === 'image' ? (printerToolsState.footerQrImageData || value || '') : undefined,
    label: labelInput ? labelInput.value.trim() : '',
    cellSize: sizeInput ? Number(sizeInput.value) : printerToolsState.footerQrSize,
    position: printerToolsState.qrPosition,
  };
}

async function persistFooterQrSettings({ silent = false } = {}) {
  const payload = collectFooterQrPayload();
  try {
    const res = await fetch('/api/printer/footer-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Gagal menyimpan QR footer');
    }

    printerToolsState.footerQrEnabled = !!data.enabled;
    printerToolsState.footerQrContent = data.value || '';
    printerToolsState.footerQrLabel = data.label || '';
    printerToolsState.footerQrType = data.type || payload.type;
    printerToolsState.footerQrSize = Number.isFinite(Number(data.cellSize)) ? Number(data.cellSize) : printerToolsState.footerQrSize;
    printerToolsState.qrPosition = data.position || printerToolsState.qrPosition;
    printerToolsState.footerQrImageData = printerToolsState.footerQrType === 'image'
      ? (data.imageData || payload.imageData || '')
      : '';
    if (printerToolsState.footerQrType === 'link') {
      printerToolsState.footerQrLink = printerToolsState.footerQrContent;
    } else if (printerToolsState.footerQrType === 'qr') {
      printerToolsState.footerQrLink = '';
    }
    printerToolsState.footerQrCanRender = data.canRender !== undefined
      ? !!data.canRender
      : (printerToolsState.footerQrEnabled && (!!printerToolsState.footerQrContent || !!printerToolsState.footerQrImageData));
    printerToolsState.footerQrDefaultValue = data.defaultValue || printerToolsState.footerQrDefaultValue;
    printerToolsState.footerQrDefaultLabel = data.defaultLabel || printerToolsState.footerQrDefaultLabel;

    const toggle = document.getElementById('footer-qr-enabled');
    if (toggle) toggle.checked = printerToolsState.footerQrEnabled;
    const contentInput = document.getElementById('footer-qr-content');
    if (contentInput && printerToolsState.footerQrType === 'qr') {
      contentInput.value = printerToolsState.footerQrContent;
    }
    const linkInput = document.getElementById('footer-qr-link');
    if (linkInput && printerToolsState.footerQrType === 'link') {
      linkInput.value = printerToolsState.footerQrLink;
    }
    const labelInput = document.getElementById('footer-qr-label');
    if (labelInput) {
      labelInput.value = printerToolsState.footerQrLabel;
    }
    const sizeInput = document.getElementById('footer-qr-size');
    if (sizeInput) {
      sizeInput.value = printerToolsState.footerQrSize;
    }
    setQrPanelInteractivity(printerToolsState.footerQrEnabled);
    updateQrStatusBadge();
    updateQrDefaultBadges();
    if (!silent) {
      showPrinterToast('✅ Pengaturan QR footer disimpan', 'success');
      await loadSamplePreview(printerToolsState.selected || printerToolsState.active);
    }
    return data;
  } catch (error) {
    if (!silent) {
      console.error('Failed to save footer QR settings:', error);
      showPrinterToast(error.message || 'Gagal menyimpan QR footer', 'error');
    } else {
      console.error('Auto-save footer QR failed:', error);
    }
    throw error;
  }
}

async function saveFooterQrSettings() {
  if (footerQrAutoSaveTimer) {
    clearTimeout(footerQrAutoSaveTimer);
    footerQrAutoSaveTimer = null;
  }
  return persistFooterQrSettings({ silent: false });
}

async function loadFullCustomTemplate() {
  try {
    const id = printerToolsState.selected || printerToolsState.active;
    const res = await fetch(`/api/printer/custom-template?template=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message || 'Gagal memuat custom template');
    const area = document.getElementById('custom-template-text');
    if (area) area.value = data.text || '';
    const toggle = document.getElementById('toggle-custom-template');
    if (toggle) toggle.checked = !!data.useCustomTemplate;
    printerToolsState.useCustomTemplate = !!data.useCustomTemplate;
  } catch (error) {
    console.error('Failed to load full custom template:', error);
    showPrinterToast('Gagal memuat full custom template', 'error');
  }
}

async function saveFullCustomTemplate() {
  try {
    const id = printerToolsState.selected || printerToolsState.active;
    const area = document.getElementById('custom-template-text');
    const text = area ? area.value : '';
    const res = await fetch('/api/printer/custom-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: id, text })
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message || 'Gagal menyimpan custom template');
    showPrinterToast('Custom template disimpan', 'success');
    // Refresh preview so the sample reflects changes
    loadSamplePreview(id);
  } catch (error) {
    console.error('Failed to save full custom template:', error);
    showPrinterToast('Gagal menyimpan full custom template', 'error');
  }
}

async function setUseCustomTemplate(enabled) {
  try {
    const res = await fetch('/api/printer/custom-template/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message || 'Gagal mengubah mode custom template');
    printerToolsState.useCustomTemplate = !!data.useCustomTemplate;
    showPrinterToast(`Mode custom template: ${printerToolsState.useCustomTemplate ? 'AKTIF' : 'NONAKTIF'}`, 'success');
    loadSamplePreview(printerToolsState.selected || printerToolsState.active);
  } catch (error) {
    console.error('Failed to toggle full custom template:', error);
    showPrinterToast('Gagal mengubah mode custom template', 'error');
  }
}
