/**
 * Order Routes
 * Endpoints untuk order management
 */
const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const orderManager = require('../../services/orderManager');
const paymentProvider = require('../../services/paymentProvider');
const menuStore = require('../../services/menuStore');

function describeItemWithAddons(item, idx) {
    let lines = [`${idx + 1}. ${item.name} x${item.quantity}`];
    if (Array.isArray(item.addons) && item.addons.length > 0) {
        item.addons.forEach(addon => {
            if (!addon || !addon.quantity) return;
            const unit = addon.unitPrice !== undefined ? addon.unitPrice : addon.price || 0;
            const addonTotal = unit * addon.quantity;
            lines.push(`   ➕ ${addon.name} x${addon.quantity} (Rp ${addonTotal.toLocaleString('id-ID')})`);
        });
    }
    if (item.notes) {
        lines.push(`   📝 ${item.notes}`);
    }
    return lines.join('\n');
}

function formatItemsForMessage(items = []) {
    return items.map((item, idx) => describeItemWithAddons(item, idx)).join('\n');
}

function computeMenuUnitPrice(menuItem) {
    const base = Number(menuItem?.price || 0);
    const discountPercent = Number(menuItem?.discount_percent || 0);
    if (!discountPercent) return base;
    const discounted = base - base * (discountPercent / 100);
    return Math.max(0, Math.round(discounted));
}

function normalizeMenuAddons(addons = []) {
    return addons
        .filter(addon => addon && addon.isActive !== false)
        .map(addon => ({
            id: String(addon.id),
            name: addon.name,
            unitPrice: Number(addon.price || addon.priceOverride || addon.basePrice || 0),
            minQuantity: Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0,
            maxQuantity: Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : null,
            defaultQuantity: Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : null,
            isRequired: !!addon.isRequired
        }));
}

function resolveAddonSelections(requestedAddons = [], availableAddons = []) {
    const availableMap = new Map(availableAddons.map(addon => [addon.id.toLowerCase(), addon]));
    const requestedQuantities = new Map();
    const errors = [];

    requestedAddons.forEach(req => {
        if (!req || !req.id) return;
        const key = String(req.id).toLowerCase();
        const addon = availableMap.get(key);
        if (!addon) {
            errors.push(`Add-on ${req.id} tidak tersedia untuk menu ini`);
            return;
        }
        const qty = Math.max(0, Number(req.quantity ?? req.qty ?? 0));
        requestedQuantities.set(addon.id, qty);
    });

    const selections = [];
    availableAddons.forEach(addon => {
        let qty;
        if (requestedQuantities.has(addon.id)) {
            qty = requestedQuantities.get(addon.id);
        } else if (addon.defaultQuantity !== null && addon.defaultQuantity !== undefined) {
            qty = addon.defaultQuantity;
        } else {
            qty = addon.minQuantity;
        }

        qty = Number.isFinite(Number(qty)) ? Number(qty) : 0;

        if (addon.isRequired && qty < addon.minQuantity) {
            errors.push(`${addon.name} minimal ${addon.minQuantity}`);
        }
        if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity) {
            errors.push(`${addon.name} maksimal ${addon.maxQuantity}`);
        }
        if (qty > 0) {
            selections.push({
                id: addon.id,
                name: addon.name,
                quantity: qty,
                unitPrice: addon.unitPrice
            });
        }
    });

    return { selections, errors };
}

function buildCartItemWithAddons(menuItem, addonSelections) {
    const basePrice = computeMenuUnitPrice(menuItem);
    const addonsTotal = addonSelections.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
    const keyPart = addonSelections
        .filter(addon => addon.quantity > 0)
        .map(addon => `${addon.id}:${addon.quantity}`)
        .sort()
        .join('|');
    return {
        id: String(menuItem.id),
        name: menuItem.name,
        price: basePrice + addonsTotal,
        basePrice,
        addons: addonSelections.map(addon => ({ ...addon })),
        cartKey: keyPart ? `${menuItem.id}::${keyPart}` : String(menuItem.id)
    };
}

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
 * POST /api/orders/create
 * Create new order from cashier dashboard (POS)
 * Body: { customerName, userId?, items: [{id,name,price,quantity,notes?}], paymentMethod: 'QRIS'|'CASH' }
 */
