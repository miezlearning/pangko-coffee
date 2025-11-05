const config = require('../config/config');
const orderManager = require('../services/orderManager');
const menuStore = require('../services/menuStore');

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function computeMenuUnitPrice(item) {
    const discountPercent = Number(item.discount_percent || 0);
    if (!discountPercent) return Number(item.price || 0);
    const discounted = Number(item.price || 0) - Number(item.price || 0) * (discountPercent / 100);
    return Math.max(0, Math.round(discounted));
}

function normalizeAddons(addons = []) {
    return addons
        .filter(addon => addon && (addon.isActive !== false))
        .map(addon => ({
            id: addon.id,
            name: addon.name,
            unitPrice: Number(addon.price || 0),
            minQuantity: Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0,
            maxQuantity: Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : null,
            defaultQuantity: Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : null,
            isRequired: !!addon.isRequired
        }));
}

function parseAddonArguments(rawTokens, availableAddons) {
    if (!rawTokens.length || !availableAddons.length) {
        return { selections: [], invalid: [] };
    }

    const addonMap = new Map();
    availableAddons.forEach(addon => addonMap.set(addon.id.toLowerCase(), addon));

    const quantities = new Map();
    const invalid = [];

    rawTokens.forEach(token => {
        if (!token) return;
        const cleaned = token.trim();
        if (!cleaned) return;
        const parts = cleaned.split(/[:=]/);
        const idPart = parts[0].toLowerCase();
        const addon = addonMap.get(idPart);
        if (!addon) {
            invalid.push(`Add-on '${cleaned}' tidak dikenali`);
            return;
        }
        let qty = null;
        if (parts.length > 1 && parts[1] !== '') {
            qty = Number(parts[1]);
        }
        if (qty === null || Number.isNaN(qty)) {
            qty = addon.minQuantity > 0 ? addon.minQuantity : 1;
        }
        if (qty < 0) {
            invalid.push(`Jumlah untuk ${addon.name} tidak boleh negatif`);
            return;
        }
        quantities.set(addon.id, qty);
    });

    const selections = [];
    availableAddons.forEach(addon => {
        let qty;
        if (quantities.has(addon.id)) {
            qty = quantities.get(addon.id);
        } else if (addon.defaultQuantity !== null && addon.defaultQuantity !== undefined) {
            qty = addon.defaultQuantity;
        } else {
            qty = addon.minQuantity;
        }

        if (addon.isRequired && qty < addon.minQuantity) {
            invalid.push(`Add-on ${addon.name} minimal ${addon.minQuantity}`);
            return;
        }
        if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity) {
            invalid.push(`Add-on ${addon.name} maksimal ${addon.maxQuantity}`);
            return;
        }

        if (qty > 0) {
            selections.push({
                id: addon.id,
                name: addon.name,
                quantity: qty,
                unitPrice: addon.unitPrice
            });
        }
    });

    return { selections, invalid };
}

function buildCartItem(item, baseUnitPrice, addonSelections) {
    const addonsTotal = addonSelections.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
    const unitPrice = baseUnitPrice + addonsTotal;
    const keyPart = addonSelections
        .map(addon => `${addon.id}:${addon.quantity}`)
        .sort()
        .join('|');
    const cartKey = keyPart ? `${item.id}::${keyPart}` : item.id;

    return {
        id: item.id,
        name: item.name,
        price: unitPrice,
        basePrice: baseUnitPrice,
        addons: addonSelections,
        cartKey
    };
}

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
    text += `• !order C003 1\n`;
    text += `• !order C004 caramel=1 shot=2\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*Menu Cepat:*\n`;
        
        // Show top 5 items from database
        const topItems = menuStore.getMenuItems({ available: true }).slice(0, 5);
        topItems.forEach(item => {
            text += `• ${item.name}\n`;
            text += `  ID: \`${item.id}\` - Rp ${formatNumber(item.price)}\n`;
        });

        text += `\n💡 Ketik *!menu* untuk lihat semua menu\n`;
        text += `💡 Ketik *!cart* untuk lihat keranjang\n`;

        await sock.sendMessage(from, { text });
    },

    async addItemToOrder(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;
        
        const itemId = args[0].toUpperCase();
        let qtyArgIndex = 1;
        let quantity = 1;
        if (args[1] && /^\d+$/.test(args[1])) {
            quantity = parseInt(args[1], 10);
            qtyArgIndex = 2;
        }

        // Validate quantity
        if (quantity < 1 || quantity > config.order.maxItemsPerOrder) {
            await sock.sendMessage(from, {
                text: `❌ Jumlah harus antara 1 sampai ${config.order.maxItemsPerOrder}`
            });
            return;
        }

        // Find item from database (includes add-ons)
        const item = menuStore.getMenuItemById(itemId);
        
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

        const availableAddons = normalizeAddons(item.addons || []);
        const addonTokens = args.slice(qtyArgIndex);
        const { selections: addonSelections, invalid } = parseAddonArguments(addonTokens, availableAddons);

        if (invalid.length > 0) {
            await sock.sendMessage(from, {
                text: `❌ Gagal memproses add-on:\n- ${invalid.join('\n- ')}`
            });
            return;
        }

        // Ensure required add-ons are fulfilled
        const missingRequired = availableAddons.filter(addon => addon.isRequired)
            .filter(addon => !addonSelections.some(sel => sel.id === addon.id && sel.quantity >= addon.minQuantity))
            .map(addon => `• ${addon.name} minimal ${addon.minQuantity}`);

        if (missingRequired.length > 0) {
            await sock.sendMessage(from, {
                text: `❌ Add-on wajib belum lengkap:\n${missingRequired.join('\n')}`
            });
            return;
        }

        const baseUnitPrice = computeMenuUnitPrice(item);
        const cartItem = buildCartItem(item, baseUnitPrice, addonSelections);

        // Add to cart
        const session = orderManager.addItemToCart(userId, cartItem, quantity);
        const pricing = orderManager.calculateTotal(session.items, true);

        let text = `✅ *${item.name}* x${quantity} ditambahkan!\n\n`;
        text += `🛒 *Keranjang Saat Ini:*\n`;
        
        session.items.forEach((cartItem, index) => {
            text += `${index + 1}. ${cartItem.name} x${cartItem.quantity}\n`;
            text += `   Rp ${formatNumber(cartItem.price * cartItem.quantity)}\n`;
            if (Array.isArray(cartItem.addons) && cartItem.addons.length > 0) {
                cartItem.addons.forEach(addon => {
                    text += `   ➕ ${addon.name} x${addon.quantity} (Rp ${formatNumber(addon.unitPrice * addon.quantity)})\n`;
                });
            }
        });
        
        text += `\n`;
        text += `Subtotal: Rp ${formatNumber(pricing.subtotal)}\n`;
        
        if (pricing.fee > 0) {
            text += `Biaya Layanan: Rp ${formatNumber(pricing.fee)}\n`;
        }
        
        text += `*Total: Rp ${formatNumber(pricing.total)}*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 *Lanjut?*\n`;
        text += `• Tambah item: *!order [ID] [JUMLAH]*\n`;
        text += `• Lihat keranjang: *!cart*\n`;
        text += `• Checkout: *!checkout*\n`;
        text += `• Batal: *!cancel*\n`;

        await sock.sendMessage(from, { text });
    }
};