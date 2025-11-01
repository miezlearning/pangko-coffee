# Payment Gateway - Modular Structure

**Refactored untuk maintainability & scalability**

## 📁 Struktur Folder

```
src/paymentGateway/
├── index.js              # Main server entry point
├── dataStore.js          # In-memory data management
├── routes/               # API endpoints (modular)
│   ├── payments.js       # Payment endpoints
│   ├── orders.js         # Order endpoints
│   ├── stats.js          # Statistics endpoint
│   └── webhook.js        # Webhook simulator
├── views/                # HTML templates
│   ├── dashboard.html    # Kasir dashboard
│   └── webhookTester.html # Webhook testing UI
└── public/               # Static assets
    ├── css/
    │   ├── dashboard.css
    │   └── webhookTester.css
    └── js/
        ├── dashboard.js
        └── webhookTester.js
```

## 🎯 Keuntungan Modular Structure

### **Sebelum (Monolithic)**
```
❌ 1432 lines dalam 1 file
❌ HTML/CSS/JS inline di server code
❌ Sulit modify frontend tanpa touch backend
❌ Hard to test individual components
❌ No separation of concerns
```

### **Sesudah (Modular)**
```
✅ Separated by responsibility
✅ HTML/CSS/JS di file terpisah
✅ Easy to modify frontend
✅ Testable components
✅ Clear separation of concerns
✅ Industry best practices
```

## 📄 File Descriptions

### **index.js** - Main Server
- Express setup & configuration
- Middleware mounting
- Route registration
- Static file serving
- Server startup

### **dataStore.js** - Data Management
- Pending payments storage
- Payment history
- Bot instance reference
- CRUD operations for data

### **routes/payments.js** - Payment API
- `GET /api/payments/pending` - Get pending payments
- `POST /api/payments/confirm/:orderId` - Confirm payment
- `POST /api/payments/reject/:orderId` - Reject payment
- `GET /api/payments/history` - Get payment history

### **routes/orders.js** - Order API
- `POST /api/orders/ready/:orderId` - Mark order as ready
- `GET /api/orders/processing` - Get processing orders

### **routes/stats.js** - Statistics API
- `GET /api/stats` - Get dashboard statistics

### **routes/webhook.js** - Webhook API
- `POST /api/webhook/simulate` - Simulate payment webhook
- `GET /webhook-tester` - Webhook testing page

### **views/dashboard.html** - Kasir Dashboard
- Main dashboard UI
- Pending payments list
- Processing orders list
- Stats display
- Action buttons

### **views/webhookTester.html** - Webhook Tester
- Webhook simulation UI
- Testing interface
- Response display

### **public/css/** - Stylesheets
- `dashboard.css` - Dashboard styles
- `webhookTester.css` - Webhook tester styles

### **public/js/** - Client Scripts
- `dashboard.js` - Dashboard logic & API calls
- `webhookTester.js` - Webhook tester logic

## 🚀 Usage

### Import Payment Gateway
```javascript
const PaymentGateway = require('./src/paymentGateway');

// Start server
PaymentGateway.startServer();

// Connect bot instance
PaymentGateway.setBotInstance(bot);

// Register new payment
PaymentGateway.registerPayment(orderData);
```

### API sama seperti sebelumnya
Semua functionality tetap sama, hanya struktur file yang lebih rapi:

```javascript
// Before (monolithic)
const PaymentGateway = require('./src/services/paymentGateway');

// After (modular) 
const PaymentGateway = require('./src/paymentGateway');

// API calls sama persis
PaymentGateway.startServer();
PaymentGateway.setBotInstance(bot);
PaymentGateway.registerPayment(orderData);
```

## 🔄 Migration Guide

### 1. Update Import Path
```javascript
// Old
const PaymentGateway = require('./src/services/paymentGateway');

// New
const PaymentGateway = require('./src/paymentGateway');
```

### 2. No Other Changes Needed
- All API endpoints sama
- Dashboard URL sama (`http://localhost:3000`)
- Webhook tester sama (`http://localhost:3000/webhook-tester`)
- Bot integration sama

## 🧪 Testing

### Test Dashboard
```bash
# Start bot
npm start

# Open browser
http://localhost:3000
```

### Test Webhook Simulator
```bash
# Open webhook tester
http://localhost:3000/webhook-tester
```

### Test API Endpoints
```bash
# Get pending payments
curl http://localhost:3000/api/payments/pending

# Get stats
curl http://localhost:3000/api/stats

# Get processing orders
curl http://localhost:3000/api/orders/processing
```

## 📊 Comparison

| Aspect | Monolithic | Modular |
|--------|-----------|---------|
| **Total Lines** | 1432 in 1 file | ~200 per file |
| **Maintainability** | ❌ Hard | ✅ Easy |
| **Frontend Edit** | ❌ Mixed with backend | ✅ Separate files |
| **Testing** | ❌ Hard to test | ✅ Easy to test |
| **Scalability** | ❌ Limited | ✅ Scalable |
| **Readability** | ❌ Overwhelming | ✅ Clear & focused |

## 🎨 Frontend Development

### Edit Dashboard Style
```bash
# Just edit CSS file
src/paymentGateway/public/css/dashboard.css
```

### Edit Dashboard Logic
```bash
# Just edit JS file
src/paymentGateway/public/js/dashboard.js
```

### Edit Dashboard HTML
```bash
# Just edit HTML file
src/paymentGateway/views/dashboard.html
```

**No need to touch server code!** 🎉

## 🔧 Adding New Routes

### 1. Create New Route File
```javascript
// src/paymentGateway/routes/reports.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    // Your logic here
});

module.exports = router;
```

### 2. Mount in index.js
```javascript
const reportsRouter = require('./routes/reports');
app.use('/api/reports', reportsRouter);
```

## 📝 Notes

- **Backward Compatible**: Semua functionality sama seperti versi monolithic
- **No Breaking Changes**: Existing code tetap jalan
- **Better Organization**: Easier untuk maintain & develop
- **Industry Standard**: Mengikuti best practices Express.js

## ✅ Checklist Migration

- [x] Create modular directory structure
- [x] Extract dataStore
- [x] Extract payment routes
- [x] Extract order routes
- [x] Extract stats routes
- [x] Extract webhook routes
- [x] Extract dashboard HTML/CSS/JS
- [x] Extract webhook tester HTML/CSS/JS
- [x] Create main index.js
- [x] Update import path in main index.js
- [x] Test all endpoints
- [x] Test dashboard
- [x] Test webhook tester
- [x] Documentation

---

**Developed with ❤️ for better code quality**
