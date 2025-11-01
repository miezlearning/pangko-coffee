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

module.exports = router;
