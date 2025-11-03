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
  
  // Orders table
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
  
  // Menu categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Menu items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      available INTEGER DEFAULT 1,
      description TEXT,
      image TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
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
/**
 * Get a single order by ID from SQLite
 */
function getOrderById(orderId) {
  try {
    const db = initDb();
    const row = db.prepare('SELECT data FROM orders WHERE orderId = ?').get(String(orderId));
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  } catch (e) {
    console.error('Failed to get order by id from sqlite:', e.message);
    return null;
  }
}

/**
 * Get orders filtered by statuses. If statuses is empty/undefined, returns empty array.
 */
function getOrdersByStatuses(statuses = []) {
  try {
    if (!Array.isArray(statuses) || statuses.length === 0) return [];
    const db = initDb();
    const placeholders = statuses.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT data FROM orders WHERE status IN (${placeholders}) ORDER BY datetime(createdAt) ASC`);
    const rows = stmt.all(...statuses.map(String));
    return rows.map(r => {
      try { return JSON.parse(r.data); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('Failed to get orders by statuses from sqlite:', e.message);
    return [];
  }
}

/**
 * Get orders by user id, most recent first. If limit provided, apply it.
 */
function getOrdersByUserId(userId, limit = 50) {
  try {
    const db = initDb();
    const stmt = db.prepare(`SELECT data FROM orders WHERE userId = ? ORDER BY datetime(createdAt) DESC ${limit ? 'LIMIT ?' : ''}`);
    const rows = limit ? stmt.all(String(userId), Number(limit)) : stmt.all(String(userId));
    return rows.map(r => {
      try { return JSON.parse(r.data); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('Failed to get orders by user id from sqlite:', e.message);
    return [];
  }
}

module.exports = { loadOrders, saveOrders, deleteOrder, getOrderById, getOrdersByStatuses, getOrdersByUserId };
