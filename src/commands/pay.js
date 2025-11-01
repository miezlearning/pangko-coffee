const orderManager = require('../services/orderManager');
const QRISGenerator = require('../utils/qris');
const config = require('../config/config');
const moment = require('moment-timezone');

module.exports = {
    name: 'pay',
    description: 'Generate QRIS untuk pembayaran',
    aliases: ['payment', 'qris'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // Get order ID from args
        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!pay [ORDER_ID]*\nContoh: *!pay CF123456*`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const order = orderManager.getOrder(orderId);

        // Validate order
        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!\n\nPastikan Order ID benar.`
            });
            return;
        }

        // Check if order belongs to user
        if (order.userId !== userId) {
            await sock.sendMessage(from, {
                text: `❌ Ini bukan pesanan Anda!`
            });
            return;
        }

        // Check order status
        if (order.status !== orderManager.STATUS.PENDING_PAYMENT) {
            let statusMsg = '';
            
            if (order.status === orderManager.STATUS.PAID) {
                statusMsg = `✅ Pesanan ini sudah dibayar!\n\nStatus: Sedang diproses barista.`;
            } else if (order.status === orderManager.STATUS.EXPIRED) {
                statusMsg = `⏰ Pesanan ini sudah expired!\n\nSilakan buat pesanan baru.`;
            } else if (order.status === orderManager.STATUS.CANCELLED) {
                statusMsg = `❌ Pesanan ini sudah dibatalkan.`;
            } else {
                statusMsg = `ℹ️ Status pesanan: ${order.status}`;
            }
            
            await sock.sendMessage(from, { text: statusMsg });
            return;
        }

        // Check if payment expired
        if (orderManager.isPaymentExpired(orderId)) {
            orderManager.updateOrderStatus(orderId, orderManager.STATUS.EXPIRED);
            
            await sock.sendMessage(from, {
                text: `⏰ *Waktu Pembayaran Habis*\n\nPesanan ${orderId} sudah expired.\nSilakan buat pesanan baru.`
            });
            return;
        }

        try {
            // Validate static QRIS
            if (!QRISGenerator.validateQRIS(config.shop.qrisStatic)) {
                throw new Error('Static QRIS tidak valid. Silakan hubungi admin.');
            }

            // Generate dynamic QRIS
            const dynamicQRIS = QRISGenerator.generateOrderQRIS(
                config.shop.qrisStatic,
                order.pricing.total,
                config.order.serviceFee
            );

            // Save QRIS to order
            orderManager.setOrderQRIS(orderId, dynamicQRIS);

            // Calculate time remaining
            const expiryTime = moment(order.paymentExpiry)
                .tz(config.bot.timezone)
                .format('HH:mm');
            const tzLabel = getTzLabel(config.bot.timezone);
            
            const minutesLeft = moment(order.paymentExpiry).diff(moment(), 'minutes');

            // Send payment info
            let text = `💳 *Informasi Pembayaran*\n\n`;
            text += `Order ID: *${orderId}*\n`;
            text += `Total: *Rp ${this.formatNumber(order.pricing.total)}*\n\n`;
            text += `⏰ Batas waktu: ${expiryTime} ${tzLabel}\n`;
            text += `   (${minutesLeft} menit lagi)\n\n`;
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `*Cara Pembayaran:*\n`;
            text += `1. Scan QRIS di bawah ini\n`;
            text += `2. Pastikan nominal Rp ${this.formatNumber(order.pricing.total)}\n`;
            text += `3. Selesaikan pembayaran\n`;
            text += `4. Ketik \`!confirm ${orderId}\` setelah bayar\n\n`;
            text += `⚠️ *PENTING:*\n`;
            text += `Jangan ubah nominal! QRIS sudah disesuaikan.`;

            await sock.sendMessage(from, { text });

            // Try to generate and send QR image
            try {
                const QRCode = require('qrcode');
                const qrBuffer = await QRCode.toBuffer(dynamicQRIS, {
                    width: 400,
                    margin: 2
                });

                await sock.sendMessage(from, {
                    image: qrBuffer,
                    caption: `QR Code untuk Order ${orderId}\nTotal: Rp ${this.formatNumber(order.pricing.total)}\n\nSetelah bayar, ketik: \`!confirm ${orderId}\``
                });
            } catch (qrError) {
                console.log('QR Code generation skipped:', qrError.message);
                
                // Fallback: send QRIS string
                await sock.sendMessage(from, {
                    text: `📱 QRIS Code:\n\`\`\`${dynamicQRIS}\`\`\`\n\nCopy code di atas dan paste ke aplikasi pembayaran Anda.\n\nSetelah bayar, ketik: \`!confirm ${orderId}\``
                });
            }

        } catch (error) {
            console.error('Payment error:', error);
            await sock.sendMessage(from, {
                text: `❌ Terjadi kesalahan saat generate QRIS.\n\nError: ${error.message}\n\nSilakan hubungi admin.`
            });
        }
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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