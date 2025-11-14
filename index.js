const WhatsAppBot = require('./src/bot');
const PaymentGateway = require('./src/paymentGateway');
const printerService = require('./src/services/printerService');
const config = require('./src/config/config');

/**
 * Main Entry Point
 */
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('☕ Coffee Shop WhatsApp Bot');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    try {
        // Initialize printer (if enabled in config)
        if (config.printer?.enabled) {
            printerService.init(config.printer);
        }

        // Start payment gateway dashboard
        PaymentGateway.startServer();
        
        // Start WhatsApp bot (skip when NO_BOT=1 for web-only testing)
        if (process.env.NO_BOT === '1' || (config.bot && config.bot.enabled === false)) {
            console.log('⚠️  Skipping WhatsApp bot startup (NO_BOT=1 or config.bot.enabled=false)');
            PaymentGateway.setBotInstance(null);
        } else {
            const bot = new WhatsAppBot();
            await bot.start();
            // Connect payment gateway to bot
            PaymentGateway.setBotInstance(bot);
        }

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