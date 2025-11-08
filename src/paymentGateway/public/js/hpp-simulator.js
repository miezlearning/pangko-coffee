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

function getBahanById(id) {
    return bahanBaku.find(b => b.id === id) || null;
}

function upsertResepBahan(produk, bahanId, jumlah, meta) {
    if (!produk || !produk.resep) return;
    const idx = produk.resep.findIndex(item => item.bahanId === bahanId);
    if (jumlah > 0) {
        if (idx !== -1) {
            produk.resep[idx].jumlah = jumlah;
            if (meta) produk.resep[idx].meta = meta;
        } else {
            const newItem = { bahanId, jumlah };
            if (meta) newItem.meta = meta;
            produk.resep.push(newItem);
        }
    } else if (idx !== -1) {
        produk.resep.splice(idx, 1);
    }
}

function isBahanCompound(bahan) {
    return Array.isArray(bahan?.komposisi) && bahan.komposisi.length > 0 && Number(bahan.komposisiYield) > 0;
}

function hitungKomposisiBatchCost(bahan, visited = new Set()) {
    if (!isBahanCompound(bahan)) return null;
    if (visited.has(bahan.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(bahan.id);
    return bahan.komposisi.reduce((total, item) => {
        const child = getBahanById(item.bahanId);
        if (!child) return total;
        return total + hitungIngredientCost(child, item.jumlah, nextVisited);
    }, 0);
}

function calculateBahanUnitCost(bahan, visited = new Set()) {
    if (!bahan) return 0;
    if (visited.has(bahan.id)) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(bahan.id);

    if (isBahanCompound(bahan)) {
        const batchCost = bahan.komposisi.reduce((total, item) => {
            const child = getBahanById(item.bahanId);
            if (!child) return total;
            return total + hitungIngredientCost(child, item.jumlah, nextVisited);
        }, 0);
        const output = Number(bahan.komposisiYield);
        return output > 0 ? batchCost / output : 0;
    }

    const qty = Number(bahan.netto || 0);
    const harga = Number(bahan.harga || 0);
    return qty > 0 ? harga / qty : 0;
}

function calculateEspressoMetrics(profile) {
    if (!profile) return null;
    const coffee = getBahanById(profile.coffeeBahanId);
    const water = getBahanById(profile.waterBahanId);
    if (!coffee || !water) return null;

    const dose = Number(profile.doseGram || 0);
    const waterMl = Number(profile.waterMl || 0);
    const yieldMl = Number(profile.yieldMl || waterMl);

    const coffeeCost = dose > 0 ? hitungIngredientCost(coffee, dose) : 0;
    const waterCost = waterMl > 0 ? hitungIngredientCost(water, waterMl) : 0;
    const ratio = dose > 0 && waterMl > 0 ? waterMl / dose : null;
    const shotsPerBag = dose > 0 && Number(coffee.netto) > 0 ? Math.floor(Number(coffee.netto) / dose) : null;

    return {
        coffee,
        water,
        dose,
        waterMl,
        yieldMl,
        ratio,
        coffeeCost,
        waterCost,
        totalCost: coffeeCost + waterCost,
        shotsPerBag
    };
}

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    const rounded = Number(value);
    if (!Number.isFinite(rounded)) return '-';
    return rounded.toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function updateEspressoRatioDisplay() {
    const doseInput = document.getElementById('espresso-dose');
    const waterInput = document.getElementById('espresso-water-ml');
    const ratioField = document.getElementById('espresso-ratio');
    if (!doseInput || !waterInput || !ratioField) return;
    const dose = parseFloat(doseInput.value);
    const water = parseFloat(waterInput.value);
    if (dose > 0 && water > 0) {
        ratioField.value = formatNumber(water / dose, 2);
    } else {
        ratioField.value = '-';
    }
    updateEspressoModalSummary();
}

function updateEspressoModalSummary() {
    const summaryEl = document.getElementById('espresso-summary');
    if (!summaryEl) return;
    const coffeeSelect = document.getElementById('espresso-coffee');
    const waterSelect = document.getElementById('espresso-water');
    const dose = parseFloat(document.getElementById('espresso-dose')?.value || '0');
    const waterMl = parseFloat(document.getElementById('espresso-water-ml')?.value || '0');
    const yieldMl = parseFloat(document.getElementById('espresso-yield-ml')?.value || '0');
    const profile = {
        coffeeBahanId: Number(coffeeSelect?.value || 0),
        waterBahanId: Number(waterSelect?.value || 0),
        doseGram: dose,
        waterMl,
        yieldMl
    };
    const metrics = calculateEspressoMetrics(profile);
    if (!metrics) {
        summaryEl.innerHTML = '<p class="text-sm text-charcoal/50">Pilih bahan kopi & air untuk melihat ringkasan biaya.</p>';
        return;
    }

    summaryEl.innerHTML = `
        <div class="rounded-xl border border-matcha/30 bg-matcha/10 px-4 py-3 text-sm text-charcoal/80">
            <div class="flex flex-wrap gap-4">
                <div>
                    <div class="text-xs font-semibold text-charcoal/60">Kopi</div>
                    <div class="font-semibold">${metrics.coffee.nama}</div>
                    <div class="text-xs text-charcoal/60">Dose: ${formatNumber(metrics.dose, 1)} g</div>
                    <div class="text-xs text-charcoal/60">Biaya: ${formatRupiah(metrics.coffeeCost)}</div>
                </div>
                <div>
                    <div class="text-xs font-semibold text-charcoal/60">Air</div>
                    <div class="font-semibold">${metrics.water.nama}</div>
                    <div class="text-xs text-charcoal/60">Pemakaian: ${formatNumber(metrics.waterMl, 0)} ml</div>
                    <div class="text-xs text-charcoal/60">Biaya: ${formatRupiah(metrics.waterCost)}</div>
                </div>
                <div>
                    <div class="text-xs font-semibold text-charcoal/60">Ringkasan</div>
                    <div class="text-xs text-charcoal/60">Brew ratio: ${metrics.ratio ? `1 : ${formatNumber(metrics.ratio, 2)}` : '-'}</div>
                    <div class="text-xs text-charcoal/60">Yield: ${yieldMl > 0 ? `${formatNumber(yieldMl, 0)} ml` : '-'}</div>
                    <div class="text-xs text-charcoal/60">Total biaya shot: <span class="font-semibold text-charcoal">${formatRupiah(metrics.totalCost)}</span></div>
                    ${metrics.shotsPerBag ? `<div class="text-xs text-charcoal/60">Per ${metrics.coffee.netto} ${metrics.coffee.satuan}: ~${metrics.shotsPerBag} shot</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

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
            { id: Date.now() + 1, nama: 'Biji Kopi', netto: 500, harga: 170000, satuan: 'gram', density: null, waste_pct: 3 },
            { id: Date.now() + 2, nama: 'Susu', netto: 1000, harga: 18900, satuan: 'ml', density: 1.03, waste_pct: 5 },
            { id: Date.now() + 3, nama: 'Cream', netto: 500, harga: 40000, satuan: 'ml', density: 1.02, waste_pct: 3 },
            { id: Date.now() + 4, nama: 'SKM', netto: 480, harga: 15000, satuan: 'ml', density: 1.15, waste_pct: 2 },
            { id: Date.now() + 5, nama: 'Syrup Caramel', netto: 850, harga: 110000, satuan: 'ml', density: 1.25, waste_pct: 2 },
            { id: Date.now() + 6, nama: 'Syrup Butterscotch', netto: 850, harga: 110000, satuan: 'ml', density: 1.25, waste_pct: 2 },
            { id: Date.now() + 7, nama: 'Air', netto: 19000, harga: 12000, satuan: 'ml', density: 1.0, waste_pct: 0 },
            // Es Batu set as pcs bundle (e.g. 24 pcs per bag) so per-item cost equals 500 when harga=12.000
            { id: Date.now() + 8, nama: 'Es Batu', netto: 24, harga: 12000, satuan: 'pcs', density: null, waste_pct: 5 },
            { id: Date.now() + 9, nama: 'Gelas', netto: 25, harga: 25000, satuan: 'pcs', density: null, waste_pct: 0 },
            { id: Date.now() + 10, nama: 'Botol', netto: 10, harga: 13000, satuan: 'pcs', density: null, waste_pct: 0 },
            { id: Date.now() + 11, nama: 'Stiker', netto: 22, harga: 22000, satuan: 'pcs', density: null, waste_pct: 0 },
        ];
    }

    normalizeBahanData();
    autoCreateEspressoFormula();
    produkList = (produkList || []).map(p => ({ ...p, resep: Array.isArray(p.resep) ? p.resep : [] }));
}

