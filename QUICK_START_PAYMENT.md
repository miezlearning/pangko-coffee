# 🚀 Quick Start - Payment Gateway

## ⚡ Start dalam 3 Langkah

### 1. **Jalankan Bot**
```bash
npm start
```

### 2. **Buka Dashboard**
```
Main Dashboard: http://localhost:3000
Webhook Tester: http://localhost:3000/webhook-tester
```

### 3. **Test Payment Flow**

#### **Opsi A: Manual Mode (Production)**
```
Customer → !order C001 2
Customer → !checkout
Customer → Scan QRIS & Bayar
Kasir → Cek banking app
Kasir → Klik "Konfirmasi" di dashboard
Bot → Auto notif customer & barista ✅
```

#### **Opsi B: Auto Mode (Testing)**
```
Customer → !order C001 2
Customer → !checkout
Admin → !simulate CF123456 success
Bot → Auto notif customer & barista ✅
```

---

## 🎯 Testing Commands

### **Customer Commands:**
```bash
!menu                 # Lihat menu
!order C001 2         # Order item
!cart                 # Lihat keranjang
!checkout             # Proses checkout
!confirm CF123456     # Konfirmasi bayar (manual)
!status               # Cek status pesanan
```

### **Admin Commands:**
```bash
!simulate CF123456 success    # Simulate payment
!orders                       # List all orders
!dashboard                    # Get dashboard link
!admin-help                   # Admin commands help
```

### **Barista Commands:**
```bash
!ready CF123456       # Tandai pesanan siap
```

---

## 🧪 Quick Test Scenario

### **Full Flow Test (5 menit):**

```bash
# Terminal 1: Start bot
npm start

# Browser: Open dashboard
http://localhost:3000

# WhatsApp (as Customer):
!menu
!order C001 2
!checkout

# Browser: Open webhook tester
http://localhost:3000/webhook-tester

# Click order → Simulate success

# Check WhatsApp:
✅ Customer dapat notif "Payment confirmed"
✅ Barista dapat notif "New order"

# WhatsApp (as Barista):
!ready CF123456

# Check WhatsApp:
✅ Customer dapat notif "Pesanan siap"
```

**DONE! 🎉**

---

## 📋 Checklist Setup

Before testing, make sure:

```
✅ Bot running (npm start)
✅ Dashboard accessible (localhost:3000)
✅ Admin number set in config.js
✅ Barista number set in config.js
✅ QRIS static valid in config.js
```

---

## 🔥 Tips

1. **Dashboard auto-refresh setiap 3 detik** - No need manual refresh
2. **Sound notification ON** - Akan bunyi untuk order baru
3. **Webhook tester** - Perfect untuk demo tanpa real payment
4. **!simulate command** - Quick test dari WhatsApp
5. **Dashboard bisa dibuka di multiple tabs** - Kasir & admin bisa monitor bersamaan

---

## 🎬 Video Tutorial (Konsep)

1. **Setup & Start** (1 min)
   - npm start
   - Open dashboard
   
2. **Customer Flow** (2 min)
   - Order via WhatsApp
   - Checkout
   - Get QRIS
   
3. **Kasir Flow** (1 min)
   - Monitor dashboard
   - Confirm payment
   
4. **Test Flow** (1 min)
   - Use webhook simulator
   - Verify notifications

Total: **5 minutes** to fully operational! 🚀

---

## 💡 Next Steps

After basic testing works:

1. **Customize UI** - Edit dashboard HTML in paymentGateway.js
2. **Add Authentication** - Protect dashboard with password
3. **Setup Database** - Replace in-memory storage
4. **Deploy to Server** - Use VPS or cloud hosting
5. **Integrate Real Gateway** - Midtrans/Xendit for production

---

## 📞 Need Help?

Check:
1. Terminal logs - Errors akan muncul di sini
2. Browser console - F12 untuk debug
3. PAYMENT_GATEWAY_GUIDE.md - Full documentation

Happy testing! ☕🚀
