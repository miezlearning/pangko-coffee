const path = require('path');
const moment = require('moment-timezone');
const config = require('../config/config');

const DEFAULT_TEMPLATE_ID = '58mm';

const RECEIPT_TEMPLATES = {
  '58mm': {
    id: '58mm',
    label: '55-58mm',
    width: 32,
    description: 'Thermal roll 55/58mm (≈32 karakter)',
  },
  '80mm': {
    id: '80mm',
    label: '80mm',
    width: 48,
    description: 'Thermal roll 80mm (≈48 karakter)',
  },
};

function getTemplate(templateId) {
  return RECEIPT_TEMPLATES[templateId] || RECEIPT_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

function repeatChar(char, width) {
  return char.repeat(Math.max(0, width));
}

function rightAlign(left, right, width) {
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  const spaces = Math.max(1, width - leftText.length - rightText.length);
  return leftText + ' '.repeat(spaces) + rightText;
}

function centerLine(text, width) {
  const raw = String(text ?? '').trim();
  if (!raw) return ''.padStart(width, ' ');
  if (raw.length >= width) return raw;
  const padding = width - raw.length;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(left) + raw + ' '.repeat(right);
}

function wrapText(text, width) {
  const raw = String(text ?? '');
  if (raw.length <= width) return [raw];

  const words = raw.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  const flush = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  words.forEach(word => {
    const prospective = current ? `${current} ${word}` : word;
    if (prospective.length > width) {
      flush();
      if (word.length > width) {
        // Hard wrap the long word
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width));
        }
      } else {
        current = word;
      }
    } else {
      current = prospective;
    }
  });

  flush();
  return lines.length ? lines : [''];
}

