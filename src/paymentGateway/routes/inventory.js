const express = require('express');
const router = express.Router();
const inventory = require('../../services/inventoryTracker');
const dataStore = require('../dataStore');
const config = require('../../config/config');

// GET active session
router.get('/active', (req, res) => {
  try {
    const active = inventory.getActiveSession();
    if (!active) return res.status(404).json({ success: false, message: 'Tidak ada sesi aktif' });
    res.json({ success: true, session: active });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET all sessions summary
router.get('/sessions', (req, res) => {
  try {
    const data = require('fs').readFileSync(require('path').join(__dirname, '../../data/inventory-sessions.json'), 'utf8');
    const json = JSON.parse(data || '{"sessions":[]}');
    res.json({ success: true, sessions: json.sessions.map(s => ({ id: s.id, date: s.date, openedAt: s.openedAt, closedAt: s.closedAt, cashier: s.cashier })) });
  } catch (e) {
    res.json({ success: true, sessions: [] }); // fallback
  }
});

// GET available dates
router.get('/dates', (req, res) => {
  try {
    const dates = inventory.getAllSessionDates();
    res.json({ success: true, dates });
  } catch (e) {
    res.json({ success: true, dates: [] });
  }
});

// POST open session
router.post('/open', (req, res) => {
  try {
    const { cashier, openingCash, ingredients } = req.body || {};
    const session = inventory.openSession({ cashier, openingCash, ingredients });
    res.json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST close session
router.post('/close', (req, res) => {
  try {
    const { cashier, closingCash, ingredients } = req.body || {};
    const session = inventory.closeSession({ cashier, closingCash, ingredients });
    res.json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// GET report by session id or date (or latest if none)
router.get('/report/:id?', (req, res) => {
  try {
    const idOrDate = req.params.id || null;
    const report = inventory.computeReport(idOrDate);
    res.json({ success: true, report });
  } catch (e) {
    // Return 200 with message to avoid noisy 400 in UI when session not closed yet
    res.json({ success: false, message: e.message });
  }
});

// GET recipes
router.get('/recipes', (req, res) => {
  try {
    const data = inventory.loadRecipes();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Ingredients catalog management
router.get('/ingredients', (req, res) => {
  try {
    const data = inventory.loadRecipes();
    res.json({ success: true, ingredients: data.ingredients || {} });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/ingredients', (req, res) => {
  try {
    const { name, unit, nettoValue, nettoUnit, buyPrice, originalName } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: 'Nama bahan wajib diisi' });
    const ok = inventory.upsertIngredient({ name, unit, nettoValue, nettoUnit, buyPrice, originalName });
    if (!ok) return res.status(500).json({ success: false, message: 'Gagal menyimpan data bahan' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/ingredients/:name', (req, res) => {
  try {
    const name = req.params.name;
    const ok = inventory.removeIngredient(name);
    if (!ok) return res.status(404).json({ success: false, message: 'Tidak ditemukan' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Discard active session
router.post('/active/discard', (req, res) => {
  try {
    const ok = inventory.discardActiveSession();
    if (!ok) return res.status(404).json({ success: false, message: 'Tidak ada sesi aktif' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// --- Recap generation and sending ---
function buildRecapTextFromOpenClose(opening = {}, closing = {}) {
  const lines = ['Stok Barang :', '', 'keterangan', '❌️(habis)', '‼️segera dibeli', '✅️ BANYAK', ''];
  const keys = new Set([...Object.keys(opening || {}), ...Object.keys(closing || {})]);
  const items = [];
  for (const k of Array.from(keys).sort()) {
    const open = Number(opening[k] || 0);
    const close = Number(closing[k] || 0);
    let badge = '✅️';
    if (!Number.isFinite(close) || close <= 0) badge = '❌️';
    else if (open > 0 && close / open <= 0.1) badge = '‼️';
    items.push(`- ${k} : ${badge}`);
  }
  return lines.concat(items).join('\n');
}

function classifyFromOpenClose(opening = {}, closing = {}) {
  const outOfStock = [];
  const buySoon = [];
  const ok = [];
  const keys = new Set([...Object.keys(opening || {}), ...Object.keys(closing || {})]);
  for (const k of keys) {
    const open = Number(opening[k] || 0);
    const close = Number(closing[k] || 0);
    if (!Number.isFinite(close) || close <= 0) outOfStock.push(k);
    else if (open > 0 && close / open <= 0.1) buySoon.push(k);
    else ok.push(k);
  }
  return { outOfStock: outOfStock.sort(), buySoon: buySoon.sort(), ok: ok.sort() };
}

// GET /api/inventory/recap -> preview using last closed or active opening
router.get('/recap', (req, res) => {
  try {
    const date = req.query.date; // YYYY-MM-DD
    let session = null;
    if (date) {
      session = inventory.getSessionByDate(date);
    } else {
      session = inventory.getLastClosedSession() || inventory.getActiveSession();
    }
    if (!session) return res.status(404).json({ success: false, message: 'Belum ada data' });
    const opening = session.openingIngredients || {};
    const closing = session.closingIngredients || {};
    const sessionDate = session.date || session.openedAt?.split('T')[0] || '';
    const parts = [`📅 Rekap Tanggal: ${sessionDate}`, '', '🟢 Stok Saat Opening', buildRecapTextFromOpenClose(opening, opening)];
    if (Object.keys(closing).length) {
      parts.push('', '🔴 Stok Saat Closing', buildRecapTextFromOpenClose(opening, closing));
    }
    const text = parts.join('\n');
    res.json({ success: true, text, date: sessionDate });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/inventory/recap/send -> send to barista WA
router.post('/recap/send', async (req, res) => {
  try {
    let session = inventory.getLastClosedSession() || inventory.getActiveSession();
    if (!session) return res.status(404).json({ success: false, message: 'Belum ada data' });
    const opening = session.openingIngredients || {};
    const closing = session.closingIngredients || {};
    const parts = ['🟢 Stok Saat Opening', buildRecapTextFromOpenClose(opening, opening)];
    if (Object.keys(closing).length) {
      parts.push('', '🔴 Stok Saat Closing', buildRecapTextFromOpenClose(opening, closing));
    }
    const text = parts.join('\n');

    const bot = dataStore.getBotInstance();
    const recipients = Array.from(new Set([...(config.shop.baristaNumbers || [])]));
    let sent = 0;
    if (bot && bot.sock && recipients.length) {
      for (const to of recipients) {
        try { await bot.sock.sendMessage(to, { text }); sent++; } catch (_) { /* ignore */ }
      }
    }
    res.json({ success: true, sent, text });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Structured recap JSON for modern UI rendering
router.get('/recap/json', (req, res) => {
  try {
    const date = req.query.date; // YYYY-MM-DD
    let session = null;
    if (date) {
      session = inventory.getSessionByDate(date);
    } else {
      session = inventory.getLastClosedSession() || inventory.getActiveSession();
    }
    if (!session) return res.status(404).json({ success: false, message: 'Belum ada data' });
    const opening = session.openingIngredients || {};
    const closing = session.closingIngredients || {};
    const openingClass = classifyFromOpenClose(opening, opening);
    const closingClass = Object.keys(closing).length ? classifyFromOpenClose(opening, closing) : null;
    const sessionDate = session.date || session.openedAt?.split('T')[0] || '';
    res.json({ success: true, opening: openingClass, closing: closingClass, date: sessionDate });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
