// --- Template Preview Modal ---
async function showTemplate(type) {
  const modal = document.getElementById('template-modal');
  const titleEl = document.getElementById('template-title');
  const contentEl = document.getElementById('template-content');
  const downloadEl = document.getElementById('template-download');

  if (type === 'json') {
    titleEl.textContent = 'Template JSON';
    downloadEl.href = '/api/import/template/json';
    try {
      const res = await fetch('/api/import/template/json');
      const json = await res.json();
      contentEl.textContent = JSON.stringify(json, null, 2);
    } catch (e) {
      contentEl.textContent = 'Gagal memuat template JSON.';
    }
  } else if (type === 'excel') {
    titleEl.textContent = 'Template Excel';
    downloadEl.href = '/api/import/template/excel';
    contentEl.innerHTML = `
      <div class="text-sm text-charcoal/80 space-y-2">
        <p class="font-semibold">Kolom (Header Row 1):</p>
        <div class="rounded-lg bg-white/90 border border-charcoal/10 p-3 overflow-x-auto">
          <code class="text-xs">orderId | userId | customerName | paymentMethod | status | createdAt | paidAt | confirmedAt | completedAt | items</code>
        </div>
        <p class="font-semibold mt-3">Contoh Baris Data (Row 2):</p>
        <div class="rounded-lg bg-white/90 border border-charcoal/10 p-3 overflow-x-auto">
          <code class="text-xs">CF20250101TEST1 | 628123000111 | Tester 1 | QRIS | completed | 2025-01-01T10:00:00+08:00 | 2025-01-01T10:05:00+08:00 | 2025-01-01T10:06:00+08:00 | 2025-01-01T10:16:00+08:00 | [{"id":"C004","name":"Latte","price":24000,"quantity":1},{"id":"C001","name":"Espresso","price":15000,"quantity":2}]</code>
        </div>
        <p class="text-xs text-charcoal/60 mt-2">items harus berupa JSON array string. Download file Excel untuk melihat format yang benar di spreadsheet.</p>
      </div>
    `;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeTemplate() {
  const modal = document.getElementById('template-modal');
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 200);
}

// --- Import Form ---
async function importOrders(e){
  e.preventDefault();
  const fileEl = document.getElementById('file');
  const methodEl = document.getElementById('method');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  if (!fileEl.files[0]) return;
  statusEl.textContent = 'Uploading…';
  resultEl.classList.add('hidden');
  const fd = new FormData();
  fd.append('file', fileEl.files[0]);
  if (methodEl.value) fd.append('method', methodEl.value);
  try {
    const res = await fetch('/api/import/orders', { method:'POST', body: fd });
    const data = await res.json();
    if (data.success){
      statusEl.textContent = '';
      resultEl.innerHTML = `✅ Berhasil import ${data.imported} orders.`;
      resultEl.classList.remove('hidden');
    } else {
      statusEl.textContent = '';
      resultEl.innerHTML = `❌ Gagal: ${data.message || 'Unknown error'}`;
      resultEl.classList.remove('hidden');
    }
  } catch (e){
    statusEl.textContent = '';
    resultEl.innerHTML = `❌ Error: ${e.message}`;
    resultEl.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('import-form');
  form?.addEventListener('submit', importOrders);
});
