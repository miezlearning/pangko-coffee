// Dashboard JavaScript

let autoRefresh;
let previousPaymentCount = 0;
let soundEnabled = true;
let knownPaymentIds = new Set();
let soundOptions = [
    { name: 'Efek 1', file: '/sounds/sound1.mp3' },
    { name: 'Efek 2', file: '/sounds/sound2.mp3' },
    { name: 'Efek 3', file: '/sounds/sound3.mp3' }
];
let selectedSound = localStorage.getItem('notifSound') || soundOptions[0].file;

// Notification sound (simple beep using Web Audio API)
function playNotificationSound() {
    if (!soundEnabled) return;
    const audio = new Audio(selectedSound);
    audio.volume = 0.7;
    audio.play();
}

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle');
    btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
    btn.classList.toggle('bg-matcha', soundEnabled);
    btn.classList.toggle('text-white', soundEnabled);
    btn.classList.toggle('border-transparent', soundEnabled);
    btn.classList.toggle('bg-white', !soundEnabled);
    btn.classList.toggle('text-matcha', !soundEnabled);
    btn.classList.toggle('border-matcha/60', !soundEnabled);
}

// Change notification sound
function changeNotifSound(file) {
    selectedSound = file;
    localStorage.setItem('notifSound', file);
    // Play preview
    const audio = new Audio(file);
    audio.volume = 0.7;
    audio.play();
}

// Show notification
function showNotification(text) {
    const notif = document.getElementById('notification');
    const notifText = document.getElementById('notification-text');
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
            document.getElementById('pending-count').textContent = data.stats.pendingCount;
            document.getElementById('today-orders').textContent = data.stats.todayOrders;
            document.getElementById('today-revenue').textContent = 'Rp ' + formatNumber(data.stats.todayRevenue);
            document.getElementById('total-orders').textContent = data.stats.totalOrders;
            
            // Check for new payments
            if (previousPaymentCount > 0 && data.stats.pendingCount > previousPaymentCount) {
                showNotification(`New payment detected! (${data.stats.pendingCount} pending)`);
            }
            previousPaymentCount = data.stats.pendingCount;
        }
        
        // Update status badge (Tailwind classes)
        const badge = document.getElementById('status-badge');
        badge.textContent = '🟢 ONLINE';
        badge.classList.remove('bg-rose-100','text-rose-700','border','border-rose-200');
        badge.classList.add('bg-matcha/15','text-matcha');
    } catch (error) {
        console.error('Failed to load stats:', error);
        const badge = document.getElementById('status-badge');
        badge.textContent = '🔴 OFFLINE';
        badge.classList.remove('bg-matcha/15','text-matcha');
        badge.classList.add('bg-rose-100','text-rose-700','border','border-rose-200');
    }
}

