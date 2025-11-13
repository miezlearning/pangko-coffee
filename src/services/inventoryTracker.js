const fs = require('fs');
const path = require('path');
const orderManager = require('./orderManager');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'inventory-sessions.json');
const RECIPES_FILE = path.resolve(__dirname, '..', 'paymentGateway', 'data', 'recipes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSessions() {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) return { sessions: [] };
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return { sessions: [] }; }
}

function saveSessions(data) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadRecipes() {
  try { return JSON.parse(fs.readFileSync(RECIPES_FILE, 'utf8')); } catch { return { ingredients: {}, recipes: {} }; }
}

function saveRecipes(json) {
  try {
    const data = json || { ingredients: {}, recipes: {} };
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function sanitizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeIngredientMap(map) {
  const result = {};
  Object.entries(map || {}).forEach(([name, value]) => {
    if (!name) return;
    const qty = Number(value);
    result[name] = Number.isFinite(qty) ? qty : 0;
  });
  return result;
}

function upsertIngredient(payload) {
  const { name, unit, nettoValue, nettoUnit, buyPrice, originalName } = payload || {};
  if (!name) return false;

  const cleanName = name.trim();
  if (!cleanName) return false;

  const data = loadRecipes();
  data.ingredients = data.ingredients || {};

  if (originalName && originalName !== cleanName && data.ingredients[originalName]) {
    delete data.ingredients[originalName];
  }

  const existing = data.ingredients[cleanName] || {};
  const entry = { ...existing };

  if (unit !== undefined) {
    const cleanUnit = (unit || '').trim();
    if (cleanUnit) entry.unit = cleanUnit;
  }
  if (!entry.unit) entry.unit = existing.unit || (nettoUnit || '').trim() || 'pcs';

  if (nettoUnit !== undefined) {
    entry.nettoUnit = (nettoUnit || '').trim() || null;
  }

  const sanitizedNettoValue = sanitizeNumber(nettoValue);
  if (sanitizedNettoValue !== null) entry.nettoValue = sanitizedNettoValue;
  else if (nettoValue !== undefined) delete entry.nettoValue;

  const sanitizedBuyPrice = sanitizeNumber(buyPrice);
  if (sanitizedBuyPrice !== null) entry.buyPrice = sanitizedBuyPrice;
  else if (buyPrice !== undefined) delete entry.buyPrice;

  entry.isMaster = true;
  entry.updatedAt = new Date().toISOString();

  // Remove null properties for cleaner JSON
  Object.keys(entry).forEach((key) => {
    if (entry[key] === null || entry[key] === undefined) delete entry[key];
  });

  data.ingredients[cleanName] = entry;
  return saveRecipes(data);
}

function removeIngredient(name) {
  const data = loadRecipes();
  if (!data.ingredients || !data.ingredients[name]) return false;
  delete data.ingredients[name];
  return saveRecipes(data);
}

function getActiveSession() {
  const data = loadSessions();
  return data.sessions.find(s => !s.closedAt) || null;
}

function getLastClosedSession() {
  const data = loadSessions();
  const closed = data.sessions.filter(s => s.closedAt);
  if (closed.length === 0) return null;
  // latest by closedAt timestamp
  closed.sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  return closed[closed.length - 1];
}

function getSessionByDate(date) {
  // date in YYYY-MM-DD format
  const data = loadSessions();
  return data.sessions.find(s => s.date === date) || null;
}

function getAllSessionDates() {
  const data = loadSessions();
  const dates = new Set(data.sessions.map(s => s.date).filter(Boolean));
  return Array.from(dates).sort().reverse(); // newest first
}

function openSession({ cashier, openingCash, ingredients }) {
  const data = loadSessions();
  const active = getActiveSession();
  if (active) throw new Error('Masih ada sesi yang aktif. Lakukan closing dulu.');
  const now = new Date();
  const session = {
    id: 'INV' + Date.now(),
    date: now.toISOString().split('T')[0], // YYYY-MM-DD
    cashier: cashier || 'kasir',
    openedAt: now.toISOString(),
    openingCash: Number(openingCash || 0),
    openingIngredients: normalizeIngredientMap(ingredients),
    closedAt: null,
    closingCash: null,
    closingIngredients: null
  };
  data.sessions.push(session);
  saveSessions(data);
  return session;
}

function closeSession({ cashier, closingCash, ingredients }) {
  const data = loadSessions();
  const idx = data.sessions.findIndex(s => !s.closedAt);
  if (idx === -1) throw new Error('Tidak ada sesi aktif untuk di-close.');

  const session = data.sessions[idx];
  session.closedAt = new Date().toISOString();
  session.closingCash = Number(closingCash || 0);
  session.closingIngredients = normalizeIngredientMap(ingredients);
  session.closedBy = cashier || session.cashier || 'kasir';

  data.sessions[idx] = session;
  saveSessions(data);
  return session;
}

function discardActiveSession() {
  const data = loadSessions();
  const idx = data.sessions.findIndex(s => !s.closedAt);
  if (idx === -1) return false;
  data.sessions.splice(idx, 1);
  saveSessions(data);
  return true;
}

function computeReport(idOrDate = null) {
  const data = loadSessions();
  // Prefer active (today) if exists; else last record
  const active = getActiveSession();
  let session = null;
  if (idOrDate) {
    // Check if it's a date (YYYY-MM-DD) or ID
    if (/^\d{4}-\d{2}-\d{2}$/.test(idOrDate)) {
      session = data.sessions.find(s => s.date === idOrDate) || null;
    } else {
      session = data.sessions.find(s => s.id === idOrDate) || null;
    }
  }
  if (!session) session = active || data.sessions.slice(-1)[0];
  if (!session) throw new Error('Belum ada data Opening/Closing');

  const openingMap = session.openingIngredients || {};
  const closingMap = session.closingIngredients || {};

  const ingredients = {};
  const keys = new Set([...Object.keys(openingMap), ...Object.keys(closingMap)]);
  for (const k of keys) {
    const opening = Number(openingMap[k] || 0);
    const closing = Number(closingMap[k] || 0);
    const used = Math.max(opening - closing, 0);
    const percentRemaining = opening > 0 ? Math.round((closing / opening) * 100) : null;
    ingredients[k] = { opening, closing, used, percentRemaining };
  }

  const cashDifference = (Number(session.closingCash || 0) - Number(session.openingCash || 0));

  return {
    id: session.id,
    openedAt: session.openedAt,
    closedAt: session.closedAt || null,
    openingCash: Number(session.openingCash || 0),
    closingCash: Number(session.closingCash || 0),
    cashDifference,
    ingredients
  };
}

module.exports = {
  getActiveSession,
  getLastClosedSession,
  getSessionByDate,
  getAllSessionDates,
  openSession,
  closeSession,
  discardActiveSession,
  computeReport,
  loadRecipes,
  upsertIngredient,
  removeIngredient
};