function formatCurrency(amount) {
  const value = Number(amount || 0);
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function buildAddonLines(addons = [], width) {
  if (!Array.isArray(addons)) return [];
  const lines = [];
  addons.forEach(addon => {
    if (!addon) return;
    const name = addon.name || '';
    const qty = Number(addon.quantity || 0);
    const unit = Number(addon.unitPrice ?? addon.price ?? 0);
    if (!name || qty <= 0) return;
    const total = unit * qty;
    const text = `  + ${name} x${qty} (${formatCurrency(total)})`;
    lines.push(...wrapText(text, width));
  });
  return lines;
}

// Try to get the intended base unit price (without add-ons)
function getBaseUnitPrice(item) {
  if (!item) return 0;
  const qty = Math.max(1, Number(item.quantity || 1));
  const addonsTotal = sumAddons(item.addons);
  // Explicit base price provided by builder/cart
  if (item.basePrice != null && !isNaN(Number(item.basePrice))) {
    return Number(item.basePrice);
  }
  // Explicit original price takes precedence when present
  if (item.originalPrice != null && !isNaN(Number(item.originalPrice))) {
    return Number(item.originalPrice);
  }
  // Try to look up current menu price by id or name (best-effort)
  try {
    const menuItems = (config.menu && Array.isArray(config.menu.items)) ? config.menu.items : [];
    if (menuItems.length) {
      let found = null;
      if (item.id) {
        found = menuItems.find(mi => mi && mi.id === item.id);
      }
      if (!found && item.name) {
        found = menuItems.find(mi => mi && mi.name === item.name);
      }
      if (found && found.price != null) return Number(found.price);
    }
  } catch (_) {}
  // Derive base by subtracting add-ons from stored price when possible
  if (item.price != null && !isNaN(Number(item.price))) {
    if (addonsTotal > 0) {
      const derived = (Number(item.price) * qty - addonsTotal) / qty;
      if (Number.isFinite(derived) && derived >= 0) {
        return derived;
      }
    }
    return Number(item.price);
  }
  // Fallback to the item's current price
  return 0;
}

// Sum add-ons monetary total for a line item (does not multiply by item quantity; assumes addon.quantity already reflects desired total)
function sumAddons(addons = []) {
  if (!Array.isArray(addons)) return 0;
  return addons.reduce((acc, addon) => {
    if (!addon) return acc;
    const qty = Number(addon.quantity || 0);
    const unit = Number(addon.unitPrice ?? addon.price ?? 0);
    if (qty <= 0 || isNaN(unit)) return acc;
    return acc + (unit * qty);
  }, 0);
}

function renderCustomTemplate(order, template, templateText, options = {}) {
  const width = template.width;
  const tz = config.bot?.timezone || 'Asia/Jakarta';
  const createdAt = order?.createdAt ? moment(order.createdAt).tz(tz) : moment().tz(tz);

  const shopName = config.printer?.shopName || config.shop?.name || 'KEDAI KOPI';
  const shopAddress = config.printer?.shopAddress || config.shop?.address || '';
  const shopPhone = config.printer?.shopPhone || config.shop?.contact || '';

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const subtotal = orderItems.reduce((sum, item) => {
    const base = getBaseUnitPrice(item) * Number(item?.quantity || 1);
    const addons = sumAddons(item?.addons);
    return sum + base + addons;
  }, 0);
  const fee = Number(order?.pricing?.fee || 0);
  const discount = Number(order?.pricing?.discount || 0);
  const total = subtotal + fee - discount;

  const ctx = {
    shopName,
    shopAddress,
    shopPhone,
    orderId: order?.orderId || '-',
    createdAt: createdAt.format('DD/MM/YYYY HH:mm'),
    customerName: order?.customerName || 'Customer',
    paymentMethod: order?.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS',
    subtotal: formatCurrency(subtotal),
    fee: fee > 0 ? formatCurrency(fee) : '',
    discount: discount > 0 ? '-' + formatCurrency(discount) : '',
    total: formatCurrency(total),
  };

  const itemRenderer = (block) => {
    const lines = [];
    orderItems.forEach(item => {
      const baseUnit = getBaseUnitPrice(item);
      const subtotalItem = baseUnit * Number(item?.quantity || 1);
    const itemCtx = {
        'item.name': String(item?.name || 'Item'),
        'item.quantity': String(item?.quantity || 1),
        'item.price': formatCurrency(baseUnit),
        'item.subtotal': formatCurrency(subtotalItem),
        'item.total': formatCurrency(subtotalItem + sumAddons(item?.addons)),
        'item.notes': item?.notes ? String(item.notes) : ''
      };
      let rendered = block;
      Object.keys(itemCtx).forEach(key => {
        const value = itemCtx[key];
        const re = new RegExp('{{\\s*' + key.replace('.', '\\.') + '\\s*}}', 'g');
        rendered = rendered.replace(re, value);
      });
      lines.push(...rendered.split('\n'));
    });
    return lines;
  };

  let raw = String(templateText || '').replace(/\r\n/g, '\n');
  // Handle items loop: {{#items}}...{{/items}}
  raw = raw.replace(/{{#items}}([\s\S]*?){{\/items}}/g, (_, block) => {
    return itemRenderer(block).join('\n');
  });

  // Replace simple variables
  Object.keys(ctx).forEach(key => {
    const re = new RegExp('{{\\s*' + key + '\\s*}}', 'g');
    raw = raw.replace(re, ctx[key]);
  });

  // Inject optional custom header/footer text after rendering
  const headerLines = [];
  if (options.customHeaderText) {
    String(options.customHeaderText).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      .forEach(line => headerLines.push(...wrapText(line, width)));
  }
  const footerLines = [];
  if (options.customFooterText) {
    String(options.customFooterText).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      .forEach(line => footerLines.push(...wrapText(line, width)));
  }

  const body = raw.split('\n').flatMap(line => wrapText(line, width));
  const lines = [
    ...headerLines.map(l => centerLine(l, width)),
    ...body,
    ...footerLines.map(l => centerLine(l, width))
  ];

  return {
    template: template.id,
    width,
    sections: {
      header: headerLines,
      info: [],
      items: [],
      totals: [],
      footer: footerLines
    },
    lines,
    text: lines.join('\n')
  };
}

function formatReceipt(order, templateId, options = {}) {
  const template = getTemplate(templateId);
  const width = template.width;
  const tz = config.bot?.timezone || 'Asia/Jakarta';
  const createdAt = order?.createdAt ? moment(order.createdAt).tz(tz) : moment().tz(tz);

  const shopName = config.printer?.shopName || config.shop?.name || 'KEDAI KOPI';
  const shopAddress = config.printer?.shopAddress || config.shop?.address || '';
  const shopPhone = config.printer?.shopPhone || config.shop?.contact || '';

  const header = [
    centerLine(shopName, width),
    ...wrapText(shopAddress, width).map(line => centerLine(line, width)),
    ...wrapText(shopPhone, width).map(line => centerLine(line, width))
  ];

  // Inject optional custom header lines (centered)
  if (options.customHeaderText) {
    String(options.customHeaderText)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .forEach(line => {
        wrapText(line, width).forEach(w => header.push(centerLine(w, width)));
      });
  }

  header.push(repeatChar('=', width));

  const info = [
    rightAlign('Order ID', order?.orderId || '-', width),
    rightAlign('Waktu', createdAt.format('DD/MM/YYYY HH:mm'), width),
    rightAlign('Pelanggan', order?.customerName || 'Customer', width),
    rightAlign('Metode', order?.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS', width),
    repeatChar('-', width)
  ];

  const items = [];
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  orderItems.forEach(item => {
    const name = item?.name || 'Item';
    wrapText(name, width).forEach(line => items.push(line));

    const qty = Number(item?.quantity || 1);
    const baseUnit = getBaseUnitPrice(item);
    const addonSum = sumAddons(item?.addons);
    const subtotal = (qty * baseUnit) + addonSum;
    const priceLabel = formatCurrency(baseUnit);
    const subtotalLabel = formatCurrency(subtotal);

    // helper to print key/value aligned
    const kv = (label, value) => {
      const left = `  ${label}`;
      const right = String(value || '');
      const spaces = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(spaces) + right;
    };

    const detailed = (config.printer && config.printer.detailedItemBreakdown) !== false; // default true
    if (detailed) {
      // Show explicit breakdown when detailed mode is on
      items.push(kv('Harga 1x', priceLabel));
      if (addonSum > 0) items.push(kv('Add-on', formatCurrency(addonSum)));
      items.push(kv(`${qty}x Total`, subtotalLabel));
    } else {
      // Legacy single-line style
      const left = `  ${qty}x @${priceLabel}`;
      const spaces = Math.max(1, width - left.length - subtotalLabel.length);
      items.push(left + ' '.repeat(spaces) + subtotalLabel);
    }

    if (item?.notes) {
      wrapText(`  Note: ${item.notes}`, width).forEach(line => items.push(line));
    }
    items.push(...buildAddonLines(item?.addons, width));
  });

  const subtotal = orderItems.reduce((sum, item) => {
    const base = getBaseUnitPrice(item) * Number(item?.quantity || 1);
    const addons = sumAddons(item?.addons);
    return sum + base + addons;
  }, 0);
  const fee = Number(order?.pricing?.fee || 0);
  const discount = Number(order?.pricing?.discount || 0);
  const total = subtotal + fee - discount;

  const totals = [
    repeatChar('-', width),
    rightAlign('Subtotal', formatCurrency(subtotal), width)
  ];
  if (fee > 0) totals.push(rightAlign('Biaya', formatCurrency(fee), width));
  if (discount > 0) totals.push(rightAlign('Diskon', `- ${formatCurrency(discount)}`, width));
  totals.push(repeatChar('=', width));
  totals.push(rightAlign('TOTAL', formatCurrency(total), width));
  totals.push(repeatChar('=', width));

  const footer = [
    centerLine('Terima kasih!', width),
    centerLine('Selamat menikmati ☕', width)
  ];

  // Inject optional custom footer lines (centered)
  if (options.customFooterText) {
    String(options.customFooterText)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .forEach(line => {
        wrapText(line, width).forEach(w => footer.push(centerLine(w, width)));
      });
  }

  // If a custom template text is provided, use it instead of default structure
  if (options.customTemplateText) {
    return renderCustomTemplate(order, template, options.customTemplateText, options);
  }

  const lines = [...header, ...info, ...items, ...totals, ...footer];

  return {
    template: template.id,
    width,
    sections: {
      header,
      info,
      items,
      totals,
      footer
    },
    lines,
    text: lines.join('\n')
  };
}

module.exports = {
  RECEIPT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  formatReceipt,
  renderCustomTemplate,
};
