const orderManager = require('../services/orderManager');
const config = require('../config/config');

module.exports = {
    name: 'ready',
    description: '[BARISTA] Tandai pesanan siap diambil',
    aliases: ['siap', 'done'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // Check if sender is barista or admin
        if (!this.isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/admin.`
            });
            return;
        }

        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!ready [ORDER_ID]*\nContoh: *!ready CF123456*`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const order = orderManager.getOrder(orderId);

        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!`
            });
            return;
        }

        if (order.status !== orderManager.STATUS.PROCESSING) {
            await sock.sendMessage(from, {
                text: `ℹ️ Status pesanan: ${order.status}\n\nPesanan ini tidak dalam status processing.`
            });
            return;
        }

        try {
            // Update status to READY
            orderManager.updateOrderStatus(orderId, orderManager.STATUS.READY);

            // Notify barista
            await sock.sendMessage(from, {
                text: `✅ Order ${orderId} ditandai siap!\n\nNotifikasi sudah dikirim ke customer.`
            });

            // Notify customer
            const customerText = `🎉 *Pesanan Anda Siap!*\n\n` +
                `Order ID: *${orderId}*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Pesanan Anda sudah siap diambil! 🥳\n\n` +
                `📍 Silakan ambil di counter dengan menunjukkan Order ID ini.\n\n` +
                `Terima kasih sudah memesan di ${config.shop.name}! ☕\n\n` +
                `💡 Jangan lupa review kami: *!review ${orderId}*`;

            await sock.sendMessage(order.userId, { text: customerText });

        } catch (error) {
            console.error('Ready command error:', error);
            await sock.sendMessage(from, {
                text: `❌ Terjadi kesalahan.\n\n${error.message}`
            });
        }
    },

    isBarista(jid) {
        return config.shop.baristaNumbers.includes(jid) || 
               config.shop.adminNumbers.includes(jid);
    }
};