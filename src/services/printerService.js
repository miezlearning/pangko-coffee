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

      // Build final lines array and ensure no trailing blank lines remain
      const finalLines = [].concat(header, info, items, totals, footer).map(l => String(l || ''));
      while (finalLines.length && finalLines[finalLines.length - 1].trim() === '') finalLines.pop();

      // Collapse runs of empty lines to a single empty line to avoid large vertical gaps
      const collapsed = [];
      for (const ln of finalLines) {
        if (String(ln).trim() === '') {
          if (collapsed.length === 0 || String(collapsed[collapsed.length - 1]).trim() !== '') {
            collapsed.push('');
          }
        } else {
          collapsed.push(ln);
        }
      }
      
      const safeFinalLines = collapsed;
      // PERBAIKAN: Pastikan tidak ada empty line di akhir yang menyebabkan gap
      while (safeFinalLines.length > 0 && String(safeFinalLines[safeFinalLines.length - 1]).trim() === '') {
        safeFinalLines.pop();
      }
      const lastPrintedLine = safeFinalLines.length ? safeFinalLines[safeFinalLines.length - 1] : '';

      // If using serial mode, send a minimal raw ESC/POS payload (same concept as scripts/printTest-tight.js)
      if (this.mode === 'serial') {
        const parts = [];
        // ESC @, ESC 3 0 (line spacing 0)
        parts.push(Buffer.from([0x1B, 0x40]));
        parts.push(Buffer.from([0x1B, 0x33, 0x00]));

        // appendLine supports optional size multiplier (1..8). It emits GS ! n to set
        // character width/height multipliers before printing, and resets after.
        const appendLine = (text, alignCenter = false, size = 1) => {
          if (alignCenter) parts.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1
          else parts.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0
          const sz = Math.max(1, Math.min(8, parseInt(size, 10) || 1));
          if (sz !== 1) {
            // GS ! n where n = (width-1)<<4 | (height-1)
            const n = ((sz - 1) << 4) | (sz - 1);
            parts.push(Buffer.from([0x1D, 0x21, n]));
          }
          parts.push(Buffer.from(String(text || ''), 'ascii'));
          parts.push(Buffer.from([0x0A])); // LF
          if (sz !== 1) {
            // reset to normal size
            parts.push(Buffer.from([0x1D, 0x21, 0x00]));
          }
        };

        // allow optional per-config default text size for serial prints
        const defaultSerialTextSize = (this.config && Number(this.config.serialTextSize)) ? Math.max(1, Math.min(8, Number(this.config.serialTextSize))) : 1;
        if (safeFinalLines.length) {
          if (header.length && safeFinalLines[0]) {
            // Print header using the same default serial text size so it matches other lines
            const headerText = String(safeFinalLines[0] || '').trim();
            appendLine(headerText, true, defaultSerialTextSize);
            safeFinalLines.slice(1).forEach(line => appendLine(line, false, defaultSerialTextSize));
          } else {
            safeFinalLines.forEach(line => appendLine(line, false, defaultSerialTextSize));
          }
        }

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

      // fallback: non-serial flows use composer as before
      this.printer.alignLeft();
      
      // Print using the composed safeFinalLines to avoid accidental extra lines
      if (safeFinalLines.length) {
        if (header.length) {
          this.printer.bold(true);
          this.printer.println(safeFinalLines[0]);
          this.printer.bold(false);
          safeFinalLines.slice(1).forEach(line => this.printer.println(line));
        } else {
          safeFinalLines.forEach(line => this.printer.println(line));
        }
      }

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

  getCustomText() {
    this.settings = this.settings || {};
    return {
      headerPreset: this.settings.headerPreset || 'shop-name',
      footerPreset: this.settings.footerPreset || 'thank-you',
      customHeaderText: this.settings.customHeaderText || '',
      customFooterText: this.settings.customFooterText || '',
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

    const settings = isOptions ? optionsOrTemplateId : this.getCustomText();

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
      resolvedValue: qrContent || fallbackContent || '',
      enabled: qrSettingsSource.enabled && hasQrPayload,
    };
    // Expose a canonical "canRender" flag which explicitly means there is
    // both an enabled setting and a payload available to render. Other
    // consumers (formatter / print paths) should guard on this to avoid
    // inserting labels or images when QR printing is disabled.
    footerQr.canRender = !!(footerQr.enabled);

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
    const meta = receipt && receipt.meta ? receipt.meta : null;
    const safeText = escapeHtml(receipt?.previewText || receipt?.text || '');

    if (!meta || !meta.shop || !meta.order) {
      return `
        <div style="width:100%;display:flex;justify-content:center;">
          <div style="max-width:320px;background:#ffffff;border-radius:18px;border:1px solid rgba(148,163,184,0.3);padding:18px;box-shadow:0 30px 60px -45px rgba(51,51,51,0.4);">
            <pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;color:#111827;white-space:pre-wrap;">${safeText}</pre>
          </div>
        </div>`;
    }

    const shop = meta.shop || {};
    const orderMeta = meta.order || {};
    const totals = meta.totals || {};
    const items = Array.isArray(meta.items) ? meta.items : [];
    const footerInfo = meta.footer || {};
    const footerQr = receipt.footerQr || {};
    const qrImageSrc = typeof receipt.footerQrBase64 === 'string' && receipt.footerQrBase64.startsWith('data:image')
      ? receipt.footerQrBase64
      : '';

    const infoRows = [];
    if (orderMeta.id) infoRows.push({ label: 'No. Order', value: orderMeta.id });
    if (orderMeta.createdAtLabel) infoRows.push({ label: 'Tanggal', value: orderMeta.createdAtLabel });
    if (orderMeta.createdAtTime) infoRows.push({ label: 'Jam', value: orderMeta.createdAtTime });
    if (orderMeta.customerName) infoRows.push({ label: 'Customer', value: orderMeta.customerName });
    if (orderMeta.paymentMethodLabel) infoRows.push({ label: 'Pembayaran', value: orderMeta.paymentMethodLabel });
    if (orderMeta.tableName) infoRows.push({ label: 'Meja', value: orderMeta.tableName });
    if (orderMeta.additionalInfo) infoRows.push({ label: 'Catatan', value: orderMeta.additionalInfo });

    const infoRowsHtml = infoRows.map(row => (
      `<div style="display:flex;justify-content:space-between;font-size:12px;color:#4b5563;margin-bottom:4px;">
        <span>${escapeHtml(row.label)}</span>
        <span style="font-weight:600;">${escapeHtml(row.value)}</span>
      </div>`
    )).join('');

    const itemsHtml = items.length
      ? items.map((item, index) => {
          const addons = Array.isArray(item.addons) ? item.addons : [];
          const addonsHtml = addons.map(addon => (
            `<div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:3px;">
              <span>+ ${escapeHtml(addon.name)} x${escapeHtml(addon.quantity)}</span>
              <span>${escapeHtml(addon.totalFormatted || '')}</span>
            </div>`
          )).join('');
          const notesHtml = item.notes
            ? `<div style="margin-top:4px;font-size:11px;color:#f97316;">Catatan: ${escapeHtml(item.notes)}</div>`
            : '';
          const borderStyle = index === items.length - 1 ? '' : 'border-bottom:1px dashed #e5e7eb;';
          return `
            <div style="padding:12px 0;${borderStyle}">
              <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#1f2937;">
                <span>${escapeHtml(item.name)}</span>
                <span>${escapeHtml(item.subtotalFormatted || '')}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-top:4px;">
                <span>${escapeHtml(item.quantity)} × ${escapeHtml(item.unitPriceFormatted || '')}</span>
                <span></span>
              </div>
              ${addonsHtml}
              ${notesHtml}
            </div>`;
        }).join('')
      : `<div style="padding:16px;border:1px dashed #d1d5db;border-radius:12px;font-size:12px;color:#6b7280;text-align:center;">Belum ada item dalam order</div>`;

    const feeLine = totals.fee > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#047857;margin-top:6px;"><span>Biaya</span><span>${escapeHtml(totals.feeFormatted || '')}</span></div>`
      : '';
    const discountLine = totals.discount > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#b91c1c;margin-top:6px;"><span>Diskon</span><span>- ${escapeHtml(totals.discountFormatted || '')}</span></div>`
      : '';
    const totalsHtml = `
      <div style="margin-top:16px;padding:16px;border:1px solid rgba(34,197,94,0.35);border-radius:14px;background:rgba(34,197,94,0.08);">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#047857;">
          <span>Subtotal</span>
          <span>${escapeHtml(totals.subtotalFormatted || '')}</span>
        </div>
        ${feeLine}
        ${discountLine}
        <div style="margin-top:10px;padding:10px 12px;border-radius:12px;background:#16a34a;color:#ffffff;display:flex;justify-content:space-between;font-size:14px;font-weight:700;">
          <span>Total</span>
          <span>${escapeHtml(totals.totalFormatted || '')}</span>
        </div>
      </div>`;

  let qrHtml = '';
  // Only show QR preview when enabled and there is a renderable image payload
  if (footerQr && footerQr.enabled && footerQr.canRender && qrImageSrc) {
      const label = footerQr.label ? escapeHtml(footerQr.label) : 'Scan QR di bawah ini';
      let linkHtml = '';
      if (footerQr.type === 'link' && footerQr.value) {
        const truncated = truncateMiddle(footerQr.value, 56);
        const href = escapeAttr(footerQr.value);
        linkHtml = `<a href="${href}" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:11px;color:#2563eb;word-break:break-word;">${escapeHtml(truncated)}</a>`;
      } else if ((footerQr.type === 'qr' || footerQr.type === 'text') && footerQr.value && isLikelyUrl(footerQr.value)) {
        const truncated = truncateMiddle(footerQr.value, 56);
        const href = escapeAttr(footerQr.value);
        linkHtml = `<a href="${href}" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:11px;color:#2563eb;word-break:break-word;">${escapeHtml(truncated)}</a>`;
      }
      qrHtml = `
        <div style="margin-top:18px;padding:18px;border:1px dashed #d1d5db;border-radius:16px;text-align:center;background:#f9fafb;">
          <div style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.12em;">${label}</div>
          ${linkHtml}
          <img src="${qrImageSrc}" alt="QR Code" style="margin-top:12px;width:150px;height:150px;border-radius:12px;border:1px solid #e5e7eb;display:inline-block;background:#ffffff;padding:10px;" />
        </div>`;
    }

    const footerLines = Array.isArray(footerInfo.lines)
      ? footerInfo.lines.filter(line => line && !/^[-=\s]+$/.test(String(line).trim()))
      : [];
    const footerHtml = footerLines.length
      ? `<div style="margin-top:18px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.4;">
          ${footerLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
        </div>`
      : '';

    const headerSubtitleParts = [];
    if (shop.address) headerSubtitleParts.push(formatMultiline(shop.address));
    if (shop.phone) headerSubtitleParts.push(escapeHtml(shop.phone));
    const headerSubtitle = headerSubtitleParts.join('<br />');

    return `
      <div style="width:100%;display:flex;justify-content:center;">
        <div style="width:100%;max-width:320px;background:#ffffff;border-radius:22px;border:1px solid rgba(148,163,184,0.35);box-shadow:0 30px 60px -45px rgba(51,51,51,0.45);overflow:hidden;">
          <div style="background:#16a34a;color:#ffffff;text-align:center;padding:18px 22px;">
            <div style="font-size:18px;font-weight:700;letter-spacing:0.02em;">${escapeHtml(shop.name || 'Struk Pembayaran')}</div>
            ${headerSubtitle ? `<div style="margin-top:6px;font-size:11px;opacity:0.9;line-height:1.5;">${headerSubtitle}</div>` : ''}
          </div>
          <div style="padding:20px 22px;font-family:'Manrope','Segoe UI',sans-serif;color:#111827;">
            ${infoRowsHtml ? `<div style="margin-bottom:16px;">${infoRowsHtml}</div>` : ''}
            <div>${itemsHtml}</div>
            ${totalsHtml}
            ${qrHtml}
            ${footerHtml}
          </div>
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
