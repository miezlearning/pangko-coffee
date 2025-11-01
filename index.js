const WhatsAppBot = require('./src/bot');

/**
 * Main Entry Point
 */
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('☕ Coffee Shop WhatsApp Bot');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    try {
        const bot = new WhatsAppBot();
        await bot.start();

        // Handle process termination
        process.on('SIGINT', () => {
            console.log('\n👋 Shutting down bot...');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n👋 Shutting down bot...');
            process.exit(0);
        });

        // Keep process alive
        process.stdin.resume();

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Start the bot
main();