const express = require('express');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');
const router = express.Router();
const orderStore = require('../../services/orderStore');
const orderManager = require('../../services/orderManager');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function ensureWA(userId){
  if (!userId) return 'unknown@s.whatsapp.net';
  if (userId.includes('@')) return userId;
  return `${String(userId).replace(/[^0-9]/g,'')}@s.whatsapp.net`;
}

function normalizeStatus(s){
  if (!s) return orderManager.STATUS.COMPLETED;
  const map = {
    draft: orderManager.STATUS.DRAFT,
    pending_payment: orderManager.STATUS.PENDING_PAYMENT,
    pending_cash: orderManager.STATUS.PENDING_CASH,
    paid: orderManager.STATUS.PAID,
    processing: orderManager.STATUS.PROCESSING,
    ready: orderManager.STATUS.READY,
    completed: orderManager.STATUS.COMPLETED,
    cancelled: orderManager.STATUS.CANCELLED,
    canceled: orderManager.STATUS.CANCELLED,
    expired: orderManager.STATUS.EXPIRED
  };
  return map[String(s).toLowerCase()] || orderManager.STATUS.COMPLETED;
}

function computePricing(items){
  try { return orderManager.calculateTotal(items||[], true); }
  catch { const subtotal=(items||[]).reduce((s,i)=>s+(+i.price||0)*(+i.quantity||0),0); return {subtotal,fee:0,total:subtotal}; }
}

function parseDate(v){
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // Excel serial number to JS Date (rough)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + v * 86400000);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeOrder(input, defaultMethod){
  const items = Array.isArray(input.items) ? input.items.map(it => ({
    id: it.id || null,
    name: it.name || 'Item',
    price: Number(it.price)||0,
    quantity: Number(it.quantity)||1,
    notes: it.notes || ''
  })) : [];
  const pricing = input.pricing && typeof input.pricing.total !== 'undefined'
    ? { subtotal: Number(input.pricing.subtotal)||0, fee: Number(input.pricing.fee)||0, total: Number(input.pricing.total)||0 }
    : computePricing(items);
  const status = normalizeStatus(input.status);
  const paymentMethod = (input.paymentMethod || defaultMethod || 'QRIS').toUpperCase();
  const createdAt = parseDate(input.createdAt) || new Date();
  const order = {
    orderId: input.orderId || orderManager.generateOrderId(),
    userId: ensureWA(input.userId),
    customerName: input.customerName || 'Customer',
    items,
    notes: input.notes || '',
    pricing,
    status,
    createdAt,
    paymentExpiry: parseDate(input.paymentExpiry) || new Date(createdAt.getTime() + 10*60000),
    qrisGenerated: false,
    qrisCode: null,
    paymentMethod,
    paidAt: parseDate(input.paidAt) || (['paid','processing','ready','completed'].includes(status) ? createdAt : null),
    confirmedAt: parseDate(input.confirmedAt) || (['processing','ready','completed'].includes(status) ? createdAt : null),
    completedAt: parseDate(input.completedAt) || (status === orderManager.STATUS.COMPLETED ? createdAt : null)
  };
  if (paymentMethod === 'CASH') {
    order.cashExpiresAt = parseDate(input.cashExpiresAt) || new Date(createdAt.getTime() + 10*60000);
    order.cashAcceptedAt = parseDate(input.cashAcceptedAt) || (status !== orderManager.STATUS.PENDING_CASH ? createdAt : null);
    order.cashCancelledAt = parseDate(input.cashCancelledAt) || null;
    order.cashCancelReason = input.cashCancelReason || null;
    order.canReopenUntil = parseDate(input.canReopenUntil) || null;
    order.reopenCount = Number(input.reopenCount)||0;
  }
  return order;
}

// POST /api/import/orders - upload JSON or Excel to import orders
router.post('/orders', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, message: 'File is required' });
    const defaultMethod = (req.body.method || '').toUpperCase() || null;
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    let orders = [];

    if (ext === '.json' || req.file.mimetype === 'application/json') {
      const text = req.file.buffer.toString('utf8');
      let data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('JSON must be an array of orders');
      orders = data.map(o => normalizeOrder(o, defaultMethod));
    } else if (ext === '.xlsx' || req.file.mimetype.includes('spreadsheetml')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('Excel must have at least one sheet');
      // Expect columns: orderId,userId,customerName,paymentMethod,status,createdAt,paidAt,confirmedAt,completedAt,items(JSON)
      const header = {};
      ws.getRow(1).eachCell((cell, col) => { header[String(cell.value).toLowerCase()] = col; });
      const get = (row, name) => row.getCell(header[name])?.value;
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rawItems = get(row, 'items');
        let items = [];
        if (rawItems) {
          try { items = typeof rawItems === 'string' ? JSON.parse(rawItems) : JSON.parse(String(rawItems.text || rawItems?.result || rawItems)); } catch (_) { items = []; }
        }
        const o = normalizeOrder({
          orderId: get(row,'orderid'),
          userId: get(row,'userid'),
          customerName: get(row,'customername'),
          paymentMethod: get(row,'paymentmethod'),
          status: get(row,'status'),
          createdAt: get(row,'createdat'),
          paidAt: get(row,'paidat'),
          confirmedAt: get(row,'confirmedat'),
          completedAt: get(row,'completedat'),
          items
        }, defaultMethod);
        orders.push(o);
      });
    } else {
      return res.status(400).json({ success:false, message: 'Unsupported file type. Use .json or .xlsx' });
    }

    orderStore.saveOrders(orders);
    res.json({ success:true, imported: orders.length });
  } catch (e) {
    console.error('Import error:', e);
    res.status(400).json({ success:false, message: e.message });
  }
});

// GET /api/import/template/json - returns sample JSON template
router.get('/template/json', (req, res) => {
  const sample = [
    {
      orderId: 'CF20250101TEST1',
      userId: '628123000111',
      customerName: 'Tester 1',
      items: [
        { id:'C004', name:'Latte', price:24000, quantity:1 },
        { id:'C001', name:'Espresso', price:15000, quantity:2 }
      ],
      paymentMethod: 'QRIS',
      status: 'completed',
      createdAt: '2025-01-01T10:00:00+08:00',
      paidAt: '2025-01-01T10:05:00+08:00',
      confirmedAt: '2025-01-01T10:06:00+08:00',
      completedAt: '2025-01-01T10:16:00+08:00'
    }
  ];
  res.setHeader('Content-Type','application/json');
  res.setHeader('Content-Disposition','attachment; filename="orders-template.json"');
  res.send(JSON.stringify(sample, null, 2));
});

// GET /api/import/template/excel - generates an Excel template
router.get('/template/excel', async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');
  ws.addRow(['orderId','userId','customerName','paymentMethod','status','createdAt','paidAt','confirmedAt','completedAt','items']);
  ws.addRow(['CF20250101TEST1','628123000111','Tester 1','QRIS','completed','2025-01-01T10:00:00+08:00','2025-01-01T10:05:00+08:00','2025-01-01T10:06:00+08:00','2025-01-01T10:16:00+08:00',
             JSON.stringify([{id:'C004',name:'Latte',price:24000,quantity:1},{id:'C001',name:'Espresso',price:15000,quantity:2}])]);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="orders-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
