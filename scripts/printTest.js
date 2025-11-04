// Quick print test via node-thermal-printer (tanpa modul 'printer')
// Usage: npm run print:test

const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;
const { SerialPort } = require('serialport');
const config = require('../src/config/config');

const printerConfig = config.printer;

if (!printerConfig || !printerConfig.enabled) {
  console.log('⚠️ Printer is disabled in config.js. Skipping test.');
  process.exit(0);
}

// Determine mode & interface for composer
let mode = 'unknown';
let composerInterface = {};
if (printerConfig.serialPort) {
  mode = 'serial';
  composerInterface = {}; // dummy interface: we'll send via SerialPort ourselves
} else if (printerConfig.tcpHost) {
  mode = 'tcp';
  composerInterface = `tcp://${printerConfig.tcpHost}`;
} else if (printerConfig.printerName) {
  mode = 'printer';
  composerInterface = {}; // not supported without native driver
}

if (mode === 'unknown') {
  console.error('❌ No printer interface configured in src/config/config.js. Please set serialPort, tcpHost, or printerName.');
  process.exit(1);
}

console.log(
  mode === 'serial'
    ? `Testing printer with interface: com://${printerConfig.serialPort}`
    : mode === 'tcp'
    ? `Testing printer with interface: tcp://${printerConfig.tcpHost}`
    : `Testing printer with Windows spooler (not supported without native driver)`
);

const testPrinter = new ThermalPrinter({
  type: PrinterTypes[printerConfig.type] || PrinterTypes.EPSON,
  interface: composerInterface,
  options: { 
    timeout: 5000,
    baudRate: printerConfig.baudRate || 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: false
  }
});

testPrinter.alignCenter();
testPrinter.bold(true);
testPrinter.println('TEST PRINT');
testPrinter.bold(false);
testPrinter.println('PANGKO COFFEE');
testPrinter.newLine();
testPrinter.cut();

const buffer = testPrinter.getBuffer();

if (mode === 'serial') {
  const portName = printerConfig.serialPort;
  const baudRate = parseInt(printerConfig.baudRate, 10) || 9600;
  const port = new SerialPort({
    path: portName,
    baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: false,
    autoOpen: false
  });

  port.open((openErr) => {
    if (openErr) {
      console.error('❌ Print failed (open):', openErr.message);
      process.exit(1);
    }

    port.write(buffer, (writeErr) => {
      if (writeErr) {
        port.close(() => {
          console.error('❌ Print failed (write):', writeErr.message);
          process.exit(1);
        });
        return;
      }
      port.drain((drainErr) => {
        port.close(() => {
          if (drainErr) {
            console.error('❌ Print failed (drain):', drainErr.message);
            process.exit(1);
          } else {
            console.log('✅ Test print sent successfully via SerialPort!');
            process.exit(0);
          }
        });
      });
    });
  });
} else if (mode === 'tcp') {
  testPrinter.execute()
    .then(() => {
      console.log('✅ Test print sent successfully (TCP)!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Print failed (TCP):', err);
      process.exit(1);
    });
} else {
  console.error('❌ Windows spooler printing is not supported without native driver. Please use serialPort or tcpHost.');
  process.exit(1);
}
