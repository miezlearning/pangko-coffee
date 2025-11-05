const config = require('../config/config');
const menuStore = require('../services/menuStore');

module.exports = {
    name: 'menu',
    description: 'Menampilkan menu coffee shop',
    aliases: ['list', 'daftar'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // Get menu from database
        const menuItems = menuStore.getMenuItems({ available: true });
        const categories = menuStore.getCategories();
        const categoriesWithItems = categories.filter(cat =>
            menuItems.some(item => item.category === cat.id)
        );

        if (menuItems.length === 0) {
            await sock.sendMessage(from, {
                text: `😕 *Menu belum tersedia*.

Silakan hubungi admin untuk menambahkan menu terlebih dahulu.`
            });
            return;
        }

        const rawCategoryArg = (args[0] || '').trim().toLowerCase();
        const instructions = `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💡 *Cara Pesan:*\n` +
            `Ketik: \`!order [ID] [JUMLAH]\`\n\n` +
            `📌 *Contoh:*\n` +
            `• \`!order C001 2\` - Pesan 2 Espresso\n` +
            `• \`!order C003 1\` - Pesan 1 Cappuccino\n\n` +
            `🛒 *Lihat kategori spesifik:*\n` +
            categoriesWithItems.map(cat => `• \`!menu ${cat.id}\` - ${cat.name}`).join('\n') +
            `\n\n📋 Ketik \`!cart\` untuk lihat keranjang`;

        let menuText = `☕ *${config.shop.name}*\n`;
        menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (rawCategoryArg) {
            const selectedCategory = categories.find(cat =>
                cat.id.toLowerCase() === rawCategoryArg ||
                cat.name.toLowerCase().includes(rawCategoryArg)
            );

            if (!selectedCategory) {
                await sock.sendMessage(from, {
                    text: `⚠️ Kategori *${args[0]}* tidak ditemukan.

Kategori yang tersedia:
${categoriesWithItems.map(cat => `• ${cat.emoji} ${cat.name} (\`!menu ${cat.id}\`)`).join('\n')}`
                });
                return;
            }

            const itemsInCategory = menuItems.filter(item => item.category === selectedCategory.id);

            if (itemsInCategory.length === 0) {
                await sock.sendMessage(from, {
                    text: `⚠️ Menu untuk kategori *${selectedCategory.name}* belum tersedia atau sedang habis.

Coba pilih kategori lain atau hubungi admin untuk menambah menu.`
                });
                return;
            }

            menuText += `${selectedCategory.emoji} *${selectedCategory.name}*\n\n`;

            itemsInCategory.forEach((item, index) => {
                const availableLabel = item.available ? '' : ' ❌ (Habis)';
                menuText += `${index + 1}. *${item.name}*${availableLabel}\n`;
                menuText += `   💰 Rp ${this.formatNumber(item.price)}\n`;
                if (item.description) {
                    menuText += `   ${item.description}\n`;
                }
                menuText += `   📝 Pesan: \`!order ${item.id} 1\`\n\n`;
            });

            menuText += instructions;
            await sock.sendMessage(from, { text: menuText });
            return;
        }

        categoriesWithItems.forEach(cat => {
            const items = menuItems.filter(item => item.category === cat.id);
            if (!items.length) return;

            menuText += `${cat.emoji} *${cat.name}*\n`;
            items.forEach(item => {
                const availableLabel = item.available ? '' : ' ❌';
                menuText += `• ${item.name}${availableLabel} - Rp ${this.formatNumber(item.price)}\n`;
                menuText += `  Pesan: \`!order ${item.id} 1\`\n`;
            });
            menuText += `\n`;
        });

        if (!categoriesWithItems.length) {
            await sock.sendMessage(from, {
                text: `� Semua kategori menu sedang kosong.

Silakan hubungi admin untuk menambahkan menu.`
            });
            return;
        }

        menuText += instructions;
        await sock.sendMessage(from, { text: menuText });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};