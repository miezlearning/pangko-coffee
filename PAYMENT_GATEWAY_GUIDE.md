# 💳 Payment Gateway System - User Guide

## 📖 Overview

Sistem Payment Gateway ini menyediakan **2 mode operasi**:

### **Mode 1: Semi-Otomatis (Dashboard Kasir)** ✅ GRATIS
- Customer scan QRIS & bayar
- Kasir cek payment di banking app
- Kasir klik "Konfirmasi" di dashboard
- Bot **otomatis** notifikasi customer & barista

### **Mode 2: Webhook Simulator (Testing)** 🧪 GRATIS
- Untuk development & testing
- Simulasi notifikasi pembayaran otomatis
- Tidak perlu real payment
- Perfect untuk demo

---

## 🚀 Quick Start

### 1. **Start Bot dengan Payment Gateway**

```bash
npm start
```

Output yang akan muncul:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 Payment Gateway Dashboard Started!
📱 Open: http://localhost:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. **Buka Dashboard**

Buka browser dan akses:
- **Main Dashboard**: http://localhost:3000
- **Webhook Tester**: http://localhost:3000/webhook-tester

---

## 💼 Mode 1: Dashboard Kasir (Production Mode)

### **Flow Pembayaran:**

```
Customer                Kasir                    Bot
   |                      |                        |
   |--1. Checkout-------->|                        |
   |                      |                        |
   |<-2. QRIS Code--------|                        |
   |                      |                        |
   |--3. Scan & Pay------>|                        |
   |                      |                        |
   |                      |--4. Check Banking----->|
   |                      |                        |
   |                      |--5. Confirm Payment--->|
   |                      |                        |
   |<-----6. Notification-|----------Auto-------->Barista
   |                      |                        |
```

### **Langkah-langkah:**

#### **A. Customer Side (WhatsApp)**

1. Customer order & checkout:
```
!order C001 2
!checkout
```

2. Bot kirim QRIS code dengan nominal otomatis

3. Customer scan QRIS di e-wallet (Gopay/OVO/Dana/dll)

4. Customer bayar (nominal sudah otomatis)

5. Customer konfirmasi di WhatsApp:
```
!confirm CF123456
```

#### **B. Kasir Side (Dashboard)**

1. Buka dashboard: http://localhost:3000

2. **Dashboard menampilkan:**
   - Real-time pending payments
   - Auto-refresh setiap 3 detik
   - Sound notification untuk order baru
   - Order details (items, amount, customer)

3. Kasir cek payment di banking app/rekening

4. Jika payment masuk → **klik "✅ Konfirmasi Pembayaran"**

5. Bot akan **otomatis:**
   - Update order status
   - Notifikasi customer
   - Notifikasi barista
   - Remove dari pending list

### **Features Dashboard:**

✅ **Real-time Monitoring**
- Auto-refresh setiap 3 detik
- No need manual refresh

✅ **Sound Notifications**
- Beep sound untuk order baru
- Toggle on/off

✅ **Payment Stats**
- Pending count
- Today's orders
- Today's revenue
- Total orders

✅ **One-Click Actions**
- Confirm payment (auto-trigger bot)
- Reject payment

---

## 🧪 Mode 2: Webhook Simulator (Testing Mode)

### **Kapan Menggunakan Mode Ini?**

- Development & testing
- Demo aplikasi
- Tidak ada real payment
- Training barista/kasir

### **Cara Menggunakan:**

#### **Method 1: Via Web Interface**

1. Buka: http://localhost:3000/webhook-tester

2. Dashboard akan auto-load pending orders

3. Pilih order yang ingin disimulasikan (atau input manual)

4. Pilih status:
   - ✅ Success (Paid)
   - ✅ Settlement (Confirmed)
   - ❌ Failed
   - ⏰ Expired

5. Klik "🚀 Simulate Payment Webhook"

6. Bot akan langsung:
   - Process payment
   - Notifikasi customer
   - Notifikasi barista

#### **Method 2: Via WhatsApp (Admin Only)**

Admin bisa simulate payment langsung dari WhatsApp:

```
!simulate CF123456 success
```

Status options:
- `success` - Pembayaran berhasil
- `failed` - Pembayaran gagal
- `expired` - Pembayaran expired

### **Testing Flow Example:**

```bash
# 1. Customer checkout
Customer: !order C001 2
Customer: !checkout

# 2. Admin simulate payment (no real payment needed)
Admin: !simulate CF123456 success

# 3. Bot auto-process
✅ Payment confirmed
✅ Customer notified
✅ Barista notified

# 4. Barista marks ready
Barista: !ready CF123456

# 5. Customer gets notification
```

---

## 👑 Admin Commands

### **Available Commands:**

```
!simulate [ORDER_ID] [status]
   Simulate payment webhook
   Example: !simulate CF123456 success

!orders
   List all orders (all status)

!dashboard
   Get dashboard links

!admin-help
   Show admin commands help
```

### **Setup Admin Numbers:**

Edit `src/config/config.js`:

```javascript
shop: {
    adminNumbers: [
        '6281234567890@s.whatsapp.net',  // Your admin number
    ],
    baristaNumbers: [
        '6281234567891@s.whatsapp.net',  // Barista number
    ]
}
```

