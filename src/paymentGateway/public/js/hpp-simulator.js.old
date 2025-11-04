
// Advanced HPP Simulator JS
// UX: Dual table (Bahan & Resep), auto-calc harga/satuan, subtotal, total HPP, total volume

const satuanOptions = ['gr', 'ml', 'pcs'];

let bahanList = [
  // Contoh data awal
  { nama: 'Susu', harga: 26000, netto: 900, satuan: 'ml' },
  { nama: 'Creamer', harga: 40000, netto: 950, satuan: 'gr' },
  { nama: 'SKM', harga: 25000, netto: 950, satuan: 'gr' },
  { nama: 'Syrup', harga: 150000, netto: 700, satuan: 'ml' },
  { nama: 'Gold Label Cream', harga: 60000, netto: 850, satuan: 'gr' },
  { nama: 'Schweppes', harga: 6000, netto: 240, satuan: 'ml' },
  { nama: 'Gelas', harga: 1000, netto: 1, satuan: 'pcs' },
  { nama: 'Es Batu', harga: 18000, netto: 70000, satuan: 'gr' },
  { nama: 'Air', harga: 25000, netto: 4500, satuan: 'ml' }
];
let resepList = [
  // Contoh data awal
  { bahan: 'Susu', jumlah: 60 },
  { bahan: 'Creamer', jumlah: 10 },
  { bahan: 'SKM', jumlah: 20 },
  { bahan: 'Gold Label Cream', jumlah: 20 },
  { bahan: 'Air', jumlah: 50 },
  { bahan: 'Es Batu', jumlah: 120 },
  { bahan: 'Gelas', jumlah: 1 }
];

// Persistence key
const STORAGE_KEY = 'hpp_simulations_v1';

function uid() {
  return 's' + Date.now();
}

function getSavedSimulations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('failed parse saved sims', e);
    return [];
  }
}

function persistSavedSimulations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveSimulation() {
  const nameInput = document.getElementById('sim-name');
  const name = nameInput?.value?.trim();
  if (!name) return alert('Masukkan nama simulasi sebelum menyimpan');
  if (bahanList.length === 0 && resepList.length === 0) return alert('Tidak ada data untuk disimpan');
  const sims = getSavedSimulations();
  const sim = {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    bahanList,
    resepList
  };
  sims.unshift(sim);
  persistSavedSimulations(sims);
  renderSavedSimulations();
  nameInput.value = '';
}

function deleteSavedSimulation(id) {
  if (!confirm('Hapus simulasi ini?')) return;
  const sims = getSavedSimulations().filter(s => s.id !== id);
  persistSavedSimulations(sims);
  renderSavedSimulations();
}

function loadSimulation(id) {
  const sim = getSavedSimulations().find(s => s.id === id);
  if (!sim) return alert('Simulasi tidak ditemukan');
  bahanList = JSON.parse(JSON.stringify(sim.bahanList || []));
  resepList = JSON.parse(JSON.stringify(sim.resepList || []));
  document.getElementById('sim-name').value = sim.name;
  renderBahanTable();
  renderResepTable();
  updateSummary();
}

function cloneSimulation(id) {
  const sim = getSavedSimulations().find(s => s.id === id);
  if (!sim) return alert('Simulasi tidak ditemukan');
  const clone = {
    id: uid(),
    name: sim.name + ' (copy)',
    createdAt: new Date().toISOString(),
    bahanList: JSON.parse(JSON.stringify(sim.bahanList || [])),
    resepList: JSON.parse(JSON.stringify(sim.resepList || []))
  };
  const sims = getSavedSimulations();
  sims.unshift(clone);
  persistSavedSimulations(sims);
  renderSavedSimulations();
}

function calcTotalHPPFor(sim) {
  const bahan = sim.bahanList || [];
  const resep = sim.resepList || [];
  let total = 0;
  resep.forEach(r => {
    const b = bahan.find(x => x.nama === r.bahan);
    const pricePerUnit = b && b.netto > 0 ? b.harga / b.netto : 0;
    total += (pricePerUnit * r.jumlah);
  });
  return total;
}

