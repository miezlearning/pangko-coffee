# 🔵 Setup VSC TM-58V via Bluetooth

## Cara Koneksi Printer via Bluetooth (Tanpa USB)

VSC TM-58V support Bluetooth, tapi `node-thermal-printer` tidak support Bluetooth secara native. **Solusinya**: Windows bisa map Bluetooth printer ke **COM Port virtual**.

---

## 📋 Step-by-Step Setup

### Step 1: Pair Printer via Bluetooth

1. **Nyalakan Bluetooth di Printer**
   - Pastikan VSC TM-58V dalam mode Bluetooth
   - Lampu indikator Bluetooth harus nyala/berkedip

2. **Buka Windows Settings**
   - Windows 11: Settings → Bluetooth & devices
   - Windows 10: Settings → Devices → Bluetooth & other devices

3. **Add Device**
   - Klik "Add device" atau "Add Bluetooth or other device"
   - Pilih "Bluetooth"
   - Tunggu VSC muncul di list (biasanya nama: "TM-58V" atau "VSC Printer")

4. **Pair**
   - Klik nama printer
   - Jika diminta PIN: coba `0000` atau `1234` (default Bluetooth printer)
   - Tunggu sampai status: "Connected"

---

### Step 2: Cek COM Port yang Dibuat

Setelah paired, Windows otomatis create **virtual COM port** untuk Bluetooth.

**Cara cek:**

```powershell
# PowerShell (Run as Administrator)
Get-WmiObject Win32_SerialPort | Select-Object Name, DeviceID

# Atau cek di Device Manager:
# Device Manager → Ports (COM & LPT)
# Cari: "Standard Serial over Bluetooth Link (COMx)"
```

**Output contoh:**
```
Name                                    DeviceID
----                                    --------
Standard Serial over Bluetooth Link (COM5)   COM5
Standard Serial over Bluetooth Link (COM6)   COM6  ⬅️ Ini yang VSC
```

**Catatan nomor COM port** (contoh: COM5, COM6, COM7, dll)

---

### Step 3: Update Config Bot

Edit `src/config/config.js`:

```javascript
printer: {
    enabled: true,
    type: 'EPSON',
    
    // ✅ BLUETOOTH via COM Port
    interface: 'com://COM6',  // ⬅️ Ganti dengan COM port yang benar
    
    // Baud rate untuk Bluetooth biasanya 9600
    // (node-thermal-printer auto-detect, tapi bisa manual set jika perlu)
    
    autoPrint: true,
    autoOpenDrawer: true,
    
    shopName: 'PANGKO COFFEE',
    shopAddress: 'Kolam Taman UNMUL Hub',
    shopPhone: '081345028895'
}
```

---

### Step 4: Test Koneksi

1. **Restart Bot**
   ```bash
   npm start
   ```

2. **Cek Log**
   ```
   [Printer] ✅ Connected to EPSON at com://COM6
   ```

3. **Test Print di Dashboard**
   - Buka: http://localhost:3000
   - Klik tombol **🖨️ Test Print** (ungu)
   - Printer harus cetak "TEST PRINT"

4. **Test Buka Laci**
   - Klik tombol **💰 Test Buka Laci** (orange)
   - Laci harus terbuka

---

## 🔧 Troubleshooting Bluetooth

### ❌ Bluetooth tidak connect / keeps disconnecting

**Penyebab:**
- Jarak terlalu jauh (>10 meter)
- Interference dari WiFi/device lain
- Power saving mode Windows

**Solusi:**
1. **Disable Power Saving untuk Bluetooth:**
   ```
   Device Manager → Bluetooth → [Your Bluetooth Adapter]
   → Properties → Power Management
   → Uncheck: "Allow the computer to turn off this device to save power"
   ```

2. **Disable Power Saving untuk COM Port:**
   ```
   Device Manager → Ports (COM & LPT) → [Your Bluetooth COM Port]
   → Properties → Power Management
   → Uncheck: "Allow the computer to turn off this device to save power"
   ```

