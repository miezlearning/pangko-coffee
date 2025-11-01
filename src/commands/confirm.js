const orderManager = require('../services/orderManager');
const config = require('../config/config');

module.exports = {
    name: 'confirm',
    description: '[BARISTA/ADMIN] Konfirmasi pembayaran (hanya untuk kasir/admin)',
    aliases: ['konfirmasi', 'paid'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // ⚠️ RESTRICT: Only barista/admin can confirm payment
        // Customer CANNOT manually confirm - must be confirmed by kasir after checking QRIS
        if (!this.isBarista(from)) {
            await sock.sendMessage(from, {
                text: `ℹ️ *Menunggu Konfirmasi Pembayaran*\n\n` +
                      `Setelah Anda transfer via QRIS, silakan *tunggu*.\n` +
                      `Kasir akan mengkonfirmasi pembayaran Anda setelah memeriksa QRIS yang masuk.\n\n` +
                      `⏰ Proses konfirmasi biasanya 1-2 menit\n\n` +
                      `💡 Ketik *!status [ORDER_ID]* untuk cek status pembayaran`
            });
            return;
        }

        // Get order ID
        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!confirm [ORDER_ID]*\nContoh: *!confirm CF123456*`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const order = orderManager.getOrder(orderId);

        // Validate order
        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!`
            });
            return;
        }

        // Barista/admin can confirm any order (no need to check userId)
        
        if (order.status !== orderManager.STATUS.PENDING_PAYMENT) {
            await sock.sendMessage(from, {
                text: `ℹ️ Status pesanan: ${order.status}\n\nPesanan ini sudah dikonfirmasi atau tidak perlu konfirmasi.`
            });
            return;
        }

        try {
            // Update order status to PAID
            orderManager.updateOrderStatus(orderId, orderManager.STATUS.PAID);
            
            // Then immediately set to PROCESSING
            orderManager.updateOrderStatus(orderId, orderManager.STATUS.PROCESSING);

            // Send confirmation to customer
            let customerText = `✅ *Pembayaran Dikonfirmasi!*\n\n`;
            customerText += `Order ID: *${orderId}*\n`;
            customerText += `Total: Rp ${this.formatNumber(order.pricing.total)}\n\n`;
            customerText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            customerText += `👨‍🍳 Pesanan Anda sedang diproses oleh barista kami.\n\n`;
            customerText += `⏱️ Estimasi waktu: *10-15 menit*\n\n`;
            customerText += `Kami akan mengirim notifikasi saat pesanan sudah siap!\n\n`;
            customerText += `💡 Ketik *!status ${orderId}* untuk cek status pesanan.`;

            await sock.sendMessage(from, { text: customerText });

            // Send notification to barista
            await this.notifyBarista(sock, order);

        } catch (error) {
            console.error('Confirmation error:', error);
            await sock.sendMessage(from, {
                text: `❌ Terjadi kesalahan saat konfirmasi.\n\nSilakan coba lagi atau hubungi admin.`
            });
        }
    },

    async notifyBarista(sock, order) {
        let baristaText = `🔔 *PESANAN BARU!*\n\n`;
        baristaText += `📋 Order ID: *${order.orderId}*\n`;
        baristaText += `👤 Customer: ${order.userId.split('@')[0]}\n`;
        baristaText += `💰 Total: Rp ${this.formatNumber(order.pricing.total)}\n\n`;
        baristaText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        baristaText += `*Items:*\n`;
        
        order.items.forEach((item, index) => {
            baristaText += `${index + 1}. ${item.name} x${item.quantity}\n`;
        });
        
        if (order.notes) {
            baristaText += `\n📝 Catatan: ${order.notes}\n`;
        }
        
        baristaText += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        baristaText += `⚠️ Silakan proses pesanan ini!\n\n`;
        baristaText += `Ketik *!ready ${order.orderId}* setelah selesai.`;

        // Send to all barista numbers (skip if same as customer)
        for (const baristaNumber of config.shop.baristaNumbers) {
            // Skip sending to customer who made the order
            if (baristaNumber === order.userId) {
                console.log(`⏭️ Skipping barista notification to ${baristaNumber} (same as customer)`);
                continue;
            }
            
            try {
                await sock.sendMessage(baristaNumber, { text: baristaText });
            } catch (error) {
                console.error(`Failed to notify barista ${baristaNumber}:`, error);
            }
        }
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },

    isBarista(jid) {
        return config.shop.baristaNumbers.includes(jid) || 
               config.shop.adminNumbers.includes(jid);
    }
};