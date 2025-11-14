#!/usr/bin/env node
'use strict';

const printerService = require('../src/services/printerService');
const config = require('../src/config/config');

(async () => {
  try {
    if (!config.printer?.enabled) {
      console.error('Printer disabled in config');
      process.exit(1);
    }
    printerService.init(config.printer);
    if (String(printerService.mode).toLowerCase() !== 'rawbt') {
      console.error('RawBT mode is not enabled in config.printer.rawbt.enabled');
      process.exit(1);
    }
    const result = await printerService.printSampleReceipt();
    if (result && result.rawbtUrl) {
      console.log('RawBT URL:');
      console.log(result.rawbtUrl);
    } else {
      const last = printerService.getLastRawbtUrl();
      if (last) {
        console.log('RawBT URL:');
        console.log(last);
      } else {
        console.error('Failed to create RawBT URL');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
