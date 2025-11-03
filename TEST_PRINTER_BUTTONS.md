# 🧪 Test Printer & Cash Drawer - Quick Guide

## Tombol Test di Dashboard

Di halaman dashboard (`http://localhost:3000`), sekarang ada **2 tombol test** baru di bagian atas (sebelah tombol "Import Data"):

### 1. 🖨️ **Test Print** (Tombol Ungu)
**Fungsi:** Test koneksi printer dengan print struk test

**Output yang dicetak:**
```
    TEST PRINT
Printer is working!

[CUT]
```

**Gunakan untuk:**
- ✅ Cek apakah printer tersambung
- ✅ Cek apakah konfigurasi interface sudah benar
- ✅ Cek apakah printer bisa menerima ESC/POS command
- ✅ Cek apakah kertas thermal ada dan tidak habis

**Cara pakai:**
1. Buka dashboard: http://localhost:3000
2. Klik tombol **"🖨️ Test Print"** (ungu)
3. Konfirmasi di popup
4. Tunggu beberapa detik
5. Cek printer - harus keluar print "TEST PRINT"

---

### 2. 💰 **Test Buka Laci** (Tombol Orange)
**Fungsi:** Test buka cash drawer tanpa print struk

**Gunakan untuk:**
- ✅ Cek apakah laci kasir tersambung ke printer (port DK/RJ11)
- ✅ Cek apakah laci dapat power supply
- ✅ Cek apakah ESC/POS command untuk buka laci berfungsi
- ✅ Cek mekanisme laci (apakah smooth atau macet)

**Cara pakai:**
1. Buka dashboard: http://localhost:3000
2. Klik tombol **"💰 Test Buka Laci"** (orange)
3. Konfirmasi di popup
4. Tunggu 1-2 detik
5. Laci harus terbuka dengan suara "klik" dan sedikit terbuka

---

## Feedback Notifications

Setelah klik tombol, akan muncul notifikasi toast di pojok kanan atas:

### ✅ Success Messages:
- `✅ Test print berhasil! Cek printer Anda.`
- `✅ Laci kasir berhasil dibuka!`

### ❌ Error Messages:
- `❌ Test print gagal: Printer not connected`
- `❌ Gagal buka laci: Printer not connected`
- `❌ Error: Failed to connect to printer`

---

## Troubleshooting

### 🖨️ Test Print Gagal

**Error: "Printer not connected"**

**Solusi:**
1. Cek config di `src/config/config.js`:
   ```javascript
   enabled: true,  // Harus true!
   interface: 'printer:VSC TM-T88',  // Sesuaikan nama printer
   ```

2. Cek printer di Windows:
   ```powershell
   Get-Printer | Select-Object Name
   ```

3. Pastikan driver terinstall dan printer online

4. Restart bot: `npm start`

---

**Error: "Print tapi kertas tidak keluar"**

**Solusi:**
1. Cek kertas thermal sudah terpasang
2. Cek printer sudah online (lampu hijau)
3. Test print dari Windows dulu (Printer Properties → Test Page)

---

### 💰 Test Buka Laci Gagal

**Error: "Laci tidak terbuka"**

**Penyebab & Solusi:**

1. **Kabel RJ11 tidak tersambung**
   - Cek kabel dari laci ke port **DK** di belakang printer VSC
   - Pastikan plug masuk sempurna (klik)

2. **Laci tidak dapat power**
   - Cek adaptor laci (12V/24V) sudah colok listrik
   - Cek lampu indikator di laci (jika ada)

3. **Port DK salah**
   - VSC punya 2 port: DK1 (default) dan DK2
   - Coba pindah kabel ke port satunya

4. **Pin ESC/POS salah**
   - Edit `src/services/printerService.js` line ~53
   - Ganti dari pin 2 ke pin 5:
   ```javascript
   // Default (DK1)
   this.printer.openCashDrawer();
   
   // Atau coba DK2 (Pin 5)
   this.printer.raw(Buffer.from([0x1B, 0x70, 0x01, 0x78, 0xF0]));
   ```

---

## Workflow Testing

Sebelum pakai production, test dulu dengan urutan ini:

### Step 1: Test Print
1. ✅ Klik "Test Print"
2. ✅ Harus keluar struk "TEST PRINT"
3. ✅ Kertas terpotong rapi (jika ada auto-cutter)

### Step 2: Test Buka Laci
1. ✅ Klik "Test Buka Laci"
2. ✅ Laci harus buka dengan bunyi "klik"
3. ✅ Laci terbuka sekitar 2-3 cm

### Step 3: Test Full Flow (Auto)
1. ✅ Aktifkan di config:
   ```javascript
   enabled: true,
   autoPrint: true,
   autoOpenDrawer: true,
   ```
2. ✅ Restart bot
3. ✅ Buat order dummy (via cashier/WA)
4. ✅ Terima pembayaran di dashboard
5. ✅ Harus otomatis: print struk + buka laci

### Step 4: Test Manual Button
1. ✅ Di order "Sedang Diproses" atau "Siap Diambil"
2. ✅ Klik tombol "🖨️ Print & Buka Laci"
3. ✅ Harus print struk lengkap + buka laci

---

## Tips

### 🎯 Best Practice Testing:
- Test setiap kali restart bot
- Test setelah ganti konfigurasi
- Test setelah ganti kertas thermal
- Test setelah reconnect printer

### 🔄 Jika Ada Error:
1. Test manual dulu (tombol test)
2. Baru test auto-trigger
3. Cek log di terminal untuk error details

### 📝 Log Messages:
```bash
# Success
[Printer] ✅ Connected to EPSON at printer:VSC TM-T88
[Printer] 🖨️ Receipt printed for ORD-xxx
[Printer] 💰 Cash drawer opened
[OrderManager] ✅ Auto-printed receipt for ORD-xxx

# Error
[Printer] ❌ Failed to connect: ENOENT
[Printer] ❌ Failed to print: Printer offline
[OrderManager] ❌ Auto-print failed: Printer not connected
```

---

## Summary

**2 Tombol Test di Dashboard:**
- 🖨️ **Test Print** (ungu) → Test print struk "TEST PRINT"
- 💰 **Test Buka Laci** (orange) → Test buka cash drawer

**Lokasi:** Dashboard header, sebelah tombol "Import Data"

**Use Case:**
- Setup awal printer
- Troubleshooting koneksi
- Testing hardware
- Daily check sebelum buka toko

**Quick Test:** Buka http://localhost:3000 → Klik tombol test → Done! 🎉
