# 🔒 Security & Permissions Guide

## Overview

Bot ini menggunakan **3-tier authorization system** untuk mengontrol akses ke commands:

1. **👥 Customer** - Public commands (order, menu, cart, etc)
2. **👨‍🍳 Barista/Kasir** - Queue management & order processing
3. **👑 Admin** - Full access termasuk testing & monitoring

---

## 🔑 Permission Levels

### **1. Customer (Public) 👥**

**Siapa:** Semua user WhatsApp yang chat dengan bot

**Akses Commands:**
- `!menu` - Lihat menu
- `!pesan` - Interactive order
- `!order [ID] [QTY]` - Quick order
- `!cart` - Lihat keranjang
- `!checkout` - Proses checkout
- `!pay` - Bayar pesanan
- `!confirm` - Konfirmasi pembayaran manual
- `!status` - Cek status pesanan
- `!cancel` - Batalkan pesanan
- `!help` - Bantuan

**Tidak Bisa:**
- ❌ Lihat antrian pesanan (`!queue`)
- ❌ Tandai pesanan ready (`!ready`)
- ❌ Batalkan pesanan orang lain (`!cancel-order`)
- ❌ Lihat semua orders (`!orders`)
- ❌ Testing commands (`!simulate`)

---

### **2. Barista/Kasir 👨‍🍳**

**Siapa:** Nomor WhatsApp yang terdaftar di `config.shop.baristaNumbers`

**Akses Commands:**
- ✅ **Semua customer commands** (bisa juga order)
- ✅ `!queue` - Lihat antrian pesanan aktif
- ✅ `!detail [ORDER_ID]` - Detail lengkap pesanan
- ✅ `!ready [ORDER_ID]` - Tandai pesanan siap
- ✅ `!history` - Riwayat hari ini
- ✅ `!cancel-order [ORDER_ID] [reason]` - Batalkan pesanan dengan alasan

**Tidak Bisa:**
- ❌ Admin testing commands (`!simulate`, `!dashboard`)
- ❌ System commands

---

### **3. Admin 👑**

**Siapa:** Nomor WhatsApp yang terdaftar di `config.shop.adminNumbers`

**Akses Commands:**
- ✅ **Semua customer commands**
- ✅ **Semua barista commands**
- ✅ `!simulate [ORDER_ID] [status]` - Simulate payment webhook
- ✅ `!orders` - List semua orders dengan filter
- ✅ `!dashboard` - Get dashboard links
- ✅ `!admin-help` - Admin command reference

---

## ⚙️ Configuration

### **Lokasi:** `src/config/config.js`

```javascript
shop: {
    // Barista WhatsApp Numbers
    baristaNumbers: [
        '6281345028895@s.whatsapp.net', // Barista 1
        '6281234567890@s.whatsapp.net', // Barista 2 (optional)
    ],

    // Admin Numbers
    adminNumbers: [
        '6281345028895@s.whatsapp.net', // Admin
    ]
}
```

### **⚠️ PENTING - Security Best Practices:**

1. **JANGAN** tambahkan customer number ke `baristaNumbers`
2. **JANGAN** share nomor yang ada di config ke customer
3. **SELALU** gunakan format lengkap: `628xxx@s.whatsapp.net`
4. Admin otomatis dapat akses barista commands (tidak perlu double entry)
5. Test dengan nomor customer untuk pastikan tidak bisa akses barista/admin commands

---

## 🛡️ Authorization Flow

### **Command Execution:**

```
1. User mengirim command (!queue)
   ↓
2. Bot check command type:
   - Public? → Execute langsung
   - Barista? → Check authorization
   - Admin? → Check authorization
   ↓
3. Authorization check:
   - Check if user in baristaNumbers → Allow
   - Check if user in adminNumbers → Allow
   - Else → Reject dengan "❌ Command ini hanya untuk barista/admin"
   ↓
4. Execute command atau reject
```

### **Example Code Pattern:**

Setiap command yang perlu restriction:

```javascript
async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    // Authorization check
    if (!isBarista(from)) {
        await sock.sendMessage(from, {
            text: `❌ Command ini hanya untuk barista/kasir.`
        });
        return;
    }
    
    // Command logic...
}

function isBarista(jid) {
    return config.shop.baristaNumbers.includes(jid) || 
           config.shop.adminNumbers.includes(jid);
}
```

---

## 🧪 Testing Authorization

### **Test 1: Customer Cannot Access Barista Commands**

```bash
# Dari customer number:
Customer: !queue

# Expected response:
Bot: ❌ Command ini hanya untuk barista/kasir.
```

### **Test 2: Customer Cannot Access Admin Commands**

```bash
# Dari customer number:
Customer: !simulate CF123456 success

# Expected response:
Bot: ❌ Command ini hanya untuk admin.
```

### **Test 3: Barista Can Access Queue**

```bash
# Dari barista number (yang ada di config):
Barista: !queue

# Expected response:
Bot: 📋 ANTRIAN PESANAN
     (shows queue)
```

### **Test 4: Barista Cannot Access Admin Commands**

```bash
# Dari barista number (yang TIDAK ada di adminNumbers):
Barista: !simulate CF123456 success

# Expected response:
Bot: ❌ Command ini hanya untuk admin.
```

