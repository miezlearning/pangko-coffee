// Analytics page logic

let ordersChart, revenueChart;

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

async function loadTopItems(scope, method){
  const params = new URLSearchParams({ scope, method, limit: '9' });
  const res = await fetch(`/api/stats/top-items?${params.toString()}`);
  const data = await res.json();
  const wrap = document.getElementById('top-items');
  if (!wrap) return;
  if (!data.success){ wrap.innerHTML = '<p class="text-sm text-rose-700">Gagal memuat top produk</p>'; return; }
  const items = (data.items||[]).map(it=>{
    return `<div class="rounded-xl border border-charcoal/10 bg-white p-4">
      <div class="text-sm font-semibold">${it.name}</div>
      <div class="mt-1 text-xs text-charcoal/60">Terjual</div>
      <div class="text-2xl font-bold">${formatNumber(it.qty)}</div>
      <div class="mt-1 text-xs text-charcoal/60">Revenue</div>
      <div class="text-xl font-bold">Rp ${formatNumber(it.revenue||0)}</div>
    </div>`;
  }).join('');
  wrap.innerHTML = items || '<p class="text-sm text-charcoal/60">Tidak ada data</p>';
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
  const topScopeSel = document.getElementById('topScope');
  const topScope = topScopeSel ? topScopeSel.value : 'month';
  await loadTopItems(topScope, method);
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
  const ts = document.getElementById('topScope'); if (ts) ts.addEventListener('change', applyFilters);
  
  // Export buttons
  document.getElementById('export-daily').addEventListener('click', exportDailyReport);
  document.getElementById('export-monthly').addEventListener('click', exportMonthlyReport);
  
  loadOverview();
  applyFilters();
});
