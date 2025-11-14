module.exports = {
    // Bot Configuration
    bot: {
        enabled: true,
        name: 'Pangko Coffee Bot',
        prefix: '!',
        timezone: 'Asia/Makassar'
    },

    // Payment Provider Integration (optional)
    // Enable this to use a real QRIS provider/aggregator that sends webhooks when paid
    paymentProvider: {
        enabled: false,           // set to true after configuring below
        name: 'generic',          // e.g., 'xendit', 'midtrans', 'duitku', etc.
        callbackSecret: 'CHANGE_ME', // shared secret or HMAC key provided by provider
        signatureHeader: 'x-callback-token', // header key used by provider for signature/token (adjust per provider)
        // If your provider uses HMAC with a specific header and algorithm, specify here:
        hmac: {
            enabled: false,
            header: 'x-signature',   // e.g., 'x-callback-signature'
            algorithm: 'sha256'       // 'sha256' | 'sha512'
        }
    },

    // BRI SNAP QRIS configuration
    briSnap: {
        enabled: process.env.BRI_SNAP_ENABLED === 'true',
        environment: process.env.BRI_SNAP_ENV || 'sandbox',
        clientId: process.env.BRI_SNAP_CLIENT_ID || '',
        clientSecret: process.env.BRI_SNAP_CLIENT_SECRET || '',
        partnerId: process.env.BRI_SNAP_PARTNER_ID || '',
        institutionCode: process.env.BRI_SNAP_INSTITUTION_CODE || '',
        merchantId: process.env.BRI_SNAP_MERCHANT_ID || '',
        terminalId: process.env.BRI_SNAP_TERMINAL_ID || '',
        storeName: process.env.BRI_SNAP_STORE_NAME || 'Pangko Coffee',
        webhookSecret: process.env.BRI_SNAP_WEBHOOK_SECRET || '',
        qrExpiryMinutes: Number.isFinite(Number(process.env.BRI_SNAP_QR_EXPIRY)) && Number(process.env.BRI_SNAP_QR_EXPIRY) > 0
            ? Number(process.env.BRI_SNAP_QR_EXPIRY)
            : 10,
        sandboxBaseUrl: 'https://sandbox.partner.api.bri.co.id',
        productionBaseUrl: 'https://partner.api.bri.co.id'
    },

    // Coffee Shop Configuration
    shop: {
        name: 'Pangko Coffee',
        address: 'Kolam Taman UNMUL Hub | https://maps.app.goo.gl/WmPLWhwaPPzKBwHBA', // TODO: ganti dengan alamat lengkap sesuai website Pangko
        openHours: '08:00 - 20:00 WITA', // jam operasional dengan label WITA
        contact: '6281345028895',
        
        // QRIS Static (Base QRIS dari merchant)
    qrisStatic: '00020101021126580013ID.CO.BRI.WWW01189360000200424118380208424118380303UMI51440014ID.CO.QRIS.WWW0215ID10254500161890303UMI5204581253033605802ID5914PANGKO COFFEE.6009SAMARINDA61057511162070703A0163043492', // QRIS merchant terbaru
        
        // Barista WhatsApp Numbers (untuk notifikasi & akses command barista)
        // ⚠️ PENTING: Hanya masukkan nomor barista/kasir ASLI disini
        // Customer TIDAK boleh ada di list ini!
        baristaNumbers: [
            // '6281345028895@s.whatsapp.net',
            '6281354902543@s.whatsapp.net', // dapin
            '6285330306512@s.whatsapp.net', // dipa
            '6282256877604@s.whatsapp.net', // fiko
            '6285163631059@s.whatsapp.net', // huda 
            '6281348411883@s.whatsapp.net' // tama
        ],

        // Admin Numbers (untuk akses penuh ke semua command)
        // Admin otomatis dapat akses barista commands juga
        adminNumbers: [
            '6281345028895@s.whatsapp.net', // Nomor admin
            '6285163631059@s.whatsapp.net', // huda 
            '6281348411883@s.whatsapp.net'
        ]
    },

    // Menu Configuration
    // NOTE: Menu sekarang disimpan di database (src/data/database.db)
    // Gunakan dashboard untuk mengelola menu: http://localhost:3000/menu
    // Data di bawah ini hanya sebagai default untuk inisialisasi awal
    menu: {
        categories: {
            coffee: {
                name: '☕ Kopi',
                emoji: '☕'
            },
            nonCoffee: {
                name: '🥤 Non-Kopi',
                emoji: '🥤'
            },
            food: {
                name: '🍰 Makanan',
                emoji: '🍰'
            }
        },
        
        items: [
            // Coffee
            { id: 'X0', name: 'Test', category: 'coffee', price: 1, available: true },
            { id: 'C001', name: 'Espresso', category: 'coffee', price: 15000, available: true },
            { id: 'C002', name: 'Americano', category: 'coffee', price: 18000, available: true },
            { id: 'C003', name: 'Cappuccino', category: 'coffee', price: 22000, available: true },
            { id: 'C004', name: 'Latte', category: 'coffee', price: 24000, available: true },
            { id: 'C005', name: 'Mocha', category: 'coffee', price: 26000, available: true },
            { id: 'C006', name: 'Caramel Macchiato', category: 'coffee', price: 28000, available: true },
            { id: 'C007', name: 'Vietnam Drip', category: 'coffee', price: 20000, available: true },
            { id: 'C008', name: 'Kopi Susu Gula Aren', category: 'coffee', price: 22000, available: true },
            
            // Non-Coffee
            { id: 'N001', name: 'Matcha Latte', category: 'nonCoffee', price: 25000, available: true },
            { id: 'N002', name: 'Chocolate', category: 'nonCoffee', price: 23000, available: true },
            { id: 'N003', name: 'Green Tea', category: 'nonCoffee', price: 18000, available: true },
            { id: 'N004', name: 'Lemon Tea', category: 'nonCoffee', price: 15000, available: true },
            
            // Food
            { id: 'F001', name: 'Croissant', category: 'food', price: 20000, available: true },
            { id: 'F002', name: 'Sandwich', category: 'food', price: 28000, available: true },
            { id: 'F003', name: 'Cheese Cake', category: 'food', price: 30000, available: true },
            { id: 'F004', name: 'Brownies', category: 'food', price: 25000, available: true }
        ]
    },

    // Order Configuration
    order: {
        maxItemsPerOrder: 10,
        orderTimeout: 15, // minutes
        paymentTimeout: 10, // minutes
        cashTimeout: 10, // minutes to reach cashier before auto-cancel
        // Anti-abuse for cash reopen
        maxReopenPerOrder: 1, // allow only once per order
        reopenCooldownMinutes: 3, // must wait this long after cancel before !lanjut
        minOrderAmount: 10000,
        
        // Fee Configuration (optional)
        serviceFee: {
            enabled: false,
            type: 'percent', // 'percent' or 'rupiah'
            amount: 2 // 2% or 2000 rupiah
        }
    },

    // Printer Configuration
    // Catatan pemakaian:
    // - Jika menggunakan Windows Printer (USB001), isi printerName sesuai nama printer di Windows (Get-Printer)
    //   dan biarkan interface kosong. Service akan otomatis membentuk interface 'printer:<NamaPrinter>'.
    // - Jika menggunakan COM (serial), isi serialPort (mis. 'COM6') dan biarkan interface kosong → akan jadi 'com://COM6'.
    // - Jika menggunakan jaringan, isi tcpHost (mis. '192.168.1.50') dan biarkan interface kosong → akan jadi 'tcp://<host>'.
    printer: {
        enabled: true,              // Set true untuk aktifkan printer
        type: 'EPSON',               // Mayoritas thermal ESC/POS gunakan EPSON

        // Opsi input sederhana (pilih salah satu, sisanya kosong):
        printerName: '',       // Dikosongkan, karena kita pakai serial
        serialPort: 'COM10',              // Port dari Bluetooth
        tcpHost: '',                 // Dikosongkan

        // Kalau ingin override manual, bisa isi langsung salah satu:
        // interface: 'printer:POS-58',
        interface: '',

        // Baud rate hanya relevan untuk sebagian perangkat serial; tetap disimpan utk referensi
        baudRate: 9600,

    receiptTemplate: '58mm',   // Default ukuran struk: 58mm | 80mm
    // Jumlah feed line tambahan sebelum cut (untuk beberapa printer yang memotong terlalu dekat).
    // Set ke 0 untuk tidak menambah baris kosong.
    cutFeedLines: 0,
    skipCutFeed: true,

        autoPrint: true,             // Auto-print receipt ketika pembayaran terkonfirmasi
        autoOpenDrawer: false,       // Auto-open cash drawer (port RJ11)
        // Pengaturan cash drawer (ESC p m t1 t2)
        // m: 0(pin2) atau 1(pin5), t1/t2: durasi pulsa (0-255) dalam unit ~2ms (80 ≈ 160ms)
        drawer: {
            pin: 0,      // 0 = pin2, 1 = pin5 (coba tukar jika tidak membuka)
            t1: 80,      // waktu ON
            t2: 80       // waktu OFF
        },
        
        // Kustomisasi struk (58mm)
        shopName: 'PANGKO COFFEE',
        shopAddress: 'Jl. Contoh No. 123',
        shopPhone: '0812-3456-7890',
        // Tampilkan rincian harga item yang terpisah (harga dasar, add-on, total per item)
        detailedItemBreakdown: true,
        // Opsional: Integrasi RawBT (Android)
        // Jika Anda ingin mencetak lewat aplikasi RawBT di Android,
        // set `rawbt.enabled: true`. Aplikasi akan menghasilkan tautan `rawbt://`
        // yang dapat diklik dari perangkat Android untuk memicu cetak.
        // Catatan: Mode ini tidak mengirim data ke printer dari server Windows.
        rawbt: {
            enabled: true,
            title: 'Pangko Receipt' // Judul yang muncul di RawBT
        }
    },

    // Messages Template
    messages: {
    welcome: `Selamat datang di *{shopName}*! ☕

📍 Lokasi: {address}
⏰ Jam Operasional: {openHours}
📞 Kontak (WA): {contact}

Ketik *!menu* untuk melihat daftar menu.
Ketik *!order* untuk mulai pesan.
Ketik *!help* untuk bantuan.

Seluruh waktu ditampilkan dalam WITA (Asia/Makassar).`,

    orderSuccess: ` *[ ORDER SUCCESS ✅ ]!*

Order ID: {orderId}
Total: Rp {total}

Silakan lakukan pembayaran dalam {timeout} menit.
Ketik *!pay {orderId}* untuk melanjutkan pembayaran (QRIS) atau pilih *CASH* saat checkout untuk bayar di kasir.`,

    paymentPending: `*[ PAYMENT PENDING 💳 ]!*
Order ID: {orderId}
Total Pembayaran: Rp {total}

Scan QRIS di bawah ini untuk membayar.
⏰ Batas waktu: {expiry} (WITA)

Setelah transfer, tunggu konfirmasi dari kasir. Jika butuh bantuan, hubungi kami.`,

    paymentConfirmed: `*[ PAYMENT CONFIRMED ✅ ]!*

Order ID: {orderId}
Terima kasih! Pesanan Anda sedang diproses oleh barista *{shopName}* ☕

Estimasi waktu 10–15 menit. Kami akan beri tahu saat sudah siap diambil.`,

    orderReady: `*[ READY TO PICKUP! ☕ ]!*

Order ID: {orderId}
Pesanan Anda sudah siap.

Silakan ambil di counter dengan menyebutkan *Order ID* dan *nama pemesan*.
Terima kasih telah memesan di *{shopName}*! ☕`
    }
,
    // Inventory / Stok recap configuration
    inventory: {
        // Default format when UI tidak mengirim format eksplisit
        // opsi: 'professional' | 'compact' | 'rounded' | 'block'
        defaultRecapFormat: 'rounded',
        // Ambang batas "segera pesan" (fraction), mis. 0.2 = 20%
        buySoonThreshold: 0.2
    },

    // AI Insights (Gemini or user-provided endpoint)
    // Configure with environment variables in production
    gemini: {
        apiUrl: process.env.GEMINI_API_URL || '', // e.g. your proxy or direct Gemini endpoint
        apiKey: process.env.GEMINI_API_KEY || ''  // set in environment, do NOT commit keys
    }
}