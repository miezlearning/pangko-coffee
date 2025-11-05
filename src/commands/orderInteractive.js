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
        .map((addon, idx) => ({
            id: addon.id,
            name: addon.name,
            unitPrice: Number(addon.price || 0),
            minQuantity: Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0,
            maxQuantity: Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : null,
            defaultQuantity: Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : null,
            isRequired: !!addon.isRequired,
            index: idx + 1
        }));
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

function formatAddonLines(addons) {
    if (!Array.isArray(addons) || addons.length === 0) return '';
    return addons
        .map(addon => `   ➕ ${addon.name} x${addon.quantity} (Rp ${formatNumber((addon.unitPrice || addon.price || 0) * addon.quantity)})`)
        .join('\n');
}

function describeAddonOption(addon) {
    const pricePart = `Rp ${formatNumber(addon.unitPrice)}`;
    const min = addon.minQuantity || 0;
    const max = addon.maxQuantity;
    const requirements = [];
    if (addon.isRequired && min > 0) requirements.push(`min ${min}`);
    else if (min > 0) requirements.push(`min ${min}`);
    if (max !== null && max !== undefined) requirements.push(`maks ${max}`);
    const reqText = requirements.length ? ` (${requirements.join(', ')})` : '';
    return `${addon.index}. ${addon.name} – ${pricePart}${reqText}`;
}

