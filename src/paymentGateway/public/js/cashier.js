// Cashier POS UI Logic

let CATEGORIES = [];
let MENU_ITEMS = [];
let CART = [];

function fmt(n){ return (n||0).toLocaleString('id-ID'); }
function el(id){ return document.getElementById(id); }
function getPM(){ const r=[...document.querySelectorAll('input[name="pm"]')].find(x=>x.checked); return r? r.value: 'QRIS'; }

async function loadCategories(){
  try{ const res = await fetch('/api/menu/categories'); const j=await res.json(); if(j.success){ CATEGORIES=j.categories||[]; const sel=el('category-select'); sel.innerHTML='<option value="all">Semua Kategori</option>'+CATEGORIES.map(c=>`<option value="${c.id}">${c.emoji||''} ${c.name}</option>`).join(''); } }catch(e){ }
}
async function loadMenu(){
  try{ const res = await fetch('/api/menu/items?available=true'); const j=await res.json(); if(j.success){ MENU_ITEMS=j.items||[]; renderMenu(); } }catch(e){ }
}

function renderMenu(){
  const grid = el('menu-grid');
  const q = (el('search-input').value||'').toLowerCase();
  const cat = el('category-select').value;
  const items = MENU_ITEMS.filter(it=>
    (!q || (it.name||'').toLowerCase().includes(q)) && (cat==='all' || it.category===cat)
  );
  grid.innerHTML = items.map(it=>{
    const price = fmt(it.price);
    const img = it.image ? `<img src="${it.image}" class="w-full h-28 object-cover rounded-xl mb-2" onerror="this.style.display='none'"/>` : '';
    return `<div class="rounded-2xl border border-charcoal/10 bg-white/80 p-3 hover:shadow-md transition">
      ${img}
      <div class="font-semibold">${it.name}</div>
      <div class="text-sm text-charcoal/70">Rp ${price}</div>
      <button class="mt-2 w-full bg-matcha text-cream rounded-lg py-2" onclick='addToCart(${JSON.stringify({id:it.id,name:it.name,price:it.price}).replace(/"/g,"&quot;")})'>Tambah</button>
    </div>`;
  }).join('');
}

function addToCart(item){
  const idx = CART.findIndex(i=>i.id===item.id);
  if(idx>-1){ CART[idx].quantity += 1; }
  else { CART.push({...item, quantity:1}); }
  renderCart();
}
function changeQty(id, delta){
  const idx = CART.findIndex(i=>i.id===id);
  if(idx===-1) return;
  CART[idx].quantity = Math.max(0,(CART[idx].quantity||0)+delta);
  if(CART[idx].quantity===0) CART.splice(idx,1);
  renderCart();
}
function removeItem(id){ CART = CART.filter(i=>i.id!==id); renderCart(); }

function calcTotals(){
  const subtotal = CART.reduce((s,i)=>s+i.price*i.quantity,0);
  // Fee will be calculated server-side too; show approx  per config? We'll keep 0 here.
  const fee = 0;
  return { subtotal, fee, total: subtotal+fee };
}

function renderCart(){
  const list = el('cart-list');
  if(CART.length===0){ list.innerHTML='<div class="text-sm text-charcoal/60">Keranjang kosong</div>'; }
  else{
    list.innerHTML = CART.map(i=>
      `<div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-medium">${i.name}</div>
          <div class="text-xs text-charcoal/60">Rp ${fmt(i.price)}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-2 py-1 border rounded" onclick="changeQty('${i.id}',-1)">-</button>
          <div class="w-6 text-center">${i.quantity}</div>
          <button class="px-2 py-1 border rounded" onclick="changeQty('${i.id}',1)">+</button>
          <button class="px-2 py-1 text-red-600" onclick="removeItem('${i.id}')">×</button>
        </div>
      </div>`
    ).join('');
  }
  const t = calcTotals();
  el('subtotal').textContent = 'Rp '+fmt(t.subtotal);
  el('fee').textContent = 'Rp '+fmt(t.fee);
  el('total').textContent = 'Rp '+fmt(t.total);
}