function normalizeBahanData() {
    bahanBaku = (bahanBaku || []).map(b => ({
        ...b,
        komposisi: Array.isArray(b.komposisi) ? b.komposisi : [],
        komposisiYield: b.komposisiYield != null ? b.komposisiYield : null
    }));
}

function autoCreateEspressoFormula() {
    // If there is a bahan named 'Espresso' and it has no komposisi, try to auto-create from Biji Kopi + Air
    const espresso = bahanBaku.find(b => /espresso/i.test(b.nama || ''));
    if (!espresso) return;
    if (isBahanCompound(espresso) && espresso.komposisi.length > 0) return;

    const coffee = bahanBaku.find(b => /biji kopi|kopi/i.test(b.nama || '') && (b.satuan === 'gram' || b.satuan === 'pcs'));
    const water = bahanBaku.find(b => /air/i.test(b.nama || '') && (b.satuan === 'ml' || b.satuan === 'gram'));
    if (!coffee || !water) return;

    const defaultDose = defaultEspressoDose(); // grams
    const defaultWater = defaultEspressoWater(); // ml
    // Use yield ~= defaultWater
    espresso.komposisi = [
        { bahanId: coffee.id, jumlah: defaultDose },
        { bahanId: water.id, jumlah: defaultWater }
    ];
    espresso.komposisiYield = defaultWater;
}

