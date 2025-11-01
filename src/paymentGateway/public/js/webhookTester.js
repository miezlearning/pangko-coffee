// Webhook Tester JavaScript

// Load pending orders
async function loadPendingOrders() {
    try {
        const res = await fetch('/api/payments/pending');
        const data = await res.json();
        
        const container = document.getElementById('pending-orders');
        
        if (data.payments.length === 0) {
            container.innerHTML = '<div class="rounded-2xl border border-dashed border-matcha/30 bg-matcha/10 px-5 py-6 text-center text-sm text-matcha/70">Tidak ada pending order 🎉</div>';
        } else {
            container.innerHTML = data.payments.map(p => {
                const expiresLabel = new Date(p.expiresAt).toLocaleTimeString('id-ID');
                const createdLabel = p.createdAt ? new Date(p.createdAt).toLocaleTimeString('id-ID') : 'Waktu tidak tersedia';
                return `
                <button class="group w-full rounded-2xl border border-charcoal/10 bg-white/90 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-matcha/40 hover:shadow-lg" onclick="selectOrder('${p.orderId}', ${p.amount})">
                    <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-charcoal/45">
                        <span>Order</span>
                        <span>Expires ${expiresLabel}</span>
                    </div>
                    <div class="mt-3 flex items-center justify-between">
                        <div class="text-lg font-semibold text-charcoal">📋 ${p.orderId}</div>
                        <span class="rounded-full bg-matcha/15 px-3 py-1 text-sm font-semibold text-matcha shadow-sm">Rp ${formatNumber(p.amount)}</span>
                    </div>
                    <p class="mt-2 text-xs text-charcoal/55">${p.items.length} items • Dibuat ${createdLabel}</p>
                </button>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load orders:', error);
    }
}

// Select order
function selectOrder(orderId, amount) {
    document.getElementById('orderId').value = orderId;
    document.getElementById('amount').value = amount;
}

// Send webhook
async function sendWebhook() {
    const orderId = document.getElementById('orderId').value;
    const status = document.getElementById('status').value;
    const amount = parseInt(document.getElementById('amount').value);
    const provider = document.getElementById('provider').value;
    
    if (!orderId || !amount) {
        alert('Please fill Order ID and Amount');
        return;
    }
    
    const responseDiv = document.getElementById('response');
    responseDiv.textContent = 'Sending webhook...';
    responseDiv.classList.remove('hidden');
    responseDiv.classList.remove('border-rose-300','bg-rose-50','text-rose-700','border-matcha/40','bg-matcha/10','text-matcha');
    
    try {
        const res = await fetch('/api/webhook/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId,
                status,
                amount,
                provider,
                timestamp: new Date().toISOString()
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            responseDiv.classList.add('border-matcha/40','bg-matcha/10','text-matcha');
            responseDiv.textContent = '✅ SUCCESS\n\n' + JSON.stringify(data, null, 2);
            
            // Reload orders
            setTimeout(loadPendingOrders, 1000);
        } else {
            responseDiv.classList.add('border-rose-300','bg-rose-50','text-rose-700');
            responseDiv.textContent = '❌ FAILED\n\n' + JSON.stringify(data, null, 2);
        }
    } catch (error) {
        responseDiv.classList.add('border-rose-300','bg-rose-50','text-rose-700');
        responseDiv.textContent = '❌ ERROR\n\n' + error.message;
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Load on start
loadPendingOrders();

// Auto-refresh every 10 seconds
setInterval(loadPendingOrders, 10000);
