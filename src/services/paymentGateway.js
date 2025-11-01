/**
 * Enhanced Payment Gateway - Express Server
 * Dashboard untuk kasir konfirmasi pembayaran + Webhook Simulator
 * 
 * Features:
 * - Real-time order monitoring dengan auto-refresh
 * - One-click payment confirmation
 * - Auto-trigger bot to confirm
 * - Webhook simulator untuk testing
 * - Sound notifications
 * - Payment analytics
 * 
 * 100% FREE & SELF-HOSTED!
 */

const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (bisa diganti database)
let pendingPayments = [];
let paymentHistory = [];
let botInstance = null; // Will be set by bot
let webhookSubscribers = []; // For webhook testing

/**
 * Set bot instance (called by main bot)
 */
function setBotInstance(bot) {
    botInstance = bot;
    console.log('✅ Bot instance connected to payment gateway');
}

/**
 * Register new payment (called by bot when customer checkout)
 */
function registerPayment(orderData) {
    const payment = {
        id: orderData.orderId,
        orderId: orderData.orderId,
        customerId: orderData.userId,
        amount: orderData.pricing.total,
        items: orderData.items,
        status: 'pending',
        qrisCode: orderData.qrisCode,
        createdAt: new Date(),
        expiresAt: orderData.paymentExpiry
    };
    
    pendingPayments.push(payment);
    console.log(`📝 Payment registered: ${payment.id} - Rp ${payment.amount}`);
    
    return payment;
}

/**
 * API: Get all pending payments
 */
app.get('/api/payments/pending', (req, res) => {
    // Remove expired payments
    const now = new Date();
    pendingPayments = pendingPayments.filter(p => new Date(p.expiresAt) > now);
    
    res.json({
        success: true,
        count: pendingPayments.length,
        payments: pendingPayments
    });
});

/**
 * API: Confirm payment (kasir click button)
 */
app.post('/api/payments/confirm/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { confirmedBy } = req.body;
    
    console.log(`✅ Payment confirmation request: ${orderId} by ${confirmedBy}`);
    
    // Find payment
    const paymentIndex = pendingPayments.findIndex(p => p.orderId === orderId);
    
    if (paymentIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Payment not found'
        });
    }
    
    const payment = pendingPayments[paymentIndex];
    
    // Update status
    payment.status = 'confirmed';
    payment.confirmedAt = new Date();
    payment.confirmedBy = confirmedBy || 'kasir';
    
    // Move to history
    paymentHistory.push(payment);
    pendingPayments.splice(paymentIndex, 1);
    
    // Trigger bot to confirm order
    if (botInstance) {
        try {
            await triggerBotConfirmation(payment);
            
            res.json({
                success: true,
                message: 'Payment confirmed successfully',
                payment: payment
            });
        } catch (error) {
            console.error('Bot trigger error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to trigger bot confirmation'
            });
        }
    } else {
        res.json({
            success: true,
            message: 'Payment confirmed (bot not connected)',
            payment: payment
        });
    }
});

/**
 * API: Reject payment
 */
app.post('/api/payments/reject/:orderId', (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    const paymentIndex = pendingPayments.findIndex(p => p.orderId === orderId);
    
    if (paymentIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Payment not found'
        });
    }
    
    const payment = pendingPayments[paymentIndex];
    payment.status = 'rejected';
    payment.rejectedAt = new Date();
    payment.rejectionReason = reason;
    
    paymentHistory.push(payment);
    pendingPayments.splice(paymentIndex, 1);
    
    res.json({
        success: true,
        message: 'Payment rejected',
        payment: payment
    });
});

/**
 * API: Get payment history
 */
app.get('/api/payments/history', (req, res) => {
    res.json({
        success: true,
        count: paymentHistory.length,
        payments: paymentHistory.slice(-50) // Last 50
    });
});

/**
 * API: Dashboard stats
 */
app.get('/api/stats', (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPayments = paymentHistory.filter(p => 
        new Date(p.confirmedAt) >= today
    );
    
    const todayRevenue = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
        success: true,
        stats: {
            pendingCount: pendingPayments.length,
            todayOrders: todayPayments.length,
            todayRevenue: todayRevenue,
            totalOrders: paymentHistory.length
        }
    });
});

/**
 * ========================================
 * WEBHOOK SIMULATOR - FOR TESTING ONLY
 * ========================================
 */

