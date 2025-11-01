const config = require('../config/config');
const orderManager = require('../services/orderManager');

module.exports = {
    name: 'order',
    description: 'Mulai proses pemesanan',
    aliases: ['pesan', 'beli'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // Jika ada argument, langsung tambah item
        if (args.length > 0) {
            return this.addItemToOrder(sock, msg, args);
        }

        // Show order instructions
        let text = `🛒 *Cara Memesan*\n\n`;
        text += `Ketik: *!order [ID_MENU] [JUMLAH]*\n\n`;
        text += `Contoh:\n`;
        text += `• !order C001 2\n`;
        text += `• !order C003 1\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*Menu Cepat:*\n`;
        
        // Show top 5 items
        const topItems = config.menu.items.filter(item => item.available).slice(0, 5);
        topItems.forEach(item => {
            text += `• ${item.name}\n`;
            text += `  ID: \`${item.id}\` - Rp ${this.formatNumber(item.price)}\n`;
        });

        text += `\n💡 Ketik *!menu* untuk lihat semua menu\n`;
        text += `💡 Ketik *!cart* untuk lihat keranjang\n`;

        await sock.sendMessage(from, { text });
    },

    async addItemToOrder(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;
        
        const itemId = args[0].toUpperCase();
        const quantity = parseInt(args[1]) || 1;

        // Validate quantity
        if (quantity < 1 || quantity > config.order.maxItemsPerOrder) {
            await sock.sendMessage(from, {
                text: `❌ Jumlah harus antara 1 sampai ${config.order.maxItemsPerOrder}`
            });
            return;
        }

        // Find item
        const item = config.menu.items.find(i => i.id === itemId);
        
        if (!item) {
            await sock.sendMessage(from, {
                text: `❌ Item tidak ditemukan!\n\nKetik *!menu* untuk lihat daftar menu.`
            });
            return;
        }

        if (!item.available) {
            await sock.sendMessage(from, {
                text: `❌ Maaf, ${item.name} sedang tidak tersedia.`
            });
            return;
        }

        // Add to cart
        const session = orderManager.addItemToCart(userId, item, quantity);
        const pricing = orderManager.calculateTotal(session.items, true);

        let text = `✅ *${item.name}* x${quantity} ditambahkan!\n\n`;
        text += `🛒 *Keranjang Saat Ini:*\n`;
        
        session.items.forEach((cartItem, index) => {
            text += `${index + 1}. ${cartItem.name} x${cartItem.quantity}\n`;
            text += `   Rp ${this.formatNumber(cartItem.price * cartItem.quantity)}\n`;
        });
        
        text += `\n`;
        text += `Subtotal: Rp ${this.formatNumber(pricing.subtotal)}\n`;
        
        if (pricing.fee > 0) {
            text += `Biaya Layanan: Rp ${this.formatNumber(pricing.fee)}\n`;
        }
        
        text += `*Total: Rp ${this.formatNumber(pricing.total)}*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 *Lanjut?*\n`;
        text += `• Tambah item: *!order [ID] [JUMLAH]*\n`;
        text += `• Lihat keranjang: *!cart*\n`;
        text += `• Checkout: *!checkout*\n`;
        text += `• Batal: *!cancel*\n`;

        await sock.sendMessage(from, { text });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};