// Load pending payments
async function loadPayments() {
    try {
        const res = await fetch('/api/payments/pending');
        const data = await res.json();
        
        const list = document.getElementById('payments-list');
        
        if (data.payments.length === 0) {
            list.innerHTML = `
                <div class="rounded-3xl border border-dashed border-matcha/30 bg-matcha/5 px-6 py-10 text-center text-sm">
                    <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-inner">📭</div>
                    <h3 class="mt-5 text-lg font-semibold">Tidak ada pembayaran pending</h3>
                    <p class="mt-2 text-charcoal/60">Semua transaksi sudah clear. Tetap pantau notifikasi realtime.</p>
                </div>
            `;
        } else {
            // Check for new payments
            data.payments.forEach(payment => {
                if (!knownPaymentIds.has(payment.orderId)) {
                    knownPaymentIds.add(payment.orderId);
                    if (knownPaymentIds.size > 1) { // Skip first load
                        showNotification(`New order: ${payment.orderId} - Rp ${formatNumber(payment.amount)}`);
                    }
                }
            });
            
            list.innerHTML = data.payments.map((payment, index) => {
                const isNew = index === 0 && data.payments.length > previousPaymentCount;
                return `
                    <div class="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_20px_45px_-38px_rgba(51,51,51,0.6)] transition hover:-translate-y-1 hover:shadow-[0_30px_65px_-40px_rgba(116,166,98,0.55)] ${isNew ? 'ring-2 ring-matcha/40' : ''}">
                        <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-charcoal/45">Order ID</p>
                                <h4 class="mt-2 text-xl font-semibold">📋 ${payment.orderId}</h4>
                                <p class="text-sm text-charcoal/55">Customer • ${payment.customerId.split('@')[0]}</p>
                            </div>
                            <div class="rounded-2xl bg-matcha/10 px-5 py-3 text-right">
                                <p class="text-xs uppercase tracking-[0.25em] text-matcha/80">Nominal</p>
                                <span class="text-3xl font-bold text-matcha">Rp ${formatNumber(payment.amount)}</span>
                            </div>
                        </div>
                        <div class="mt-5 rounded-2xl border border-charcoal/5 bg-charcoal/2 p-4">
                            <div class="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal/50">Items (${payment.items.length})</div>
                            ${payment.items.map(item => `
                                <div class="flex items-center justify-between border-b border-charcoal/5 py-2 text-sm last:border-0">
                                    <span class="font-medium text-charcoal/80">${item.name}</span>
                                    <span class="text-charcoal/55">x${item.quantity} • Rp ${formatNumber(item.price * item.quantity)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-4 flex flex-col gap-2 text-xs font-semibold text-charcoal/55 sm:flex-row sm:items-center sm:justify-between">
                            <span>⏰ Kadaluarsa: ${new Date(payment.expiresAt).toLocaleString('id-ID')}</span>
                            <span>🕐 Dibuat: ${new Date(payment.createdAt).toLocaleString('id-ID')}</span>
                        </div>
                        <div class="mt-5 grid gap-3 sm:grid-cols-2">
                            <button class="rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="confirmPayment('${payment.orderId}')">✅ Konfirmasi & Kirim Notif</button>
                            <button class="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="rejectPayment('${payment.orderId}')">❌ Tolak Pembayaran</button>
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
    if (!confirm(`Konfirmasi pembayaran untuk order ${orderId}?\n\nCustomer dan barista akan dinotifikasi.`)) return;
    
    try {
        const res = await fetch(`/api/payments/confirm/${orderId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmedBy: 'kasir' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('✅ Pembayaran dikonfirmasi!\n\nNotifikasi sudah dikirim ke:\n• Customer\n• Barista');
            knownPaymentIds.delete(orderId);
            loadPayments();
        } else {
            alert('❌ Gagal: ' + data.message);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

// Reject payment
async function rejectPayment(orderId) {
    const reason = prompt('Alasan penolakan:', 'Pembayaran tidak ditemukan');
    if (!reason) return;
    
    try {
        const res = await fetch(`/api/payments/reject/${orderId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('✅ Pembayaran ditolak');
            knownPaymentIds.delete(orderId);
            loadPayments();
        } else {
            alert('❌ Gagal: ' + data.message);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

// Load processing orders
async function loadProcessingOrders() {
    try {
        const res = await fetch('/api/orders/processing');
        const data = await res.json();
        
        const list = document.getElementById('processing-list');
        
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
                        <div class="flex flex-col gap-4 border-b border-charcoal/5 pb-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-charcoal/45">Order Process</p>
                                <h4 class="mt-2 text-xl font-semibold">📋 ${order.orderId}</h4>
                                <p class="text-sm text-matcha font-semibold">👤 ${order.customerName}</p>
                                <p class="text-xs text-charcoal/55">📱 ${order.userId}</p>
                            </div>
                            <div class="rounded-2xl bg-peach/25 px-5 py-3 text-right">
                                <p class="text-xs uppercase tracking-[0.25em] text-peach-800">Total</p>
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
                                    ${item.notes ? `<p class="mt-1 text-xs text-charcoal/45">📝 ${item.notes}</p>` : ''}
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-4 flex flex-col gap-2 text-xs font-semibold text-charcoal/55 sm:flex-row sm:items-center sm:justify-between">
                            <span>⏱️ Diproses: ${processingTime} menit yang lalu</span>
                            <span>👨‍🍳 Barista update realtime</span>
                        </div>
                        <button class="mt-5 w-full rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg" onclick="markOrderReady('${order.orderId}', '${order.customerName}')">✅ Tandai Siap - Atas Nama: ${order.customerName}</button>
                    </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load processing orders:', error);
    }
}

// Mark order as ready
async function markOrderReady(orderId, customerName) {
    if (!confirm(`Tandai pesanan siap untuk diambil?\n\nOrder: ${orderId}\nAtas Nama: ${customerName}\n\nCustomer akan dinotifikasi.`)) return;
    
    try {
        const res = await fetch(`/api/orders/ready/${orderId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markedBy: 'kasir' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert(`✅ Pesanan ditandai siap!\n\nOrder: ${orderId}\nAtas Nama: ${customerName}\n\nCustomer sudah dinotifikasi:\n"Atas nama ${customerName}, pesanan sudah siap!"`);
            loadProcessingOrders();
            loadStats();
        } else {
            alert('❌ Gagal: ' + data.message);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
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
    loadPayments();
    loadProcessingOrders();
});

// Auto-refresh every 3 seconds
autoRefresh = setInterval(() => {
    loadPayments();
    loadProcessingOrders();
}, 3000);
