const config = require('../config/config');
const orderManager = require('../services/orderManager');
const menuStore = require('../services/menuStore');

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
        session.step = 'enter_notes';
        interactiveSessions.set(userId, session);

        let notesText = `☕ *${session.selectedItem.name}* x${quantity}\n\n`;
        notesText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        notesText += `📝 *Catatan Tambahan?*\n\n`;
        notesText += `Contoh:\n`;
        notesText += `• "Es, gula dikit, 2 shot"\n`;
        notesText += `• "Panas, tanpa gula"\n`;
        notesText += `• "Extra shot, less ice"\n`;
        notesText += `• "Coklat extra"\n\n`;
        notesText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        notesText += `💡 Ketik catatan Anda, atau *skip* jika tidak ada\n`;
        notesText += `💡 Ketik *batal* untuk keluar`;

        await sock.sendMessage(from, { text: notesText });
    },

    async handleNotesInput(sock, msg, text, session) {
        const from = msg.key.remoteJid;
        const userId = msg.key.remoteJid;

        let notes = null;
        if (text.toLowerCase() !== 'skip' && text.toLowerCase() !== '-') {
            notes = text;
        }

        // Add item to cart
        const item = { ...session.selectedItem };
        if (notes) {
            item.notes = notes;
        }

        orderManager.addItemToCart(userId, item, session.quantity);
        
        // Get current cart
        const cartSession = orderManager.getSession(userId);
        const pricing = orderManager.calculateTotal(cartSession.items, true);

        session.step = 'ask_more';
        interactiveSessions.set(userId, session);

        let responseText = `✅ *Berhasil ditambahkan!*\n\n`;
        responseText += `${session.selectedItem.name} x${session.quantity}\n`;
        if (notes) {
            responseText += `📝 ${notes}\n`;
        }
        responseText += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        responseText += `🛒 *Keranjang:*\n`;
        
        cartSession.items.forEach((item, index) => {
            responseText += `${index + 1}. ${item.name} x${item.quantity}\n`;
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
