// Minimal raw print test to verify top/bottom margins
// Sends ESC @, sets minimal line spacing (ESC 3 0), centers text, prints one line, then cuts.
// Usage: node scripts/printTest-tight.js

const { SerialPort } = require('serialport');
const config = require('../src/config/config');

const printerConfig = config.printer || {};
if (!printerConfig || !printerConfig.enabled || !printerConfig.serialPort) {
  console.error('Printer serial not configured in src/config/config.js or printer disabled.');
  process.exit(1);
}

const portName = printerConfig.serialPort;
const baudRate = parseInt(printerConfig.baudRate, 10) || 9600;

// Build minimal ESC/POS buffer
const cmds = [];
// ESC @
cmds.push(Buffer.from([0x1B, 0x40]));
// ESC 3 0 -> line spacing 0
cmds.push(Buffer.from([0x1B, 0x33, 0x00]));
// ESC a 1 -> align center
cmds.push(Buffer.from([0x1B, 0x61, 0x01]));
// Text (no extra long newlines)
cmds.push(Buffer.from('TEST PRINT', 'ascii'));
// LF to ensure the line is printed
cmds.push(Buffer.from([0x0A]));
// ESC J 0 -> feed 0
cmds.push(Buffer.from([0x1B, 0x4A, 0x00]));
// GS V 0 -> full cut (may vary by printer; TM-58 often supports 1D 56 00)
cmds.push(Buffer.from([0x1D, 0x56, 0x00]));

const payload = Buffer.concat(cmds);

console.log('Sending minimal print payload to', portName, 'len=', payload.length);
console.log('Head:', payload.slice(0, 12).toString('hex'));
console.log('Tail:', payload.slice(-12).toString('hex'));

const port = new SerialPort({ path: portName, baudRate, autoOpen: false });

port.open(err => {
  if (err) {
    console.error('Failed to open port:', err.message);
    process.exit(1);
  }
  port.write(payload, writeErr => {
    if (writeErr) {
      console.error('Write error:', writeErr.message);
      port.close(() => process.exit(1));
      return;
    }
    port.drain(drainErr => {
      port.close(() => {
        if (drainErr) {
          console.error('Drain error:', drainErr.message);
          process.exit(1);
        }
        console.log('Minimal print payload sent. Check printer output.');
        process.exit(0);
      });
    });
  });
});
