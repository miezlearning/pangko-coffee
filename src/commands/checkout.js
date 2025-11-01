const orderManager = require('../services/orderManager');
const QRISGenerator = require('../utils/qris');
const config = require('../config/config');
const moment = require('moment-timezone');

module.exports = {
    name: 'checkout',
    description: 'Proses checkout dan buat pesanan',
    aliases: ['bayar', 'pay'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        const session = orderManager.getSession(userId);

        if (!session || session.items.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Keranjang kosong!\n\nKetik *!order* untuk mulai pesan.`
            });
            return;
        }

        try {
            // Create order
            const order = orderManager.createOrder(userId);
            
            // Validate static QRIS
            if (!QRISGenerator.validateQRIS(config.shop.qrisStatic)) {
                throw new Error('Static QRIS tidak valid. Silakan hubungi admin.');
            }

            // Generate dynamic QRIS immediately
            const dynamicQRIS = QRISGenerator.generateOrderQRIS(
                config.shop.qrisStatic,
                order.pricing.total,
                config.order.serviceFee
            );

            // Save QRIS to order
            orderManager.setOrderQRIS(order.orderId, dynamicQRIS);

            // Format expiry time
            const expiryTime = moment(order.paymentExpiry)
                .tz(config.bot.timezone)
                .format('HH:mm');
            
            const minutesLeft = moment(order.paymentExpiry).diff(moment(), 'minutes');

            // Send order confirmation
            let text = `✅ *Pesanan Berhasil Dibuat!*\n\n`;
            text += `📋 Order ID: *${order.orderId}*\n`;
            text += `⏰ Dibuat: ${moment(order.createdAt).format('DD/MM/YYYY HH:mm')}\n\n`;
            
            text += `*Items:*\n`;
            order.items.forEach((item, index) => {
                text += `${index + 1}. ${item.name} x${item.quantity}\n`;
                text += `   Rp ${this.formatNumber(item.price * item.quantity)}\n`;
            });
            
            text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `Subtotal: Rp ${this.formatNumber(order.pricing.subtotal)}\n`;
            
            if (order.pricing.fee > 0) {
                text += `Biaya Layanan: Rp ${this.formatNumber(order.pricing.fee)}\n`;
            }
            
            text += `*TOTAL: Rp ${this.formatNumber(order.pricing.total)}*\n\n`;
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `💳 *SCAN QRIS DI BAWAH UNTUK BAYAR*\n`;
            text += `⏰ Batas waktu: ${expiryTime} WIB (${minutesLeft} menit)\n\n`;
            text += `⚠️ *PENTING:*\n`;
            text += `• Nominal sudah disesuaikan: Rp ${this.formatNumber(order.pricing.total)}\n`;
            text += `• Jangan ubah nominal saat bayar!\n`;
            text += `• Setelah bayar, ketik: \`!confirm ${order.orderId}\``;

            await sock.sendMessage(from, { text });

            // Generate and send QR code image
            try {
                const QRCode = require('qrcode');
                const qrBuffer = await QRCode.toBuffer(dynamicQRIS, {
                    width: 500,
                    margin: 4,
                    errorCorrectionLevel: 'H'
                });

                await sock.sendMessage(from, {
                    image: qrBuffer,
                    caption: `*QRIS PEMBAYARAN*\n\n` +
                            `Order: ${order.orderId}\n` +
                            `Total: Rp ${this.formatNumber(order.pricing.total)}\n\n` +
                            `📱 *Cara Bayar:*\n` +
                            `1. Buka e-wallet (Gopay/OVO/Dana/dll)\n` +
                            `2. Scan QR code di atas\n` +
                            `3. Nominal sudah otomatis terisi\n` +
                            `4. Konfirmasi pembayaran\n` +
                            `5. Setelah berhasil, ketik:\n` +
                            `   \`!confirm ${order.orderId}\`\n\n` +
                            `⏰ Batas waktu: ${expiryTime} WIB`
                });

                // Send reminder message
                await sock.sendMessage(from, {
                    text: `🔔 *JANGAN LUPA!*\n\n` +
                          `Setelah bayar, ketik:\n` +
                          `\`!confirm ${order.orderId}\`\n\n` +
                          `Agar pesanan langsung diproses barista! ⚡`
                });
                
                // Register to payment gateway dashboard
                const PaymentGateway = require('../services/paymentGateway');
                PaymentGateway.registerPayment(order);

            } catch (qrError) {
                console.log('QR Code generation error:', qrError.message);
                
                // Fallback: send QRIS string
                await sock.sendMessage(from, {
                    text: `📱 *QRIS Code:*\n\n` +
                          `\`\`\`${dynamicQRIS}\`\`\`\n\n` +
                          `Copy code di atas dan paste ke aplikasi e-wallet Anda.\n\n` +
                          `Setelah bayar, ketik: \`!confirm ${order.orderId}\``
                });
            }

        } catch (error) {
            console.error('Checkout error:', error);
            await sock.sendMessage(from, {
                text: `❌ Terjadi kesalahan saat membuat pesanan.\n\n${error.message}\n\nSilakan coba lagi atau hubungi admin.`
            });
        }
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};