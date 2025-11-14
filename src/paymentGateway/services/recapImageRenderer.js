const { createCanvas } = require('canvas');

function renderRoundedRecapToPng(text, options = {}) {
  const padding = 24;
  const lineHeight = 24;
  const maxWidth = options.maxWidth || 900;
  const bgColor = options.backgroundColor || '#ffffff';
  const textColor = options.textColor || '#111827';
  const fontFamily = options.fontFamily || '16px "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';

  const lines = String(text || '').split(/\r?\n/);
  const canvas = createCanvas(maxWidth, lineHeight * (lines.length + 2) + padding * 2);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = fontFamily;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';

  let y = padding;
  for (const line of lines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderRoundedRecapToPng };
