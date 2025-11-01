# ☕ Coffee Shop WhatsApp Bot

Modular WhatsApp Bot untuk Coffee Shop dengan Dynamic QRIS Payment & Automated Payment Gateway.

## 🌟 Features

### **Core Features:**
- ✅ Modular command system
- ✅ Dynamic QRIS payment with auto-nominal
- ✅ Order management & tracking
- ✅ Multi-category menu system
- ✅ Shopping cart functionality
- ✅ Auto-notification system

### **🆕 Payment Gateway System:**
- ✅ **Real-time Payment Dashboard** (localhost:3000)
- ✅ **Webhook Simulator** for testing (no real payment needed)
- ✅ **Auto-notification** to customer & barista
- ✅ **Sound alerts** for new orders
- ✅ **One-click payment confirmation**
- ✅ **Admin testing commands**
- ✅ **Payment analytics** (today's revenue, order count, etc)

---

## 🚀 Quick Start

### **1. Installation**

```bash
# Clone repository
git clone <your-repo-url>
cd pangko_bot

# Install dependencies
npm install

# Start bot
npm start
```

### **2. Configuration**

Edit `src/config/config.js`:

```javascript
shop: {
    name: 'My Coffee Shop',
    qrisStatic: 'YOUR_QRIS_CODE_HERE',
    adminNumbers: [
        '6281234567890@s.whatsapp.net'  // Your number
    ],
    baristaNumbers: [
        '6281234567891@s.whatsapp.net'  // Barista number
    ]
}
```

### **3. Access Dashboard**

After starting bot:
- **Main Dashboard**: http://localhost:3000
- **Webhook Tester**: http://localhost:3000/webhook-tester

---

## 📱 Bot Commands

### **Customer Commands:**

```bash
# Menu & Info
!menu              # Lihat semua menu
!menu coffee       # Lihat menu kategori tertentu
!info              # Info coffee shop
!help              # Bantuan

# Pemesanan
!order C001 2      # Tambah item ke keranjang
!cart              # Lihat keranjang
!checkout          # Proses checkout
!cancel            # Batalkan/kosongkan keranjang
!remove C001       # Hapus item dari keranjang

# Pembayaran & Status
!confirm CF123456  # Konfirmasi pembayaran (manual)
!status            # Lihat semua pesanan
!status CF123456   # Detail pesanan tertentu
```

### **Barista Commands:**

```bash
!ready CF123456    # Tandai pesanan siap diambil
```

### **Admin Commands:**

```bash
# Testing & Simulation
!simulate CF123456 success    # Simulate payment webhook
!simulate CF123456 failed     # Simulate failed payment

# Monitoring
!orders                       # List all orders (all status)
!dashboard                    # Get dashboard links
!admin-help                   # Show admin commands
```

---

## 💳 Payment Gateway System

### **Mode 1: Dashboard Kasir (Production)**

**Perfect for real operations:**

1. Customer checkout via WhatsApp
2. Customer scan & pay QRIS
3. Kasir monitor dashboard: http://localhost:3000
4. Kasir verify payment in banking app
5. Kasir click "✅ Konfirmasi Pembayaran"
6. Bot auto-notify customer & barista

**Features:**
- Real-time monitoring
- Auto-refresh every 3 seconds
- Sound notifications
- Payment statistics
- One-click confirmation

### **Mode 2: Webhook Simulator (Testing)**

**Perfect for development & demo:**

1. Customer checkout via WhatsApp
2. Open webhook tester: http://localhost:3000/webhook-tester
3. Select order & click "Simulate"
4. Bot auto-notify customer & barista

**Or via WhatsApp (Admin):**
```bash
!simulate CF123456 success
```

**Benefits:**
- No real payment needed
- Perfect for testing
- Simulate different payment statuses
- Great for training & demo

---

## 🎯 Complete Flow Example

### **Scenario: Customer Order Kopi**

```bash
# 1. Customer: Browse & Order
Customer: !menu
Customer: !order C001 2       # 2x Espresso
Customer: !order C003 1       # 1x Cappuccino
Customer: !cart               # Check cart

# 2. Customer: Checkout
Customer: !checkout
# Bot sends: Order ID CF123456 + QRIS code

# 3. Payment (Choose one method)

## Method A: Real Payment (Production)
Customer: Scan QRIS & Pay
Kasir: Check banking app
Kasir: Click "Konfirmasi" in dashboard
Bot: ✅ Auto-notify customer & barista

## Method B: Simulate Payment (Testing)
Admin: !simulate CF123456 success
Bot: ✅ Auto-notify customer & barista

# 4. Barista: Process Order
Barista: Makes coffee...
Barista: !ready CF123456
Bot: ✅ Notify customer "Pesanan siap!"

# 5. Customer: Pick Up
Customer receives notification
Customer picks up at counter
```

**Total time: 5-15 minutes** ⚡

---

## 🏗️ Project Structure

```
pangko_bot/
├── index.js                    # Entry point
├── package.json
├── src/
│   ├── bot.js                 # WhatsApp bot core
│   ├── commands/              # Command handlers
│   │   ├── index.js          # Command loader
│   │   ├── menu.js           # Menu command
│   │   ├── order.js          # Order command
│   │   ├── cart.js           # Cart command
│   │   ├── checkout.js       # Checkout command
│   │   ├── confirm.js        # Confirm payment
│   │   ├── status.js         # Status check
│   │   ├── ready.js          # Ready command (barista)
│   │   ├── admin.js          # 🆕 Admin commands
│   │   ├── help.js           # Help command
│   │   └── utils.js          # Utility commands
│   ├── config/
│   │   └── config.js         # Configuration
│   ├── handlers/
│   │   └── messageHandler.js # Message router
│   ├── services/
│   │   ├── orderManager.js   # Order management
│   │   └── paymentGateway.js # 🆕 Payment gateway server
│   └── utils/
│       ├── qris.js           # QRIS generator
│       └── buttonHelper.js   # Button helper
├── sessions/                  # WhatsApp auth sessions
├── PAYMENT_GATEWAY_GUIDE.md  # 🆕 Detailed guide
└── QUICK_START_PAYMENT.md    # 🆕 Quick start guide
```

---

## 🔧 Tech Stack

- **Bot Framework**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **Payment Gateway**: Express.js
- **Storage**: node-cache (in-memory)
- **QRIS**: Custom dynamic QRIS generator
- **Timezone**: moment-timezone
- **QR Code**: qrcode & qrcode-terminal

---

## 📊 Payment Gateway Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Customer  │         │   Dashboard  │         │   Barista   │
│  (WhatsApp) │         │  (Browser)   │         │ (WhatsApp)  │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘
       │                       │                        │
       │ 1. Checkout           │                        │
       ├──────────────────────>│                        │
       │                       │                        │
       │ 2. QRIS Code          │                        │
       │<──────────────────────┤                        │
       │                       │                        │
       │ 3. Scan & Pay         │                        │
       ├───────────────────────┤                        │
       │                       │                        │
       │                       │ 4. Kasir Confirm       │
       │                       ├───────────────┐        │
       │                       │               │        │
       │                       │ ┌─────────────▼──────┐ │
       │                       │ │  Payment Gateway   │ │
       │                       │ │  (Express Server)  │ │
       │                       │ └─────────────┬──────┘ │
       │                       │               │        │
       │ 5. Payment Confirmed  │               │        │
       │<──────────────────────┴───────────────┤        │
       │                                       │        │
       │                          6. New Order │        │
       │                                       ├───────>│
       │                                       │        │
       │ 7. Order Ready                        │        │
       │<──────────────────────────────────────┴────────┤
       │                                                │
```

---

## 🎨 Dashboard Features

### **Main Dashboard (localhost:3000)**

**Real-time Stats:**
- ⏳ Pending Payments
- 📦 Today's Orders
- 💰 Today's Revenue
- 📊 Total Orders

**Pending Payments List:**
- Order details (ID, amount, items)
- Customer info
- Expiry countdown
- One-click actions (Confirm/Reject)

**Auto Features:**
- Auto-refresh every 3 seconds
- Sound notifications for new orders
- Animated cards for new payments
- Online/offline status indicator

### **Webhook Tester (localhost:3000/webhook-tester)**

**Testing Tools:**
- Auto-load pending orders
- One-click order selection
- Multiple payment status options
- Real-time response display
- Perfect for development & demo

---

## 🔐 Security Notes

### **Current Version (Development):**
- No authentication on dashboard
- In-memory storage (data lost on restart)
- HTTP only (no HTTPS)

### **For Production:**

**Recommended improvements:**

1. **Add Authentication:**
   ```javascript
   // Add basic auth or JWT
   app.use(basicAuth({ users: { 'admin': 'password' } }));
   ```

2. **Use Database:**
   ```javascript
   // Replace node-cache with MongoDB/PostgreSQL
   // For persistent storage
   ```

3. **Enable HTTPS:**
   ```javascript
   // Use SSL certificate
   // Deploy behind nginx/apache
   ```

4. **Rate Limiting:**
   ```javascript
   // Prevent abuse
   const rateLimit = require('express-rate-limit');
   ```

5. **Webhook Signature:**
   ```javascript
   // Verify webhook authenticity
   // Use HMAC signature verification
   ```

---

## 🚀 Deployment

### **Local Development:**
```bash
npm start
```

### **Production (VPS/Cloud):**

1. **Setup Server:**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm nginx
   ```

2. **Clone & Install:**
   ```bash
   git clone <repo>
   cd pangko_bot
   npm install
   ```

3. **Use PM2:**
   ```bash
   npm install -g pm2
   pm2 start index.js --name "coffee-bot"
   pm2 startup
   pm2 save
   ```

4. **Nginx Reverse Proxy:**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
       }
   }
   ```

5. **SSL Certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

---

## 📚 Documentation

- **[PAYMENT_GATEWAY_GUIDE.md](./PAYMENT_GATEWAY_GUIDE.md)** - Detailed payment gateway documentation
- **[QUICK_START_PAYMENT.md](./QUICK_START_PAYMENT.md)** - Quick start guide for payment system

---

## 🧪 Testing

### **Manual Testing:**

1. **Test Customer Flow:**
   ```bash
   !menu
   !order C001 2
   !checkout
   !confirm CF123456
   !status
   ```

2. **Test Dashboard:**
   - Open http://localhost:3000
   - Verify auto-refresh works
   - Test confirm/reject buttons
   - Check sound notifications

3. **Test Webhook Simulator:**
   - Open http://localhost:3000/webhook-tester
   - Simulate success payment
   - Verify notifications

### **Admin Testing Commands:**

```bash
!simulate CF123456 success    # Test auto-confirmation
!orders                       # Check all orders
!dashboard                    # Get links
```

---

## 🐛 Troubleshooting

### **Bot tidak connect:**
```bash
# Delete sessions folder
rm -rf sessions/
npm start
# Scan QR baru
```

### **Dashboard tidak muncul:**
```bash
# Check port availability
netstat -ano | findstr :3000
# Try different port in paymentGateway.js
```

### **QRIS tidak valid:**
```javascript
// Update QRIS static in config.js
qrisStatic: 'YOUR_VALID_QRIS_HERE'
```

### **Notification tidak terkirim:**
```javascript
// Verify numbers in config.js
adminNumbers: ['6281234567890@s.whatsapp.net']
baristaNumbers: ['6281234567891@s.whatsapp.net']
```

---

## 🎯 Roadmap

### **Phase 1: Core** ✅
- [x] WhatsApp bot integration
- [x] Order management
- [x] QRIS payment
- [x] Basic commands

### **Phase 2: Payment Gateway** ✅
- [x] Real-time dashboard
- [x] Webhook simulator
- [x] Auto-notifications
- [x] Admin commands

### **Phase 3: Enhancement** 🚧
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] Authentication system
- [ ] Real payment gateway integration (Midtrans/Xendit)
- [ ] Receipt/invoice generation
- [ ] Customer history & loyalty

### **Phase 4: Advanced** 📋
- [ ] Multi-branch support
- [ ] Delivery integration
- [ ] Analytics dashboard
- [ ] Mobile app
- [ ] AI-powered recommendations

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

ISC License

---

## 👨‍💻 Author

Made with ☕ & ❤️

---

## 🙏 Acknowledgments

- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- QRIS Standard - Bank Indonesia

---

## 📞 Support

Need help? Have questions?

1. Check documentation files
2. Review troubleshooting section
3. Check console logs
4. Test with admin commands

Happy coding! 🚀☕
