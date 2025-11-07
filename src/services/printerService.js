/**
 * Printer Service
 * Handle thermal printer & cash drawer operations
 */
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;
const { SerialPort } = require('serialport');
const {
  RECEIPT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  formatReceipt
} = require('./receiptFormatter');
const {
  loadSettings,
  saveSettings
} = require('./printerSettingsStore');

class PrinterService {
  constructor() {
    this.printer = null;
    this.isConnected = false;
    this.config = null;
    this.settings = loadSettings();
    this.receiptTemplateId = this.settings.receiptTemplate || DEFAULT_TEMPLATE_ID;
  }

  /**
   * Initialize printer with config
   */
  init(config) {
    this.config = config;
    
    if (!config || !config.enabled) {
      console.log('[Printer] Printer disabled in config');
      return;
    }

    try {
      // Map printer type
      const typeMap = {
        'EPSON': PrinterTypes.EPSON,
        'STAR': PrinterTypes.STAR,
        'DARUMA': PrinterTypes.DARUMA,
        'TANCA': PrinterTypes.TANCA
      };

      const printerType = typeMap[config.type] || PrinterTypes.EPSON;

      // Decide operational mode
      // - 'serial': write buffers via SerialPort (hybrid approach)
      // - 'tcp': let node-thermal-printer handle TCP
      // - 'spooler/printer': NOT supported without native driver
      this.mode = config.serialPort ? 'serial' : (config.tcpHost ? 'tcp' : (config.printerName ? 'printer' : 'unknown'));

      // Build a dummy interface so we can use node-thermal-printer to compose buffers
      // We WON'T call .execute() for serial mode.
      let ifaceForComposer = {};
      if (this.mode === 'tcp') {
        ifaceForComposer = `tcp://${config.tcpHost}`;
      } else if (this.mode === 'printer') {
        // Force an informative failure early for Windows spooler path
        console.warn('[Printer] Windows spooler printing requires native "printer" driver which is not installed. Prefer serialPort or tcpHost.');
        ifaceForComposer = {}; // still allow composing buffers
      }

      this.printer = new ThermalPrinter({
        type: printerType,
        interface: ifaceForComposer,
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "=",
        options: {
          timeout: 5000
        }
      });

      this.isConnected = true;
      const where = this.mode === 'serial' ? `COM ${config.serialPort}` : (this.mode === 'tcp' ? `TCP ${config.tcpHost}` : 'local composer');
      console.log(`[Printer] ✅ Initialized in ${this.mode.toUpperCase()} mode (${where})`);

      // Apply template preference from config or persisted settings
      if (config.receiptTemplate && RECEIPT_TEMPLATES[config.receiptTemplate]) {
        this.receiptTemplateId = config.receiptTemplate;
      }
      if (this.settings.receiptTemplate && RECEIPT_TEMPLATES[this.settings.receiptTemplate]) {
        this.receiptTemplateId = this.settings.receiptTemplate;
      }
    } catch (error) {
      console.error('[Printer] ❌ Failed to connect:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Open cash drawer
   */
  async openCashDrawer() {
    if (!this.isConnected) {
      throw new Error('Printer not connected');
    }

    try {
      // Use explicit ESC p m t1 t2 to trigger drawer
      const pin = (this.config.drawer?.pin ?? 0) & 0x01; // 0 or 1
      const t1 = (this.config.drawer?.t1 ?? 80) & 0xFF;  // 0-255
      const t2 = (this.config.drawer?.t2 ?? 80) & 0xFF;  // 0-255
      const pulse = Buffer.from([0x1B, 0x70, pin, t1, t2]);

      if (this.mode === 'serial') {
        await this.writeSerial(pulse);
      } else if (this.mode === 'tcp') {
        this.printer.clear();
        this.printer.add(pulse);
        await this.printer.execute();
      } else {
        throw new Error('Unsupported printer mode for opening drawer');
      }

      console.log('[Printer] 💰 Cash drawer opened');
      return { success: true, message: 'Cash drawer opened' };
    } catch (error) {
      console.error('[Printer] ❌ Failed to open drawer:', error.message);
      throw error;
    }
  }

  /**
   * Print receipt for order
   */
  async printReceipt(order, templateId) {
    if (!this.isConnected) {
      throw new Error('Printer not connected');
    }

    try {
      // Always start from a clean buffer to avoid duplicated prints
      this.printer.clear();
      const activeTemplate = templateId && RECEIPT_TEMPLATES[templateId]
        ? templateId
        : this.receiptTemplateId;
  const { customHeaderText, customFooterText } = this.getCustomText();
  const maybeCustom = this.getUseCustomTemplate() ? this.getCustomTemplate(activeTemplate) : '';
  const receipt = formatReceipt(order, activeTemplate, { customHeaderText, customFooterText, customTemplateText: maybeCustom });

      const { header, info, items, totals, footer } = receipt.sections;

      // Trim any trailing empty lines in sections to avoid accidental large gaps
      const trimTrailingEmpty = (arr) => {
        while (arr.length && String(arr[arr.length - 1]).trim() === '') arr.pop();
        return arr;
      };

      trimTrailingEmpty(header);
      trimTrailingEmpty(info);
      trimTrailingEmpty(items);
      trimTrailingEmpty(totals);
      trimTrailingEmpty(footer);

      // Build final lines array and ensure no trailing blank lines remain
      const finalLines = [].concat(header, info, items, totals, footer).map(l => String(l || ''));
      while (finalLines.length && finalLines[finalLines.length - 1].trim() === '') finalLines.pop();

      this.printer.alignLeft();
      // Print using the composed finalLines to avoid accidental extra lines
      if (finalLines.length) {
        // If header exists and we want it bold
        if (header.length) {
          this.printer.bold(true);
          this.printer.println(finalLines[0]);
          this.printer.bold(false);
          finalLines.slice(1).forEach(line => this.printer.println(line));
        } else {
          finalLines.forEach(line => this.printer.println(line));
        }
      }

      // Allow optional extra feed lines before cut (configurable)
      const feedLines = Number(this.config?.cutFeedLines || 0);
      for (let i = 0; i < feedLines; i++) this.printer.newLine();
      // Perform cut
      this.printer.cut();

      // Debug: log final lines tail to help diagnose long gaps
      try {
        const sampleTail = finalLines.slice(-6).join(' | ');
        console.log(`[Printer][DEBUG] finalLines count=${finalLines.length} tail="${sampleTail}"`);
      } catch (e) {
        // ignore debug errors
      }

      // HYBRID SEND
      const buffer = this.printer.getBuffer();
      if (this.mode === 'serial') {
        await this.writeSerial(buffer);
      } else if (this.mode === 'tcp') {
        await this.printer.execute();
      } else if (this.mode === 'printer') {
        throw new Error('Windows spooler printing is not supported without native driver. Use serialPort or tcpHost.');
      } else {
        throw new Error('Unknown printer mode');
      }
      // Clear after send to prevent accumulation
      this.printer.clear();
      console.log(`[Printer] 🖨️  Receipt printed for ${order.orderId} (template: ${receipt.template})`);
      
      if (!templateId) {
        // Ensure persisted template matches active selection
        this.updateStoredTemplate(this.receiptTemplateId);
      }

      return { success: true, message: 'Receipt printed successfully', template: receipt.template };
    } catch (error) {
      console.error('[Printer] ❌ Failed to print:', error.message);
      throw error;
    }
  }

  /**
   * Print receipt and open cash drawer
   */
  async printAndOpenDrawer(order, templateId) {
    try {
      // Print receipt first
      await this.printReceipt(order, templateId);
      
      // Then open cash drawer (always for cash flow)
      await this.openCashDrawer();
      
      return { success: true, message: 'Receipt printed and drawer opened' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Format number to Rupiah
   */
  getAvailableTemplates() {
    return Object.values(RECEIPT_TEMPLATES);
  }

  getReceiptTemplate() {
    return this.receiptTemplateId;
  }

  setReceiptTemplate(templateId) {
    const template = RECEIPT_TEMPLATES[templateId] ? templateId : DEFAULT_TEMPLATE_ID;
    this.receiptTemplateId = template;
    this.updateStoredTemplate(template);
    console.log(`[Printer] 🧾 Receipt template now ${template}`);
    return template;
  }

  updateStoredTemplate(templateId) {
    this.settings = this.settings || {};
    this.settings.receiptTemplate = templateId;
    saveSettings(this.settings);
  }

  // Custom template settings
  getUseCustomTemplate() {
    this.settings = this.settings || {};
    return !!this.settings.useCustomTemplate;
  }

  setUseCustomTemplate(enabled) {
    this.settings = this.settings || {};
    this.settings.useCustomTemplate = !!enabled;
    saveSettings(this.settings);
    return this.getUseCustomTemplate();
  }

  getCustomTemplate(templateId) {
    this.settings = this.settings || {};
    const store = this.settings.customTemplates || {};
    return store[templateId] || '';
  }

  setCustomTemplate(templateId, text) {
    this.settings = this.settings || {};
    this.settings.customTemplates = this.settings.customTemplates || {};
    this.settings.customTemplates[templateId] = String(text || '');
    saveSettings(this.settings);
    return this.getCustomTemplate(templateId);
  }

  getCustomText() {
    this.settings = this.settings || {};
    return {
      customHeaderText: this.settings.customHeaderText || '',
      customFooterText: this.settings.customFooterText || ''
    };
  }

  setCustomText({ customHeaderText = '', customFooterText = '' } = {}) {
    this.settings = this.settings || {};
    this.settings.customHeaderText = String(customHeaderText || '');
    this.settings.customFooterText = String(customFooterText || '');
    saveSettings(this.settings);
    return this.getCustomText();
  }

  composeReceipt(order, templateId) {
    const activeTemplate = templateId && RECEIPT_TEMPLATES[templateId]
      ? templateId
      : this.receiptTemplateId;
    const { customHeaderText, customFooterText } = this.getCustomText();
    const maybeCustom = this.getUseCustomTemplate() ? this.getCustomTemplate(activeTemplate) : '';
    return formatReceipt(order, activeTemplate, { customHeaderText, customFooterText, customTemplateText: maybeCustom });
  }

  composeSampleReceipt(templateId) {
    const sampleOrder = this.buildSampleOrder();
    return this.composeReceipt(sampleOrder, templateId);
  }

  async printSampleReceipt(templateId) {
    const sampleOrder = this.buildSampleOrder();
    return this.printReceipt(sampleOrder, templateId);
  }

  buildSampleOrder() {
    const now = new Date().toISOString();
    return {
      orderId: 'SAMPLE-ORDER',
      createdAt: now,
      customerName: 'Sample Customer',
      paymentMethod: 'CASH',
      items: [
        { name: 'Iced Latte', quantity: 1, price: 25000 },
        { name: 'Caramel Macchiato', quantity: 2, price: 28000, notes: 'Less ice', addons: [{ name: 'Extra Shot', quantity: 2, unitPrice: 5000 }] },
      ],
      pricing: {
        subtotal: 25000 + (2 * 28000),
        fee: 0,
        discount: 0,
        total: 25000 + (2 * 28000)
      }
    };
  }

  /**
   * Get printer status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      enabled: this.config?.enabled || false,
      type: this.config?.type || 'unknown',
      interface: this.config?.interface || 'unknown',
      autoPrint: this.config?.autoPrint || false,
      autoOpenDrawer: this.config?.autoOpenDrawer || false
    };
  }

  /**
   * Test printer connection
   */
  async test() {
    if (!this.isConnected) {
      throw new Error('Printer not connected');
    }

    try {
      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.println('TEST PRINT');
      this.printer.bold(false);
      this.printer.println('Printer is working!');
      this.printer.newLine();
      this.printer.cut();

      const buffer = this.printer.getBuffer();
      if (this.mode === 'serial') {
        await this.writeSerial(buffer);
      } else if (this.mode === 'tcp') {
        await this.printer.execute();
      } else {
        throw new Error('Unsupported printer mode');
      }
      return { success: true, message: 'Test print successful' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Low-level writer for serial mode using 'serialport'.
   */
  async writeSerial(buffer) {
    const portName = this.config.serialPort;
    const baudRate = parseInt(this.config.baudRate, 10) || 9600;
    if (!portName) throw new Error('serialPort is not set in config');

    return new Promise((resolve, reject) => {
      const port = new SerialPort({
        path: portName,
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        rtscts: false,
        autoOpen: false,
      });

      port.open((openErr) => {
        if (openErr) return reject(openErr);
        port.write(buffer, (writeErr) => {
          if (writeErr) {
            port.close(() => reject(writeErr));
            return;
          }
          port.drain((drainErr) => {
            port.close(() => {
              if (drainErr) return reject(drainErr);
              resolve(true);
            });
          });
        });
      });
    });
  }
}

module.exports = new PrinterService();
