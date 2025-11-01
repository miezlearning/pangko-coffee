/**
 * Payment Gateway Data Store
 * In-memory storage untuk pending payments dan history
 */

// Storage arrays
let pendingPayments = [];
let paymentHistory = [];

// Bot instance reference
let botInstance = null;

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
}

/**
 * Remove pending payment
 */
function removePendingPayment(orderId) {
    const index = pendingPayments.findIndex(p => p.orderId === orderId);
    if (index > -1) {
        const payment = pendingPayments[index];
        pendingPayments.splice(index, 1);
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
}

/**
 * Update pending payments array
 */
function updatePendingPayments(newPayments) {
    pendingPayments = newPayments;
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
