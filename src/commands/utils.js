const orderManager = require('../services/orderManager');

// Cancel command - clear cart
const cancelCommand = {
    name: 'cancel',
    description: 'Batalkan pesanan/kosongkan keranjang',
    aliases: ['batal', 'clear'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        const session = orderManager.getSession(userId);

        if (!session || session.items.length === 0) {
            await sock.sendMessage(from, {
                text: `ℹ️ Keranjang sudah kosong.`
            });
            return;
        }

        orderManager.clearCart(userId);

        await sock.sendMessage(from, {
            text: `✅ Keranjang berhasil dikosongkan.\n\nKetik *!order* untuk mulai pesan lagi!`
        });
    }
};

// Remove command - remove specific item from cart
const removeCommand = {
    name: 'remove',
    description: 'Hapus item dari keranjang',
    aliases: ['hapus', 'delete'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!remove [ID_MENU]*\nContoh: *!remove C001*`
            });
            return;
        }

        const itemId = args[0].toUpperCase();
        const session = orderManager.getSession(userId);

        if (!session || session.items.length === 0) {
            await sock.sendMessage(from, {
                text: `🛒 Keranjang kosong!`
            });
            return;
        }

        const itemExists = session.items.find(i => i.id === itemId);

        if (!itemExists) {
            await sock.sendMessage(from, {
                text: `❌ Item ${itemId} tidak ada di keranjang.\n\nKetik *!cart* untuk lihat isi keranjang.`
            });
            return;
        }

        orderManager.removeItemFromCart(userId, itemId);

        const updatedSession = orderManager.getSession(userId);
        
        if (!updatedSession || updatedSession.items.length === 0) {
            await sock.sendMessage(from, {
                text: `✅ ${itemExists.name} dihapus!\n\nKeranjang sekarang kosong.`
            });
            return;
        }

        const pricing = orderManager.calculateTotal(updatedSession.items, true);

        let text = `✅ ${itemExists.name} dihapus!\n\n`;
        text += `🛒 *Keranjang Saat Ini:*\n`;
        
        updatedSession.items.forEach((item, index) => {
            text += `${index + 1}. ${item.name} x${item.quantity}\n`;
        });
        
        text += `\nTotal: Rp ${this.formatNumber(pricing.total)}`;

        await sock.sendMessage(from, { text });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};

// Info command - shop information
const infoCommand = {
    name: 'info',
    description: 'Informasi coffee shop',
    aliases: ['about', 'tentang'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const config = require('../config/config');

        let text = `☕ *${config.shop.name}*\n\n`;
        text += `Selamat datang di ${config.shop.name}!\n`;
        text += `Coffee shop favorit Anda untuk menikmati kopi berkualitas tinggi.\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📍 *Lokasi:*\n${config.shop.address}\n\n`;
        text += `⏰ *Jam Buka:*\n${config.shop.openHours}\n\n`;
        text += `📞 *Kontak:*\n${config.shop.contact}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 *Fitur:*\n`;
        text += `✅ Pesan online via WhatsApp\n`;
        text += `✅ Pembayaran QRIS\n`;
        text += `✅ Pre-order system\n`;
        text += `✅ Notifikasi real-time\n\n`;
        text += `Ketik *!menu* untuk melihat menu kami!`;

        await sock.sendMessage(from, { text });
    }
};

module.exports = {
    cancel: cancelCommand,
    remove: removeCommand,
    info: infoCommand
};