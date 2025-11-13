// Search page logic with detail popup

function formatNumber(num) {
  return new Intl.NumberFormat('id-ID').format(num);
}

// --- Modal helpers ---
function openModal() {
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.querySelector('div').classList.remove('scale-95');
  }, 10);
}
function closeModal() {
  const modal = document.getElementById('detail-modal');
  modal.classList.add('opacity-0');
  modal.querySelector('div').classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- Search Core ---
async function runSearch() {
  const query = document.getElementById('search-input').value;
  const status = document.getElementById('search-status').value;
  const resultsDiv = document.getElementById('search-results');
  const placeholder = document.getElementById('placeholder');

  // Show loading state
  resultsDiv.innerHTML = '<div class="py-10 text-center text-charcoal/50">⏳ Mencari pesanan...</div>';
  if (placeholder) {
    placeholder.classList.add('hidden');
  }

  try {
    const response = await fetch(`/api/orders/search?q=${encodeURIComponent(query)}&status=${status}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const payload = await response.json();

    // Normalize: backend returns { success, count, results }
    const list = Array.isArray(payload)
      ? payload
      : (payload?.results || payload?.orders || payload?.data || payload?.items || []);

    resultsDiv.innerHTML = ''; // Clear loading
    if (!Array.isArray(list) || list.length === 0) {
      resultsDiv.innerHTML = '<div class="py-10 text-center text-charcoal/50">🚫 Tidak ada hasil yang cocok.</div>';
    } else {
      const resultGrid = document.createElement('div');
      resultGrid.className = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3';
      list.forEach(r => resultGrid.appendChild(renderResult(r)));
      resultsDiv.appendChild(resultGrid);
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsDiv.innerHTML = '<div class="py-10 text-center text-red-500">❌ Gagal memuat data. Coba lagi nanti.</div>';
  }
}

function getStatusInfo(status) {
  const s = (status || '').toLowerCase();
  const statusMap = {
    pending_payment: { text: 'Pending QRIS', color: 'amber', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    pending_cash: { text: 'Pending Tunai', color: 'sky', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    paid: { text: 'Lunas', color: 'blue', icon: 'M5 13l4 4L19 7' },
    processing: { text: 'Diproses', color: 'fuchsia', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ready: { text: 'Siap Diambil', color: 'green', icon: 'M5 13l4 4L19 7' },
    completed: { text: 'Selesai', color: 'slate', icon: 'M5 13l4 4L19 7' },
    cancelled: { text: 'Batal', color: 'red', icon: 'M6 18L18 6M6 6l12 12' },
  };
  const info = statusMap[s] || { text: s, color: 'gray', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01' };
  
  const badgeClass = `bg-${info.color}-100 text-${info.color}-800 border-${info.color}-200`;
  const borderClass = `border-${info.color}-300/70`;
  const iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${info.icon}" /></svg>`;

  return { ...info, badgeClass, borderClass, iconHtml };
}

function renderResult(r) {
  const el = document.createElement('div');
  const statusInfo = getStatusInfo(r.status);
  
  el.className = `flex cursor-pointer flex-col justify-between rounded-2xl border-l-4 ${statusInfo.borderClass} bg-white/90 p-5 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1`;
  el.onclick = () => viewDetail(r.orderId);

  const timeAgo = r.createdAt
    ? (typeof moment !== 'undefined' ? moment(r.createdAt).fromNow() : new Date(r.createdAt).toLocaleString('id-ID'))
    : 'beberapa waktu lalu';
  const itemCount = Number.isFinite(Number(r.itemCount)) ? Number(r.itemCount) : 0;
  const qtyLabel = itemCount > 0 ? `${itemCount} item · Total` : 'Total';

  el.innerHTML = `
    <div>
      <div class="flex items-center justify-between">
        <span class="text-sm font-bold text-matcha">${r.orderId}</span>
        <span class="inline-flex items-center gap-2 rounded-full border ${statusInfo.badgeClass} px-3 py-1 text-xs font-semibold">
          ${statusInfo.iconHtml}
          <span>${statusInfo.text}</span>
        </span>
      </div>
      <p class="mt-2 text-lg font-bold text-charcoal">${r.customerName || 'No Name'}</p>
      <p class="text-xs text-charcoal/50">${r.waNumber || 'Tanpa Nomor'}</p>
    </div>
    <div class="mt-4 flex items-end justify-between border-t border-charcoal/10 pt-4">
      <div>
        <p class="text-xs text-charcoal/60">${qtyLabel}</p>
        <p class="text-xl font-extrabold text-charcoal">Rp ${formatNumber(r.total)}</p>
      </div>
      <span class="text-xs text-charcoal/50">${timeAgo}</span>
    </div>
  `;
  return el;
}

async function viewDetail(orderId) {
  const title = document.getElementById('detail-title');
  const subtitle = document.getElementById('detail-subtitle');
  const body = document.getElementById('detail-body');
  const actions = document.getElementById('detail-actions');

  title.textContent = 'Detail Pesanan';
  subtitle.textContent = `Memuat detail untuk ${orderId}...`;
  body.innerHTML = '<div class="text-center">⏳ Memuat...</div>';
  actions.innerHTML = '';
  openModal();

  try {
    // Use unified detail endpoint
    const response = await fetch(`/api/orders/${orderId}`);
    if (!response.ok) throw new Error('Order not found');
    const payload = await response.json();
    const isOrder = payload?.type === 'order';
    const data = isOrder ? payload.order : payload.payment;

    title.textContent = `Pesanan ${data.orderId}`;
    const subtitleRight = (data.userId || '').split('@')[0] || '';
    subtitle.textContent = `${data.customerName || 'Customer'}${subtitleRight ? ' · ' + subtitleRight : ''}`;

    const itemsHtml = (data.items || []).map(item => {
      const qty = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1;
      const addonsArr = Array.isArray(item.addons) ? item.addons : [];
      const lineTotal = Number.isFinite(Number(item.totalPrice))
        ? Number(item.totalPrice)
        : (Number.isFinite(Number(item.price)) && Number.isFinite(Number(qty)) ? Number(item.price) * qty : 0);
      const addonsHtml = addonsArr.length > 0
        ? `<p class="text-xs text-charcoal/60">${addonsArr.map(a => `+ ${a.name}`).join('<br>')}</p>`
        : '';
      const notesHtml = item.notes ? `<p class="text-xs text-amber-800">Catatan: ${item.notes}</p>` : '';
      return `
      <div class="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 border-b border-charcoal/10 py-2">
        <div class="font-semibold">${qty}x</div>
        <div>
          <p class="font-semibold">${item.name}</p>
          ${addonsHtml}
          ${notesHtml}
        </div>
        <div class="text-right font-medium">Rp ${formatNumber(lineTotal)}</div>
      </div>`;
    }).join('');

    const totalAmount = (data.pricing && typeof data.pricing.total === 'number') ? data.pricing.total : (typeof data.amount === 'number' ? data.amount : 0);
    const discountVal = (data.pricing && typeof data.pricing.discount === 'number') ? data.pricing.discount : 0;
    const summaryHtml = `
      <div class="mt-4 space-y-1 border-t border-charcoal/10 pt-3 text-right">
        ${discountVal > 0 ? `<p>Diskon: - Rp ${formatNumber(discountVal)}</p>` : ''}
        <p class="text-lg font-bold">Grand Total: Rp ${formatNumber(totalAmount)}</p>
      </div>
    `;

    const paymentMethod = data.paymentMethod || (isOrder ? (data.paymentMethod || '-') : 'QRIS');
    const paymentStatus = (data.status || '-');
    const fmt = (dt) => (dt ? (typeof moment !== 'undefined' ? moment(dt).format('D MMM YYYY, HH:mm') : new Date(dt).toLocaleString('id-ID')) : '');
    const createdAt = fmt(data.createdAt) || '-';
    const paidAt = fmt(data.paidAt);
    const paymentHtml = `
      <div class="mt-4 rounded-xl bg-white/70 p-4">
        <h4 class="font-semibold">Informasi Pembayaran</h4>
        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
          <p class="text-charcoal/60">Metode</p><p class="font-medium text-right">${paymentMethod}</p>
          <p class="text-charcoal/60">Status</p><p class="font-medium text-right">${paymentStatus}</p>
          <p class="text-charcoal/60">Waktu Pesan</p><p class="font-medium text-right">${createdAt}</p>
          ${paidAt ? `<p class="text-charcoal/60">Waktu Bayar</p><p class="font-medium text-right">${paidAt}</p>` : ''}
        </div>
      </div>
    `;

    body.innerHTML = itemsHtml + summaryHtml + paymentHtml;

    // --- Render Actions ---
    const status = (isOrder ? (data.status || '') : 'pending_payment').toLowerCase();
    if (status === 'pending_cash') {
      actions.innerHTML = `
        <button onclick="acceptCash('${orderId}')" class="rounded-xl bg-green-500 px-4 py-3 font-semibold text-white transition hover:bg-green-600">✅ Terima Tunai</button>
        <button onclick="cancelCash('${orderId}')" class="rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition hover:bg-red-600">❌ Batalkan</button>
      `;
    } else if (status === 'cancelled' && (paymentMethod || '').toUpperCase() === 'CASH') {
      actions.innerHTML = `<button onclick="cashierReopen('${orderId}')" class="rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-600 col-span-2">↩️ Buka Kembali</button>`;
    } else if (status === 'processing') {
      actions.innerHTML = `<button onclick="markOrderReady('${orderId}', '${data.customerName || 'Customer'}')" class="rounded-xl bg-green-500 px-4 py-3 font-semibold text-white transition hover:bg-green-600 col-span-2">✅ Tandai Siap Diambil</button>`;
    } else {
      actions.innerHTML = '<p class="text-center text-sm text-charcoal/50 col-span-2">Tidak ada aksi yang tersedia untuk status ini.</p>';
    }

  } catch (error) {
    console.error('Failed to view detail:', error);
    body.innerHTML = `<div class="text-center text-red-500">❌ Gagal memuat detail pesanan.</div>`;
  }
}

// --- Minimal action helpers ---
async function cashierReopen(orderId) {
  if (!confirm(`Yakin ingin membuka kembali pesanan ${orderId}?`)) return;
  await fetch(`/api/orders/cash/reopen/${orderId}`, { method: 'POST' });
  closeModal();
  runSearch();
}
async function acceptCash(orderId) {
  await fetch(`/api/orders/cash/accept/${orderId}`, { method: 'POST' });
  closeModal();
  runSearch();
}
async function cancelCash(orderId) {
  if (!confirm(`Yakin ingin membatalkan pesanan tunai ${orderId}?`)) return;
  await fetch(`/api/orders/cash/cancel/${orderId}`, { method: 'POST' });
  closeModal();
  runSearch();
}
async function markOrderReady(orderId, customerName) {
  await fetch(`/api/orders/ready/${orderId}`, { method: 'POST' });
  alert(`Order ${orderId} (${customerName}) telah ditandai SIAP DIAMBIL. Notifikasi dikirim ke customer.`);
  closeModal();
  runSearch();
}

// --- Bind events ---
document.addEventListener('DOMContentLoaded', () => {
  // Load moment.js for time formatting
  const momentScript = document.createElement('script');
  momentScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js';
  document.head.appendChild(momentScript);
  const momentLocaleScript = document.createElement('script');
  momentLocaleScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/locale/id.min.js';
  document.head.appendChild(momentLocaleScript);
  
  momentLocaleScript.onload = () => {
    moment.locale('id');
  };

  const searchInput = document.getElementById('search-input');
  const searchStatus = document.getElementById('search-status');
  const searchButton = document.getElementById('btn-search');
  const modal = document.getElementById('detail-modal');
  const closeBtn = document.getElementById('detail-close');

  // Debounce search
  let searchTimeout;
  const debouncedSearch = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(runSearch, 300);
  };

  searchInput.addEventListener('input', debouncedSearch);
  searchStatus.addEventListener('change', runSearch);
  if (searchButton) searchButton.addEventListener('click', runSearch);
  
  // Also search on Enter key
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout); // cancel debounce
      runSearch();
    }
  });

  // Modal close events
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Run an initial search so results appear without clicking
  runSearch();
});
