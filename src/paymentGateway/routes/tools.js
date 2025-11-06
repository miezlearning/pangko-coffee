const express = require('express');
const router = express.Router();
const path = require('path');
const Database = require('better-sqlite3');

// Helper to open the same DB used by orderStore (src/data/database.db)
function openDb() {
  const dbPath = path.join(__dirname, '../../data/database.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

// GET /api/tools/tables
// Return a list of non-system tables in the sqlite database
router.get('/tables', (req, res) => {
  try {
    const db = openDb();
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = rows.map(r => r.name);
    res.json({ success: true, tables });
  } catch (e) {
    console.error('Failed to list tables:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/tools/reset-table
// Body: { table: 'orders', confirm: true }
// Deletes all rows from the given table. Requires explicit confirm=true in body.
router.post('/reset-table', (req, res) => {
  try {
    const { table, confirm } = req.body || {};
    if (!table || typeof table !== 'string') return res.status(400).json({ success: false, message: 'table is required' });
    if (confirm !== true) return res.status(400).json({ success: false, message: 'confirm must be true to perform destructive action' });

    // Safety: prevent deleting sqlite internal tables
    if (table.startsWith('sqlite_')) return res.status(400).json({ success: false, message: 'Cannot reset internal sqlite tables' });

    const db = openDb();
    // Check table exists
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
    if (!exists) return res.status(404).json({ success: false, message: 'Table not found' });

    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    // Run delete in transaction
    const del = db.prepare(`DELETE FROM ${table}`);
    const tx = db.transaction(() => del.run());
    tx();

    res.json({ success: true, message: `Table ${table} reset (all rows deleted)`, columns: info.map(c => c.name) });
  } catch (e) {
    console.error('Failed to reset table:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
