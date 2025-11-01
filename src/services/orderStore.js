const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Store database under src/data/database.db
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'database.db');

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
}

function initDb() {
  ensureDir();
  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      orderId TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT,
      userId TEXT,
      paymentMethod TEXT,
      createdAt TEXT,
      total INTEGER
    );
  `);
  return db;
}

function loadOrders() {
  try {
    const db = initDb();
    const rows = db.prepare('SELECT data FROM orders').all();
    return rows.map(r => {
      try { return JSON.parse(r.data); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('Failed to load orders from sqlite:', e.message);
    return [];
  }
}

function saveOrders(ordersArray) {
  try {
    const db = initDb();
    const insert = db.prepare(`REPLACE INTO orders(orderId, data, status, userId, paymentMethod, createdAt, total)
      VALUES (@orderId, @data, @status, @userId, @paymentMethod, @createdAt, @total)`);
    const tx = db.transaction((rows) => {
      rows.forEach((o) => {
        if (!o || !o.orderId) return;
        const createdISO = o.createdAt ? new Date(o.createdAt).toISOString() : null;
        const totalNum = (o && o.pricing && typeof o.pricing.total !== 'undefined') ? Number(o.pricing.total) : null;
        insert.run({
          orderId: String(o.orderId),
          data: JSON.stringify(o),
          status: o.status ? String(o.status) : null,
          userId: o.userId ? String(o.userId) : null,
          paymentMethod: o.paymentMethod ? String(o.paymentMethod) : null,
          createdAt: createdISO,
          total: totalNum,
        });
      });
    });
    tx(ordersArray || []);
  } catch (e) {
    console.error('Failed to save orders to sqlite:', e.message);
  }
}

function deleteOrder(orderId) {
  try {
    const db = initDb();
    const result = db.prepare('DELETE FROM orders WHERE orderId = ?').run(String(orderId));
    return result.changes > 0;
  } catch (e) {
    console.error('Failed to delete order from sqlite:', e.message);
    return false;
  }
}

module.exports = { loadOrders, saveOrders, deleteOrder };
