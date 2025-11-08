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
    } else {
      container.classList.add('hidden');
    }
  }
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
  
  if (printerToolsState.footerQrEnabled) {
    badge.textContent = 'Aktif';
    badge.classList.remove('bg-charcoal/10', 'text-charcoal/60');
    badge.classList.add('bg-matcha/15', 'text-matcha');
  } else {
    badge.textContent = 'Nonaktif';
    badge.classList.add('bg-charcoal/10', 'text-charcoal/60');
    badge.classList.remove('bg-matcha/15', 'text-matcha');
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
      customHeaderText: document.getElementById('custom-header')?.value || '',
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
    const qrLabelText = data.footerQrLabel || printerToolsState.footerQrLabel || printerToolsState.footerQrDefaultLabel || 'Scan QR';

    if (qrContainer) {
      if (!data.html && qrEnabled && data.footerQrBase64) {
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
      setQrPanelInteractivity(printerToolsState.footerQrEnabled);
      schedulePreviewUpdate(); // Live preview
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
      });
    });
  }

  // Live preview for QR content and label
  const qrContentInput = document.getElementById('footer-qr-content');
  if (qrContentInput) {
    qrContentInput.addEventListener('input', (e) => {
      printerToolsState.footerQrContent = e.target.value;
      schedulePreviewUpdate();
    });
  }
  const qrLabelInput = document.getElementById('footer-qr-label');
  if (qrLabelInput) {
    qrLabelInput.addEventListener('input', (e) => {
      printerToolsState.footerQrLabel = e.target.value;
      schedulePreviewUpdate();
    });
  }

  const qrLinkInput = document.getElementById('footer-qr-link');
  if (qrLinkInput) {
    qrLinkInput.addEventListener('input', (e) => {
      printerToolsState.footerQrLink = e.target.value;
      schedulePreviewUpdate();
    });
  }

  const qrSizeInput = document.getElementById('footer-qr-size');
  if (qrSizeInput) {
    qrSizeInput.addEventListener('input', (e) => {
      const rawValue = Number(e.target.value);
      printerToolsState.footerQrSize = Number.isFinite(rawValue) ? rawValue : 2;
      updateQrSizeDisplay();
      schedulePreviewUpdate();
    });
  }

  const qrPositionSelect = document.getElementById('qr-position');
  if (qrPositionSelect) {
    qrPositionSelect.addEventListener('change', (e) => {
      printerToolsState.qrPosition = e.target.value;
      schedulePreviewUpdate();
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
      showPrinterToast('QR footer dibersihkan', 'info');
    });
  }
  
  // Save QR settings button
  const saveQrBtn = document.getElementById('save-footer-qr');
  if (saveQrBtn) {
    saveQrBtn.addEventListener('click', saveFooterQrSettings);
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
      customHeaderText: document.getElementById('custom-header')?.value || '',
      customFooterText: document.getElementById('custom-footer')?.value || '',
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
    await saveCustomText();
    await loadCustomText();
  } catch (_) {}
}

async function saveFooterQrSettings() {
  try {
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
    const payload = {
      enabled: toggle ? toggle.checked : false,
      type,
      value,
      label: labelInput ? labelInput.value.trim() : '',
      cellSize: sizeInput ? Number(sizeInput.value) : printerToolsState.footerQrSize,
      position: printerToolsState.qrPosition,
    };
    
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
  printerToolsState.footerQrType = data.type || printerToolsState.footerQrType;
  printerToolsState.footerQrSize = data.cellSize || printerToolsState.footerQrSize;
  printerToolsState.qrPosition = data.position || printerToolsState.qrPosition;
    showPrinterToast('✅ Pengaturan QR footer disimpan', 'success');
    // Refresh preview to reflect changes
    await loadSamplePreview(printerToolsState.selected || printerToolsState.active);
  } catch (error) {
    console.error('Failed to save footer QR settings:', error);
    showPrinterToast(error.message || 'Gagal menyimpan QR footer', 'error');
  }
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
