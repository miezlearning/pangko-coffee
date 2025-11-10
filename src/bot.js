const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const messageHandler = require('./handlers/messageHandler');
const config = require('./config/config');
const orderManager = require('./services/orderManager');
const fs = require('fs');
const path = require('path');

/**
 * WhatsApp Bot Core
 */
class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.qr = null;
        this.reconnectAttempts = 0;
        this.lastStatusCode = null;
        this.lockAcquired = false;
        this.cleanupStarted = false;
        this.usePairingCode = process.env.WA_PAIRING_CODE === 'true';
        const phoneEnv = process.env.WA_PAIRING_CODE_PHONE || process.env.WA_PHONE_NUMBER || '';
        this.pairingPhone = typeof phoneEnv === 'string' ? phoneEnv.replace(/\D/g, '') : '';
        this.hasShownPairingCode = false;
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            console.log('🚀 Starting WhatsApp Bot...');
            this.hasShownPairingCode = false;

            // Simple lockfile to avoid running multiple bot instances which cause
            // 'conflict' / 401 errors from WhatsApp (connection replaced).
            // Only attempt to acquire the lock on the first start() call for this process.
            if (!this.lockAcquired) {
                const lockFile = path.resolve(__dirname, '..', 'bot.lock');
                const ensureSingleInstance = () => {
                    // if lock exists, check if PID is still running; if not, clean it
                    if (fs.existsSync(lockFile)) {
                        try {
                            const pidStr = fs.readFileSync(lockFile, 'utf8').trim();
                            const pid = parseInt(pidStr, 10);
                            // allow re-entrant when the lock belongs to this same process
                            if (!isNaN(pid) && pid === process.pid) {
                                return true;
                            }
                            let running = false;
                            if (!isNaN(pid)) {
                                try {
                                    process.kill(pid, 0); // throws if not running
                                    running = true;
                                } catch (_) {
                                    running = false;
                                }
                            }
                            if (!running) {
                                // stale lock, remove
                                fs.unlinkSync(lockFile);
                            } else {
                                console.error('Another bot instance appears to be running (bot.lock exists). Exiting to avoid session conflict.');
                                return false;
                            }
                        } catch (e) {
                            // if cannot read, try to remove and proceed
                            try { fs.unlinkSync(lockFile); } catch (_) { /* ignore */ }
                        }
                    }
                    // create fresh lock
                    const fd = fs.openSync(lockFile, 'wx');
                    fs.writeSync(fd, String(process.pid));
                    fs.closeSync(fd);
                    const cleanupLock = () => {
                        try { fs.unlinkSync(lockFile); } catch (e) { /* ignore */ }
                    };
                    process.on('exit', cleanupLock);
                    process.on('SIGINT', () => { cleanupLock(); process.exit(0); });
                    process.on('SIGTERM', () => { cleanupLock(); process.exit(0); });
                    return true;
                };
                if (!ensureSingleInstance()) {
                    return;
                }
                this.lockAcquired = true;
            }

            // CommonJS require for Baileys
            const baileys = require('@whiskeysockets/baileys');
            const makeWASocket = typeof baileys.makeWASocket === 'function'
                ? baileys.makeWASocket
                : (typeof baileys.default === 'function' ? baileys.default : null);
            if (!makeWASocket) {
                throw new Error('Unable to resolve makeWASocket export from Baileys.');
            }
            const useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;
            const DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason;
            const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion;

            if (!useMultiFileAuthState || !DisconnectReason || !fetchLatestBaileysVersion) {
                throw new Error('Baileys exports missing required helpers. Ensure the installed version is compatible.');
            }
            
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
            // Allow turning on verbose Baileys logging via environment variable
            const baileysLogLevel = process.env.BAILEYS_DEBUG === 'true' ? 'debug' : 'silent';
            this.sock = makeWASocket({
                auth: state,
                logger: pino({ level: baileysLogLevel }), // set via BAILEYS_DEBUG env
                browser: [config.shop.name + ' Bot', 'Chrome', '1.0.0'],
                version,
                printQRInTerminal: false
            });

            if (this.usePairingCode && !state?.creds?.registered && !this.hasShownPairingCode) {
                if (!this.pairingPhone) {
                    console.error('Pairing code mode enabled but WA_PAIRING_CODE_PHONE/WA_PHONE_NUMBER is not set.');
                } else if (typeof this.sock.requestPairingCode === 'function') {
                    try {
                        const pairingCode = await this.sock.requestPairingCode(this.pairingPhone);
                        if (pairingCode) {
                            const spacedCode = pairingCode.match(/.{1,4}/g)?.join(' ') || pairingCode;
                            console.log('🔑 Pairing Code untuk menghubungkan bot:');
                            console.log(`   ${spacedCode}`);
                            console.log('📱 Di HP: WhatsApp → Perangkat Tertaut → Tautkan Perangkat → Masukkan Kode.');
                            this.hasShownPairingCode = true;
                        }
                    } catch (err) {
                        console.error('Gagal membuat pairing code:', err?.message || err);
                    }
                } else {
                    console.error('Versi Baileys saat ini tidak mendukung pairing code (requestPairingCode tidak tersedia).');
                }
            }

            // Save credentials on update (wrap to add a debug log)
            this.sock.ev.on('creds.update', async (creds) => {
                try {
                    console.log('⚙️ creds.update event received, saving credentials...');
                    await saveCreds(creds);
                    console.log('⚙️ creds saved');
                } catch (err) {
                    console.error('Error saving creds:', err);
                }
            });

            // Handle connection updates
            this.sock.ev.on('connection.update', this.handleConnection.bind(this));

            // Handle incoming messages
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            // Start cleanup job (only once per process)
            if (!this.cleanupStarted) {
                this.startCleanupJob();
                this.cleanupStarted = true;
            }

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
        // Verbose connection update log (omit raw QR data for readability)
        const logPayload = { ...update };
        if (logPayload.qr) logPayload.qr = '[qr]';
        console.log('[ConnUpdate]', JSON.stringify(logPayload));

        if (qr) {
            if (this.usePairingCode) {
                console.log('📱 Pairing code mode aktif. Abaikan QR ini, masukkan kode 8 digit di WhatsApp HP.');
                return;
            }
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
            // In some Baileys versions the disconnect error isn't a Boom instance.
            // Avoid relying on `instanceof Boom` which may be false and cause
            // an immediate exit even when reconnect would work. Instead read
            // the statusCode (if present) and only treat it as a loggedOut
            // when it explicitly equals DisconnectReason.loggedOut.
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== this.DisconnectReason?.loggedOut;

            this.lastStatusCode = statusCode;

            // Exponential backoff for restartRequired (515) or connectionLost
            if (statusCode === this.DisconnectReason?.restartRequired || statusCode === 515) {
                this.reconnectAttempts += 1;
            } else if (statusCode && statusCode !== this.DisconnectReason?.loggedOut) {
                // non-logout but other error -> increment attempts modestly
                this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 5);
            }

            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);

            // Helpful debug info: print disconnect error details when present
            if (lastDisconnect?.error) {
                try {
                    console.error('Last disconnect error:', lastDisconnect.error);
                } catch (e) {
                    console.error('Last disconnect error (toString):', String(lastDisconnect.error));
                }
            }

            // Special handling for 401 conflicts (e.g., device_removed)
            if (statusCode === this.DisconnectReason?.loggedOut) {
                // Try to give a clearer reason if present
                const errData = lastDisconnect?.error?.data;
                let conflictType = undefined;
                try {
                    conflictType = errData?.content?.[0]?.attrs?.type || errData?.attrs?.type;
                } catch (_) { /* ignore */ }

                if (conflictType === 'device_removed') {
                    console.error('🔐 Session was removed from the phone (conflict: device_removed).');
                } else {q
                    console.error('🔐 Session invalid or logged out by server (401).');
                }

                const autoResetEnabled = process.env.BOT_AUTO_SESSION_RESET === 'true';
                if (autoResetEnabled) {
                    try {
                        console.warn('⚠️ Auto session reset enabled. Removing sessions folder and restarting login...');
                        fs.rmSync(path.resolve(__dirname, '..', 'sessions'), { recursive: true, force: true });
                        this.reconnectAttempts = 0;
                        setTimeout(() => this.start(), 2000);
                        return;
                    } catch (e) {
                        console.error('Failed to auto-remove sessions:', e.message);
                    }
                }
            }

            if (shouldReconnect) {
                // Compute delay with exponential backoff (base 2s capped at 30s)
                const delay = Math.min(30000, 2000 * Math.pow(2, Math.max(0, this.reconnectAttempts - 1)));
                console.log(`🔄 Scheduling reconnect attempt #${this.reconnectAttempts || 1} in ${Math.round(delay/1000)}s (statusCode=${statusCode || 'n/a'})`);
                setTimeout(() => this.start(), delay);
                // Optional auto session reset after too many failed restartRequired cycles
                const autoResetEnabled = process.env.BOT_AUTO_SESSION_RESET === 'true';
                if (autoResetEnabled && this.reconnectAttempts >= 6) {
                    try {
                        console.warn('⚠️ Auto session reset triggered after repeated failures. Removing sessions folder...');
                        fs.rmSync(path.resolve(__dirname, '..', 'sessions'), { recursive: true, force: true });
                        this.reconnectAttempts = 0;
                    } catch (e) {
                        console.error('Failed to auto-remove sessions:', e.message);
                    }
                }
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
            // Reset attempts on successful open
            this.reconnectAttempts = 0;
            this.lastStatusCode = null;
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