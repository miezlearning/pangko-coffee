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
const QRCode = require('qrcode');
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

// QR preview image is delivered as base64; we intentionally avoid ASCII rendering

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function truncateMiddle(value, max = 60) {
  if (!value) return '';
  const str = String(value);
  if (str.length <= max) return str;
  const half = Math.floor((max - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

function isLikelyUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(String(value).trim());
}

/**
 * Build ESC/POS raster bitmap for a QR code value.
 * Uses `qrcode.create()` from the existing `qrcode` dependency to obtain
 * the module matrix, then scales it and encodes as GS v 0 raster image.
 * Returns a Buffer containing ESC a (center) + ESC 3 0 + GS v 0 ... image data.
 */
function buildQrRasterEscPos(value, scale = 4) {
  if (!value) return Buffer.alloc(0);
  try {
    const qr = QRCode.create(String(value), { errorCorrectionLevel: 'M' });
    const modules = qr.modules;
    let size = modules && modules.size ? modules.size : 0;
    let dataArr = null;
    if (!size && modules && Array.isArray(modules.data)) {
      const len = modules.data.length;
      size = Math.round(Math.sqrt(len));
      dataArr = modules.data;
    } else if (modules && typeof modules.get === 'function') {
      // build a flat array from getter
      dataArr = new Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          dataArr[y * size + x] = modules.get(x, y);
        }
      }
    } else if (modules && Array.isArray(modules)) {
      // fallback if modules itself is a 2D-array
      size = modules.length;
      dataArr = new Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dataArr[y * size + x] = !!modules[y][x];
    } else if (modules && modules.data) {
      dataArr = modules.data;
      if (!size) size = Math.round(Math.sqrt(dataArr.length));
    }

    if (!size || !dataArr) return Buffer.alloc(0);

    const pixelWidth = size * scale;
    const pixelHeight = size * scale;
    const bytesPerLine = Math.ceil(pixelWidth / 8);

    // Build raw bitmap bytes (1 = black, 0 = white). ESC/POS expects each line
    // as bytes where the most-significant bit is the left-most pixel.
    const imageBytes = Buffer.alloc(bytesPerLine * pixelHeight);
    for (let py = 0; py < pixelHeight; py++) {
      const moduleY = Math.floor(py / scale);
      for (let bx = 0; bx < bytesPerLine; bx++) {
        let byteVal = 0x00;
        for (let bit = 0; bit < 8; bit++) {
          const px = bx * 8 + bit;
          const moduleX = Math.floor(px / scale);
          let bitOn = 0;
          if (moduleX < size && moduleY < size) {
            const v = dataArr[moduleY * size + moduleX];
            bitOn = v ? 1 : 0;
          }
          // set MSB first
          byteVal = (byteVal << 1) | (bitOn ? 1 : 0);
        }
        // If the last byte in the row has fewer than 8 meaningful pixels we
        // left-shifted them into the MSBs; that's acceptable for many printers.
        const destOffset = py * bytesPerLine + bx;
        imageBytes[destOffset] = byteVal & 0xFF;
      }
    }

    // GS v 0 raster format header
    // 0x1D 0x76 0x30 m xL xH yL yH [d]
    const m = 0x00; // normal
    const xL = bytesPerLine & 0xFF;
    const xH = (bytesPerLine >> 8) & 0xFF;
    const yL = pixelHeight & 0xFF;
    const yH = (pixelHeight >> 8) & 0xFF;

    const parts = [];
    // center alignment before image
    parts.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1
    // set line spacing to minimal
    parts.push(Buffer.from([0x1B, 0x33, 0x00])); // ESC 3 0
    parts.push(Buffer.from([0x1D, 0x76, 0x30, m, xL, xH, yL, yH]));
    parts.push(imageBytes);

    return Buffer.concat(parts);
  } catch (e) {
    console.warn('[Printer] buildQrRasterEscPos failed:', e && e.message ? e.message : e);
    return Buffer.alloc(0);
  }
}

