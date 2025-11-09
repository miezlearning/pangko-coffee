const NodeCache = require('node-cache');
const moment = require('moment-timezone');
const config = require('../config/config');

/**
 * Order Manager
 * Mengelola lifecycle order: create, payment, confirmation, completion
 */
class OrderManager {
    constructor() {
        // Cache untuk menyimpan orders (ttl: 24 hours)
        this.orders = new NodeCache({ stdTTL: 86400, checkperiod: 120 });
        // Cache untuk session ordering per user (30 minutes)
        this.sessions = new NodeCache({ stdTTL: 1800 });
        // Order status
        this.STATUS = {
            DRAFT: 'draft',
            PENDING_PAYMENT: 'pending_payment',
            PENDING_CASH: 'pending_cash',
            PAID: 'paid',
            PROCESSING: 'processing',
            READY: 'ready',
            COMPLETED: 'completed',
            CANCELLED: 'cancelled',
            EXPIRED: 'expired'
        };
        // Load persisted orders (best-effort)
        try {
            const store = require('./orderStore');
            const existing = store.loadOrders();
            existing.forEach(o => {
                if (o && o.orderId) this.orders.set(o.orderId, o);
            });
        } catch (e) {
            console.error('Load persisted orders failed:', e.message);
        }
    }

    /**
     * Generate unique order ID
     * Format: CFxxxx (CF = Coffee, xxxx = timestamp)
     */
    generateOrderId() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `CF${timestamp}${random}`;
    }

    /**
     * Create new order session for user
     */
    createSession(userId) {
        const session = {
            userId,
            items: [],
            notes: '',
            createdAt: new Date(),
            step: 'menu_selection'
        };
        this.sessions.set(userId, session);
        return session;
    }

    /** Persist helpers */
    _persistAll() {
        try {
            const all = this.orders.keys().map(k => this.orders.get(k));
            const store = require('./orderStore');
            store.saveOrders(all);
        } catch (e) {
            // best-effort persistence
            console.error('Persist orders failed:', e.message);
        }
    }

    /**
     * Get user session
     */
    getSession(userId) {
        return this.sessions.get(userId);
    }

    /**
     * Add item to cart
     */
    addItemToCart(userId, item, quantity = 1) {
        const session = this.getSession(userId) || this.createSession(userId);
        const identityKey = item && item.cartKey ? item.cartKey : item.id;
        // Check if item already in cart
        const existingIndex = session.items.findIndex(i => (i.cartKey || i.id) === identityKey);
        if (existingIndex > -1) {
            session.items[existingIndex].quantity += quantity;
        } else {
            session.items.push({ ...item, quantity, cartKey: identityKey });
        }
        this.sessions.set(userId, session);
        return session;
    }

    /**
     * Remove item from cart
     */
    removeItemFromCart(userId, itemId) {
        const session = this.getSession(userId);
        if (!session) return null;
        
        session.items = session.items.filter(i => i.id !== itemId);
        this.sessions.set(userId, session);
        return session;
    }

    /**
     * Clear cart
     */
    clearCart(userId) {
        this.sessions.del(userId);
    }

    /**
     * Calculate order total
     */
    calculateTotal(items, includeFee = false) {
        const subtotal = items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        if (!includeFee || !config.order.serviceFee.enabled) {
            return { subtotal, fee: 0, total: subtotal };
        }

        let fee = 0;
        if (config.order.serviceFee.type === 'rupiah') {
            fee = config.order.serviceFee.amount;
        } else if (config.order.serviceFee.type === 'percent') {
            fee = Math.round(subtotal * (config.order.serviceFee.amount / 100));
        }

        return {
            subtotal,
            fee,
            total: subtotal + fee
        };
    }

    /**
     * Create order from session
     */
    createOrder(userId, customerName = null, paymentMethod = 'QRIS') {
        const session = this.getSession(userId);
        if (!session || session.items.length === 0) {
            throw new Error('Cart is empty');
        }

        const orderId = this.generateOrderId();
        const pricing = this.calculateTotal(session.items, true);
        
        const order = {
            orderId,
            userId,
            customerName: customerName || 'Customer', // Default if not provided
            items: session.items,
            notes: session.notes,
            pricing,
            status: paymentMethod === 'CASH' ? this.STATUS.PENDING_CASH : this.STATUS.PENDING_PAYMENT,
            createdAt: new Date(),
            paymentExpiry: moment().add(config.order.paymentTimeout, 'minutes').toDate(),
            qrisGenerated: false,
            qrisCode: null,
            paymentMethod,
            paidAt: null,
            completedAt: null
        };

        order.paymentProof = null;

        // Cash-specific timers/metadata
        if (paymentMethod === 'CASH') {
            const cashTimeout = (config.order && (config.order.cashTimeout ?? config.order.paymentTimeout)) || 10;
            order.cashExpiresAt = moment().add(cashTimeout, 'minutes').toDate();
            order.cashAcceptedAt = null;
            order.cashCancelledAt = null;
            order.cashCancelReason = null;
            order.canReopenUntil = null; // set when cancelled/expired
            order.reopenCount = 0;
        }

    this.orders.set(orderId, order);
    this._persistAll();
        this.clearCart(userId);
        
        return order;
    }

    /**
     * Get order by ID
     */
    getOrder(orderId) {
        return this.orders.get(orderId);
    }

    /**
     * Get all orders by user
     */
    getUserOrders(userId) {
        const allOrders = this.orders.keys().map(key => this.orders.get(key));
        return allOrders.filter(order => order.userId === userId);
    }

    /**
     * Update order status
     */
    updateOrderStatus(orderId, status, metadata = {}) {
        const order = this.getOrder(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        const oldStatus = order.status;
        order.status = status;
        order.updatedAt = new Date();

        // Add specific metadata based on status
        if (status === this.STATUS.PAID) {
            order.paidAt = new Date();
        } else if (status === this.STATUS.PROCESSING) {
            // Mark when processing started (used by dashboard duration)
            if (!order.confirmedAt) order.confirmedAt = new Date();

            // 🖨️ Auto-print receipt and open cash drawer when payment confirmed
            // Trigger when transitioning to PROCESSING from PENDING states
            if ((oldStatus === this.STATUS.PENDING_PAYMENT || oldStatus === this.STATUS.PENDING_CASH) && 
                status === this.STATUS.PROCESSING) {
                this._autoPrintReceipt(order);
            }
        } else if (status === this.STATUS.COMPLETED) {
            order.completedAt = new Date();
        }

        Object.assign(order, metadata);
        this.orders.set(orderId, order);
        this._persistAll();
        
        return order;
    }

    /**
     * Auto-print receipt when payment confirmed (async, non-blocking)
     */
    _autoPrintReceipt(order) {
        try {
            const config = require('../config/config');
            if (!config.printer?.enabled || !config.printer?.autoPrint) {
                return;
            }

            const printerService = require('./printerService');
            
            // Run async without blocking order status update
            const action = (order.paymentMethod || 'QRIS') === 'CASH'
                ? () => printerService.printAndOpenDrawer(order)
                : () => printerService.printReceipt(order);

            action()
                .then(() => {
                    console.log(`[OrderManager] ✅ Auto-printed receipt for ${order.orderId}`);
                })
                .catch(err => {
                    console.error(`[OrderManager] ❌ Auto-print failed for ${order.orderId}:`, err.message);
                });
        } catch (error) {
            console.error('[OrderManager] Error triggering auto-print:', error.message);
        }
    }

    /**
     * Set QRIS for order
     */
    setOrderQRIS(orderId, qrisCode, meta = {}) {
        const order = this.getOrder(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        order.qrisCode = qrisCode;
        order.qrisGenerated = true;
        order.qrisGeneratedAt = new Date();
        if (meta && typeof meta === 'object') {
            if (meta.provider) order.paymentProvider = meta.provider;
            if (meta.referenceNumber) order.qrisReference = meta.referenceNumber;
            if (meta.externalId) order.qrisExternalId = meta.externalId;
            if (meta.expiresAt) order.qrisExpiresAt = new Date(meta.expiresAt);
            if (meta.deeplink) order.qrisDeeplink = meta.deeplink;
            if (meta.raw) order.qrisRawResponse = meta.raw;
        }
        
        this.orders.set(orderId, order);
        this._persistAll();
        return order;
    }

    setPaymentProof(orderId, proof) {
        const order = this.getOrder(orderId);
        if (!order) throw new Error('Order not found');

        order.paymentProof = {
            ...proof,
            receivedAt: new Date()
        };
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
        this._persistAll();
            // Also update payment gateway pending list if exists so dashboard can show the proof image
            try {
                // dataStore is in src/paymentGateway/dataStore.js relative to services
                const dataStore = require('../paymentGateway/dataStore');
                const pending = dataStore.getPendingPayments() || [];
                const idx = pending.findIndex(p => p.orderId === orderId || p.id === orderId);
                if (idx > -1) {
                    // attach the proof object (including imageData if provided)
                    pending[idx].paymentProof = order.paymentProof;
                    // replace entire pending array (dataStore will persist to disk)
                    dataStore.updatePendingPayments(pending);
                }
            } catch (e) {
                // best-effort: if update fails, just log and continue
                console.warn('[OrderManager] Failed to update pending payment proof:', e && e.message);
            }

            return order;
    }

    /**
     * Check if payment is expired
     */
    isPaymentExpired(orderId) {
        const order = this.getOrder(orderId);
        if (!order) return true;

        return moment().isAfter(order.paymentExpiry);
    }

    /**
     * Get pending payment orders
     */
    getPendingPaymentOrders() {
        const allOrders = this.orders.keys().map(key => this.orders.get(key));
        return allOrders.filter(order => 
            order.status === this.STATUS.PENDING_PAYMENT
        );
    }

    /**
     * Get pending cash orders
     */
    getPendingCashOrders() {
        const allOrders = this.orders.keys().map(key => this.orders.get(key));
        return allOrders.filter(order => order.status === this.STATUS.PENDING_CASH);
    }

    /**
     * Accept cash payment (kasir presses Accept)
     */
    acceptCash(orderId, acceptedBy = 'kasir') {
        const order = this.getOrder(orderId);
        if (!order) throw new Error('Order not found');
        if (order.paymentMethod !== 'CASH') throw new Error('Not a cash order');
        if (order.status !== this.STATUS.PENDING_CASH) throw new Error(`Order status must be PENDING_CASH, got ${order.status}`);

        const cashAcceptedAt = new Date();
        // Use the unified path to trigger auto-print + drawer
        const updated = this.updateOrderStatus(orderId, this.STATUS.PROCESSING, {
            cashAcceptedAt,
            acceptedBy,
            confirmedAt: cashAcceptedAt
        });
        return updated;
    }

    /**
     * Cancel cash (no-show or cashier decision). Allows reopen within windowMinutes (default 60)
     */
    cancelCash(orderId, reason = 'cash_cancel', windowMinutes = 60) {
        const order = this.getOrder(orderId);
        if (!order) throw new Error('Order not found');
        if (order.paymentMethod !== 'CASH') throw new Error('Not a cash order');
        // can cancel from pending_cash; if already cancelled, just update reason/window
        order.cashCancelledAt = new Date();
        order.cashCancelReason = reason;
        order.canReopenUntil = moment().add(windowMinutes, 'minutes').toDate();
        order.status = this.STATUS.CANCELLED;
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
        this._persistAll();
        return order;
    }

    /**
     * Reopen a recently-cancelled cash order within its reopen window
     */
    reopenCash(orderId) {
        const order = this.getOrder(orderId);
        if (!order) throw new Error('Order not found');
        if (order.paymentMethod !== 'CASH') throw new Error('Not a cash order');
        if (order.status !== this.STATUS.CANCELLED) throw new Error('Order is not cancelled');
        if (!order.canReopenUntil || moment().isAfter(order.canReopenUntil)) {
            throw new Error('Reopen window has expired');
        }
        // Only allow reopen if last cancel was timeout (auto-cancel). If kasir canceled, require kasir-side reopen.
        if (order.cashCancelReason && order.cashCancelReason !== 'cash_timeout') {
            throw new Error('Reopen oleh pelanggan hanya untuk kasus timeout. Minta kasir untuk membuka kembali.');
        }
        const maxReopen = (config.order && (config.order.maxReopenPerOrder ?? 1)) || 1;
        const cooldown = (config.order && (config.order.reopenCooldownMinutes ?? 3)) || 3;
        if (typeof order.reopenCount === 'number' && order.reopenCount >= maxReopen) {
            throw new Error('Batas buka kembali sudah tercapai. Silakan buat pesanan baru.');
        }
        if (order.cashCancelledAt && moment().isBefore(moment(order.cashCancelledAt).add(cooldown, 'minutes'))) {
            throw new Error(`Tunggu ${cooldown} menit sebelum membuka kembali.`);
        }
        const cashTimeout = (config.order && (config.order.cashTimeout ?? config.order.paymentTimeout)) || 10;
        order.status = this.STATUS.PENDING_CASH;
        order.cashCancelledAt = null;
        order.cashCancelReason = null;
        order.cashExpiresAt = moment().add(cashTimeout, 'minutes').toDate();
        // Kasir reopen tidak mengurangi jatah pelanggan
        // (tidak menambah reopenCount)
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
        this._persistAll();
        return order;
    }

    /**
     * Reopen cancelled cash by cashier (ignore customer-only restrictions)
     */
    reopenCashByCashier(orderId) {
        const order = this.getOrder(orderId);
        if (!order) throw new Error('Order not found');
        if (order.paymentMethod !== 'CASH') throw new Error('Not a cash order');
        if (order.status !== this.STATUS.CANCELLED) throw new Error('Order is not cancelled');
        // Respect window when defined
        if (order.canReopenUntil && moment().isAfter(order.canReopenUntil)) {
            throw new Error('Window buka kembali telah habis');
        }
        const cashTimeout = (config.order && (config.order.cashTimeout ?? config.order.paymentTimeout)) || 10;
        order.status = this.STATUS.PENDING_CASH;
        order.cashCancelledAt = null;
        order.cashCancelReason = null;
        order.cashExpiresAt = moment().add(cashTimeout, 'minutes').toDate();
        order.reopenCount = (order.reopenCount || 0) + 1;
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
        this._persistAll();
        return order;
    }

    /**
     * Get orders ready for pickup
     */
    getReadyOrders() {
        const allOrders = this.orders.keys().map(key => this.orders.get(key));
        return allOrders.filter(order => order.status === this.STATUS.READY);
    }

    /**
     * Format order details for display
     */
    formatOrderDetails(order) {
        let text = `📋 *Order Details*\n\n`;
        text += `Order ID: *${order.orderId}*\n`;
        text += `Status: ${this.getStatusEmoji(order.status)} ${order.status}\n`;
        text += `Tanggal: ${moment(order.createdAt).format('DD/MM/YYYY HH:mm')}\n\n`;
        
        text += `*Items:*\n`;
        order.items.forEach((item, index) => {
            text += `${index + 1}. ${item.name} x${item.quantity}\n`;
            text += `   Rp ${this.formatNumber(item.price * item.quantity)}\n`;
            if (Array.isArray(item.addons) && item.addons.length > 0) {
                item.addons.forEach(addon => {
                    if (!addon || !addon.quantity) return;
                    const unit = addon.unitPrice !== undefined ? addon.unitPrice : addon.price || 0;
                    const addonTotal = unit * addon.quantity;
                    text += `   ➕ ${addon.name} x${addon.quantity} (Rp ${this.formatNumber(addonTotal)})\n`;
                });
            }
            if (item.notes) {
                text += `   Catatan: ${item.notes}\n`;
            }
        });
        
        text += `\n`;
        text += `Subtotal: Rp ${this.formatNumber(order.pricing.subtotal)}\n`;
        
        if (order.pricing.fee > 0) {
            text += `Biaya Layanan: Rp ${this.formatNumber(order.pricing.fee)}\n`;
        }
        
        text += `*Total: Rp ${this.formatNumber(order.pricing.total)}*\n`;
        
        if (order.notes) {
            text += `\nCatatan: ${order.notes}\n`;
        }

        return text;
    }

    /**
     * Get status emoji
     */
    getStatusEmoji(status) {
        const emojis = {
            [this.STATUS.DRAFT]: '📝',
            [this.STATUS.PENDING_PAYMENT]: '💳',
            [this.STATUS.PENDING_CASH]: '💵',
            [this.STATUS.PAID]: '✅',
            [this.STATUS.PROCESSING]: '👨‍🍳',
            [this.STATUS.READY]: '🎉',
            [this.STATUS.COMPLETED]: '✅',
            [this.STATUS.CANCELLED]: '❌',
            [this.STATUS.EXPIRED]: '⏰'
        };
        return emojis[status] || '❓';
    }

    /**
     * Format number with thousand separator
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    /**
     * Clean expired orders (run periodically)
     */
    cleanExpiredOrders() {
        const expiredEvents = { qrisExpired: [], cashExpired: [] };
        // QRIS pending expiry
        const pendingOrders = this.getPendingPaymentOrders();
        pendingOrders.forEach(order => {
            if (this.isPaymentExpired(order.orderId)) {
                this.updateOrderStatus(order.orderId, this.STATUS.EXPIRED);
                expiredEvents.qrisExpired.push(order);
            }
        });

        // Cash pending expiry -> auto-cancel with reopen window
        const cashOrders = this.getPendingCashOrders();
        cashOrders.forEach(order => {
            if (order.cashExpiresAt && moment().isAfter(order.cashExpiresAt)) {
                const cancelled = this.cancelCash(order.orderId, 'cash_timeout', 60);
                expiredEvents.cashExpired.push(cancelled);
            }
        });

        return expiredEvents;
    }
}

module.exports = new OrderManager();