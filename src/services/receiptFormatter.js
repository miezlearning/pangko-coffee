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

function formatReceipt(order, templateId) {
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
    ...wrapText(shopPhone, width).map(line => centerLine(line, width)),
    repeatChar('=', width)
  ];

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
    const price = Number(item?.price || 0);
    const subtotal = qty * price;
    const qtyLabel = `${qty}x`;
    const priceLabel = formatCurrency(price);
    const subtotalLabel = formatCurrency(subtotal);
    const left = `  ${qtyLabel} @${priceLabel}`;
    const spaces = Math.max(1, width - left.length - subtotalLabel.length);
    items.push(left + ' '.repeat(spaces) + subtotalLabel);

    if (item?.notes) {
      wrapText(`  Note: ${item.notes}`, width).forEach(line => items.push(line));
    }
    items.push(...buildAddonLines(item?.addons, width));
  });

  const subtotal = orderItems.reduce((sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 1), 0);
  const fee = Number(order?.pricing?.fee || 0);
  const discount = Number(order?.pricing?.discount || 0);
  const total = Number(order?.pricing?.total ?? (subtotal + fee - discount));

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
};