// Save to localStorage
function saveData() {
    localStorage.setItem('hpp_calculator_v2', JSON.stringify({ bahanBaku, produkList }));
}

// Format Rupiah
function formatRupiah(amount, fractionDigits) {
    if (amount == null || Number.isNaN(Number(amount))) return 'Rp 0';
    const value = Number(amount);
    const isNearlyInteger = Math.abs(value - Math.round(value)) < 0.005;
    const digits = typeof fractionDigits === 'number' ? fractionDigits : (isNearlyInteger ? 0 : 2);
    return `Rp ${value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Hitung harga per unit
// Hitung harga per base unit (harga per netto/package_qty)
function hitungHargaPerUnit(bahan) {
    return calculateBahanUnitCost(bahan, new Set());
}

// Hitung cost untuk jumlah tertentu (memperhitungkan waste_pct)
function hitungIngredientCost(bahan, jumlah, visited = new Set()) {
    // bahan: bahan object
    // jumlah: requested quantity in bahan.satuan. If jumlah > 0 -> cost = unitCost * jumlah
    // If jumlah === 0 -> interpret as "include per-unit fixed cost" (use 1 unit)
    // This supports items like gelas, stiker, es batu where product may set 0 to mean "no quantity but still charge per-item"
    if (!bahan) return 0;
    const hargaPerUnit = calculateBahanUnitCost(bahan, new Set(visited));
    const waste = Number(bahan.waste_pct || 0) / 100;

    // If jumlah is not a finite number, treat as 0
    const qty = Number.isFinite(Number(jumlah)) ? Number(jumlah) : 0;

    // If qty is exactly 0, charge one unit (per-unit fixed charge)
    const effectiveQty = qty === 0 ? 1 : qty;

    return hargaPerUnit * effectiveQty * (1 + waste);
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
        const compound = isBahanCompound(bahan);
        const hargaPerUnit = hitungHargaPerUnit(bahan);
        const batchCost = hitungKomposisiBatchCost(bahan);
        const nettoValue = compound && Number(bahan.komposisiYield) > 0 ? Number(bahan.komposisiYield) : Number(bahan.netto || 0);
        const isNearlyIntegerNetto = Math.abs(nettoValue - Math.round(nettoValue)) < 0.005;
        const nettoFormatted = nettoValue > 0
            ? (isNearlyIntegerNetto ? nettoValue.toLocaleString('id-ID') : formatNumber(nettoValue, 2))
            : '-';
        const nettoText = nettoValue > 0 ? `${nettoFormatted} ${bahan.satuan}` : '-';
        const hargaBeliText = compound && batchCost != null ? `${formatRupiah(batchCost, 2)}
            <div class="text-[11px] text-amber-700/80 font-semibold">Auto dari formula (${nettoText})</div>` : formatRupiah(bahan.harga);
        const namaCell = compound ? `${bahan.nama}<span class="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-semibold text-amber-700">Formula</span>` : bahan.nama;
        const unitText = formatRupiah(hargaPerUnit, 2);
        return `
            <tr class="hover:bg-matcha/5 transition-colors duration-150">
                <td class="px-6 py-4 font-semibold text-charcoal">${namaCell}</td>
                <td class="px-6 py-4 text-right text-charcoal/70">${nettoText}</td>
                <td class="px-6 py-4 text-right font-semibold text-charcoal">${hargaBeliText}</td>
                <td class="px-6 py-4 text-right font-bold text-matcha">${unitText}</td>
                <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="openKomposisiModal(${bahan.id})" class="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Atur formula bahan">⚗️</button>
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

function openKomposisiModal(id) {
    const bahan = getBahanById(id);
    if (!bahan) {
        showToast('Bahan tidak ditemukan', 'error');
        return;
    }

    const fid = document.getElementById('komposisi-bahan-id');
    const title = document.getElementById('komposisi-bahan-title');
    const outputInput = document.getElementById('komposisi-yield');
    const container = document.getElementById('komposisi-items');
    const satuanLabel = document.getElementById('komposisi-satuan-label');
    if (!fid || !outputInput || !container) return;

    fid.value = id;
    if (title) title.textContent = `Formula · ${bahan.nama}`;
    if (satuanLabel) satuanLabel.textContent = bahan.satuan ? `(dalam ${bahan.satuan})` : '';
    outputInput.value = bahan.komposisiYield != null ? bahan.komposisiYield : '';
    container.innerHTML = '';

    if (isBahanCompound(bahan)) {
        bahan.komposisi.forEach(item => addKomposisiRow(item));
    }
    if (container.children.length === 0) addKomposisiRow();

    updateKomposisiSummary();
    openModal('modal-bahan-komposisi');
}

function addKomposisiRow(item = {}) {
    const container = document.getElementById('komposisi-items');
    const bahanId = Number(document.getElementById('komposisi-bahan-id')?.value);
    if (!container || !bahanId) return;

    const row = document.createElement('div');
    row.className = 'komposisi-row flex flex-col md:flex-row md:items-end gap-3 border border-gray-200 rounded-xl bg-gray-50/60 p-3';
    row.innerHTML = `
        <div class="flex-1">
            <label class="block text-xs font-bold text-charcoal/70 mb-1">Bahan penyusun</label>
            <select class="komposisi-bahan-select w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-matcha focus:ring-2 focus:ring-matcha/20 outline-none bg-white"></select>
        </div>
        <div class="md:w-36">
            <label class="block text-xs font-bold text-charcoal/70 mb-1">Jumlah</label>
            <input type="number" min="0" step="0.01" class="komposisi-jumlah-input w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-matcha focus:ring-2 focus:ring-matcha/20 outline-none" placeholder="0" />
        </div>
        <button type="button" data-remove-row class="self-end md:self-center px-3 py-2 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 transition">Hapus</button>
    `;

    container.appendChild(row);

    const select = row.querySelector('.komposisi-bahan-select');
    const jumlahInput = row.querySelector('.komposisi-jumlah-input');
    const removeBtn = row.querySelector('[data-remove-row]');

    populateKomposisiSelect(select, item?.bahanId, bahanId);
    if (jumlahInput && item?.jumlah != null) jumlahInput.value = item.jumlah;

    select?.addEventListener('change', updateKomposisiSummary);
    jumlahInput?.addEventListener('input', updateKomposisiSummary);
    removeBtn?.addEventListener('click', () => {
        row.remove();
        if (container.children.length === 0) addKomposisiRow();
        updateKomposisiSummary();
    });

    updateKomposisiSummary();
}

function populateKomposisiSelect(select, selectedId, excludeId) {
    if (!select) return;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pilih bahan penyusun';
    placeholder.disabled = true;
    placeholder.selected = !selectedId;
    select.appendChild(placeholder);

    bahanBaku
        .filter(b => b.id !== excludeId)
        .forEach(b => {
            const option = document.createElement('option');
            option.value = b.id;
            const unitCostLabel = formatRupiah(hitungHargaPerUnit(b), 2);
            option.textContent = `${b.nama} • ${unitCostLabel}/${b.satuan}`;
            if (selectedId && Number(selectedId) === b.id) option.selected = true;
            select.appendChild(option);
        });
}

function updateKomposisiSummary() {
    const summary = document.getElementById('komposisi-summary');
    const bahanId = Number(document.getElementById('komposisi-bahan-id')?.value);
    const outputInput = document.getElementById('komposisi-yield');
    if (!summary || !bahanId || !outputInput) return;

    const bahan = getBahanById(bahanId);
    if (!bahan) return;

    const rows = Array.from(document.querySelectorAll('#komposisi-items .komposisi-row'));
    const baseVisited = new Set([bahanId]);
    let totalCost = 0;

    rows.forEach(row => {
        const select = row.querySelector('select');
        const input = row.querySelector('input');
        const childId = Number(select?.value);
        const qty = parseFloat(input?.value || '0');
        if (!childId || !(qty > 0)) return;
        const child = getBahanById(childId);
        if (!child) return;
        totalCost += hitungIngredientCost(child, qty, baseVisited);
    });

    const outputQty = parseFloat(outputInput.value || '0');
    if (!(totalCost > 0) || !(outputQty > 0)) {
        summary.innerHTML = '<p class="text-sm text-charcoal/60">Tambahkan komponen dan output formula untuk melihat ringkasan biaya.</p>';
        return;
    }

    const unitCost = totalCost / outputQty;
    const outputLabel = Math.abs(outputQty - Math.round(outputQty)) < 0.005
        ? outputQty.toLocaleString('id-ID')
        : formatNumber(outputQty, 2);
    summary.innerHTML = `
        <div class="rounded-xl border border-matcha/40 bg-matcha/10 px-4 py-3 text-sm text-charcoal/80">
            <div class="font-semibold text-charcoal mb-1">Ringkasan Formula</div>
            <div>Total biaya batch: <span class="font-bold">${formatRupiah(totalCost, 2)}</span></div>
            <div>Output bersih: <span class="font-bold">${outputLabel} ${bahan.satuan}</span></div>
            <div>Biaya per ${bahan.satuan}: <span class="font-bold text-matcha">${formatRupiah(unitCost, 2)}</span></div>
        </div>
    `;
}

function submitKomposisiForm(e) {
    e.preventDefault();
    const bahanId = Number(document.getElementById('komposisi-bahan-id')?.value);
    const outputQty = parseFloat(document.getElementById('komposisi-yield')?.value || '0');
    const container = document.getElementById('komposisi-items');
    if (!bahanId || !container) {
        showToast('Bahan tidak ditemukan', 'error');
        return;
    }

    const items = [];
    Array.from(container.querySelectorAll('.komposisi-row')).forEach(row => {
        const select = row.querySelector('select');
        const input = row.querySelector('input');
        const childId = Number(select?.value);
        const qty = parseFloat(input?.value || '0');
        if (!childId || !(qty > 0)) return;
        items.push({ bahanId: childId, jumlah: qty });
    });

    if (items.length === 0) {
        showToast('Tambahkan minimal satu bahan penyusun', 'error');
        return;
    }
    if (!(outputQty > 0)) {
        showToast('Output bersih formula wajib diisi', 'error');
        return;
    }

    const bahan = getBahanById(bahanId);
    if (!bahan) {
        showToast('Bahan tidak ditemukan', 'error');
        return;
    }

    bahan.komposisi = items;
    bahan.komposisiYield = outputQty;

    saveData();
    renderBahanBaku();
    renderAllProduk();
    closeModal('modal-bahan-komposisi');
    showToast('Formula bahan tersimpan', 'success');
}

function clearKomposisiBahan() {
    const bahanId = Number(document.getElementById('komposisi-bahan-id')?.value);
    const bahan = getBahanById(bahanId);
    if (!bahan) {
        closeModal('modal-bahan-komposisi');
        return;
    }
    if (!isBahanCompound(bahan)) {
        showToast('Belum ada formula untuk dihapus', 'info');
        return;
    }
    if (!confirm('Hapus formula bahan ini?')) return;
    bahan.komposisi = [];
    bahan.komposisiYield = null;
    saveData();
    renderBahanBaku();
    renderAllProduk();
    const container = document.getElementById('komposisi-items');
    const outputInput = document.getElementById('komposisi-yield');
    if (container) {
        container.innerHTML = '';
        addKomposisiRow();
    }
    if (outputInput) outputInput.value = '';
    updateKomposisiSummary();
    showToast('Formula bahan dihapus', 'success');
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
    const espressoBlock = produk.espressoProfile ? renderEspressoSummary(produk) : '';

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
                    <button onclick="openEspressoModal(${produk.id})" class="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5" title="Atur dosis kopi & air untuk shot espresso">
                        <span>⚙️</span>
                        <span>Espresso Builder</span>
                    </button>
                    <button onclick="duplikatProduk(${produk.id})" class="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5" title="Duplikat">
                        <span>📄</span>
                        <span>Duplikat</span>
                    </button>
                    <button onclick="resetProdukResep(${produk.id})" class="bg-gradient-to-r from-gray-400 to-gray-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 transition-all flex items-center gap-1.5" title="Reset Resep">
                        <span>🔁</span>
                        <span>Reset Resep</span>
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
                ${espressoBlock}
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
                                
                                const hargaPerUnit = hitungHargaPerUnit(bahan);
                                const hpp = hitungIngredientCost(bahan, item.jumlah);
                                
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

function renderEspressoSummary(produk) {
    const metrics = calculateEspressoMetrics(produk.espressoProfile);
    if (!metrics) return '';
    const ratioLabel = metrics.ratio ? `1 : ${formatNumber(metrics.ratio, 2)}` : '-';
    const shotsInfo = metrics.shotsPerBag ? `<span class="inline-flex items-center gap-1 rounded-full bg-matcha/15 px-3 py-1 text-xs font-semibold text-matcha">${metrics.shotsPerBag} shot / ${metrics.coffee.netto} ${metrics.coffee.satuan}</span>` : '';
    return `
        <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-charcoal/80">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div class="text-xs font-semibold text-amber-600">Profil Espresso</div>
                    <div class="font-semibold text-charcoal mt-1">Dose ${formatNumber(metrics.dose, 1)} g • Brew ratio ${ratioLabel}</div>
                    <div class="text-xs text-charcoal/60">Air digunakan: ${formatNumber(metrics.waterMl, 0)} ml • Yield: ${metrics.yieldMl ? `${formatNumber(metrics.yieldMl, 0)} ml` : '-'}</div>
                    <div class="text-xs text-charcoal/60">Biaya kopi: ${formatRupiah(metrics.coffeeCost)} • Biaya air: ${formatRupiah(metrics.waterCost)}</div>
                </div>
                <div class="text-right">
                    ${shotsInfo}
                    <div class="text-xs text-charcoal/60 mt-1">Total biaya shot</div>
                    <div class="text-lg font-extrabold text-amber-700">${formatRupiah(metrics.totalCost)}</div>
                    <button onclick="clearEspressoProfile(${produk.id})" class="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition">Reset</button>
                </div>
            </div>
        </div>
    `;
}

function hitungTotalHPP(resep) {
    return resep.reduce((total, item) => {
        const bahan = bahanBaku.find(b => b.id === item.bahanId);
        if (!bahan) return total;
        return total + hitungIngredientCost(bahan, item.jumlah);
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

function defaultEspressoDose() {
    return 18;
}

function defaultEspressoWater() {
    return 36;
}

function findDefaultWaterBahanId() {
    const waterCandidate = bahanBaku.find(b => /air/i.test(b.nama || '') && (b.satuan === 'ml' || b.satuan === 'gram'));
    return waterCandidate ? waterCandidate.id : null;
}

function populateEspressoSelect(select, items, selectedId, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    const optionPlaceholder = document.createElement('option');
    optionPlaceholder.value = '';
    optionPlaceholder.disabled = true;
    optionPlaceholder.selected = !selectedId;
    optionPlaceholder.textContent = placeholder;
    select.appendChild(optionPlaceholder);
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        const hargaPerUnit = hitungHargaPerUnit(item);
        opt.textContent = `${item.nama} • ${item.satuan} • ${formatRupiah(hargaPerUnit)}/unit`;
        if (selectedId && item.id === selectedId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
    if (selectedId) {
        select.value = selectedId;
    }
}

function openEspressoModal(produkId) {
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) {
        showToast('Produk tidak ditemukan', 'error');
        return;
    }

    const profile = produk.espressoProfile || {};
    const fidProduk = document.getElementById('espresso-produk-id');
    const coffeeSelect = document.getElementById('espresso-coffee');
    const waterSelect = document.getElementById('espresso-water');
    const doseInput = document.getElementById('espresso-dose');
    const waterInput = document.getElementById('espresso-water-ml');
    const yieldInput = document.getElementById('espresso-yield-ml');

    if (!fidProduk || !coffeeSelect || !waterSelect || !doseInput || !waterInput || !yieldInput) return;

    fidProduk.value = produkId;

    const coffeeOptions = bahanBaku.filter(b => b.satuan === 'gram');
    populateEspressoSelect(coffeeSelect, coffeeOptions, profile.coffeeBahanId, 'Pilih bahan kopi (gram)');

    const waterOptions = bahanBaku.filter(b => b.satuan === 'ml' || b.satuan === 'gram');
    const selectedWaterId = profile.waterBahanId || findDefaultWaterBahanId();
    populateEspressoSelect(waterSelect, waterOptions, selectedWaterId, 'Pilih bahan air');

    doseInput.value = profile.doseGram != null ? profile.doseGram : defaultEspressoDose();
    waterInput.value = profile.waterMl != null ? profile.waterMl : defaultEspressoWater();
    yieldInput.value = profile.yieldMl != null ? profile.yieldMl : (profile.waterMl != null ? profile.waterMl : defaultEspressoWater());

    openModal('modal-espresso');
    updateEspressoRatioDisplay();
    updateEspressoModalSummary();
}

function submitEspressoForm(event) {
    event.preventDefault();

    const produkId = Number(document.getElementById('espresso-produk-id')?.value);
    const coffeeId = Number(document.getElementById('espresso-coffee')?.value);
    const waterId = Number(document.getElementById('espresso-water')?.value);
    const dose = parseFloat(document.getElementById('espresso-dose')?.value || '0');
    const waterMl = parseFloat(document.getElementById('espresso-water-ml')?.value || '0');
    const yieldMlRaw = parseFloat(document.getElementById('espresso-yield-ml')?.value || '0');

    const produk = produkList.find(p => p.id === produkId);
    if (!produk) {
        showToast('Produk tidak ditemukan', 'error');
        return;
    }
    if (!coffeeId) {
        showToast('Pilih bahan kopi', 'error');
        return;
    }
    if (!waterId) {
        showToast('Pilih bahan air', 'error');
        return;
    }
    if (!(dose > 0)) {
        showToast('Isi dosis kopi (gram) yang valid', 'error');
        return;
    }
    if (!(waterMl > 0)) {
        showToast('Isi penggunaan air (ml) yang valid', 'error');
        return;
    }

    const yieldMl = yieldMlRaw > 0 ? yieldMlRaw : waterMl;
    const brewRatio = dose > 0 ? (waterMl / dose) : null;

    produk.espressoProfile = {
        coffeeBahanId: coffeeId,
        waterBahanId: waterId,
        doseGram: dose,
        waterMl,
        yieldMl,
        brewRatio
    };

    upsertResepBahan(produk, coffeeId, dose, { source: 'espresso' });
    upsertResepBahan(produk, waterId, waterMl, { source: 'espresso' });

    saveData();
    renderAllProduk();
    closeModal('modal-espresso');
    showToast('Profil espresso tersimpan', 'success');
}

function clearEspressoProfile(produkId) {
    const produk = produkList.find(p => p.id === produkId);
    if (!produk || !produk.espressoProfile) {
        return;
    }
    if (!confirm('Hapus pengaturan espresso untuk produk ini?')) return;
    // Remove espresso profile and any recipe items created by the espresso builder
    const profile = produk.espressoProfile;
    const coffeeId = profile.coffeeBahanId;
    const waterId = profile.waterBahanId;

    produk.resep = produk.resep.filter(item => {
        // remove items explicitly marked as espresso source
        if (item.meta && item.meta.source === 'espresso') return false;
        // if meta not present, remove items whose bahanId matches and jumlah equals the profile's values
        if (!item.meta && ((item.bahanId === coffeeId && Number(item.jumlah) === Number(profile.doseGram)) || (item.bahanId === waterId && Number(item.jumlah) === Number(profile.waterMl)))) return false;
        return true;
    });

    delete produk.espressoProfile;
    saveData();
    renderAllProduk();
    showToast('Profil espresso dan resep terkait dihapus', 'success');
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

function resetProdukResep(produkId) {
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) return;
    if (!confirm('Reset semua bahan pada produk ini? Ini akan menghapus seluruh resep dan profil espresso terkait.')) return;
    produk.resep = [];
    if (produk.espressoProfile) delete produk.espressoProfile;
    saveData();
    renderAllProduk();
    showToast('Resep produk direset', 'success');
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
    csv += 'Bahan,Netto,Satuan,Harga Beli,Harga per Unit,Density (g/ml),Waste (%)\n';
    bahanBaku.forEach(b => {
        const hargaPerUnit = hitungHargaPerUnit(b);
        const batchCost = hitungKomposisiBatchCost(b);
        const nettoValue = batchCost != null && Number(b.komposisiYield) > 0 ? Number(b.komposisiYield) : b.netto;
        const hargaBeli = batchCost != null ? batchCost : b.harga;
        csv += `${b.nama},${nettoValue},${b.satuan},${hargaBeli},${hargaPerUnit},${b.density != null ? b.density : ''},${b.waste_pct != null ? b.waste_pct : ''}\n`;
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
                const hargaPerUnit = hitungHargaPerUnit(bahan);
                const itemHpp = hitungIngredientCost(bahan, item.jumlah);
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

    const espressoForm = document.getElementById('espresso-form');
    if (espressoForm) espressoForm.addEventListener('submit', submitEspressoForm);
    ['espresso-dose', 'espresso-water-ml', 'espresso-yield-ml'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', () => {
            updateEspressoRatioDisplay();
            updateEspressoModalSummary();
        });
    });
    ['espresso-coffee', 'espresso-water'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.addEventListener('change', updateEspressoModalSummary);
    });
    const espressoClear = document.getElementById('espresso-clear');
    if (espressoClear) {
        espressoClear.addEventListener('click', () => {
            const produkId = Number(document.getElementById('espresso-produk-id')?.value);
            if (produkId) clearEspressoProfile(produkId);
        });
    }

    const komposisiForm = document.getElementById('form-komposisi');
    if (komposisiForm) komposisiForm.addEventListener('submit', submitKomposisiForm);
    const komposisiAdd = document.getElementById('komposisi-add-row');
    if (komposisiAdd) komposisiAdd.addEventListener('click', () => addKomposisiRow());
    const komposisiClear = document.getElementById('komposisi-clear');
    if (komposisiClear) komposisiClear.addEventListener('click', clearKomposisiBahan);
    const komposisiYield = document.getElementById('komposisi-yield');
    if (komposisiYield) komposisiYield.addEventListener('input', updateKomposisiSummary);
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
    ['modal-bahan', 'modal-produk', 'modal-resep', 'modal-espresso', 'modal-bahan-komposisi'].forEach(closeModal);
}

function attachCurrencyMask(input) {
    input.addEventListener('input', () => {
        const val = parseCurrency(input.value);
        if (typeof val === 'number' && !Number.isNaN(val)) {
            // show up to 2 decimals when needed
            const hasDecimal = Math.abs(val - Math.round(val)) >= 0.005;
            input.value = val.toLocaleString('id-ID', { minimumFractionDigits: hasDecimal ? 2 : 0, maximumFractionDigits: 2 });
        } else {
            input.value = '';
        }
    });
}
function parseCurrency(text) {
    const raw = (text || '').toString().trim();
    if (!raw) return 0;

    // Remove currency symbol and spaces
    let s = raw.replace(/Rp|rp|\s/g, '');

    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;

    // Cases:
    // 1) both comma and dot present -> determine which is decimal by position
    if (hasComma && hasDot) {
        if (s.indexOf(',') < s.indexOf('.')) {
            // format like 1,234.56 -> comma thousands, dot decimal
            s = s.replace(/,/g, '');
            return parseFloat(s) || 0;
        } else {
            // format like 1.234,56 -> dot thousands, comma decimal
            s = s.replace(/\./g, '');
            s = s.replace(/,/g, '.');
            return parseFloat(s) || 0;
        }
    }

    // 2) only comma present -> assume comma is decimal separator
    if (hasComma && !hasDot) {
        s = s.replace(/,/g, '.');
        return parseFloat(s) || 0;
    }

    // 3) only dot present -> assume dot is decimal separator (or thousands if integers)
    if (hasDot && !hasComma) {
        // if more than 3 digits after dot, it's probably thousands separators -> remove dots
        const afterDot = s.split('.')[1] || '';
        if (afterDot.length > 2) {
            s = s.replace(/\./g, '');
            return parseFloat(s) || 0;
        }
        return parseFloat(s) || 0;
    }

    // default: only digits
    const onlyDigits = s.replace(/[^\d]/g, '');
    return onlyDigits ? parseFloat(onlyDigits) : 0;
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
    const density = document.getElementById('bahan-density');
    const waste = document.getElementById('bahan-waste');
    if (!title || !fid || !nama || !netto || !satuan || !harga) return;

    if (id) {
        const b = bahanBaku.find(x => x.id === id);
        if (!b) return;
        title.textContent = 'Edit Bahan';
        fid.value = b.id;
        nama.value = b.nama;
        netto.value = b.netto;
        satuan.value = b.satuan;
        const hargaVal = b.harga != null ? Number(b.harga) : 0;
        const hargaFormatted = Math.abs(hargaVal - Math.round(hargaVal)) < 0.005
            ? hargaVal.toLocaleString('id-ID')
            : hargaVal.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        harga.value = hargaFormatted;
        if (density) density.value = b.density != null ? b.density : '';
        if (waste) waste.value = b.waste_pct != null ? b.waste_pct : '';
    } else {
        title.textContent = 'Tambah Bahan';
        fid.value = '';
        nama.value = '';
        netto.value = '';
        satuan.value = 'ml';
        harga.value = '';
        if (density) density.value = '';
        if (waste) waste.value = '';
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
    const densityEl = document.getElementById('bahan-density');
    const wasteEl = document.getElementById('bahan-waste');
    const density = densityEl ? (densityEl.value === '' ? null : parseFloat(densityEl.value)) : null;
    const waste_pct = wasteEl ? (wasteEl.value === '' ? null : parseFloat(wasteEl.value)) : null;
    if (!nama || !satuan || isNaN(netto) || netto <= 0 || isNaN(harga) || harga < 0) {
        showToast('Mohon lengkapi data bahan dengan benar', 'error');
        return;
    }
    if (fid) {
        const idx = bahanBaku.findIndex(b => b.id === Number(fid));
        if (idx !== -1) bahanBaku[idx] = { ...bahanBaku[idx], nama, netto, satuan, harga, density, waste_pct };
        showToast('Bahan diperbarui', 'success');
    } else {
        bahanBaku.push({ id: Date.now(), nama, netto, satuan, harga, density, waste_pct, komposisi: [], komposisiYield: null });
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
                // try to read optional density and waste columns if present
                let density = null;
                let waste_pct = null;
                if (cols.length >= 6) {
                    const maybeDensity = parseFloat(cols[4]);
                    const maybeWaste = parseFloat(cols[5]);
                    if (!isNaN(maybeDensity)) density = maybeDensity;
                    if (!isNaN(maybeWaste)) waste_pct = maybeWaste;
                }
                bahanBaku.push({ id: Date.now() + i, nama, netto, harga, satuan, density, waste_pct });
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
