/**
 * Payment Gateway Data Store
 * In-memory storage untuk pending payments dan history
 * + Simple disk persistence so data survives restarts
 */

const fs = require('fs');
const path = require('path');

// Resolve data directory at project root
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'payments.json');

function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch (e) {
        // If folder can't be created, fallback to in-memory only
        console.warn('[dataStore] Cannot create data directory:', e.message);
    }
}

function loadFromDisk() {
    try {
        ensureDataDir();
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const json = JSON.parse(raw);
            if (Array.isArray(json.pendingPayments)) pendingPayments = json.pendingPayments;
            if (Array.isArray(json.paymentHistory)) paymentHistory = json.paymentHistory;
        }
    } catch (e) {
        console.warn('[dataStore] Failed to load payments.json:', e.message);
    }
}

function saveToDisk() {
    try {
        ensureDataDir();
        const payload = {
            pendingPayments,
            paymentHistory
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
        console.warn('[dataStore] Failed to persist payments.json:', e.message);
    }
}

// Storage arrays
let pendingPayments = [];
let paymentHistory = [];

// Bot instance reference
let botInstance = null;

// Initialize from disk if available
loadFromDisk();

/**
 * Get pending payments
 */
function getPendingPayments() {
    return pendingPayments;
}

/**
 * Get payment history
 */
function getPaymentHistory() {
    return paymentHistory;
}

/**
 * Add pending payment
 */
function addPendingPayment(payment) {
    pendingPayments.push(payment);
    saveToDisk();
}

/**
 * Remove pending payment
 */
function removePendingPayment(orderId) {
    const index = pendingPayments.findIndex(p => p.orderId === orderId);
    if (index > -1) {
        const payment = pendingPayments[index];
        pendingPayments.splice(index, 1);
        saveToDisk();
        return payment;
    }
    return null;
}

/**
 * Find pending payment
 */
function findPendingPayment(orderId) {
    return pendingPayments.find(p => p.orderId === orderId);
}

/**
 * Add to payment history
 */
function addToHistory(payment) {
    paymentHistory.push(payment);
    saveToDisk();
}

/**
 * Set bot instance
 */
function setBotInstance(bot) {
    botInstance = bot;
}

/**
 * Get bot instance
 */
function getBotInstance() {
    return botInstance;
}

/**
 * Clear pending payments
 */
function clearPendingPayments() {
    pendingPayments = [];
    saveToDisk();
}

/**
 * Update pending payments array
 */
function updatePendingPayments(newPayments) {
    pendingPayments = newPayments;
    saveToDisk();
}

/**
 * Get all payments (pending + history)
 */
function getAllPayments() {
    // Combine pending and history for export
    return [...pendingPayments, ...paymentHistory];
}

/**
 * Get all orders (dummy, for demo; replace with real order source if needed)
 */
function getAllOrders() {
    // If you have a real order store, replace this
    return [];
}

module.exports = {
    getPendingPayments,
    getPaymentHistory,
    addPendingPayment,
    removePendingPayment,
    findPendingPayment,
    addToHistory,
    setBotInstance,
    getBotInstance,
    clearPendingPayments,
    updatePendingPayments,
    getAllPayments,
    getAllOrders
};