function parseAddonSelectionInput(text, availableAddons) {
    if (!availableAddons.length) {
        return { selections: [], errors: [] };
    }

    const lowerText = text.trim().toLowerCase();
    const skipKeywords = ['skip', 'tidak', 'ga', 'nggak', 'gak', 'no', '-'];
    const isSkip = skipKeywords.includes(lowerText);

    const tokens = isSkip ? [] : text.split(/[\,\n]/).map(t => t.trim()).filter(Boolean);
    const addonById = new Map();
    const addonByIndex = new Map();
    availableAddons.forEach(addon => {
        addonById.set(addon.id.toLowerCase(), addon);
        addonByIndex.set(addon.index, addon);
    });

    const quantities = new Map();
    const errors = [];

    tokens.forEach(token => {
        if (!token) return;
        let keyPart = token;
        let qtyPart = null;
        const operatorMatch = token.match(/[:=x]/i);
        if (operatorMatch) {
            const [k, q] = token.split(operatorMatch[0]);
            keyPart = k.trim();
            qtyPart = q.trim();
        }

        let addon = null;
        if (/^\d+$/.test(keyPart)) {
            addon = addonByIndex.get(Number(keyPart));
        } else {
            addon = addonById.get(keyPart.toLowerCase());
        }

        if (!addon) {
            errors.push(`Add-on '${token}' tidak dikenali`);
            return;
        }

        let qty = qtyPart !== null && qtyPart !== undefined && qtyPart !== '' ? Number(qtyPart) : null;
        if (qty === null || Number.isNaN(qty)) {
            qty = addon.minQuantity > 0 ? addon.minQuantity : 1;
        }
        if (qty < 0) {
            errors.push(`Jumlah untuk ${addon.name} tidak boleh negatif`);
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
            errors.push(`${addon.name} minimal ${addon.minQuantity}`);
            return;
        }
        if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity) {
            errors.push(`${addon.name} maksimal ${addon.maxQuantity}`);
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

    return { selections, errors };
}

async function promptAddons(sock, to, session) {
    let addonText = `🍧 *Add-on untuk ${session.selectedItem.name}*\n\n`;
    session.availableAddons.forEach(addon => {
        addonText += `• ${describeAddonOption(addon)}\n`;
    });
    addonText += `\nBalas dengan nomor add-on dan jumlah. Contoh: \`1x2,2\` (Extra Shot 2x dan Caramel 1x).\n`;
    addonText += `Ketik *skip* jika tidak ingin menambah add-on.`;

    await sock.sendMessage(to, { text: addonText });
}

async function promptNotes(sock, to, session) {
    const baseUnitPrice = computeMenuUnitPrice(session.selectedItem);
    const addonSelections = Array.isArray(session.selectedAddons) ? session.selectedAddons : [];
    const addonsTotal = addonSelections.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);

    let notesText = `☕ *${session.selectedItem.name}* x${session.quantity}\n`;
    notesText += `Harga per item: Rp ${formatNumber(baseUnitPrice + addonsTotal)}\n`;
    if (addonSelections.length > 0) {
        notesText += `${formatAddonLines(addonSelections)}\n`;
    }
    notesText += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    notesText += `📝 *Catatan Tambahan?*\n\n`;
    notesText += `Contoh:\n`;
    notesText += `• "Es, gula dikit, 2 shot"\n`;
    notesText += `• "Panas, tanpa gula"\n`;
    notesText += `• "Extra shot, less ice"\n`;
    notesText += `• "Coklat extra"\n\n`;
    notesText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    notesText += `💡 Ketik catatan Anda, atau *skip* jika tidak ada\n`;
    notesText += `💡 Ketik *batal* untuk keluar`;

    await sock.sendMessage(to, { text: notesText });
}

/**
 * Interactive Order System
 * User-friendly order dengan conversational flow
 */

// State management untuk interactive session
const interactiveSessions = new Map();

module.exports = {
    name: 'pesan',
    description: 'Pesan dengan cara interaktif (tanya jawab)',
    aliases: ['ordernow', 'buatpesanan'],
    
    // Helper for messageHandler to check active session
    hasActiveSession(userId) {
        return interactiveSessions.has(userId);
    },
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // Jika sedang ada session aktif, proses response
        if (interactiveSessions.has(userId)) {
            return this.handleResponse(sock, msg);
        }

        // Start new interactive session
        interactiveSessions.set(userId, {
            step: 'select_category',
            startTime: Date.now()
        });

        let text = `🛒 *Pesan Sekarang*\n\n`;
        text += `Pilih kategori yang Anda inginkan:\n\n`;
        text += `1️⃣ ☕ Kopi\n`;
        text += `2️⃣ 🥤 Non-Kopi\n`;
        text += `3️⃣ 🍰 Makanan\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 Ketik angka (1, 2, atau 3) untuk memilih\n`;
        text += `💡 Ketik *batal* untuk membatalkan\n`;
        text += `💡 Atau gunakan command lain (!menu, !cart, dll)`;

        await sock.sendMessage(from, { text });
    },

    async handleResponse(sock, msg) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;
        const messageText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        ).trim();

        // Check for cancel/exit keywords
        const cancelKeywords = ['batal', 'cancel', 'exit', 'keluar', 'stop'];
        if (cancelKeywords.includes(messageText.toLowerCase())) {
            interactiveSessions.delete(userId);
            await sock.sendMessage(from, {
                text: `❌ *Sesi Dibatalkan*\n\n` +
                      `Pesanan interaktif dibatalkan.\n\n` +
                      `💡 Ketik *!pesan* untuk mulai lagi\n` +
                      `💡 Atau ketik *!help* untuk command lain`
            });
            return;
        }

        const session = interactiveSessions.get(userId);
        if (!session) return;

        // Check for cancel
        if (messageText.toLowerCase() === 'batal' || messageText.toLowerCase() === 'cancel') {
            interactiveSessions.delete(userId);
            await sock.sendMessage(from, {
                text: `❌ Pesanan dibatalkan.\n\nKetik *!pesan* untuk mulai lagi.`
            });
            return;
        }

        // Handle different steps
        switch (session.step) {
            case 'select_category':
                await this.handleCategorySelection(sock, msg, messageText, session);
                break;
            
            case 'select_item':
                await this.handleItemSelection(sock, msg, messageText, session);
                break;
            
            case 'enter_quantity':
                await this.handleQuantityInput(sock, msg, messageText, session);
                break;

            case 'select_addons':
                await this.handleAddonsInput(sock, msg, session, messageText);
                break;
            
            case 'enter_notes':
                await this.handleNotesInput(sock, msg, messageText, session);
                break;
            
            case 'ask_more':
                await this.handleMoreItems(sock, msg, messageText, session);
                break;
        }
    },

    async handleCategorySelection(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        let categoryKey;
        if (text === '1' || text.toLowerCase().includes('kopi')) {
            categoryKey = 'coffee';
        } else if (text === '2' || text.toLowerCase().includes('non')) {
            categoryKey = 'nonCoffee';
        } else if (text === '3' || text.toLowerCase().includes('makan')) {
            categoryKey = 'food';
        } else {
            await sock.sendMessage(from, {
                text: `❌ Pilihan tidak valid!\n\nSilakan ketik: 1, 2, atau 3`
            });
            return;
        }

        session.category = categoryKey;
        session.step = 'select_item';
        interactiveSessions.set(userId, session);

        // Show items in category from database
        const items = menuStore.getMenuItems({ 
            category: categoryKey, 
            available: true 
        });

        const category = menuStore.getCategoryById(categoryKey);
        const categoryName = category ? category.name : 'Menu';
        const categoryEmoji = category ? category.emoji : '📋';
        
        let responseText = `${categoryEmoji} *${categoryName}*\n\n`;
        responseText += `Pilih menu:\n\n`;
        
        items.forEach((item, index) => {
            responseText += `${index + 1}. *${item.name}*\n`;
            responseText += `   Rp ${this.formatNumber(item.price)}\n`;
            if (item.description) {
                responseText += `   ${item.description}\n`;
            }
            responseText += `   ID: ${item.id}\n\n`;
        });
        
        responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        responseText += `💡 Ketik angka atau ID menu\n`;
        responseText += `💡 Contoh: 1 atau C001\n`;
        responseText += `💡 Ketik *batal* untuk keluar`;

        await sock.sendMessage(from, { text: responseText });
    },

    async handleItemSelection(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        // Get items in selected category from database
        const items = menuStore.getMenuItems({ 
            category: session.category, 
            available: true 
        });

        let selectedItem;

        // Check if input is number (index)
        const index = parseInt(text);
        if (!isNaN(index) && index > 0 && index <= items.length) {
            selectedItem = items[index - 1];
        } else {
            // Check if input is item ID
            selectedItem = items.find(item => item.id.toUpperCase() === text.toUpperCase());
        }

        if (!selectedItem) {
            await sock.sendMessage(from, {
                text: `❌ Item tidak ditemukan!\n\nSilakan pilih angka 1-${items.length} atau ID menu.`
            });
            return;
        }

        session.selectedItem = selectedItem;
        session.step = 'enter_quantity';
        interactiveSessions.set(userId, session);

        await sock.sendMessage(from, {
            text: `✅ *${selectedItem.name}*\n` +
                  `Harga: Rp ${this.formatNumber(selectedItem.price)}\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `Berapa jumlahnya? (1-${config.order.maxItemsPerOrder})\n\n` +
                  `💡 Ketik angka (contoh: 2)\n` +
                  `💡 Ketik *batal* untuk keluar`
        });
    },

    async handleQuantityInput(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        const quantity = parseInt(text);

        if (isNaN(quantity) || quantity < 1 || quantity > config.order.maxItemsPerOrder) {
            await sock.sendMessage(from, {
                text: `❌ Jumlah tidak valid!\n\nSilakan masukkan angka 1-${config.order.maxItemsPerOrder}`
            });
            return;
        }

        session.quantity = quantity;
        session.availableAddons = normalizeAddons(session.selectedItem.addons || []);
        session.selectedAddons = [];

        if (session.availableAddons.length > 0) {
            session.step = 'select_addons';
            interactiveSessions.set(userId, session);
            await promptAddons(sock, from, session);
        } else {
            session.step = 'enter_notes';
            interactiveSessions.set(userId, session);
            await promptNotes(sock, from, session);
        }
    },

    async handleAddonsInput(sock, msg, session, messageText) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;
        const { selections, errors } = parseAddonSelectionInput(messageText, session.availableAddons || []);

        if (errors.length > 0) {
            await sock.sendMessage(from, { text: `❌ ${errors.join('\n')}` });
            await promptAddons(sock, from, session);
            return;
        }

        session.selectedAddons = selections;
        session.step = 'enter_notes';
        interactiveSessions.set(userId, session);
        await promptNotes(sock, from, session);
    },

    async handleNotesInput(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        let notes = null;
        if (text.toLowerCase() !== 'skip' && text.toLowerCase() !== '-') {
            notes = text;
        }

        const baseUnitPrice = computeMenuUnitPrice(session.selectedItem);
        const addonSelections = Array.isArray(session.selectedAddons) ? session.selectedAddons.map(addon => ({ ...addon })) : [];
        const cartItem = buildCartItem(session.selectedItem, baseUnitPrice, addonSelections);
        if (notes) {
            cartItem.notes = notes;
        }

        orderManager.addItemToCart(userId, cartItem, session.quantity);
        
        // Get current cart
        const cartSession = orderManager.getSession(userId);
        const pricing = orderManager.calculateTotal(cartSession.items, true);

        session.step = 'ask_more';
    session.selectedItem = null;
    session.availableAddons = [];
    session.selectedAddons = [];
    session.quantity = null;
        interactiveSessions.set(userId, session);

        let responseText = `✅ *Berhasil ditambahkan!*\n\n`;
        responseText += `${session.selectedItem.name} x${session.quantity}\n`;
        if (addonSelections.length > 0) {
            responseText += `${formatAddonLines(addonSelections)}\n`;
        }
        if (notes) {
            responseText += `📝 ${notes}\n`;
        }
        responseText += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        responseText += `🛒 *Keranjang:*\n`;
        
        cartSession.items.forEach((item, index) => {
            responseText += `${index + 1}. ${item.name} x${item.quantity}\n`;
            if (Array.isArray(item.addons) && item.addons.length > 0) {
                responseText += `${formatAddonLines(item.addons)}\n`;
            }
            if (item.notes) {
                responseText += `   📝 ${item.notes}\n`;
            }
        });
        
        responseText += `\n*Total: Rp ${this.formatNumber(pricing.total)}*\n\n`;
        responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        responseText += `Mau pesan lagi?\n\n`;
        responseText += `1️⃣ Ya, pesan lagi\n`;
        responseText += `2️⃣ Tidak, checkout\n\n`;
        responseText += `💡 Ketik angka 1 atau 2`;

        await sock.sendMessage(from, { text: responseText });
    },

    async handleMoreItems(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        if (text === '1' || text.toLowerCase().includes('ya')) {
            // Reset to category selection
            session.step = 'select_category';
            interactiveSessions.set(userId, session);

            let responseText = `🛒 *Pilih Kategori Lagi*\n\n`;
            responseText += `1️⃣ ☕ Kopi\n`;
            responseText += `2️⃣ 🥤 Non-Kopi\n`;
            responseText += `3️⃣ 🍰 Makanan\n\n`;
            responseText += `💡 Ketik angka untuk memilih`;

            await sock.sendMessage(from, { text: responseText });
        } else if (text === '2' || text.toLowerCase().includes('tidak') || text.toLowerCase().includes('checkout')) {
            // Clear interactive session
            interactiveSessions.delete(userId);

            // Show checkout prompt
            const cartSession = orderManager.getSession(userId);
            const pricing = orderManager.calculateTotal(cartSession.items, true);

            let responseText = `✅ *Siap untuk Checkout!*\n\n`;
            responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            responseText += `🛒 *Pesanan Anda:*\n`;
            
            cartSession.items.forEach((item, index) => {
                responseText += `${index + 1}. ${item.name} x${item.quantity}\n`;
                responseText += `   Rp ${this.formatNumber(item.price * item.quantity)}\n`;
                if (Array.isArray(item.addons) && item.addons.length > 0) {
                    responseText += `${formatAddonLines(item.addons)}\n`;
                }
                if (item.notes) {
                    responseText += `   📝 ${item.notes}\n`;
                }
                responseText += `\n`;
            });
            
            responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            responseText += `Subtotal: Rp ${this.formatNumber(pricing.subtotal)}\n`;
            if (pricing.fee > 0) {
                responseText += `Biaya Layanan: Rp ${this.formatNumber(pricing.fee)}\n`;
            }
            responseText += `*TOTAL: Rp ${this.formatNumber(pricing.total)}*\n\n`;
            responseText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            responseText += `💡 Ketik *!co atau !checkout* untuk lanjut pembayaran\n`;
            responseText += `💡 Ketik *!cart* untuk edit keranjang`;

            await sock.sendMessage(from, { text: responseText });
        } else {
            await sock.sendMessage(from, {
                text: `❌ Pilihan tidak valid!\n\nKetik 1 (pesan lagi) atau 2 (checkout)`
            });
        }
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
};

// Clean up old sessions (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of interactiveSessions.entries()) {
        if (now - session.startTime > 600000) { // 10 minutes
            interactiveSessions.delete(userId);
        }
    }
}, 600000);
