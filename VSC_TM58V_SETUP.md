# 🖨️ Setup Printer VSC TM-58V + Cash Drawer

## Hardware: VSC TM-58V Thermal Printer

**Model**: VSC TM-58V  
**Width**: 58mm thermal printer  
**Protocol**: ESC/POS (EPSON compatible)  
**Connections**: USB, Serial (RS232), Network (optional dengan adapter)  
**Cash Drawer**: RJ11 port (12V/24V drawer compatible)  

---

## Quick Setup Guide

### Step 1: Sambungkan Hardware

#### A. USB Connection (Paling Mudah)
1. Colok kabel USB dari printer ke komputer
2. Install driver VSC jika belum (biasanya auto-detect Windows)
3. Pastikan printer muncul di Device Manager

**Cek USB ID:**
```powershell
# Windows PowerShell
Get-PnpDevice -Class Printer | Where-Object {$_.FriendlyName -like "*VSC*"}
```

Biasanya VSC TM-58V punya USB ID: `0x0fe6:0x811e`

#### B. Network Connection (dengan WiFi/Ethernet Adapter)
1. Sambungkan VSC ke network adapter
2. Default IP VSC biasanya: `192.168.192.168`
3. Print test page untuk konfirmasi IP

#### C. Serial (RS232)
1. Colok kabel serial ke COM port
2. Check COM port di Device Manager (biasanya COM3/COM4)
3. Set baud rate: 9600

#### D. Cash Drawer
1. Colok kabel RJ11 dari laci ke port **"DK"** di belakang printer VSC
2. Pastikan laci kasir sudah dapat power supply (umumnya 12V atau 24V)
3. Laci akan terbuka saat printer kirim ESC/POS command

---

### Step 2: Konfigurasi Bot

Edit file `src/config/config.js`:

```javascript
printer: {
    enabled: true,              // ✅ Aktifkan printer
    type: 'EPSON',              // VSC pakai protokol EPSON
    
    // PILIH SALAH SATU:
    
    // Option 1: USB (Recommended)
    interface: 'printer:VSC TM-T88',  // Nama printer di Windows
    // ATAU
    // interface: 'usb://0x0fe6:0x811e',  // USB ID langsung
    
    // Option 2: Network
    // interface: 'tcp://192.168.192.168',  // Default VSC IP
    
    // Option 3: Serial
    // interface: 'com://COM3',  // Port serial Windows
    
    autoPrint: true,            // Auto-cetak saat payment OK
    autoOpenDrawer: true,       // Auto-buka laci
    
    shopName: 'PANGKO COFFEE',
    shopAddress: 'Kolam Taman UNMUL Hub',
    shopPhone: '081345028895'
}
```

---

### Step 3: Testing

#### Test 1: Cek Printer Terdeteksi

```powershell
# Windows
# Cek apakah VSC muncul di printer list
Get-Printer | Where-Object {$_.Name -like "*VSC*"}
```

#### Test 2: Print Test Page dari Windows

1. Buka **Control Panel** → **Devices and Printers**
2. Klik kanan **VSC TM-T88** atau **TM-58V**
3. Klik **Printer Properties** → **Print Test Page**

Jika berhasil print, hardware sudah OK! ✅

#### Test 3: Test dari Bot

1. Start bot:
```bash
npm start
```

2. Buka browser: `http://localhost:3000`

3. Buka Console (F12), test:
```javascript
// 1. Cek status printer
fetch('/api/printer/status')
  .then(r => r.json())
  .then(d => console.log(d));

// 2. Test print
fetch('/api/printer/test', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));

// 3. Test buka laci
fetch('/api/printer/open-drawer', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));
```

---

## Troubleshooting VSC TM-58V

### ❌ Printer not connected

**Coba ganti interface:**

```javascript
// Coba pakai nama Windows printer
interface: 'printer:VSC TM-T88'

// Atau pakai USB ID
interface: 'usb://0x0fe6:0x811e'

// Atau cek COM port
interface: 'com://COM3'
```

**Install driver VSC:**
- Download dari website VSC atau disc driver
- Atau biarkan Windows install otomatis

### ❌ Laci tidak buka

VSC TM-58V punya 2 port DK (Drawer Kick):
- **DK1** = Pin 2 (default)
- **DK2** = Pin 5

Kalau pakai DK2, edit `src/services/printerService.js`:

```javascript
// Line ~53, ganti:
this.printer.openCashDrawer();  // Default pin 2

// Jadi:
// this.printer.raw(Buffer.from([0x1B, 0x70, 0x01, 0x78, 0xF0]));  // Pin 5 (DK2)
```

### ❌ Print terpotong atau terlalu lebar

VSC TM-58V adalah printer **58mm**, jadi max 32 karakter per baris.

Edit `src/services/printerService.js` kalau perlu adjust lebar:

```javascript
// Ganti characterSet jika ada masalah encoding
this.printer = new ThermalPrinter({
  type: printerTypes.EPSON,
  interface: config.interface,
  characterSet: 'SLOVENIA',  // Atau coba: 'PC437_USA', 'PC850_MULTILINGUAL'
  removeSpecialCharacters: false,
  lineCharacter: "=",
  width: 32,  // 58mm = 32 chars
});
```

### 🔧 USB Permission (Linux)

```bash
# Tambah udev rule untuk VSC
sudo nano /etc/udev/rules.d/99-vsc-printer.rules

# Isi:
SUBSYSTEM=="usb", ATTR{idVendor}=="0fe6", ATTR{idProduct}=="811e", MODE="0666"

# Reload
sudo udevadm control --reload-rules
sudo udevadm trigger
```

---

## Format Struk untuk 58mm

Printer 58mm punya keterbatasan lebar. Struk akan auto-adjust:

```
    PANGKO COFFEE
  Kolam Taman UNMUL Hub
    Telp: 081345028895
================================
Order: ORD-20250103-001
Waktu: 03/01/2025 14:30
Customer: John Doe
Metode: QRIS
================================
Item
Americano
 2x @ 18,000     36,000
 Note: Less sugar

Latte
 1x @ 24,000     24,000
================================
Subtotal           60,000
Biaya               1,000
Diskon            - 5,000
================================
TOTAL              56,000
================================
    Terima kasih!
  Selamat menikmati ☕


[CUT]
```

---

## VSC TM-58V Specs

- **Paper Width**: 58mm (±0.5mm)
- **Printing Width**: 48mm
- **Characters/Line**: 32 columns (font A)
- **Dots/Line**: 384 dots
- **Print Speed**: 90mm/sec
- **Interface**: USB, Serial, (Network optional)
- **Cash Drawer**: 2 ports (DK1/DK2) - 12V/24V
- **Cutter**: Manual or optional auto-cutter
- **Power**: 24V DC adapter

---

## Recommended Settings untuk VSC

```javascript
printer: {
    enabled: true,
    type: 'EPSON',
    interface: 'printer:VSC TM-T88',  // Atau sesuai nama di Windows
    autoPrint: true,
    autoOpenDrawer: true,
    
    // Customization
    shopName: 'PANGKO COFFEE',
    shopAddress: 'Kolam Taman UNMUL Hub',
    shopPhone: '081345028895'
}
```

---

## Need Help?

- Check cable connections
- Update VSC driver
- Restart printer & bot
- Check Event Viewer (Windows) untuk error logs

**VSC TM-58V is ready! 🖨️☕**
