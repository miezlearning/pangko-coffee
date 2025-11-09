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
    
    // Filter orders created today using configured timezone
    const nowInTz = moment().tz(tz);
    const todayStart = nowInTz.clone().startOf('day');
    const todayEnd = nowInTz.clone().endOf('day');
    
    const todayOrders = orders.filter(o => {
        if (!o || !o.createdAt) return false;
        try {
            const orderMoment = moment(o.createdAt).tz(tz);
            const isToday = orderMoment.isBetween(todayStart, todayEnd, null, '[]');
            return isToday;
        } catch (err) {
            return false;
        }
    });
    
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
        } else if (scope === 'week') {
            const start = moment().tz(tz).startOf('isoWeek');
            const end = start.clone().endOf('isoWeek');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isBetween(start, end, 'day', '[]'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        } else if (scope === 'year') {
            const start = moment().tz(tz).startOf('year');
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
        } else if (scope === 'week') {
            const start = moment().tz(tz).startOf('isoWeek');
            const end = start.clone().endOf('isoWeek');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isBetween(start, end, 'day', '[]'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        } else if (scope === 'year') {
            const start = moment().tz(tz).startOf('year');
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

/**
 * GET /api/stats/overview
 * Returns summary for today, week, month, year, and all-time in one call
 */
router.get('/overview', (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        const orders = orderStore.loadOrders() || [];
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        const calc = (scope) => {
            let filtered = orders;
            if (scope === 'today') {
                const start = moment().tz(tz).startOf('day');
                filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(start, 'day'));
            } else if (scope === 'week') {
                const start = moment().tz(tz).startOf('isoWeek');
                const end = start.clone().endOf('isoWeek');
                filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isBetween(start, end, 'day', '[]'));
            } else if (scope === 'month') {
                const start = moment().tz(tz).startOf('month');
                filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
            } else if (scope === 'year') {
                const start = moment().tz(tz).startOf('year');
                filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
            } else if (scope === 'all') {
                filtered = orders;
            }
            return {
                count: filtered.length,
                revenue: filtered.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
                                 .reduce((s,o)=> s + (o?.pricing?.total||0), 0)
            };
        };
        res.json({ success: true, overview: {
            today: calc('today'),
            week: calc('week'),
            month: calc('month'),
            year: calc('year'),
            all: calc('all')
        }});
    } catch (e) {
        res.status(500).json({ success:false, message: e.message });
    }
});

/**
 * GET /api/stats/top-items?scope=today|week|month|year&limit=10&method=all|CASH|QRIS
 */
router.get('/top-items', (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    const scope = (req.query.scope || 'month').toLowerCase();
    const methodFilter = (req.query.method || 'all').toUpperCase();
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10), 50));
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        let orders = orderStore.loadOrders() || [];
        if (methodFilter !== 'ALL') orders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === methodFilter);
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        let filtered = orders;
        if (scope === 'today') {
            const start = moment().tz(tz).startOf('day');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(start, 'day'));
        } else if (scope === 'week') {
            const start = moment().tz(tz).startOf('isoWeek');
            const end = start.clone().endOf('isoWeek');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isBetween(start, end, 'day', '[]'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        } else if (scope === 'year') {
            const start = moment().tz(tz).startOf('year');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        }
        // Aggregate items
        const map = new Map();
        filtered.forEach(o => {
            if (!Array.isArray(o.items)) return;
            o.items.forEach(it => {
                const key = it.id || it.name;
                if (!map.has(key)) map.set(key, { id: it.id || null, name: it.name || 'Item', qty: 0, revenue: 0 });
                const acc = map.get(key);
                acc.qty += Number(it.quantity || 0);
                // Count revenue only if order contributes to revenue
                if (revenueStatuses.has((o.status||'').toLowerCase())) {
                    acc.revenue += Number(it.price || 0) * Number(it.quantity || 0);
                }
            });
        });
        const arr = Array.from(map.values())
            .sort((a,b)=> b.qty - a.qty || b.revenue - a.revenue)
            .slice(0, limit);
        res.json({ success: true, items: arr });
    } catch (e) {
        res.status(500).json({ success:false, message: e.message });
    }
});

/**
 * POST /api/stats/export-daily
 * Export laporan keuangan harian ke Excel
 * Body: { date: 'YYYY-MM-DD' }
 */
