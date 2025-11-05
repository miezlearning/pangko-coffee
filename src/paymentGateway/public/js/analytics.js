// Analytics page logic

let ordersChart, revenueChart;
let leaderboardTimer;
let currentLeaderboardMethod = 'all';
let currentLeaderboardScope = 'month';

const leaderboardData = new Map();

const leaderboardScopes = [
  {
    scope: 'today',
    label: 'Hari Ini',
    detailTitle: 'Top 5 Menu Hari Ini',
    description: 'Gunakan rekomendasi ini untuk upsell cepat selama shift berjalan.'
  },
  {
    scope: 'week',
    label: 'Minggu Ini',
    detailTitle: 'Top 5 Menu Mingguan',
    description: 'Pantau pola favorit pelanggan dalam 7 hari terakhir dan sesuaikan stoknya.'
  },
  {
    scope: 'month',
    label: 'Bulan Ini',
    detailTitle: 'Top 5 Menu Bulan Ini',
    description: 'Evaluasi performa menu untuk laporan manajemen dan promo akhir bulan.'
  },
  {
    scope: 'year',
    label: 'Tahun Ini',
    detailTitle: 'Top 5 Menu Tahunan',
    description: 'Identifikasi juara sepanjang tahun untuk campaign signature menu.'
  }
];

function parseDateInput(id){
  const el = document.getElementById(id);
  return el && el.value ? new Date(el.value) : null;
}

async function loadSummary(scope, method){
  const params = new URLSearchParams({ scope, method });
  const res = await fetch(`/api/stats/method-breakdown?${params.toString()}`);
  const data = await res.json();
  const wrap = document.getElementById('method-summary');
  if (!wrap) return;
  if (!data.success){ wrap.innerHTML = '<p class="text-sm text-rose-700">Gagal memuat ringkasan</p>'; return; }
  const items = Object.entries(data.summary || {}).map(([m,v])=>{
    return `<div class="rounded-xl border border-charcoal/10 bg-white p-4">
      <div class="text-sm font-semibold">${m}</div>
      <div class="mt-2 text-xs text-charcoal/60">Jumlah Order</div>
      <div class="text-2xl font-bold">${v.count}</div>
      <div class="mt-2 text-xs text-charcoal/60">Total</div>
      <div class="text-xl font-bold">Rp ${formatNumber(v.sum||0)}</div>
    </div>`;
  }).join('');
  wrap.innerHTML = items || '<p class="text-sm text-charcoal/60">Tidak ada data</p>';
}

async function loadSeries(range, method, from, to){
  const params = new URLSearchParams({ range, method });
  if (from) params.set('from', from.toISOString());
  if (to) params.set('to', to.toISOString());
  const res = await fetch(`/api/stats/timeseries?${params.toString()}`);
  const data = await res.json();
  if (!data.success) return;
  const labels = data.series.map(p => p.label);
  const orders = data.series.map(p => p.orders);
  const revenue = data.series.map(p => p.revenue);

  // Orders chart
  const oc = document.getElementById('ordersChart');
  if (oc){
    if (ordersChart) ordersChart.destroy();
    ordersChart = new Chart(oc.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Orders', data: orders, backgroundColor: '#74A66288' }] },
      options: { responsive: true, scales: { y: { beginAtZero: true, precision: 0 } } }
    });
  }

  // Revenue chart
  const rc = document.getElementById('revenueChart');
  if (rc){
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(rc.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'Revenue (Rp)', data: revenue, borderColor: '#333', backgroundColor: '#33333322', tension: 0.25 }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: (ctx)=> `Rp ${formatNumber(ctx.parsed.y||0)}` } } } }
    });
  }
}

