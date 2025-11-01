/**
 * Payment Gateway - Modular Structure
 * Express server dengan folder structure yang rapi
 * 
 * Features:
 * - Real-time order monitoring
 * - One-click payment confirmation
 * - Auto-trigger bot notifications
 * - Webhook simulator
 * - Sound notifications
 * - Payment analytics
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const dataStore = require('./dataStore');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const paymentsRouter = require('./routes/payments');
const ordersRouter = require('./routes/orders');
const statsRouter = require('./routes/stats');
const webhookRouter = require('./routes/webhook');

// Mount routes
app.use('/api/payments', paymentsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/webhook', webhookRouter);

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/dashboard.html'));
});

// Serve webhook tester
app.get('/webhook-tester', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/webhookTester.html'));
});

/**
 * Set bot instance (called by main bot)
 */
function setBotInstance(bot) {
    dataStore.setBotInstance(bot);
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
    
    dataStore.addPendingPayment(payment);
    console.log(`📝 Payment registered: ${payment.id} - Rp ${payment.amount}`);
    
    return payment;
}

/**
 * Start server
 */
function startServer() {
    const PORT = process.env.PORT || 3000;
    
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
