#!/usr/bin/env node
/*
  Import historical orders into SQLite for analytics.
  Usage:
    node scripts/importOrders.js <path-to-json> [--method=QRIS|CASH]

  JSON schema: Array of orders. Each order example:
  {
    "orderId": "CF202410010001",
    "userId": "628123456789@s.whatsapp.net",  // or plain number (we'll append suffix)
    "customerName": "Budi",
    "items": [
      {"id":"C004","name":"Latte","price":24000,"quantity":1,"notes":""},
      {"id":"C001","name":"Espresso","price":15000,"quantity":2}
    ],
    "paymentMethod": "QRIS",
    "status": "completed", // allowed: draft|pending_payment|pending_cash|paid|processing|ready|completed|cancelled|expired
    "createdAt": "2024-10-01T10:12:00+08:00",
    "paidAt": "2024-10-01T10:14:00+08:00",
    "confirmedAt": "2024-10-01T10:15:00+08:00",
    "completedAt": "2024-10-01T10:25:00+08:00"
  }
*/

const fs = require('fs');
const path = require('path');
const orderStore = require('../src/services/orderStore');
const orderManager = require('../src/services/orderManager');

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node scripts/importOrders.js <path-to-json> [--method=QRIS|CASH]');
    process.exit(1);
  }
  const file = path.resolve(process.cwd(), argv[0]);
  const opts = { file, method: null };
  argv.slice(1).forEach(a => {
    if (a.startsWith('--method=')) opts.method = a.split('=')[1];
  });
  return opts;
}

function ensureWA(userId) {
  if (!userId) return 'unknown@s.whatsapp.net';
  if (userId.includes('@')) return userId;
  // normalize numeric-only phone
  return `${String(userId).replace(/[^0-9]/g,'')}@s.whatsapp.net`;
}

function computePricing(items, includeFee = false) {
  try {
    return orderManager.calculateTotal(items || [], includeFee);
  } catch (_) {
    const subtotal = (items || []).reduce((s,i)=> s + (Number(i.price)||0) * (Number(i.quantity)||0), 0);
    return { subtotal, fee: 0, total: subtotal };
  }
}

function normalizeStatus(s) {
  if (!s) return orderManager.STATUS.COMPLETED; // default assume completed
  s = String(s).toLowerCase();
  const map = {
    draft: orderManager.STATUS.DRAFT,
    pending_payment: orderManager.STATUS.PENDING_PAYMENT,
    pending_cash: orderManager.STATUS.PENDING_CASH,
    paid: orderManager.STATUS.PAID,
    processing: orderManager.STATUS.PROCESSING,
    ready: orderManager.STATUS.READY,
    completed: orderManager.STATUS.COMPLETED,
    cancelled: orderManager.STATUS.CANCELLED,
    canceled: orderManager.STATUS.CANCELLED,
    expired: orderManager.STATUS.EXPIRED,
  };
  return map[s] || orderManager.STATUS.COMPLETED;
}

function normalizeOrder(input, defaultMethod) {
  const items = Array.isArray(input.items) ? input.items.map(it => ({
    id: it.id || null,
    name: it.name || 'Item',
    price: Number(it.price)||0,
    quantity: Number(it.quantity)||1,
    notes: it.notes || ''
  })) : [];

  const pricing = input.pricing && typeof input.pricing.total !== 'undefined'
    ? { subtotal: Number(input.pricing.subtotal)||0, fee: Number(input.pricing.fee)||0, total: Number(input.pricing.total)||0 }
    : computePricing(items, true);

  const status = normalizeStatus(input.status);
  const paymentMethod = (input.paymentMethod || defaultMethod || 'QRIS').toUpperCase();
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  const order = {
    orderId: input.orderId || orderManager.generateOrderId(),
    userId: ensureWA(input.userId),
    customerName: input.customerName || 'Customer',
    items,
    notes: input.notes || '',
    pricing,
    status,
    createdAt,
    paymentExpiry: input.paymentExpiry ? new Date(input.paymentExpiry) : new Date(createdAt.getTime() + 10*60000),
    qrisGenerated: false,
    qrisCode: null,
    paymentMethod,
    paidAt: input.paidAt ? new Date(input.paidAt) : (status===orderManager.STATUS.PAID||status===orderManager.STATUS.PROCESSING||status===orderManager.STATUS.READY||status===orderManager.STATUS.COMPLETED ? createdAt : null),
    confirmedAt: input.confirmedAt ? new Date(input.confirmedAt) : (status===orderManager.STATUS.PROCESSING||status===orderManager.STATUS.READY||status===orderManager.STATUS.COMPLETED ? createdAt : null),
    completedAt: input.completedAt ? new Date(input.completedAt) : (status===orderManager.STATUS.COMPLETED ? createdAt : null)
  };

  if (paymentMethod === 'CASH') {
    order.cashExpiresAt = input.cashExpiresAt ? new Date(input.cashExpiresAt) : new Date(createdAt.getTime() + 10*60000);
    order.cashAcceptedAt = input.cashAcceptedAt ? new Date(input.cashAcceptedAt) : (status!==orderManager.STATUS.PENDING_CASH ? createdAt : null);
    order.cashCancelledAt = input.cashCancelledAt ? new Date(input.cashCancelledAt) : null;
    order.cashCancelReason = input.cashCancelReason || null;
    order.canReopenUntil = input.canReopenUntil ? new Date(input.canReopenUntil) : null;
    order.reopenCount = Number(input.reopenCount)||0;
  }

  return order;
}

async function main() {
  const { file, method } = parseArgs();
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON. Ensure the file contains a JSON array of orders. Error:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error('Input must be a JSON array of orders');
    process.exit(1);
  }

  const orders = data.map(o => normalizeOrder(o, method));
  // Save in batches to SQLite (REPLACE INTO)
  orderStore.saveOrders(orders);
  console.log(`✅ Imported ${orders.length} orders into SQLite.`);
}

main().catch(e => { console.error(e); process.exit(1); });
