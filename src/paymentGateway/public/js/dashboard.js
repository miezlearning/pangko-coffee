// Dashboard client logic: payments, notifications, audio, and modal flows

let autoRefresh;
let previousPaymentCount = 0;
let soundEnabled = true;
let knownPaymentIds = new Set();
let knownProcessingIds = new Set();
let knownPendingCashIds = new Set();
let paymentsInitialized = false;
let statsInitialized = false;
let processingInitialized = false;
let pendingCashInitialized = false;
let audioUnlocked = false;
let currentTab = 'qris'; // Default active tab

const soundOptions = [
  { name: 'Efek 1', file: '/sounds/sound1.mp3' },
  { name: 'Efek 2', file: '/sounds/sound2.mp3' },
  { name: 'Efek 3', file: '/sounds/sound3.mp3' }
];
let selectedSound = localStorage.getItem('notifSound') || soundOptions[0].file;

function updateSoundToggleButtonUI() {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;
  btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
  btn.classList.toggle('bg-matcha', soundEnabled);
  btn.classList.toggle('text-white', soundEnabled);
  btn.classList.toggle('border-transparent', soundEnabled);
  btn.classList.toggle('bg-white', !soundEnabled);
  btn.classList.toggle('text-matcha', !soundEnabled);
  btn.classList.toggle('border-matcha/60', !soundEnabled);
}

// Try to unlock audio after a user gesture (browser autoplay policy)
function unlockAudio() {
  if (audioUnlocked) return;
  try {
    const a = new Audio(selectedSound);
    a.muted = true;
    a.play().then(() => {
      a.pause();
      audioUnlocked = true;
    }).catch(() => {});
  } catch (_) {}
}

// Notification sound
function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    const audio = new Audio(selectedSound);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (_) {}
}

// Toggle sound
function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundToggleButtonUI();
  if (soundEnabled) unlockAudio();
}

// Change notification sound
function changeNotifSound(file) {
  selectedSound = file;
  localStorage.setItem('notifSound', file);
  // Play preview (best-effort)
  try {
    const audio = new Audio(file);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (_) {}
}

// Tab switching
function switchTab(tabName) {
  currentTab = tabName;
  
  // Hide all tab contents
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach(content => content.classList.add('hidden'));
  
  // Remove active state from all tabs
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.classList.remove('border-matcha', 'bg-white', 'text-matcha');
    tab.classList.add('border-transparent');
  });
  
  // Show active content
  const activeContent = document.getElementById(`content-${tabName}`);
  if (activeContent) activeContent.classList.remove('hidden');
  
  // Style active tab
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) {
    activeTab.classList.remove('border-transparent');
    activeTab.classList.add('border-matcha', 'bg-white', 'text-matcha');
  }
}

// Update tab counters
function updateTabCounters(counts) {
  const counters = {
    qris: counts.qris || 0,
    cash: counts.cash || 0,
    processing: counts.processing || 0,
    ready: counts.ready || 0,
    cancelled: counts.cancelled || 0
  };
  
  Object.keys(counters).forEach(key => {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = counters[key];
  });
}

// Toast notification
function showNotification(text) {
  const notif = document.getElementById('notification');
  const notifText = document.getElementById('notification-text');
  if (!notif || !notifText) return;
  notifText.textContent = text;
  notif.classList.remove('hidden', 'opacity-0', '-translate-y-2');
  requestAnimationFrame(() => {
    notif.classList.add('opacity-100', 'translate-y-0');
  });
  playNotificationSound();
  setTimeout(() => {
    notif.classList.remove('opacity-100', 'translate-y-0');
    notif.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => notif.classList.add('hidden'), 250);
  }, 4000);
}

// Load stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    if (data.success) {
      document.getElementById('today-orders').textContent = data.stats.todayOrders;
      document.getElementById('today-revenue').textContent = 'Rp ' + formatNumber(data.stats.todayRevenue);

      // Notify when pending increases after initial load
      if (statsInitialized && data.stats.pendingCount > previousPaymentCount) {
        showNotification(`New payment detected! (${data.stats.pendingCount} pending)`);
      }
      previousPaymentCount = data.stats.pendingCount;
      if (!statsInitialized) statsInitialized = true;
    }

    // Update status badge (Tailwind classes)
    const badge = document.getElementById('status-badge');
    if (badge) {
      badge.textContent = '🟢 ONLINE';
      badge.classList.remove('bg-rose-100','text-rose-700','border','border-rose-200');
      badge.classList.add('bg-matcha/15','text-matcha');
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
    const badge = document.getElementById('status-badge');
    if (badge) {
      badge.textContent = '🔴 OFFLINE';
      badge.classList.remove('bg-matcha/15','text-matcha');
      badge.classList.add('bg-rose-100','text-rose-700','border','border-rose-200');
    }
  }
}

