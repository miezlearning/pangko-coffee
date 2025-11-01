const commands = require('../commands');
const config = require('../config/config');

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
        // if (isGroup) return;

        // Parse command
        const args = messageText.trim().split(/\s+/);
        const commandText = args[0].toLowerCase();

        // Check for interactive session first (before prefix check)
        // This allows commands like orderInteractive to handle non-prefixed responses
        const interactiveCommand = commands['pesan']; // orderInteractive command
        if (interactiveCommand && interactiveCommand.hasActiveSession) {
            const hasSession = await interactiveCommand.hasActiveSession(from);
            if (hasSession) {
                console.log(`[${new Date().toISOString()}] ${from}: ${messageText} [Interactive Response]`);
                await interactiveCommand.handleResponse(sock, msg);
                return;
            }
        }

        // Check if message starts with prefix
        if (!commandText.startsWith(config.bot.prefix)) {
            // Handle non-command messages (optional)
            return;
        }

        // Remove prefix
        const commandName = commandText.slice(config.bot.prefix.length);
        
        // Find command
        const command = commands[commandName];

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