/**
 * Stats Routes
 * Endpoints untuk dashboard statistics
 */
const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');

/**
 * GET /api/stats
 * Dashboard stats (with real-time order status sync)
 */
router.get('/', (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const paymentHistory = dataStore.getPaymentHistory();
    const todayPayments = paymentHistory.filter(p => 
        new Date(p.confirmedAt) >= today
    );
    
    const todayRevenue = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Sync pending payments with orderManager to remove processed orders
    const orderManager = require('../../services/orderManager');
    const syncedPending = [];
    const pendingPayments = dataStore.getPendingPayments();
    
    for (const payment of pendingPayments) {
        const order = orderManager.getOrder(payment.orderId);
        
        // Only keep if order still exists and is pending payment
        if (order && order.status === orderManager.STATUS.PENDING_PAYMENT) {
            syncedPending.push(payment);
        } else if (order && order.status !== orderManager.STATUS.PENDING_PAYMENT) {
            // Order was confirmed/processed via bot command - move to history
            console.log(`🔄 Syncing: ${payment.orderId} status changed via bot command`);
            payment.status = 'confirmed';
            payment.confirmedAt = new Date();
            payment.confirmedBy = 'bot-command';
            dataStore.addToHistory(payment);
        }
    }
    
    // Update pending payments array
    dataStore.updatePendingPayments(syncedPending);
    
    res.json({
        success: true,
        stats: {
            pendingCount: syncedPending.length,
            todayOrders: todayPayments.length,
            todayRevenue: todayRevenue,
            totalOrders: paymentHistory.length
        }
    });
});

module.exports = router;
