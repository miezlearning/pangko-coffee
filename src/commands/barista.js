const orderManager = require('../services/orderManager');
const orderStore = require('../services/orderStore');
const config = require('../config/config');
const moment = require('moment-timezone');

// Localize time to Indonesian and Makassar timezone for consistent display
moment.locale('id');

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

        // Load orders from SQLite to ensure parity with the web
        const neededStatuses = [
            orderManager.STATUS.PENDING_PAYMENT,
            orderManager.STATUS.PENDING_CASH,
            orderManager.STATUS.PROCESSING,
            orderManager.STATUS.READY
        ];
        const allOrders = orderStore.getOrdersByStatuses(neededStatuses);

        const pending = allOrders.filter(o => o.status === orderManager.STATUS.PENDING_PAYMENT);
        const pendingCash = allOrders.filter(o => o.status === orderManager.STATUS.PENDING_CASH);
        const processing = allOrders.filter(o => o.status === orderManager.STATUS.PROCESSING);
        const ready = allOrders.filter(o => o.status === orderManager.STATUS.READY);

        if (processing.length === 0 && ready.length === 0 && pending.length === 0 && pendingCash.length === 0) {
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
    text += `💳 Pending QRIS: ${pending.length}\n`;
    text += `💵 Pending Cash: ${pendingCash.length}\n`;
        text += `👨‍🍳 Sedang Diproses: ${processing.length}\n`;
        text += `✅ Siap Diambil: ${ready.length}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Show pending payment orders
        if (pending.length > 0) {
            text += `💳 *MENUNGGU PEMBAYARAN (QRIS):*\n\n`;
            pending.forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   👤 Atas Nama: *${order.customerName || 'Customer'}*\n`;
                text += `   📱 ${order.userId.split('@')[0]}\n`;
                text += `   Total: Rp ${formatNumber(order.pricing.total)}\n`;
                text += `   Items: ${order.items.length} item\n`;
                const now = moment.tz('Asia/Makassar');
                const timeLeft = order.paymentExpiry ? moment.tz(order.paymentExpiry, 'Asia/Makassar').diff(now, 'minutes') : null;
                text += `   ⏰ ${timeLeft && timeLeft > 0 ? timeLeft + ' menit lagi' : 'EXPIRED'}\n\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        // Show pending cash orders
        if (pendingCash.length > 0) {
            text += `💵 *MENUNGGU PEMBAYARAN (CASH):*\n\n`;
            pendingCash.forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   👤 Atas Nama: *${order.customerName || 'Customer'}*\n`;
                text += `   📱 ${order.userId.split('@')[0]}\n`;
                text += `   Total: Rp ${formatNumber(order.pricing.total)}\n`;
                text += `   Items: ${order.items.length} item\n`;
                const now = moment.tz('Asia/Makassar');
                const timeLeft = order.cashExpiresAt ? moment.tz(order.cashExpiresAt, 'Asia/Makassar').diff(now, 'minutes') : null;
                text += `   ⏰ ${timeLeft && timeLeft > 0 ? timeLeft + ' menit lagi' : 'EXPIRED'}\n\n`;
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
                const processingTime = order.confirmedAt
                    ? moment.tz('Asia/Makassar').diff(moment.tz(order.confirmedAt, 'Asia/Makassar'), 'minutes')
                    : 0;
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
                const readyBase = order.readyAt || order.updatedAt || order.createdAt;
                const readyTime = readyBase
                    ? moment.tz('Asia/Makassar').diff(moment.tz(readyBase, 'Asia/Makassar'), 'minutes')
                    : 0;
                text += `   ⏰ ${readyTime} menit yang lalu\n\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

    text += `💡 *AKSI:*\n`;
    text += `• Detail: \`!detail [ORDER_ID]\`\n`;
    text += `• Tandai Siap (dari PROCESSING): \`!ready [ORDER_ID]\`\n`;
    text += `• Tandai Selesai (dari READY): \`!complete [ORDER_ID]\`\n`;
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
        let order = orderManager.getOrder(orderId);
        if (!order) {
            // Fallback to SQLite
            order = orderStore.getOrderById(orderId);
            if (order) {
                // hydrate in-memory for lifecycle ops
                try { orderManager.orders.set(orderId, order); } catch (_) {}
            }
        }

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

        // Load orders from SQLite for summaries + sections
        const tz = (config && config.bot && config.bot.timezone) || 'Asia/Makassar';
        const revenueStatuses = new Set(['paid','processing','ready','completed']);
        const allOrdersFull = orderStore.loadOrders() || [];
        // For sections below we still want only READY/COMPLETED
        const allOrders = allOrdersFull.filter(o => [
            orderManager.STATUS.READY,
            orderManager.STATUS.COMPLETED
        ].includes(o.status));

        // Filter today's orders by readyAt/completedAt timestamp in Makassar timezone
        const startOfDay = moment.tz(tz).startOf('day');
        const isSameDay = (ts) => ts && moment(ts).tz(tz).isSame(startOfDay, 'day');
        const readyToday = allOrders.filter(o =>
            o.status === orderManager.STATUS.READY && (
                (o.readyAt && isSameDay(o.readyAt)) || (!o.readyAt && isSameDay(o.createdAt))
            )
        );
        const completedToday = allOrders.filter(o =>
            o.status === orderManager.STATUS.COMPLETED &&
            o.completedAt && isSameDay(o.completedAt)
        );

        const totalRevenue = completedToday.reduce((sum, o) => sum + o.pricing.total, 0);
        const totalItems = completedToday.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

        // Build dashboard-like summary (match payment gateway stats)
        const todayOrders = allOrdersFull.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSame(startOfDay, 'day'));
        const todayRevenue = todayOrders
            .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const monthStart = moment.tz(tz).startOf('month');
        const monthOrders = allOrdersFull.filter(o => o.createdAt && moment(o.createdAt).tz(tz).isSameOrAfter(monthStart));
        const monthRevenue = monthOrders
            .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);
        const allTimeRevenue = allOrdersFull
            .filter(o => revenueStatuses.has((o.status || '').toLowerCase()))
            .reduce((sum, o) => sum + (o?.pricing?.total || 0), 0);

        // Method breakdown (today)
        const methodSummary = {};
        todayOrders.forEach(o => {
            const m = ((o.paymentMethod || '').toUpperCase() === 'CASH') ? 'Tunai' : 'QRIS';
            if (!methodSummary[m]) methodSummary[m] = { count: 0, sum: 0 };
            methodSummary[m].count += 1;
            if (revenueStatuses.has((o.status || '').toLowerCase())) methodSummary[m].sum += (o?.pricing?.total || 0);
        });

        // Pending QRIS count (from payment gateway store)
        let pendingCount = 0;
        try {
            const path = require('path');
            const dataStore = require(path.resolve(__dirname, '..', 'paymentGateway', 'dataStore'));
            const orderMgr = require('../services/orderManager');
            // Mirror dashboard sync logic minimally
            const pending = dataStore.getPendingPayments() || [];
            pendingCount = pending.filter(p => {
                const o = orderMgr.getOrder(p.orderId);
                return (o && o.status === orderMgr.STATUS.PENDING_PAYMENT);
            }).length;
        } catch (e) { /* ignore, best-effort */ }

        let text = `📊 *RINGKASAN PENJUALAN*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📅 ${moment.tz(tz).format('dddd, DD MMMM YYYY')}\n\n`;
        text += `🧾 Total Order Hari Ini: ${todayOrders.length}\n`;
        text += `💰 Revenue Hari Ini: Rp ${formatNumber(todayRevenue)}\n`;
        text += `💳 Pending QRIS: ${pendingCount}\n`;
        text += `📆 MTD Order: ${monthOrders.length} • MTD Revenue: Rp ${formatNumber(monthRevenue)}\n`;
        text += `📦 Total Order (All-time): ${allOrdersFull.length} • Revenue (All-time): Rp ${formatNumber(allTimeRevenue)}\n\n`;

        if (Object.keys(methodSummary).length > 0) {
            text += `📈 *Metode Hari Ini*\n`;
            Object.entries(methodSummary).forEach(([k, v]) => {
                text += `• ${k}: ${v.count} order • Rp ${formatNumber(v.sum)}\n`;
            });
            text += `\n`;
        }

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📊 *RIWAYAT HARI INI*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `✅ Selesai Hari Ini: ${completedToday.length}\n`;
        text += `🎉 Siap Diambil Hari Ini: ${readyToday.length}\n`;
        text += `☕ Total Item (Selesai): ${totalItems}\n`;
        text += `💰 Total Revenue (Selesai): Rp ${formatNumber(totalRevenue)}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Ready today section
        if (readyToday.length > 0) {
            text += `🎉 *SIAP DIAMBIL HARI INI:*\n\n`;
            readyToday.slice(0, 10).forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                const rb = order.readyAt || order.createdAt;
                text += `   ${moment(rb).tz(tz).format('HH:mm')} • `;
                text += `${order.items.length} item\n\n`;
            });
            if (readyToday.length > 10) {
                text += `... dan ${readyToday.length - 10} pesanan lainnya\n\n`;
            }
            text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        // Completed today section
        if (completedToday.length === 0) {
            text += `Belum ada pesanan selesai hari ini.`;
        } else {
            text += `✅ *PESANAN SELESAI HARI INI:*\n\n`;
            completedToday.slice(0, 10).forEach((order, index) => {
                text += `${index + 1}. *${order.orderId}*\n`;
                text += `   ${moment(order.completedAt).tz('Asia/Makassar').format('HH:mm')} • `;
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
        let order = orderManager.getOrder(orderId);
        if (!order) {
            order = orderStore.getOrderById(orderId);
            if (order) {
                try { orderManager.orders.set(orderId, order); } catch (_) {}
            }
        }

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