router.post('/create', async (req, res) => {
    try {
        const { customerName, userId, items, paymentMethod } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Items required' });
        }
        const pm = (paymentMethod || 'QRIS').toUpperCase();
        if (!['QRIS', 'CASH'].includes(pm)) {
            return res.status(400).json({ success: false, message: 'paymentMethod must be QRIS or CASH' });
        }
        // Resolve userId (walk-in)
        const uid = (userId && String(userId)) || `cashier-${Date.now()}@dashboard`;

        const cartEntries = [];
        const validationErrors = [];

        (items || []).forEach((it, idx) => {
            if (!it || !it.id) {
                validationErrors.push(`Item ke-${idx + 1} tidak valid`);
                return;
            }

            const itemId = String(it.id);

            if (itemId.toUpperCase() === 'DISCOUNT') {
                const discountPrice = Number(it.price || 0);
                if (!Number.isFinite(discountPrice)) {
                    validationErrors.push('Diskon tidak valid');
                    return;
                }
                const quantity = Math.max(1, Number(it.quantity || 1));
                cartEntries.push({
                    cartItem: {
                        id: 'DISCOUNT',
                        name: it.name || 'Diskon',
                        price: discountPrice,
                        basePrice: discountPrice,
                        addons: [],
                        cartKey: 'DISCOUNT',
                        notes: ''
                    },
                    quantity
                });
                return;
            }

            const menuItem = menuStore.getMenuItemById(itemId);
            if (!menuItem) {
                validationErrors.push(`Menu ${itemId} tidak ditemukan`);
                return;
            }
            if (menuItem.available === false) {
                validationErrors.push(`${menuItem.name} sedang tidak tersedia`);
                return;
            }

            const availableAddons = normalizeMenuAddons(menuItem.addons || []);
            const requestedAddons = Array.isArray(it.addons) ? it.addons : [];
            const { selections, errors } = resolveAddonSelections(requestedAddons, availableAddons);
            if (errors.length) {
                errors.forEach(err => validationErrors.push(`${menuItem.name}: ${err}`));
                return;
            }

            const cartItem = buildCartItemWithAddons(menuItem, selections);
            cartItem.size = it.size || 'REG';
            if (it.notes) {
                cartItem.notes = String(it.notes).trim();
            }
            const quantity = Math.max(1, Number(it.quantity || 1));
            cartEntries.push({ cartItem, quantity });
        });

        if (validationErrors.length) {
            return res.status(400).json({
                success: false,
                message: 'Gagal memproses pesanan',
                errors: validationErrors
            });
        }

        if (cartEntries.length === 0) {
            return res.status(400).json({ success: false, message: 'Items required' });
        }

        cartEntries.forEach(({ cartItem, quantity }) => {
            orderManager.addItemToCart(uid, cartItem, quantity);
        });

        // Create order
        const order = orderManager.createOrder(uid, customerName || 'Customer', pm);

        let payment = null;
        if (pm === 'QRIS') {
            // Create dynamic QR
            const qr = await paymentProvider.createDynamicQR(order);
            orderManager.setOrderQRIS(order.orderId, qr.qrString);
            payment = {
                id: order.orderId,
                orderId: order.orderId,
                customerId: uid,
                amount: order.pricing.total,
                items: order.items,
                status: 'pending',
                qrisCode: qr.qrString,
                createdAt: new Date(),
                expiresAt: qr.expiresAt
            };
            dataStore.addPendingPayment(payment);
        }

        res.json({ success: true, order, payment });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: error.message });
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
router.get('/pending-cash', async (req, res) => {
    const orderManager = require('../../services/orderManager');
    const orders = [];
    for (const orderId of orderManager.orders.keys()) {
        const order = orderManager.getOrder(orderId);
        if (!order) continue;
        if (order.status === orderManager.STATUS.PENDING_CASH) {
            // Auto-cancel expired cash orders immediately on fetch
            if (order.cashExpiresAt && new Date(order.cashExpiresAt) <= new Date()) {
                try {
                    const cancelled = orderManager.cancelCash(order.orderId, 'cash_timeout', 60);
                    // Notify customer once with reopen instruction
                    const botInstance = dataStore.getBotInstance();
                    if (botInstance && botInstance.sock) {
                        const until = cancelled.canReopenUntil ? new Date(cancelled.canReopenUntil).toLocaleString('id-ID') : '';
                        const text = `⏰ *Waktu ke Kasir Habis*\n\n` +
                            `Order ID: *${cancelled.orderId}*\n` +
                            `Status: Dibatalkan (tunai)\n\n` +
                            `Anda masih bisa membuka kembali dalam 60 menit (maksimal ${require('../../config/config').order.maxReopenPerOrder}x per pesanan).\n` +
                            `Balas: *!lanjut ${cancelled.orderId}* sebelum ${until}.`;
                        try { await botInstance.sock.sendMessage(cancelled.userId, { text }); } catch (_) {}
                    }
                    continue; // don't include in list since it's cancelled
                } catch (_) {
                    // fallthrough to not show if cancel failed
                    continue;
                }
            }
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
                `*PESANAN:*\n${formatItemsForMessage(order.items)}\n` +
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
        const order = orderManager.reopenCashByCashier(orderId);
        res.json({ success: true, order: { orderId: order.orderId, status: order.status, cashExpiresAt: order.cashExpiresAt } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/orders/cancelled-cash
 * List recently cancelled cash orders (optionally only those still within reopen window)
 */
router.get('/cancelled-cash', (req, res) => {
    const orderManager = require('../../services/orderManager');
    const within = (req.query.withinWindow || 'true') === 'true';
    const now = new Date();
    const orders = [];
    for (const orderId of orderManager.orders.keys()) {
        const order = orderManager.getOrder(orderId);
        if (!order) continue;
        if (order.paymentMethod === 'CASH' && order.status === orderManager.STATUS.CANCELLED) {
            const eligible = within ? (order.canReopenUntil && new Date(order.canReopenUntil) > now) : true;
            if (eligible) {
                orders.push({
                    orderId: order.orderId,
                    customerName: order.customerName || 'Customer',
                    userId: order.userId.split('@')[0],
                    items: order.items,
                    pricing: order.pricing,
                    cancelledAt: order.cashCancelledAt,
                    canReopenUntil: order.canReopenUntil,
                    cancelReason: order.cashCancelReason || '-',
                });
            }
        }
    }
    // Sort by cancelledAt desc
    orders.sort((a,b) => new Date(b.cancelledAt) - new Date(a.cancelledAt));
    res.json({ success: true, count: orders.length, orders });
});

/**
 * GET /api/orders/search
 * Search across orders by orderId or customerName (where available) and status filter
 * status can be: all|pending_cash|processing|ready|completed|cancelled|pending_payment
 */
router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const status = (req.query.status || 'all').toString().toLowerCase();
    const orderManager = require('../../services/orderManager');
    const dataStore = require('../dataStore');
    const results = [];

    // Helper for match
    const matches = (text) => !q || (text && text.toString().toLowerCase().includes(q));

    // From orderManager (all but pending_payment for QRIS)
    for (const orderId of orderManager.orders.keys()) {
        const o = orderManager.getOrder(orderId);
        if (!o) continue;
        const record = {
            type: 'order',
            orderId: o.orderId,
            customerName: o.customerName || 'Customer',
            userId: (o.userId || '').split('@')[0],
            status: o.status,
            paymentMethod: o.paymentMethod || 'QRIS',
            total: o.pricing?.total,
            createdAt: o.createdAt,
        };
        const statusOk = (status === 'all') ||
                         (status === 'pending_cash' && o.status === orderManager.STATUS.PENDING_CASH) ||
                         (status === 'processing' && o.status === orderManager.STATUS.PROCESSING) ||
                         (status === 'ready' && o.status === orderManager.STATUS.READY) ||
                         (status === 'completed' && o.status === orderManager.STATUS.COMPLETED) ||
                         (status === 'cancelled' && o.status === orderManager.STATUS.CANCELLED);
        if (statusOk && (matches(o.orderId) || matches(o.customerName))) {
            results.push(record);
        }
    }

    // From pending QRIS payments (dataStore)
    if (status === 'all' || status === 'pending_payment') {
        const pend = dataStore.getPendingPayments();
        pend.forEach(p => {
            const record = {
                type: 'payment',
                orderId: p.orderId,
                customerName: null,
                userId: (p.customerId || '').split('@')[0],
                status: 'pending_payment',
                paymentMethod: 'QRIS',
                total: p.amount,
                createdAt: p.createdAt,
            };
            if (matches(p.orderId) || matches(record.userId)) {
                results.push(record);
            }
        });
    }

    // sort by createdAt desc when available, else by orderId desc
    results.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || (b.orderId || '').localeCompare(a.orderId || ''));
    res.json({ success: true, count: results.length, results });
});

/**
 * GET /api/orders/ready-list
 * List orders currently READY (for dashboard to mark completed)
 * IMPORTANT: This must be placed BEFORE the catch-all GET '/:orderId'
 */
router.get('/ready-list', (req, res) => {
    const orderManager = require('../../services/orderManager');
    const list = [];
    for (const orderId of orderManager.orders.keys()) {
        const o = orderManager.getOrder(orderId);
        if (o && o.status === orderManager.STATUS.READY) {
            list.push({
                orderId: o.orderId,
                customerName: o.customerName || 'Customer',
                userId: (o.userId || '').split('@')[0],
                items: o.items || [],
                pricing: o.pricing,
                readyAt: o.readyAt || o.updatedAt || o.createdAt,
                paymentMethod: o.paymentMethod || 'QRIS'
            });
        }
    }
    // Newest ready first
    list.sort((a,b) => new Date(b.readyAt||0) - new Date(a.readyAt||0));
    res.json({ success: true, count: list.length, orders: list });
});

/**
 * GET /api/orders/:orderId
 * Get detailed order or pending payment info by orderId
 */
// NOTE: Keep this catch-all GET by ID at the bottom, after any more specific GET routes (e.g., /ready-list)
router.get('/:orderId', (req, res) => {
    const { orderId } = req.params;
    const orderManager = require('../../services/orderManager');
    const ds = require('../dataStore');
    const order = orderManager.getOrder(orderId);
    if (order) {
        return res.json({ success: true, type: 'order', order });
    }
    const pend = ds.getPendingPayments().find(p => p.orderId === orderId);
    if (pend) {
        return res.json({ success: true, type: 'payment', payment: pend });
    }
    res.status(404).json({ success: false, message: 'Not found' });
});

/**
 * DELETE /api/orders/:orderId
 * Delete order from database and memory (admin/kasir action)
 */
router.delete('/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const orderManager = require('../../services/orderManager');
    const orderStore = require('../../services/orderStore');
    const dataStore = require('../dataStore');
    
    try {
        // Check if order exists in memory
        const order = orderManager.getOrder(orderId);
        if (order) {
            // Remove from memory
            orderManager.orders.del(orderId);
        }
        
        // Check if it's a pending payment and remove it (QRIS pending)
        const removedPending = dataStore.removePendingPayment(orderId);
        
    // Remove from database (SQLite)
    const dbDeleted = orderStore.deleteOrder(orderId);
        
        if (dbDeleted || !!removedPending) {
            console.log(`🗑️ Order/payment deleted: ${orderId}`);
            res.json({ success: true, message: 'Order deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Order not found' });
        }
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete order', error: error.message });
    }
});

/**
 * POST /api/orders/complete/:orderId
 * Mark order as COMPLETED (customer picked-up)
 */
router.post('/complete/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { completedBy } = req.body || {};
    const orderManager = require('../../services/orderManager');
    const dataStore = require('../dataStore');

    const order = orderManager.getOrder(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== orderManager.STATUS.READY) {
        return res.status(400).json({ success: false, message: `Order status is ${order.status}, must be READY to complete` });
    }

    try {
        const updated = orderManager.updateOrderStatus(orderId, orderManager.STATUS.COMPLETED, { completedBy: completedBy || 'kasir' });
        // Optional: notify customer
        try {
            const bot = dataStore.getBotInstance();
            if (bot && bot.sock) {
                await bot.sock.sendMessage(updated.userId, { text: `✅ Pesanan *${updated.orderId}* selesai. Terima kasih! ☕️` });
            }
        } catch (_) {}
        res.json({ success: true, order: { orderId: updated.orderId, status: updated.status } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