function renderSavedSimulations() {
  const container = document.getElementById('saved-simulations');
  if (!container) return;
  const sims = getSavedSimulations();
  container.innerHTML = sims.length === 0 ? '<div class="text-sm text-charcoal/60">Belum ada simulasi tersimpan.</div>' : '';
  sims.forEach(sim => {
    const total = calcTotalHPPFor(sim);
    const date = new Date(sim.createdAt).toLocaleString('id-ID');
    container.innerHTML += `
      <div class="rounded-xl border p-4 bg-white/80 shadow-sm">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-semibold text-charcoal">${sim.name}</div>
            <div class="text-xs text-charcoal/60">${date}</div>
          </div>
          <div class="text-sm text-matcha font-bold">Rp ${formatCurrency(total)}</div>
        </div>
        <div class="mt-3 flex gap-2">
          <button onclick="loadSimulation('${sim.id}')" class="px-3 py-1 bg-matcha text-cream rounded">Load</button>
          <button onclick="cloneSimulation('${sim.id}')" class="px-3 py-1 bg-charcoal text-cream rounded">Clone</button>
          <button onclick="deleteSavedSimulation('${sim.id}')" class="px-3 py-1 bg-red-600 text-cream rounded">Hapus</button>
        </div>
      </div>
    `;
  });
}

function renderBahanTable() {
  const tbody = document.getElementById('hpp-bahan-list');
  tbody.innerHTML = '';
  bahanList.forEach((bahan, i) => {
    const hargaSatuan = bahan.netto > 0 ? bahan.harga / bahan.netto : 0;
    tbody.innerHTML += `
      <tr>
        <td><input type="text" class="w-32 px-2 py-1 border rounded" value="${bahan.nama}" onchange="updateBahan(${i},'nama',this.value)"></td>
        <td><input type="number" class="w-24 px-2 py-1 border rounded" value="${bahan.harga}" min="0" onchange="updateBahan(${i},'harga',this.value)"></td>
        <td><input type="number" class="w-16 px-2 py-1 border rounded" value="${bahan.netto}" min="1" onchange="updateBahan(${i},'netto',this.value)"></td>
        <td><select class="w-16 px-2 py-1 border rounded" onchange="updateBahan(${i},'satuan',this.value)">
          ${satuanOptions.map(opt => `<option value="${opt}"${bahan.satuan===opt?' selected':''}>${opt}</option>`).join('')}
        </select></td>
        <td>Rp ${formatCurrency(hargaSatuan)}</td>
        <td><button onclick="removeBahan(${i})" class="text-red-600 font-bold">×</button></td>
      </tr>
    `;
  });
}

function renderResepTable() {
  const tbody = document.getElementById('hpp-resep-list');
  tbody.innerHTML = '';
  resepList.forEach((row, i) => {
    const bahan = bahanList.find(b => b.nama === row.bahan);
    const hargaSatuan = bahan ? bahan.harga / bahan.netto : 0;
    const subtotal = hargaSatuan * row.jumlah;
    tbody.innerHTML += `
      <tr>
        <td><select class="w-32 px-2 py-1 border rounded" onchange="updateResep(${i},'bahan',this.value)">
          ${bahanList.map(b => `<option value="${b.nama}"${row.bahan===b.nama?' selected':''}>${b.nama}</option>`).join('')}
        </select></td>
        <td><input type="number" class="w-16 px-2 py-1 border rounded" value="${row.jumlah}" min="0" onchange="updateResep(${i},'jumlah',this.value)"></td>
        <td>${bahan ? bahan.satuan : '-'}</td>
        <td>Rp ${formatCurrency(hargaSatuan)}</td>
        <td>Rp ${formatCurrency(subtotal)}</td>
        <td><button onclick="removeResep(${i})" class="text-red-600 font-bold">×</button></td>
      </tr>
    `;
  });
}