/**
 * API: Simulate payment webhook (untuk testing)
 * Endpoint ini mensimulasikan callback dari payment gateway
 */
app.post('/api/webhook/simulate', async (req, res) => {
    const { orderId, status, amount, provider } = req.body;
    
    console.log(`🧪 [WEBHOOK SIMULATOR] Received payment notification:`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Status: ${status}`);
    console.log(`   Amount: Rp ${formatNumber(amount)}`);
    console.log(`   Provider: ${provider || 'simulator'}`);
    
    // Validate
    if (!orderId || !status) {
        return res.status(400).json({
            success: false,
            message: 'Missing orderId or status'
        });
    }
    
    // Find payment
    const paymentIndex = pendingPayments.findIndex(p => p.orderId === orderId);
    
    if (paymentIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Order not found in pending payments'
        });
    }
    
    const payment = pendingPayments[paymentIndex];
    
    // Handle different status
    if (status === 'success' || status === 'settlement' || status === 'paid') {
        // Auto-confirm payment
        payment.status = 'confirmed';
        payment.confirmedAt = new Date();
        payment.confirmedBy = provider || 'webhook-simulator';
        payment.paymentMethod = req.body.paymentMethod || 'QRIS';
        
        // Move to history
        paymentHistory.push(payment);
        pendingPayments.splice(paymentIndex, 1);
        
        // Trigger bot confirmation
        if (botInstance) {
            try {
                await triggerBotConfirmation(payment);
                
                console.log(`✅ [WEBHOOK] Payment auto-confirmed: ${orderId}`);
                
                res.json({
                    success: true,
                    message: 'Payment confirmed automatically via webhook',
                    payment: payment
                });
            } catch (error) {
                console.error('❌ [WEBHOOK] Bot trigger error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Payment recorded but bot notification failed',
                    error: error.message
                });
            }
        } else {
            res.json({
                success: true,
                message: 'Payment confirmed (bot not connected)',
                payment: payment
            });
        }
    } else if (status === 'failed' || status === 'expired') {
        // Reject payment
        payment.status = 'rejected';
        payment.rejectedAt = new Date();
        payment.rejectionReason = `Webhook: ${status}`;
        
        paymentHistory.push(payment);
        pendingPayments.splice(paymentIndex, 1);
        
        res.json({
            success: true,
            message: `Payment ${status}`,
            payment: payment
        });
    } else {
        res.status(400).json({
            success: false,
            message: `Unknown status: ${status}`
        });
    }
});

/**
 * API: Get webhook testing page
 */
app.get('/webhook-tester', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Webhook Simulator</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container { max-width: 800px; margin: 0 auto; }
        .card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            margin-bottom: 20px;
        }
        h1 { color: #333; margin-bottom: 10px; }
        .badge {
            display: inline-block;
            background: #f44336;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #555;
        }
        input, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
            background: #f5f5f5;
            color: #333;
            margin-top: 10px;
        }
        .btn-secondary:hover {
            background: #e0e0e0;
        }
        .pending-orders {
            margin-top: 20px;
        }
        .order-item {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .order-item:hover {
            background: #f0f0f0;
            transform: translateX(5px);
        }
        .order-id {
            font-weight: bold;
            color: #667eea;
        }
        .order-amount {
            color: #4CAF50;
            font-weight: bold;
        }
        .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196F3;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .response {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 12px;
            display: none;
        }
        .response.show { display: block; }
        .response.success { background: #e8f5e9; border-left: 4px solid #4CAF50; }
        .response.error { background: #ffebee; border-left: 4px solid #f44336; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>🧪 Webhook Simulator</h1>
            <div class="badge">TESTING ONLY</div>
            
            <div class="info-box">
                <strong>⚠️ Mode Testing:</strong><br>
                Gunakan tool ini untuk mensimulasikan notifikasi pembayaran dari payment gateway.
                Berguna untuk development & testing tanpa real payment.
            </div>
            
            <div class="form-group">
                <label>Select Pending Order:</label>
                <div id="pending-orders">
                    <p style="color: #999;">Loading...</p>
                </div>
            </div>
            
            <div class="form-group">
                <label>Order ID:</label>
                <input type="text" id="orderId" placeholder="CF123456" required>
            </div>
            
            <div class="form-group">
                <label>Payment Status:</label>
                <select id="status">
                    <option value="success">✅ Success (Paid)</option>
                    <option value="settlement">✅ Settlement (Confirmed)</option>
                    <option value="failed">❌ Failed</option>
                    <option value="expired">⏰ Expired</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Amount (Rp):</label>
                <input type="number" id="amount" placeholder="50000" required>
            </div>
            
            <div class="form-group">
                <label>Provider/Gateway:</label>
                <input type="text" id="provider" placeholder="webhook-simulator" value="webhook-simulator">
            </div>
            
            <button class="btn-primary" onclick="sendWebhook()">
                🚀 Simulate Payment Webhook
            </button>
            
            <button class="btn-secondary" onclick="loadPendingOrders()">
                🔄 Refresh Pending Orders
            </button>
            
            <div id="response" class="response"></div>
        </div>
    </div>
    
    <script>
        // Load pending orders
        async function loadPendingOrders() {
            try {
                const res = await fetch('/api/payments/pending');
                const data = await res.json();
                
                const container = document.getElementById('pending-orders');
                
                if (data.payments.length === 0) {
                    container.innerHTML = '<p style="color: #999;">No pending orders</p>';
                } else {
                    container.innerHTML = data.payments.map(p => \`
                        <div class="order-item" onclick="selectOrder('\${p.orderId}', \${p.amount})">
                            <div class="order-id">📋 \${p.orderId}</div>
                            <div class="order-amount">💰 Rp \${formatNumber(p.amount)}</div>
                            <div style="font-size: 12px; color: #999; margin-top: 5px;">
                                \${p.items.length} items • Expires: \${new Date(p.expiresAt).toLocaleTimeString('id-ID')}
                            </div>
                        </div>
                    \`).join('');
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
            responseDiv.className = 'response show';
            
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
                    responseDiv.className = 'response show success';
                    responseDiv.textContent = '✅ SUCCESS\\n\\n' + JSON.stringify(data, null, 2);
                    
                    // Reload orders
                    setTimeout(loadPendingOrders, 1000);
                } else {
                    responseDiv.className = 'response show error';
                    responseDiv.textContent = '❌ FAILED\\n\\n' + JSON.stringify(data, null, 2);
                }
            } catch (error) {
                responseDiv.className = 'response show error';
                responseDiv.textContent = '❌ ERROR\\n\\n' + error.message;
            }
        }
        
        function formatNumber(num) {
            return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
        }
        
        // Load on start
        loadPendingOrders();
        
        // Auto-refresh every 10 seconds
        setInterval(loadPendingOrders, 10000);
    </script>
</body>
</html>
    `);
});

