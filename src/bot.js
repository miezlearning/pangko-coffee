const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const messageHandler = require('./handlers/messageHandler');
const config = require('./config/config');
const orderManager = require('./services/orderManager');

/**
 * WhatsApp Bot Core
 */
class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.qr = null;
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            console.log('🚀 Starting WhatsApp Bot...');

            // Dynamically import Baileys (it's an ES module). This avoids the
            // CommonJS -> ESM require() experimental warning.
            const baileys = await import('@whiskeysockets/baileys');
            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
            // expose DisconnectReason to instance so other methods (handleConnection)
            // can access it outside start()
            this.DisconnectReason = DisconnectReason;

            // Get latest baileys version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📦 Using Baileys v${version.join('.')} ${isLatest ? '(latest)' : ''}`);

            // Load auth state
            const { state, saveCreds } = await useMultiFileAuthState('./sessions');

            // Create socket
            // Note: `printQRInTerminal` is deprecated in newer Baileys releases.
            // We handle QR display ourselves in the `connection.update` event.
            this.sock = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }), // 'silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'
                browser: [config.shop.name + ' Bot', 'Chrome', '1.0.0'],
                version
            });

            // Save credentials on update
            this.sock.ev.on('creds.update', saveCreds);

            // Handle connection updates
            this.sock.ev.on('connection.update', this.handleConnection.bind(this));

            // Handle incoming messages
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            // Start cleanup job
            this.startCleanupJob();

            console.log('✅ Bot initialized successfully!');

        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            throw error;
        }
    }

    /**
     * Handle connection updates
     */
    handleConnection(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.qr = qr;
            console.log('📱 Scan QR code di terminal untuk login!');
            try {
                // Print ASCII QR in terminal for easy scanning
                qrcode.generate(qr, { small: true });
            } catch (err) {
                // fallback - print the raw QR string (not ideal but visible)
                console.log('QR data:', qr);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = 
                lastDisconnect?.error instanceof Boom &&
                lastDisconnect.error.output.statusCode !== this.DisconnectReason?.loggedOut;

            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);

            if (shouldReconnect) {
                setTimeout(() => this.start(), 3000);
            } else {
                console.log('🔐 Logged out. Please restart and scan QR again.');
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log(`📱 Bot: ${this.sock.user.id}`);
            console.log(`☕ Shop: ${config.shop.name}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🎉 Bot is ready to receive messages!');
        }
    }

    /**
     * Handle incoming messages
     */
    async handleMessages(m) {
        try {
            const msg = m.messages[0];

            // Ignore if no message or from self
            if (!msg.message || msg.key.fromMe) return;

            // Ignore status broadcasts
            if (msg.key.remoteJid === 'status@broadcast') return;

            // Process message
            await messageHandler(this.sock, msg);

        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    /**
     * Start periodic cleanup job
     * Cleans expired orders every 5 minutes
     */
    startCleanupJob() {
        setInterval(() => {
            try {
                console.log('[Cleanup] Running expired order cleanup...');
                const expired = orderManager.cleanExpiredOrders();
                // Notify users whose cash orders auto-cancelled
                if (expired && Array.isArray(expired.cashExpired) && expired.cashExpired.length > 0) {
                    expired.cashExpired.forEach(async (order) => {
                        try {
                            const until = order.canReopenUntil ? new Date(order.canReopenUntil).toLocaleString('id-ID') : '';
                            const text = `⏰ *Waktu ke Kasir Habis*\n\n` +
                                `Order ID: *${order.orderId}*\n` +
                                `Status: Dibatalkan (tunai)\n\n` +
                                `Anda masih bisa membuka kembali dalam 60 menit (maksimal ${require('./config/config').order.maxReopenPerOrder}x per pesanan).\n` +
                                `Balas: *!lanjut ${order.orderId}* sebelum ${until}.`;
                            await this.sock.sendMessage(order.userId, { text });
                        } catch (e) { /* ignore */ }
                    });
                }
            } catch (error) {
                console.error('[Cleanup] Error:', error);
            }
    }, 60 * 1000); // 1 minute

    console.log('🧹 Cleanup job started (runs every 1 minute)');
    }

    /**
     * Send message to specific number
     */
    async sendMessage(to, content) {
        try {
            // Ensure number has @s.whatsapp.net suffix
            const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
            
            await this.sock.sendMessage(jid, content);
            return true;
        } catch (error) {
            console.error('Send message error:', error);
            return false;
        }
    }

    /**
     * Get bot info
     */
    getInfo() {
        return {
            user: this.sock?.user,
            connected: this.sock?.user ? true : false,
            config: {
                shopName: config.shop.name,
                prefix: config.bot.prefix
            }
        };
    }
}

module.exports = WhatsAppBot;