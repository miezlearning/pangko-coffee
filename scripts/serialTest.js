const { SerialPort } = require('serialport');
const config = require('../src/config/config');

const portName = config.printer.serialPort;
const baudRate = parseInt(config.printer.baudRate, 10) || 9600;

if (!portName) {
    console.error('❌ Serial port (e.g., COM10) is not defined in src/config/config.js');
    process.exit(1);
}

console.log(`Attempting to open port ${portName} at ${baudRate} baud...`);

const port = new SerialPort({
    path: portName,
    baudRate: baudRate,
    autoOpen: false, // We will open it manually to catch errors
});

// Event listener for errors
port.on('error', (err) => {
    console.error('❌ A critical serial port error occurred:', err.message);
    console.log('This might be a permission issue or the device is not connected properly.');
});

// Manually open the port
port.open((err) => {
    if (err) {
        console.error(`❌ Failed to open port: ${err.message}`);
        console.log('\nPossible causes:');
        console.log('1. The printer is turned off or not paired via Bluetooth.');
        console.log('2. Another program is using COM10.');
        console.log('3. The COM port is invalid. Try removing and re-adding it in Bluetooth settings.');
        process.exit(1);
    }
});

// Event listener for when the port is successfully opened
port.on('open', () => {
    console.log('✅ Port opened successfully!');
    console.log('Sending a simple test string...');
    
    // Send a simple text string followed by a newline and a cut command (GS V 1)
    const textToPrint = 'Hello, this is a direct serial test.\n\n';
    const cutCommand = Buffer.from([0x1D, 0x56, 1]); // ESC/POS command for a full cut

    port.write(textToPrint, (writeErr) => {
        if (writeErr) {
            console.error('❌ Error writing text to port:', writeErr.message);
            port.close();
            return;
        }
        
        console.log('Text sent. Now sending cut command...');
        
        port.write(cutCommand, (cutErr) => {
            if (cutErr) {
                console.error('❌ Error writing cut command to port:', cutErr.message);
            } else {
                console.log('✅ All data sent successfully. Check the printer.');
            }
            
            // Close the port after writing
            port.close(closeErr => {
                if (closeErr) {
                    console.error('❌ Error closing port:', closeErr.message);
                } else {
                    console.log('Port closed.');
                }
            });
        });
    });
});
