# 🖨️ Panduan Setup Printer Kasir & Laci Uang

## Fitur

✅ **Auto-Print Receipt** - Otomatis cetak struk saat pembayaran dikonfirmasi  
✅ **Auto-Open Cash Drawer** - Otomatis buka laci kasir setelah print  
✅ **Manual Controls** - Tombol manual di dashboard untuk print & buka laci  
✅ **ESC/POS Protocol** - Kompatibel dengan berbagai thermal printer  
✅ **RawBT (Android) Link** - Bisa generate tautan `rawbt://` untuk cetak dari HP

---

## Hardware Requirements

### 1. Thermal Printer
- **Recommended**: ESC/POS compatible thermal printer (58mm or 80mm)
- **Brands**: Epson, Star, Daruma, Tanca, dll
- **Connection**: USB, Serial (RS232), atau Network (Ethernet/WiFi)

### 2. Cash Drawer (Optional)
- **Connection**: RJ11/RJ12 port di printer
- **Compatibility**: Hampir semua laci kasir 12V/24V compatible
- **Catatan**: Laci kasir tersambung ke printer, BUKAN langsung ke komputer

---

## Konfigurasi

### Step 1: Edit `src/config/config.js`

Temukan section `printer` dan ubah sesuai kebutuhan:

```javascript
// Printer Configuration
printer: {
    enabled: true,              // Set ke true untuk aktifkan printer
    type: 'EPSON',              // 'EPSON' | 'STAR' | 'DARUMA' | 'TANCA'
    interface: 'tcp://192.168.1.100', // Sesuaikan dengan koneksi printer
    
    autoPrint: true,            // Auto-print saat payment confirmed
    autoOpenDrawer: true,       // Auto-open laci setelah print
    
    // Receipt customization
    shopName: 'PANGKO COFFEE',
    shopAddress: 'Jl. Contoh No. 123',
    shopPhone: '0812-3456-7890'
},

// Opsional: Integrasi RawBT (Android)
rawbt: {
  enabled: false,            // set ke true untuk mode RawBT
  title: 'Pangko Receipt'    // judul di aplikasi RawBT
},
```

### Step 2: Tentukan Interface Connection

#### A. Network Printer (Ethernet/WiFi) - **RECOMMENDED**
```javascript
interface: 'tcp://192.168.1.100'  // Ganti dengan IP printer
```

**Cara cari IP printer:**
1. Print test page dari printer (lihat manual)
2. Atau cek di router/admin panel network
3. Atau gunakan app network scanner

#### B. USB Printer
```javascript
interface: 'usb://0x04b8:0x0e15'  // Format: usb://VENDOR_ID:PRODUCT_ID
```

**Cara cari USB ID:**

**Windows:**
```powershell
# PowerShell
Get-PnpDevice -Class Printer | Select-Object FriendlyName, InstanceId
```

**Linux/Mac:**
```bash
lsusb
# Output contoh: Bus 001 Device 003: ID 04b8:0e15 Seiko Epson Corp.
```

#### C. Serial Port (RS232)
```javascript
interface: 'com://COM3'           // Windows
interface: '/dev/ttyUSB0'         // Linux
interface: '/dev/tty.usbserial'   // Mac
```

#### D. RawBT (Android) – Tanpa koneksi langsung dari server

Jika Anda ingin mencetak dari HP Android yang terpasang aplikasi RawBT:

1) Set `rawbt.enabled: true` pada `config.js`.
2) Jalankan dashboard seperti biasa. Di mode ini, server TIDAK mengirim data ke printer fisik.
3) Ambil tautan `rawbt://` lalu buka di HP Android untuk memicu cetak:

Cara mendapatkan tautan:

- Via API (sample):
  - Buka: `http://localhost:3000/api/printer/rawbt/sample-link`
  - Hasil JSON berisi `rawbtUrl`. Kirim/scan link itu di Android, lalu klik untuk cetak via RawBT.
- Via per-order:
  - Buka: `http://localhost:3000/api/printer/rawbt/link/<ORDER_ID>`
- Via script:
  - Jalankan: `npm run print:rawbt` lalu salin URL yang ditampilkan.

Catatan:
- Tautan `rawbt://` berisi teks struk yang sudah diformat. Ini memastikan kompatibilitas luas.
- Untuk cetak QR dalam bentuk grafis penuh diperlukan integrasi biner ESC/POS; versi awal ini fokus pada teks yang rapi terlebih dulu.

### Step 3: Pilih Type Printer

Sesuaikan dengan brand printer Anda:

- **EPSON** - Untuk printer Epson (TM-T82, TM-U220, dll)
- **STAR** - Untuk printer Star Micronics (TSP100, TSP650, dll)
- **DARUMA** - Untuk printer Daruma (DR700, dll)
- **TANCA** - Untuk printer Tanca

**Kalau tidak yakin, coba EPSON dulu** - paling umum kompatibel.

---

## Testing Connection

### 1. Start Bot
```bash
npm start
```

### 2. Buka Dashboard
```
http://localhost:3000
```

