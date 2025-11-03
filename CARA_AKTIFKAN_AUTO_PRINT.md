# 🚀 CONTOH CONFIG SIAP PAKAI - VSC TM-58V

## Aktifkan Auto-Print & Auto-Open Drawer

Ganti section `printer` di `src/config/config.js` dengan ini:

```javascript
// Printer Configuration
printer: {
    // ✅ AKTIFKAN PRINTER
    enabled: true,              // SET TRUE untuk aktifkan
    
    // VSC TM-58V menggunakan protokol EPSON
    type: 'EPSON',
    
    // PILIH SALAH SATU INTERFACE:
    // ===========================
    
    // OPTION 1: USB (Recommended) ⭐
    interface: 'printer:VSC TM-T88',  // Nama printer di Windows
    
    // ATAU jika nama berbeda, cek dulu dengan:
    // PowerShell: Get-Printer | Select-Object Name
    // Lalu ganti dengan nama yang muncul, contoh:
    // interface: 'printer:TM-T88V',
    // interface: 'printer:VSC Thermal Printer',
    
    // OPTION 2: USB dengan ID langsung
    // interface: 'usb://0x0fe6:0x811e',  // VSC USB ID
    
    // OPTION 3: Network (jika pakai WiFi/Ethernet adapter)
    // interface: 'tcp://192.168.192.168',  // Default VSC IP
    
    // OPTION 4: Serial/COM Port
    // interface: 'com://COM3',  // Cek di Device Manager
    
    // ✅ AKTIFKAN AUTO-PRINT & AUTO-OPEN
    autoPrint: true,            // ⬅️ AUTO-CETAK saat payment diterima
    autoOpenDrawer: true,       // ⬅️ AUTO-BUKA LACI setelah print
    
    // Info Toko untuk Struk (58mm width)
    shopName: 'PANGKO COFFEE',
    shopAddress: 'Kolam Taman UNMUL Hub',
    shopPhone: '081345028895'
},
```

---

## 🎯 Flow Otomatis

### Scenario 1: Pembayaran QRIS
```
1. Customer scan QRIS dan bayar
2. Kasir klik "✅ Terima Pembayaran" di dashboard
3. Status berubah: pending → processing
4. 🖨️ OTOMATIS PRINT STRUK
5. 💰 OTOMATIS BUKA LACI
6. Barista mulai buat pesanan
```

### Scenario 2: Pembayaran Tunai
```
1. Customer datang ke kasir dengan pesanan
2. Kasir klik "✅ Terima Tunai & Mulai Proses"
3. Status berubah: pending_cash → processing
4. 🖨️ OTOMATIS PRINT STRUK
5. 💰 OTOMATIS BUKA LACI
6. Kasir terima uang, taruh di laci
7. Barista mulai buat pesanan
```

---

## ⚙️ Kontrol Manual (Tetap Ada)

Selain otomatis, di dashboard tetap ada tombol manual:

**Section "Sedang Diproses":**
- 🖨️ **Print & Buka Laci** (manual trigger jika perlu print ulang)
- ✅ **Tandai Siap** (pindah ke ready)

**Section "Siap Diambil":**
- 🖨️ **Print & Buka Laci** (manual trigger untuk print ulang)
- ✔️ **Tandai Sudah Diambil** (selesaikan order)

---

## 🧪 Testing

### 1. Cek Nama Printer di Windows

```powershell
# PowerShell
Get-Printer | Select-Object Name

# Output contoh:
# Name
# ----
# Microsoft Print to PDF
# VSC TM-T88          ⬅️ Ini yang dipakai!
# Fax
```

### 2. Edit Config

Ganti `interface` dengan nama printer yang muncul:
```javascript
interface: 'printer:VSC TM-T88',  // Sesuaikan dengan nama di atas
```

### 3. Restart Bot

```bash
npm start
```

**Cek log saat startup:**
```
[Printer] ✅ Connected to EPSON at printer:VSC TM-T88
```

Jika muncul ini, printer siap! ✅

### 4. Test Manual Print

Buka http://localhost:3000, tekan F12 (Console):

```javascript
// Test print
fetch('/api/printer/test', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));
```

Printer harus cetak "TEST PRINT" ✅

### 5. Test Buka Laci

```javascript
// Test drawer
fetch('/api/printer/open-drawer', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));
```

Laci harus terbuka! 💰✅

### 6. Test Full Flow

1. Buat order baru (via WhatsApp atau `/cashier`)
2. Pilih metode pembayaran (QRIS/CASH)
3. Kasir terima pembayaran di dashboard
4. **Harus otomatis:**
   - 🖨️ Print struk
   - 💰 Buka laci
   - 📱 Notif WhatsApp ke customer

---

## 🔧 Troubleshooting

### Printer tidak print otomatis

**Cek:**
1. `enabled: true` ✅
2. `autoPrint: true` ✅
3. `interface` sudah benar ✅

**Log di terminal:**
```
[OrderManager] ✅ Auto-printed receipt for ORD-xxx
```

Jika tidak muncul log ini, berarti config belum benar.

### Laci tidak buka otomatis

**Cek:**
1. `autoOpenDrawer: true` ✅
2. Kabel RJ11 laci tersambung ke port **DK** di printer ✅
3. Laci kasir sudah dapat power ✅

**Coba buka manual:**
```javascript
fetch('/api/printer/open-drawer', {method: 'POST'})
```

Jika manual bisa tapi auto tidak, cek config lagi.

### Error: Printer not connected

**Solusi:**

**1. Cek nama printer:**
```powershell
Get-Printer | Select-Object Name
```

**2. Update config dengan nama yang benar:**
```javascript
interface: 'printer:NAMA_YANG_BENAR',
```

**3. Restart bot**

---

## 📋 Checklist Siap Pakai

- [ ] Hardware VSC TM-58V tersambung (USB/Network/Serial)
- [ ] Laci kasir tersambung ke port DK di printer
- [ ] Driver VSC terinstall (atau Windows auto-detect)
- [ ] Print test page dari Windows berhasil ✅
- [ ] Config `enabled: true`
- [ ] Config `autoPrint: true`
- [ ] Config `autoOpenDrawer: true`
- [ ] Config `interface` sesuai nama printer
- [ ] Bot restart & log "✅ Connected to EPSON"
- [ ] Test manual print berhasil
- [ ] Test manual drawer berhasil
- [ ] Test full flow auto-print + auto-drawer

**Semua checklist ✅ = READY TO USE! 🎉**

---

## 🎯 Summary

**YA**, sistem sudah **100% otomatis**:

✅ Saat kasir terima pembayaran (QRIS/Tunai)  
✅ Otomatis print struk lengkap  
✅ Otomatis buka laci kasir  
✅ Tanpa klik tombol tambahan  

**Tinggal:**
1. Set `enabled: true`
2. Set `autoPrint: true`
3. Set `autoOpenDrawer: true`
4. Ganti `interface` sesuai nama printer Anda
5. Restart bot

**DONE! 🖨️💰☕**
