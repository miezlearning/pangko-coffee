const config = require('../config/config');
const storeState = require('../services/storeState');

module.exports = {
  name: 'store',
  description: 'Kelola status toko (open/close/status)',
  aliases: ['toko','openstore','closestore','buka','tutup','open','close'],

  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const isPrivileged = (config.shop.baristaNumbers || []).includes(from) || (config.shop.adminNumbers || []).includes(from);

    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'status') {
      const open = storeState.isOpen();
      const badge = open ? '🟢 OPEN' : '🔴 CLOSED';
      const text = `${badge} – ${config.shop.name}\n\n` + (open
        ? 'Toko saat ini buka dan menerima pesanan.'
        : storeState.getClosedMessage(`Maaf, toko sedang tutup. Jam operasional: ${config.shop.openHours}`));
      await sock.sendMessage(from, { text });
      return;
    }

    if (!isPrivileged) {
      await sock.sendMessage(from, { text: '❌ Hanya barista/admin yang dapat mengubah status toko.' });
      return;
    }

    if (['open','buka','openstore'].includes(sub)) {
      const updated = storeState.setOpen(true, 'barista/admin');
      const text = `✅ Toko dibuka. Sekarang menerima pesanan.\n\nJam Operasional: ${config.shop.openHours}`;
      await sock.sendMessage(from, { text });
      return;
    }

    if (['close','tutup','closestore'].includes(sub)) {
      const reason = args.slice(1).join(' ').trim();
      const message = reason || `Maaf, toko sedang tutup. Jam operasional: ${config.shop.openHours}`;
      storeState.setOpen(false, 'barista/admin', message);
      await sock.sendMessage(from, { text: `⏸️ Toko ditutup untuk sementara.\n\n${message}` });
      return;
    }

    // Help
    await sock.sendMessage(from, { text: 'Penggunaan:\n• !store status\n• !store open\n• !store close [alasan opsional]' });
  }
};
