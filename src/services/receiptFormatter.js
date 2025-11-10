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

function leftAlign(text, width) {
  const raw = String(text ?? '').trim();
  if (!raw) return ''.padStart(width, ' ');
  if (raw.length >= width) return raw;
  return raw + ' '.repeat(width - raw.length);
}

function rightAlignText(text, width) {
  const raw = String(text ?? '').trim();
  if (!raw) return ''.padStart(width, ' ');
  if (raw.length >= width) return raw;
  return ' '.repeat(width - raw.length) + raw;
}

function applyAlignment(text, width, align = 'center') {
  if (align === 'left') return leftAlign(text, width);
  if (align === 'right') return rightAlignText(text, width);
  return centerLine(text, width);
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

function buildAddonDetails(addons = []) {
  if (!Array.isArray(addons)) return [];
  return addons
    .map(addon => {
      if (!addon) return null;
      const name = addon.name || '';
      const qty = Number(addon.quantity || 0);
      const unit = Number(addon.unitPrice ?? addon.price ?? 0);
      if (!name || qty <= 0 || !Number.isFinite(unit)) {
        return null;
      }
      const total = unit * qty;
      return {
        name,
        quantity: qty,
        unitPrice: unit,
        unitPriceFormatted: formatCurrency(unit),
        total,
        totalFormatted: formatCurrency(total)
      };
    })
    .filter(Boolean);
}

function buildItemMeta(item) {
  if (!item) return null;
  const quantity = Math.max(1, Number(item.quantity || 1));
  const unitPrice = getBaseUnitPrice(item);
  const addons = buildAddonDetails(item.addons);
  const addonTotal = addons.reduce((sum, addon) => sum + addon.total, 0);
  const subtotal = (unitPrice * quantity) + addonTotal;
  return {
    name: item.name || 'Item',
    quantity,
    unitPrice,
    unitPriceFormatted: formatCurrency(unitPrice),
    addons,
    addonTotal,
    addonTotalFormatted: addonTotal > 0 ? formatCurrency(addonTotal) : '',
    notes: item.notes || '',
    subtotal,
    subtotalFormatted: formatCurrency(subtotal)
  };
}

function buildReceiptMeta({
  order,
  template,
  createdAt,
  shopName,
  shopAddress,
  shopPhone,
  shopSocials,
  orderItems,
  subtotal,
  fee,
  discount,
  total,
  footerLines,
  footerQrLabel
}) {
  const itemsMeta = Array.isArray(orderItems)
    ? orderItems.map(buildItemMeta).filter(Boolean)
    : [];

  const paymentMethodRaw = order?.paymentMethod || '';
  const paymentMethodLabel = paymentMethodRaw === 'CASH'
    ? 'Tunai'
    : (paymentMethodRaw || 'QRIS');

  return {
    template: template?.id,
    width: template?.width,
    shop: {
      name: shopName || '',
      address: shopAddress || '',
      phone: shopPhone || '',
      socials: shopSocials || ''
    },
    order: {
      id: order?.orderId || '-',
      customerName: order?.customerName || '',
      paymentMethod: paymentMethodRaw,
      paymentMethodLabel,
      createdAtIso: createdAt?.clone().toISOString(),
      createdAtLabel: createdAt ? createdAt.format('DD MMM YYYY') : '',
      createdAtTime: createdAt ? createdAt.format('HH:mm:ss') : '',
      tableName: order?.tableName || order?.table || '',
      additionalInfo: order?.notes || order?.description || ''
    },
    items: itemsMeta,
    totals: {
      subtotal,
      subtotalFormatted: formatCurrency(subtotal),
      fee,
      feeFormatted: formatCurrency(fee),
      discount,
      discountFormatted: discount > 0 ? formatCurrency(discount) : formatCurrency(discount),
      total,
      totalFormatted: formatCurrency(total)
    },
    footer: {
      lines: Array.isArray(footerLines) ? footerLines.slice() : [],
      label: footerQrLabel || ''
    }
  };
}

function formatReceipt(order, receiptTemplate, options = {}) {
  const {
    customHeaderText = '',
    customFooterText = '',
    useCustomTemplate = false,
    customTemplates = {},
    headerPreset = 'shop-name',
    footerPreset = 'thank-you',
    showOrderId = true,
    showTime = true,
    showCustomer = true,
    showPaymentMethod = true,
    showHeaderSeparator = true,
    showFooterSeparator = true,
    detailedItemBreakdown = true,
    showItemNotes = true,
    showItemAddons = true,
    lineSpacing, // Not implemented yet
    headerFontSize, // Not implemented yet
    footerFontSize, // Not implemented yet
  } = options;

  const template = getTemplate(receiptTemplate);
  const width = template.width;

  // If user explicitly wants to use the old full custom template, let them.
  const customTemplateText = customTemplates ? customTemplates[template.id] : null;
  if (useCustomTemplate && customTemplateText) {
    return renderCustomTemplate(order, template, customTemplateText, options);
  }

  // --- Start New Per-Section Build Logic ---

  const tz = config.bot?.timezone || 'Asia/Jakarta';
  const createdAt = order?.createdAt ? moment(order.createdAt).tz(tz) : moment().tz(tz);
  const shopName = config.printer?.shopName || config.shop?.name || 'KEDAI KOPI';
  const shopAddress = config.printer?.shopAddress || config.shop?.address || '';
  const shopPhone = config.printer?.shopPhone || config.shop?.contact || '';
  const shopSocials = config.printer?.shopSocials || config.shop?.socials || '';

  const allowedFonts = new Set(['normal', 'double-height', 'double-width', 'double']);
  const allowedAlignments = new Set(['left', 'center', 'right']);

  const sectionStrings = {
    header: [],
    info: [],
    items: [],
    totals: [],
    footer: [],
  };
  const sectionMeta = {
    header: [],
    info: [],
    items: [],
    totals: [],
    footer: [],
  };
  const structuredLines = [];

  const normalizeFont = (value) => (allowedFonts.has(value) ? value : 'normal');
  const normalizeAlign = (value, fallback = 'left') => (allowedAlignments.has(value) ? value : fallback);

  const pushLine = (section, rawText, { align, font, displayText } = {}) => {
    const sectionKey = sectionStrings[section] ? section : 'header';
    const safeRaw = rawText == null ? '' : String(rawText);
    const resolvedAlign = normalizeAlign(align || 'left');
    const resolvedFont = normalizeFont(font);
    let finalDisplay = displayText;
    if (finalDisplay === undefined) {
      if (resolvedAlign === 'center') finalDisplay = centerLine(safeRaw, width);
      else if (resolvedAlign === 'right') finalDisplay = rightAlignText(safeRaw, width);
      else finalDisplay = leftAlign(safeRaw, width);
    }
    sectionStrings[sectionKey].push(finalDisplay);
    const entry = {
      section: sectionKey,
      rawText: safeRaw,
      displayText: finalDisplay,
      align: resolvedAlign,
      font: resolvedFont,
    };
    sectionMeta[sectionKey].push(entry);
    structuredLines.push(entry);
  };

  const pushLines = (section, lines, options = {}) => {
    if (!Array.isArray(lines)) return;
    lines.forEach((line) => pushLine(section, line, options));
  };

  const normalizedCustomHeaderLines = Array.isArray(options.customHeaderLines)
    ? options.customHeaderLines
        .map((line) => {
          if (!line) return null;
          const text = String(line.text ?? '').trim();
          if (!text) return null;
          return {
            text,
            font: normalizeFont(line.font),
            align: normalizeAlign(line.align, 'center'),
          };
        })
        .filter(Boolean)
    : [];

  const fallbackCustomHeaderLines = String(customHeaderText || '')
    .split(/\r?\n/)
    .map((line) => {
      const text = String(line || '').trim();
      if (!text) return null;
      return { text, font: 'normal', align: 'center' };
    })
    .filter(Boolean);

  // Build header based on preset
  switch (headerPreset) {
    case 'shop-name':
      pushLine('header', shopName, { align: 'center' });
      break;
    case 'shop-details':
      pushLine('header', shopName, { align: 'center' });
      if (shopAddress) {
        pushLines('header', wrapText(shopAddress, width), { align: 'center' });
      }
      break;
    case 'shop-contact':
      pushLine('header', shopName, { align: 'center' });
      if (shopPhone) {
        pushLines('header', wrapText(shopPhone, width), { align: 'center' });
      }
      break;
    case 'custom': {
      const headerLines = normalizedCustomHeaderLines.length
        ? normalizedCustomHeaderLines
        : fallbackCustomHeaderLines;
      headerLines.forEach((line) => {
        pushLine('header', line.text, { align: line.align ?? 'center', font: line.font ?? 'normal' });
      });
      break;
    }
    case 'none':
      break;
    default:
      pushLine('header', shopName, { align: 'center' });
  }

  if (sectionStrings.header.length > 0 && showHeaderSeparator) {
    const separator = repeatChar('=', width);
    pushLine('header', separator, { align: 'left', displayText: separator });
  }

  if (showOrderId && order?.orderId) {
    const formatted = rightAlign('Order ID', order.orderId, width);
    pushLine('info', formatted, { align: 'left', displayText: formatted });
  }
  if (showTime) {
    const formatted = rightAlign('Waktu', createdAt.format('DD/MM/YYYY HH:mm'), width);
    pushLine('info', formatted, { align: 'left', displayText: formatted });
  }
  if (showCustomer && order?.customerName) {
    const formatted = rightAlign('Pelanggan', order.customerName, width);
    pushLine('info', formatted, { align: 'left', displayText: formatted });
  }
  if (showPaymentMethod && order?.paymentMethod) {
    const methodLabel = order.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS';
    const formatted = rightAlign('Metode', methodLabel, width);
    pushLine('info', formatted, { align: 'left', displayText: formatted });
  }

  if (sectionStrings.info.length > 0) {
    const separator = repeatChar('-', width);
    pushLine('info', separator, { align: 'left', displayText: separator });
  }

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  orderItems.forEach((item) => {
    const name = item?.name || 'Item';
    pushLines('items', wrapText(name, width));

    const qty = Number(item?.quantity || 1);
    const baseUnit = getBaseUnitPrice(item);
    const addonSum = sumAddons(item?.addons);
    const subtotalLineTotal = (qty * baseUnit) + addonSum;
    const priceLabel = formatCurrency(baseUnit);
    const subtotalLabel = formatCurrency(subtotalLineTotal);

    const kv = (label, value) => rightAlign(`  ${label}`, value, width);

    if (detailedItemBreakdown) {
      pushLine('items', kv('Harga 1x', priceLabel), { align: 'left', displayText: kv('Harga 1x', priceLabel) });
      if (addonSum > 0) {
        const formattedAddon = kv('Add-on', formatCurrency(addonSum));
        pushLine('items', formattedAddon, { align: 'left', displayText: formattedAddon });
      }
      pushLine('items', kv(`${qty}x Total`, subtotalLabel), { align: 'left', displayText: kv(`${qty}x Total`, subtotalLabel) });
    } else {
      const left = `  ${qty}x @${priceLabel}`;
      const formatted = rightAlign(left, subtotalLabel, width);
      pushLine('items', formatted, { align: 'left', displayText: formatted });
    }

    if (showItemNotes && item?.notes) {
      pushLines('items', wrapText(`  Note: ${item.notes}`, width));
    }
    if (showItemAddons) {
      const addonLines = buildAddonLines(item?.addons, width);
      pushLines('items', addonLines);
    }
  });

  const subtotal = orderItems.reduce((sum, item) => {
    const base = getBaseUnitPrice(item) * Number(item?.quantity || 1);
    const addons = sumAddons(item?.addons);
    return sum + base + addons;
  }, 0);
  const fee = Number(order?.pricing?.fee || 0);
  const discount = Number(order?.pricing?.discount || 0);
  const total = subtotal + fee - discount;

  const subtotalLine = rightAlign('Subtotal', formatCurrency(subtotal), width);
  pushLine('totals', repeatChar('-', width), { align: 'left', displayText: repeatChar('-', width) });
  pushLine('totals', subtotalLine, { align: 'left', displayText: subtotalLine });
  if (fee > 0) {
    const feeLine = rightAlign('Biaya', formatCurrency(fee), width);
    pushLine('totals', feeLine, { align: 'left', displayText: feeLine });
  }
  if (discount > 0) {
    const discountLine = rightAlign('Diskon', `- ${formatCurrency(discount)}`, width);
    pushLine('totals', discountLine, { align: 'left', displayText: discountLine });
  }
  const totalsSeparator = repeatChar('=', width);
  pushLine('totals', totalsSeparator, { align: 'left', displayText: totalsSeparator });
  const totalLine = rightAlign('TOTAL', formatCurrency(total), width);
  pushLine('totals', totalLine, { align: 'left', displayText: totalLine, font: 'double-height' });
  pushLine('totals', totalsSeparator, { align: 'left', displayText: totalsSeparator });

  const footerTextLines = [];
  switch (footerPreset) {
    case 'thank-you':
      footerTextLines.push('Terima kasih!');
      footerTextLines.push('Selamat menikmati ☕');
      break;
    case 'social-media':
      if (shopSocials) {
        footerTextLines.push(
          ...String(shopSocials)
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
        );
      } else {
        footerTextLines.push('Follow us on social media!');
      }
      break;
    case 'custom':
      if (customFooterText) {
        footerTextLines.push(
          ...String(customFooterText)
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
        );
      }
      break;
    case 'none':
      break;
    default:
      footerTextLines.push('Terima kasih!');
  }

  if (footerTextLines.length > 0) {
    if (showFooterSeparator) {
      const separator = repeatChar('=', width);
      pushLine('footer', separator, { align: 'left', displayText: separator });
    }
    footerTextLines.forEach((line) => pushLine('footer', line, { align: 'center' }));
  }

  if (options.footerQr && options.footerQr.enabled && options.footerQr.canRender) {
    const label = options.footerQr.label || 'Scan QR di bawah ini';
    const qrLines = wrapText(label, width);
    qrLines.forEach((line) => pushLine('footer', line, { align: 'center' }));
  }

  const lines = structuredLines.map((entry) => entry.displayText);
  const header = sectionStrings.header;
  const info = sectionStrings.info;
  const items = sectionStrings.items;
  const totals = sectionStrings.totals;
  const footer = sectionStrings.footer;

  const structuredSections = Object.fromEntries(
    Object.entries(sectionMeta).map(([key, value]) => [key, value.slice()])
  );

  return {
    template: template.id,
    width,
    sections: { header, info, items, totals, footer },
    structuredLines,
    structuredSections,
    headerStyles: structuredSections.header
      .filter((entry) => entry.rawText && !/^[-=\s]+$/.test(entry.rawText.trim()))
      .map((entry) => ({
        text: entry.rawText,
        font: entry.font,
        align: entry.align,
      })),
    lines,
    text: lines.join('\n'),
    meta: buildReceiptMeta({
      order,
      template,
      createdAt,
      shopName,
      shopAddress,
      shopPhone,
      shopSocials,
      orderItems,
      subtotal,
      fee,
      discount,
      total,
      footerLines: footer,
      footerQrLabel: options.footerQr?.label
    })
  };
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
        'item.notes': item?.notes ? String(item.notes) : '',
        // Expand add-ons into lines; exposed as a single multiline placeholder
        'item.addons': (buildAddonLines(item?.addons, width) || []).join('\n')
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

  // Remove lines that become dangling labels (e.g., "Biaya    : ") after replacement
  raw = raw
    .split('\n')
    .filter(line => !/\:\s*$/.test(line))
    .join('\n');

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

  // Only inject the QR label when QR is enabled and canRender is true.
  if (options.footerQr && options.footerQr.enabled && options.footerQr.canRender) {
    const label = options.footerQr.label || 'Scan QR di bawah ini';
    const qrLabelLines = wrapText(label, width).map(w => centerLine(w, width));
    footerLines.push(...qrLabelLines);
    lines.push(...qrLabelLines);
  }

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

// This function is now deprecated in favor of the new per-section logic
// but kept for backward compatibility if a user still has `useCustomTemplate` enabled.
function oldFormatReceipt(order, templateId, options = {}) {
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

  // Inject optional custom header lines with custom alignment
  const headerAlign = options.headerAlign || 'center';
  if (options.customHeaderText) {
    String(options.customHeaderText)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .forEach(line => {
        wrapText(line, width).forEach(w => header.push(applyAlignment(w, width, headerAlign)));
      });
  }

  header.push(repeatChar('=', width));

  const info = [];
  const showOrderId = options.showOrderId !== false;
  const showTime = options.showTime !== false;
  const showCustomer = options.showCustomer !== false;
  const showPaymentMethod = options.showPaymentMethod !== false;
  if (showOrderId) info.push(rightAlign('Order ID', order?.orderId || '-', width));
  if (showTime) info.push(rightAlign('Waktu', createdAt.format('DD/MM/YYYY HH:mm'), width));
  if (showCustomer) info.push(rightAlign('Pelanggan', order?.customerName || 'Customer', width));
  if (showPaymentMethod) info.push(rightAlign('Metode', order?.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS', width));
  info.push(repeatChar('-', width));

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

    const detailed = (options.detailedItemBreakdown !== undefined)
      ? !!options.detailedItemBreakdown
      : ((config.printer && config.printer.detailedItemBreakdown) !== false); // default true
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

    const allowNotes = options.showItemNotes !== false;
    if (allowNotes && item?.notes) {
      wrapText(`  Note: ${item.notes}`, width).forEach(line => items.push(line));
    }
    if (options.showItemAddons !== false) {
      items.push(...buildAddonLines(item?.addons, width));
    }
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

  // Inject optional custom footer lines with custom alignment
  const footerAlign = options.footerAlign || 'center';
  if (options.customFooterText) {
    String(options.customFooterText)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .forEach(line => {
        wrapText(line, width).forEach(w => footer.push(applyAlignment(w, width, footerAlign)));
      });
  }

  // Only add footer QR label when the QR feature is both enabled and canRender
  // (i.e. there is a payload to render). This prevents templates from
  // injecting QR labels when the user has disabled QR printing in tools.
  if (options.footerQr && options.footerQr.enabled && options.footerQr.canRender) {
    const label = options.footerQr.label || 'Scan QR di bawah ini';
    wrapText(label, width).forEach(w => footer.push(centerLine(w, width)));
  }

  // If a custom template text is provided, use it instead of default structure
  // Only use custom template if it has actual content (not empty string)
  if (options.customTemplateText && String(options.customTemplateText).trim().length > 0) {
    return renderCustomTemplate(order, template, options.customTemplateText, options);
  }

  const lines = [...header, ...info, ...items, ...totals, ...footer];

  return {
    template: template.id,
    width,
    sections: {
      header: [],
      info: [],
      items: [],
      totals: [],
      footer: []
    },
    lines,
    text: lines.join('\n'),
    meta: buildReceiptMeta({
      order,
      template,
      createdAt,
      shopName,
      shopAddress,
      shopPhone,
      shopSocials,
      orderItems,
      subtotal,
      fee,
      discount,
      total,
  footerLines: [],
      footerQrLabel: options.footerQr?.label
    })
  };
}

module.exports = {
  RECEIPT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  formatReceipt,
  renderCustomTemplate,
};
