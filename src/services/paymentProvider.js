const crypto = require('crypto');
const config = require('../config/config');
const QRISGenerator = require('../utils/qris');
const briSnapClient = require('./briSnapClient');

/**
 * Payment Provider Abstraction (Skeleton)
 * - createDynamicQR(order): integrate with real provider to create dynamic QR and return { qrString, externalId, expiresAt }
 * - verifySignature(req): verify provider webhook signature
 * - parseWebhook(req): map provider payload to { orderId, status, amount, externalId }
 */

function isEnabled() {
  if (briSnapClient.isConfigured()) return true;
  return !!config.paymentProvider && !!config.paymentProvider.enabled;
}

async function createDynamicQR(order) {
  if (briSnapClient.isConfigured()) {
    return await briSnapClient.createDynamicQR(order);
  }

  // Local fallback generator if no provider configured
  const qrString = QRISGenerator.generateOrderQRIS(
    config.shop.qrisStatic,
    order.pricing.total,
    config.order.serviceFee
  );
  return {
    provider: 'local-static',
    qrString,
    externalId: order.orderId,
    expiresAt: order.paymentExpiry
  };
}

function verifySignature(req) {
  if (briSnapClient.isConfigured()) {
    return briSnapClient.verifyWebhookSignature(req);
  }
  const pp = config.paymentProvider || {};
  // Simple token header (many providers: X-Callback-Token)
  if (pp.signatureHeader && req.headers && req.headers[pp.signatureHeader]) {
    return req.headers[pp.signatureHeader] === pp.callbackSecret;
  }
  // HMAC header variant
  if (pp.hmac && pp.hmac.enabled) {
    const header = (pp.hmac.header || '').toLowerCase();
    const signature = (req.headers[header] || '').toString();
    const algo = pp.hmac.algorithm === 'sha512' ? 'sha512' : 'sha256';
    const body = JSON.stringify(req.body || {});
    const h = crypto.createHmac(algo, pp.callbackSecret).update(body).digest('hex');
    return signature === h;
  }
  // If no scheme configured, treat as disabled
  return false;
}

function parseWebhook(req) {
  if (briSnapClient.isConfigured()) {
    return briSnapClient.parseWebhookPayload(req.body);
  }
  // Generic mapper: expect body to include orderId/status/amount/externalId
  const b = req.body || {};
  const status = (b.status || b.transaction_status || b.payment_status || '').toLowerCase();
  let mappedStatus = 'unknown';
  if (['paid', 'success', 'settlement', 'succeeded'].includes(status)) mappedStatus = 'paid';
  else if (['pending'].includes(status)) mappedStatus = 'pending';
  else if (['failed', 'expire', 'expired', 'cancel'].includes(status)) mappedStatus = 'failed';

  return {
    orderId: b.orderId || b.reference_id || b.external_id || b.merchant_ref || b.bill_no || null,
    amount: Number(b.amount || b.gross_amount || b.paid_amount || 0),
    externalId: b.id || b.external_id || b.transaction_id || null,
    rawStatus: status,
    status: mappedStatus
  };
}

module.exports = {
  isEnabled,
  createDynamicQR,
  verifySignature,
  parseWebhook,
};
