const config = require('../config/config');

module.exports = {
    name: 'menu',
    description: 'Menampilkan menu coffee shop',
    aliases: ['list', 'daftar'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const menuItems = config.menu.items;
        const categories = config.menu.categories;

        // Filter by category if specified
        let category = args[0] ? args[0].toLowerCase() : null;
        let filteredItems = menuItems;

        if (category) {
            const validCategory = Object.keys(categories).find(
                cat => cat.toLowerCase() === category || 
                       categories[cat].name.toLowerCase().includes(category)
            );
            
            if (validCategory) {
                filteredItems = menuItems.filter(item => item.category === validCategory);
                category = validCategory;
            }
        }

        // Build menu text
        let menuText = `☕ *${config.shop.name}*\n`;
        menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (category) {
            // Show specific category
            const cat = categories[category];
            menuText += `${cat.emoji} *${cat.name}*\n\n`;
            
            filteredItems.forEach((item, index) => {
                const available = item.available ? '' : ' ❌ (Habis)';
                menuText += `${index + 1}. *${item.name}*${available}\n`;
                menuText += `   💰 Rp ${this.formatNumber(item.price)}\n`;
                menuText += `   📝 Pesan: \`!order ${item.id} 1\`\n\n`;
            });
        } else {
            // Show all categories
            Object.entries(categories).forEach(([catKey, cat]) => {
                const items = menuItems.filter(item => item.category === catKey);
                
                if (items.length > 0) {
                    menuText += `${cat.emoji} *${cat.name}*\n`;
                    
                    items.forEach((item) => {
                        const available = item.available ? '' : ' ❌';
                        menuText += `• ${item.name}${available} - Rp ${this.formatNumber(item.price)}\n`;
                        menuText += `  Pesan: \`!order ${item.id} 1\`\n`;
                    });
                    
                    menuText += `\n`;
                }
            });
        }

        menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        menuText += `💡 *Cara Pesan:*\n`;
        menuText += `Ketik: \`!order [ID] [JUMLAH]\`\n\n`;
        menuText += `📌 *Contoh:*\n`;
        menuText += `• \`!order C001 2\` - Pesan 2 Espresso\n`;
        menuText += `• \`!order C003 1\` - Pesan 1 Cappuccino\n\n`;
        menuText += `🛒 *Lihat kategori:*\n`;
        menuText += `• \`!menu coffee\` - Menu kopi\n`;
        menuText += `• \`!menu food\` - Menu makanan\n\n`;
        menuText += `📋 Ketik \`!cart\` untuk lihat keranjang`;

        await sock.sendMessage(from, { text: menuText });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};