// Cashier POS UI Logic

let CATEGORIES = [];
let MENU_ITEMS = [];
let CART = [];
let DISCOUNT_RP = 0;
let DISCOUNT_PCT = 0;

const DRAFT_KEY = 'pos_draft_v1';

// Realtime polling & notification system
let currentOrderId = null;
let pollInterval = null;
let soundEnabled = true;
let audioUnlocked = false;
let selectedSound = localStorage.getItem('notifSound') || '/sounds/sound1.mp3';
let lastOrderStatus = null;

function fmt(n){ return (n||0).toLocaleString('id-ID'); }
function el(id){ return document.getElementById(id); }
function getPM(){ const r=[...document.querySelectorAll('input[name="pm"]')].find(x=>x.checked); return r? r.value: 'QRIS'; }

// Sound & notification functions (similar to dashboard)
function unlockAudio() {
  if (audioUnlocked) return;
  try {
    const a = new Audio(selectedSound);
    a.muted = true;
    a.play().then(() => { a.pause(); audioUnlocked = true; }).catch(() => {});
  } catch (_) {}
}

function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    const audio = new Audio(selectedSound);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (_) {}
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundToggleUI();
  if (soundEnabled) unlockAudio();
}

function updateSoundToggleUI() {
  const btn = el('sound-toggle');
  if (!btn) return;
  btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
  btn.classList.toggle('bg-matcha', soundEnabled);
  btn.classList.toggle('text-white', soundEnabled);
  btn.classList.toggle('bg-white', !soundEnabled);
  btn.classList.toggle('text-matcha', !soundEnabled);
}

