# Menu Database Migration Guide

## 📋 Overview
Sistem menu telah dipindahkan dari konfigurasi statis (`config.js`) ke database SQLite untuk kemudahan pengelolaan melalui dashboard web.

## 🎯 Perubahan yang Dilakukan

### 1. **Database Schema**
Menambahkan 2 tabel baru di `src/data/database.db`:

#### `menu_categories`
- `id` (TEXT, PRIMARY KEY) - ID kategori (coffee, nonCoffee, food)
- `name` (TEXT) - Nama kategori dengan emoji
- `emoji` (TEXT) - Emoji kategori
- `sortOrder` (INTEGER) - Urutan tampilan
- `createdAt` (TEXT) - Waktu dibuat
- `updatedAt` (TEXT) - Waktu update terakhir

#### `menu_items`
- `id` (TEXT, PRIMARY KEY) - ID item menu (C001, N001, F001, dll)
- `name` (TEXT) - Nama item
- `category` (TEXT) - Kategori item
- `price` (INTEGER) - Harga dalam Rupiah
- `available` (INTEGER) - Status ketersediaan (1/0)
- `description` (TEXT) - Deskripsi item (opsional)
- `image` (TEXT) - URL gambar (opsional, untuk fitur masa depan)
- `createdAt` (TEXT) - Waktu dibuat
- `updatedAt` (TEXT) - Waktu update terakhir

### 2. **File Baru**

#### `src/services/menuStore.js`
Service layer untuk mengelola menu di database:
- `getCategories()` - Ambil semua kategori
- `getCategoryById(id)` - Ambil kategori berdasarkan ID
- `saveCategory(data)` - Simpan/update kategori
- `deleteCategory(id)` - Hapus kategori
- `getMenuItems(filters)` - Ambil items dengan filter
- `getMenuItemById(id)` - Ambil item berdasarkan ID
- `saveMenuItem(data)` - Simpan/update item
- `deleteMenuItem(id)` - Hapus item
- `getMenuGrouped()` - Ambil menu yang dikelompokkan per kategori
- `initializeDefaultMenu()` - Inisialisasi menu default dari config

#### `src/paymentGateway/routes/menu.js`
REST API endpoints untuk menu management:
- `GET /api/menu/categories` - List semua kategori
- `GET /api/menu/categories/:id` - Detail kategori
- `POST /api/menu/categories` - Create/update kategori
- `DELETE /api/menu/categories/:id` - Hapus kategori
- `GET /api/menu/items` - List items (dengan filter)
- `GET /api/menu/items/:id` - Detail item
- `POST /api/menu/items` - Create/update item
- `DELETE /api/menu/items/:id` - Hapus item
- `GET /api/menu/grouped` - Menu per kategori

#### `src/paymentGateway/views/menu.html`
Halaman web untuk menu management dengan fitur:
- Lihat semua menu items dalam tabel
- Filter berdasarkan kategori
- Tambah item baru
- Edit item yang ada
- Hapus item
- Toggle status ketersediaan

#### `src/paymentGateway/public/js/menu.js`
Client-side JavaScript untuk halaman menu management

### 3. **File yang Diupdate**

#### `src/services/orderStore.js`
Menambahkan schema tabel `menu_categories` dan `menu_items` di fungsi `initDb()`

#### `src/config/config.js`
Menambahkan komentar bahwa menu sekarang di database, data di config hanya untuk inisialisasi awal

#### `src/commands/menu.js`
- Import `menuStore`
- Menggunakan `menuStore.getMenuItems()` dan `menuStore.getCategories()` sebagai pengganti `config.menu`

#### `src/commands/order.js`
- Import `menuStore`
- Menggunakan `menuStore.getMenuItems()` untuk top items
- Menggunakan `menuStore.getMenuItemById()` untuk validasi item

#### `src/commands/orderInteractive.js`
- Import `menuStore`
- Menggunakan `menuStore.getMenuItems()` dan `menuStore.getCategoryById()` untuk menampilkan menu

#### `src/paymentGateway/index.js`
- Import dan mount `menuRouter`
- Menambahkan route `GET /menu` untuk serve halaman menu management

#### `src/paymentGateway/views/dashboard.html`
- Menambahkan link "Menu" di navbar

## 🚀 Cara Menggunakan

