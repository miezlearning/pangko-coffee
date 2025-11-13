const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const messageHandler = require('./handlers/messageHandler');
const config = require('./config/config');
const orderManager = require('./services/orderManager');
const fs = require('fs');
const path = require('path');
const readline = require('readline'); // Import module input terminal

const storeState = require('./services/storeState');

/**
 * Helper untuk input terminal
 */
const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

/**
 * WhatsApp Bot Core
 */
class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.qr = null;
        this.reconnectAttempts = 0;
        this.lockAcquired = false;
        this.cleanupStarted = false;
        
        // Default value (nanti akan di-override oleh input user jika belum login)
        this.usePairingCode = false;
        this.pairingPhone = '';
        this.hasShownPairingCode = false;
    }

    async start() {
        try {
            console.log('🚀 Starting WhatsApp Bot...');

            // --- 1. LOCKFILE LOGIC (Mencegah double process) ---
            if (!this.lockAcquired) {
                const lockFile = path.resolve(__dirname, '..', 'bot.lock');
                // (Kode lockfile disederhanakan untuk keterbacaan, fungsinya sama)
                if (fs.existsSync(lockFile)) {
                    try { fs.unlinkSync(lockFile); } catch(e){}
                }
                fs.writeFileSync(lockFile, String(process.pid));
                process.on('exit', () => { try { fs.unlinkSync(lockFile); } catch(e){} });
                this.lockAcquired = true;
            }

            // --- 2. LOAD BAILEYS ---
            const baileys = require('@whiskeysockets/baileys');
            const makeWASocket = baileys.makeWASocket || baileys.default.makeWASocket;
            const useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default.useMultiFileAuthState;
            const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion || baileys.default.fetchLatestBaileysVersion;
            this.DisconnectReason = baileys.DisconnectReason || baileys.default.DisconnectReason;

            const { version } = await fetchLatestBaileysVersion();
            console.log(`📦 Baileys v${version.join('.')}`);

            // --- 3. CEK SESSION ---
            const { state, saveCreds } = await useMultiFileAuthState('./sessions');

            // --- 4. INTERACTIVE LOGIN PROMPT (Jika Belum Terdaftar) ---
            // Logika: Jika belum ada creds.registered, tanya user mau pake apa
            if (!state.creds.registered) {
                console.log('\n⚠️  BELUM ADA SESI LOGIN TERDETEKSI');
                console.log('Pilih metode login:');
                console.log('1. QR Code (Scan biasa)');
                console.log('2. Pairing Code (Kode 8 digit - Lebih stabil)');
                
                const choice = await question('Masukkan pilihan (1/2): ');

                if (choice.trim() === '2') {
                    this.usePairingCode = true;
                    const inputNumber = await question('Masukkan Nomor WhatsApp (contoh: 62812xxx): ');
                    this.pairingPhone = inputNumber.replace(/\D/g, ''); // Hapus karakter non-angka
                    console.log(`✅ Mode Pairing Code dipilih untuk: ${this.pairingPhone}\n`);
                } else {
                    this.usePairingCode = false;
                    console.log('✅ Mode QR Code dipilih.\n');
                }
            }

            // --- 5. BUAT SOCKET ---
            this.sock = makeWASocket({
                auth: state,
                logger: pino({ level: 'error' }),
                browser: ["Windows", "Chrome", "120.0.6099.130"], 
                version,
                printQRInTerminal: !this.usePairingCode,
                generateHighQualityLinkPreview: true,
                // 👇 TAMBAHAN AGAR LEBIH STABIL
                syncFullHistory: false, // Eksplisit nonaktifkan
                connectTimeoutMs: 60000, 
                defaultQueryTimeoutMs: 0, // Tidak ada timeout query default
                keepAliveIntervalMs: 20000, // Interval keep-alive lebih lama
                retryRequestDelayMs: 5000
            });

            // --- 6. LOGIKA REQUEST PAIRING CODE ---
            if (this.usePairingCode && !state.creds.registered && !this.hasShownPairingCode) {
                setTimeout(async () => {
                    try {
                        console.log(`⏳ Meminta kode pairing ke WhatsApp...`);
                        const code = await this.sock.requestPairingCode(this.pairingPhone);
                        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

                        console.log('\n==================================================');
                        console.log('🤖 KODE PAIRING ANDA:');
                        console.log(`\x1b[32m%s\x1b[0m`, `   ${formattedCode}`); 
                        console.log('==================================================');
                        console.log('Masukkan kode ini di: Perangkat Tertaut > Tautkan dengan No HP');
                        console.log('==================================================\n');
                        this.hasShownPairingCode = true;
                    } catch (err) {
                        console.error('❌ Gagal request pairing code. Pastikan nomor benar (awalan 62).');
                    }
                }, 3000);
            }

            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('connection.update', this.handleConnection.bind(this));
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            if (!this.cleanupStarted) {
                this.startCleanupJob();
                this.cleanupStarted = true;
            }

        } catch (error) {
            console.error('❌ Failed to start:', error);
        }
    }

    handleConnection(update) {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle tampilan QR manual jika diperlukan (backup)
        if (qr && !this.usePairingCode) {
             this.qr = qr;
             // QR otomatis muncul karena printQRInTerminal: true, 
             // tapi kalau mau custom console log bisa disini.
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== this.DisconnectReason.loggedOut;

            // JIKA LOGOUT / SESI INVALID (401)
            if (statusCode === 401 || statusCode === this.DisconnectReason.loggedOut) {
                console.log('🔐 Sesi habis/logout. Mencoba membersihkan dan restart...');
                
                // Hentikan koneksi lama sebelum restart
                if (this.sock) {
                    this.sock.ev.removeAllListeners();
                    try { this.sock.ws.close(); } catch (e) {}
                    this.sock = null;
                }

                try {
                    // Hanya hapus jika percobaan koneksi ulang sudah terlalu banyak
                    if (this.reconnectAttempts > 5) {
                        console.log('♻️ Terlalu banyak gagal koneksi, menghapus folder session...');
                        fs.rmSync(path.resolve(__dirname, '..', 'sessions'), { recursive: true, force: true });
                    }
                } catch (e) {
                    console.error('❌ Gagal menghapus folder session:', e);
                }
                
                // Reset flag pairing agar ditanya ulang jika sesi dihapus
                this.hasShownPairingCode = false; 
                this.usePairingCode = false; 
                
                console.log('♻️ Restarting bot untuk login ulang...');
                this.reconnectAttempts++;
                setTimeout(() => this.start(), 5000); // Kasih jeda lebih lama
                return;
            }

            console.log(`❌ Terputus (Status: ${statusCode}). Reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                this.reconnectAttempts++;
                setTimeout(() => this.start(), 5000); // Reconnect tanpa tanya input (karena session masih ada)
            }
        } else if (connection === 'open') {
            console.log('✅ TERHUBUNG KE WHATSAPP!');
            console.log(`📱 User: ${this.sock.user.id.split(':')[0]}`);
            this.reconnectAttempts = 0;

            // Set bot instance and update status on connect
            storeState.setBotInstance(this.sock);
            storeState.updateProfileStatus();
        }
    }

    // --- Handler Pesan & Cleanup (Sama seperti sebelumnya) ---
    async handleMessages(m) {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            if (msg.key.remoteJid === 'status@broadcast') return;
            await messageHandler(this.sock, msg);
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    startCleanupJob() {
        setInterval(() => {
            try {
                const expired = orderManager.cleanExpiredOrders();
                // Logika notifikasi expired order...
            } catch (error) { console.error('[Cleanup] Error:', error); }
        }, 60000);
    }

    async sendMessage(to, content) {
        try {
            const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
            await this.sock.sendMessage(jid, content);
            return true;
        } catch (error) { return false; }
    }

    getInfo() {
        return { user: this.sock?.user, connected: !!this.sock?.user };
    }
}

module.exports = WhatsAppBot;