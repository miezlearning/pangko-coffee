/**
 * Order Routes
 * Endpoints untuk order management
 */
const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');

/**
 * POST /api/orders/ready/:orderId
 * Mark order as ready (kasir click button)
 */
router.post('/ready/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { markedBy } = req.body;
    
    const orderManager = require('../../services/orderManager');
    const order = orderManager.getOrder(orderId);
    
    if (!order) {
        return res.status(404).json({
            success: false,
            message: 'Order not found'
        });
    }
    
    if (order.status !== orderManager.STATUS.PROCESSING) {
        return res.status(400).json({
            success: false,
            message: `Order status is ${order.status}, must be PROCESSING to mark as ready`
        });
    }
    
    try {
        // Update order status
        orderManager.updateOrderStatus(orderId, orderManager.STATUS.READY);
        
        // Notify customer via bot
        const botInstance = dataStore.getBotInstance();
        if (botInstance && botInstance.sock) {
            const config = require('../../config/config');
            const customerText = `🎉 *Pesanan Anda Siap!*\n\n` +
                `📋 Order ID: *${orderId}*\n` +
                `👤 Atas Nama: *${order.customerName || 'Customer'}*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Pesanan Anda sudah siap diambil! 🥳\n\n` +
                `📍 Silakan ambil di counter:\n` +
                `"Atas nama *${order.customerName}*, pesanan sudah siap!"\n\n` +
                `Terima kasih sudah memesan di ${config.shop.name}! ☕`;
            
            await botInstance.sock.sendMessage(order.userId, { text: customerText });
        }
        
        console.log(`✅ Order marked as ready: ${orderId} by ${markedBy || 'kasir'}`);
        
        res.json({
            success: true,
            message: 'Order marked as ready',
            order: {
                orderId: order.orderId,
                status: order.status,
                customerName: order.customerName
            }
        });
    } catch (error) {
        console.error('Mark ready error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark order as ready',
            error: error.message
        });
    }
});

/**
 * GET /api/orders/processing
 * Get all processing orders (for ready button)
 */
router.get('/processing', (req, res) => {
    const orderManager = require('../../services/orderManager');
    const allOrders = [];
    
    for (const orderId of orderManager.orders.keys()) {
        const order = orderManager.getOrder(orderId);
        if (order && order.status === orderManager.STATUS.PROCESSING) {
            allOrders.push({
                orderId: order.orderId,
                customerName: order.customerName || 'Customer',
                userId: order.userId.split('@')[0],
                items: order.items,
                pricing: order.pricing,
                confirmedAt: order.confirmedAt,
                status: order.status,
                paymentMethod: order.paymentMethod || 'QRIS'
            });
        }
    }
    
    res.json({
        success: true,
        count: allOrders.length,
        orders: allOrders
    });
});

/**
 * GET /api/orders/pending-cash
 * Get all cash orders waiting for cashier acceptance
 */
router.get('/pending-cash', (req, res) => {
    const orderManager = require('../../services/orderManager');
    const orders = [];
    for (const orderId of orderManager.orders.keys()) {
        const order = orderManager.getOrder(orderId);
        if (order && order.status === orderManager.STATUS.PENDING_CASH) {
            orders.push({
                orderId: order.orderId,
                customerName: order.customerName || 'Customer',
                userId: order.userId.split('@')[0],
                items: order.items,
                pricing: order.pricing,
                createdAt: order.createdAt,
                cashExpiresAt: order.cashExpiresAt,
                paymentMethod: order.paymentMethod || 'CASH'
            });
        }
    }
    res.json({ success: true, count: orders.length, orders });
});

/**
 * POST /api/orders/cash/accept/:orderId
 * Cashier accepts cash and moves order to PROCESSING
 */
router.post('/cash/accept/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { acceptedBy } = req.body;
    const orderManager = require('../../services/orderManager');
    try {
        const order = orderManager.acceptCash(orderId, acceptedBy || 'kasir');

        // Notify customer: accepted and processing
        const botInstance = dataStore.getBotInstance();
        if (botInstance && botInstance.sock) {
            const text = `✅ *Tunai Diterima*\n\n` +
                `Order ID: *${order.orderId}*\n` +
                `Atas Nama: *${order.customerName}*\n\n` +
                `Pesanan Anda sedang diproses oleh barista. Anda akan mendapat notifikasi saat siap. 👨‍🍳`;
            try { await botInstance.sock.sendMessage(order.userId, { text }); } catch (_) {}
        }

        // Optionally notify baristas of new order to process
        try {
            const config = require('../../config/config');
            const baristaText = `🔔 *Pesanan Tunai Diterima!*\n\n` +
                `📋 Order ID: *${order.orderId}*\n` +
                `👤 Atas Nama: *${order.customerName}*\n` +
                `💰 Total: *Rp ${order.pricing.total.toLocaleString('id-ID')}*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `*PESANAN:*\n${order.items.map((item, idx) => `${idx + 1}. ${item.name} x${item.quantity}${item.notes ? `\n   📝 ${item.notes}` : ''}`).join('\n')}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Silakan proses pesanan ini! 👨‍🍳`;
            for (const baristaNumber of config.shop.baristaNumbers || config.baristaNumbers || []) {
                try { await botInstance.sock.sendMessage(baristaNumber, { text: baristaText }); } catch (_) {}
            }
        } catch (_) {}

        res.json({ success: true, order: { orderId: order.orderId, status: order.status } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/orders/cash/cancel/:orderId
 * Cashier cancels cash order (no show etc.). Customer can reopen within 60 minutes.
 */
router.post('/cash/cancel/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { reason, cancelledBy } = req.body;
    const orderManager = require('../../services/orderManager');
    try {
        const order = orderManager.cancelCash(orderId, reason || 'cash_cancel_by_kasir', 60);

        // Notify customer with reopen instructions
        const botInstance = dataStore.getBotInstance();
        if (botInstance && botInstance.sock) {
            const until = new Date(order.canReopenUntil).toLocaleString('id-ID');
            const text = `⏸️ *Pesanan Tunai Dibatalkan*\n\n` +
                `Order ID: *${order.orderId}*\n` +
                `Alasan: ${order.cashCancelReason || '—'}\n\n` +
                `Anda masih bisa membuka kembali dalam 60 menit hingga ${until}.\n` +
                `Balas perintah: *!lanjut ${order.orderId}* untuk melanjutkan saat Anda sudah di kasir.`;
            try { await botInstance.sock.sendMessage(order.userId, { text }); } catch (_) {}
        }

        res.json({ success: true, order: { orderId: order.orderId, status: order.status, canReopenUntil: order.canReopenUntil } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/orders/cash/reopen/:orderId
 * Reopen a recently-cancelled cash order (e.g., from dashboard if needed)
 */
router.post('/cash/reopen/:orderId', (req, res) => {
    const { orderId } = req.params;
    const orderManager = require('../../services/orderManager');
    try {
        const order = orderManager.reopenCash(orderId);
        res.json({ success: true, order: { orderId: order.orderId, status: order.status, cashExpiresAt: order.cashExpiresAt } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;
