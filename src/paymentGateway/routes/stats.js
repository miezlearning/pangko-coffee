/**
 * Stats Routes
 * Endpoints untuk dashboard statistics
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const dataStore = require('../dataStore');
const moment = require('moment-timezone');

/**
 * GET /api/stats
 * Dashboard stats (with real-time order status sync)
 */
router.get('/', (req, res) => {
    const config = require('../../config/config');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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

    // Read orders from SQLite to build accurate stats
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    let orders = [];
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        orders = orderStore.loadOrders() || [];
    } catch (e) {
        console.warn('[stats] Failed to load orders from sqlite:', e.message);
    }

    const revenueStatuses = new Set(['paid', 'processing', 'ready', 'completed']);
    const todayOrders = orders.filter(o => o && o.createdAt && moment(o.createdAt).tz(tz).isSame(today, 'day'));
    const todayRevenue = todayOrders
        .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
        .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);

    // Month-to-date using configured timezone
    const monthStart = moment().tz(tz).startOf('month');
    const monthOrders = orders.filter(o => o && o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(monthStart));
    const monthRevenue = monthOrders
        .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
        .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);

    const totalRevenue = orders
        .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
        .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);

    res.json({
        success: true,
        stats: {
            // Pending QRIS only (dashboard uses this to notify new payments)
            pendingCount: syncedPending.length,
            // Orders created today (all methods)
            todayOrders: todayOrders.length,
            // Revenue from orders that are at least accepted/processing today
            todayRevenue,
            // Total orders in database (all time)
            totalOrders: orders.length,
            // Month-to-date
            monthOrders: monthOrders.length,
            monthRevenue,
            // All-time revenue
            totalRevenue
        }
    });
});

/**
 * GET /api/stats/summary?scope=today|month|all&method=all|CASH|QRIS
 */
router.get('/summary', (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    const scope = (req.query.scope || 'today').toLowerCase();
    const methodFilter = (req.query.method || 'all').toUpperCase();
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        let orders = orderStore.loadOrders() || [];
        if (methodFilter !== 'ALL') orders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === methodFilter);
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        let filtered = orders;
        if (scope === 'today') {
            const start = moment().tz(tz).startOf('day');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(start, 'day'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        }
        const count = filtered.length;
        const revenue = filtered.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
                                .reduce((s,o)=> s + (o?.pricing?.total||0), 0);
        res.json({ success: true, scope, method: methodFilter, count, revenue });
    } catch (e) {
        res.status(500).json({ success:false, message: e.message });
    }
});

/**
 * GET /api/stats/timeseries?range=7d|30d|custom&from=ISO&to=ISO&method=all|CASH|QRIS
 * Returns array of { label: 'DD/MM', dateISO, orders, revenue }
 */
router.get('/timeseries', (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    const range = (req.query.range || '30d').toLowerCase();
    const methodFilter = (req.query.method || 'all').toUpperCase();
    let start, end;
    if (range === '7d' || range === '30d') {
        end = moment().tz(tz).endOf('day');
        start = end.clone().subtract(range === '7d' ? 6 : 29, 'days').startOf('day');
    } else {
        start = req.query.from ? moment.tz(req.query.from, tz).startOf('day') : moment().tz(tz).subtract(29, 'days').startOf('day');
        end = req.query.to ? moment.tz(req.query.to, tz).endOf('day') : moment().tz(tz).endOf('day');
    }
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        let orders = orderStore.loadOrders() || [];
        if (methodFilter !== 'ALL') orders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === methodFilter);
        const revenueStatuses = new Set(['paid','processing','ready','completed']);

        // bucket per day
        const days = [];
        const cursor = start.clone();
        while (cursor.isSameOrBefore(end, 'day')) {
            days.push({ key: cursor.format('YYYY-MM-DD'), label: cursor.format('DD/MM'), orders: 0, revenue: 0 });
            cursor.add(1, 'day');
        }
        const index = new Map(days.map((d,i)=>[d.key,i]));
        orders.forEach(o => {
            if (!o.createdAt) return;
            const d = moment(o.createdAt).tz(tz);
            if (d.isBefore(start) || d.isAfter(end)) return;
            const key = d.format('YYYY-MM-DD');
            const i = index.get(key);
            if (i === undefined) return;
            days[i].orders += 1;
            if (revenueStatuses.has((o.status||'').toLowerCase())) days[i].revenue += (o?.pricing?.total || 0);
        });
        res.json({ success: true, series: days });
    } catch (e) {
        res.status(500).json({ success:false, message: e.message });
    }
});

/**
 * GET /api/stats/method-breakdown?scope=today|month|all&method=all|CASH|QRIS
 */
router.get('/method-breakdown', (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    const scope = (req.query.scope || 'month').toLowerCase();
    const methodFilter = (req.query.method || 'all').toUpperCase();
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        let orders = orderStore.loadOrders() || [];
        if (methodFilter !== 'ALL') orders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === methodFilter);
        let filtered = orders;
        if (scope === 'today') {
            const start = moment().tz(tz).startOf('day');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(start, 'day'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        }
        const summary = {};
        filtered.forEach(o => {
            const m = ((o.paymentMethod || '').toUpperCase() === 'CASH') ? 'Tunai' : 'QRIS';
            if (!summary[m]) summary[m] = { count: 0, sum: 0 };
            summary[m].count += 1;
            summary[m].sum += (o?.pricing?.total || 0);
        });
        res.json({ success: true, summary });
    } catch (e) {
        res.status(500).json({ success:false, message: e.message });
    }
});

module.exports = router;