// Load pending payments
async function loadPayments() {
  try {
    const res = await fetch('/api/payments/pending');
    const data = await res.json();

    const list = document.getElementById('payments-list');
    if (!list) return;

    // Update tab counter
    updateTabCounters({ qris: data.payments.length });

    if (data.payments.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-matcha/30 bg-matcha/5 px-6 py-10 text-center text-sm">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-inner">📭</div>
          <h3 class="mt-5 text-lg font-semibold">Tidak ada pembayaran pending</h3>
          <p class="mt-2 text-charcoal/60">Semua transaksi sudah clear. Tetap pantau notifikasi realtime.</p>
        </div>
      `;
    } else {
      // On first load, baseline IDs so we don't spam notifs
      if (!paymentsInitialized) {
        knownPaymentIds = new Set(data.payments.map(p => p.orderId));
        paymentsInitialized = true;
      } else {
        // Notify for truly new payments
        data.payments.forEach(payment => {
          if (!knownPaymentIds.has(payment.orderId)) {
            knownPaymentIds.add(payment.orderId);
            showNotification(`New order: ${payment.orderId} - Rp ${formatNumber(payment.amount)}`);
          }
        });
      }

      list.innerHTML = data.payments.map((payment) => {
        return `
          <div class="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_20px_45px_-38px_rgba(51,51,51,0.6)] transition hover:-translate-y-1 hover:shadow-[0_30px_65px_-40px_rgba(116,166,98,0.55)]">
            <!-- Header: Order ID & Total -->
            <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex-1">
                <div class="inline-flex items-center gap-2 rounded-full bg-matcha/10 px-3 py-1">
                  <span class="text-xs font-bold uppercase tracking-[0.2em] text-matcha">Pembayaran Pending</span>
                </div>
                <h4 class="mt-3 text-2xl font-bold text-charcoal">📋 ${payment.orderId}</h4>
                <div class="mt-2 flex flex-col gap-1 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">Nomor WhatsApp:</span>
                    <span class="font-mono text-charcoal">${payment.customerId.split('@')[0]}</span>
                  </div>
                </div>
              </div>
              <div class="rounded-2xl border-2 border-matcha/20 bg-matcha/10 px-6 py-4 text-right">
                <p class="text-xs font-bold uppercase tracking-[0.25em] text-matcha/80">Total Pembayaran</p>
                <span class="mt-1 block text-3xl font-extrabold text-matcha">Rp ${formatNumber(payment.amount)}</span>
              </div>
            </div>

            <!-- Detail Pesanan Section -->
            <div class="mt-6">
              <div class="mb-3 flex items-center gap-2 border-b border-charcoal/10 pb-2">
                <span class="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">📦 Detail Pesanan</span>
                <span class="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs font-semibold text-charcoal/70">${payment.items.length} Item</span>
              </div>
              <div class="space-y-2">
                ${payment.items.map(item => `
                  <div class="rounded-xl border border-charcoal/5 bg-white px-4 py-3">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <p class="font-semibold text-charcoal">${item.name}</p>
                        <div class="mt-1 flex items-center gap-3 text-xs text-charcoal/60">
                          <span class="font-semibold">Jumlah: <span class="text-matcha">${item.quantity}x</span></span>
                          <span>•</span>
                          <span>Harga satuan: Rp ${formatNumber(item.price)}</span>
                        </div>
                      </div>
                      <div class="ml-4 text-right">
                        <p class="text-xs font-semibold text-charcoal/60">Subtotal</p>
                        <p class="text-lg font-bold text-charcoal">Rp ${formatNumber(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Waktu Info -->
            <div class="mt-5 grid gap-3 rounded-xl border border-charcoal/5 bg-charcoal/2 p-4 sm:grid-cols-2">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl">🕐</div>
                <div>
                  <p class="text-xs font-semibold text-charcoal/55">Waktu Dibuat</p>
                  <p class="text-sm font-bold text-charcoal">${new Date(payment.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-xl">⏰</div>
                <div>
                  <p class="text-xs font-semibold text-rose-700/80">Batas Pembayaran</p>
                  <p class="text-sm font-bold text-rose-700">${new Date(payment.expiresAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="mt-6 grid gap-3 sm:grid-cols-2">
              <button class="flex items-center justify-center gap-2 rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="confirmPayment('${payment.orderId}')">
                <span>✅</span>
                <span>Konfirmasi Pembayaran</span>
              </button>
              <button class="flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="rejectPayment('${payment.orderId}')">
                <span>❌</span>
                <span>Tolak Pembayaran</span>
              </button>
            </div>
          </div>`;
      }).join('');
    }

    loadStats();
  } catch (error) {
    console.error('Failed to load payments:', error);
  }
}