function formatMultiline(value) {
  if (!value) return '';
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

// Default full custom templates with placeholders. Users can toggle full custom mode.
// Supports loop {{#items}} ... {{/items}} and placeholders: {{item.name}}, {{item.quantity}}, {{item.price}}, {{item.total}}, {{item.notes}}, {{item.addons}}
const DEFAULT_FULL_CUSTOM_TEMPLATES = {
  'default': [
    '{{shopName}}',
    '{{shopAddress}}',
    '{{shopPhone}}',
    '================================',
    'Order ID : {{orderId}}',
    'Nama     : {{customerName}}',
    'Waktu    : {{createdAt}}',
    '{{#items}}',
    '{{item.name}}',
    '  Qty    : {{item.quantity}} x {{item.price}}',
    '{{item.addons}}',
    '{{/items}}',
    '--------------------------------',
    'Subtotal : {{subtotal}}',
    'Biaya    : {{fee}}',
    'Diskon   : {{discount}}',
    '================================',
    'TOTAL    : {{total}}',
    'Terima kasih!',
    'Selamat menikmati ☕'
  ].join('\n'),
  '80mm': [
    '{{shopName}}',
    '{{shopAddress}}',
    '{{shopPhone}}',
    '================================================',
    'Order ID  : {{orderId}}',
    'Nama      : {{customerName}}',
    'Waktu     : {{createdAt}}',
    'Metode    : {{paymentMethod}}',
    '------------------------------------------------',
    '{{#items}}',
    '{{item.name}}',
    '  Qty     : {{item.quantity}} x {{item.price}}',
    '  Total   : {{item.total}}',
    '  Note    : {{item.notes}}',
    '{{item.addons}}',
    '{{/items}}',
    '------------------------------------------------',
    'Subtotal  : {{subtotal}}',
    'Biaya     : {{fee}}',
    'Diskon    : {{discount}}',
    '================================================',
    'TOTAL     : {{total}}',
    'Terima kasih!',
    'Selamat menikmati ☕'
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
      // Try to minimize built-in margins: initialize printer and set minimal line spacing
      // ESC @ -> initialize, ESC 3 0 -> line spacing = 0
      try {
        this.printer.add(Buffer.from([0x1B, 0x40])); // ESC @
        this.printer.add(Buffer.from([0x1B, 0x33, 0x00])); // ESC 3 0
      } catch (e) {
        // ignore if low-level add isn't supported by composer implementation
      }
      const activeTemplate = templateId && RECEIPT_TEMPLATES[templateId]
        ? templateId
        : this.receiptTemplateId;
      const receipt = await this.composeReceipt(order, activeTemplate);
      const { header, info, items, totals, footer } = receipt.sections;
      const footerQr = receipt.footerQr || {};

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

      const cloneEntry = (entry) => ({
        section: entry?.section || 'body',
        rawText: entry?.rawText != null ? String(entry.rawText) : String(entry?.displayText || ''),
        displayText: entry?.displayText != null ? String(entry.displayText) : String(entry?.rawText || ''),
        align: entry?.align || 'left',
        font: entry?.font || 'normal',
      });

      const fallbackEntries = () => {
        const merged = [].concat(header, info, items, totals, footer).map(line => String(line || ''));
        return merged.map(text => ({
          section: 'body',
          rawText: text,
          displayText: text,
          align: 'left',
          font: 'normal',
        }));
      };

      const structuredSource = Array.isArray(receipt.structuredLines) && receipt.structuredLines.length
        ? receipt.structuredLines.map(cloneEntry)
        : fallbackEntries();

      const collapseEntries = (entries) => {
        const trimmed = [...entries];
        while (trimmed.length && !String(trimmed[trimmed.length - 1]?.displayText || '').trim()) {
          trimmed.pop();
        }
        const collapsed = [];
        trimmed.forEach((entry) => {
          const value = String(entry.displayText || '');
          const isEmpty = value.trim() === '';
          if (isEmpty) {
            if (!collapsed.length || String(collapsed[collapsed.length - 1].displayText || '').trim() !== '') {
              collapsed.push(entry);
            }
          } else {
            collapsed.push(entry);
          }
        });
        return collapsed;
      };

      const safeEntries = collapseEntries(structuredSource);
      const safeFinalLines = safeEntries.map(entry => entry.displayText);
      const lastPrintedLine = safeFinalLines.length ? safeFinalLines[safeFinalLines.length - 1] : '';

      const mapFontMultipliers = (font) => {
        switch (font) {
          case 'double-height':
            return { width: 1, height: 2 };
          case 'double-width':
            return { width: 2, height: 1 };
          case 'double':
            return { width: 2, height: 2 };
          default:
            return { width: 1, height: 1 };
        }
      };

      // If using serial mode, send a minimal raw ESC/POS payload (same concept as scripts/printTest-tight.js)
      if (this.mode === 'serial') {
        const parts = [];
        // ESC @, ESC 3 0 (line spacing 0)
        parts.push(Buffer.from([0x1B, 0x40]));
        parts.push(Buffer.from([0x1B, 0x33, 0x00]));

        const defaultSerialTextSize = (this.config && Number(this.config.serialTextSize))
          ? Math.max(1, Math.min(8, Number(this.config.serialTextSize)))
          : 1;

        const appendEntry = (entry) => {
          const alignCode = entry.align === 'center' ? 0x01 : entry.align === 'right' ? 0x02 : 0x00;
          parts.push(Buffer.from([0x1B, 0x61, alignCode]));

          let { width, height } = mapFontMultipliers(entry.font);
          if (entry.font === 'normal' && defaultSerialTextSize > 1) {
            width = defaultSerialTextSize;
            height = defaultSerialTextSize;
          }
          const clampedWidth = Math.max(1, Math.min(8, Math.round(width)));
          const clampedHeight = Math.max(1, Math.min(8, Math.round(height)));
          const n = ((clampedWidth - 1) << 4) | (clampedHeight - 1);
          if (n !== 0) {
            parts.push(Buffer.from([0x1D, 0x21, n]));
          }

          const raw = entry.rawText ?? '';
          parts.push(Buffer.from(String(raw), 'ascii'));
          parts.push(Buffer.from([0x0A]));

          if (n !== 0) {
            parts.push(Buffer.from([0x1D, 0x21, 0x00]));
          }
        };

        safeEntries.forEach(appendEntry);

  // If footer QR is enabled and canRender, prefer printing a graphical QR via raster
  if (footerQr && footerQr.enabled && footerQr.canRender && (footerQr.type === 'qr' || footerQr.type === 'link' || footerQr.type === 'image')) {
          // If the receipt footer already contains the same label text, avoid
          // printing it again here to prevent duplication.
          const labelText = footerQr.label ? String(footerQr.label).trim() : '';
          const hasLabelInBody = labelText.length > 0 && safeFinalLines.some(l => String(l || '').trim() === labelText);
          // center label if present and not already printed in the composed footer
          if (labelText && !hasLabelInBody) {
            appendLine(labelText, true, defaultSerialTextSize);
          }

          // Attempt to generate a raster QR for serial/raw path. For 'image' type we
          // don't attempt full image decoding here; fall back to text if raster fails.
          let rasterBuf = Buffer.alloc(0);
          try {
            if ((footerQr.type === 'qr' || footerQr.type === 'link') && footerQr.resolvedValue) {
              // Map footerQr.cellSize (1..8) to a larger raster pixel scale (4..12)
              // so QR prints bigger and easier to scan. Requested is 1..8; map by
              // adding an offset for bigger pixels.
              const requested = Math.max(1, Math.min(8, Number(footerQr.cellSize) || 4));
              const scale = Math.min(12, Math.max(4, Math.round(requested + 4)));
              rasterBuf = buildQrRasterEscPos(footerQr.resolvedValue, scale);
            } else if (footerQr.type === 'image' && footerQr.imageData) {
              // imageData is a data URL; our codepath for general images is handled
              // in printFooterImage for non-serial flows. For serial/raw we attempt
              // to render image if it's small, but that is more complex. We'll try
              // to treat imageData as already a PNG QR (dataURL) by delegating to
              // existing printFooterImage when serial mode is not available.
              rasterBuf = Buffer.alloc(0);
            }
          } catch (e) {
            rasterBuf = Buffer.alloc(0);
          }

          if (rasterBuf && rasterBuf.length) {
            // ensure some spacing before/after raster, then cut
            parts.push(rasterBuf);
            // add a small explicit linefeed to separate image from cutter
            parts.push(Buffer.from([0x0A]));
          } else if (footerQr.resolvedValue) {
            // fallback to printing the QR payload as centered text (keeps margins tight)
            const qrText = String(footerQr.resolvedValue || '');
            const truncated = qrText.length > 64 ? (qrText.slice(0, 28) + '...' + qrText.slice(-28)) : qrText;
            appendLine(truncated, true, 2);
          }
        }

        // finalize: feed 0 then full cut
        parts.push(Buffer.from([0x1B, 0x4A, 0x00])); // ESC J 0
        parts.push(Buffer.from([0x1D, 0x56, 0x00])); // GS V 0 (cut)

        const out = Buffer.concat(parts);
        await this.writeSerial(out);
        // clear composer buffer and return
        this.printer.clear();
        console.log(`[Printer] 🖨️  Receipt printed for ${order.orderId} (serial raw, template: ${receipt.template})`);
        if (!templateId) this.updateStoredTemplate(this.receiptTemplateId);
        return { success: true, message: 'Receipt printed (serial raw)', template: receipt.template };
      }

      // fallback: non-serial flows use composer with structured metadata
      this.printer.alignLeft();

      // Optional header logo (centered) before any text
      const headerLogo = this.getHeaderLogoSetting();
      if (headerLogo) {
        try {
          this.printer.alignCenter();
          await this.printFooterImage(headerLogo);
          this.printer.newLine();
        } catch (e) {
          console.warn('[Printer] Failed to print header logo, continue without it:', e.message);
        }
      }

      const printEntry = (entry) => {
        if (entry.align === 'center') this.printer.alignCenter();
        else if (entry.align === 'right') this.printer.alignRight();
        else this.printer.alignLeft();

        const { width, height } = mapFontMultipliers(entry.font);
        const clampedWidth = Math.max(1, Math.min(8, Math.round(width)));
        const clampedHeight = Math.max(1, Math.min(8, Math.round(height)));
        const n = ((clampedWidth - 1) << 4) | (clampedHeight - 1);
        if (n !== 0) {
          this.printer.add(Buffer.from([0x1D, 0x21, n]));
        }

        this.printer.println(entry.rawText ?? '');

        if (n !== 0) {
          this.printer.add(Buffer.from([0x1D, 0x21, 0x00]));
        }
      };

      safeEntries.forEach(printEntry);
      this.printer.alignLeft();

  // Render QR code at footer only when enabled AND canRender (i.e. payload exists)
  if (footerQr && footerQr.enabled && footerQr.canRender) {
        const type = footerQr.type || 'qr';
        if ((type === 'qr' || type === 'link') && footerQr.value) {
          const qrValue = String(footerQr.value || '').trim();
          if (qrValue) {
            // PERBAIKAN: Hapus spacer sebelum QR untuk margin ketat
            this.printer.alignCenter();
            // Set line spacing to minimum (0/180 inch) to reduce gap after QR
            this.printer.add(Buffer.from([0x1B, 0x33, 0x00])); // ESC 3 0: set line spacing to 0
            const cellSize = this.resolveQrCellSize(footerQr, receipt.width);
            try {
              if (typeof this.printer.printQR === 'function') {
                this.printer.printQR(qrValue, { cellSize });
              } else if (typeof this.printer.qr === 'function') {
                this.printer.qr(qrValue, { size: cellSize });
              } else {
                this.printer.println('[QR]');
              }
            } catch (qrError) {
              console.warn('[Printer] QR render failed, fallback to text:', qrError.message);
              this.printer.println('[QR]');
            }
            this.printer.alignLeft();
            // PERBAIKAN: Cut immediately after QR untuk margin ketat
            this.printer.add(Buffer.from([0x1B, 0x4A, 0x00])); // ESC J 0: feed 0/180 inch before cut
            this.printer.cut();
          }
        } else if (type === 'image' && footerQr.imageData) {
          // PERBAIKAN: Hapus spacer sebelum image QR
          this.printer.alignCenter();
          // Set line spacing to minimum for image QR too
          this.printer.add(Buffer.from([0x1B, 0x33, 0x00])); // ESC 3 0: set line spacing to 0
          try {
            await this.printFooterImage(footerQr.imageData);
          } catch (imageError) {
            console.warn('[Printer] Footer image failed:', imageError.message);
          }
          this.printer.alignLeft();
          // PERBAIKAN: Cut immediately after image QR
          this.printer.add(Buffer.from([0x1B, 0x4A, 0x00])); // ESC J 0: feed 0/180 inch before cut
          this.printer.cut();
        }
      }

      // PERBAIKAN UTAMA: Hapus semua feed lines tambahan jika QR tidak ada
      // TM-58V sudah memiliki margin internal yang cukup
      // Set feed to 0 before cut to minimize gap
      // If QR is not available to render, ensure minimal feed/cut to avoid extra gap
      if (!(footerQr && footerQr.enabled && footerQr.canRender)) {
        this.printer.add(Buffer.from([0x1B, 0x4A, 0x00])); // ESC J 0: feed 0/180 inch before cut
        this.printer.cut();
      }

      // HYBRID SEND
      const buffer = this.printer.getBuffer();
      // Debug: inspect buffer for unexpected leading/trailing feed bytes
      try {
        if (Buffer.isBuffer(buffer)) {
          const len = buffer.length;
          const head = buffer.slice(0, Math.min(12, len)).toString('hex');
          const tail = buffer.slice(Math.max(0, len - 12), len).toString('hex');
          console.info(`[PrinterDebug] test buffer len=${len}, head=0x${head}, tail=0x${tail}`);
        }
      } catch (_) {}
      // Debug: inspect buffer for unexpected leading/trailing feed bytes
      try {
        if (Buffer.isBuffer(buffer)) {
          const len = buffer.length;
          const head = buffer.slice(0, Math.min(12, len)).toString('hex');
          const tail = buffer.slice(Math.max(0, len - 12), len).toString('hex');
          console.info(`[PrinterDebug] prepared buffer len=${len}, head=0x${head}, tail=0x${tail}`);
        }
      } catch (_) {}
      if (this.mode === 'serial') {
        // Trim trailing newline bytes (LF/CR) which can create large blank gaps on some printers
        let trimmed = Buffer.from(buffer);
        let trimCount = 0;
        while (trimmed.length > 0) {
          const last = trimmed[trimmed.length - 1];
          if (last === 0x0A || last === 0x0D) {
            trimmed = trimmed.slice(0, trimmed.length - 1);
            trimCount++;
            continue;
          }
          break;
        }
        if (trimCount) console.info(`[PrinterDebug] trimmed ${trimCount} trailing newline byte(s) from serial buffer`);
        await this.writeSerial(trimmed);
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
        this.updateStoredTemplate(this.receiptTemplateId);
      }

      return { success: true, message: 'Receipt printed successfully', template: receipt.template };
    } catch (error) {
      console.error('[Printer] ❌ Failed to print:', error.message);
      throw error;
    }
  }
  /**
   * Resolve QR cell size to use for printer QR rendering.
   * Prefer explicit footerQr.cellSize when provided (clamped 1..8),
   * otherwise derive a reasonable default from receipt width.
   */
  resolveQrCellSize(footerQr = {}, receiptWidth = 32) {
    try {
      const requested = Number(footerQr?.cellSize);
      if (Number.isFinite(requested) && requested >= 1 && requested <= 10) {
        // Clamp further to 1..8 which is widely supported by ESC/POS printers
        return Math.min(8, Math.max(1, Math.round(requested)));
      }
    } catch (_) {}

    // Fallback heuristics: choose larger cell size for narrower receipts
    // receiptWidth is expected in characters (e.g., 32 for 58mm, 48 for 80mm)
    const width = Number(receiptWidth) || 32;
    if (width <= 32) return 4; // medium size for 58mm
    if (width <= 48) return 3; // slightly smaller for 80mm wide layouts
    return 2; // conservative default
  }

  /**
   * Print footer image (data URL) by writing a temporary file and delegating
   * to node-thermal-printer if an image printing API is available.
   * If image printing is not supported in the current mode, this returns a
   * rejected Promise which will be handled by the caller (fallback to label).
   */
  async printFooterImage(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      throw new Error('Invalid image data for footer');
    }

    // If the printer library supports printImage(filePath) we will attempt to use it.
    const hasPrintImage = typeof this.printer.printImage === 'function' || typeof this.printer.printImageBuffer === 'function';
    if (!hasPrintImage) {
      throw new Error('Printer library does not support image printing in this environment');
    }

    // Decode base64 portion
    const matches = dataUrl.match(/^data:(image\/.+?);base64,(.+)$/);
    if (!matches) throw new Error('Unsupported image data URL format');
    const mime = matches[1];
    const b64 = matches[2];
    const buffer = Buffer.from(b64, 'base64');

    const ext = mime.split('/')[1].split(';')[0] || 'png';
    const tmpPath = path.join(os.tmpdir(), `printer-footer-${Date.now()}.${ext}`);

    try {
      fs.writeFileSync(tmpPath, buffer);
      if (typeof this.printer.printImage === 'function') {
        // Some versions expect a file path
        await this.printer.printImage(tmpPath);
      } else if (typeof this.printer.printImageBuffer === 'function') {
        await this.printer.printImageBuffer(buffer);
      }

      // If using tcp mode, execute to flush buffer
      if (this.mode === 'tcp') {
        await this.printer.execute();
      }

      return true;
    } catch (e) {
      // Bubble up so caller can fallback
      throw e;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
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
    const position = this.settings.qrPosition || 'after-footer';

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
      position,
      defaultValue: fallbackValue,
      defaultLabel: DEFAULT_FOOTER_QR_LABEL
    };
  }

  setFooterQrSetting({ enabled, value, label, type, imageData, cellSize, position } = {}) {
    this.settings = this.settings || {};
    if (typeof enabled !== 'undefined') {
      // Coerce string values like 'true'/'false' from client UI into booleans.
      if (typeof enabled === 'string') {
        const lowered = enabled.toLowerCase().trim();
        this.settings.footerQrEnabled = (lowered === 'true' || lowered === '1');
      } else {
        this.settings.footerQrEnabled = !!enabled;
      }
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
    if (typeof position !== 'undefined') {
      const sanitizedPosition = ['after-footer', 'before-footer'].includes(position) ? position : 'after-footer';
      this.settings.qrPosition = sanitizedPosition;
    }
    saveSettings(this.settings);
    return this.getFooterQrSetting();
  }

  // Header logo helpers (PNG data URL stored in settings.headerLogoImageData)
  getHeaderLogoSetting() {
    this.settings = this.settings || {};
    const data = this.settings.headerLogoImageData || '';
    return typeof data === 'string' && data.startsWith('data:image') ? data : '';
  }

  setHeaderLogoSetting(dataUrl) {
    this.settings = this.settings || {};
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      this.settings.headerLogoImageData = dataUrl;
    } else if (!dataUrl) {
      this.settings.headerLogoImageData = '';
    }
    saveSettings(this.settings);
    return this.getHeaderLogoSetting();
  }

  getCustomText() {
    this.settings = this.settings || {};
    const allowedFonts = new Set(['normal', 'double-height', 'double-width', 'double']);
    const allowedAlignments = new Set(['left', 'center', 'right']);

    const rawHeaderLines = Array.isArray(this.settings.customHeaderLines)
      ? this.settings.customHeaderLines
      : [];

    const normalizedHeaderLines = rawHeaderLines
      .map((line) => {
        if (!line) return null;
        const text = String(line.text ?? '').trim();
        if (!text) return null;
        const font = allowedFonts.has(line.font) ? line.font : 'normal';
        const align = allowedAlignments.has(line.align) ? line.align : 'center';
        return { text, font, align };
      })
      .filter(Boolean);

    const fallbackHeaderLines = (String(this.settings.customHeaderText || '')
      .split(/\r?\n/)
      .map((line) => {
        const text = String(line || '').trim();
        if (!text) return null;
        return { text, font: 'normal', align: 'center' };
      })
      .filter(Boolean));

    const customHeaderLines = normalizedHeaderLines.length
      ? normalizedHeaderLines
      : fallbackHeaderLines;

    return {
      headerPreset: this.settings.headerPreset || 'shop-name',
      footerPreset: this.settings.footerPreset || 'thank-you',
      customHeaderText: this.settings.customHeaderText || '',
      customFooterText: this.settings.customFooterText || '',
      customHeaderLines,
      lineSpacing: this.settings.lineSpacing || 'normal',
      showHeaderSeparator: this.settings.showHeaderSeparator !== false,
      showFooterSeparator: this.settings.showFooterSeparator !== false,
      showOrderId: this.settings.showOrderId !== false,
      showTime: this.settings.showTime !== false,
      showCustomer: this.settings.showCustomer !== false,
      showPaymentMethod: this.settings.showPaymentMethod !== false,
      showItemNotes: this.settings.showItemNotes !== false,
      showItemAddons: this.settings.showItemAddons !== false,
      detailedItemBreakdown: this.settings.detailedItemBreakdown !== false
    };
  }

  setCustomText(params = {}) {
    this.settings = this.settings || {};
    // Still save custom text for the 'custom' preset option
    if (params.customHeaderText !== undefined) this.settings.customHeaderText = String(params.customHeaderText || '');
    if (params.customFooterText !== undefined) this.settings.customFooterText = String(params.customFooterText || '');

    if (params.customHeaderLines !== undefined) {
      if (Array.isArray(params.customHeaderLines)) {
        const allowedFonts = new Set(['normal', 'double-height', 'double-width', 'double']);
        const allowedAlignments = new Set(['left', 'center', 'right']);
        const sanitized = params.customHeaderLines
          .map((line) => {
            if (!line) return null;
            const text = String(line.text ?? '').trim();
            if (!text) return null;
            const font = allowedFonts.has(line.font) ? line.font : 'normal';
            const align = allowedAlignments.has(line.align) ? line.align : 'center';
            return { text, font, align };
          })
          .filter(Boolean);
        this.settings.customHeaderLines = sanitized;
        if (sanitized.length && params.customHeaderText === undefined) {
          this.settings.customHeaderText = sanitized.map(line => line.text).join('\n');
        }
      } else if (params.customHeaderLines === null) {
        this.settings.customHeaderLines = [];
      }
    }
    
    if (params.headerPreset) this.settings.headerPreset = params.headerPreset;
    if (params.footerPreset) this.settings.footerPreset = params.footerPreset;
    if (params.lineSpacing) this.settings.lineSpacing = params.lineSpacing;
    if (params.showHeaderSeparator !== undefined) this.settings.showHeaderSeparator = !!params.showHeaderSeparator;
    if (params.showFooterSeparator !== undefined) this.settings.showFooterSeparator = !!params.showFooterSeparator;
    // Section & details
    if (params.showOrderId !== undefined) this.settings.showOrderId = !!params.showOrderId;
    if (params.showTime !== undefined) this.settings.showTime = !!params.showTime;
    if (params.showCustomer !== undefined) this.settings.showCustomer = !!params.showCustomer;
    if (params.showPaymentMethod !== undefined) this.settings.showPaymentMethod = !!params.showPaymentMethod;
    if (params.showItemNotes !== undefined) this.settings.showItemNotes = !!params.showItemNotes;
    if (params.showItemAddons !== undefined) this.settings.showItemAddons = !!params.showItemAddons;
    if (params.detailedItemBreakdown !== undefined) this.settings.detailedItemBreakdown = !!params.detailedItemBreakdown;
    
    saveSettings(this.settings);
    return this.getCustomText();
  }

  async composeReceipt(order, optionsOrTemplateId) {
    const isOptions = typeof optionsOrTemplateId === 'object' && optionsOrTemplateId !== null;
    const activeTemplate = isOptions 
      ? optionsOrTemplateId.receiptTemplate 
      : (optionsOrTemplateId && RECEIPT_TEMPLATES[optionsOrTemplateId] ? optionsOrTemplateId : this.receiptTemplateId);

    const baseSettings = this.getCustomText();
    const settings = isOptions
      ? { ...baseSettings, ...optionsOrTemplateId }
      : baseSettings;

    const maybeCustom = this.getUseCustomTemplate() ? this.getCustomTemplate(activeTemplate) : '';

    const persistedQr = this.getFooterQrSetting();
    const requestQr = isOptions && optionsOrTemplateId && typeof optionsOrTemplateId.footerQr === 'object'
      ? optionsOrTemplateId.footerQr
      : {};

    const qrSettingsSource = isOptions
      ? {
          ...persistedQr,
          ...requestQr,
          enabled: requestQr.enabled !== undefined ? !!requestQr.enabled : persistedQr.enabled,
          type: requestQr.type || persistedQr.type,
          label: requestQr.label !== undefined ? requestQr.label : persistedQr.label,
          cellSize: requestQr.cellSize !== undefined ? requestQr.cellSize : persistedQr.cellSize,
          position: requestQr.position || persistedQr.position,
          imageData: requestQr.imageData !== undefined ? requestQr.imageData : persistedQr.imageData,
          value: requestQr.value !== undefined ? requestQr.value : (requestQr.content !== undefined ? requestQr.content : persistedQr.value),
          resolvedValue: requestQr.content !== undefined ? requestQr.content : persistedQr.resolvedValue,
        }
      : persistedQr;

    const normalizeContent = (val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length ? trimmed : undefined;
      }
      return val;
    };

    const fallbackContent = normalizeContent(qrSettingsSource.resolvedValue) ??
      normalizeContent(qrSettingsSource.value) ??
      normalizeContent(qrSettingsSource.defaultValue);

    const requestedContent = normalizeContent(requestQr.content);
    const requestedValue = normalizeContent(requestQr.value);

    let effectiveImageData = qrSettingsSource.type === 'image'
      ? normalizeContent(qrSettingsSource.imageData) ?? normalizeContent(persistedQr.imageData)
      : qrSettingsSource.imageData;

    let qrContent = '';
    if (qrSettingsSource.type === 'image') {
      qrContent = effectiveImageData || '';
    } else {
      qrContent = requestedContent ?? requestedValue ?? fallbackContent ?? '';
    }

    const hasQrPayload = qrSettingsSource.type === 'image'
      ? !!effectiveImageData
      : !!qrContent;

    const footerQr = {
      ...qrSettingsSource,
      imageData: qrSettingsSource.type === 'image' ? (effectiveImageData || '') : qrSettingsSource.imageData,
      value: qrContent,
      resolvedValue: qrContent || fallbackContent || ''
    };
    // Preserve the user's toggle (enabled) and provide a derived flag (canRender)
    // so callers can distinguish between "user wants QR" and "QR has payload".
    footerQr.enabled = !!qrSettingsSource.enabled;
    footerQr.canRender = footerQr.enabled && hasQrPayload;

    const receipt = formatReceipt(order, activeTemplate, {
      ...settings,
      customTemplateText: maybeCustom,
      footerQr
    });
    receipt.footerQr = footerQr;
    
  // Generate base64 QR for preview if enabled and renderable
  if (footerQr.canRender && footerQr.value && (footerQr.type === 'qr' || footerQr.type === 'link')) {
      try {
        receipt.footerQrBase64 = await QRCode.toDataURL(footerQr.value, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 180, // Consistent preview sizing
        });
      } catch (e) {
        console.error('[Printer] Failed to generate QR data URL for preview:', e.message);
        receipt.footerQrBase64 = '';
      }
  } else if (footerQr.canRender && footerQr.type === 'image' && footerQr.imageData) {
      receipt.footerQrBase64 = footerQr.imageData;
    }
    
    receipt.previewText = receipt.text;
    try {
      receipt.htmlPreview = this.buildHtmlPreview(order, receipt);
    } catch (htmlError) {
      console.warn('[Printer] Failed to build HTML preview:', htmlError.message);
      receipt.htmlPreview = '';
    }
    
    return receipt;
  }

  async composeSampleReceipt(options) {
    const sampleOrder = this.buildSampleOrder();
    return await this.composeReceipt(sampleOrder, options);
  }

  buildHtmlPreview(_order, receipt) {
    const width = Number(receipt?.width || 32);
    const headerLogo = this.getHeaderLogoSetting();

    const logoHtml = headerLogo
      ? `<div style="display:flex;justify-content:center;margin-bottom:8px;"><img src="${headerLogo}" alt="Logo" style="max-height:40px;max-width:${width}ch;object-fit:contain;" /></div>`
      : '';

    const entries = Array.isArray(receipt?.structuredLines) && receipt.structuredLines.length
      ? receipt.structuredLines
      : (Array.isArray(receipt?.lines) ? receipt.lines.map((t) => ({ displayText: t, font: 'normal' }))
         : String(receipt?.text || '').split(/\r?\n/).map((t) => ({ displayText: t, font: 'normal' })));

    const lineHtml = entries.map((entry) => {
      const font = entry?.font || 'normal';
      let extra = '';
      if (font === 'double' || font === 'double-height') {
        extra = 'font-size:14px;line-height:1.6;font-weight:600;';
      } else if (font === 'double-width') {
        extra = 'letter-spacing:0.15ch;font-weight:600;';
      }
      const text = escapeHtml(String(entry?.displayText ?? ''));
      return `<div style="white-space:pre;font-family:'JetBrains Mono','Consolas',monospace;font-size:12px;line-height:1.45;color:#111827;${extra}">${text}</div>`;
    }).join('');

    const qrImg = (receipt?.footerQr && receipt.footerQr.enabled && receipt.footerQrBase64)
      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:8px;">
           <img src="${escapeAttr(receipt.footerQrBase64)}" alt="QR Code" style="height:112px;width:112px;border:1px solid rgba(148,163,184,0.35);border-radius:8px;background:#fff;padding:4px" />
           <div style="font-family:'JetBrains Mono','Consolas',monospace;font-size:11px;color:#6b7280;">${escapeHtml(receipt.footerQr?.label || 'Scan QR')}</div>
         </div>`
      : '';

    return `
      <div style="width:100%;display:flex;justify-content:center;">
        <div style="max-width:${width + 4}ch;background:#ffffff;border-radius:16px;border:1px solid rgba(148,163,184,0.35);padding:16px 18px 20px 18px;box-shadow:0 18px 40px -28px rgba(51,51,51,0.45);overflow:hidden;">
          ${logoHtml}
          ${lineHtml}
          ${qrImg}
        </div>
      </div>`;
  }

  async printSampleReceipt(templateId) {
    const sampleOrder = this.buildSampleOrder();
    return await this.printReceipt(sampleOrder, templateId);
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
      // PERBAIKAN: Set line spacing minimum dan cut langsung tanpa extra spacing
      this.printer.add(Buffer.from([0x1B, 0x33, 0x00])); // ESC 3 0: set line spacing to 0
      this.printer.add(Buffer.from([0x1B, 0x4A, 0x00])); // ESC J 0: feed 0/180 inch before cut
      this.printer.cut();

      const buffer = this.printer.getBuffer();
      if (this.mode === 'serial') {
        // Trim trailing newline bytes (LF/CR) which can create large blank gaps on some printers
        let trimmed = Buffer.from(buffer);
        let trimCount = 0;
        while (trimmed.length > 0) {
          const last = trimmed[trimmed.length - 1];
          if (last === 0x0A || last === 0x0D) {
            trimmed = trimmed.slice(0, trimmed.length - 1);
            trimCount++;
            continue;
          }
          break;
        }
        if (trimCount) console.info(`[PrinterDebug] trimmed ${trimCount} trailing newline byte(s) from serial buffer`);
        await this.writeSerial(trimmed);
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

    // Normalize buffer: trim trailing LF/CR, ensure minimal init commands at start
    let payload = Buffer.from(buffer || []);

    // Trim trailing LF/CR which often create extra blank lines
    while (payload.length > 0) {
      const last = payload[payload.length - 1];
      if (last === 0x0A || last === 0x0D) {
        payload = payload.slice(0, payload.length - 1);
        continue;
      }
      break;
    }

    // Remove leading LF/CR as well
    while (payload.length > 0) {
      const first = payload[0];
      if (first === 0x0A || first === 0x0D) {
        payload = payload.slice(1);
        continue;
      }
      break;
    }

    // Ensure ESC @ (initialize) and ESC 3 0 (line spacing 0) at start for tight margins
    const escAt = Buffer.from([0x1B, 0x40]);
    const esc33 = Buffer.from([0x1B, 0x33, 0x00]);
    const needsPrefix = !(payload.length >= 2 && payload[0] === 0x1B && payload[1] === 0x40);
    if (needsPrefix) {
      payload = Buffer.concat([escAt, esc33, payload]);
    }

    // Debug log payload shape
    try {
      const len = payload.length;
      const head = payload.slice(0, Math.min(12, len)).toString('hex');
      const tail = payload.slice(Math.max(0, len - 12), len).toString('hex');
      console.info(`[PrinterDebug] serial payload len=${len}, head=0x${head}, tail=0x${tail}`);
    } catch (_) {}

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
        port.write(payload, (writeErr) => {
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
