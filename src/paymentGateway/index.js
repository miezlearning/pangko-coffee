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
app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Import routes
const paymentsRouter = require('./routes/payments');
const ordersRouter = require('./routes/orders');
const statsRouter = require('./routes/stats');
const webhookRouter = require('./routes/webhook');
const exportRouter = require('./routes/export');
const importRouter = require('./routes/import');
const menuRouter = require('./routes/menu');
const printerRouter = require('./routes/printer');
const toolsRouter = require('./routes/tools');

// Mount routes
app.use('/api/payments', paymentsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/menu', menuRouter);
app.use('/api/export', exportRouter);
app.use('/api/import', importRouter);
app.use('/api/printer', printerRouter);
app.use('/api/tools', toolsRouter);

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/dashboard.html'));
});

// Serve search page
app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/search.html'));
});
    
    // Serve analytics page
    app.get('/analytics', (req, res) => {
        res.sendFile(path.join(__dirname, 'views/analytics.html'));
    });

// Serve menu management page
app.get('/menu', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/menu.html'));
});

// Serve webhook tester
app.get('/webhook-tester', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/webhookTester.html'));
});

// Serve import page
app.get('/import', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/import.html'));
});

// Serve tools page
app.get('/tools', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/tools.html'));
});

// Serve salary calculator
app.get('/tools/salary-calculator', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/salary-calculator.html'));
});

// Serve HPP Simulator page
app.get('/tools/hpp-simulator', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/hpp-simulator.html'));
});

// Serve DB Reset tool
app.get('/tools/db-reset', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/tools-db-reset.html'));
});

// Serve printer tools page
app.get('/tools/printer', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/tools-printer.html'));
});

// Serve calculators landing
app.get('/tools/calculators', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/tools-calculators.html'));
});

// (Removed) Specialized calculators routes are intentionally deleted as requested

// Serve cashier page
app.get('/cashier', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/cashier.html'));
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