/**
 * Trigger bot to confirm order
 */
async function triggerBotConfirmation(payment) {
    if (!botInstance || !botInstance.sock) {
        throw new Error('Bot not connected');
    }
    
    const orderManager = require('./orderManager');
    const order = orderManager.getOrder(payment.orderId);
    
    if (!order) {
        throw new Error('Order not found');
    }
    
    // Update order status
    orderManager.updateOrderStatus(payment.orderId, orderManager.STATUS.PAID);
    orderManager.updateOrderStatus(payment.orderId, orderManager.STATUS.PROCESSING);
    
    console.log(`🎉 Auto-confirmed via dashboard: ${payment.orderId}`);
    
    // Notify customer
    await botInstance.sock.sendMessage(order.userId, {
        text: `🎉 *PEMBAYARAN DIKONFIRMASI!*\n\n` +
              `Order ID: *${payment.orderId}*\n` +
              `Total: Rp ${formatNumber(order.pricing.total)}\n\n` +
              `✅ Pembayaran berhasil dikonfirmasi oleh kasir!\n\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `👨‍🍳 Pesanan Anda sedang diproses barista.\n` +
              `⏱️ Estimasi waktu: 10-15 menit\n\n` +
              `Kami akan mengirim notifikasi saat pesanan siap!`
    });
    
    // Notify barista
    const config = require('../config/config');
    let text = `🔔 *PESANAN BARU!*\n\n`;
    text += `📋 Order ID: *${order.orderId}*\n`;
    text += `👤 Customer: ${order.userId.split('@')[0]}\n`;
    text += `💰 Total: Rp ${formatNumber(order.pricing.total)}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `*Items:*\n`;
    
    order.items.forEach((item, index) => {
        text += `${index + 1}. ${item.name} x${item.quantity}\n`;
    });
    
    text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `⚠️ Silakan proses pesanan ini!\n\n`;
    text += `Ketik *!ready ${order.orderId}* setelah selesai.`;
    
    // Send to barista (but skip if barista number is same as customer)
    for (const baristaNumber of config.shop.baristaNumbers) {
        // Skip sending to customer who made the order
        if (baristaNumber === order.userId) {
            console.log(`⏭️ Skipping notification to ${baristaNumber} (same as customer)`);
            continue;
        }
        
        try {
            await botInstance.sock.sendMessage(baristaNumber, { text });
        } catch (error) {
            console.error(`Failed to notify barista:`, error);
        }
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Serve enhanced dashboard HTML with sound notifications
 */
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Payment Gateway Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        h1 { color: #333; margin-bottom: 5px; }
        .header-left { flex: 1; }
        .header-right {
            display: flex;
            gap: 10px;
        }
        .badge {
            display: inline-block;
            background: #4CAF50;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge.offline {
            background: #999;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
        }
        .stat-label { 
            color: #666; 
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .payments-section {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        h2 { color: #333; }
        .payment-card {
            border: 2px solid #e0e0e0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
            transition: all 0.3s;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .payment-card:hover {
            border-color: #667eea;
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.2);
        }
        .payment-card.new {
            animation: pulse 1s ease-in-out 3;
            border-color: #4CAF50;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
        }
        .payment-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .order-id {
            font-weight: bold;
            font-size: 20px;
            color: #333;
        }
        .amount {
            font-size: 24px;
            font-weight: bold;
            color: #4CAF50;
        }
        .customer-info {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
        }
        .items {
            margin: 15px 0;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid #f0f0f0;
        }
        .item { 
            padding: 8px 0;
            color: #666;
            border-bottom: 1px solid #f5f5f5;
        }
        .item:last-child {
            border-bottom: none;
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            transition: all 0.3s;
            flex: 1;
        }
        .btn-confirm {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
        }
        .btn-confirm:hover { 
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(76, 175, 80, 0.4);
        }
        .btn-reject {
            background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
            color: white;
        }
        .btn-reject:hover { 
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(244, 67, 54, 0.4);
        }
        .btn-refresh {
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
            padding: 10px 20px;
        }
        .btn-refresh:hover { 
            background: #667eea;
            color: white;
        }
        .btn-webhook {
            background: #ff9800;
            color: white;
            padding: 10px 20px;
        }
        .btn-webhook:hover {
            background: #f57c00;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }
        .empty-state-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .timer {
            font-size: 13px;
            color: #f44336;
            margin-top: 8px;
            font-weight: 600;
        }
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideInRight 0.3s ease-out;
            display: none;
        }
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        .notification.show {
            display: block;
        }
        .sound-toggle {
            cursor: pointer;
            padding: 10px 20px;
            background: white;
            border: 2px solid #667eea;
            border-radius: 8px;
            color: #667eea;
            font-weight: bold;
        }
        .sound-toggle:hover {
            background: #667eea;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <h1>☕ Coffee Shop - Payment Gateway</h1>
                <p style="color: #666;">Dashboard Kasir • Auto-refresh setiap 3 detik</p>
                <span class="badge" id="status-badge">🟢 ONLINE</span>
            </div>
            <div class="header-right">
                <button class="sound-toggle" id="sound-toggle" onclick="toggleSound()">
                    🔔 Sound: ON
                </button>
                <button class="btn-webhook" onclick="window.open('/webhook-tester', '_blank')">
                    🧪 Webhook Tester
                </button>
            </div>
        </div>
        
        <div class="stats" id="stats">
            <div class="stat-card">
                <div class="stat-label">⏳ Pending Payments</div>
                <div class="stat-value" id="pending-count">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">📦 Today's Orders</div>
                <div class="stat-value" id="today-orders">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">💰 Today's Revenue</div>
                <div class="stat-value" id="today-revenue">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">📊 Total Orders</div>
                <div class="stat-value" id="total-orders">-</div>
            </div>
        </div>
        
        <div class="payments-section">
            <div class="section-header">
                <h2>⏳ Pending Payments</h2>
                <button class="btn-refresh" onclick="loadPayments()">🔄 Refresh</button>
            </div>
            <div id="payments-list"></div>
        </div>
    </div>
    
    <div class="notification" id="notification">
        <h3>🔔 New Payment!</h3>
        <p id="notification-text"></p>
    </div>
    
    <script>
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
            notif.classList.add('show');
            
            playNotificationSound();
            
            setTimeout(() => {
                notif.classList.remove('show');
            }, 5000);
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
                        showNotification(\`New payment detected! (\${data.stats.pendingCount} pending)\`);
                    }
                    previousPaymentCount = data.stats.pendingCount;
                }
                
                // Update status badge
                document.getElementById('status-badge').innerHTML = '🟢 ONLINE';
                document.getElementById('status-badge').classList.remove('offline');
            } catch (error) {
                console.error('Failed to load stats:', error);
                document.getElementById('status-badge').innerHTML = '🔴 OFFLINE';
                document.getElementById('status-badge').classList.add('offline');
            }
        }
        
        // Load pending payments
        async function loadPayments() {
            try {
                const res = await fetch('/api/payments/pending');
                const data = await res.json();
                
                const list = document.getElementById('payments-list');
                
                if (data.payments.length === 0) {
                    list.innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-state-icon">📭</div>
                            <h3>Tidak ada pending payment</h3>
                            <p style="margin-top: 10px;">Semua pembayaran sudah diproses</p>
                        </div>
                    \`;
                } else {
                    // Check for new payments
                    data.payments.forEach(payment => {
                        if (!knownPaymentIds.has(payment.orderId)) {
                            knownPaymentIds.add(payment.orderId);
                            if (knownPaymentIds.size > 1) { // Skip first load
                                showNotification(\`New order: \${payment.orderId} - Rp \${formatNumber(payment.amount)}\`);
                            }
                        }
                    });
                    
                    list.innerHTML = data.payments.map((payment, index) => {
                        const isNew = index === 0 && data.payments.length > previousPaymentCount;
                        return \`
                        <div class="payment-card \${isNew ? 'new' : ''}">
                            <div class="payment-header">
                                <div>
                                    <div class="order-id">📋 \${payment.orderId}</div>
                                    <div class="customer-info">Customer: \${payment.customerId.split('@')[0]}</div>
                                </div>
                                <div class="amount">Rp \${formatNumber(payment.amount)}</div>
                            </div>
                            <div class="items">
                                <strong>Items (\${payment.items.length}):</strong>
                                \${payment.items.map(item => \`
                                    <div class="item">
                                        <span style="font-weight: 600;">\${item.name}</span>
                                        <span style="float: right;">x\${item.quantity} • Rp \${formatNumber(item.price * item.quantity)}</span>
                                    </div>
                                \`).join('')}
                            </div>
                            <div class="timer">
                                ⏰ Expires: \${new Date(payment.expiresAt).toLocaleString('id-ID')}
                                <span style="margin-left: 15px;">🕐 Created: \${new Date(payment.createdAt).toLocaleString('id-ID')}</span>
                            </div>
                            <div class="actions">
                                <button class="btn-confirm" onclick="confirmPayment('\${payment.orderId}')">
                                    ✅ Konfirmasi Pembayaran
                                </button>
                                <button class="btn-reject" onclick="rejectPayment('\${payment.orderId}')">
                                    ❌ Tolak
                                </button>
                            </div>
                        </div>
                    \`;
                    }).join('');
                }
                
                loadStats();
            } catch (error) {
                console.error('Failed to load payments:', error);
            }
        }
        
        // Confirm payment
        async function confirmPayment(orderId) {
            if (!confirm(\`Konfirmasi pembayaran untuk order \${orderId}?\\n\\nCustomer dan barista akan dinotifikasi.\`)) return;
            
            try {
                const res = await fetch(\`/api/payments/confirm/\${orderId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmedBy: 'kasir' })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    alert('✅ Pembayaran dikonfirmasi!\\n\\nNotifikasi sudah dikirim ke:\\n• Customer\\n• Barista');
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
                const res = await fetch(\`/api/payments/reject/\${orderId}\`, {
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
        
        // Format number
        function formatNumber(num) {
            return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
        }
        
        // Initial load
        loadPayments();
        
        // Auto-refresh every 3 seconds
        autoRefresh = setInterval(loadPayments, 3000);
    </script>
</body>
</html>
    `);
});

// Start server
const PORT = process.env.PORT || 3000;

function startServer() {
    app.listen(PORT, () => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💳 Payment Gateway Dashboard Started!');
        console.log(`📱 Open: http://localhost:${PORT}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
}

module.exports = {
    app,
    startServer,
    setBotInstance,
    registerPayment
};