### Akses Menu Management Dashboard
1. Pastikan bot berjalan (`node index.js`)
2. Buka browser ke `http://localhost:3000/menu`
3. Anda akan melihat halaman menu management

### Menambah Item Baru
1. Klik tombol **"+ Tambah Item"**
2. Isi form:
   - **ID Menu**: Kode unik (contoh: C009 untuk kopi, N005 untuk non-kopi)
   - **Nama Item**: Nama menu
   - **Kategori**: Pilih dari dropdown (Kopi, Non-Kopi, Makanan)
   - **Harga**: Harga dalam Rupiah
   - **Deskripsi**: Deskripsi singkat (opsional)
   - **Tersedia**: Centang jika item tersedia
3. Klik **"Simpan"**

### Edit Item
1. Klik tombol **"Edit"** pada item yang ingin diubah
2. Update data yang diperlukan
3. Klik **"Simpan"**

### Hapus Item
1. Klik tombol **"Hapus"** pada item yang ingin dihapus
2. Konfirmasi penghapusan
3. Item akan dihapus dari database

### Filter Menu
Gunakan tab kategori di atas tabel untuk filter menu berdasarkan:
- **Semua** - Tampilkan semua item
- **☕ Kopi** - Hanya item kopi
- **🥤 Non-Kopi** - Hanya item non-kopi
- **🍰 Makanan** - Hanya makanan

## 📊 Migrasi Data Awal

Saat pertama kali bot dijalankan setelah update ini:
1. Database akan otomatis dibuat di `src/data/database.db`
2. Tabel `menu_categories` dan `menu_items` akan dibuat
3. Data menu dari `config.js` akan otomatis diimport ke database
4. Bot akan menggunakan data dari database untuk semua operasi

**Catatan**: Data di `config.js` hanya digunakan untuk inisialisasi pertama kali. Setelah itu, semua perubahan harus dilakukan melalui dashboard.

## 🔄 Backward Compatibility

Semua command WhatsApp tetap berfungsi normal:
- `!menu` - Menampilkan menu dari database
- `!order` - Validasi item dari database
- `!pesan` - Interactive order menggunakan database

## 🛠️ API Documentation

### Get All Items
```http
GET /api/menu/items
```

Query Parameters (optional):
- `category` - Filter by category (coffee, nonCoffee, food)
- `available` - Filter by availability (true/false)

### Get Single Item
```http
GET /api/menu/items/:id
```

### Create/Update Item
```http
POST /api/menu/items
Content-Type: application/json

{
  "id": "C009",
  "name": "Flat White",
  "category": "coffee",
  "price": 26000,
  "available": true,
  "description": "Espresso dengan microfoam milk"
}
```

### Delete Item
```http
DELETE /api/menu/items/:id
```

## ⚠️ Important Notes

1. **Backup Database**: Selalu backup file `src/data/database.db` sebelum melakukan perubahan besar
2. **ID Unik**: Pastikan setiap item memiliki ID unik
3. **Format Harga**: Harga harus dalam format integer (Rupiah penuh, tanpa desimal)
4. **Kategori Valid**: Hanya gunakan kategori yang sudah terdaftar (coffee, nonCoffee, food)

## 🎨 Keuntungan Sistem Baru

✅ **Mudah Dikelola**: Update menu tanpa edit code  
✅ **Real-time**: Perubahan langsung terlihat di bot  
✅ **User-friendly**: Interface web yang intuitif  
✅ **Scalable**: Mudah menambah kategori atau field baru  
✅ **Track Changes**: Timestamp untuk audit trail  
✅ **No Restart**: Tidak perlu restart bot untuk update menu  

## 🔮 Fitur Masa Depan

- Upload gambar menu
- Manajemen kategori custom
- Import/export menu dari Excel
- Menu variations (size, topping, dll)
- Inventory tracking
- Sales analytics per item

## 🐛 Troubleshooting

### Menu tidak muncul di bot
- Cek apakah database sudah terinisialisasi
- Cek log untuk error
- Pastikan item memiliki `available: true`

### Gagal menyimpan item
- Cek apakah ID sudah unik
- Validasi format harga (harus angka)
- Pastikan kategori valid

### Dashboard tidak bisa diakses
- Pastikan bot berjalan
- Cek port 3000 tidak digunakan aplikasi lain
- Cek console untuk error

---

**Author**: Pangko Coffee Development Team  
**Last Updated**: November 3, 2025  
**Version**: 2.0.0
