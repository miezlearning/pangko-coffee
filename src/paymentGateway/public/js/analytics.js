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

async function applyFilters(){
  const range = document.getElementById('range').value;
  const method = document.getElementById('method').value;
  const from = parseDateInput('from');
  const to = parseDateInput('to');
  await loadSeries(range, method, from, to);
  await loadSummary(range === '7d' || range === '30d' ? 'month' : 'custom', method);
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
  applyFilters();
});
