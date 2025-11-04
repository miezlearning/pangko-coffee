/**
 * HPP Calculator - New Version
 * Separate sections: Bahan Baku, Produk, Tools Margin
 */

// State
let bahanBaku = [];
let produkList = [];
let uiState = {
    searchBahan: '',
    searchProduk: '',
};

// Load from localStorage
function loadData() {
    const saved = localStorage.getItem('hpp_calculator_v2');
    if (saved) {
        const data = JSON.parse(saved);
        bahanBaku = data.bahanBaku || [];
        produkList = data.produkList || [];
    } else {
        // Default bahan baku (contoh dari Excel)
        bahanBaku = [
            { id: Date.now() + 1, nama: 'Biji Kopi', netto: 500, harga: 170000, satuan: 'gram' },
            { id: Date.now() + 2, nama: 'Susu', netto: 1000, harga: 18900, satuan: 'ml' },
            { id: Date.now() + 3, nama: 'Cream', netto: 500, harga: 40000, satuan: 'ml' },
            { id: Date.now() + 4, nama: 'SKM', netto: 480, harga: 15000, satuan: 'ml' },
            { id: Date.now() + 5, nama: 'Syrup Caramel', netto: 850, harga: 110000, satuan: 'ml' },
            { id: Date.now() + 6, nama: 'Syrup Butterscotch', netto: 850, harga: 110000, satuan: 'ml' },
            { id: Date.now() + 7, nama: 'Air', netto: 19000, harga: 12000, satuan: 'ml' },
            { id: Date.now() + 8, nama: 'Es Batu', netto: 10000, harga: 12000, satuan: 'gram' },
            { id: Date.now() + 9, nama: 'Gelas', netto: 25, harga: 25000, satuan: 'pcs' },
            { id: Date.now() + 10, nama: 'Botol', netto: 10, harga: 13000, satuan: 'pcs' },
            { id: Date.now() + 11, nama: 'Stiker', netto: 22, harga: 22000, satuan: 'pcs' },
        ];
    }
}

// Save to localStorage
function saveData() {
    localStorage.setItem('hpp_calculator_v2', JSON.stringify({ bahanBaku, produkList }));
}