### **Test 5: Admin Can Access Everything**

```bash
# Dari admin number:
Admin: !queue    # ✅ Works
Admin: !orders   # ✅ Works
Admin: !simulate # ✅ Works
Admin: !menu     # ✅ Works
```

---

## 📋 Protected Commands List

### **Barista-Only Commands:**

| Command | File | Auth Function |
|---------|------|---------------|
| `!queue` | `barista.js` | `isBarista()` |
| `!detail [ID]` | `barista.js` | `isBarista()` |
| `!history` | `barista.js` | `isBarista()` |
| `!cancel-order [ID] [reason]` | `barista.js` | `isBarista()` |
| `!ready [ID]` | `ready.js` | `isBarista()` |

### **Admin-Only Commands:**

| Command | File | Auth Function |
|---------|------|---------------|
| `!simulate [ID] [status]` | `admin.js` | `isAdmin()` |
| `!orders [filter]` | `admin.js` | `isAdmin()` |
| `!dashboard` | `admin.js` | `isAdmin()` |
| `!admin-help` | `admin.js` | `isAdmin()` |

---

## 🔧 Adding New Restricted Command

### **Template:**

```javascript
const config = require('../config/config');

module.exports = {
    name: 'your-command',
    description: '[BARISTA] Your description',
    
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // ADD THIS CHECK FOR BARISTA COMMANDS
        if (!this.isBarista(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk barista/kasir.`
            });
            return;
        }
        
        // OR THIS CHECK FOR ADMIN COMMANDS
        if (!this.isAdmin(from)) {
            await sock.sendMessage(from, {
                text: `❌ Command ini hanya untuk admin.`
            });
            return;
        }
        
        // Command logic...
    },
    
    isBarista(jid) {
        return config.shop.baristaNumbers.includes(jid) || 
               config.shop.adminNumbers.includes(jid);
    },
    
    isAdmin(jid) {
        return config.shop.adminNumbers.includes(jid);
    }
};
```

---

## 🚨 Common Security Mistakes

### **❌ WRONG - Customer in baristaNumbers:**

```javascript
baristaNumbers: [
    '6281345028895@s.whatsapp.net',  // Admin/Barista
    '6281345028261@s.whatsapp.net',  // ❌ CUSTOMER - JANGAN!
]
```

### **✅ CORRECT - Only real barista/kasir:**

```javascript
baristaNumbers: [
    '6281345028895@s.whatsapp.net',  // Real barista
    '6285191578901@s.whatsapp.net',  // Real barista 2
]
```

### **❌ WRONG - No authorization check:**

```javascript
async execute(sock, msg, args) {
    // Missing auth check!
    const orders = orderManager.getAllOrders();
    // ...
}
```

### **✅ CORRECT - With authorization:**

```javascript
async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (!this.isBarista(from)) {
        await sock.sendMessage(from, {
            text: `❌ Command ini hanya untuk barista/kasir.`
        });
        return;
    }
    
    const orders = orderManager.getAllOrders();
    // ...
}
```

---

## 🎯 Troubleshooting

### **Problem: Customer bisa akses barista commands**

**Solution:**
1. Check `config.js` → `shop.baristaNumbers`
2. Pastikan customer number **TIDAK** ada di list
3. Restart bot: `npm start`

### **Problem: Barista tidak bisa akses queue**

**Solution:**
1. Check format number: harus `628xxx@s.whatsapp.net`
2. Pastikan number ada di `baristaNumbers` array
3. Restart bot

### **Problem: Admin tidak bisa akses admin commands**

**Solution:**
1. Check `config.js` → `shop.adminNumbers`
2. Pastikan format: `628xxx@s.whatsapp.net`
3. Restart bot

---

## 📊 Permission Matrix

| Command Type | Customer | Barista | Admin |
|--------------|----------|---------|-------|
| Public (!menu, !order) | ✅ | ✅ | ✅ |
| Queue Management (!queue, !ready) | ❌ | ✅ | ✅ |
| Admin Tools (!simulate, !dashboard) | ❌ | ❌ | ✅ |

---

## 🔐 Best Practices

1. ✅ **Minimal Principle:** Beri akses sesuai kebutuhan saja
2. ✅ **Regular Audit:** Review baristaNumbers & adminNumbers setiap bulan
3. ✅ **Test Security:** Test dengan customer number untuk verify restrictions
4. ✅ **Log Everything:** Bot sudah log semua command executions
5. ✅ **Separate Testing:** Gunakan nomor terpisah untuk testing
6. ✅ **Document Changes:** Catat kapan add/remove numbers dari config
7. ✅ **Backup Config:** Backup `config.js` sebelum perubahan

---

## 📝 Summary

- **Customer:** Hanya bisa order & manage pesanan mereka sendiri
- **Barista:** Dapat manage antrian & proses semua pesanan
- **Admin:** Full access untuk testing & monitoring
- **Config:** Set nomor di `config.js` → `baristaNumbers` & `adminNumbers`
- **Security:** Authorization check di setiap protected command
- **Testing:** Test dengan customer number untuk verify restrictions work

---

**Last Updated:** November 1, 2025
**Bot Version:** 1.0.0