router.post('/export-daily', async (req, res) => {
    const ExcelJS = require('exceljs');
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    
    try {
        const dateStr = req.body.date || moment().tz(tz).format('YYYY-MM-DD');
        const targetDate = moment.tz(dateStr, tz);
        const start = targetDate.clone().startOf('day');
        const end = targetDate.clone().endOf('day');
        
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        const allOrders = orderStore.loadOrders() || [];
        
        // Filter orders for the specific day
        const orders = allOrders.filter(o => {
            if (!o.createdAt) return false;
            const orderMoment = moment(o.createdAt).tz(tz);
            return orderMoment.isBetween(start, end, null, '[]');
        });
        
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Harian');
        
        // Header info
        worksheet.mergeCells('A1:G1');
        worksheet.getCell('A1').value = 'LAPORAN KEUANGAN HARIAN';
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
        worksheet.mergeCells('A2:G2');
        worksheet.getCell('A2').value = `Tanggal: ${targetDate.format('DD MMMM YYYY')}`;
        worksheet.getCell('A2').font = { size: 12 };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        worksheet.addRow([]);
        
        // Summary section
        const totalOrders = orders.length;
        const totalRevenue = orders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const qrisOrders = orders.filter(o => (o.paymentMethod||'').toUpperCase() === 'QRIS');
        const cashOrders = orders.filter(o => (o.paymentMethod||'').toUpperCase() === 'CASH');
        const qrisRevenue = qrisOrders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const cashRevenue = cashOrders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        
        worksheet.addRow(['RINGKASAN']);
        worksheet.addRow(['Total Pesanan', totalOrders]);
        worksheet.addRow(['Total Pendapatan', `Rp ${totalRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow(['Pesanan QRIS', qrisOrders.length, `Rp ${qrisRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow(['Pesanan Tunai', cashOrders.length, `Rp ${cashRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow([]);
        
        // Orders table header
        worksheet.addRow(['DETAIL PESANAN']);
        const headerRow = worksheet.addRow(['No', 'Order ID', 'Waktu', 'Pelanggan', 'Metode', 'Total', 'Status']);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF74A662' } };
        
        // Orders data
        orders.forEach((order, idx) => {
            worksheet.addRow([
                idx + 1,
                order.orderId,
                moment(order.createdAt).tz(tz).format('HH:mm:ss'),
                order.customerName || order.userId || '-',
                order.paymentMethod || '-',
                `Rp ${(order?.pricing?.total || 0).toLocaleString('id-ID')}`,
                order.status || '-'
            ]);
        });
        
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const length = cell.value ? cell.value.toString().length : 10;
                if (length > maxLength) maxLength = length;
            });
            column.width = Math.min(maxLength + 2, 50);
        });
        
        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Laporan_Harian_${dateStr}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) {
        console.error('Export daily failed:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * POST /api/stats/export-monthly
 * Export laporan keuangan bulanan ke Excel
 * Body: { year: 2025, month: 1 }
 */
router.post('/export-monthly', async (req, res) => {
    const ExcelJS = require('exceljs');
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    
    try {
        const now = moment().tz(tz);
        const year = req.body.year || now.year();
        const month = req.body.month || (now.month() + 1);
        
        const start = moment.tz([year, month - 1, 1], tz).startOf('month');
        const end = start.clone().endOf('month');
        
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        const allOrders = orderStore.loadOrders() || [];
        
        // Filter orders for the specific month
        const orders = allOrders.filter(o => {
            if (!o.createdAt) return false;
            const orderMoment = moment(o.createdAt).tz(tz);
            return orderMoment.isBetween(start, end, null, '[]');
        });
        
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Bulanan');
        
        // Header info
        worksheet.mergeCells('A1:H1');
        worksheet.getCell('A1').value = 'LAPORAN KEUANGAN BULANAN';
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
        worksheet.mergeCells('A2:H2');
        worksheet.getCell('A2').value = `Periode: ${start.format('MMMM YYYY')}`;
        worksheet.getCell('A2').font = { size: 12 };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        worksheet.addRow([]);
        
        // Summary section
        const totalOrders = orders.length;
        const totalRevenue = orders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const qrisOrders = orders.filter(o => (o.paymentMethod||'').toUpperCase() === 'QRIS');
        const cashOrders = orders.filter(o => (o.paymentMethod||'').toUpperCase() === 'CASH');
        const qrisRevenue = qrisOrders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const cashRevenue = cashOrders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        
        worksheet.addRow(['RINGKASAN BULANAN']);
        worksheet.addRow(['Total Pesanan', totalOrders]);
        worksheet.addRow(['Total Pendapatan', `Rp ${totalRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow(['Pesanan QRIS', qrisOrders.length, `Rp ${qrisRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow(['Pesanan Tunai', cashOrders.length, `Rp ${cashRevenue.toLocaleString('id-ID')}`]);
        worksheet.addRow([]);
        
        // Daily breakdown
        worksheet.addRow(['RINGKASAN HARIAN']);
        const dailyHeader = worksheet.addRow(['Tanggal', 'Pesanan', 'Pendapatan', 'QRIS', 'Tunai']);
        dailyHeader.font = { bold: true };
        dailyHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF74A662' } };
        
        const cursor = start.clone();
        while (cursor.isSameOrBefore(end, 'day')) {
            const dayOrders = orders.filter(o => {
                const orderMoment = moment(o.createdAt).tz(tz);
                return orderMoment.isSame(cursor, 'day');
            });
            const dayRevenue = dayOrders.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
                .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
            const dayQris = dayOrders.filter(o => (o.paymentMethod||'').toUpperCase() === 'QRIS').length;
            const dayCash = dayOrders.filter(o => (o.paymentMethod||'').toUpperCase() === 'CASH').length;
            
            worksheet.addRow([
                cursor.format('DD/MM/YYYY'),
                dayOrders.length,
                `Rp ${dayRevenue.toLocaleString('id-ID')}`,
                dayQris,
                dayCash
            ]);
            cursor.add(1, 'day');
        }
        
        worksheet.addRow([]);
        
        // Top items
        worksheet.addRow(['PRODUK TERLARIS']);
        const itemHeader = worksheet.addRow(['No', 'Nama Produk', 'Terjual', 'Revenue']);
        itemHeader.font = { bold: true };
        itemHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5B4' } };
        
        const itemMap = new Map();
        orders.forEach(o => {
            if (!Array.isArray(o.items)) return;
            o.items.forEach(it => {
                const key = it.id || it.name;
                if (!itemMap.has(key)) itemMap.set(key, { name: it.name || 'Item', qty: 0, revenue: 0 });
                const acc = itemMap.get(key);
                acc.qty += Number(it.quantity || 0);
                if (revenueStatuses.has((o.status||'').toLowerCase())) {
                    acc.revenue += Number(it.price || 0) * Number(it.quantity || 0);
                }
            });
        });
        
        const topItems = Array.from(itemMap.values())
            .sort((a,b)=> b.qty - a.qty)
            .slice(0, 20);
        
        topItems.forEach((item, idx) => {
            worksheet.addRow([
                idx + 1,
                item.name,
                item.qty,
                `Rp ${item.revenue.toLocaleString('id-ID')}`
            ]);
        });
        
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const length = cell.value ? cell.value.toString().length : 10;
                if (length > maxLength) maxLength = length;
            });
            column.width = Math.min(maxLength + 2, 50);
        });
        
        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Laporan_Bulanan_${year}-${String(month).padStart(2,'0')}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) {
        console.error('Export monthly failed:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;

/**
 * POST /api/stats/insights
 * Body: { scope: 'today'|'week'|'month'|'year'|'all', method: 'all'|'CASH'|'QRIS', limit: number }
 * Calls configured Gemini API (or user-provided AI endpoint) to produce short insights.
 */
router.post('/insights', async (req, res) => {
    const config = require('../../config/config');
    const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
    const scope = (req.body && req.body.scope) ? req.body.scope.toLowerCase() : 'month';
    const methodFilter = (req.body && req.body.method) ? (req.body.method || 'all').toUpperCase() : 'ALL';
    const limit = Math.max(1, Math.min(parseInt((req.body && req.body.limit) || 5, 10), 50));

    // Assemble local stats (overview + top items)
    try {
        const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));
        let orders = orderStore.loadOrders() || [];
        if (methodFilter !== 'ALL') orders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === methodFilter);

        // Build a compact summary for the selected scope
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        let filtered = orders;
        if (scope === 'today') {
            const start = moment().tz(tz).startOf('day');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(start, 'day'));
        } else if (scope === 'week') {
            const start = moment().tz(tz).startOf('isoWeek');
            const end = start.clone().endOf('isoWeek');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isBetween(start, end, 'day', '[]'));
        } else if (scope === 'month') {
            const start = moment().tz(tz).startOf('month');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        } else if (scope === 'year') {
            const start = moment().tz(tz).startOf('year');
            filtered = orders.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(start));
        }

        const totalOrders = filtered.length;
        const totalRevenue = filtered.filter(o => revenueStatuses.has((o.status||'').toLowerCase()))
            .reduce((s,o)=> s + (o?.pricing?.total||0), 0);

        // Top items aggregation
        const map = new Map();
        filtered.forEach(o => {
            if (!Array.isArray(o.items)) return;
            o.items.forEach(it => {
                const key = it.id || it.name;
                if (!map.has(key)) map.set(key, { id: it.id || null, name: it.name || (it.title || 'Item'), qty: 0, revenue: 0 });
                const acc = map.get(key);
                acc.qty += Number(it.quantity || 0);
                if (revenueStatuses.has((o.status||'').toLowerCase())) acc.revenue += Number(it.price || 0) * Number(it.quantity || 0);
            });
        });
        const topItems = Array.from(map.values()).sort((a,b) => b.qty - a.qty).slice(0, limit);

        // Determine AI endpoint and key. We allow calling a public proxy without an API key.
        const defaultAiUrl = 'https://api.siputzx.my.id/api/ai/gemini-lite';
        const aiUrl = (config && config.gemini && config.gemini.apiUrl) || process.env.GEMINI_API_URL || defaultAiUrl;
        const aiKey = (config && config.gemini && config.gemini.apiKey) || process.env.GEMINI_API_KEY || '';

        const payload = {
            generatedAt: new Date().toISOString(),
            scope,
            method: methodFilter,
            summary: { totalOrders, totalRevenue },
            topItems
        };

        // Local fallback insights (human-readable) to return when no AI is configured
        const localInsights = [];
        localInsights.push(`Ringkasan ${scope}: ${totalOrders} pesanan, total Rp ${Math.round(totalRevenue).toLocaleString('id-ID')}.`);
        if (topItems.length) {
            const top = topItems[0];
            const runner = topItems[1];
            localInsights.push(`Top produk: ${top.name} (terjual ${top.qty} unit, kontribusi Rp ${Math.round(top.revenue).toLocaleString('id-ID')}).`);
            if (runner) localInsights.push(`Runner-up: ${runner.name} (terjual ${runner.qty}). Pertimbangkan bundling dengan top product.`);
        } else {
            localInsights.push('Tidak ada data produk untuk rentang ini.');
        }

        // If there's no endpoint at all (shouldn't happen because we fall back to a public proxy), return local insights
        if (!aiUrl) {
            return res.json({ success: true, ai: false, insights: localInsights, raw: payload, message: 'No AI endpoint configured. Set GEMINI_API_URL to enable AI insights.' });
        }

        // Build prompt for AI (concise). Keep size small to avoid large costs.
        const promptParts = [];
        promptParts.push(`You are an analytics assistant for a small coffee shop answer in Indonesian Language. Produce 3-4 concise, actionable insights (1-2 sentences each) and up to 3 short recommendations for promotions or ops improvements.`);
        promptParts.push(`Context (JSON): ${JSON.stringify({ scope, method: methodFilter, totalOrders, totalRevenue, topItems })}`);
        const prompt = promptParts.join('\n\n');

    // Use a simple REST API (gemini-lite) that accepts prompt & model as query parameters.
    // `aiUrl` already contains either configured URL or the default public proxy.
    const endpoint = aiUrl;
        const modelName = (config && config.gemini && config.gemini.model) || process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

        // Build URL with encoded prompt and model
        const encodedPrompt = encodeURIComponent(prompt);
        const encodedModel = encodeURIComponent(modelName);
        const url = `${endpoint}?prompt=${encodedPrompt}&model=${encodedModel}`;

        // Use fetch (node 18+) or undici if needed
        let fetchFn = global.fetch;
        if (!fetchFn) {
            try { fetchFn = require('undici').fetch; } catch (e) { fetchFn = null; }
        }
        if (!fetchFn) return res.status(500).json({ success: false, message: 'Fetch not available in runtime. Install node >=18 or add undici.' });

        // Call the external gemini-lite endpoint (GET)
        const headers = {};
        if (aiKey) headers['Authorization'] = `Bearer ${aiKey}`;
        const aiResp = await fetchFn(url, { method: 'GET', headers });
        if (!aiResp.ok) {
            const txt = await aiResp.text().catch(() => '<no-body>');
            return res.status(502).json({ success: false, message: 'AI endpoint error', status: aiResp.status, body: txt });
        }

        const aiJson = await aiResp.json().catch(() => null);
        let aiText = '';
        // Expected shape per example: { status: true, data: { parts: [ { text: '...' } ] }, timestamp }
        if (aiJson && aiJson.data && Array.isArray(aiJson.data.parts)) {
            aiText = aiJson.data.parts.map(p => p.text || '').join('\n');
        } else if (aiJson && aiJson.text) {
            aiText = aiJson.text;
        } else {
            aiText = JSON.stringify(aiJson);
        }

        // Return both raw AI response and parsed text
        res.json({ success: true, ai: true, insights: aiText ? aiText.split(/\n+/).filter(Boolean) : [], raw: payload, aiResponse: aiJson });
    } catch (e) {
        console.error('[insights] error', e);
        res.status(500).json({ success: false, message: e.message });
    }
});
