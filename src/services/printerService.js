/**
 * Printer Service
 * Handle thermal printer & cash drawer operations
 */
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;
const moment = require('moment-timezone');

class PrinterService {
  constructor() {
    this.printer = null;
    this.isConnected = false;
    this.config = null;
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

      this.printer = new ThermalPrinter({
        type: printerType,
        interface: config.interface || 'tcp://192.168.1.100',
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "=",
        options: {
          timeout: 5000
        }
      });
      
      this.isConnected = true;
      console.log(`[Printer] ✅ Connected to ${config.type} at ${config.interface}`);
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

    if (!this.config?.autoOpenDrawer) {
      console.log('[Printer] Cash drawer opening disabled in config');
      return { success: true, message: 'Cash drawer opening disabled' };
    }

    try {
      // ESC/POS command to open cash drawer: ESC p m t1 t2
      // m=0 (pin 2), t1=120, t2=240 (pulse duration)
      this.printer.openCashDrawer();
      await this.printer.execute();
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
  async printReceipt(order) {
    if (!this.isConnected) {
      throw new Error('Printer not connected');
    }

    try {
      const config = require('../config/config');
      const tz = config.bot?.timezone || 'Asia/Makassar';
      const time = moment(order.createdAt).tz(tz).format('DD/MM/YYYY HH:mm');
      const shopName = config.bot?.shopName || 'PANGKO COFFEE';

      this.printer.alignCenter();
      this.printer.setTextSize(1, 1);
      this.printer.bold(true);
      this.printer.println(shopName);
      this.printer.bold(false);
      this.printer.setTextSize(0, 0);
      this.printer.println('Jl. Contoh No. 123');
      this.printer.println('Telp: 0812-3456-7890');
      this.printer.drawLine();
      
      this.printer.alignLeft();
      this.printer.println(`Order ID: ${order.orderId}`);
      this.printer.println(`Waktu   : ${time}`);
      this.printer.println(`Pelanggan: ${order.customerName || 'Guest'}`);
      this.printer.println(`Metode  : ${order.paymentMethod === 'QRIS' ? 'QRIS' : 'Tunai'}`);
      this.printer.drawLine();

      // Items
      this.printer.println('Item');
      for (const item of order.items) {
        const name = (item.name || 'Item').substring(0, 20);
        this.printer.println(`${name}`);
        
        const qty = item.quantity || 1;
        const price = item.price || 0;
        const subtotal = price * qty;
        
        const qtyStr = `${qty}x`.padStart(4);
        const priceStr = this.formatRupiah(price).padStart(12);
        const subtotalStr = this.formatRupiah(subtotal).padStart(12);
        
        this.printer.println(`  ${qtyStr} @${priceStr} ${subtotalStr}`);
        
        if (item.notes) {
          this.printer.println(`  Note: ${item.notes}`);
        }
      }

      this.printer.drawLine();
      
      // Calculate totals
      const subtotal = order.items.reduce((sum, item) => 
        sum + ((item.price || 0) * (item.quantity || 1)), 0);
      const fee = order.pricing?.fee || 0;
      const discount = order.pricing?.discount || 0;
      const total = order.pricing?.total || subtotal;

      // Subtotal
      this.printer.tableCustom([
        { text: "Subtotal", align: "LEFT", width: 0.5 },
        { text: this.formatRupiah(subtotal), align: "RIGHT", width: 0.5 }
      ]);

      // Fee
      if (fee > 0) {
        this.printer.tableCustom([
          { text: "Biaya", align: "LEFT", width: 0.5 },
          { text: this.formatRupiah(fee), align: "RIGHT", width: 0.5 }
        ]);
      }

      // Discount
      if (discount > 0) {
        this.printer.tableCustom([
          { text: "Diskon", align: "LEFT", width: 0.5 },
          { text: `- ${this.formatRupiah(discount)}`, align: "RIGHT", width: 0.5 }
        ]);
      }

      this.printer.drawLine();
      
      // Total
      this.printer.bold(true);
      this.printer.setTextSize(1, 1);
      this.printer.tableCustom([
        { text: "TOTAL", align: "LEFT", width: 0.5 },
        { text: this.formatRupiah(total), align: "RIGHT", width: 0.5 }
      ]);
      this.printer.bold(false);
      this.printer.setTextSize(0, 0);

      this.printer.drawLine();
      this.printer.alignCenter();
      this.printer.println('Terima kasih!');
      this.printer.println('Selamat menikmati ☕');
      this.printer.newLine();
      this.printer.newLine();
      this.printer.cut();

      await this.printer.execute();
      console.log(`[Printer] 🖨️  Receipt printed for ${order.orderId}`);
      
      return { success: true, message: 'Receipt printed successfully' };
    } catch (error) {
      console.error('[Printer] ❌ Failed to print:', error.message);
      throw error;
    }
  }

  /**
   * Print receipt and open cash drawer
   */
  async printAndOpenDrawer(order) {
    try {
      // Print receipt first
      await this.printReceipt(order);
      
      // Then open cash drawer
      if (this.config?.autoOpenDrawer) {
        await this.openCashDrawer();
      }
      
      return { success: true, message: 'Receipt printed and drawer opened' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Format number to Rupiah
   */
  formatRupiah(amount) {
    return `Rp ${(amount || 0).toLocaleString('id-ID')}`;
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
      
      await this.printer.execute();
      return { success: true, message: 'Test print successful' };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new PrinterService();
