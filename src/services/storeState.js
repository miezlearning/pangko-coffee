const fs = require('fs');
const path = require('path');

// Persist under project-level data folder (same pattern as paymentGateway/dataStore)
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STATE_FILE = path.join(DATA_DIR, 'store-state.json');

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
}

function readState() {
  try {
    ensureDir();
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const json = JSON.parse(raw);
      return {
        open: typeof json.open === 'boolean' ? json.open : true,
        message: typeof json.message === 'string' ? json.message : null,
        updatedAt: json.updatedAt || null,
        updatedBy: json.updatedBy || null
      };
    }
  } catch (_) {}
  return { open: true, message: null, updatedAt: null, updatedBy: null };
}

function writeState(state) {
  try {
    ensureDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

function isOpen() {
  return readState().open !== false;
}

function setOpen(open, updatedBy = 'system', message = null) {
  const prev = readState();
  const next = {
    open: !!open,
    message: message || prev.message,
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  writeState(next);
  return next;
}

function getClosedMessage(defaultText) {
  const state = readState();
  // Build a clearer, professional closed message that separates the closure notice and the reason
  const header = '🔴 Toko saat ini TUTUP';
  const reasonLine = state.message ? `Alasan: ${state.message}` : null;
  const hoursLine = defaultText || null;
  const footer = 'Mohon maaf atas ketidaknyamanan. Silakan kunjungi kembali saat toko buka.';

  // Combine parts with spacing for readability
  const parts = [header];
  if (reasonLine) parts.push('', reasonLine);
  if (hoursLine) parts.push('', hoursLine);
  parts.push('', footer);

  return parts.join('\n');
}

module.exports = { isOpen, setOpen, getClosedMessage, readState };
