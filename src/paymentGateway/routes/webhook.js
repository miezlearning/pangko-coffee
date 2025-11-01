/**
 * Webhook Routes
 * Endpoints untuk webhook simulator & testing
 */
const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const path = require('path');
const PaymentProvider = require('../../services/paymentProvider');

/**
 * Format number helper
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Trigger bot confirmation for webhook
 */
async function triggerBotConfirmation(payment) {
    const botInstance = dataStore.getBotInstance();
    const orderManager = require('../../services/orderManager');
    const config = require('../../config/config');
    
    if (!botInstance || !botInstance.sock) {
        throw new Error('Bot not connected');
    }
    
    // Update order status to PROCESSING
    orderManager.updateOrderStatus(payment.orderId, orderManager.STATUS.PROCESSING);
    
    const order = orderManager.getOrder(payment.orderId);
    
    if (!order) {
        throw new Error('Order not found in orderManager');
    }
    
    // Notify customer
    const customerText = `✅ *Pembayaran Diterima!*\n\n` +
        `📋 Order ID: *${payment.orderId}*\n` +
        `👤 Atas Nama: *${order.customerName || 'Customer'}*\n` +
        `💰 Total: *Rp ${payment.amount.toLocaleString('id-ID')}*\n\n` +
        `Pesanan Anda sedang diproses oleh barista.\n` +
        `Anda akan diberi notifikasi saat pesanan siap! ⏰`;
    
    await botInstance.sock.sendMessage(order.userId, { text: customerText });
    
    // Notify baristas
    const baristaText = `🔔 *Pesanan Baru Masuk!*\n\n` +
        `📋 Order ID: *${payment.orderId}*\n` +
        `👤 Atas Nama: *${order.customerName || 'Customer'}*\n` +
        `👨‍💼 Customer: ${order.userId.split('@')[0]}\n` +
        `💰 Total: *Rp ${payment.amount.toLocaleString('id-ID')}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*PESANAN:*\n${order.items.map((item, idx) => 
            `${idx + 1}. ${item.name} (${item.size}) x${item.quantity}${item.notes ? `\n   📝 ${item.notes}` : ''}`
        ).join('\n')}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Silakan proses pesanan ini! 👨‍🍳`;
    
    // Send to all baristas
    for (const baristaNumber of config.baristaNumbers) {
        try {
            await botInstance.sock.sendMessage(baristaNumber, { text: baristaText });
        } catch (err) {
            console.error(`Failed to notify barista ${baristaNumber}:`, err);
        }
    }
    
    console.log(`✅ Payment confirmed via webhook: ${payment.orderId}`);
}

/**
 * POST /api/webhook/simulate
 * Simulate payment webhook (untuk testing)
 */
router.post('/simulate', async (req, res) => {
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
    const payment = dataStore.findPendingPayment(orderId);
    
    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Order not found in pending payments'
        });
    }
    
    // Handle different status
    if (status === 'success' || status === 'settlement' || status === 'paid') {
        // Auto-confirm payment
        payment.status = 'confirmed';
        payment.confirmedAt = new Date();
        payment.confirmedBy = provider || 'webhook-simulator';
        payment.paymentMethod = req.body.paymentMethod || 'QRIS';
        
        // Remove from pending and add to history
        dataStore.removePendingPayment(orderId);
        dataStore.addToHistory(payment);
        
        // Trigger bot confirmation
        const botInstance = dataStore.getBotInstance();
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
        
        dataStore.removePendingPayment(orderId);
        dataStore.addToHistory(payment);
        
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
 * GET /webhook-tester
 * Webhook testing page
 */
router.get('/tester', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/webhookTester.html'));
});

module.exports = router;

/**
 * POST /api/webhook/provider
 * Real provider webhook endpoint (signature verification + auto-confirm)
 */
router.post('/provider', async (req, res) => {
    try {
        if (!PaymentProvider.isEnabled()) {
            return res.status(400).json({ success: false, message: 'Payment provider is disabled' });
        }
        // Verify signature/token
        const ok = PaymentProvider.verifySignature(req);
        if (!ok) {
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
        const payload = PaymentProvider.parseWebhook(req);
        if (!payload.orderId) {
            return res.status(400).json({ success: false, message: 'Missing order reference' });
        }

        const payment = dataStore.findPendingPayment(payload.orderId);
        if (!payment) {
            // Idempotency or already processed; accept silently
            return res.json({ success: true, message: 'Payment already processed or not pending' });
        }

        if (payload.status === 'paid') {
            // Confirm payment
            payment.status = 'confirmed';
            payment.confirmedAt = new Date();
            payment.confirmedBy = (require('../../config/config').paymentProvider.name || 'provider');
            payment.paymentMethod = 'QRIS';
            dataStore.removePendingPayment(payload.orderId);
            dataStore.addToHistory(payment);

            try {
                await triggerBotConfirmation(payment);
            } catch (e) {
                console.warn('[provider webhook] bot notify failed:', e.message);
            }
            return res.json({ success: true, message: 'Payment confirmed' });
        } else if (payload.status === 'failed') {
            payment.status = 'rejected';
            payment.rejectedAt = new Date();
            payment.rejectionReason = `Provider: ${payload.rawStatus || 'failed'}`;
            dataStore.removePendingPayment(payload.orderId);
            dataStore.addToHistory(payment);
            return res.json({ success: true, message: 'Payment marked failed' });
        } else {
            // pending or unknown → acknowledge
            return res.json({ success: true, message: 'Event acknowledged', status: payload.status });
        }
    } catch (err) {
        console.error('Provider webhook error:', err);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});
