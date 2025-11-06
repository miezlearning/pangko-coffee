'use strict';

const printerToolsState = {
  templates: [],
  active: null,
  selected: null,
  sampleText: 'Memuat preview…',
};

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
      updateTemplateBadges();
      renderTemplateCards();
      loadSamplePreview(id);
    });
  });

  container.querySelectorAll('button[data-action="activate"]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      const id = event.currentTarget.getAttribute('data-template');
      printerToolsState.selected = id;
      await persistTemplateSelection(id);
    });
  });
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
  if (preview) {
    preview.textContent = 'Memuat preview…';
  }
  try {
    const id = templateId || printerToolsState.active || '58mm';
    const res = await fetch(`/api/printer/templates/${encodeURIComponent(id)}/sample`);
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'Preview gagal dimuat');
    }
    printerToolsState.sampleText = data.text;
    if (preview) {
      preview.textContent = data.text;
    }
  } catch (error) {
    console.error('Failed to load sample preview:', error);
    if (preview) {
      preview.textContent = 'Preview tidak tersedia.';
    }
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
}

window.addEventListener('DOMContentLoaded', () => {
  bindPrinterToolEvents();
  loadTemplates();
});
