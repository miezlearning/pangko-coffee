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
        
        // Cache untuk session ordering per user
        this.sessions = new NodeCache({ stdTTL: 1800 }); // 30 minutes
        
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
        
        // Check if item already in cart
        const existingIndex = session.items.findIndex(i => i.id === item.id);
        
        if (existingIndex > -1) {
            session.items[existingIndex].quantity += quantity;
        } else {
            session.items.push({
                ...item,
                quantity
            });
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

        // Cash-specific timers/metadata
        if (paymentMethod === 'CASH') {
            const cashTimeout = (config.order && (config.order.cashTimeout ?? config.order.paymentTimeout)) || 10;
            order.cashExpiresAt = moment().add(cashTimeout, 'minutes').toDate();
            order.cashAcceptedAt = null;
            order.cashCancelledAt = null;
            order.cashCancelReason = null;
            order.canReopenUntil = null; // set when cancelled/expired
        }

        this.orders.set(orderId, order);
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

        order.status = status;
        order.updatedAt = new Date();

        // Add specific metadata based on status
        if (status === this.STATUS.PAID) {
            order.paidAt = new Date();
        } else if (status === this.STATUS.COMPLETED) {
            order.completedAt = new Date();
        }

        Object.assign(order, metadata);
        this.orders.set(orderId, order);
        
        return order;
    }

    /**
     * Set QRIS for order
     */
    setOrderQRIS(orderId, qrisCode) {
        const order = this.getOrder(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        order.qrisCode = qrisCode;
        order.qrisGenerated = true;
        order.qrisGeneratedAt = new Date();
        
        this.orders.set(orderId, order);
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
        order.cashAcceptedAt = new Date();
        order.acceptedBy = acceptedBy;
        order.status = this.STATUS.PROCESSING;
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
        return order;
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
        const cashTimeout = (config.order && (config.order.cashTimeout ?? config.order.paymentTimeout)) || 10;
        order.status = this.STATUS.PENDING_CASH;
        order.cashCancelledAt = null;
        order.cashCancelReason = null;
        order.cashExpiresAt = moment().add(cashTimeout, 'minutes').toDate();
        order.updatedAt = new Date();
        this.orders.set(orderId, order);
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