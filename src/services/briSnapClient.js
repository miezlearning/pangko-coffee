const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');

const tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function isConfigured() {
  const cfg = config.briSnap || {};
  if (!cfg.enabled) return false;
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.partnerId && cfg.institutionCode && cfg.merchantId);
}

function getBaseUrl() {
  const cfg = config.briSnap || {};
  const env = (cfg.environment || 'sandbox').toLowerCase();
  return env === 'production' ? cfg.productionBaseUrl : cfg.sandboxBaseUrl;
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60000) {
    return tokenCache.accessToken;
  }

  const cfg = config.briSnap;
  const url = `${getBaseUrl()}/oauth/client_credential/accesstoken`; // grant_type appended via params
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

  const response = await axios.post(url, null, {
    params: { grant_type: 'client_credentials' },
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json'
    }
  });

  const data = response.data || {};
  const token = data.access_token || data.accessToken || (data.data && (data.data.access_token || data.data.accessToken));
  const expiresIn = Number(data.expires_in || data.access_token_expired || (data.data && (data.data.expires_in || data.data.expires_in_sec)) || 0);
  if (!token) {
    throw new Error('BRI SNAP access token not returned');
  }

  const ttlMs = expiresIn > 0 ? expiresIn * 1000 : 3600 * 1000;
  tokenCache.accessToken = token;
  tokenCache.expiresAt = now + ttlMs;
  return token;
}

function buildQrPayload(order, referenceNo) {
  const cfg = config.briSnap;
  const amount = Number(order?.pricing?.total || 0);
  if (!amount || amount <= 0) {
    throw new Error('Invalid order total for QR');
  }
  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + cfg.qrExpiryMinutes * 60000).toISOString();
  return {
    partnerReferenceNo: referenceNo,
    originalPartnerReferenceNo: referenceNo,
    merchantId: cfg.merchantId,
    storeId: cfg.partnerId,
    terminalId: cfg.terminalId || undefined,
    merchantName: cfg.storeName || config.shop?.name || 'Pangko Coffee',
    institutionCode: cfg.institutionCode,
    transactionDateTime: nowIso,
    qrExpiredDateTime: expires,
    amount: {
      value: amount,
      currency: 'IDR'
    },
    additionalInfo: {
      customerName: order.customerName || 'Customer',
      orderId: order.orderId,
      userId: order.userId,
      items: Array.isArray(order.items) ? order.items.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.quantity,
        price: item.price
      })) : []
    }
  };
}

async function createDynamicQR(order) {
  if (!isConfigured()) {
    throw new Error('BRI SNAP is not configured');
  }
  const partnerRef = order.orderId;
  const payload = buildQrPayload(order, partnerRef);
  const token = await getAccessToken();
  const url = `${getBaseUrl()}/payment/v1/qris`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = response.data?.data || response.data || {};
  const qrString = data.qrCode || data.qrContent || data.qrValue || data.qrString || data.qrUrl;
  if (!qrString) {
    throw new Error('QR string missing in BRI SNAP response');
  }
  const expiresAt = data.qrExpiredDateTime ? new Date(data.qrExpiredDateTime) : new Date(Date.now() + config.briSnap.qrExpiryMinutes * 60000);

  return {
    provider: 'bri-snap',
    qrString,
    externalId: data.paymentReferenceNo || data.referenceNo || data.qrReferenceId || data.partnerReferenceNo || partnerRef,
    referenceNumber: data.partnerReferenceNo || partnerRef,
    expiresAt,
    deeplink: data.qrUrl || data.deeplink,
    raw: data
  };
}

function verifyWebhookSignature(req) {
  const cfg = config.briSnap;
  if (!cfg.webhookSecret) {
    return true;
  }
  const signature = (req.headers['x-bri-signature'] || req.headers['x-signature'] || '').toString();
  if (!signature) return false;
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const computed = crypto.createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
  return signature === computed;
}

function parseWebhookPayload(body) {
  const data = body?.Data || body?.data || body || {};
  const latestStatus = (data.latestTransactionStatus || data.transactionStatus || data.status || '').toString().toLowerCase();
  let status = 'pending';
  if (['success', 'sukses', 'paid', 'settlement', '00', 'completed'].includes(latestStatus)) {
    status = 'paid';
  } else if (['failed', 'gagal', 'cancel', 'expired', '01', 'rejected'].includes(latestStatus)) {
    status = 'failed';
  }
  const reference = data.originalPartnerReferenceNo || data.partnerReferenceNo || data.referenceNo || data.orderId || null;
  const paymentRef = data.paymentReferenceNo || data.transactionId || data.referenceNo || null;
  const amountValue = data?.amount?.value || data?.transactionAmount?.value || data?.transactionAmount || 0;
  const paidAt = data?.completionDateTime || data?.settlementDateTime || data?.transactionDateTime;
  return {
    provider: 'bri-snap',
    orderId: reference,
    referenceNumber: reference,
    externalId: paymentRef,
    amount: Number(amountValue) || 0,
    rawStatus: latestStatus,
    status,
    paidAt: paidAt ? new Date(paidAt) : null,
    raw: data
  };
}

module.exports = {
  isConfigured,
  createDynamicQR,
  verifyWebhookSignature,
  parseWebhookPayload
};