function changeNotifSound(file) {
  selectedSound = file;
  localStorage.setItem('notifSound', file);
  try {
    const audio = new Audio(file);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (_) {}
}

function showNotification(title, text) {
  const notif = el('notification');
  const notifTitle = el('notification-title');
  const notifText = el('notification-text');
  if (!notif || !notifTitle || !notifText) return;
  notifTitle.textContent = title;
  notifText.textContent = text;
  notif.classList.remove('hidden', 'opacity-0', '-translate-y-2');
  requestAnimationFrame(() => {
    notif.classList.add('opacity-100', 'translate-y-0');
  });
  playNotificationSound();
  setTimeout(() => {
    notif.classList.remove('opacity-100', 'translate-y-0');
    notif.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => notif.classList.add('hidden'), 250);
  }, 5000);
}

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
  
  if(items.length===0){
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-charcoal/50">Tidak ada menu yang cocok</div>';
    return;
  }
  
  grid.innerHTML = items.map(it=>{
    const price = fmt(it.price);
    // Get category emoji if available
    const catObj = CATEGORIES.find(c=>c.id===it.category);
    const emoji = catObj?.emoji || '☕';
    
    return `<div class="group rounded-xl border border-charcoal/10 bg-white/90 p-3.5 hover:shadow-lg hover:border-matcha/30 transition-all duration-200 cursor-pointer">
      <div class="flex flex-col h-full">
        <div class="flex items-start justify-between mb-2">
          <div class="text-2xl">${emoji}</div>
          <div class="text-xs px-2 py-0.5 rounded-full bg-cream text-charcoal/60 font-medium">${catObj?.name||'Menu'}</div>
        </div>
        <div class="flex-1 min-h-0">
          <div class="font-bold text-sm mb-1 line-clamp-2 group-hover:text-matcha transition">${it.name}</div>
          <div class="text-base font-extrabold text-matcha">Rp ${price}</div>
        </div>
        <button class="mt-3 w-full bg-matcha text-white rounded-lg py-2 text-sm font-semibold hover:bg-matcha/90 active:scale-95 transition-all" onclick='addToCart(${JSON.stringify({id:it.id,name:it.name,price:it.price}).replace(/"/g,"&quot;")})'>
          + Tambah
        </button>
      </div>
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
  // Discounts
  const pctAmt = Math.max(0, Math.min(100, Number(DISCOUNT_PCT || 0))) / 100 * subtotal;
  const rpAmt = Math.max(0, Number(DISCOUNT_RP || 0));
  let discount = Math.min(subtotal, Math.round(pctAmt + rpAmt));
  const total = Math.max(0, subtotal - discount + fee);
  return { subtotal, fee, discount, total };
}

function renderCart(){
  const list = el('cart-list');
  if(CART.length===0){ 
    list.innerHTML='<div class="text-center py-8 text-sm text-charcoal/50">🛒 Keranjang masih kosong</div>'; 
  }
  else{
    list.innerHTML = CART.map(i=>
      `<div class="flex items-start gap-3 p-2.5 rounded-lg bg-cream/50 border border-charcoal/5 hover:bg-cream/80 transition">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm truncate">${i.name}</div>
          <div class="text-xs text-charcoal/60 mt-0.5">Rp ${fmt(i.price)} × ${i.quantity} = <span class="font-semibold text-matcha">Rp ${fmt(i.price * i.quantity)}</span></div>
          ${i.notes ? `<div class="text-xs text-charcoal/70 mt-1.5 bg-white/80 px-2 py-1 rounded border border-charcoal/10">📝 ${i.notes.replace(/</g,'&lt;')}</div>` : ''}
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1 bg-white rounded-lg border border-charcoal/10">
            <button class="px-2 py-1 hover:bg-charcoal/5 rounded-l-lg transition" onclick="changeQty('${i.id}',-1)">−</button>
            <div class="w-8 text-center font-bold text-sm">${i.quantity}</div>
            <button class="px-2 py-1 hover:bg-charcoal/5 rounded-r-lg transition" onclick="changeQty('${i.id}',1)">+</button>
          </div>
          <div class="flex gap-1">
            <button class="px-2 py-1 text-xs hover:bg-white rounded border border-charcoal/10 transition" title="Catatan" onclick="editNote('${i.id}')">📝</button>
            <button class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 transition" title="Hapus" onclick="removeItem('${i.id}')">🗑</button>
          </div>
        </div>
      </div>`
    ).join('');
  }
  const t = calcTotals();
  el('subtotal').textContent = 'Rp '+fmt(t.subtotal);
  el('fee').textContent = 'Rp '+fmt(t.fee);
  el('discount').textContent = (t.discount>0? '− ':'− ') + 'Rp ' + fmt(t.discount);
  el('total').textContent = 'Rp '+fmt(t.total);
  saveDraft();
}

function editNote(id){
  const idx = CART.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const current = CART[idx].notes || '';
  const note = prompt('Catatan untuk item ini?', current || '');
  if(note===null) return; // cancelled
  CART[idx].notes = note.trim();
  renderCart();
}

async function createOrder(){
  if(CART.length===0) return alert('Keranjang kosong');
  const t = calcTotals();
  const items = CART.map(i=>({ id:i.id, name:i.name, price:i.price, quantity:i.quantity, notes: i.notes||undefined }));
  if(t.discount>0){
    items.push({ id:'DISCOUNT', name:'Diskon', price: -t.discount, quantity:1 });
  }
  
  // Get phone and notification preference
  const phone = el('customer-phone').value.trim();
  const sendNotif = el('send-notif-check').checked;
  let userId = undefined;
  if(phone && sendNotif){
    // Format phone as userId for bot notification
    const cleanPhone = phone.replace(/\D/g,'');
    userId = cleanPhone.endsWith('@s.whatsapp.net')? cleanPhone : cleanPhone+'@s.whatsapp.net';
  }
  
  const body = {
    customerName: el('customer-name').value||undefined,
    userId,
    items,
    paymentMethod: getPM()
  };
  const res = await fetch('/api/orders/create',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal membuat pesanan'); }
  // Clear cart & draft after successful create
  CART=[]; DISCOUNT_RP=0; DISCOUNT_PCT=0;
  el('discount-rp').value=''; el('discount-pct').value='';
  saveDraft();
  renderCart();
  showPaymentPanel(j.order, j.payment||null);
  currentOrderId = j.order.orderId;
  lastOrderStatus = j.order.status;
  startPolling(j.order.orderId);
}

function showPaymentPanel(order, payment){
  const panel = el('payment-panel');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  if(order.paymentMethod==='QRIS'){
    const q = encodeURIComponent(payment.qrisCode);
    const expiresAt = new Date(payment.expiresAt).toLocaleTimeString('id-ID');
    panel.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-xs text-charcoal/60">Order <span class="font-mono font-bold">#${order.orderId}</span></div>
          <span id="status-badge-${order.orderId}" class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">⏳ PENDING</span>
        </div>
        <div class="text-2xl font-extrabold text-matcha">Rp ${fmt(order.pricing.total)}</div>
        <div class="bg-gradient-to-br from-matcha/5 to-peach/5 rounded-xl p-4 flex flex-col items-center border border-matcha/10">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${q}" alt="QRIS" class="rounded-lg border-2 border-white shadow-lg" />
          <div class="text-xs text-charcoal/60 mt-3 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>Kadaluarsa: ${expiresAt}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 bg-matcha text-white rounded-lg py-2.5 font-bold hover:bg-matcha/90 transition active:scale-95" onclick="confirmPayment('${order.orderId}')">✓ Sudah Bayar</button>
          <button class="flex-1 bg-red-500 text-white rounded-lg py-2.5 font-bold hover:bg-red-600 transition active:scale-95" onclick="rejectPayment('${order.orderId}')">✕ Batal</button>
        </div>
      </div>`;
  } else {
    const until = order.cashExpiresAt ? new Date(order.cashExpiresAt).toLocaleTimeString('id-ID') : '';
    panel.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-xs text-charcoal/60">Order <span class="font-mono font-bold">#${order.orderId}</span></div>
          <span id="status-badge-${order.orderId}" class="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">⏳ PENDING</span>
        </div>
        <div class="text-2xl font-extrabold text-matcha">Rp ${fmt(order.pricing.total)}</div>
        <div class="bg-gradient-to-br from-orange-50 to-peach/20 rounded-xl p-6 text-center border border-orange-100">
          <div class="text-5xl mb-2">💵</div>
          <div class="text-sm font-semibold text-charcoal/70">Tunggu pembayaran tunai</div>
          <div class="text-xs text-charcoal/50 mt-1.5 flex items-center justify-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>Sampai ${until}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 bg-matcha text-white rounded-lg py-2.5 font-bold hover:bg-matcha/90 transition active:scale-95" onclick="acceptCash('${order.orderId}')">✓ Terima Tunai</button>
          <button class="flex-1 bg-red-500 text-white rounded-lg py-2.5 font-bold hover:bg-red-600 transition active:scale-95" onclick="cancelCash('${order.orderId}')">✕ Batal</button>
        </div>
      </div>`;
  }
}

async function confirmPayment(orderId){
  const res = await fetch('/api/payments/confirm/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ confirmedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal konfirmasi'); }
  showNotification('✅ Pembayaran Dikonfirmasi', 'Pesanan sedang diproses barista');
  // Keep panel visible to show status updates
}
async function rejectPayment(orderId){
  const reason = prompt('Alasan batal?')||'cancel_by_cashier';
  const res = await fetch('/api/payments/reject/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reason, rejectedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal batal'); }
  showNotification('❌ Pembayaran Dibatalkan', reason);
  stopPolling();
  setTimeout(() => el('payment-panel').classList.add('hidden'), 2000);
}

async function acceptCash(orderId){
  const res = await fetch('/api/orders/cash/accept/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ acceptedBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal terima tunai'); }
  showNotification('💰 Tunai Diterima', 'Pesanan sedang diproses barista');
  // Keep panel visible to show status updates
}
async function cancelCash(orderId){
  const reason = prompt('Alasan batal?')||'cancel_by_cashier';
  const res = await fetch('/api/orders/cash/cancel/'+orderId,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reason, cancelledBy:'kasir' })});
  const j = await res.json();
  if(!j.success){ return alert(j.message||'Gagal batalkan tunai'); }
  showNotification('❌ Pesanan Dibatalkan', reason);
  stopPolling();
  setTimeout(() => el('payment-panel').classList.add('hidden'), 2000);
}

// Realtime polling for order status updates
async function pollOrderStatus(orderId){
  try {
    const res = await fetch('/api/orders/'+orderId);
    const j = await res.json();
    if(!j.success) return;
    
    const order = j.type==='order'? j.order : null;
    const payment = j.type==='payment'? j.payment : null;
    
    let status = null;
    if(order) status = order.status;
    else if(payment) status = payment.status;
    
    if(!status) return;
    
    // Update status badge
    const badge = document.getElementById('status-badge-'+orderId);
    if(badge){
      let text='', cls='';
      if(status==='pending' || status==='pending_payment'){
        text='⏳ PENDING'; cls='bg-amber-100 text-amber-700';
      } else if(status==='confirmed'){
        text='✅ TERKONFIRMASI'; cls='bg-green-100 text-green-700';
      } else if(status==='processing'){
        text='👨‍🍳 DIPROSES'; cls='bg-blue-100 text-blue-700';
      } else if(status==='ready'){
        text='🎉 SIAP DIAMBIL'; cls='bg-green-100 text-green-700';
      } else if(status==='completed'){
        text='✔️ SELESAI'; cls='bg-gray-100 text-gray-700';
      } else if(status==='cancelled' || status==='expired'){
        text='❌ BATAL'; cls='bg-red-100 text-red-700';
      }
      badge.className = 'px-3 py-1 rounded-full text-xs font-semibold '+cls;
      badge.textContent = text;
    }
    
    // Notify on status change
    if(lastOrderStatus && lastOrderStatus !== status){
      if(status==='confirmed'){
        showNotification('✅ Pembayaran Terkonfirmasi', 'Pesanan masuk ke antrian barista');
      } else if(status==='processing'){
        showNotification('👨‍🍳 Sedang Diproses', 'Barista sedang membuat pesanan');
      } else if(status==='ready'){
        showNotification('🎉 Pesanan Siap!', 'Pesanan sudah bisa diambil pelanggan');
        stopPolling();
        setTimeout(() => el('payment-panel').classList.add('hidden'), 5000);
      } else if(status==='completed'){
        showNotification('✔️ Pesanan Selesai', 'Pelanggan sudah mengambil pesanan');
        stopPolling();
        setTimeout(() => el('payment-panel').classList.add('hidden'), 3000);
      } else if(status==='cancelled' || status==='expired'){
        showNotification('❌ Pesanan Dibatalkan', 'Pesanan tidak dapat dilanjutkan');
        stopPolling();
        setTimeout(() => el('payment-panel').classList.add('hidden'), 3000);
      }
    }
    lastOrderStatus = status;
    
  } catch(e){ /* ignore network errors */ }
}

function startPolling(orderId){
  stopPolling(); // Clear any existing
  pollInterval = setInterval(() => pollOrderStatus(orderId), 3000);
  pollOrderStatus(orderId); // Initial poll
}

function stopPolling(){
  if(pollInterval){
    clearInterval(pollInterval);
    pollInterval = null;
  }
  currentOrderId = null;
  lastOrderStatus = null;
}

function bindEvents(){
  el('search-input').addEventListener('input', renderMenu);
  el('category-select').addEventListener('change', renderMenu);
  el('create-order-btn').addEventListener('click', createOrder);
  // Discounts
  const drp = el('discount-rp');
  const dp = el('discount-pct');
  drp.addEventListener('input', ()=>{ DISCOUNT_RP = Math.max(0, Number(drp.value||0)); renderCart(); });
  dp.addEventListener('input', ()=>{ DISCOUNT_PCT = Math.max(0, Math.min(100, Number(dp.value||0))); renderCart(); });
  // Customer fields
  el('customer-name').addEventListener('input', saveDraft);
  el('customer-phone').addEventListener('input', saveDraft);
  el('send-notif-check').addEventListener('change', saveDraft);
  document.querySelectorAll('input[name="pm"]').forEach(r=> r.addEventListener('change', saveDraft));
  el('clear-draft-btn').addEventListener('click', ()=>{ if(confirm('Hapus draft keranjang?')){ clearDraft(true); } });
  
  // Sound controls
  el('sound-toggle').addEventListener('click', toggleSound);
  el('notif-sound-select').addEventListener('change', (e)=> changeNotifSound(e.target.value));
  const savedSound = localStorage.getItem('notifSound');
  if(savedSound) el('notif-sound-select').value = savedSound;
  updateSoundToggleUI();
  
  // Unlock audio on any user interaction
  document.body.addEventListener('click', unlockAudio, {once: true});
}

function saveDraft(){
  try{
    const data = {
      cart: CART,
      discountRp: DISCOUNT_RP,
      discountPct: DISCOUNT_PCT,
      customerName: el('customer-name').value||'',
      customerPhone: el('customer-phone').value||'',
      sendNotif: el('send-notif-check').checked,
      paymentMethod: getPM(),
      ts: Date.now()
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    updateDraftIndicator(true);
  }catch(e){ /* ignore */ }
}

function loadDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    CART = Array.isArray(data.cart)? data.cart : [];
    DISCOUNT_RP = Number(data.discountRp||0);
    DISCOUNT_PCT = Number(data.discountPct||0);
    el('customer-name').value = data.customerName||'';
    el('customer-phone').value = data.customerPhone||'';
    el('send-notif-check').checked = !!data.sendNotif;
    const pm = data.paymentMethod || 'QRIS';
    const r = [...document.querySelectorAll('input[name="pm"]')].find(x=>x.value===pm);
    if(r) r.checked = true;
    el('discount-rp').value = DISCOUNT_RP? String(DISCOUNT_RP): '';
    el('discount-pct').value = DISCOUNT_PCT? String(DISCOUNT_PCT): '';
    updateDraftIndicator(true, data.ts);
  }catch(e){ /* ignore */ }
}

function clearDraft(resetFields){
  try{ localStorage.removeItem(DRAFT_KEY); }catch(e){}
  updateDraftIndicator(false);
  if(resetFields){
    CART = [];
    DISCOUNT_RP=0; DISCOUNT_PCT=0;
    el('customer-name').value='';
    el('customer-phone').value='';
    el('send-notif-check').checked=false;
    el('discount-rp').value='';
    el('discount-pct').value='';
    renderCart();
  }
}

function updateDraftIndicator(saved, ts){
  const span = el('draft-indicator');
  if(!span) return;
  if(saved){
    const time = ts? new Date(ts).toLocaleTimeString('id-ID') : new Date().toLocaleTimeString('id-ID');
    span.textContent = `Draft tersimpan • ${time}`;
  } else {
    span.textContent = 'Draft belum tersimpan';
  }
}

(async function init(){
  await loadCategories();
  await loadMenu();
  loadDraft();
  renderCart();
  bindEvents();
})();
