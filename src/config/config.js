module.exports = {
    // Bot Configuration
    bot: {
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

    // Coffee Shop Configuration
    shop: {
        name: 'Pangko Coffee',
        address: 'Kolam Taman UNMUL Hub | https://maps.app.goo.gl/WmPLWhwaPPzKBwHBA', // TODO: ganti dengan alamat lengkap sesuai website Pangko
        openHours: '08:00 - 20:00 WITA', // jam operasional dengan label WITA
        contact: '6281345028895',
        
        // QRIS Static (Base QRIS dari merchant)
        qrisStatic: '00020101021126610014COM.GO-JEK.WWW01189360091433658182180210G3658182180303UMI51440014ID.CO.QRIS.WWW0215ID10254499802480303UMI5204581253033605802ID5914Pangko Coffee 6009SAMARINDA61057524262070703A0163047707', // Ganti dengan QRIS asli kamu
        
        // Barista WhatsApp Numbers (untuk notifikasi & akses command barista)
        // ⚠️ PENTING: Hanya masukkan nomor barista/kasir ASLI disini
        // Customer TIDAK boleh ada di list ini!
        baristaNumbers: [
            '6281345028895@s.whatsapp.net'
        ],

        // Admin Numbers (untuk akses penuh ke semua command)
        // Admin otomatis dapat akses barista commands juga
        adminNumbers: [
            '6281345028895@s.whatsapp.net', // Nomor admin
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
    printer: {
        enabled: false,              // Set to true to enable printer
        type: 'EPSON',               // VSC TM-58V uses EPSON ESC/POS protocol
        interface: 'tcp://192.168.192.168', // VSC TM-58V default IP (change if needed)
        // VSC TM-58V Connection Options:
        // - USB: 'printer:VSC TM-T88' or 'usb://0x0fe6:0x811e' (VSC USB ID)
        // - Network: 'tcp://192.168.192.168' (default VSC IP)
        // - Serial: 'com://COM3' (Windows) or '/dev/ttyUSB0' (Linux)
        // - Bluetooth: 'com://COM5' (pair via Windows, then use virtual COM port)
        //   Lihat BLUETOOTH_PRINTER_SETUP.md untuk cara setup Bluetooth
        
        autoPrint: false,            // Auto-print receipt when payment confirmed
        autoOpenDrawer: false,       // Auto-open cash drawer after print (RJ11 port)
        
        // Receipt customization (58mm width)
        shopName: 'PANGKO COFFEE',
        shopAddress: 'Jl. Contoh No. 123',
        shopPhone: '0812-3456-7890'
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

    orderSuccess: `✅ *Pesanan Berhasil Dibuat*

Order ID: {orderId}
Total: Rp {total}

Silakan lakukan pembayaran dalam {timeout} menit.
Ketik *!pay {orderId}* untuk melanjutkan pembayaran (QRIS) atau pilih *CASH* saat checkout untuk bayar di kasir.`,

    paymentPending: `💳 *Menunggu Pembayaran*

Order ID: {orderId}
Total Pembayaran: Rp {total}

Scan QRIS di bawah ini untuk membayar.
⏰ Batas waktu: {expiry} (WITA)

Setelah transfer, tunggu konfirmasi dari kasir. Jika butuh bantuan, hubungi kami.`,

    paymentConfirmed: `✅ *Pembayaran Dikonfirmasi*

Order ID: {orderId}
Terima kasih! Pesanan Anda sedang diproses oleh barista *{shopName}* ☕

Estimasi waktu 10–15 menit. Kami akan beri tahu saat sudah siap diambil.`,

    orderReady: `🎉 *Pesanan Siap Diambil!*

Order ID: {orderId}
Pesanan Anda sudah siap.

Silakan ambil di counter dengan menyebutkan *Order ID* dan *nama pemesan*.
Terima kasih telah memesan di *{shopName}*! ☕`
    }
}