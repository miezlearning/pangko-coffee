const orderManager = require('../services/orderManager');
const config = require('../config/config');
const moment = require('moment-timezone');

module.exports = {
  name: 'lanjut',
  description: 'Buka kembali pesanan tunai yang dibatalkan dalam 60 menit',
  aliases: ['reopen','continue'],

  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const orderId = (args[0] || '').trim();

    if (!orderId) {
      await sock.sendMessage(from, { text: '⚠️ Format: *!lanjut <OrderID>*\nContoh: !lanjut CF12345678' });
      return;
    }

    const order = orderManager.getOrder(orderId);
    if (!order) {
      await sock.sendMessage(from, { text: `❌ Order tidak ditemukan: *${orderId}*` });
      return;
    }

    if (order.userId !== from) {
      await sock.sendMessage(from, { text: '❌ Anda tidak berhak membuka pesanan ini.' });
      return;
    }

    if (order.paymentMethod !== 'CASH') {
      await sock.sendMessage(from, { text: '❌ Hanya berlaku untuk pesanan *Tunai*.' });
      return;
    }

    if (order.status !== orderManager.STATUS.CANCELLED) {
      await sock.sendMessage(from, { text: `❌ Status saat ini: *${order.status}*. Perintah ini hanya untuk pesanan tunai yang dibatalkan.` });
      return;
    }

    if (!order.canReopenUntil || moment().isAfter(order.canReopenUntil)) {
      await sock.sendMessage(from, { text: '❌ Waktu untuk membuka kembali sudah habis. Silakan buat pesanan baru.' });
      return;
    }

    try {
      const reopened = orderManager.reopenCash(orderId);
  const expiryTime = moment(reopened.cashExpiresAt).tz(config.bot.timezone).format('HH:mm');
      const minutesLeft = Math.max(0, moment(reopened.cashExpiresAt).diff(moment(), 'minutes'));
  const tzLabel = getTzLabel(config.bot.timezone);

      let text = `✅ *Pesanan Tunai Dibuka Kembali!*\n\n`;
      text += `📋 Order ID: *${reopened.orderId}*\n`;
      text += `👤 Atas Nama: *${reopened.customerName}*\n`;
  text += `⏰ Batas ke kasir: ${expiryTime} ${tzLabel} (${minutesLeft} menit)\n\n`;
      text += `📍 Segera menuju kasir dan sebutkan: *Order ${reopened.orderId} atas nama ${reopened.customerName}*.\n`;
      text += `Kasir akan konfirmasi penerimaan tunai untuk mulai proses barista.\n\n`;
      text += `ℹ️ Catatan: Fitur buka kembali hanya berlaku untuk *timeout* dan maksimal ${require('../config/config').order.maxReopenPerOrder}x per pesanan.`;

      await sock.sendMessage(from, { text });
    } catch (error) {
      let msg = error.message || 'Gagal membuka kembali.';
      if (/timeout/i.test(msg)) {
        msg += `\n\nJika dibatalkan oleh kasir, minta kasir untuk buka kembali dari dashboard.`;
      }
      await sock.sendMessage(from, { text: `❌ ${msg}` });
    }
  }
};

function getTzLabel(tz) {
  if (!tz) return 'WIB';
  const t = tz.toLowerCase();
  if (t.includes('jakarta')) return 'WIB';
  if (t.includes('makassar')) return 'WITA';
  if (t.includes('jayapura')) return 'WIT';
  return 'WIB';
}
