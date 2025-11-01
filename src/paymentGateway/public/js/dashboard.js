// Dashboard JavaScript

let autoRefresh;
let previousPaymentCount = 0;
let soundEnabled = true;
let knownPaymentIds = new Set();

// Notification sound (simple beep using Web Audio API)
function playNotificationSound() {
    if (!soundEnabled) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('Sound not supported');
    }
}

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle');
    btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
    btn.style.borderColor = soundEnabled ? '#667eea' : '#999';
}

// Show notification
function showNotification(text) {
    const notif = document.getElementById('notification');
    const notifText = document.getElementById('notification-text');
    notifText.textContent = text;
    notif.classList.remove('hidden');
    playNotificationSound();
    setTimeout(() => {
        notif.classList.add('hidden');
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
        badge.classList.remove('bg-rose-100','text-rose-700');
        badge.classList.add('bg-green-100','text-green-700');
    } catch (error) {
        console.error('Failed to load stats:', error);
        const badge = document.getElementById('status-badge');
        badge.textContent = '🔴 OFFLINE';
        badge.classList.remove('bg-green-100','text-green-700');
        badge.classList.add('bg-rose-100','text-rose-700');
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
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <h3>Tidak ada pending payment</h3>
                    <p style="margin-top: 10px;">Semua pembayaran sudah diproses</p>
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
                                <div class="rounded-2xl border border-gray-100 shadow hover:shadow-lg transition ${isNew ? 'ring-2 ring-matcha/50' : ''}">
                                    <div class="flex items-center justify-between p-5">
                                        <div>
                                            <div class="text-lg font-semibold">📋 ${payment.orderId}</div>
                                            <div class="text-sm text-gray-500">Customer: ${payment.customerId.split('@')[0]}</div>
                                        </div>
                                        <div class="text-2xl font-bold text-matcha">Rp ${formatNumber(payment.amount)}</div>
                                    </div>
                                    <div class="px-5 pb-3">
                                        <div class="rounded-xl bg-gray-50 border border-gray-100 p-4">
                                            <div class="font-semibold mb-2">Items (${payment.items.length}):</div>
                                            ${payment.items.map(item => `
                                                <div class="py-2 border-b last:border-b-0 text-sm flex items-center justify-between">
                                                    <span class="font-medium">${item.name}</span>
                                                    <span class="text-gray-600">x${item.quantity} • Rp ${formatNumber(item.price * item.quantity)}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div class="px-5 pb-4 text-sm text-gray-500">
                                        ⏰ Expires: ${new Date(payment.expiresAt).toLocaleString('id-ID')}
                                        <span class="ml-4">🕐 Created: ${new Date(payment.createdAt).toLocaleString('id-ID')}</span>
                                    </div>
                                    <div class="flex gap-2 p-5 pt-0">
                                        <button class="flex-1 px-4 py-2 rounded-lg bg-matcha text-white font-semibold hover:opacity-95 active:scale-[0.99] transition" onclick="confirmPayment('${payment.orderId}')">✅ Konfirmasi</button>
                                        <button class="flex-1 px-4 py-2 rounded-lg bg-rose-500 text-white font-semibold hover:opacity-95 active:scale-[0.99] transition" onclick="rejectPayment('${payment.orderId}')">❌ Tolak</button>
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
                                <div class="text-center py-16 text-gray-500">
                                    <div class="text-5xl mb-2">🎉</div>
                                    <h3 class="text-lg font-semibold">Tidak ada pesanan yang diproses</h3>
                                    <p class="mt-2">Semua pesanan sudah selesai</p>
                                </div>
            `;
        } else {
                        list.innerHTML = data.orders.map((order) => {
                const processingTime = Math.floor((Date.now() - new Date(order.confirmedAt)) / 60000);
                return `
                                <div class="rounded-2xl border border-gray-100 shadow hover:shadow-lg transition">
                                    <div class="flex items-center justify-between p-5">
                                        <div>
                                            <div class="text-lg font-semibold">📋 ${order.orderId}</div>
                                            <div class="text-matcha font-semibold">👤 Atas Nama: ${order.customerName}</div>
                                            <div class="text-sm text-gray-500">📱 ${order.userId}</div>
                                        </div>
                                        <div class="text-2xl font-bold text-charcoal">Rp ${formatNumber(order.pricing.total)}</div>
                                    </div>
                                    <div class="px-5 pb-3">
                                        <div class="rounded-xl bg-gray-50 border border-gray-100 p-4">
                                            <div class="font-semibold mb-2">Items (${order.items.length}):</div>
                                            ${order.items.map(item => `
                                                <div class="py-2 border-b last:border-b-0 text-sm">
                                                    <div class="flex items-center justify-between">
                                                        <span class="font-medium">${item.name}</span>
                                                        <span class="text-gray-600">x${item.quantity} • Rp ${formatNumber(item.price * item.quantity)}</span>
                                                    </div>
                                                    ${item.notes ? `<div class="text-xs text-gray-600 mt-1">📝 ${item.notes}</div>` : ''}
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div class="px-5 pb-4 text-sm text-gray-500">⏱️ Diproses: ${processingTime} menit yang lalu</div>
                                    <div class="p-5 pt-0">
                                        <button class="w-full px-4 py-3 rounded-lg bg-matcha text-white font-semibold hover:opacity-95 active:scale-[0.99] transition" onclick="markOrderReady('${order.orderId}', '${order.customerName}')">✅ Tandai Siap - Atas Nama: ${order.customerName}</button>
                                    </div>
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
loadPayments();
loadProcessingOrders();

// Auto-refresh every 3 seconds
autoRefresh = setInterval(() => {
    loadPayments();
    loadProcessingOrders();
}, 3000);
