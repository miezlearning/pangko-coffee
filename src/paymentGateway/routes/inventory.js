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

function formatCurrencyID(value) {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  } catch (_) {
    return String(value || '0');
  }
}

function buildProfessionalRecap(session) {
  if (!session) return '';
  const opening = session.openingIngredients || {};
  const closing = session.closingIngredients || {};
  const recipes = inventory.loadRecipes();
  const meta = (recipes && recipes.ingredients) ? recipes.ingredients : {};

  const sessionDate = session.date || (session.openedAt && session.openedAt.split('T')[0]) || '';
  const openedAt = session.openedAt ? new Date(session.openedAt).toLocaleString('id-ID', { hour12: false }) : '-';
  const closedAt = session.closedAt ? new Date(session.closedAt).toLocaleString('id-ID', { hour12: false }) : 'Belum closing';

  const header = [];
  header.push(`📅 Tanggal: ${sessionDate}`);
  header.push(`🕒 Periode: ${openedAt} → ${closedAt}`);
  header.push(`👤 Kasir (buka): ${session.cashier || '-'}  |  👤 Kasir (tutup): ${session.closedBy || '-'} `);
  header.push(`💰 Kas Awal: ${formatCurrencyID(session.openingCash)}  |  Kas Akhir: ${formatCurrencyID(session.closingCash)}  |  Selisih: ${formatCurrencyID((Number(session.closingCash||0) - Number(session.openingCash||0)))}`);
  header.push('');

  const keys = Array.from(new Set([...Object.keys(opening || {}), ...Object.keys(closing || {})])).sort((a,b)=>a.localeCompare(b,'id'));
  // Build a monospace table inside a code block so WhatsApp shows aligned columns
  const lines = [];
  lines.push('🔎 Detail Stok:');
  // Column widths (adjust if needed)
  const nameW = 20; // name column width
  const qtyW = 12; // qty columns width
  const pctW = 6;
  const statusW = 12;

  const pad = (s, w, left = false) => {
    const str = String(s == null ? '-' : s);
    if (str.length >= w) return left ? str.slice(0, w) : str;
    return left ? str.padStart(w, ' ') : str.padEnd(w, ' ');
  };

  const headerCols = [pad('Item', nameW), pad('Open', qtyW, true), pad('Close', qtyW, true), pad('Used', qtyW, true), pad('%', pctW, true), pad('Status', statusW)];
  lines.push('```');
  lines.push(headerCols.join(' | '));
  lines.push('-'.repeat(nameW + qtyW * 3 + pctW + statusW + 15));

  for (const name of keys) {
    const o = Number(opening[name] || 0);
    const c = Number(closing[name] || 0);
    const used = Math.max(o - c, 0);
    const percent = o > 0 ? Math.round((c / o) * 100) : null;
    const info = meta[name] || {};
    const unit = info.unit || info.nettoUnit || '';
    let status = '✅ Cukup';
    if (!Number.isFinite(c) || c <= 0) status = '❌ Habis';
    else if (o > 0 && c / o <= 0.1) status = '‼️ Segera';

    const qtyFmt = (v) => (Number.isFinite(v) ? `${Intl.NumberFormat('id-ID').format(v)}${unit ? ` ${unit}` : ''}` : '-');
    const pctLabel = percent === null ? '-' : `${percent}%`;

    const cols = [pad(name, nameW), pad(qtyFmt(o), qtyW, true), pad(qtyFmt(c), qtyW, true), pad(qtyFmt(used), qtyW, true), pad(pctLabel, pctW, true), pad(status, statusW)];
    lines.push(cols.join(' | '));
  }
  lines.push('```');

  // summary
  const classified = classifyFromOpenClose(opening, closing);
  const summary = [];
  summary.push('');
  summary.push('📌 Ringkasan:');
  summary.push(`- Habis: ${classified.outOfStock.length} item${classified.outOfStock.length? ` (${classified.outOfStock.join(', ')})` : ''}`);
  summary.push(`- Segera pesan: ${classified.buySoon.length} item${classified.buySoon.length? ` (${classified.buySoon.join(', ')})` : ''}`);
  summary.push(`- Cukup: ${classified.ok.length} item`);
  summary.push('');
  if (classified.outOfStock.length || classified.buySoon.length) {
    const toOrder = [...classified.outOfStock, ...classified.buySoon];
    summary.push(`➡️ Mohon cek & pesan: ${toOrder.join(', ')}`);
  } else {
    summary.push('✅ Semua stok dalam kondisi memadai.');
  }

  return header.concat(lines, summary).join('\n');
}

