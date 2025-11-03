const commands = require('../commands');
const config = require('../config/config');
const storeState = require('../services/storeState');

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

        if (!messageText) return;

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