const orderManager = require('../services/orderManager');
const config = require('../config/config');

module.exports = {
  name: 'complete',
  description: '[BARISTA] Tandai pesanan SELESAI (sudah diambil customer)',
  aliases: ['selesai','done'],

  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    // Check permission
    const isBarista = config.shop.baristaNumbers.includes(from) || config.shop.adminNumbers.includes(from);
    if (!isBarista) {
      await sock.sendMessage(from, { text: '❌ Command ini hanya untuk barista/kasir.' });
      return;
    }

    if (args.length === 0) {
      await sock.sendMessage(from, { text: '❌ Format salah!\n\nGunakan: *!complete [ORDER_ID]*\nContoh: *!complete CF123456*' });
      return;
    }

    const orderId = args[0].toUpperCase();
    let order = orderManager.getOrder(orderId);

    if (!order) {
      // Try hydrate from DB
      try {
        const store = require('../services/orderStore');
        order = store.getOrderById(orderId);
        if (order) orderManager.orders.set(orderId, order);
      } catch (_) {}
    }

    if (!order) {
      await sock.sendMessage(from, { text: '❌ Order tidak ditemukan!' });
      return;
    }

    if (order.status !== orderManager.STATUS.READY) {
      await sock.sendMessage(from, { text: `❌ Status saat ini: *${order.status}*. Hanya bisa tandai selesai dari status READY.` });
      return;
    }

    try {
      const updated = orderManager.updateOrderStatus(orderId, orderManager.STATUS.COMPLETED, { completedBy: 'barista' });
      await sock.sendMessage(from, { text: `✔️ Order *${orderId}* ditandai *SELESAI*.` });
      // Notify customer (best-effort)
      try { await sock.sendMessage(updated.userId, { text: `✅ Terima kasih! Pesanan *${orderId}* telah selesai. Selamat menikmati ☕️` }); } catch (_) {}
    } catch (e) {
      await sock.sendMessage(from, { text: '❌ Gagal menandai selesai: ' + e.message });
    }
  }
};
