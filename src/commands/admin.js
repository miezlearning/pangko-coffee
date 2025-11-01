const orderManager = require('../services/orderManager');
const config = require('../config/config');
const PaymentGateway = require('../services/paymentGateway');

/**
 * Admin Commands - For Testing & Management
 * Only accessible by admin numbers
 */

// Simulate payment command (for testing webhook)
const simulatePaymentCommand = {
    name: 'simulate',
    description: '[ADMIN] Simulate payment webhook for testing',
    aliases: ['sim', 'test-payment'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // Check if sender is admin
        if (!isAdmin(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk admin.`
            });
            return;
        }

        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: `🧪 *Simulate Payment*\n\n` +
                      `Format: \`!simulate [ORDER_ID] [status]\`\n\n` +
                      `Status options:\n` +
                      `• success - Pembayaran berhasil\n` +
                      `• failed - Pembayaran gagal\n` +
                      `• expired - Pembayaran expired\n\n` +
                      `Contoh:\n` +
                      `\`!simulate CF123456 success\`\n\n` +
                      `💡 Ini akan mensimulasikan webhook payment gateway`
            });
            return;
        }

        const orderId = args[0].toUpperCase();
        const status = args[1] ? args[1].toLowerCase() : 'success';
        const order = orderManager.getOrder(orderId);

        if (!order) {
            await sock.sendMessage(from, {
                text: `❌ Order tidak ditemukan!`
            });
            return;
        }

        try {
            // Simulate webhook call
            const webhookUrl = 'http://localhost:3000/api/webhook/simulate';
            const fetch = (await import('node-fetch')).default;
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    status: status,
                    amount: order.pricing.total,
                    provider: 'simulator',
                    paymentMethod: 'QRIS',
                    timestamp: new Date().toISOString()
                })
            });

            const result = await response.json();

            if (result.success) {
                await sock.sendMessage(from, {
                    text: `✅ *Webhook Simulation Success!*\n\n` +
                          `Order: ${orderId}\n` +
                          `Status: ${status}\n` +
                          `Amount: Rp ${formatNumber(order.pricing.total)}\n\n` +
                          `🎉 Customer & barista sudah dinotifikasi!`
                });
            } else {
                await sock.sendMessage(from, {
                    text: `❌ Simulation failed:\n\n${result.message}`
                });
            }
        } catch (error) {
            console.error('Simulate payment error:', error);
            await sock.sendMessage(from, {
                text: `❌ Error: ${error.message}`
            });
        }
    }
};

// List all orders command
const listOrdersCommand = {
    name: 'orders',
    description: '[ADMIN] List all orders',
    aliases: ['listorders', 'allorders'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isAdmin(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk admin.`
            });
            return;
        }

        const orders = orderManager.orders.keys();
        const orderList = [];
        
        for (const orderId of orders) {
            const order = orderManager.getOrder(orderId);
            if (order) orderList.push(order);
        }

        if (orderList.length === 0) {
            await sock.sendMessage(from, {
                text: `📋 *All Orders*\n\n` +
                      `Tidak ada order saat ini.`
            });
            return;
        }

        // Sort by date
        orderList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Group by status
        const pending = orderList.filter(o => o.status === orderManager.STATUS.PENDING_PAYMENT);
        const processing = orderList.filter(o => o.status === orderManager.STATUS.PROCESSING);
        const ready = orderList.filter(o => o.status === orderManager.STATUS.READY);
        const completed = orderList.filter(o => o.status === orderManager.STATUS.COMPLETED);

        let text = `📋 *All Orders Summary*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `⏳ Pending Payment: ${pending.length}\n`;
        text += `👨‍🍳 Processing: ${processing.length}\n`;
        text += `✅ Ready: ${ready.length}\n`;
        text += `🎉 Completed: ${completed.length}\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (pending.length > 0) {
            text += `*⏳ PENDING PAYMENT:*\n`;
            pending.slice(0, 5).forEach(o => {
                text += `• ${o.orderId} - Rp ${formatNumber(o.pricing.total)}\n`;
                text += `  Customer: ${o.userId.split('@')[0]}\n`;
            });
            text += `\n`;
        }

        if (processing.length > 0) {
            text += `*👨‍🍳 PROCESSING:*\n`;
            processing.slice(0, 5).forEach(o => {
                text += `• ${o.orderId} - Rp ${formatNumber(o.pricing.total)}\n`;
                text += `  Customer: ${o.userId.split('@')[0]}\n`;
            });
            text += `\n`;
        }

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `💡 Use \`!status [ORDER_ID]\` for details`;

        await sock.sendMessage(from, { text });
    }
};

// Dashboard link command
const dashboardCommand = {
    name: 'dashboard',
    description: '[ADMIN] Get payment gateway dashboard link',
    aliases: ['link', 'gateway'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isAdmin(from) && !isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk admin/barista.`
            });
            return;
        }

        let text = `💳 *Payment Gateway Dashboard*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `🖥️ Main Dashboard:\n`;
        text += `http://localhost:3000\n\n`;
        text += `🧪 Webhook Tester:\n`;
        text += `http://localhost:3000/webhook-tester\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*Features:*\n`;
        text += `✅ Real-time monitoring\n`;
        text += `✅ One-click confirmation\n`;
        text += `✅ Auto-notification to customer & barista\n`;
        text += `✅ Sound alerts for new payments\n`;
        text += `✅ Webhook simulator for testing\n\n`;
        text += `💡 Buka link di browser untuk akses dashboard`;

        await sock.sendMessage(from, { text });
    }
};

// Help for admin commands
const adminHelpCommand = {
    name: 'admin-help',
    description: '[ADMIN] Show admin commands',
    aliases: ['adminhelp', 'adm'],
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        if (!isAdmin(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk admin.`
            });
            return;
        }

        let text = `👑 *Admin Commands*\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `🧪 *TESTING:*\n`;
        text += `• \`!simulate [ORDER_ID] [status]\`\n`;
        text += `  Simulate payment webhook\n\n`;
        text += `📊 *MONITORING:*\n`;
        text += `• \`!orders\` - List all orders\n`;
        text += `• \`!dashboard\` - Get dashboard link\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*Example Usage:*\n\n`;
        text += `1. Customer checkout → Order CF123456\n`;
        text += `2. Admin test payment:\n`;
        text += `   \`!simulate CF123456 success\`\n`;
        text += `3. Bot auto-notify customer & barista\n`;
        text += `4. Barista marks ready:\n`;
        text += `   \`!ready CF123456\`\n\n`;
        text += `💡 Open dashboard for GUI interface`;

        await sock.sendMessage(from, { text });
    }
};

// Helper functions
function isAdmin(jid) {
    return config.shop.adminNumbers.includes(jid);
}

function isBarista(jid) {
    return config.shop.baristaNumbers.includes(jid) || isAdmin(jid);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

module.exports = {
    simulate: simulatePaymentCommand,
    orders: listOrdersCommand,
    dashboard: dashboardCommand,
    'admin-help': adminHelpCommand
};