### 3. Test Print di Browser Console
```javascript
// Test status printer
fetch('/api/printer/status')
  .then(r => r.json())
  .then(d => console.log(d));

// Test print
fetch('/api/printer/test', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));

// Test buka laci
fetch('/api/printer/open-drawer', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));
```

---

## Troubleshooting

### ❌ Printer not connected

**Kemungkinan penyebab:**
1. **Interface salah** - Cek IP/USB ID/Port sudah benar
2. **Printer offline** - Pastikan printer nyala dan ready
3. **Firewall block** - Untuk network printer, pastikan port terbuka
4. **USB permission** - Linux butuh udev rules (lihat bawah)

**Solusi:**
```javascript
// Coba test connection dulu
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: 'tcp://192.168.1.100'
});

console.log('Testing connection...');
// Kalau ini tidak error, koneksi OK
```

### ❌ Cash drawer tidak terbuka

**Kemungkinan penyebab:**
1. **Laci tidak tersambung** - Cek kabel RJ11 ke printer
2. **Pin salah** - Beberapa printer pakai pin 5 bukan pin 2
3. **Voltage tidak cukup** - Pastikan power supply laci memadai

**Solusi:**
Edit `printerService.js` line ~53:
```javascript
// Coba ganti pin dari 0 ke 1
this.printer.openCashDrawer(1);  // Pin 5 instead of Pin 2
```

### 🐧 Linux USB Permission

Kalau pakai USB di Linux, tambahkan udev rules:

```bash
# Buat file udev rule
sudo nano /etc/udev/rules.d/99-printer.rules

# Tambahkan (ganti VENDOR_ID & PRODUCT_ID):
SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0e15", MODE="0666"

# Reload udev
sudo udevadm control --reload-rules
sudo udevadm trigger

# Restart bot
```

### 🔒 Windows Shared Printer

Kalau printer shared di network Windows:

```javascript
// TIDAK BISA langsung!
// Harus map ke IP printer, bukan nama share

// ❌ SALAH
interface: '\\\\COMPUTER\\PrinterName'

// ✅ BENAR
interface: 'tcp://192.168.1.100'  // IP printer
```

---

## Usage

### Auto-Trigger

Printer akan otomatis cetak + buka laci saat:
- Pembayaran QRIS dikonfirmasi (pending → processing)
- Pembayaran CASH diterima kasir (pending_cash → processing)

**Syarat:**
- `enabled: true`
- `autoPrint: true`
- `autoOpenDrawer: true`

### Manual Controls

Di dashboard, setiap order di section **"Sedang Diproses"** dan **"Siap Diambil"** ada tombol:

🖨️ **Print & Buka Laci** - Cetak struk ulang dan buka laci manual

---

## Format Struk

Struk yang dicetak akan berisi:

```
        PANGKO COFFEE
    Jl. Contoh No. 123
   Telp: 0812-3456-7890
================================
Order ID: ORD-20250103-001
Waktu   : 03/01/2025 14:30
Pelanggan: John Doe
Metode  : QRIS
================================
Item
Americano
   2x   @ Rp 18,000   Rp 36,000
  Note: Less sugar

Latte
   1x   @ Rp 24,000   Rp 24,000
================================
Subtotal         Rp 60,000
Biaya            Rp  1,000
Diskon         - Rp  5,000
================================
TOTAL            Rp 56,000
================================
      Terima kasih!
    Selamat menikmati ☕


[CUT]
```

---

## Advanced Configuration

### Custom Receipt Layout

Edit `src/services/printerService.js` di function `printReceipt()`:

```javascript
// Tambah logo
this.printer.alignCenter();
this.printer.printImage('./logo.png');

// Ganti font size
this.printer.setTextSize(2, 2);  // Width, Height

// Bold text
this.printer.bold(true);
this.printer.println('TOTAL BAYAR');
this.printer.bold(false);

// QR Code di struk
this.printer.printQR(order.orderId, {
  cellSize: 6,
  correction: 'M'
});
```

### Multiple Printers

Untuk multiple printer (dapur, kasir, dll), extend printerService:

```javascript
// config.js
printer: {
    main: {
        enabled: true,
        interface: 'tcp://192.168.1.100',  // Kasir
    },
    kitchen: {
        enabled: true,
        interface: 'tcp://192.168.1.101',  // Dapur
    }
}
```

---

## API Endpoints

- `GET /api/printer/status` - Cek status printer
- `POST /api/printer/test` - Test print
- `POST /api/printer/open-drawer` - Buka laci manual
- `POST /api/printer/print/:orderId` - Print struk (tanpa buka laci)
- `POST /api/printer/print-and-open/:orderId` - Print + buka laci
- `GET /api/printer/rawbt/sample-link` - Dapatkan tautan RawBT untuk struk contoh (mode RawBT)
- `GET /api/printer/rawbt/link/:orderId` - Dapatkan tautan RawBT untuk Order tertentu (mode RawBT)

---

## Support

Butuh bantuan? Check:
- [node-thermal-printer docs](https://github.com/Klemen1337/node-thermal-printer)
- ESC/POS command reference di manual printer Anda

---

**Happy printing! 🖨️☕**