// Confirm payment
async function confirmPayment(orderId) {
  const proceed = confirm(`Konfirmasi pembayaran untuk order ${orderId}?\n\nCustomer dan barista akan dinotifikasi.`);
  if (!proceed) return;
  try {
    const res = await fetch(`/api/payments/confirm/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedBy: 'kasir' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('✅ Pembayaran dikonfirmasi & notifikasi terkirim');
      knownPaymentIds.delete(orderId);
      loadPayments();
    } else {
      showNotification('❌ Gagal konfirmasi: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    showNotification('❌ Error: ' + error.message);
  }
}

// Reject payment (modal UI)
let rejectModalState = { orderId: null };

function openRejectModal(orderId) {
  rejectModalState.orderId = orderId;
  const modal = document.getElementById('reject-modal');
  const reasonEl = document.getElementById('reject-reason');
  if (!modal) return;
  if (reasonEl) reasonEl.value = '';
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
  });
  setTimeout(() => reasonEl && reasonEl.focus(), 50);
}

function closeRejectModal() {
  const modal = document.getElementById('reject-modal');
  if (!modal) return;
  modal.classList.remove('opacity-100');
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 200);
  rejectModalState.orderId = null;
}

async function submitReject() {
  const reasonEl = document.getElementById('reject-reason');
  const reason = (reasonEl?.value || '').trim();
  if (!reason) {
    showNotification('⚠️ Mohon isi alasan penolakan');
    return;
  }
  const orderId = rejectModalState.orderId;
  try {
    const res = await fetch(`/api/payments/reject/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, rejectedBy: 'kasir' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('✅ Pembayaran ditolak & customer diberi notifikasi');
      knownPaymentIds.delete(orderId);
      closeRejectModal();
      loadPayments();
    } else {
      showNotification('❌ Gagal menolak: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    showNotification('❌ Error: ' + error.message);
  }
}

// Load processing orders
async function loadProcessingOrders() {
  try {
    const res = await fetch('/api/orders/processing');
    const data = await res.json();

    const list = document.getElementById('processing-list');
    if (!list) return;

    // Update tab counter
    updateTabCounters({ processing: data.orders.length });

    // Notify on truly new processing orders (e.g., Tunai langsung PROCESSSING, atau QRIS sesudah dikonfirmasi)
    if (!processingInitialized) {
      knownProcessingIds = new Set(data.orders.map(o => o.orderId));
      processingInitialized = true;
    } else {
      data.orders.forEach(order => {
        if (!knownProcessingIds.has(order.orderId)) {
          knownProcessingIds.add(order.orderId);
          const methodLabel = order.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS';
          showNotification(`Pesanan baru (${methodLabel}): ${order.orderId} • ${order.customerName}`);
        }
      });
    }

    if (data.orders.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-peach/40 bg-peach/20 px-6 py-10 text-center text-sm">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-inner">🎉</div>
          <h3 class="mt-5 text-lg font-semibold">Semua pesanan sudah selesai!</h3>
          <p class="mt-2 text-charcoal/60">Tidak ada order yang sedang diproses. Nikmati momen tenang ini ☕</p>
        </div>
      `;
    } else {
      list.innerHTML = data.orders.map((order) => {
        const processingTime = Math.floor((Date.now() - new Date(order.confirmedAt)) / 60000);
        return `
          <div class="rounded-3xl border border-white/50 bg-white/95 p-6 shadow-[0_20px_45px_-38px_rgba(255,229,180,0.6)] transition hover:-translate-y-1 hover:shadow-[0_30px_65px_-40px_rgba(116,166,98,0.45)]">
            <!-- Header -->
            <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex-1">
                <div class="inline-flex items-center gap-2 rounded-full bg-peach/20 px-3 py-1">
                  <span class="text-xs font-bold uppercase tracking-[0.2em] text-peach-800">👨‍🍳 Sedang Diproses</span>
                </div>
                <h4 class="mt-3 text-2xl font-bold text-charcoal">📋 ${order.orderId}</h4>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">Nama Customer:</span>
                    <span class="font-bold text-matcha">${order.customerName}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">WhatsApp:</span>
                    <span class="font-mono text-charcoal">${order.userId}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">Metode Bayar:</span>
                    <span class="rounded-full bg-charcoal/10 px-2 py-0.5 text-xs font-bold">${order.paymentMethod === 'CASH' ? '💵 Tunai' : '💳 QRIS'}</span>
                  </div>
                </div>
              </div>
              <div class="rounded-2xl border-2 border-peach/30 bg-peach/15 px-6 py-4 text-right">
                <p class="text-xs font-bold uppercase tracking-[0.25em] text-peach-800">Total Pesanan</p>
                <span class="mt-1 block text-3xl font-extrabold text-charcoal">Rp ${formatNumber(order.pricing.total)}</span>
              </div>
            </div>

            <!-- Detail Pesanan -->
            <div class="mt-6">
              <div class="mb-3 flex items-center gap-2 border-b border-charcoal/10 pb-2">
                <span class="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">📦 Detail Pesanan</span>
                <span class="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs font-semibold text-charcoal/70">${order.items.length} Item</span>
              </div>
              <div class="space-y-2">
                ${order.items.map(item => `
                  <div class="rounded-xl border border-charcoal/5 bg-white px-4 py-3">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <p class="font-semibold text-charcoal">${item.name}</p>
                        <div class="mt-1 flex items-center gap-3 text-xs text-charcoal/60">
                          <span class="font-semibold">Jumlah: <span class="text-matcha">${item.quantity}x</span></span>
                          <span>•</span>
                          <span>Harga satuan: Rp ${formatNumber(item.price)}</span>
                        </div>
                        ${item.notes ? `<div class="mt-2 rounded-lg bg-matcha/5 px-3 py-2"><p class="text-sm font-semibold text-charcoal">📝 Catatan: ${item.notes}</p></div>` : ''}
                      </div>
                      <div class="ml-4 text-right">
                        <p class="text-xs font-semibold text-charcoal/60">Subtotal</p>
                        <p class="text-lg font-bold text-charcoal">Rp ${formatNumber(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Status Info -->
            <div class="mt-5 flex items-center justify-between rounded-xl border border-charcoal/5 bg-charcoal/2 p-4">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl">⏱️</div>
                <div>
                  <p class="text-xs font-semibold text-charcoal/55">Waktu Pemrosesan</p>
                  <p class="text-sm font-bold text-charcoal">${processingTime} menit yang lalu</p>
                </div>
              </div>
              <div class="text-right text-xs font-semibold text-charcoal/50">
                <p>Status diupdate otomatis</p>
                <p>oleh sistem barista</p>
              </div>
            </div>

            <!-- Action Button -->
            <button class="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="markOrderReady('${order.orderId}', '${order.customerName}')">
              <span>✅</span>
              <span>Tandai Siap - Atas Nama: ${order.customerName}</span>
            </button>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Failed to load processing orders:', error);
  }
}

// Load pending cash orders
async function loadPendingCash() {
  try {
    const res = await fetch('/api/orders/pending-cash');
    const data = await res.json();

    const list = document.getElementById('pending-cash-list');
    if (!list) return;

    // Update tab counter
    updateTabCounters({ cash: data.orders.length });

    // Notify on new pending cash
    if (!pendingCashInitialized) {
      knownPendingCashIds = new Set(data.orders.map(o => o.orderId));
      pendingCashInitialized = true;
    } else {
      data.orders.forEach(order => {
        if (!knownPendingCashIds.has(order.orderId)) {
          knownPendingCashIds.add(order.orderId);
          showNotification(`Tunai menunggu kasir: ${order.orderId} • ${order.customerName}`);
        }
      });
    }

    if (data.orders.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-charcoal/15 bg-white px-6 py-10 text-center text-sm">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cream text-3xl shadow-inner">💤</div>
          <h3 class="mt-5 text-lg font-semibold">Tidak ada pesanan tunai menunggu</h3>
          <p class="mt-2 text-charcoal/60">Kasir akan melihat pesanan tunai baru di sini.</p>
        </div>
      `;
    } else {
      list.innerHTML = data.orders.map((order) => {
        const minutesLeft = order.cashExpiresAt ? Math.max(0, Math.floor((new Date(order.cashExpiresAt) - Date.now()) / 60000)) : '-';
        return `
          <div class="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_20px_45px_-38px_rgba(51,51,51,0.4)] transition hover:-translate-y-1">
            <!-- Header -->
            <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex-1">
                <div class="inline-flex items-center gap-2 rounded-full bg-cream px-3 py-1 ring-2 ring-charcoal/10">
                  <span class="text-xs font-bold uppercase tracking-[0.2em] text-charcoal">💵 Menunggu Tunai</span>
                </div>
                <h4 class="mt-3 text-2xl font-bold text-charcoal">📋 ${order.orderId}</h4>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">Nama Customer:</span>
                    <span class="font-bold text-matcha">${order.customerName}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">WhatsApp:</span>
                    <span class="font-mono text-charcoal">${order.userId}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-charcoal/60">Metode:</span>
                    <span class="rounded-full bg-charcoal/10 px-2 py-0.5 text-xs font-bold">💵 Bayar Tunai di Kasir</span>
                  </div>
                </div>
              </div>
              <div class="rounded-2xl border-2 border-cream bg-cream/50 px-6 py-4 text-right">
                <p class="text-xs font-bold uppercase tracking-[0.25em] text-charcoal/70">Total yang Harus Dibayar</p>
                <span class="mt-1 block text-3xl font-extrabold text-charcoal">Rp ${formatNumber(order.pricing.total)}</span>
              </div>
            </div>

            <!-- Detail Pesanan -->
            <div class="mt-6">
              <div class="mb-3 flex items-center gap-2 border-b border-charcoal/10 pb-2">
                <span class="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">📦 Detail Pesanan</span>
                <span class="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs font-semibold text-charcoal/70">${order.items.length} Item</span>
              </div>
              <div class="space-y-2">
                ${order.items.map(item => `
                  <div class="rounded-xl border border-charcoal/5 bg-white px-4 py-3">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <p class="font-semibold text-charcoal">${item.name}</p>
                        <div class="mt-1 flex items-center gap-3 text-xs text-charcoal/60">
                          <span class="font-semibold">Jumlah: <span class="text-matcha">${item.quantity}x</span></span>
                          <span>•</span>
                          <span>Harga satuan: Rp ${formatNumber(item.price)}</span>
                        </div>
                        ${item.notes ? `<div class="mt-2 rounded-lg bg-matcha/5 px-3 py-2"><p class="text-sm font-semibold text-charcoal">📝 Catatan: ${item.notes}</p></div>` : ''}
                      </div>
                      <div class="ml-4 text-right">
                        <p class="text-xs font-semibold text-charcoal/60">Subtotal</p>
                        <p class="text-lg font-bold text-charcoal">Rp ${formatNumber(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Waktu Info -->
            <div class="mt-5 grid gap-3 rounded-xl border border-charcoal/5 bg-charcoal/2 p-4 sm:grid-cols-2">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-xl">⏰</div>
                <div>
                  <p class="text-xs font-semibold text-rose-700/80">Batas Waktu ke Kasir</p>
                  <p class="text-sm font-bold text-rose-700">${minutesLeft} menit lagi</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl">🕐</div>
                <div>
                  <p class="text-xs font-semibold text-charcoal/55">Waktu Order Dibuat</p>
                  <p class="text-sm font-bold text-charcoal">${new Date(order.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="mt-6 grid gap-3 sm:grid-cols-2">
              <button class="flex items-center justify-center gap-2 rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="acceptCash('${order.orderId}')">
                <span>✅</span>
                <span>Terima Tunai & Mulai Proses</span>
              </button>
              <button class="flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="cancelCash('${order.orderId}')">
                <span>❌</span>
                <span>Batalkan (No Show)</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Failed to load pending cash:', error);
  }
}

async function acceptCash(orderId) {
  const proceed = confirm(`Terima pembayaran tunai dan mulai proses barista?\n\nOrder: ${orderId}`);
  if (!proceed) return;
  try {
    const res = await fetch(`/api/orders/cash/accept/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedBy: 'kasir' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('✅ Tunai diterima, pesanan diproses');
      knownPendingCashIds.delete(orderId);
      loadPendingCash();
      loadProcessingOrders();
    } else {
      showNotification('❌ Gagal terima tunai: ' + (data.message || 'Unknown error'));
    }
  } catch (e) {
    showNotification('❌ Error: ' + e.message);
  }
}

async function cancelCash(orderId) {
  const reason = prompt(`Alasan pembatalan (opsional):`, 'No show di kasir');
  if (reason === null) return;
  try {
    const res = await fetch(`/api/orders/cash/cancel/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, cancelledBy: 'kasir' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('⏸️ Tunai dibatalkan. Customer diberi instruksi !lanjut');
      knownPendingCashIds.delete(orderId);
      loadPendingCash();
    } else {
      showNotification('❌ Gagal batalkan: ' + (data.message || 'Unknown error'));
    }
  } catch (e) {
    showNotification('❌ Error: ' + e.message);
  }
}

// Mark order as ready
async function markOrderReady(orderId, customerName) {
  const proceed = confirm(`Tandai pesanan siap untuk diambil?\n\nOrder: ${orderId}\nAtas Nama: ${customerName}\n\nCustomer akan dinotifikasi.`);
  if (!proceed) return;

  try {
    const res = await fetch(`/api/orders/ready/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markedBy: 'kasir' })
    });

    const data = await res.json();

    if (data.success) {
      showNotification(`✅ Pesanan siap untuk ${customerName}`);
      loadProcessingOrders();
      loadStats();
    } else {
      showNotification('❌ Gagal: ' + data.message);
    }
  } catch (error) {
    showNotification('❌ Error: ' + error.message);
  }
}

// Format number
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Initial load
window.addEventListener('DOMContentLoaded', () => {
  // Populate sound select
  const select = document.getElementById('notif-sound-select');
  if (select) {
    soundOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.file;
      option.textContent = opt.name;
      if (opt.file === selectedSound) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', e => changeNotifSound(e.target.value));
  }

  // Set initial sound toggle UI
  updateSoundToggleButtonUI();

  // Unlock audio on first user gesture
  ['click','touchstart','keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
      unlockAudio();
    }, { once: true, passive: true });
  });

  // Initialize default tab
  switchTab('qris');

  // Load all data (untuk update counters)
  loadPayments();
  loadProcessingOrders();
  loadReadyOrders();
  loadPendingCash();
  loadCancelledCash();

  // Bind modal buttons
  const cancelBtn = document.getElementById('reject-cancel');
  const submitBtn = document.getElementById('reject-submit');
  if (cancelBtn) cancelBtn.addEventListener('click', closeRejectModal);
  if (submitBtn) submitBtn.addEventListener('click', submitReject);

});

// Auto-refresh every 3 seconds
autoRefresh = setInterval(() => {
  loadPayments();
  loadProcessingOrders();
  loadReadyOrders();
  loadPendingCash();
  loadCancelledCash();
}, 3000);

// Expose modal open for inline onclick
function rejectPayment(orderId) {
  openRejectModal(orderId);
}

// Load cancelled cash orders (reopen-able)
async function loadCancelledCash() {
  try {
    const res = await fetch('/api/orders/cancelled-cash?withinWindow=true');
    const data = await res.json();

    const list = document.getElementById('cancelled-cash-list');
    if (!list) return;

    // Update tab counter
    updateTabCounters({ cancelled: data.orders ? data.orders.length : 0 });

    if (!data.orders || data.orders.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-rose-200 bg-rose-50 px-6 py-10 text-center text-sm">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-inner">🕊️</div>
          <h3 class="mt-5 text-lg font-semibold">Tidak ada pesanan tunai yang bisa dibuka kembali</h3>
          <p class="mt-2 text-charcoal/60">Daftar ini hanya menampilkan pesanan yang masih dalam window buka kembali.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = data.orders.map((order) => {
      const until = order.canReopenUntil ? new Date(order.canReopenUntil).toLocaleString('id-ID') : '-';
      const cancelledAt = order.cancelledAt ? new Date(order.cancelledAt).toLocaleString('id-ID') : '-';
      return `
        <div class="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_20px_45px_-38px_rgba(225,29,72,0.25)] transition hover:-translate-y-1">
          <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-rose-700/80">Cash Cancelled</p>
              <h4 class="mt-2 text-xl font-semibold">📋 ${order.orderId}</h4>
              <p class="text-sm text-charcoal font-semibold">👤 ${order.customerName}</p>
              <p class="text-xs text-charcoal/55">📱 ${order.userId}</p>
            </div>
            <div class="rounded-2xl bg-rose-50 px-5 py-3 text-right">
              <p class="text-xs uppercase tracking-[0.25em] text-rose-700/80">Total</p>
              <span class="text-3xl font-bold text-charcoal">Rp ${formatNumber(order.pricing.total)}</span>
            </div>
          </div>
          <div class="mt-5 rounded-2xl border border-charcoal/5 bg-charcoal/2 p-4">
            <div class="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal/50">Items (${order.items.length})</div>
            ${order.items.map(item => `
              <div class="border-b border-charcoal/5 py-2 text-sm last:border-0">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-charcoal/80">${item.name}</span>
                  <span class="text-charcoal/55">x${item.quantity} • Rp ${formatNumber(item.price * item.quantity)}</span>
                </div>
                ${item.notes ? `<p class="mt-1 text-sm font-semibold text-charcoal">📝 ${item.notes}</p>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="mt-4 grid gap-2 text-xs font-semibold text-charcoal/60 sm:grid-cols-3">
            <span>🛑 Dibatalkan: ${cancelledAt}</span>
            <span>🔁 Batas buka kembali: ${until}</span>
            <span>📄 Alasan: ${order.cancelReason || '-'}</span>
          </div>
          <div class="mt-5">
            <button class="w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="reopenCash('${order.orderId}')">🔁 Buka Kembali</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load cancelled cash:', err);
  }
}

// Reopen a cancelled cash order
async function reopenCash(orderId) {
  const proceed = confirm(`Buka kembali pesanan tunai ini?
\nOrder: ${orderId}`);
  if (!proceed) return;
  try {
    const res = await fetch(`/api/orders/cash/reopen/${orderId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showNotification('🔁 Pesanan tunai dibuka kembali');
      loadCancelledCash();
      loadPendingCash();
    } else {
      showNotification('❌ Gagal buka kembali: ' + (data.message || 'Unknown error'));
    }
  } catch (e) {
    showNotification('❌ Error: ' + e.message);
  }
}

// Run search
async function runSearch() {
  const qEl = document.getElementById('search-input');
  const statusEl = document.getElementById('search-status');
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  const q = encodeURIComponent((qEl?.value || '').trim());
  const status = encodeURIComponent((statusEl?.value || 'all').trim());
  try {
    const res = await fetch(`/api/orders/search?q=${q}&status=${status}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      resultsEl.innerHTML = `
        <div class="rounded-2xl border border-charcoal/10 bg-white/90 px-4 py-6 text-center text-sm">
          <div>🔎</div>
          <p class="mt-2 text-charcoal/60">Tidak ada hasil untuk pencarian ini.</p>
        </div>
      `;
      return;
    }
    resultsEl.innerHTML = data.results.map(r => renderSearchResult(r)).join('');
  } catch (e) {
    console.error('Search failed:', e);
  }
}

function renderSearchResult(r) {
  if (r.type === 'payment') {
    return `
      <div class="rounded-2xl border border-matcha/20 bg-matcha/10 p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.25em] text-matcha/80">Pembayaran Pending (QRIS)</p>
            <div class="mt-1 text-sm">📋 ${r.orderId} · 📱 ${r.userId}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-charcoal/55">Nominal</div>
            <div class="text-xl font-bold">Rp ${formatNumber(r.total)}</div>
          </div>
        </div>
      </div>
    `;
  }
  // order type
  const statusBadge = {
    PENDING_CASH: '💵 Menunggu Tunai',
    PROCESSING: '👨‍🍳 Diproses',
    READY: '✅ Siap',
    COMPLETED: '✔️ Selesai',
    CANCELLED: '⛔ Dibatalkan',
  }[r.status] || r.status;
  return `
    <div class="rounded-2xl border border-charcoal/10 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-charcoal/50">${statusBadge}</p>
          <div class="mt-1 text-sm">📋 ${r.orderId} · 👤 ${r.customerName} · 📱 ${r.userId} · 💳 ${r.paymentMethod}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-charcoal/55">Total</div>
          <div class="text-xl font-bold">Rp ${formatNumber(r.total || 0)}</div>
        </div>
      </div>
    </div>
  `;
}

// Load READY orders and render a panel with Complete buttons
async function loadReadyOrders() {
  try {
    const res = await fetch('/api/orders/ready-list/');
    const data = await res.json();
    const list = document.getElementById('ready-list');
    if (!list) return;

    // Update tab counter
    updateTabCounters({ ready: data.orders ? data.orders.length : 0 });

    if (!data.orders || data.orders.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-matcha/30 bg-matcha/5 px-6 py-10 text-center text-sm">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-inner">🧺</div>
          <h3 class="mt-5 text-lg font-semibold">Tidak ada pesanan siap diambil</h3>
          <p class="mt-2 text-charcoal/60">Pesanan yang sudah siap akan muncul di sini untuk ditandai selesai.</p>
        </div>`;
      return;
    }
    list.innerHTML = data.orders.map(order => {
      const readyAt = order.readyAt ? new Date(order.readyAt).toLocaleString('id-ID') : '-';
      return `
        <div class="rounded-3xl border border-white/60 bg-white/95 p-6 transition hover:-translate-y-1">
          <!-- Header -->
          <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex-1">
              <div class="inline-flex items-center gap-2 rounded-full bg-matcha/15 px-3 py-1 ring-2 ring-matcha/20">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-matcha">✅ Siap Diambil</span>
              </div>
              <h4 class="mt-3 text-2xl font-bold text-charcoal">📋 ${order.orderId}</h4>
              <div class="mt-2 space-y-1 text-sm">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-charcoal/60">Nama Customer:</span>
                  <span class="font-bold text-matcha">${order.customerName}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-charcoal/60">WhatsApp:</span>
                  <span class="font-mono text-charcoal">${order.userId}</span>
                </div>
              </div>
            </div>
            <div class="rounded-2xl border-2 border-cream bg-cream/50 px-6 py-4 text-right">
              <p class="text-xs font-bold uppercase tracking-[0.25em] text-charcoal/70">Total Pesanan</p>
              <span class="mt-1 block text-3xl font-extrabold text-charcoal">Rp ${formatNumber(order.pricing.total)}</span>
            </div>
          </div>

          <!-- Detail Pesanan -->
          <div class="mt-6">
            <div class="mb-3 flex items-center gap-2 border-b border-charcoal/10 pb-2">
              <span class="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">📦 Detail Pesanan</span>
              <span class="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs font-semibold text-charcoal/70">${order.items.length} Item</span>
            </div>
            <div class="space-y-2">
              ${order.items.map(item => `
                <div class="rounded-xl border border-charcoal/5 bg-white px-4 py-3">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <p class="font-semibold text-charcoal">${item.name}</p>
                      <div class="mt-1 flex items-center gap-3 text-xs text-charcoal/60">
                        <span class="font-semibold">Jumlah: <span class="text-matcha">${item.quantity}x</span></span>
                        <span>•</span>
                        <span>Harga satuan: Rp ${formatNumber(item.price)}</span>
                      </div>
                      ${item.notes ? `<div class="mt-2 rounded-lg bg-matcha/5 px-3 py-2"><p class="text-sm font-semibold text-charcoal">📝 Catatan: ${item.notes}</p></div>` : ''}
                    </div>
                    <div class="ml-4 text-right">
                      <p class="text-xs font-semibold text-charcoal/60">Subtotal</p>
                      <p class="text-lg font-bold text-charcoal">Rp ${formatNumber(item.price * item.quantity)}</p>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Status Info -->
          <div class="mt-5 flex items-center justify-between rounded-xl border border-matcha/10 bg-matcha/5 p-4">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl">🎉</div>
              <div>
                <p class="text-xs font-semibold text-matcha/80">Pesanan Siap Sejak</p>
                <p class="text-sm font-bold text-matcha">${readyAt}</p>
              </div>
            </div>
            <div class="text-right text-xs font-semibold text-charcoal/50">
              <p>Customer sudah dinotifikasi</p>
              <p>untuk mengambil pesanan</p>
            </div>
          </div>

          <!-- Action Button -->
          <button class="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-charcoal px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="completeOrder('${order.orderId}', '${order.customerName}')">
            <span>✔️</span>
            <span>Tandai Sudah Diambil & Selesai</span>
          </button>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load ready orders:', e);
  }
}

async function completeOrder(orderId, customerName) {
  const proceed = confirm(`Tandai pesanan sudah diambil dan selesai?\n\nOrder: ${orderId}\nAtas Nama: ${customerName}`);
  if (!proceed) return;
  try {
    const res = await fetch(`/api/orders/complete/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedBy: 'kasir' })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('✔️ Pesanan ditandai selesai');
      loadReadyOrders();
      loadStats();
    } else {
      showNotification('❌ Gagal tanda selesai: ' + (data.message || 'Unknown error'));
    }
  } catch (e) {
    showNotification('❌ Error: ' + e.message);
  }
}
