const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../data/printer-settings.json');
const DEFAULT_SETTINGS = {
  receiptTemplate: '58mm',
  // Deprecated but kept for backward compatibility and potential future use
  customHeaderText: '',
  customFooterText: '',
  useCustomTemplate: false,
  customTemplates: {},
  // End Deprecated
  
  footerQrEnabled: false,
  footerQrValue: '',
  footerQrLabel: 'Scan QR di bawah ini',
  footerQrType: 'qr',
  footerQrImageData: '',
  footerQrCellSize: 2,
  
  // Advanced text formatting
  headerAlign: 'center',
  footerAlign: 'center',
  headerFontSize: 'normal',
  footerFontSize: 'normal',
  lineSpacing: 'normal',
  qrPosition: 'after-footer',

  // Section visibility & detail controls
  showHeaderSeparator: true,
  showFooterSeparator: true,
  showOrderId: true,
  showTime: true,
  showCustomer: true,
  showPaymentMethod: true,
  showItemNotes: true,
  showItemAddons: true,
  detailedItemBreakdown: true
};

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.error('[PrinterSettings] Failed to load settings, using defaults:', error.message);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    ensureDirExists(SETTINGS_PATH);
    const payload = JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }, null, 2);
    fs.writeFileSync(SETTINGS_PATH, payload, 'utf-8');
    return true;
  } catch (error) {
    console.error('[PrinterSettings] Failed to save settings:', error.message);
    return false;
  }
}

module.exports = {
  SETTINGS_PATH,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
};