3. **Dekatkan printer** (dalam 5 meter untuk koneksi stabil)

---

### ❌ Error: "Cannot open COM port"

**Solusi:**

1. **Cek COM port benar:**
   ```powershell
   Get-WmiObject Win32_SerialPort | Select-Object Name, DeviceID
   ```

2. **Pastikan tidak ada aplikasi lain yang pakai COM port:**
   - Close aplikasi printer/terminal lain
   - Restart bot

3. **Re-pair printer:**
   - Remove device di Bluetooth settings
   - Pair lagi dari awal

---

### ❌ Print sangat lambat via Bluetooth

**Normal!** Bluetooth lebih lambat dari USB:
- USB: ~90mm/sec
- Bluetooth: ~30-50mm/sec

**Tips untuk speed:**
- Pakai baud rate 9600 (default)
- Kurangi kompleksitas struk (less graphics)
- Dekatkan printer untuk signal lebih kuat

---

### ❌ Laci tidak buka via Bluetooth

Beberapa printer Bluetooth **tidak support** cash drawer command via BT.

**Workaround:**
1. **Pakai USB untuk cash drawer** (lebih reliable)
2. Atau **manual open** saja (tombol test)

Cek manual VSC TM-58V apakah cash drawer supported over Bluetooth.

---

## 🆚 Bluetooth vs USB Comparison

| Feature | USB | Bluetooth |
|---------|-----|-----------|
| **Speed** | ⚡ Fast (90mm/s) | 🐢 Slower (30-50mm/s) |
| **Latency** | ✅ Low (~50ms) | ⚠️ Higher (~200ms) |
| **Stability** | ✅ Very stable | ⚠️ Can drop |
| **Range** | ❌ 3-5 meters | ✅ 10+ meters |
| **Setup** | ✅ Plug & play | ⚠️ Pairing required |
| **Cash Drawer** | ✅ Always works | ⚠️ Sometimes not supported |
| **Power** | ✅ USB powered | ⚠️ Need adapter |

---

## 🎯 Recommended Setup

### Untuk Kasir Tetap (Fixed Position):
**USB** ⭐⭐⭐⭐⭐
- Lebih cepat, stabil, reliable
- Cash drawer pasti work

### Untuk Kasir Mobile (Moving around):
**Bluetooth** ⭐⭐⭐⭐
- Lebih fleksibel, no cable
- Good untuk kafe dengan multiple counter

### Hybrid Setup (Best of Both):
**USB untuk cash drawer + Bluetooth untuk receipt printer**
- 2 printers: 1 USB (laci) + 1 BT (struk)
- Advanced config required

---

## 📝 Quick Config Examples

### USB (Default):
```javascript
interface: 'printer:VSC TM-T88',
// atau
interface: 'usb://0x0fe6:0x811e',
```

### Network:
```javascript
interface: 'tcp://192.168.192.168',
```

### Serial (COM):
```javascript
interface: 'com://COM3',
```

### **Bluetooth (via COM):**
```javascript
interface: 'com://COM6',  // Virtual COM dari Bluetooth
```

---

## 🚀 Final Steps

1. ✅ Pair VSC via Bluetooth
2. ✅ Cek COM port: `Get-WmiObject Win32_SerialPort`
3. ✅ Update config: `interface: 'com://COM6'`
4. ✅ Restart bot: `npm start`
5. ✅ Test print: Dashboard → 🖨️ Test Print
6. ✅ Test drawer: Dashboard → 💰 Test Buka Laci

**Done! Bluetooth printer ready! 🔵🖨️☕**

---

## 💡 Tips

- Keep printer within 5 meters for stable connection
- Disable power saving on Bluetooth adapter & COM port
- Test daily sebelum buka toko (Bluetooth bisa disconnect overnight)
- Have USB cable as backup jika Bluetooth bermasalah

**Bluetooth support: ✅ YES (via COM Port mapping)**
