const orderManager = require('../services/orderManager');
const config = require('../config/config');
const moment = require('moment-timezone');

/**
 * Barista Commands - For Barista/Kasir Operations
 */

// Queue command - View all pending orders
const queueCommand = {
    name: 'queue',
    description: '[BARISTA] Lihat antrian pesanan',
    aliases: ['antrian', 'list-orders'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // Check if sender is barista or admin
        if (!isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/kasir.`
            });
            return;
        }

        // Get all processing and ready orders
        const allOrders = [];
        for (const orderId of orderManager.orders.keys()) {
            const order = orderManager.getOrder(orderId);
            if (order) allOrders.push(order);
        }

        const pending = allOrders.filter(o => o.status === orderManager.STATUS.PENDING_PAYMENT);
        const processing = allOrders.filter(o => o.status === orderManager.STATUS.PROCESSING);
        const ready = allOrders.filter(o => o.status === orderManager.STATUS.READY);

        if (processing.length === 0 && ready.length === 0 && pending.length === 0) {
            await sock.sendMessage(from, {
                text: `📋 *ANTRIAN PESANAN*\n\n` +
                      `🎉 Tidak ada pesanan aktif!\n\n` +
                      `Semua pesanan sudah selesai diproses.`
            });
            return;
        }

        let text = `📋 *ANTRIAN PESANAN*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Show summary
        text += `📊 *RINGKASAN:*\n`;
        text += `⏳ Pending Payment: ${pending.length}\n`;
        text += `👨‍🍳 Sedang Diproses: ${processing.length}\n`;
        text += `✅ Siap Diambil: ${ready.length}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Show pending payment orders
        if (pending.length > 0) {
            text += `⏳ *MENUNGGU PEMBAYARAN:*\n\n`;
            pending.forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   👤 Atas Nama: *${order.customerName || 'Customer'}*\n`;
                text += `   📱 ${order.userId.split('@')[0]}\n`;
                text += `   Total: Rp ${formatNumber(order.pricing.total)}\n`;
                text += `   Items: ${order.items.length} item\n`;
                const timeLeft = moment(order.paymentExpiry).diff(moment(), 'minutes');
                text += `   ⏰ ${timeLeft > 0 ? timeLeft + ' menit lagi' : 'EXPIRED'}\n\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        // Show processing orders (PRIORITAS!)
        if (processing.length > 0) {
            text += `👨‍🍳 *SEDANG DIPROSES:*\n\n`;
            processing.forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}* 🔥\n`;
                text += `   👤 Atas Nama: *${order.customerName || 'Customer'}*\n`;
                text += `   📱 ${order.userId.split('@')[0]}\n`;
                text += `   Items:\n`;
                order.items.forEach(item => {
                    text += `   • ${item.name} x${item.quantity}\n`;
                    if (item.notes) {
                        text += `     📝 ${item.notes}\n`;
                    }
                });
                if (order.notes) {
                    text += `   📝 Catatan: ${order.notes}\n`;
                }
                const processingTime = moment().diff(moment(order.confirmedAt), 'minutes');
                text += `   ⏱️ ${processingTime} menit yang lalu\n`;
                text += `   💰 Total: Rp ${formatNumber(order.pricing.total)}\n\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        // Show ready orders
        if (ready.length > 0) {
            text += `✅ *SIAP DIAMBIL:*\n\n`;
            ready.forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   👤 Atas Nama: *${order.customerName || 'Customer'}*\n`;
                text += `   📱 ${order.userId.split('@')[0]}\n`;
                text += `   Items: ${order.items.length} item\n`;
                const readyTime = moment().diff(moment(order.readyAt), 'minutes');
                text += `   ⏰ ${readyTime} menit yang lalu\n\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        text += `💡 *AKSI:*\n`;
        text += `• Detail: \`!detail [ORDER_ID]\`\n`;
        text += `• Selesai: \`!ready [ORDER_ID]\`\n`;
        text += `• Cancel: \`!cancel-order [ORDER_ID]\``;

        await sock.sendMessage(from, { text });
    }
};

// Detail order command - View detailed order info
const detailCommand = {
    name: 'detail',
    description: '[BARISTA] Lihat detail pesanan',
    aliases: ['info-order', 'detail-order'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/kasir.`
            });
            return;
        }

        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!detail [ORDER_ID]*\nContoh: *!detail CF123456*`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const order = orderManager.getOrder(orderId);

        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!`
            });
            return;
        }

        let text = `📋 *DETAIL PESANAN*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `Order ID: *${order.orderId}*\n`;
        text += `Status: ${orderManager.getStatusEmoji(order.status)} ${order.status}\n\n`;
        
        text += `👤 *CUSTOMER:*\n`;
        text += `Atas Nama: *${order.customerName || 'Customer'}*\n`;
        text += `Nomor: ${order.userId.split('@')[0]}\n\n`;
        
        text += `📦 *ITEMS:*\n`;
        order.items.forEach((item, index) => {
            text += `${index + 1}. *${item.name}* x${item.quantity}\n`;
            text += `   Rp ${formatNumber(item.price)} x ${item.quantity} = Rp ${formatNumber(item.price * item.quantity)}\n`;
            if (item.notes) {
                text += `   📝 *Catatan:* ${item.notes}\n`;
            }
            text += `\n`;
        });
        
        if (order.notes) {
            text += `📝 *CATATAN PESANAN:*\n`;
            text += `${order.notes}\n\n`;
        }
        
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💰 *PEMBAYARAN:*\n`;
        text += `Subtotal: Rp ${formatNumber(order.pricing.subtotal)}\n`;
        if (order.pricing.fee > 0) {
            text += `Biaya Layanan: Rp ${formatNumber(order.pricing.fee)}\n`;
        }
        text += `*TOTAL: Rp ${formatNumber(order.pricing.total)}*\n\n`;
        
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `⏰ *TIMELINE:*\n`;
        text += `Dibuat: ${moment(order.createdAt).format('DD/MM/YY HH:mm')}\n`;
        
        if (order.confirmedAt) {
            text += `Dibayar: ${moment(order.confirmedAt).format('DD/MM/YY HH:mm')}\n`;
            const processingTime = moment().diff(moment(order.confirmedAt), 'minutes');
            text += `Durasi proses: ${processingTime} menit\n`;
        }
        
        if (order.readyAt) {
            text += `Siap: ${moment(order.readyAt).format('DD/MM/YY HH:mm')}\n`;
        }
        
        text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (order.status === orderManager.STATUS.PROCESSING) {
            text += `💡 Ketik \`!ready ${order.orderId}\` jika sudah selesai`;
        } else if (order.status === orderManager.STATUS.READY) {
            text += `✅ Pesanan siap diambil customer`;
        }

        await sock.sendMessage(from, { text });
    }
};

