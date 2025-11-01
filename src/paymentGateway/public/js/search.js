// Search page logic with detail popup

function formatNumber(num){
  return (num||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Modal helpers
function openModal(){
  const m = document.getElementById('detail-modal');
  if(!m) return; m.classList.remove('hidden');
  requestAnimationFrame(()=>{ m.classList.remove('opacity-0'); m.classList.add('opacity-100');});
}
function closeModal(){
  const m = document.getElementById('detail-modal');
  if(!m) return; m.classList.remove('opacity-100'); m.classList.add('opacity-0');
  setTimeout(()=>m.classList.add('hidden'),200);
}

async function runSearch(){
  const q = encodeURIComponent((document.getElementById('search-input')?.value||'').trim());
  const status = encodeURIComponent((document.getElementById('search-status')?.value||'all').trim());
  const resultsEl = document.getElementById('search-results');
  if(!resultsEl) return;
  try{
    const res = await fetch(`/api/orders/search?q=${q}&status=${status}`);
    const data = await res.json();
    if(!data.results || data.results.length===0){
      resultsEl.innerHTML = `<div class="rounded-2xl border border-charcoal/10 bg-white/90 px-4 py-6 text-center text-sm">Tidak ada hasil.</div>`;
      return;
    }
    resultsEl.innerHTML = data.results.map(r=>renderResult(r)).join('');
  }catch(e){
    console.error('Search failed:',e);
  }
}

function renderResult(r){
  const badge = r.type==='payment' ? '💳 QRIS Pending' : ({
    pending_cash:'💵 Menunggu Tunai', processing:'👨‍🍳 Diproses', ready:'✅ Siap', completed:'✔️ Selesai', cancelled:'⛔ Dibatalkan'
  }[r.status] || r.status);
  const right = `<div class="text-right"><div class="text-xs text-charcoal/55">Total</div><div class="text-xl font-bold">Rp ${formatNumber(r.total||0)}</div></div>`;
  return `
    <button class="w-full text-left rounded-2xl border border-charcoal/10 bg-white p-4 hover:bg-charcoal/2" onclick="viewDetail('${r.orderId}','${r.type}')">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-charcoal/50">${badge}</p>
          <div class="mt-1 text-sm">📋 ${r.orderId} ${r.customerName?`· 👤 ${r.customerName}`:''} · 📱 ${r.userId} ${r.paymentMethod?`· 💳 ${r.paymentMethod}`:''}</div>
        </div>
        ${right}
      </div>
    </button>`;
}

async function viewDetail(orderId,type){
  try{
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();
    if(!data.success){ alert('Tidak ditemukan'); return; }
    const title = document.getElementById('detail-title');
    const body = document.getElementById('detail-body');
    const actions = document.getElementById('detail-actions');
    actions.innerHTML = '';

    if(data.type==='payment'){
      const p = data.payment;
      title.textContent = `💳 Pembayaran Pending · ${p.orderId}`;
      body.innerHTML = `
        <div class="grid gap-2 text-sm">
          <div>📱 ${p.customerId?.split('@')[0]||''}</div>
          <div>Nominal: <strong>Rp ${formatNumber(p.amount)}</strong></div>
          <div>🕐 Dibuat: ${new Date(p.createdAt).toLocaleString('id-ID')}</div>
          <div>⏰ Kadaluarsa: ${new Date(p.expiresAt).toLocaleString('id-ID')}</div>
          <div class="mt-3 font-semibold">Items (${p.items?.length||0})</div>
          ${(p.items||[]).map(i=>`<div class="flex justify-between border-b border-charcoal/5 py-1"><span>${i.name}</span><span>x${i.quantity} · Rp ${formatNumber(i.price*i.quantity)}</span></div>`).join('')}
        </div>`;
    } else {
      const o = data.order;
      title.textContent = `📋 Order ${o.orderId} · ${o.customerName||'Customer'}`;
      body.innerHTML = `
        <div class="grid gap-2 text-sm">
          <div>Status: <strong>${o.status}</strong> · 💳 ${o.paymentMethod||'-'}</div>
          <div>Total: <strong>Rp ${formatNumber(o.pricing?.total)}</strong></div>
          <div>🕐 Dibuat: ${new Date(o.createdAt).toLocaleString('id-ID')}</div>
          ${o.cashExpiresAt?`<div>⏰ Sisa ke kasir: ${Math.max(0,Math.floor((new Date(o.cashExpiresAt)-Date.now())/60000))} menit</div>`:''}
          ${o.canReopenUntil?`<div>🔁 Batas buka kembali: ${new Date(o.canReopenUntil).toLocaleString('id-ID')}</div>`:''}
          <div class="mt-3 font-semibold">Items (${o.items?.length||0})</div>
          ${(o.items||[]).map(i=>`<div class=\"flex justify-between border-b border-charcoal/5 py-1\"><span>${i.name}${i.notes?`<span class=\"ml-2 text-xs text-charcoal/60\">📝 ${i.notes}</span>`:''}</span><span>x${i.quantity} · Rp ${formatNumber(i.price*i.quantity)}</span></div>`).join('')}
        </div>`;
      // Actions depending on status
      if(o.paymentMethod==='CASH' && o.status==='cancelled' && o.canReopenUntil && new Date(o.canReopenUntil)>new Date()){
        const btn = document.createElement('button');
        btn.className='rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white';
        btn.textContent='🔁 Buka Kembali (Kasir)';
        btn.onclick= async ()=>{ await cashierReopen(o.orderId); closeModal(); runSearch(); };
        actions.appendChild(btn);
      }
      if(o.paymentMethod==='CASH' && o.status==='pending_cash'){
        const b1=document.createElement('button'); b1.className='rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white'; b1.textContent='✅ Terima Tunai'; b1.onclick=async()=>{ await acceptCash(o.orderId); closeModal(); runSearch(); };
        const b2=document.createElement('button'); b2.className='rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white'; b2.textContent='❌ Batalkan'; b2.onclick=async()=>{ await cancelCash(o.orderId); closeModal(); runSearch(); };
        actions.appendChild(b1); actions.appendChild(b2);
      }
      if(o.status==='processing'){
        const b=document.createElement('button'); b.className='rounded-2xl bg-matcha px-4 py-3 text-sm font-semibold text-white'; b.textContent=`✅ Tandai Siap (${o.customerName})`; b.onclick=async()=>{ await markOrderReady(o.orderId,o.customerName); closeModal(); runSearch(); };
        actions.appendChild(b);
      }
    }
    
    // Add delete button for all orders
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white';
    deleteBtn.textContent = '🗑️ Hapus Pesanan';
    deleteBtn.onclick = async () => {
      const confirmDelete = confirm(`Yakin ingin menghapus pesanan ${orderId}?\n\nTindakan ini tidak dapat dibatalkan dan akan menghapus data dari database.`);
      if (confirmDelete) {
        try {
          const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            alert('Pesanan berhasil dihapus!');
            closeModal();
            runSearch();
          } else {
            alert('Gagal menghapus: ' + (data.message || 'Unknown error'));
          }
        } catch (e) {
          alert('Error: ' + e.message);
        }
      }
    };
    actions.appendChild(deleteBtn);
    
    openModal();
  }catch(e){ console.error('Detail failed:',e); }
}

// Minimal action helpers
async function cashierReopen(orderId){
  try{
    const r=await fetch(`/api/orders/cash/reopen/${orderId}`,{method:'POST'}); const d=await r.json(); if(!d.success) alert('Gagal: '+(d.message||'Unknown'));
  }catch(e){ alert('Error: '+e.message); }
}
async function acceptCash(orderId){
  const ok=confirm('Terima pembayaran tunai dan mulai proses?'); if(!ok) return; 
  try{ const r=await fetch(`/api/orders/cash/accept/${orderId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acceptedBy:'kasir'})}); const d=await r.json(); if(!d.success) alert('Gagal: '+(d.message||'Unknown')); }
  catch(e){ alert('Error: '+e.message); }
}
async function cancelCash(orderId){
  const reason=prompt('Alasan pembatalan (opsional):','No show di kasir'); if(reason===null) return;
  try{ const r=await fetch(`/api/orders/cash/cancel/${orderId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,cancelledBy:'kasir'})}); const d=await r.json(); if(!d.success) alert('Gagal: '+(d.message||'Unknown')); }
  catch(e){ alert('Error: '+e.message); }
}
async function markOrderReady(orderId,customerName){
  const ok=confirm(`Tandai pesanan siap?\nOrder: ${orderId}\nAtas Nama: ${customerName}`); if(!ok) return;
  try{ const r=await fetch(`/api/orders/ready/${orderId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({markedBy:'kasir'})}); const d=await r.json(); if(!d.success) alert('Gagal: '+(d.message||'Unknown')); }
  catch(e){ alert('Error: '+e.message); }
}

// Bind events
window.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('search-input');
  const sel=document.getElementById('search-status');
  const btn=document.getElementById('btn-search');
  if(btn) btn.addEventListener('click', runSearch);
  if(inp) inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter') runSearch(); });
  if(sel) sel.addEventListener('change', runSearch);
  const closeBtn=document.getElementById('detail-close'); if(closeBtn) closeBtn.addEventListener('click', closeModal);
  // initial
  runSearch();
});
