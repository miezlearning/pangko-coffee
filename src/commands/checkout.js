const orderManager = require('../services/orderManager');
const QRISGenerator = require('../utils/qris');
const config = require('../config/config');
const moment = require('moment-timezone');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const FOLLOW_UP_TIMEOUT_MS = 15 * 60 * 1000;
const pendingFollowUps = new Map();

function cleanupFollowUps() {
    const now = Date.now();
    for (const [userId, data] of pendingFollowUps.entries()) {
        if (now - data.startedAt > FOLLOW_UP_TIMEOUT_MS) {
            pendingFollowUps.delete(userId);
        }
    }
}

setInterval(cleanupFollowUps, 60 * 1000);

async function downloadImageBuffer(msg) {
    const image = msg.message?.imageMessage;
    if (!image) return null;
    const stream = await downloadContentFromMessage(image, 'image');
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// Simple in-memory state is stored inside orderManager session under `checkoutWizard`

module.exports = {
    name: 'checkout',
    description: 'Proses checkout dan buat pesanan (interactive: nama + metode)',
    aliases: ['bayar', 'pay', 'co'],

    // Interactive session helpers
    async hasActiveSession(userId) {
        const session = orderManager.getSession(userId);
        const wizardActive = !!(session && session.checkoutWizard && session.checkoutWizard.active);
        return wizardActive || pendingFollowUps.has(userId);
    },

    async handleResponse(sock, msg) {
        const from = msg.key.remoteJid;
        const userId = from;
        const session = orderManager.getSession(userId);
        const wizard = session?.checkoutWizard;

        if (wizard && wizard.active) {
            const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
            if (!text) return;

            // Allow cancel
            if (/^(batal|cancel)$/i.test(text)) {
                session.checkoutWizard = null;
                orderManager.sessions.set(userId, session);
                await sock.sendMessage(from, { text: '✅ Checkout dibatalkan. Ketik *!checkout* lagi jika ingin melanjutkan.' });
                return;
            }

            if (wizard.step === 'ask_name') {
                const name = text.replace(/\s+/g, ' ').trim();
                if (!name || name.length < 2) {
                    await sock.sendMessage(from, { text: '⚠️ Nama terlalu pendek. Mohon ketik nama yang benar.' });
                    return;
                }
                wizard.customerName = name;
                wizard.step = 'ask_method';
                orderManager.sessions.set(userId, session);
                await sock.sendMessage(from, { text: '🔰 Pilih metode pembayaran: *qris* atau *tunai* (ketik salah satu).' });
                return;
            }

            if (wizard.step === 'ask_method') {
                const lc = text.toLowerCase();
                let method = null;
                if (lc.includes('qris')) method = 'QRIS';
                if (/(tunai|cash)/.test(lc)) method = 'CASH';
                if (!method) {
                    await sock.sendMessage(from, { text: '⚠️ Metode tidak dikenali. Ketik *qris* atau *tunai*.' });
                    return;
                }
                wizard.paymentMethod = method;
                // Proceed to create order with captured data
                session.checkoutWizard = null;
                orderManager.sessions.set(userId, session);

                // Delegate to same execution path with parsed args
                await this.execute(sock, msg, [wizard.customerName, method.toLowerCase()]);
                return;
            }
            return;
        }

        const followUp = pendingFollowUps.get(userId);
        if (!followUp) return;

        if (followUp.type === 'qris_proof') {
            const image = msg.message?.imageMessage;
            if (!image) {
                await sock.sendMessage(from, { text: '📸 Mohon kirim foto/screenshot bukti transfer QRIS sebagai balasan pesan ini.' });
                return;
            }

            const proofBuffer = await downloadImageBuffer(msg);
            if (!proofBuffer) {
                await sock.sendMessage(from, { text: '❌ Gagal membaca gambar. Mohon kirim ulang bukti pembayaran.' });
                return;
            }

            const order = orderManager.getOrder(followUp.orderId);
            if (!order) {
                pendingFollowUps.delete(userId);
                await sock.sendMessage(from, { text: '❌ Order tidak ditemukan. Silakan hubungi kasir.' });
                return;
            }

            try {
                // Include base64 data URL so dashboard can display the image
                const dataUrl = `data:${image.mimetype};base64,${proofBuffer.toString('base64')}`;
                orderManager.setPaymentProof(order.orderId, {
                    type: 'image',
                    mimeType: image.mimetype,
                    fileLength: image.fileLength,
                    sender: userId,
                    imageData: dataUrl
                });
            } catch (error) {
                console.error('Failed to attach payment proof:', error.message);
            }

            const caption = `📸 *Bukti Pembayaran QRIS*
Order: ${order.orderId}
Nama: ${order.customerName}
Total: Rp ${this.formatNumber(order.pricing.total)}
Dari: ${userId.split('@')[0]}`;

            const targets = new Set([...(config.shop.baristaNumbers || []), ...(config.shop.adminNumbers || [])]);
            for (const target of targets) {
                if (!target) continue;
                try {
                    await sock.sendMessage(target, {
                        image: proofBuffer,
                        caption
                    });
                } catch (err) {
                    console.error(`Failed to forward proof to ${target}:`, err.message);
                }
            }

            pendingFollowUps.delete(userId);

            await sock.sendMessage(from, {
                text: '🙏 Terima kasih! Bukti pembayaran sudah diterima. Kasir akan memeriksa dan mengkonfirmasi dalam 1-2 menit.'
            });
            await sock.sendMessage(from, {
                text: `ℹ️ Anda bisa cek status pembayaran dengan mengetik *!status ${order.orderId}*.`
            });
            return;
        }

        if (followUp.type === 'cash_arrival') {
            const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
            if (!text) {
                await sock.sendMessage(from, { text: '✋ Mohon balas dengan "sudah" ketika Anda sudah berada di kasir.' });
                return;
            }

            if (/^(sudah|sampai|di kasir|hadir|saya sudah|sampun)$/i.test(text.toLowerCase())) {
                const order = orderManager.getOrder(followUp.orderId);
                pendingFollowUps.delete(userId);

                if (order) {
                    const notifyText = `👥 *Customer Tunai Hadir*
Order: ${order.orderId}
Nama: ${order.customerName}
Total: Rp ${this.formatNumber(order.pricing.total)}
Status: menunggu kasir menerima pembayaran tunai.`;
                    for (const target of config.shop.baristaNumbers || []) {
                        try {
                            await sock.sendMessage(target, { text: notifyText });
                        } catch (err) {
                            console.error(`Failed to notify barista ${target}:`, err.message);
                        }
                    }
                }

                await sock.sendMessage(from, {
                    text: '👍 Noted! Kasir sudah diberi tahu. Silakan tunjukkan Order ID Anda kepada kasir.'
                });
                return;
            }

            if (/^(batal|cancel)$/i.test(text.toLowerCase())) {
                pendingFollowUps.delete(userId);
                await sock.sendMessage(from, { text: 'ℹ️ Jika ingin membatalkan pesanan, silakan informasikan langsung ke kasir atau tunggu pesanan hangus otomatis.' });
                return;
            }

            await sock.sendMessage(from, { text: '⚠️ Ketik *sudah* ketika Anda telah berada di kasir, atau *batal* bila tidak jadi datang.' });
        }
    },

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
            
            // Start interactive wizard: ask name first
            session.checkoutWizard = {
                active: true,
                step: 'ask_name',
                customerName: null,
                paymentMethod: null
            };
            orderManager.sessions.set(userId, session);

            let text = `📋 *Siap Checkout?*\n\n`;
            text += `Items: ${session.items.length} item\n`;
            text += `Total: Rp ${this.formatNumber(pricing.total)}\n\n`;
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `📝 *Nama Anda?* (balas chat ini dengan nama)\n\n`;
            text += `Untuk memudahkan pengambilan di counter: \"Atas nama [NAMA]\".`;
            await sock.sendMessage(from, { text });
            return;
        }

        try {
            // Default method if not provided: QRIS
            const paymentMethod = method || 'QRIS';
            // Create order with customer name and method
            const order = orderManager.createOrder(userId, customerName, paymentMethod);
            
            if (paymentMethod === 'CASH') {
                // CASH flow: keep as PENDING_CASH until kasir accept
                const expiryTime = moment(order.cashExpiresAt || order.createdAt)
                    .tz(config.bot.timezone)
                    .format('HH:mm');
                const tzLabel = getTzLabel(config.bot.timezone);
                const minutesLeft = order.cashExpiresAt ? moment(order.cashExpiresAt).diff(moment(), 'minutes') : (config.order.cashTimeout || 10);

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
                text += `📍 Silakan menuju kasir dan sebutkan: *Order ${order.orderId} atas nama ${order.customerName}*.\n`;
                text += `Kasir akan melakukan *konfirmasi penerimaan tunai* terlebih dahulu sebelum barista mulai proses.\n\n`;
                text += `⏰ Batas waktu kedatangan ke kasir: ${expiryTime} ${tzLabel} (${minutesLeft} menit).\n`;
                text += `Jika lewat waktu, pesanan otomatis dibatalkan. Anda bisa buka kembali dalam 60 menit dengan perintah: *!lanjut ${order.orderId}*.`;

                await sock.sendMessage(from, { text });

                pendingFollowUps.set(userId, {
                    type: 'cash_arrival',
                    orderId: order.orderId,
                    startedAt: Date.now()
                });

                await sock.sendMessage(from, {
                    text: '📣 Balas chat ini dengan *sudah* ketika Anda sudah tiba di kasir supaya kasir langsung memproses pembayaran tunai Anda.'
                });
                return;
            }

            // QRIS flow (with optional provider integration)
            // If provider enabled, create dynamic QR via provider
            const PaymentProvider = require('../services/paymentProvider');
            let dynamicQRIS;
            if (PaymentProvider.isEnabled()) {
                const qrData = await PaymentProvider.createDynamicQR(order);
                dynamicQRIS = qrData.qrString;
                // Save QRIS & provider reference
                orderManager.setOrderQRIS(order.orderId, dynamicQRIS);
                try {
                    orderManager.updateOrderStatus(order.orderId, orderManager.STATUS.PENDING_PAYMENT, {
                        providerRef: qrData.externalId,
                        providerName: (config.paymentProvider && config.paymentProvider.name) || 'provider',
                        providerExpiresAt: qrData.expiresAt
                    });
                } catch (_) {}
            } else {
                // Validate static QRIS
                if (!QRISGenerator.validateQRIS(config.shop.qrisStatic)) {
                    throw new Error('Static QRIS tidak valid. Silakan hubungi admin.');
                }

                // Generate dynamic QRIS immediately (local)
                dynamicQRIS = QRISGenerator.generateOrderQRIS(
                    config.shop.qrisStatic,
                    order.pricing.total,
                    config.order.serviceFee
                );
                orderManager.setOrderQRIS(order.orderId, dynamicQRIS);
            }

            // Format expiry time
            const expiryTime = moment(order.paymentExpiry)
                .tz(config.bot.timezone)
                .format('HH:mm');
            const tzLabel = getTzLabel(config.bot.timezone);
            
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
            text += `⏰ Batas waktu: ${expiryTime} ${tzLabel} (${minutesLeft} menit)\n\n`;
            text += `⚠️ *PENTING:*\n`;
            text += `• Nominal sudah disesuaikan: Rp ${this.formatNumber(order.pricing.total)}\n`;
            text += `• Jangan ubah nominal saat bayar!\n`;
            text += `• Setelah bayar, kirim foto bukti transfer di chat ini.`;

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
                            `4. Selesaikan pembayaran\n` +
                            `5. Screenshot bukti pembayaran & kirim balasan foto ke chat ini\n\n` +
                            `⏰ Batas waktu: ${expiryTime} ${tzLabel}`
                });

                pendingFollowUps.set(userId, {
                    type: 'qris_proof',
                    orderId: order.orderId,
                    startedAt: Date.now()
                });

                // Send reminder message
                await sock.sendMessage(from, {
                    text: `🔔 *Setelah bayar:*\n` +
                          `• Kirim foto bukti transfer di chat ini\n` +
                          `• Tunggu kasir mengkonfirmasi (±1-2 menit)\n` +
                          `• Cek status kapan saja: *!status ${order.orderId}*`
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
                          `Setelah bayar, kirim foto bukti transfer di chat ini. Ketik *!status ${order.orderId}* untuk cek proses.`
                });

                pendingFollowUps.set(userId, {
                    type: 'qris_proof',
                    orderId: order.orderId,
                    startedAt: Date.now()
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

function getTzLabel(tz) {
    // Map common Indonesian timezones
    if (!tz) return 'WIB';
    const t = tz.toLowerCase();
    if (t.includes('jakarta')) return 'WIB';
    if (t.includes('makassar')) return 'WITA';
    if (t.includes('jayapura')) return 'WIT';
    return 'WIB';
}