function formatNumber(num){ return (num||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function getScopeMeta(scope){
  return leaderboardScopes.find(meta => meta.scope === scope) || leaderboardScopes[0];
}

function setActiveLeaderboardCard(scope, active){
  const card = document.querySelector(`[data-leaderboard-card][data-scope="${scope}"]`);
  if (!card) return;
  card.classList.toggle('ring-2', active);
  card.classList.toggle('ring-matcha/70', active);
  card.classList.toggle('ring-offset-2', active);
}

function renderLeaderboardHighlights(){
  leaderboardScopes.forEach(meta => {
    const items = leaderboardData.get(meta.scope) || [];
    const top = items[0];
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const totalRevenue = items.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
    const share = top && totalQty > 0 ? Math.round((Number(top.qty || 0) / totalQty) * 100) : 0;

    const nameEl = document.getElementById(`leaderboard-card-${meta.scope}-name`);
    const qtyEl = document.getElementById(`leaderboard-card-${meta.scope}-qty`);
    const revenueEl = document.getElementById(`leaderboard-card-${meta.scope}-revenue`);
    const shareEl = document.getElementById(`leaderboard-card-${meta.scope}-share`);
    const progressEl = document.getElementById(`leaderboard-card-${meta.scope}-progress`);

    if (!nameEl || !qtyEl || !revenueEl || !shareEl || !progressEl) return;

    if (!top){
      nameEl.textContent = '-';
      qtyEl.textContent = '0';
      revenueEl.textContent = '0';
      shareEl.textContent = '0% kontribusi';
      progressEl.style.width = '0%';
    } else {
      nameEl.textContent = top.name || 'Item Tanpa Nama';
      qtyEl.textContent = formatNumber(Number(top.qty || 0));
      revenueEl.textContent = formatNumber(Math.round(Number(top.revenue || 0)));
      shareEl.textContent = `${share}% kontribusi`; 
      const width = share > 0 ? `${Math.min(100, Math.max(10, share))}%` : '0%';
      progressEl.style.width = width;
      progressEl.style.backgroundColor = meta.scope === 'week' ? '#FFE5B4' : meta.scope === 'month' ? '#333333' : meta.scope === 'year' ? '#555555' : '#74A662';
    }

    const card = document.querySelector(`[data-leaderboard-card][data-scope="${meta.scope}"]`);
    if (card){
      card.setAttribute('aria-label', top ? `Top ${meta.label}: ${top.name} terjual ${formatNumber(Number(top.qty||0))}` : `Top ${meta.label}: belum ada data`);
    }

    setActiveLeaderboardCard(meta.scope, meta.scope === currentLeaderboardScope);
  });
}

function updateLeaderboardInsights(items, meta){
  const insightEl = document.getElementById('leaderboard-insights');
  if (!insightEl) return;
  if (!items.length){
    insightEl.innerHTML = '<li>Menunggu data untuk menghitung rekomendasi.</li>';
    return;
  }

  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalRevenue = items.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const top = items[0];
  const runner = items[1];

  const insights = [];
  const shareQty = totalQty ? Math.round((Number(top.qty || 0) / totalQty) * 100) : 0;
  const shareRevenue = totalRevenue ? Math.round((Number(top.revenue || 0) / totalRevenue) * 100) : shareQty;

  insights.push(`Fokus bahan & stok <strong>${top.name}</strong>, kontribusi ${shareQty}% volume ${meta.label.toLowerCase()} (${shareRevenue}% revenue).`);

  if (runner){
    insights.push(`Coba bundling <strong>${top.name}</strong> + <strong>${runner.name}</strong> untuk upsell kasir saat pelanggan ragu memilih.`);
  }

  if (items.length >= 3){
    const third = items[2];
    const topThreeQty = Number(top.qty || 0) + Number(runner?.qty || 0) + Number(third?.qty || 0);
    const topThreeShare = totalQty ? Math.round((topThreeQty / totalQty) * 100) : 0;
    insights.push(`Tiga besar menyumbang ${topThreeShare}% penjualan. Evaluasi menu di luar tiga besar untuk kampanye cross-sell.`);
  } else {
    insights.push('Tambahkan promo baru untuk memperluas variasi menu favorit pelanggan.');
  }

  insightEl.innerHTML = insights.map(text => `<li>${text}</li>`).join('');
}

function renderLeaderboardDetail(){
  const meta = getScopeMeta(currentLeaderboardScope);
  const items = leaderboardData.get(currentLeaderboardScope) || [];
  const labelEl = document.getElementById('leaderboard-detail-label');
  const titleEl = document.getElementById('leaderboard-detail-title');
  const descEl = document.getElementById('leaderboard-detail-description');
  const listEl = document.getElementById('leaderboard-detail-list');

  if (labelEl) labelEl.textContent = `Fokus: ${meta.label}`;
  if (titleEl) titleEl.textContent = meta.detailTitle;
  if (descEl) descEl.textContent = meta.description;

  if (!listEl) return;

  if (!items.length){
    listEl.innerHTML = '<li class="rounded-2xl border border-charcoal/8 bg-white px-4 py-4 text-sm text-charcoal/60">Data leaderboard akan tampil otomatis.</li>';
    updateLeaderboardInsights([], meta);
    return;
  }

  const maxQty = Math.max(...items.map(item => Number(item.qty || 0)), 0) || 1;

  listEl.innerHTML = items.map((item, index) => {
    const rank = index + 1;
    const qty = Number(item.qty || 0);
    const qtyPercent = Math.round((qty / maxQty) * 100);
    const revenue = Number(item.revenue || 0);
    const badge = rank === 1 ? 'bg-matcha text-white' : rank === 2 ? 'bg-peach text-charcoal' : 'bg-charcoal/10 text-charcoal';
    return `
      <li class="rounded-2xl border border-charcoal/8 bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-lg">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${badge}">${rank}</span>
            <div>
              <p class="text-base font-semibold text-charcoal">${item.name || 'Item Tanpa Nama'}</p>
              <p class="text-xs font-medium text-charcoal/55">Terjual ${formatNumber(qty)} · Rp ${formatNumber(Math.round(revenue))}</p>
            </div>
          </div>
          <span class="rounded-full bg-matcha/10 px-3 py-1 text-xs font-semibold text-matcha/90">${qtyPercent}% dari top performer</span>
        </div>
        <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-charcoal/10">
          <div class="h-full rounded-full bg-matcha transition-[width] duration-300" style="width:${qtyPercent}%"></div>
        </div>
      </li>`;
  }).join('');

  updateLeaderboardInsights(items, meta);
}

async function loadLeaderboards(method = 'all'){
  await Promise.all(leaderboardScopes.map(async (meta) => {
    try {
      const res = await fetch(`/api/stats/top-items?scope=${meta.scope}&limit=5&method=${encodeURIComponent(method)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.success ? (data.items || []) : [];
      leaderboardData.set(meta.scope, items);
    } catch (err) {
      console.error('Failed to load leaderboard', meta.scope, err);
      leaderboardData.set(meta.scope, []);
    }
  }));

  renderLeaderboardHighlights();
  renderLeaderboardDetail();
}

async function loadOverview(){
  try {
    const res = await fetch('/api/stats/overview');
    const data = await res.json();
    if (!data.success) return;
    const ov = data.overview || {};
    const set = (id, val)=>{ const el = document.getElementById(id); if (el) el.textContent = formatNumber(val||0); };
    set('m-today-revenue', ov.today?.revenue || 0); set('m-today-orders', ov.today?.count || 0);
    set('m-week-revenue', ov.week?.revenue || 0); set('m-week-orders', ov.week?.count || 0);
    set('m-month-revenue', ov.month?.revenue || 0); set('m-month-orders', ov.month?.count || 0);
    set('m-year-revenue', ov.year?.revenue || 0); set('m-year-orders', ov.year?.count || 0);
  } catch (_) {}
}

async function applyFilters(){
  const range = document.getElementById('range').value;
  const method = document.getElementById('method').value;
  const from = parseDateInput('from');
  const to = parseDateInput('to');
  await loadSeries(range, method, from, to);
  const scopeSel = document.getElementById('methodScope');
  const scope = scopeSel ? scopeSel.value : 'month';
  await loadSummary(scope, method);
  currentLeaderboardMethod = method;
  await loadLeaderboards(method);
}

async function exportDailyReport(){
  try {
    const btn = document.getElementById('export-daily');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Membuat...';
    
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    const response = await fetch('/api/stats/export-daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr })
    });
    
    if (!response.ok) throw new Error('Export failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Harian_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    showToast('✅ Laporan harian berhasil diunduh', 'success');
  } catch (error) {
    console.error('Export daily failed:', error);
    const btn = document.getElementById('export-daily');
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Export Harian';
    showToast('❌ Gagal export laporan harian', 'error');
  }
}

async function exportMonthlyReport(){
  try {
    const btn = document.getElementById('export-monthly');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Membuat...';
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-12
    
    const response = await fetch('/api/stats/export-monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month })
    });
    
    if (!response.ok) throw new Error('Export failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Bulanan_${year}-${String(month).padStart(2,'0')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    showToast('✅ Laporan bulanan berhasil diunduh', 'success');
  } catch (error) {
    console.error('Export monthly failed:', error);
    const btn = document.getElementById('export-monthly');
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Export Bulanan';
    showToast('❌ Gagal export laporan bulanan', 'error');
  }
}

function showToast(message, type = 'info'){
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-matcha';
  toast.className = `fixed bottom-6 right-6 ${bgColor} text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-slide-up`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Default: 30d, all methods
  document.getElementById('apply').addEventListener('click', applyFilters);
  document.getElementById('range').addEventListener('change', (e)=>{
    const isCustom = e.target.value === 'custom';
    ['from','to'].forEach(id => document.getElementById(id).disabled = !isCustom);
  });
  // Disable custom dates initially
  ['from','to'].forEach(id => document.getElementById(id).disabled = true);
  // Change of scopes for method and top-items
  const ms = document.getElementById('methodScope'); if (ms) ms.addEventListener('change', applyFilters);

  document.querySelectorAll('[data-leaderboard-card]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.getAttribute('data-scope');
      if (!scope || scope === currentLeaderboardScope) return;
      currentLeaderboardScope = scope;
      renderLeaderboardHighlights();
      renderLeaderboardDetail();
    });
  });
  
  // Export buttons
  document.getElementById('export-daily').addEventListener('click', exportDailyReport);
  document.getElementById('export-monthly').addEventListener('click', exportMonthlyReport);
  
  loadOverview();
  applyFilters();
  leaderboardTimer = setInterval(() => loadLeaderboards(currentLeaderboardMethod), 15000);
});
