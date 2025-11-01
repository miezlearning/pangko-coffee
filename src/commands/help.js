const config = require('../config/config');

module.exports = {
    name: 'help',
    description: 'Menampilkan bantuan',
    aliases: ['bantuan', 'info'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;

        let text = `🤖 *${config.shop.name} Bot*\n\n`;
        text += `Selamat datang! Berikut adalah daftar command yang tersedia:\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        text += `📋 *MENU & INFO*\n`;
        text += `• *!menu* - Lihat daftar menu\n`;
        text += `• *!menu coffee* - Lihat menu kopi\n`;
        text += `• *!info* - Info coffee shop\n\n`;
        
        text += `🛒 *PEMESANAN*\n`;
        text += `• *!pesan* - Pesan interaktif (dibantu bot)\n`;
        text += `• *!order [ID] [JUMLAH]* - Tambah item\n`;
        text += `  Contoh: !order C001 2\n`;
        text += `• *!cart* - Lihat keranjang\n`;
        text += `• *!checkout* - Buat pesanan\n`;
        text += `• *!cancel* - Batalkan pesanan\n\n`;
        
        text += `💳 *PEMBAYARAN*\n`;
        text += `• *!pay [ORDER_ID]* - Generate QRIS\n`;
        text += `  Setelah transfer, tunggu konfirmasi dari kasir\n\n`;
        
        text += `📊 *STATUS*\n`;
        text += `• *!status* - Lihat semua pesanan\n`;
        text += `• *!status [ORDER_ID]* - Detail pesanan\n\n`;
        
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 *CARA PESAN (MUDAH):*\n`;
        text += `1. Ketik: !pesan\n`;
        text += `2. Pilih kategori & menu\n`;
        text += `3. Masukkan jumlah\n`;
        text += `4. Tambah catatan (opsional)\n`;
        text += `5. Checkout & bayar!\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📍 ${config.shop.address}\n`;
        text += `⏰ ${config.shop.openHours}\n`;
        text += `📞 ${config.shop.contact}`;

        // Check if user is barista
        const isBarista = config.shop.baristaNumbers.includes(from) || 
                         config.shop.adminNumbers.includes(from);
        
        if (isBarista) {
            text += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `👨‍🍳 *BARISTA COMMANDS:*\n`;
            text += `• *!queue* - Lihat antrian pesanan\n`;
            text += `• *!detail [ORDER_ID]* - Detail pesanan\n`;
            text += `• *!confirm [ORDER_ID]* - Konfirmasi bayar\n`;
            text += `• *!ready [ORDER_ID]* - Tandai siap\n`;
            text += `• *!history* - Riwayat hari ini\n`;
            text += `• *!cancel-order [ORDER_ID]* - Batalkan`;
        }

        await sock.sendMessage(from, { text });
    }
};