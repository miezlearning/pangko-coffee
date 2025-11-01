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

        // Parse args: allow optional payment method (qris|tunai|cash) as last word
        let raw = args.join(' ').trim();
        let method = null;
        if (raw) {
            const parts = raw.split(/\s+/);
            const last = parts[parts.length - 1].toLowerCase();
            if (['qris', 'tunai', 'cash'].includes(last)) {
                method = last === 'tunai' || last === 'cash' ? 'CASH' : 'QRIS';
                parts.pop();
                raw = parts.join(' ').trim();
            }
        }
        // Check if customer name provided as argument (remaining raw)
        let customerName = raw;
        
        // If no name provided, ask for it
        if (!customerName) {
            // Calculate total for display
            const pricing = orderManager.calculateTotal(session.items, true);
            
            let text = `📋 *Siap Checkout?*\n\n`;
            text += `Items: ${session.items.length} item\n`;
            text += `Total: Rp ${this.formatNumber(pricing.total)}\n\n`;
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `📝 *Nama Anda?*\n\n`;
            text += `Untuk memudahkan pengambilan pesanan di counter:\n`;
            text += `"Atas nama [NAMA], pesanan sudah siap!"\n\n`;
            text += `💡 Ketik: \`!checkout [NAMA] [METODE]\`\n`;
            text += `Metode: qris | tunai\n`;
            text += `Contoh: \`!checkout Budi qris\` atau \`!checkout Budi tunai\``;
            
            await sock.sendMessage(from, { text });
            return;
        }

        try {
            // Default method if not provided: QRIS
            const paymentMethod = method || 'QRIS';
            // Create order with customer name and method
            const order = orderManager.createOrder(userId, customerName, paymentMethod);
            
            if (paymentMethod === 'CASH') {
                // CASH flow: set to PROCESSING immediately, notify customer and baristas
                orderManager.updateOrderStatus(order.orderId, orderManager.STATUS.PROCESSING, { confirmedAt: new Date() });

                // Message to customer
                let text = `✅ *Pesanan Berhasil Dibuat (Tunai)!*\n\n`;
                text += `📋 Order ID: *${order.orderId}*\n`;
                text += `👤 Atas Nama: *${order.customerName}*\n`;
                text += `💳 Metode: *Tunai di Kasir*\n`;
                text += `⏰ Dibuat: ${moment(order.createdAt).format('DD/MM/YYYY HH:mm')}\n\n`;
                text += `*Items:*\n`;
                order.items.forEach((item, index) => {
                    text += `${index + 1}. ${item.name} x${item.quantity}\n`;
                    text += `   Rp ${this.formatNumber(item.price * item.quantity)}\n`;
                });
                text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                text += `*TOTAL: Rp ${this.formatNumber(order.pricing.total)}*\n\n`;
                text += `Silakan bayar di kasir dan sebutkan: *Order ${order.orderId} atas nama ${order.customerName}*.\n`;
                text += `Pesanan Anda sedang diproses oleh barista. Anda akan diberi notifikasi saat siap. 👨‍🍳`;

                await sock.sendMessage(from, { text });

                // Notify baristas (reusing wording similar to payment confirmation)
                const baristaText = `🔔 *Pesanan Tunai Baru!*\n\n` +
                    `📋 Order ID: *${order.orderId}*\n` +
                    `👤 Atas Nama: *${order.customerName}*\n` +
                    `👨‍💼 Customer: ${order.userId.split('@')[0]}\n` +
                    `💳 Metode: *Tunai*\n` +
                    `💰 Total: *Rp ${order.pricing.total.toLocaleString('id-ID')}*\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `*PESANAN:*\n${order.items.map((item, idx) => 
                        `${idx + 1}. ${item.name} (${item.size}) x${item.quantity}${item.notes ? `\n   📝 ${item.notes}` : ''}`
                    ).join('\n')}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Silakan proses pesanan ini! 👨‍🍳`;

                try {
                    const config = require('../config/config');
                    for (const baristaNumber of config.baristaNumbers) {
                        try { await sock.sendMessage(baristaNumber, { text: baristaText }); } catch (_) {}
                    }
                } catch (_) {}

                return;
            }

            // QRIS flow
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
            let text = `✅ *Pesanan Berhasil Dibuat (QRIS)!*\n\n`;
            text += `📋 Order ID: *${order.orderId}*\n`;
            text += `👤 Atas Nama: *${order.customerName}*\n`;
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
                const PaymentGateway = require('../paymentGateway');
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