const orderManager = require('../services/orderManager');
const orderStore = require('../services/orderStore');
const moment = require('moment-timezone');

module.exports = {
    name: 'status',
    description: 'Cek status pesanan',
    aliases: ['cek', 'check'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // If no order ID, show all user orders
        if (args.length === 0) {
            return this.showAllOrders(sock, msg);
        }

        const orderId = args[0].toUpperCase();
        let order = orderManager.getOrder(orderId);
        if (!order) {
            // Fallback to SQLite for parity with web
            order = orderStore.getOrderById(orderId);
            if (order) {
                try { orderManager.orders.set(orderId, order); } catch (_) {}
            }
        }

        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!\n\nKetik *!status* tanpa parameter untuk melihat semua pesanan Anda.`
            });
            return;
        }

        // Show detailed order info
        let text = orderManager.formatOrderDetails(order);
        
        text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // Add status-specific info
        switch (order.status) {
            case orderManager.STATUS.PENDING_PAYMENT:
                const minutesLeft = moment(order.paymentExpiry).diff(moment(), 'minutes');
                text += `⏰ Menunggu pembayaran\n`;
                text += `Batas waktu: ${minutesLeft} menit lagi\n\n`;
                text += `Ketik *!pay ${orderId}* untuk melanjutkan pembayaran.`;
                break;
                
            case orderManager.STATUS.PROCESSING:
                text += `👨‍🍳 Pesanan sedang diproses barista\n`;
                text += `Estimasi: 10-15 menit`;
                break;
                
            case orderManager.STATUS.READY:
                text += `🎉 Pesanan siap diambil!\n`;
                text += `Silakan ambil di counter.`;
                break;
                
            case orderManager.STATUS.COMPLETED:
                text += `✅ Pesanan selesai\n`;
                text += `Terima kasih! 🙏`;
                break;
                
            case orderManager.STATUS.EXPIRED:
                text += `⏰ Pesanan expired (tidak dibayar)`;
                break;
                
            case orderManager.STATUS.CANCELLED:
                text += `❌ Pesanan dibatalkan`;
                break;
        }

        await sock.sendMessage(from, { text });
    },

    async showAllOrders(sock, msg) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

    // Read from SQLite to ensure consistency with web
    const userOrders = orderStore.getOrdersByUserId(userId, 50);

        if (userOrders.length === 0) {
            await sock.sendMessage(from, {
                text: `📋 *Riwayat Pesanan*\n\nAnda belum memiliki pesanan.\n\nKetik *!menu* untuk mulai pesan!`
            });
            return;
        }

        // Sort by date (newest first)
        userOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        let text = `📋 *Riwayat Pesanan Anda*\n\n`;

        // Show only last 10 orders
        const displayOrders = userOrders.slice(0, 10);
        
        displayOrders.forEach((order, index) => {
            const statusEmoji = orderManager.getStatusEmoji(order.status);
            const date = moment(order.createdAt).format('DD/MM HH:mm');
            
            text += `${index + 1}. ${statusEmoji} *${order.orderId}*\n`;
            text += `   ${date} - Rp ${this.formatNumber(order.pricing.total)}\n`;
            text += `   Status: ${order.status}\n`;
            
            if (order.status === orderManager.STATUS.PENDING_PAYMENT) {
                text += `   💡 Ketik !pay ${order.orderId}\n`;
            }
            
            text += `\n`;
        });

        if (userOrders.length > 10) {
            text += `\n_Menampilkan 10 pesanan terakhir dari ${userOrders.length} total pesanan._\n\n`;
        }

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 Ketik *!status [ORDER_ID]* untuk detail pesanan.`;

        await sock.sendMessage(from, { text });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};