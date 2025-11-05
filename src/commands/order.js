const config = require('../config/config');
const orderManager = require('../services/orderManager');
const menuStore = require('../services/menuStore');
const {
    formatNumber,
    computeMenuUnitPrice,
    normalizeAddons,
    buildCartItem,
    describeAddonOption,
    formatAddonLines,
    parseAddonSelectionInput
} = require('../utils/addonHelpers');

const DEFAULT_ADDON_TIMEOUT_MS = 5 * 60 * 1000;
const pendingAddonSessions = new Map();

function cleanupExpiredAddonSessions() {
    const now = Date.now();
    for (const [userId, session] of pendingAddonSessions.entries()) {
        if (now - session.startedAt > DEFAULT_ADDON_TIMEOUT_MS) {
            pendingAddonSessions.delete(userId);
        }
    }
}

setInterval(cleanupExpiredAddonSessions, 60 * 1000);

function formatAddonPrompt(item, availableAddons) {
    let text = `➕ *Add-on tersedia untuk ${item.name}*\n\n`;
    availableAddons.forEach(addon => {
        text += `• ${describeAddonOption(addon)}\n`;
    });
    text += `\nBalas dengan format: \`1x2,2\` (index add-on lalu jumlah).\n`;
    text += `Gunakan ID add-on jika Anda sudah hafal, contoh: \`shot=2,cara=1\`.\n`;
    text += `Ketik *skip* jika tidak ingin add-on.\n`;
    text += `Ketik *batal* untuk membatalkan penambahan item ini.`;
    return text;
}

function sendCartSummaryMessage({ sock, to, orderSession, pricing, highlightItemName, highlightQuantity, highlightAddons }) {
    const lineItemHeader = highlightItemName ? `${highlightItemName} x${highlightQuantity}` : null;
    let text = `✅ *Item ditambahkan ke keranjang!*\n\n`;
    if (lineItemHeader) {
        text += `${lineItemHeader}\n`;
        if (highlightAddons?.length) {
            text += `${formatAddonLines(highlightAddons)}\n`;
        }
        text += `\n`;
    }
    text += `🛒 *Keranjang Saat Ini:*\n`;

    orderSession.items.forEach((cartItem, index) => {
        text += `${index + 1}. ${cartItem.name} x${cartItem.quantity}\n`;
        text += `   Rp ${formatNumber(cartItem.price * cartItem.quantity)}\n`;
        if (Array.isArray(cartItem.addons) && cartItem.addons.length > 0) {
            text += `${formatAddonLines(cartItem.addons)}\n`;
        }
        if (cartItem.notes) {
            text += `   📝 ${cartItem.notes}\n`;
        }
    });

    text += `\nSubtotal: Rp ${formatNumber(pricing.subtotal)}\n`;
    if (pricing.fee > 0) {
        text += `Biaya Layanan: Rp ${formatNumber(pricing.fee)}\n`;
    }
    text += `*Total: Rp ${formatNumber(pricing.total)}*\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `💡 *Lanjut?*\n`;
    text += `• Tambah item: *!order [ID] [JUMLAH]*\n`;
    text += `• Lihat keranjang: *!cart*\n`;
    text += `• Checkout: *!checkout*\n`;
    text += `• Batal pesanan: *!cancel*\n`;

    return sock.sendMessage(to, { text });
}

function completeAddonSelection({ sock, to, userId, item, quantity, addonSelections }) {
    const baseUnitPrice = computeMenuUnitPrice(item);
    const cartItem = buildCartItem(item, addonSelections, { baseUnitPrice });
    const session = orderManager.addItemToCart(userId, cartItem, quantity);
    const pricing = orderManager.calculateTotal(session.items, true);

    return sendCartSummaryMessage({
        sock,
        to,
        orderSession: session,
        pricing,
        highlightItemName: item.name,
        highlightQuantity: quantity,
        highlightAddons: addonSelections
    });
}

async function promptAddons(sock, to, userId, item, quantity, availableAddons) {
    pendingAddonSessions.set(userId, {
        userId,
        item,
        quantity,
        availableAddons,
        startedAt: Date.now()
    });

    await sock.sendMessage(to, { text: formatAddonPrompt(item, availableAddons) });
}

module.exports = {
    name: 'order',
    description: 'Mulai proses pemesanan',
    aliases: ['pesan', 'beli'],

    hasActiveSession(userId) {
        return pendingAddonSessions.has(userId);
    },

    async handleResponse(sock, msg) {
        const from = msg.key.remoteJid;
        const userId = from;
        const pending = pendingAddonSessions.get(userId);
        if (!pending) return;

        const messageText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        ).trim();

        if (/^(batal|cancel)$/i.test(messageText)) {
            pendingAddonSessions.delete(userId);
            await sock.sendMessage(from, { text: '❌ Penambahan item dibatalkan. Ketik *!order* lagi jika ingin memesan.' });
            return;
        }

        if (!messageText) {
            await sock.sendMessage(from, { text: '⚠️ Mohon kirim format add-on dengan benar, contoh: `1x2,2`. Ketik *skip* jika tidak ingin add-on.' });
            await sock.sendMessage(from, { text: formatAddonPrompt(pending.item, pending.availableAddons) });
            return;
        }

        const { selections, errors } = parseAddonSelectionInput(messageText, pending.availableAddons);

        if (errors.length > 0) {
            await sock.sendMessage(from, { text: `❌ ${errors.join('\n')}` });
            await sock.sendMessage(from, { text: formatAddonPrompt(pending.item, pending.availableAddons) });
            return;
        }

        pendingAddonSessions.delete(userId);
        await completeAddonSelection({
            sock,
            to: from,
            userId,
            item: pending.item,
            quantity: pending.quantity,
            addonSelections: selections
        });
    },

    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // Cancel any pending add-on prompts when issuing a new command
        pendingAddonSessions.delete(userId);

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

        pendingAddonSessions.delete(userId);

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

        const availableAddons = normalizeAddons(item.addons || [], { includeIndex: true });
        const addonTokens = args.slice(qtyArgIndex);
        if (availableAddons.length > 0 && addonTokens.length === 0) {
            await promptAddons(sock, from, userId, item, quantity, availableAddons);
            return;
        }

        const selectionInput = addonTokens.join(',');
        const { selections, errors } = parseAddonSelectionInput(selectionInput, availableAddons);

        if (errors.length > 0) {
            await sock.sendMessage(from, { text: `❌ ${errors.join('\n')}` });
            return;
        }

        await completeAddonSelection({
            sock,
            to: from,
            userId,
            item,
            quantity,
            addonSelections: selections
        });
    }
};