function buildBlockRecap(session, marked = []) {
  if (!session) return '';
  const opening = session.openingIngredients || {};
  const closing = session.closingIngredients || {};
  const recipes = inventory.loadRecipes();
  const meta = (recipes && recipes.ingredients) ? recipes.ingredients : {};

  const sessionDate = session.date || (session.openedAt && session.openedAt.split('T')[0]) || '';
  const header = [];
  header.push(`📅 Tanggal: ${sessionDate}`);
  header.push(`👤 Kasir buka: ${session.cashier || '-'}  |  Kasir tutup: ${session.closedBy || '-'}`);
  header.push(`💰 Kas Awal: ${formatCurrencyID(session.openingCash)}  |  Kas Akhir: ${formatCurrencyID(session.closingCash)}`);
  header.push('');

  const keys = Array.from(new Set([...Object.keys(opening || {}), ...Object.keys(closing || {})])).sort((a,b)=>a.localeCompare(b,'id'));
  const lines = [];
  for (const name of keys) {
    const o = Number(opening[name] || 0);
    const c = Number(closing[name] || 0);
    const used = Math.max(o - c, 0);
    const percent = o > 0 ? Math.round((c / o) * 100) : null;
    const info = meta[name] || {};
    const unit = info.unit || info.nettoUnit || '';
    let status = '✅ Cukup';
    if (!Number.isFinite(c) || c <= 0) status = '❌ Habis';
    else if (o > 0 && c / o <= 0.1) status = '‼️ Segera pesan';

    const rec = (!Number.isFinite(c) || c <= 0) ? `Segera pesan ${name}` : (o>0 && c / o <= 0.1 ? `Pertimbangkan pemesanan ${name}` : '-');
    const suggestedQty = Math.max(Math.round(o - c), 0);
    const suggestedText = suggestedQty > 0 ? `Rekomendasi: Pesan minimal ${suggestedQty}${unit ? ` ${unit}` : ''}` : 'Rekomendasi: -';
    const isMarked = Array.isArray(marked) && marked.find(m => (m||'').toLowerCase() === (name||'').toLowerCase());

    lines.push(`${name}${isMarked ? ' 🔖' : ''}`);
    lines.push(`⌯ Ketersediaan: ${status}`);
    lines.push(`⌯ Rekomendasi Tindakan: ${rec}`);
    lines.push(`${suggestedText}`);
    lines.push('');
  }

  return header.concat(lines).join('\n');
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
    const format = (req.query.format || '').toLowerCase();
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
    let text = '';
    if (format === 'compact' || format === 'ringkas') {
      const parts = [`📅 Rekap Tanggal: ${sessionDate}`, '', '🟢 Stok Saat Opening', buildRecapTextFromOpenClose(opening, opening)];
      if (Object.keys(closing).length) parts.push('', '🔴 Stok Saat Closing', buildRecapTextFromOpenClose(opening, closing));
      text = parts.join('\n');
    } else {
      text = buildProfessionalRecap(session);
    }
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
    const format = ((req.query && req.query.format) || (req.body && req.body.format) || '').toLowerCase();
    let text = '';
    const marked = (req.body && Array.isArray(req.body.marked)) ? req.body.marked : [];
    if (format === 'compact' || format === 'ringkas') {
      const parts = ['🟢 Stok Saat Opening', buildRecapTextFromOpenClose(opening, opening)];
      if (Object.keys(closing).length) parts.push('', '🔴 Stok Saat Closing', buildRecapTextFromOpenClose(opening, closing));
      text = parts.join('\n');
    } else {
      if (format === 'block') text = buildBlockRecap(session, marked);
      else text = buildProfessionalRecap(session);
    }

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

router.post('/recap/ai', async (req, res) => {
  try {
    let session = inventory.getLastClosedSession() || inventory.getActiveSession();
    if (!session) return res.status(404).json({ success: false, message: 'Belum ada data' });
    const opening = session.openingIngredients || {};
    const closing = session.closingIngredients || {};
    const classified = classifyFromOpenClose(opening, closing);

    // Prepare basic suggestions (heuristic) to always include as fallback
    const recommendedNames = [...classified.outOfStock, ...classified.buySoon];
    const recipes = inventory.loadRecipes();
    const meta = (recipes && recipes.ingredients) ? recipes.ingredients : {};
    const suggestions = recommendedNames.map(name => {
      const o = Number(opening[name] || 0);
      const c = Number(closing[name] || 0);
      const unit = (meta[name] && (meta[name].unit || meta[name].nettoUnit)) || '';
      const qty = Math.max(Math.round(o - c), 0);
      return { name, reason: classified.outOfStock.includes(name) ? 'Habis' : 'Hampir habis', suggestedQty: qty, unit };
    });

    // Check for configured AI endpoint (gemini-like) in config or env
    const defaultAiUrl = (config && config.gemini && config.gemini.apiUrl) || process.env.GEMINI_API_URL || '';
    const aiKey = (config && config.gemini && config.gemini.apiKey) || process.env.GEMINI_API_KEY || '';
    const modelName = (config && config.gemini && config.gemini.model) || process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

    // Build payload/context for AI
    const payload = {
      generatedAt: new Date().toISOString(),
      session: { date: session.date || session.openedAt, cashier: session.cashier, closedBy: session.closedBy },
      summary: {
        openingCount: Object.keys(opening).length,
        closingCount: Object.keys(closing).length,
        outOfStock: classified.outOfStock,
        buySoon: classified.buySoon
      },
      suggestions
    };

    // If no AI configured, return heuristic suggestions
    if (!defaultAiUrl) {
      const textParts = [];
      if (!suggestions.length) textParts.push('✅ Semua stok terlihat memadai. Tidak ada rekomendasi mendesak.');
      else {
        textParts.push('🔎 Rekomendasi singkat (AI-fallback):');
        suggestions.forEach(s => {
          const qtyText = s.suggestedQty > 0 ? `${s.suggestedQty} ${s.unit || ''}`.trim() : '-';
          textParts.push(`- ${s.name} — ${s.reason} — Rekomendasi: pesan ~${qtyText}`);
        });
      }
      return res.json({ success: true, ai: false, text: textParts.join('\n'), recommended: suggestions.map(s => s.name), raw: payload });
    }

    // Build prompt for AI (Indonesian)
    const promptParts = [];
    promptParts.push('Anda adalah asisten inventori untuk sebuah kedai kopi kecil. Berikan 4 rekomendasi tindakan singkat (1-2 kalimat tiap rekomendasi) terkait stok, pembelian, dan prioritas pemesanan. Balas dalam bahasa Indonesia.');
    promptParts.push(`Context JSON: ${JSON.stringify(payload)}`);
    const prompt = promptParts.join('\n\n');

    // Build external URL (gemini-lite style: ?prompt=...&model=...)
    const endpoint = defaultAiUrl;
    const encodedPrompt = encodeURIComponent(prompt);
    const encodedModel = encodeURIComponent(modelName);
    const url = `${endpoint}?prompt=${encodedPrompt}&model=${encodedModel}`;

    // Use fetch (node 18+) or undici
    let fetchFn = global.fetch;
    if (!fetchFn) {
      try { fetchFn = require('undici').fetch; } catch (e) { fetchFn = null; }
    }
    if (!fetchFn) return res.status(500).json({ success: false, message: 'Fetch tidak tersedia di runtime. Install node >=18 atau tambahkan undici.' });

    const headers = {};
    if (aiKey) headers['Authorization'] = `Bearer ${aiKey}`;
    // Call AI endpoint
    const aiResp = await fetchFn(url, { method: 'GET', headers });
    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => '<no-body>');
      // fallback to heuristic suggestions
      const textParts = [];
      if (!suggestions.length) textParts.push('✅ Semua stok terlihat memadai. Tidak ada rekomendasi mendesak.');
      else {
        textParts.push('🔎 Rekomendasi singkat (AI-fallback):');
        suggestions.forEach(s => {
          const qtyText = s.suggestedQty > 0 ? `${s.suggestedQty} ${s.unit || ''}`.trim() : '-';
          textParts.push(`- ${s.name} — ${s.reason} — Rekomendasi: pesan ~${qtyText}`);
        });
      }
      return res.status(502).json({ success: false, message: 'AI endpoint error', status: aiResp.status, body: txt, fallback: textParts.join('\n'), recommended: suggestions.map(s=>s.name) });
    }

    const aiJson = await aiResp.json().catch(() => null);
    let aiText = '';
    if (aiJson && aiJson.data && Array.isArray(aiJson.data.parts)) {
      aiText = aiJson.data.parts.map(p => p.text || '').join('\n');
    } else if (aiJson && aiJson.text) {
      aiText = aiJson.text;
    } else {
      aiText = aiJson ? JSON.stringify(aiJson) : '';
    }

    return res.json({ success: true, ai: true, text: aiText, recommended: suggestions.map(s => s.name), raw: payload, aiResponse: aiJson });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
