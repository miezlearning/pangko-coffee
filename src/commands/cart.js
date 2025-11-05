const orderManager = require('../services/orderManager');

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

module.exports = {
    name: 'cart',
    description: 'Lihat keranjang belanja',
    aliases: ['keranjang', 'basket'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        const session = orderManager.getSession(userId);

        if (!session || session.items.length === 0) {
            await sock.sendMessage(from, {
                text: `🛒 *Keranjang Kosong*\n\nBelum ada item di keranjang.\n\nKetik \`!menu\` untuk mulai pesan!`
            });
            return;
        }

        const pricing = orderManager.calculateTotal(session.items, true);

        let text = `🛒 *Keranjang Belanja*\n\n`;
        
        session.items.forEach((item, index) => {
            text += `${index + 1}. *${item.name}*\n`;
            text += `   ${item.quantity} x Rp ${formatNumber(item.price)}\n`;
            text += `   Subtotal: Rp ${formatNumber(item.price * item.quantity)}\n`;
            text += `   ID: \`${item.id}\`\n`;
            if (Array.isArray(item.addons) && item.addons.length > 0) {
                item.addons.forEach(addon => {
                    if (!addon || !addon.quantity) return;
                    text += `   ➕ ${addon.name} x${addon.quantity} (Rp ${formatNumber((addon.unitPrice || addon.price || 0) * addon.quantity)})\n`;
                });
            }
            if (item.notes) {
                text += `   📝 ${item.notes}\n`;
            }
            text += `\n`;
        });

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `Subtotal: Rp ${formatNumber(pricing.subtotal)}\n`;
        
        if (pricing.fee > 0) {
            const feeType = require('../config/config').order.serviceFee.type;
            const feeLabel = feeType === 'percent' ? 
                `Biaya Layanan (${require('../config/config').order.serviceFee.amount}%)` :
                'Biaya Layanan';
            text += `${feeLabel}: Rp ${formatNumber(pricing.fee)}\n`;
        }
        
        text += `*TOTAL: Rp ${formatNumber(pricing.total)}*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 *Pilihan:*\n`;
        text += `• Tambah item: \`!order [ID] [JUMLAH]\`\n`;
        text += `• Hapus item: \`!remove [ID]\`\n`;
        text += `• Checkout: \`!checkout\`\n`;
        text += `• Kosongkan: \`!cancel\`\n\n`;
        text += `📌 *Contoh:*\n`;
        text += `• \`!order C002 1\` - Tambah 1 Americano\n`;
        text += `• \`!remove C001\` - Hapus Espresso\n`;
        text += `• \`!checkout\` - Lanjut pembayaran`;

        await sock.sendMessage(from, { text });
    }
};