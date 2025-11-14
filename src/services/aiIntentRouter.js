const config = require('../config/config');

// Simple helper to call siputzx Gemini-lite style endpoint
async function callSiputzxGemini(prompt) {
  const defaultAiUrl = (config && config.gemini && config.gemini.apiUrl) || process.env.GEMINI_API_URL || 'https://api.siputzx.my.id/api/ai/gemini-lite';
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

  if (!defaultAiUrl) {
    return null;
  }

  let fetchFn = global.fetch;
  if (!fetchFn) {
    try { fetchFn = require('undici').fetch; } catch (e) { fetchFn = null; }
  }
  if (!fetchFn) return null;

  const encodedPrompt = encodeURIComponent(prompt);
  const encodedModel = encodeURIComponent(modelName);
  const url = `${defaultAiUrl}?prompt=${encodedPrompt}&model=${encodedModel}`;

  const res = await fetchFn(url, { method: 'GET' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;

  let text = '';
  if (data && data.data && Array.isArray(data.data.parts)) {
    text = data.data.parts.map(p => p.text || '').join('\n');
  } else if (data && data.text) {
    text = data.text;
  } else {
    text = JSON.stringify(data);
  }
  return text;
}

function buildIntentPrompt(messageText, context = {}) {
  const shopName = (context.shopName || (config && config.shop && config.shop.name) || 'kedai kopi');
  const menuExamples = (context.menuExamples || []).join(', ');

  const lines = [];
  lines.push('Anda adalah router intent untuk bot WhatsApp sebuah kedai kopi.');
  lines.push('Tugas Anda: membaca pesan user dan mengklasifikasikan maksudnya menjadi salah satu intent berikut, lalu mengembalikannya dalam JSON murni.');
  lines.push('INTENT YANG DIIZINKAN:');
  lines.push('- "show_menu"           : user minta lihat menu atau harga.');
  lines.push('- "create_order"        : user mau pesan menu.');
  lines.push('- "check_order_status"  : user tanya status pesanannya.');
  lines.push('- "help"                : user minta bantuan cara pakai bot.');
  lines.push('- "smalltalk"           : sapaan atau obrolan ringan.');
  lines.push('- "unknown"             : jika tidak yakin / di luar domain.');
  lines.push('Selalu kembalikan JSON sederhana SATU baris, TANPA penjelasan tambahan.');
  lines.push('Skema JSON:');
  lines.push('{');
  lines.push('  "intent": "nama_intent",');
  lines.push('  "params": { /* optional, tergantung intent */ }');
  lines.push('}');
  lines.push('Untuk intent "create_order", struktur params:');
  lines.push('{');
  lines.push('  "items": [');
  lines.push('    { "name": "Nama Menu", "qty": 1, "notes": "opsional" }');
  lines.push('  ],');
  lines.push('  "notes": "catatan umum, opsional"');
  lines.push('}');
  lines.push('Untuk intent "check_order_status", params: { "hint": "teks yang bisa dipakai cari order (nama, no HP, id order)" }');
  lines.push('Jika user hanya menyapa, balas intent "smalltalk" tanpa params.');
  lines.push('Nama kedai: ' + shopName + '. Beberapa contoh menu: ' + (menuExamples || 'Espresso, Americano, Latte, Matcha Latte') + '.');
  lines.push('Pesan user:');
  lines.push(JSON.stringify(messageText));
  lines.push('Kembalikan HANYA JSON valid (tanpa teks lain).');
  return lines.join('\n');
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const m = text.match(/(\{[\s\S]*\})/);
    if (m) {
      try { return JSON.parse(m[1]); } catch (_) { return null; }
    }
    return null;
  }
}

async function inferIntentFromMessage(messageText, context = {}) {
  const trimmed = (messageText || '').trim();
  if (!trimmed) return { intent: 'unknown', params: {} };

  // Rule-based quick checks before hitting AI (hemat kuota)
  const lower = trimmed.toLowerCase();
  if (/^!|^\./.test(trimmed)) {
    return { intent: 'unknown', params: {} };
  }
  if (/menu|daftar minuman|harga/i.test(lower)) {
    return { intent: 'show_menu', params: {} };
  }

  const prompt = buildIntentPrompt(trimmed, context);
  const aiText = await callSiputzxGemini(prompt);
  const parsed = safeParseJson(aiText);
  if (!parsed || !parsed.intent) {
    return { intent: 'unknown', params: {} };
  }
  const allowedIntents = new Set(['show_menu','create_order','check_order_status','help','smalltalk','unknown']);
  if (!allowedIntents.has(parsed.intent)) {
    return { intent: 'unknown', params: {} };
  }
  return { intent: parsed.intent, params: parsed.params || {} };
}

module.exports = {
  inferIntentFromMessage
};