// History command - View completed orders
const historyCommand = {
    name: 'history',
    description: '[BARISTA] Lihat riwayat pesanan hari ini',
    aliases: ['riwayat', 'today'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/kasir.`
            });
            return;
        }

        // Get all orders
        const allOrders = [];
        for (const orderId of orderManager.orders.keys()) {
            const order = orderManager.getOrder(orderId);
            if (order) allOrders.push(order);
        }

        // Filter today's completed orders
        const today = moment().startOf('day');
        const completedToday = allOrders.filter(o => 
            o.status === orderManager.STATUS.COMPLETED &&
            moment(o.completedAt).isAfter(today)
        );

        const totalRevenue = completedToday.reduce((sum, o) => sum + o.pricing.total, 0);
        const totalItems = completedToday.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

        let text = `📊 *RIWAYAT HARI INI*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📅 ${moment().format('dddd, DD MMMM YYYY')}\n\n`;
        text += `📦 Total Pesanan: ${completedToday.length}\n`;
        text += `☕ Total Item: ${totalItems}\n`;
        text += `💰 Total Revenue: Rp ${formatNumber(totalRevenue)}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (completedToday.length === 0) {
            text += `Belum ada pesanan selesai hari ini.`;
        } else {
            text += `*PESANAN SELESAI:*\n\n`;
            completedToday.slice(0, 10).forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   ${moment(order.completedAt).format('HH:mm')} • `;
                text += `Rp ${formatNumber(order.pricing.total)}\n`;
                text += `   ${order.items.length} item\n\n`;
            });

            if (completedToday.length > 10) {
                text += `... dan ${completedToday.length - 10} pesanan lainnya\n\n`;
            }
        }

        await sock.sendMessage(from, { text });
    }
};

// Cancel order command (barista)
const cancelOrderCommand = {
    name: 'cancel-order',
    description: '[BARISTA] Batalkan pesanan',
    aliases: ['batal-order'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/kasir.`
            });
            return;
        }

        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ Format salah!\n\nGunakan: *!cancel-order [ORDER_ID] [alasan]*\nContoh: *!cancel-order CF123456 Stok habis*`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const reason = args.slice(1).join(' ') || 'Dibatalkan oleh barista';
        const order = orderManager.getOrder(orderId);

        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!`
            });
            return;
        }

        // Update status to cancelled
        orderManager.updateOrderStatus(orderId, orderManager.STATUS.CANCELLED, {
            cancelledBy: 'barista',
            cancelledAt: new Date(),
            cancelReason: reason
        });

        // Notify barista
        await sock.sendMessage(from, {
            text: `✅ Order ${orderId} berhasil dibatalkan.\n\nAlasan: ${reason}`
        });

        // Notify customer
        await sock.sendMessage(order.userId, {
            text: `❌ *PESANAN DIBATALKAN*\n\n` +
                  `Order ID: ${orderId}\n\n` +
                  `Mohon maaf, pesanan Anda dibatalkan oleh barista.\n\n` +
                  `Alasan: ${reason}\n\n` +
                  `Untuk bantuan lebih lanjut, hubungi: ${config.shop.contact}`
        });
    }
};

// Helper functions
function isBarista(jid) {
    return config.shop.baristaNumbers.includes(jid) || 
           config.shop.adminNumbers.includes(jid);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

module.exports = {
    queue: queueCommand,
    detail: detailCommand,
    history: historyCommand,
    'cancel-order': cancelOrderCommand
};