function updateBahan(i, field, value) {
  if(field==='harga'||field==='netto') value = parseFloat(value)||0;
  bahanList[i][field] = value;
  renderBahanTable();
  renderResepTable();
  updateSummary();
}
function removeBahan(i) {
  bahanList.splice(i,1);
  renderBahanTable();
  renderResepTable();
  updateSummary();
}
function addBahan() {
  bahanList.push({ nama:'', harga:0, netto:1, satuan:'gr' });
  renderBahanTable();
}

function updateResep(i, field, value) {
  if(field==='jumlah') value = parseFloat(value)||0;
  resepList[i][field] = value;
  renderResepTable();
  updateSummary();
}
function removeResep(i) {
  resepList.splice(i,1);
  renderResepTable();
  updateSummary();
}
function addResep() {
  resepList.push({ bahan: bahanList[0]?.nama || '', jumlah: 0 });
  renderResepTable();
}

function updateSummary() {
  let totalHPP = 0, totalVolume = 0;
  resepList.forEach(row => {
    const bahan = bahanList.find(b => b.nama === row.bahan);
    const hargaSatuan = bahan ? bahan.harga / bahan.netto : 0;
    totalHPP += hargaSatuan * row.jumlah;
    totalVolume += row.jumlah;
  });
  document.getElementById('hpp-total').textContent = 'Rp ' + formatCurrency(totalHPP);
  document.getElementById('hpp-volume').textContent = totalVolume + ' ' + (resepList[0] ? (bahanList.find(b => b.nama === resepList[0].bahan)?.satuan || '') : '');
}

function formatCurrency(num) {
  return (num || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}

function exportHPPSimulation() {
  let detail = 'Simulasi HPP\n\n';
  detail += 'Bahan:\n';
  bahanList.forEach(b => {
    const hargaSatuan = b.netto > 0 ? b.harga / b.netto : 0;
    detail += `${b.nama}\tRp${formatCurrency(b.harga)}\t${b.netto}\t${b.satuan}\tRp${formatCurrency(hargaSatuan)}\n`;
  });
  detail += '\nResep:\n';
  resepList.forEach(r => {
    const bahan = bahanList.find(b => b.nama === r.bahan);
    const hargaSatuan = bahan ? bahan.harga / bahan.netto : 0;
    const subtotal = hargaSatuan * r.jumlah;
    detail += `${r.bahan}\t${r.jumlah}\t${bahan ? bahan.satuan : '-'}\tRp${formatCurrency(hargaSatuan)}\tRp${formatCurrency(subtotal)}\n`;
  });
  detail += `\nTotal HPP: Rp${formatCurrency(resepList.reduce((sum, r) => {
    const bahan = bahanList.find(b => b.nama === r.bahan);
    const hargaSatuan = bahan ? bahan.harga / bahan.netto : 0;
    return sum + hargaSatuan * r.jumlah;
  },0))}`;
  const blob = new Blob([detail], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'simulasi-hpp.txt';
  a.click();
}

function resetAll() {
  bahanList = [];
  resepList = [];
  renderBahanTable();
  renderResepTable();
  updateSummary();
}

function setupHPPUI() {
  renderBahanTable();
  renderResepTable();
  updateSummary();
  document.getElementById('add-bahan-btn').onclick = addBahan;
  document.getElementById('add-resep-btn').onclick = addResep;
  document.getElementById('hpp-export-btn').onclick = exportHPPSimulation;
  document.getElementById('hpp-reset-btn').onclick = resetAll;
  // Saved simulations bindings
  const saveBtn = document.getElementById('save-sim-btn');
  if (saveBtn) saveBtn.onclick = saveSimulation;
  renderSavedSimulations();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupHPPUI);
} else {
  setupHPPUI();
}
