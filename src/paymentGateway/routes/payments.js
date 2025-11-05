/**
 * Payment Routes
 * Endpoints untuk payment management
 */
const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { formatAddonLines } = require('../../utils/addonHelpers');

function describeOrderItem(item, idx) {
    const sizePart = item && item.size ? ` (${item.size})` : '';
    const quantity = Number(item && item.quantity ? item.quantity : 0);
    const lines = [`${idx + 1}. ${(item && item.name) || 'Item'}${sizePart} x${quantity}`];
    if (Array.isArray(item?.addons) && item.addons.length > 0) {
        lines.push(formatAddonLines(item.addons));
    }
    if (item?.notes) {
        lines.push(`   📝 ${item.notes}`);
    }
    return lines.join('\n');
}

/**
 * Trigger bot confirmation
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
    const items = Array.isArray(order.items) ? order.items : [];

    const baristaText = `🔔 *Pesanan Baru Masuk!*\n\n` +
        `📋 Order ID: *${payment.orderId}*\n` +
        `👤 Atas Nama: *${order.customerName || 'Customer'}*\n` +
        `👨‍💼 Customer: ${order.userId.split('@')[0]}\n` +
        `💰 Total: *Rp ${payment.amount.toLocaleString('id-ID')}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*PESANAN:*\n${items.map((item, idx) => describeOrderItem(item, idx)).join('\n')}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Silakan proses pesanan ini! 👨‍🍳`;
    
    // Send to all baristas (prefer config.shop.baristaNumbers)
    const baristas = (config.shop && config.shop.baristaNumbers) || config.baristaNumbers || [];
    for (const baristaNumber of baristas) {
        try {
            await botInstance.sock.sendMessage(baristaNumber, { text: baristaText });
        } catch (err) {
            console.error(`Failed to notify barista ${baristaNumber}:`, err);
        }
    }
    
    console.log(`✅ Payment confirmed via gateway: ${payment.orderId}`);
}

/**
 * GET /api/payments/pending
 * Get all pending payments with sync
 */
router.get('/pending', (req, res) => {
    const now = new Date();
    const orderManager = require('../../services/orderManager');
    
    // Sync with orderManager - remove orders that are no longer pending
    const syncedPayments = [];
    const pendingPayments = dataStore.getPendingPayments();
    
    for (const payment of pendingPayments) {
        const order = orderManager.getOrder(payment.orderId);
        
        // Skip expired
        if (new Date(payment.expiresAt) <= now) {
            continue;
        }
        
        // Only keep if order still exists and is pending payment
        if (order && order.status === orderManager.STATUS.PENDING_PAYMENT) {
            syncedPayments.push(payment);
        } else if (order && order.status !== orderManager.STATUS.PENDING_PAYMENT) {
            // Order was confirmed via bot command - automatically move to history
            console.log(`🔄 Auto-sync: ${payment.orderId} confirmed via bot`);
            payment.status = 'confirmed';
            payment.confirmedAt = new Date();
            payment.confirmedBy = 'bot-command';
            dataStore.addToHistory(payment);
        }
    }
    
    // Update pending payments
    dataStore.updatePendingPayments(syncedPayments);
    
    res.json({
        success: true,
        count: syncedPayments.length,
        payments: syncedPayments
    });
});

/**
 * POST /api/payments/confirm/:orderId
 * Confirm payment (kasir click button)
 */
router.post('/confirm/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { confirmedBy } = req.body;
    
    console.log(`✅ Payment confirmation request: ${orderId} by ${confirmedBy}`);
    
    // Find payment
    const payment = dataStore.findPendingPayment(orderId);
    
    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Payment not found'
        });
    }
    
    // Update status
    payment.status = 'confirmed';
    payment.confirmedAt = new Date();
    payment.confirmedBy = confirmedBy || 'kasir';
    
    // Remove from pending and add to history
    dataStore.removePendingPayment(orderId);
    dataStore.addToHistory(payment);
    
    // Trigger bot to confirm order
    const botInstance = dataStore.getBotInstance();
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
 * POST /api/payments/reject/:orderId
 * Reject payment
 */
router.post('/reject/:orderId', (req, res) => {
    const { orderId } = req.params;
    const { reason, rejectedBy } = req.body;
    
    const payment = dataStore.findPendingPayment(orderId);
    
    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Payment not found'
        });
    }
    
    payment.status = 'rejected';
    payment.rejectedAt = new Date();
    payment.rejectionReason = reason;
    payment.rejectedBy = rejectedBy || 'kasir';
    
    dataStore.removePendingPayment(orderId);
    dataStore.addToHistory(payment);
    
    try {
        const orderManager = require('../../services/orderManager');
        const order = orderManager.getOrder(orderId);
        const botInstance = dataStore.getBotInstance();

        if (order) {
            // Update order status to CANCELLED and attach reason
            orderManager.updateOrderStatus(orderId, orderManager.STATUS.CANCELLED, {
                cancelReason: reason,
                cancelledAt: new Date()
            });

            // Clear any lingering cart/session for safety
            try { orderManager.clearCart(order.userId); } catch (e) {}

            // Notify customer via bot if connected
            if (botInstance && botInstance.sock) {
                const text = `❌ *Pembayaran Ditolak*\n\n` +
                    `📋 Order ID: *${orderId}*\n` +
                    `💰 Total: *Rp ${order.pricing.total.toLocaleString('id-ID')}*\n` +
                    `${reason ? `\n📝 Alasan: ${reason}\n` : ''}` +
                    `\nSilakan cek kembali bukti transfer atau lakukan pemesanan ulang.\n` +
                    `Ketik *!order* atau *!pesan* untuk mulai lagi.`;
                botInstance.sock.sendMessage(order.userId, { text }).catch(() => {});
            }
        }

        res.json({
            success: true,
            message: 'Payment rejected',
            payment: payment
        });
    } catch (error) {
        console.error('Reject flow error:', error);
        res.json({
            success: true,
            message: 'Payment rejected (notification failed)',
            payment: payment
        });
    }

});

/**
 * GET /api/payments/history
 * Get payment history
 */
router.get('/history', (req, res) => {
    const paymentHistory = dataStore.getPaymentHistory();
    
    res.json({
        success: true,
        count: paymentHistory.length,
        payments: paymentHistory.slice(-50) // Last 50
    });
});

module.exports = router;
