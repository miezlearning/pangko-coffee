const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();

// Example: get payments/orders from datastore (adjust as needed)
const dataStore = require('../dataStore');

router.get('/finance', async (req, res) => {
  try {
    // Fetch payments and orders (customize fields as needed)
    const payments = await dataStore.getAllPayments();
    const orders = await dataStore.getAllOrders();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Laporan Keuangan');

    // Header row
    sheet.addRow(['Tanggal', 'Order ID', 'Customer', 'Status', 'Jumlah (Rp)', 'Tipe', 'Detail']);

    // Payments
    payments.forEach(p => {
      sheet.addRow([
        new Date(p.createdAt).toLocaleString('id-ID'),
        p.orderId,
        p.customerId,
        p.status,
        p.amount,
        'Pembayaran',
        (p.items || []).map(i => `${i.name} x${i.quantity}`).join(', ')
      ]);
    });

    // Orders
    orders.forEach(o => {
      sheet.addRow([
        new Date(o.createdAt).toLocaleString('id-ID'),
        o.orderId,
        o.customerName,
        o.status || 'Diproses',
        o.pricing?.total || '',
        'Order',
        (o.items || []).map(i => `${i.name} x${i.quantity}`).join(', ')
      ]);
    });

    // Format columns
    sheet.columns.forEach(col => col.width = 18);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan-keuangan.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal export laporan', error: err.message });
  }
});

module.exports = router;