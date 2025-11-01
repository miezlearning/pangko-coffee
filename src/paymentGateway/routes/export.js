const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const router = express.Router();

// Read orders directly from SQLite via orderStore
const orderStore = require(path.resolve(__dirname, '..', '..', 'services', 'orderStore'));

router.get('/finance', async (req, res) => {
  try {
    // Load orders from SQLite and filter to revenue-impacting statuses
    const allOrders = orderStore.loadOrders() || [];
    const revenueStatuses = new Set(['paid', 'processing', 'ready', 'completed']);
    const orders = allOrders.filter(o => o && revenueStatuses.has((o.status || '').toLowerCase()));

    const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Laporan Keuangan');

    // Header row (with payment method column)
    sheet.addRow(['Tanggal', 'Order ID', 'Customer', 'Status', 'Metode', 'Jumlah (Rp)', 'Detail']);

    // Data rows from orders
    orders.forEach(o => {
      const when = o.paidAt || o.confirmedAt || o.updatedAt || o.createdAt;
      const metode = (o.paymentMethod || '').toUpperCase() === 'CASH' ? 'Tunai' : 'QRIS';
      sheet.addRow([
        when ? new Date(when).toLocaleString('id-ID') : '',
        o.orderId,
        o.customerName || 'Customer',
        o.status?.toUpperCase() || '-',
        metode,
        Number(o.pricing?.total || 0),
        (o.items || []).map(i => `${i.name} x${i.quantity}`).join(', ')
      ]);
    });

    // Format columns
    sheet.columns = [
      { width: 20 }, // Tanggal
      { width: 16 }, // Order ID
      { width: 22 }, // Customer
      { width: 14 }, // Status
      { width: 12 }, // Metode
      { width: 16 }, // Jumlah (Rp)
      { width: 40 }, // Detail
    ];

    // Number format for Amount column (F)
    const lastDataRow = sheet.lastRow.number;
    for (let r = 2; r <= lastDataRow; r++) {
      const cell = sheet.getCell(`F${r}`);
      cell.numFmt = '#,##0';
    }

    // Add TOTAL row with SUM formula
    const totalRowIndex = lastDataRow + 1;
    sheet.addRow(['TOTAL', '', '', '', '', { formula: `SUM(F2:F${lastDataRow})` }, '']);
    sheet.getRow(totalRowIndex).font = { bold: true };
    sheet.getCell(`F${totalRowIndex}`).numFmt = '#,##0';

    // Freeze header
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // =============
    // Ringkasan per Metode
    // =============
    const summarySheet = workbook.addWorksheet('Ringkasan Metode');
    summarySheet.addRow(['Metode', 'Jumlah Order', 'Total (Rp)', 'Rata-rata (Rp)', 'Persentase']);

    // Group orders by payment method
    const groups = orders.reduce((acc, o) => {
      const key = (o.paymentMethod || '').toUpperCase() === 'CASH' ? 'Tunai' : 'QRIS';
      if (!acc[key]) acc[key] = { count: 0, sum: 0 };
      acc[key].count += 1;
      acc[key].sum += Number(o.pricing?.total || 0);
      return acc;
    }, {});

    const totalAll = Object.values(groups).reduce((s, g) => s + g.sum, 0) || 0;
    const methods = Object.keys(groups);

    methods.forEach((m) => {
      const g = groups[m];
      const avg = g.count > 0 ? g.sum / g.count : 0;
      const pct = totalAll > 0 ? g.sum / totalAll : 0;
      summarySheet.addRow([m, g.count, g.sum, avg, pct]);
    });

    // Formatting summary
    summarySheet.columns = [
      { width: 12 }, // Metode
      { width: 16 }, // Jumlah Order
      { width: 16 }, // Total (Rp)
      { width: 16 }, // Rata-rata (Rp)
      { width: 14 }, // Persentase
    ];

    const lastSumRow = summarySheet.lastRow.number;
    for (let r = 2; r <= lastSumRow; r++) {
      summarySheet.getCell(`C${r}`).numFmt = '#,##0';
      summarySheet.getCell(`D${r}`).numFmt = '#,##0';
      summarySheet.getCell(`E${r}`).numFmt = '0.00%';
    }

    // Bold header & freeze
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan-keuangan.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal export laporan', error: err.message });
  }
});

module.exports = router;