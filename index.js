const WhatsAppBot = require('./src/bot');
const PaymentGateway = require('./src/services/paymentGateway');

/**
 * Main Entry Point
 */
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('☕ Coffee Shop WhatsApp Bot');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    try {
        // Start payment gateway dashboard
        PaymentGateway.startServer();
        
        // Start WhatsApp bot
        const bot = new WhatsAppBot();
        await bot.start();
        
        // Connect payment gateway to bot
        PaymentGateway.setBotInstance(bot);

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