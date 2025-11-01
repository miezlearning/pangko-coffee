// Webhook Tester JavaScript

// Load pending orders
async function loadPendingOrders() {
    try {
        const res = await fetch('/api/payments/pending');
        const data = await res.json();
        
        const container = document.getElementById('pending-orders');
        
        if (data.payments.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">No pending orders</p>';
        } else {
            container.innerHTML = data.payments.map(p => `
                <button class="w-full text-left rounded-xl border border-gray-200 hover:border-matcha/50 hover:shadow transition p-3" onclick="selectOrder('${p.orderId}', ${p.amount})">
                  <div class="flex items-center justify-between">
                    <div class="font-semibold">📋 ${p.orderId}</div>
                    <div class="font-bold text-matcha">Rp ${formatNumber(p.amount)}</div>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">${p.items.length} items • Expires: ${new Date(p.expiresAt).toLocaleTimeString('id-ID')}</div>
                </button>
            `).join('');
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
    responseDiv.classList.remove('bg-rose-50','border-rose-400','bg-green-50','border-green-400');
    
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
            responseDiv.classList.add('bg-green-50','border-green-400');
            responseDiv.textContent = '✅ SUCCESS\n\n' + JSON.stringify(data, null, 2);
            
            // Reload orders
            setTimeout(loadPendingOrders, 1000);
        } else {
            responseDiv.classList.add('bg-rose-50','border-rose-400');
            responseDiv.textContent = '❌ FAILED\n\n' + JSON.stringify(data, null, 2);
        }
    } catch (error) {
        responseDiv.classList.add('bg-rose-50','border-rose-400');
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
