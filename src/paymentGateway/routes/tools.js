const express = require('express');
const router = express.Router();
const path = require('path');
const Database = require('better-sqlite3');
const storeState = require('../../services/storeState');
const dataStore = require('../dataStore');

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

// (router will be exported after all routes are defined)

// --- Store control API ---
// GET /api/tools/store-state
// Returns current store open/closed state
router.get('/store-state', (req, res) => {
  try {
    const state = storeState.readState();
    res.json({ success: true, state });
  } catch (e) {
    console.error('Failed to read store state:', e && e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/tools/store-open
// Body: { open: true|false, message?: string, updatedBy?: string }
// Sets store open/closed and notifies configured numbers via bot
router.post('/store-open', async (req, res) => {
  try {
    const { open, message, updatedBy } = req.body || {};
    if (typeof open !== 'boolean') return res.status(400).json({ success: false, message: 'open must be boolean' });

    const next = storeState.setOpen(open, updatedBy || 'dashboard', message || null);

    // Notify admin / barista numbers about the change
    try {
      const bot = dataStore.getBotInstance();
      const config = require('../../config/config');
      const recipients = Array.from(new Set([...(config.shop.adminNumbers||[]), ...(config.shop.baristaNumbers||[])]));
      const text = open
        ? `✅ Toko DIBUKA oleh ${updatedBy || 'dashboard'}\n\n${config.shop.name}\nJam Operasional: ${config.shop.openHours}`
        : `⏸️ Toko DITUTUP oleh ${updatedBy || 'dashboard'}\n\n${config.shop.name}\n${message || ''}`;
      if (bot && bot.sock) {
        for (const to of recipients) {
          try { await bot.sock.sendMessage(to, { text }); } catch (_) { /* ignore individual errors */ }
        }
      }
    } catch (notifyErr) {
      console.warn('Failed to notify via bot:', notifyErr && notifyErr.message);
    }

    res.json({ success: true, state: next });
  } catch (e) {
    console.error('Failed to set store state:', e && e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// finally export router
module.exports = router;