// Format Rupiah
function formatRupiah(amount) {
    return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

// Hitung harga per unit
function hitungHargaPerUnit(harga, netto) {
    return netto > 0 ? harga / netto : 0;
}

// ========================================
// SECTION 1: BAHAN BAKU
// ========================================

function renderBahanBaku() {
    const tbody = document.getElementById('bahan-baku-list');
    if (!tbody) return;

    const countBadge = document.getElementById('bahan-count');
    const query = (uiState.searchBahan || '').toLowerCase().trim();
    const filtered = query
        ? bahanBaku.filter(b => `${b.nama} ${b.satuan}`.toLowerCase().includes(query))
        : bahanBaku;
    if (countBadge) countBadge.textContent = `${filtered.length} item`;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-16 text-center text-charcoal/50">
                    <div class="text-6xl mb-3">📦</div>
                    <div class="text-lg font-semibold text-charcoal/70">Tidak ada bahan yang cocok</div>
                    <div class="text-sm text-charcoal/50 mt-1">Klik "Tambah" atau hapus pencarian</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(bahan => {
        const hargaPerUnit = hitungHargaPerUnit(bahan.harga, bahan.netto);
        return `
            <tr class="hover:bg-matcha/5 transition-colors duration-150">
                <td class="px-6 py-4 font-semibold text-charcoal">${bahan.nama}</td>
                <td class="px-6 py-4 text-right text-charcoal/70">${bahan.netto.toLocaleString('id-ID')} ${bahan.satuan}</td>
                <td class="px-6 py-4 text-right font-semibold text-charcoal">${formatRupiah(bahan.harga)}</td>
                <td class="px-6 py-4 text-right font-bold text-matcha">${formatRupiah(hargaPerUnit)}</td>
                <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="editBahan(${bahan.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit">✏️</button>
                        <button onclick="hapusBahan(${bahan.id})" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Hapus">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function tambahBahan() {
    openBahanModal();
}

function editBahan(id) {
    openBahanModal(id);
}

function hapusBahan(id) {
    if (!confirm('Hapus bahan ini?')) return;
    
    bahanBaku = bahanBaku.filter(b => b.id !== id);
    saveData();
    renderBahanBaku();
    renderAllProduk();
}

// ========================================
// SECTION 2: PRODUK
// ========================================

function renderAllProduk() {
    const container = document.getElementById('produk-list');
    if (!container) return;

    const countBadge = document.getElementById('produk-count');
    const query = (uiState.searchProduk || '').toLowerCase().trim();
    const filtered = query
        ? produkList.filter(p => p.nama.toLowerCase().includes(query))
        : produkList;
    if (countBadge) countBadge.textContent = `${filtered.length} produk`;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="rounded-2xl bg-gradient-to-br from-gray-50 to-white p-16 text-center border-2 border-dashed border-gray-300">
                <div class="text-7xl mb-4">☕</div>
                <div class="text-xl font-bold text-charcoal/70 mb-2">Belum Ada Produk</div>
                <div class="text-charcoal/50">Klik "Tambah Produk" untuk membuat menu pertama Anda</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(produk => renderProdukCard(produk)).join('');
}

function renderProdukCard(produk) {
    const totalHPP = hitungTotalHPP(produk.resep);
    const laba = produk.hargaJual - totalHPP;
    const margin = produk.hargaJual > 0 ? (laba / produk.hargaJual * 100) : 0;
    const marginColor = margin >= 50 ? 'green' : margin >= 30 ? 'blue' : margin >= 10 ? 'yellow' : 'red';

    return `
        <div class="rounded-2xl bg-white border-2 border-gray-100 shadow-md hover:shadow-xl transition-all duration-200">
            <!-- Header Produk -->
            <div class="bg-gradient-to-r from-gray-50 to-white px-6 py-5 border-b-2 border-gray-100">
                <div class="flex items-start justify-between gap-4 mb-4">
                    <div class="flex-1">
                        <h3 class="text-2xl font-extrabold text-charcoal mb-3 flex items-center gap-2">
                            <span>☕</span>
                            <span>${produk.nama}</span>
                        </h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div class="bg-gradient-to-br from-orange-50 to-orange-100 px-4 py-3 rounded-xl border border-orange-200">
                                <div class="text-xs font-bold text-orange-600 mb-1">HPP</div>
                                <div class="text-lg font-extrabold text-orange-800">${formatRupiah(totalHPP)}</div>
                            </div>
                            <div class="bg-gradient-to-br from-green-50 to-green-100 px-4 py-3 rounded-xl border border-green-200">
                                <div class="text-xs font-bold text-green-600 mb-1">Harga Jual</div>
                                <div class="text-lg font-extrabold text-green-800">${formatRupiah(produk.hargaJual)}</div>
                            </div>
                            <div class="bg-gradient-to-br from-blue-50 to-blue-100 px-4 py-3 rounded-xl border border-blue-200">
                                <div class="text-xs font-bold text-blue-600 mb-1">Laba</div>
                                <div class="text-lg font-extrabold text-blue-800">${formatRupiah(laba)}</div>
                            </div>
                            <div class="bg-gradient-to-br from-purple-50 to-purple-100 px-4 py-3 rounded-xl border border-purple-200">
                                <div class="text-xs font-bold text-purple-600 mb-1">Margin</div>
                                <div class="text-lg font-extrabold text-purple-800">${margin.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="flex flex-wrap gap-2">
                    <button onclick="editHargaJual(${produk.id})" class="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5">
                        <span>💰</span>
                        <span>Set Harga</span>
                    </button>
                    <button onclick="tambahResepItem(${produk.id})" class="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5">
                        <span>➕</span>
                        <span>Tambah Bahan</span>
                    </button>
                    <button onclick="duplikatProduk(${produk.id})" class="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5" title="Duplikat">
                        <span>📄</span>
                        <span>Duplikat</span>
                    </button>
                    <button onclick="hapusProduk(${produk.id})" class="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5">
                        <span>🗑️</span>
                        <span>Hapus</span>
                    </button>
                </div>
            </div>

            <!-- Tabel Resep -->
            <div class="px-6 py-4">
                <h4 class="text-sm font-bold text-charcoal/70 mb-3 flex items-center gap-2">
                    <span>🧾</span>
                    <span>RESEP & KOMPOSISI</span>
                </h4>
                <div class="overflow-hidden rounded-xl border border-gray-200">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left font-bold text-charcoal/70">Bahan</th>
                                <th class="px-4 py-3 text-right font-bold text-charcoal/70">Jumlah</th>
                                <th class="px-4 py-3 text-right font-bold text-charcoal/70">Harga/Unit</th>
                                <th class="px-4 py-3 text-right font-bold text-charcoal/70">Subtotal</th>
                                <th class="px-4 py-3 text-center font-bold text-charcoal/70">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${produk.resep.length === 0 ? `
                                <tr>
                                    <td colspan="5" class="px-4 py-8 text-center text-charcoal/50">
                                        <div class="text-3xl mb-2">📝</div>
                                        <div class="font-semibold">Belum ada bahan</div>
                                        <div class="text-xs mt-1">Klik "Tambah Bahan" untuk mulai</div>
                                    </td>
                                </tr>
                            ` : produk.resep.map((item, idx) => {
                                const bahan = bahanBaku.find(b => b.id === item.bahanId);
                                if (!bahan) return '';
                                
                                const hargaPerUnit = hitungHargaPerUnit(bahan.harga, bahan.netto);
                                const hpp = hargaPerUnit * item.jumlah;
                                
                                return `
                                    <tr class="hover:bg-blue-50/30 transition-colors">
                                        <td class="px-4 py-3 font-semibold text-charcoal">${bahan.nama}</td>
                                        <td class="px-4 py-3 text-right text-charcoal/80">${item.jumlah.toLocaleString('id-ID')} <span class="text-xs text-charcoal/60">${bahan.satuan}</span></td>
                                        <td class="px-4 py-3 text-right text-charcoal/70">${formatRupiah(hargaPerUnit)}</td>
                                        <td class="px-4 py-3 text-right font-bold text-orange-700">${formatRupiah(hpp)}</td>
                                        <td class="px-4 py-3 text-center">
                                            <div class="flex items-center justify-center gap-1">
                                                <button onclick="editResepItem(${produk.id}, ${idx})" class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all" title="Edit">✏️</button>
                                                <button onclick="hapusResepItem(${produk.id}, ${idx})" class="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all" title="Hapus">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            ${produk.resep.length > 0 ? `
                                <tr class="bg-gradient-to-r from-orange-50 to-orange-100 font-bold">
                                    <td colspan="3" class="px-4 py-3 text-right text-charcoal">TOTAL HPP:</td>
                                    <td class="px-4 py-3 text-right text-xl text-orange-800">${formatRupiah(totalHPP)}</td>
                                    <td></td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function hitungTotalHPP(resep) {
    return resep.reduce((total, item) => {
        const bahan = bahanBaku.find(b => b.id === item.bahanId);
        if (!bahan) return total;
        const hargaPerUnit = hitungHargaPerUnit(bahan.harga, bahan.netto);
        return total + (hargaPerUnit * item.jumlah);
    }, 0);
}

function tambahProduk() {
    openProdukModal();
}

function tambahResepItem(produkId) {
    openResepModal(produkId);
}

function editResepItem(produkId, idx) {
    openResepModal(produkId, idx);
}

function hapusResepItem(produkId, idx) {
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) return;

    if (!confirm('Hapus bahan dari resep?')) return;

    produk.resep.splice(idx, 1);
    saveData();
    renderAllProduk();
}

function editHargaJual(produkId) {
    openProdukModal(produkId);
}

function hapusProduk(produkId) {
    if (!confirm('Hapus produk ini?')) return;

    produkList = produkList.filter(p => p.id !== produkId);
    saveData();
    renderAllProduk();
}

// ========================================
// SECTION 3: TOOLS MARGIN
// ========================================

function setupMarginCalculator() {
    const hppInput = document.getElementById('margin-hpp');
    const targetInput = document.getElementById('margin-target');
    const resultDiv = document.getElementById('margin-result');

    if (!hppInput || !targetInput || !resultDiv) return;

    // Attach currency mask to HPP input
    attachCurrencyMask(hppInput);

    function calculate() {
        const hpp = parseCurrency(hppInput.value) || 0;
        const margin = parseFloat(targetInput.value) || 0;
        
        if (hpp <= 0) {
            resultDiv.textContent = 'Rp 0';
            return;
        }

        if (margin >= 100) {
            resultDiv.textContent = '∞';
            return;
        }

        // Formula: Harga Jual = HPP / (1 - Margin/100)
        const hargaJual = hpp / (1 - margin / 100);
        resultDiv.textContent = formatRupiah(hargaJual);
    }

    hppInput.addEventListener('input', calculate);
    targetInput.addEventListener('input', calculate);
}

// ========================================
// EXPORT & RESET
// ========================================

function exportToExcel() {
    // Simple CSV export (bisa upgrade pakai ExcelJS jika perlu)
    let csv = 'BAHAN BAKU\n';
    csv += 'Bahan,Netto,Harga Beli,Harga per Unit\n';
    bahanBaku.forEach(b => {
        const hargaPerUnit = hitungHargaPerUnit(b.harga, b.netto);
        csv += `${b.nama},${b.netto} ${b.satuan},${b.harga},${hargaPerUnit}\n`;
    });

    csv += '\n\nPRODUK\n';
    produkList.forEach(p => {
        const hpp = hitungTotalHPP(p.resep);
        const laba = p.hargaJual - hpp;
        const margin = p.hargaJual > 0 ? (laba / p.hargaJual * 100) : 0;

        csv += `\n${p.nama}\n`;
        csv += 'Bahan,Jumlah,Harga/Unit,HPP,Harga Jual,Laba,Margin\n';
        
        p.resep.forEach(item => {
            const bahan = bahanBaku.find(b => b.id === item.bahanId);
            if (bahan) {
                const hargaPerUnit = hitungHargaPerUnit(bahan.harga, bahan.netto);
                const itemHpp = hargaPerUnit * item.jumlah;
                csv += `${bahan.nama},${item.jumlah} ${bahan.satuan},${hargaPerUnit},${itemHpp},,,\n`;
            }
        });
        
        csv += `TOTAL,,,${hpp},${p.hargaJual},${laba},${margin.toFixed(2)}%\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HPP_Calculator_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('Export berhasil! File CSV sudah didownload.');
}

function resetAll() {
    if (!confirm('Reset semua data? Ini akan menghapus semua bahan baku dan produk!')) return;

    bahanBaku = [];
    produkList = [];
    saveData();
    renderBahanBaku();
    renderAllProduk();
}

// ========================================
// INIT
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderBahanBaku();
    renderAllProduk();
    setupMarginCalculator();

    // Event listeners
    const addBahanBtn = document.getElementById('add-bahan-btn');
    const addProdukBtn = document.getElementById('add-produk-btn');
    const exportBtn = document.getElementById('export-excel-btn');
    const resetBtn = document.getElementById('reset-all-btn');
    const searchBahan = document.getElementById('search-bahan');
    const searchProduk = document.getElementById('search-produk');
    const importBahanBtn = document.getElementById('import-bahan-btn');
    const importBahanInput = document.getElementById('import-bahan');

    if (addBahanBtn) addBahanBtn.addEventListener('click', tambahBahan);
    if (addProdukBtn) addProdukBtn.addEventListener('click', tambahProduk);
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
    if (resetBtn) resetBtn.addEventListener('click', resetAll);

    if (searchBahan) searchBahan.addEventListener('input', (e) => {
        uiState.searchBahan = e.target.value;
        renderBahanBaku();
    });
    if (searchProduk) searchProduk.addEventListener('input', (e) => {
        uiState.searchProduk = e.target.value;
        renderAllProduk();
    });
    if (importBahanBtn && importBahanInput) {
        importBahanBtn.addEventListener('click', () => importBahanInput.click());
        importBahanInput.addEventListener('change', handleImportBahanCsv);
    }

    // Init modals handlers
    setupModals();
});

// ==========================
// UI HELPERS (Modal, Toast)
// ==========================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const color = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-charcoal';
    toast.className = `fixed left-1/2 -translate-x-1/2 bottom-6 z-50 ${color} text-white px-4 py-2 rounded-lg shadow`; 
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 1800);
}

function setupModals() {
    document.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeAllModals());
    });

    // Bahan form
    const formBahan = document.getElementById('form-bahan');
    const hargaInput = document.getElementById('bahan-harga');
    if (hargaInput) attachCurrencyMask(hargaInput);
    if (formBahan) formBahan.addEventListener('submit', submitBahanForm);

    // Produk form
    const formProduk = document.getElementById('form-produk');
    const produkHarga = document.getElementById('produk-harga');
    if (produkHarga) attachCurrencyMask(produkHarga);
    if (formProduk) formProduk.addEventListener('submit', submitProdukForm);

    // Resep form
    const formResep = document.getElementById('form-resep');
    const bahanSearch = document.getElementById('resep-bahan-search');
    if (formResep) formResep.addEventListener('submit', submitResepForm);
    if (bahanSearch) bahanSearch.addEventListener('input', updateResepBahanList);
    // Click outside list hides it
    document.addEventListener('click', (e) => {
        const list = document.getElementById('resep-bahan-list');
        const input = document.getElementById('resep-bahan-search');
        if (!list || !input) return;
        if (!list.contains(e.target) && e.target !== input) list.classList.add('hidden');
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
function closeAllModals() {
    ['modal-bahan', 'modal-produk', 'modal-resep'].forEach(closeModal);
}

function attachCurrencyMask(input) {
    input.addEventListener('input', () => {
        const val = parseCurrency(input.value);
        input.value = val ? val.toLocaleString('id-ID') : '';
    });
}
function parseCurrency(text) {
    const cleaned = (text || '').toString().replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
}

// ==========================
// Bahan Modal Logic
// ==========================
function openBahanModal(id) {
    const title = document.getElementById('modal-bahan-title');
    const fid = document.getElementById('bahan-id');
    const nama = document.getElementById('bahan-nama');
    const netto = document.getElementById('bahan-netto');
    const satuan = document.getElementById('bahan-satuan');
    const harga = document.getElementById('bahan-harga');
    if (!title || !fid || !nama || !netto || !satuan || !harga) return;

    if (id) {
        const b = bahanBaku.find(x => x.id === id);
        if (!b) return;
        title.textContent = 'Edit Bahan';
        fid.value = b.id;
        nama.value = b.nama;
        netto.value = b.netto;
        satuan.value = b.satuan;
        harga.value = (b.harga || 0).toLocaleString('id-ID');
    } else {
        title.textContent = 'Tambah Bahan';
        fid.value = '';
        nama.value = '';
        netto.value = '';
        satuan.value = 'ml';
        harga.value = '';
    }
    openModal('modal-bahan');
}

function submitBahanForm(e) {
    e.preventDefault();
    const fid = document.getElementById('bahan-id').value;
    const nama = document.getElementById('bahan-nama').value.trim();
    const netto = parseFloat(document.getElementById('bahan-netto').value);
    const satuan = document.getElementById('bahan-satuan').value;
    const harga = parseCurrency(document.getElementById('bahan-harga').value);
    if (!nama || !satuan || isNaN(netto) || netto <= 0 || isNaN(harga) || harga < 0) {
        showToast('Mohon lengkapi data bahan dengan benar', 'error');
        return;
    }
    if (fid) {
        const idx = bahanBaku.findIndex(b => b.id === Number(fid));
        if (idx !== -1) bahanBaku[idx] = { ...bahanBaku[idx], nama, netto, satuan, harga };
        showToast('Bahan diperbarui', 'success');
    } else {
        bahanBaku.push({ id: Date.now(), nama, netto, satuan, harga });
        showToast('Bahan ditambahkan', 'success');
    }
    saveData();
    renderBahanBaku();
    renderAllProduk();
    closeModal('modal-bahan');
}

// ==========================
// Produk Modal Logic
// ==========================
function openProdukModal(id) {
    const title = document.getElementById('modal-produk-title');
    const fid = document.getElementById('produk-id');
    const nama = document.getElementById('produk-nama');
    const harga = document.getElementById('produk-harga');
    if (!title || !fid || !nama) return;
    if (id) {
        const p = produkList.find(x => x.id === id);
        if (!p) return;
        title.textContent = 'Edit Produk';
        fid.value = p.id;
        nama.value = p.nama;
        harga.value = (p.hargaJual || 0).toLocaleString('id-ID');
    } else {
        title.textContent = 'Tambah Produk';
        fid.value = '';
        nama.value = '';
        harga.value = '';
    }
    openModal('modal-produk');
}

function submitProdukForm(e) {
    e.preventDefault();
    const fid = document.getElementById('produk-id').value;
    const nama = document.getElementById('produk-nama').value.trim();
    const harga = parseCurrency(document.getElementById('produk-harga').value);
    if (!nama) {
        showToast('Nama produk wajib diisi', 'error');
        return;
    }
    if (fid) {
        const idx = produkList.findIndex(p => p.id === Number(fid));
        if (idx !== -1) produkList[idx] = { ...produkList[idx], nama, hargaJual: isNaN(harga) ? 0 : harga };
        showToast('Produk diperbarui', 'success');
    } else {
        produkList.push({ id: Date.now(), nama, hargaJual: isNaN(harga) ? 0 : harga, resep: [] });
        showToast('Produk ditambahkan', 'success');
    }
    saveData();
    renderAllProduk();
    closeModal('modal-produk');
}

function duplikatProduk(id) {
    const p = produkList.find(x => x.id === id);
    if (!p) return;
    const clone = JSON.parse(JSON.stringify(p));
    clone.id = Date.now();
    clone.nama = `${p.nama} (Copy)`;
    produkList.push(clone);
    saveData();
    renderAllProduk();
    showToast('Produk diduplikat', 'success');
}

// ==========================
// Resep Modal Logic
// ==========================
function openResepModal(produkId, idx = null) {
    const fidProduk = document.getElementById('resep-produk-id');
    const fidIdx = document.getElementById('resep-idx');
    const bahanSearch = document.getElementById('resep-bahan-search');
    const satuan = document.getElementById('resep-satuan');
    const jumlah = document.getElementById('resep-jumlah');
    if (!fidProduk || !fidIdx || !bahanSearch || !satuan || !jumlah) return;
    fidProduk.value = produkId;
    fidIdx.value = idx != null ? idx : '';
    bahanSearch.value = '';
    jumlah.value = '';
    satuan.value = '';
    bahanSearch.dataset.bahanId = '';
    if (idx != null) {
        const produk = produkList.find(p => p.id === produkId);
        if (produk && produk.resep[idx]) {
            const item = produk.resep[idx];
            const bahan = bahanBaku.find(b => b.id === item.bahanId);
            if (bahan) {
                bahanSearch.value = bahan.nama;
                bahanSearch.dataset.bahanId = bahan.id;
                satuan.value = bahan.satuan;
                jumlah.value = item.jumlah;
            }
        }
        document.getElementById('modal-resep-title').textContent = 'Edit Bahan Resep';
    } else {
        document.getElementById('modal-resep-title').textContent = 'Tambah Bahan ke Resep';
    }
    updateResepBahanList();
    openModal('modal-resep');
}

function updateResepBahanList() {
    const input = document.getElementById('resep-bahan-search');
    const list = document.getElementById('resep-bahan-list');
    const satuan = document.getElementById('resep-satuan');
    if (!input || !list) return;
    const q = (input.value || '').toLowerCase().trim();
    const items = q ? bahanBaku.filter(b => `${b.nama} ${b.satuan}`.toLowerCase().includes(q)) : bahanBaku;
    if (items.length === 0) {
        list.innerHTML = `<div class="px-4 py-3 text-sm text-charcoal/60 text-center">Tidak ada bahan yang cocok</div>`;
    } else {
        list.innerHTML = items.slice(0, 50).map(b => `
            <button type="button" data-bahan-id="${b.id}" class="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between group">
                <span class="font-semibold text-charcoal group-hover:text-blue-700">${b.nama}</span>
                <span class="text-xs text-charcoal/50 bg-gray-100 px-2 py-1 rounded-full">${b.satuan}</span>
            </button>
        `).join('');
    }
    list.classList.remove('hidden');
    list.querySelectorAll('button[data-bahan-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-bahan-id'));
            const b = bahanBaku.find(x => x.id === id);
            if (!b) return;
            input.value = b.nama;
            input.dataset.bahanId = b.id;
            if (satuan) satuan.value = b.satuan;
            list.classList.add('hidden');
        });
    });
}

function submitResepForm(e) {
    e.preventDefault();
    const produkId = Number(document.getElementById('resep-produk-id').value);
    const idxStr = document.getElementById('resep-idx').value;
    const bahanId = Number(document.getElementById('resep-bahan-search').dataset.bahanId || '');
    const jumlah = parseFloat(document.getElementById('resep-jumlah').value);
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) return;
    if (!bahanId || isNaN(jumlah) || jumlah <= 0) {
        showToast('Pilih bahan dan isi jumlah yang benar', 'error');
        return;
    }
    if (idxStr) {
        const idx = Number(idxStr);
        if (produk.resep[idx]) produk.resep[idx] = { bahanId, jumlah };
        showToast('Bahan resep diperbarui', 'success');
    } else {
        produk.resep.push({ bahanId, jumlah });
        showToast('Bahan ditambahkan ke resep', 'success');
    }
    saveData();
    renderAllProduk();
    closeModal('modal-resep');
}

// ==========================
// Import CSV Bahan
// ==========================
function handleImportBahanCsv(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const text = reader.result.toString();
            const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
            if (rows.length === 0) return;
            // Detect header
            const header = rows[0].toLowerCase();
            let startIdx = 0;
            if (header.includes('bahan') || header.includes('nama')) startIdx = 1;
            let imported = 0;
            for (let i = startIdx; i < rows.length; i++) {
                const cols = rows[i].split(',').map(c => c.trim());
                if (cols.length < 3) continue;
                let nama, netto, harga, satuan;
                if (cols.length >= 4) {
                    // Assume: nama, netto, satuan, harga OR nama, netto, harga, satuan
                    nama = cols[0];
                    netto = parseFloat(cols[1]);
                    if (isNaN(parseFloat(cols[2])) && cols[2]) {
                        // nama, netto, satuan, harga
                        satuan = cols[2] || 'ml';
                        harga = parseCurrency(cols[3] || '0');
                    } else {
                        // nama, netto, harga, satuan
                        harga = parseCurrency(cols[2] || '0');
                        satuan = cols[3] || 'ml';
                    }
                } else {
                    // Assume: nama, netto, harga
                    nama = cols[0];
                    netto = parseFloat(cols[1]);
                    harga = parseCurrency(cols[2] || '0');
                    satuan = 'ml';
                }
                if (!nama || isNaN(netto) || netto <= 0 || isNaN(harga)) continue;
                bahanBaku.push({ id: Date.now() + i, nama, netto, harga, satuan });
                imported++;
            }
            saveData();
            renderBahanBaku();
            showToast(`Import berhasil: ${imported} bahan`, 'success');
        } catch (err) {
            console.error(err);
            showToast('Gagal import CSV', 'error');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}