---

## 🎯 Complete User Journey Example

### **Scenario: Customer Order Kopi**

```
# 1. CUSTOMER: Lihat menu
Customer: !menu

# 2. CUSTOMER: Order item
Customer: !order C001 2
Customer: !order C003 1

# 3. CUSTOMER: Lihat cart
Customer: !cart

# 4. CUSTOMER: Checkout
Customer: !checkout

# Response:
✅ Pesanan Berhasil Dibuat!
📋 Order ID: CF123456
💰 Total: Rp 50.000
[QRIS CODE IMAGE]

# 5. KASIR: Lihat di dashboard
Kasir opens: http://localhost:3000
→ Sees pending payment CF123456

# 6. CUSTOMER: Scan & Pay QRIS
(Customer scans with Gopay/OVO/Dana)

# 7. KASIR: Confirm payment
Kasir checks banking app
→ Payment received Rp 50.000
→ Clicks "✅ Konfirmasi Pembayaran" in dashboard

# 8. BOT: Auto-process
✅ Updates order status to PROCESSING
✅ Notifies customer: "Payment confirmed!"
✅ Notifies barista: "New order CF123456"

# 9. BARISTA: Process order
Barista makes coffee...
Barista: !ready CF123456

# 10. CUSTOMER: Get notification
🎉 Pesanan Anda Siap!
Order ID: CF123456
Silakan ambil di counter!
```

---

## 🔧 Troubleshooting

### **Dashboard tidak muncul order?**

✅ Check bot running: `npm start`
✅ Check customer sudah checkout
✅ Refresh dashboard (Ctrl+R)
✅ Check console log

### **Sound notification tidak bunyi?**

✅ Click "Sound: ON" toggle in dashboard
✅ Check browser audio permission
✅ Reload page

### **Webhook simulator tidak work?**

✅ Check order ID benar
✅ Order harus status PENDING_PAYMENT
✅ Check console for errors

### **Bot tidak kirim notifikasi?**

✅ Check bot connected (check terminal)
✅ Check admin/barista numbers in config.js
✅ Test with !dashboard command

---

## 🎨 Dashboard Features

### **Main Dashboard (Port 3000)**

**Stats Cards:**
- ⏳ Pending Payments
- 📦 Today's Orders
- 💰 Today's Revenue
- 📊 Total Orders

**Pending Payments List:**
- Order ID & Amount
- Customer info
- Items list
- Expiry timer
- Confirm/Reject buttons

**Auto Features:**
- Auto-refresh every 3 seconds
- Sound notification for new orders
- Real-time stats update
- Status badge (online/offline)

### **Webhook Tester (Port 3000/webhook-tester)**

**Features:**
- Auto-load pending orders
- One-click select order
- Multiple status options
- Real-time response display
- Auto-refresh orders list

---

## 📊 API Endpoints

Untuk integrasi external:

```
GET  /api/payments/pending
     → Get all pending payments

POST /api/payments/confirm/:orderId
     → Confirm payment (trigger bot notification)

POST /api/payments/reject/:orderId
     → Reject payment

GET  /api/payments/history
     → Get payment history

GET  /api/stats
     → Get dashboard statistics

POST /api/webhook/simulate
     → Simulate payment webhook (testing only)
```

---

## 🚀 Production Deployment

### **For Production dengan Real Payment Gateway:**

Jika sudah siap production dengan Midtrans/Xendit:

1. Daftar merchant account (Midtrans/Xendit)
2. Dapatkan API keys
3. Tambahkan webhook URL ke payment gateway
4. Update `paymentGateway.js` dengan real webhook handler
5. Remove simulator endpoints

**Webhook URL format:**
```
https://your-domain.com/api/webhook/midtrans
https://your-domain.com/api/webhook/xendit
```

---

## 💡 Tips & Best Practices

### **For Kasir:**

✅ Always check banking app before confirm
✅ Verify amount matches order total
✅ Keep dashboard open during operating hours
✅ Enable sound notifications

### **For Testing:**

✅ Use webhook simulator for development
✅ Test all payment statuses (success/failed/expired)
✅ Verify notifications sent correctly
✅ Check order status updates

### **For Production:**

✅ Use HTTPS for dashboard
✅ Add authentication for dashboard
✅ Setup proper database (replace in-memory storage)
✅ Add payment receipt/invoice system
✅ Setup backup & logging

---

## 📞 Support

Jika ada masalah atau pertanyaan:

1. Check console logs in terminal
2. Check browser console (F12)
3. Verify configuration in `config.js`
4. Test with `!admin-help` command

---

## 🎉 Summary

**Mode 1 (Dashboard):** 
- Best for production
- Kasir manual confirm
- Real payment required

**Mode 2 (Webhook Simulator):**
- Best for testing/demo
- Auto-confirm via webhook
- No real payment needed

**Both modes:**
- ✅ Free & self-hosted
- ✅ Auto-notify customer & barista
- ✅ Real-time monitoring
- ✅ Easy to use

Selamat mencoba! 🚀☕
