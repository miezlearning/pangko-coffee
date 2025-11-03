# 🚀 Quick Start - Menu Management

## Setup (Pertama Kali)

```bash
# 1. Jalankan bot
node index.js

# Bot akan otomatis:
# ✓ Membuat database
# ✓ Membuat tabel menu
# ✓ Import menu dari config.js
```

## Akses Dashboard

```
http://localhost:3000/menu
```

## Navigasi Menu Dashboard

```
Dashboard → Menu (di navbar)
atau langsung: http://localhost:3000/menu
```

## Quick Actions

### 1️⃣ Tambah Menu Baru
```
Klik "+ Tambah Item"
→ Isi ID (contoh: C009)
→ Isi Nama (contoh: Flat White)
→ Pilih Kategori
→ Isi Harga (contoh: 26000)
→ Simpan ✓
```

### 2️⃣ Edit Menu
```
Klik "Edit" pada item
→ Update data
→ Simpan ✓
```

### 3️⃣ Hapus Menu
```
Klik "Hapus" pada item
→ Konfirmasi
→ Selesai ✓
```

### 4️⃣ Toggle Ketersediaan
```
Edit item
→ Uncheck "Tersedia" untuk tandai habis
→ Simpan ✓
```

## Format ID Menu

| Kategori | Prefix | Contoh |
|----------|--------|--------|
| Kopi | C | C001, C002, C009 |
| Non-Kopi | N | N001, N002, N005 |
| Makanan | F | F001, F002, F005 |

## Tips 💡

- **ID harus unik** - Tidak boleh duplikat
- **Harga dalam Rupiah** - Tanpa desimal (15000, bukan 15000.00)
- **Kategori harus valid** - coffee, nonCoffee, atau food
- **Tidak perlu restart bot** - Perubahan langsung terlihat

## Test di WhatsApp

Setelah menambah/update menu:

```
!menu          → Lihat semua menu
!menu coffee   → Lihat menu kopi saja
!order C009 1  → Pesan menu baru
```

## Troubleshooting

**Menu tidak muncul di bot?**
- Pastikan item dicentang "Tersedia"
- Refresh dengan ketik `!menu` lagi

**Gagal simpan item?**
- Cek ID tidak duplikat
- Cek harga adalah angka valid
- Cek kategori dipilih dengan benar

**Dashboard tidak bisa dibuka?**
- Pastikan bot running
- Cek http://localhost:3000 dulu
- Cek console log untuk error

---

Need help? Check `MENU_DATABASE_GUIDE.md` untuk dokumentasi lengkap!