async function createOrder(){
  if(CART.length===0) return alert('Keranjang kosong');
  const items = CART.map(i=>({ id:i.id, name:i.name, price:i.price, quantity:i.quantity }));
  const body = {
    customerName: el('customer-name').value||undefined,
    userId: el('customer-id').value? (el('customer-id').value+'@pos'): undefined,
    items,
    paymentMethod: getPM()
  };
  const res = await fetch('/api/orders/create',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal membuat pesanan'); }
  CART=[]; renderCart();
  showPaymentPanel(j.order, j.payment||null);
}

function showPaymentPanel(order, payment){
  const panel = el('payment-panel');
  panel.classList.remove('hidden');
  if(order.paymentMethod==='QRIS'){
    const q = encodeURIComponent(payment.qrisCode);
    const expiresAt = new Date(payment.expiresAt).toLocaleTimeString('id-ID');
    panel.innerHTML = `
      <div>
        <div class="text-sm text-charcoal/60">Order ID: <strong>${order.orderId}</strong></div>
        <div class="text-lg font-bold mt-1">Total: Rp ${fmt(order.pricing.total)}</div>
        <div class="mt-3 flex flex-col items-center">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${q}" alt="QRIS" class="rounded-xl border" />
          <div class="text-xs text-charcoal/60 mt-2">Kadaluarsa: ${expiresAt}</div>
        </div>
        <div class="mt-4 flex gap-2">
          <button class="flex-1 bg-matcha text-cream rounded-lg py-2" onclick="confirmPayment('${order.orderId}')">Tandai Sudah Bayar</button>
          <button class="flex-1 bg-red-600 text-cream rounded-lg py-2" onclick="rejectPayment('${order.orderId}')">Batalkan</button>
        </div>
      </div>`;
  } else {
    const until = order.cashExpiresAt ? new Date(order.cashExpiresAt).toLocaleTimeString('id-ID') : '';
    panel.innerHTML = `
      <div>
        <div class="text-sm text-charcoal/60">Order ID: <strong>${order.orderId}</strong></div>
        <div class="text-lg font-bold mt-1">Total: Rp ${fmt(order.pricing.total)}</div>
        <div class="text-xs text-charcoal/60 mt-2">Tunggu di kasir hingga ${until}</div>
        <div class="mt-4 flex gap-2">
          <button class="flex-1 bg-matcha text-cream rounded-lg py-2" onclick="acceptCash('${order.orderId}')">Terima Tunai</button>
          <button class="flex-1 bg-red-600 text-cream rounded-lg py-2" onclick="cancelCash('${order.orderId}')">Batalkan</button>
        </div>
      </div>`;
  }
}

async function confirmPayment(orderId){
  const res = await fetch('/api/payments/confirm/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ confirmedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal konfirmasi'); }
  alert('Pembayaran dikonfirmasi. Pesanan diproses.');
  el('payment-panel').classList.add('hidden');
}
async function rejectPayment(orderId){
  const reason = prompt('Alasan batal?')||'cancel_by_cashier';
  const res = await fetch('/api/payments/reject/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reason, rejectedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal batal'); }
  alert('Pembayaran dibatalkan.');
  el('payment-panel').classList.add('hidden');
}

async function acceptCash(orderId){
  const res = await fetch('/api/orders/cash/accept/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ acceptedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal terima tunai'); }
  alert('Tunai diterima. Pesanan diproses.');
  el('payment-panel').classList.add('hidden');
}
async function cancelCash(orderId){
  const reason = prompt('Alasan batal?')||'cancel_by_cashier';
  const res = await fetch('/api/orders/cash/cancel/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reason, cancelledBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal batalkan tunai'); }
  alert('Pesanan tunai dibatalkan.');
  el('payment-panel').classList.add('hidden');
}

function bindEvents(){
  el('search-input').addEventListener('input', renderMenu);
  el('category-select').addEventListener('change', renderMenu);
  el('create-order-btn').addEventListener('click', createOrder);
}

(async function init(){
  await loadCategories();
  await loadMenu();
  renderCart();
  bindEvents();
})();
