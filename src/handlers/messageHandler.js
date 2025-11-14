const commands = require('../commands');
const config = require('../config/config');
const storeState = require('../services/storeState');
const { inferIntentFromMessage } = require('../services/aiIntentRouter');

/**
 * Message Handler
 * Routes messages to appropriate command handlers
 */
async function messageHandler(sock, msg) {
    try {
        // Extract message text
        const messageText = 
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            '';

        const hasMedia = !!(
            msg.message?.imageMessage ||
            msg.message?.documentMessage ||
            msg.message?.videoMessage ||
            msg.message?.audioMessage ||
            msg.message?.stickerMessage
        );

        if (!messageText && !hasMedia) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        // Ignore group messages (optional)
        if (isGroup) return;

    // Parse command
        const args = messageText.trim().split(/\s+/);
        const commandText = args[0].toLowerCase();

        // Check if message starts with prefix (commands override interactive sessions)
        const hasPrefix = commandText.startsWith(config.bot.prefix);
        
        // Check for interactive session only if NO prefix
        // This allows users to use commands even during interactive session
        if (!hasPrefix) {
            // If store is closed, block interactive flows for non-privileged users
            const isPrivileged = (config.shop.baristaNumbers || []).includes(from) || (config.shop.adminNumbers || []).includes(from);
            if (!isPrivileged && !storeState.isOpen()) {
                await sock.sendMessage(from, { text: storeState.getClosedMessage(`Maaf, toko sedang tutup. Jam operasional: ${config.shop.openHours}`) });
                return;
            }
            // Route to any active interactive command session
            const allCommands = Object.values(commands);
            for (const cmd of allCommands) {
                if (cmd && typeof cmd.hasActiveSession === 'function') {
                    try {
                        const active = await cmd.hasActiveSession(from);
                        if (active) {
                            console.log(`[${new Date().toISOString()}] ${from}: ${messageText} [Interactive Response -> ${cmd.name}]`);
                            await cmd.handleResponse(sock, msg);
                            return;
                        }
                    } catch (_) { /* ignore */ }
                }
            }

            // No active interactive session: use AI intent router
            try {
                const menuExamples = require('../services/menuStore').getMenuItems({ available: true }).slice(0, 6).map(m => m.name);
                const { intent, params } = await inferIntentFromMessage(messageText, {
                    shopName: config.shop.name,
                    menuExamples
                });

                console.log(`[AI-INTENT] ${from}: ${messageText} -> ${intent}`);

                if (intent === 'show_menu') {
                    const menuCmd = commands['menu'];
                    if (menuCmd && typeof menuCmd.execute === 'function') {
                        await menuCmd.execute(sock, msg, []);
                        return;
                    }
                } else if (intent === 'create_order') {
                    const orderCmd = commands['order'];
                    if (orderCmd && typeof orderCmd.addItemToOrder === 'function' && Array.isArray(params.items) && params.items.length) {
                        // Map first item only for now
                        const item = params.items[0];
                        const qty = Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 ? String(item.qty) : '1';
                        const nameToken = (item.id || item.code || '').toString().trim();
                        // We expect ID menu, tapi kalau AI hanya kirim nama, user akan diarahkan ulang
                        if (nameToken) {
                            await orderCmd.addItemToOrder(sock, msg, [nameToken.toUpperCase(), qty]);
                            return;
                        }
                    }
                    // Fallback: arahkan user ke cara pakai !order
                    await sock.sendMessage(from, { text: 'Untuk pesan, kak bisa tulis: *!order KODE_MENU JUMLAH*\nContoh: *!order C001 2* untuk 2 Espresso\nKetik *!menu* dulu kalau mau lihat kode lengkap.' });
                    return;
                } else if (intent === 'check_order_status') {
                    const statusCmd = commands['status'];
                    if (statusCmd && typeof statusCmd.execute === 'function') {
                        const hint = params && params.hint ? String(params.hint) : '';
                        const argsForStatus = hint ? [hint] : [];
                        await statusCmd.execute(sock, msg, argsForStatus);
                        return;
                    }
                } else if (intent === 'help') {
                    const helpCmd = commands['help'];
                    if (helpCmd && typeof helpCmd.execute === 'function') {
                        await helpCmd.execute(sock, msg, []);
                        return;
                    }
                } else if (intent === 'smalltalk') {
                    await sock.sendMessage(from, { text: 'Sip kak 🙏 Kalau mau pesan, kak bisa ketik *!menu* dulu atau langsung *!order KODE_MENU JUMLAH*.' });
                    return;
                }
                // unknown intent: do nothing (silent) to avoid spam
            } catch (e) {
                console.error('[AI-INTENT] error:', e.message || e);
            }
            return;
        }

        // Remove prefix
        const commandName = commandText.slice(config.bot.prefix.length);
        
        // Find command
        const command = commands[commandName];

        // Gate commands when store is closed (except whitelisted)
        const allowedWhenClosed = new Set(['help','menu','status','info','store']);
        const isPrivileged = (config.shop.baristaNumbers || []).includes(from) || (config.shop.adminNumbers || []).includes(from);
        if (!isPrivileged && !storeState.isOpen() && !allowedWhenClosed.has(commandName)) {
            await sock.sendMessage(from, { text: storeState.getClosedMessage(`Maaf, toko sedang tutup. Jam operasional: ${config.shop.openHours}`) });
            return;
        }

        if (!command) {
            // Command not found
            await sock.sendMessage(from, {
                text: `❌ Command tidak ditemukan: *${commandName}*\n\nKetik *!help* untuk melihat daftar command.`
            });
            return;
        }

        // Log command execution
        console.log(`[${new Date().toISOString()}] ${from}: ${messageText}`);

        // Execute command
        await command.execute(sock, msg, args.slice(1));

    } catch (error) {
        console.error('Message handler error:', error);
        
        const from = msg.key.remoteJid;
        await sock.sendMessage(from, {
            text: `❌ Terjadi kesalahan saat memproses pesan.\n\n${error.message}\n\nSilakan coba lagi atau hubungi admin.`
        }).catch(err => console.error('Failed to send error message:', err));
    }
}

module.exports = messageHandler;