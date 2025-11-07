/**
 * Printer Service
 * Handle thermal printer & cash drawer operations
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;
const { SerialPort } = require('serialport');
const qrcodeTerminal = require('qrcode-terminal');
const appConfig = require('../config/config');
const {
  RECEIPT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  formatReceipt
} = require('./receiptFormatter');
const {
  loadSettings,
  saveSettings
} = require('./printerSettingsStore');

const DEFAULT_FULL_CUSTOM_TEMPLATES = {
  '58mm': [
    '{{shopName}}',
    '{{shopAddress}}',
    '{{shopPhone}}',
    '================================',
    'Order : {{orderId}}',
    'Nama  : {{customerName}}',
    'Waktu : {{createdAt}}',
    'Metode: {{paymentMethod}}',
    '--------------------------------',
    '{{#items}}',
    '{{item.name}}',
    '  Qty   : {{item.quantity}} x {{item.price}}',
    '  Total : {{item.total}}',
    '  Note  : {{item.notes}}',
    '{{/items}}',
    '--------------------------------',
    'Subtotal : {{subtotal}}',
    'Biaya    : {{fee}}',
    'Diskon   : {{discount}}',
    '================================',
    'TOTAL    : {{total}}',
    'Terima kasih dan selamat menikmati!'
  ].join('\n'),
  '80mm': [
    '{{shopName}}',
    '{{shopAddress}}',
    '{{shopPhone}}',
    '================================================',
    'Order   : {{orderId}}',
    'Nama    : {{customerName}}',
    'Waktu   : {{createdAt}}',
    'Metode  : {{paymentMethod}}',
    '------------------------------------------------',
    '{{#items}}',
    '{{item.name}}',
    '  Qty   : {{item.quantity}} x {{item.price}}',
    '  Total : {{item.total}}',
    '  Note  : {{item.notes}}',
    '{{/items}}',
    '------------------------------------------------',
    'Subtotal : {{subtotal}}',
    'Biaya    : {{fee}}',
    'Diskon   : {{discount}}',
    '================================================',
    'TOTAL    : {{total}}',
    'Terima kasih dan selamat menikmati!'
  ].join('\n')
};

const DEFAULT_FOOTER_QR_LABEL = 'Scan QR di bawah ini';

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
      const receipt = this.composeReceipt(order, activeTemplate);
      const { header, info, items, totals, footer } = receipt.sections;
      const footerQr = receipt.footerQr || {};
      const asciiFallback = receipt.previewAscii || [];

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

      // Render QR code at footer when enabled
      if (footerQr.enabled) {
        const type = footerQr.type || 'qr';
        if ((type === 'qr' || type === 'link') && footerQr.value) {
          const qrValue = String(footerQr.value || '').trim();
          if (qrValue) {
            this.printer.newLine();
            this.printer.alignCenter();
            const cellSize = this.resolveQrCellSize(footerQr, receipt.width);
            try {
              if (typeof this.printer.printQR === 'function') {
                this.printer.printQR(qrValue, { cellSize });
              } else if (typeof this.printer.qr === 'function') {
                this.printer.qr(qrValue, { size: cellSize });
              } else if (asciiFallback.length) {
                asciiFallback.forEach(line => this.printer.println(line));
              } else {
                this.printer.println('[QR]');
              }
            } catch (qrError) {
              console.warn('[Printer] QR render failed, fallback to text:', qrError.message);
              if (asciiFallback.length) {
                asciiFallback.forEach(line => this.printer.println(line));
              } else {
                this.printer.println('[QR]');
              }
            }
            this.printer.alignLeft();
          }
        } else if (type === 'image' && footerQr.imageData) {
          this.printer.newLine();
          this.printer.alignCenter();
          try {
            await this.printFooterImage(footerQr.imageData);
          } catch (imageError) {
            console.warn('[Printer] Footer image failed, fallback to label only:', imageError.message);
            if (asciiFallback.length) {
              asciiFallback.forEach(line => this.printer.println(line));
            }
          }
          this.printer.alignLeft();
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
    if (store[templateId]) {
      return store[templateId];
    }
    return DEFAULT_FULL_CUSTOM_TEMPLATES[templateId] || DEFAULT_FULL_CUSTOM_TEMPLATES[DEFAULT_TEMPLATE_ID] || '';
  }

  setCustomTemplate(templateId, text) {
    this.settings = this.settings || {};
    this.settings.customTemplates = this.settings.customTemplates || {};
    this.settings.customTemplates[templateId] = String(text || '');
    saveSettings(this.settings);
    return this.getCustomTemplate(templateId);
  }

  getFooterQrSetting() {
    this.settings = this.settings || {};
    const fallbackValue = String(appConfig.shop?.qrisStatic || '').trim();
    const rawEnabled = !!this.settings.footerQrEnabled;
    const storedValue = String(this.settings.footerQrValue || '').trim();
    const type = this.settings.footerQrType || 'qr';
    const imageData = this.settings.footerQrImageData || '';
    const cellSizeRaw = Number(this.settings.footerQrCellSize);
    const cellSize = Number.isFinite(cellSizeRaw) && cellSizeRaw >= 1 && cellSizeRaw <= 10 ? cellSizeRaw : 2;

    let resolvedValue = storedValue;
    if ((type === 'qr' || type === 'link') && !resolvedValue) {
      resolvedValue = fallbackValue;
    }

    const hasPayload = type === 'image'
      ? !!imageData
      : !!resolvedValue;

    const hasLabel = Object.prototype.hasOwnProperty.call(this.settings, 'footerQrLabel');
    const storedLabel = hasLabel ? String(this.settings.footerQrLabel || '').trim() : DEFAULT_FOOTER_QR_LABEL;
    const label = hasLabel ? storedLabel : DEFAULT_FOOTER_QR_LABEL;

    return {
      enabled: rawEnabled,
      canRender: rawEnabled && hasPayload,
      value: storedValue,
      resolvedValue,
      label,
      type,
      imageData,
      cellSize,
      defaultValue: fallbackValue,
      defaultLabel: DEFAULT_FOOTER_QR_LABEL
    };
  }

  setFooterQrSetting({ enabled, value, label, type, imageData, cellSize } = {}) {
    this.settings = this.settings || {};
    if (typeof enabled !== 'undefined') {
      this.settings.footerQrEnabled = !!enabled;
    }
    if (typeof value !== 'undefined') {
      this.settings.footerQrValue = String(value || '').trim();
    }
    if (typeof label !== 'undefined') {
      this.settings.footerQrLabel = String(label || '').trim();
    }
    if (typeof type !== 'undefined') {
      const sanitizedType = ['qr', 'link', 'text', 'image'].includes(type) ? type : 'qr';
      this.settings.footerQrType = sanitizedType;
    }
    if (typeof imageData !== 'undefined') {
      if (imageData) {
        this.settings.footerQrImageData = String(imageData);
      } else if (this.settings.footerQrType !== 'image') {
        this.settings.footerQrImageData = '';
      } else if (!imageData) {
        // retain existing image when empty payload for image type
        this.settings.footerQrImageData = this.settings.footerQrImageData || '';
      }
    }
    if (typeof cellSize !== 'undefined') {
      const parsedCellSize = Number(cellSize);
      if (Number.isFinite(parsedCellSize)) {
        const clamped = Math.min(10, Math.max(1, Math.round(parsedCellSize)));
        this.settings.footerQrCellSize = clamped;
      }
    }
    saveSettings(this.settings);
    return this.getFooterQrSetting();
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
    const footerQrSetting = this.getFooterQrSetting();
    const footerQr = {
      ...footerQrSetting,
      value: footerQrSetting.resolvedValue,
      sourceValue: footerQrSetting.value,
      enabled: footerQrSetting.enabled && footerQrSetting.canRender
    };
    const receipt = formatReceipt(order, activeTemplate, {
      customHeaderText,
      customFooterText,
      customTemplateText: maybeCustom,
      footerQr
    });
    receipt.footerQr = footerQr;
    const ascii = this.generateFooterQrAscii(footerQr, receipt.width);
    receipt.previewAscii = ascii;
    if (ascii.length && (footerQr.type === 'qr' || footerQr.type === 'link')) {
      receipt.previewText = `${receipt.text}\n${ascii.join('\n')}`;
    } else {
      receipt.previewText = receipt.text;
    }
    return receipt;
  }

  composeSampleReceipt(templateId) {
    const sampleOrder = this.buildSampleOrder();
    return this.composeReceipt(sampleOrder, templateId);
  }

  generateFooterQrAscii(setting, width) {
    if (!setting || !setting.enabled) {
      return [];
    }

    const type = setting.type || 'qr';
    if (type !== 'qr' && type !== 'link') {
      return [];
    }

    const qrValue = String(setting.value || '').trim();
    if (!qrValue) {
      return [];
    }

    let qrString = '';
    try {
      qrcodeTerminal.generate(qrValue, { small: true }, (qr) => {
        qrString = qr || '';
      });
    } catch (error) {
      console.error('[Printer] Failed to generate ASCII QR preview:', error.message);
      return [];
    }

    if (!qrString) {
      return [];
    }

    const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');
    const lines = qrString
      .split(/\r?\n/)
      .map(line => stripAnsi(line).replace(/\s+$/g, ''))
      .filter(line => line.trim().length > 0);

    if (!lines.length) {
      return [];
    }

    return lines.map(line => this.centerVisual(line, width));
  }

  resolveQrCellSize(setting, width) {
    const stored = Number(setting?.cellSize);
    if (Number.isFinite(stored) && stored >= 1 && stored <= 10) {
      return Math.round(stored);
    }
    if (Number(width) >= 48) {
      return 3;
    }
    return 2;
  }

  centerVisual(text, width) {
    const raw = String(text || '');
    if (!width || raw.length >= width) {
      return raw;
    }
    const padding = Math.max(0, width - raw.length);
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return `${' '.repeat(left)}${raw}${' '.repeat(right)}`;
  }

  async printFooterImage(imageData) {
    if (!imageData || typeof imageData !== 'string') {
      throw new Error('Footer image data kosong');
    }

    const match = imageData.match(/^data:(image\/(png|jpeg|jpg|gif));base64,(.+)$/i);
    if (!match) {
      throw new Error('Format gambar tidak didukung');
    }

    const mime = match[1].toLowerCase();
    const extCandidate = match[2].toLowerCase();
    const ext = extCandidate === 'jpeg' ? 'jpg' : extCandidate;
    const buffer = Buffer.from(match[3], 'base64');

    const tmpFile = path.join(os.tmpdir(), `pangko-footer-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

    await fs.promises.writeFile(tmpFile, buffer);

    try {
      if (typeof this.printer.printImage === 'function') {
        await this.printer.printImage(tmpFile);
      } else {
        throw new Error('Printer tidak mendukung cetak gambar');
      }
    } finally {
      fs.promises.unlink(tmpFile).catch(() => {});
    }
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
