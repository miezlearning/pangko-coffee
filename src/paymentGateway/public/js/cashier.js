// Cashier POS UI Logic

let CATEGORIES = [];
let MENU_ITEMS = [];
let CART = [];
let DISCOUNT_RP = 0;
let DISCOUNT_PCT = 0;
let currentEditingCartKey = null; // Track which cart line's note is being edited
let addonModalState = null; // State for add-on modal interactions

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

function computeMenuUnitPrice(item){
  // No discount system - just return the base price
  return Number(item?.price || 0);
}

function normalizeAddons(addons = []){
  return addons
    .filter(addon => addon && addon.isActive !== false)
    .map(addon => ({
      id: String(addon.id),
      name: addon.name,
      unitPrice: Number(addon.price || 0),
      minQuantity: Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0,
      maxQuantity: Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : null,
      defaultQuantity: Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : null,
      isRequired: !!addon.isRequired
    }));
}

function buildCartItem(menuItem, addonSelections){
  const basePrice = computeMenuUnitPrice(menuItem);
  const addonsTotal = addonSelections.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
  const unitPrice = basePrice + addonsTotal;
  const keyPart = addonSelections
    .filter(addon => addon.quantity > 0)
    .map(addon => `${addon.id}:${addon.quantity}`)
    .sort()
    .join('|');
  const cartKey = keyPart ? `${menuItem.id}::${keyPart}` : String(menuItem.id);

  return {
    id: String(menuItem.id),
    cartKey,
    name: menuItem.name,
    basePrice,
    price: unitPrice,
    addons: addonSelections,
    notes: ''
  };
}

function formatAddonLines(addons){
  if (!Array.isArray(addons) || addons.length === 0) return '';
  return addons.map(addon => {
    const total = (addon.unitPrice || addon.price || 0) * addon.quantity;
    return `<div class="text-xs text-charcoal/60 flex items-center gap-1 mt-1">
      <span class="text-matcha">➕</span>
      <span class="flex-1">${addon.name}</span>
      <span class="font-semibold text-charcoal/70">x${addon.quantity} · Rp ${fmt(total)}</span>
    </div>`;
  }).join('');
}

function normalizeCartItem(raw){
  if(!raw) return null;
  const addons = Array.isArray(raw.addons) ? raw.addons.map(addon => ({
    id: String(addon.id),
    name: addon.name,
    quantity: Math.max(0, Number(addon.quantity || 0)),
    unitPrice: Number(addon.unitPrice || addon.price || 0)
  })).filter(addon => addon.id) : [];
  const addonsTotal = addons.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
  const basePriceCandidate = Number(raw.basePrice);
  const basePrice = Number.isFinite(basePriceCandidate) ? Math.max(0, basePriceCandidate) : Math.max(0, Number(raw.price || 0) - addonsTotal);
  const priceCandidate = Number(raw.price);
  const price = Number.isFinite(priceCandidate) ? priceCandidate : basePrice + addonsTotal;
  const keyPart = addons.filter(addon => addon.quantity > 0).map(addon => `${addon.id}:${addon.quantity}`).sort().join('|');
  const cartKey = raw.cartKey || (keyPart ? `${raw.id}::${keyPart}` : String(raw.id));

  return {
    id: String(raw.id),
    name: raw.name,
    cartKey,
    basePrice,
    price,
    addons,
    notes: raw.notes || '',
    quantity: Math.max(1, Number(raw.quantity || 1))
  };
}

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
  try{ 
    const res = await fetch('/api/menu/categories'); 
    const j=await res.json(); 
    if(j.success){ 
      CATEGORIES=j.categories||[]; 
      renderCategoryChips();
    } 
  }catch(e){ }
}

function renderCategoryChips(){
  const container = el('category-chips');
  if(!container) return;
  
  const chips = [
    { id: 'all', name: 'Semua', emoji: '📂' },
    ...CATEGORIES.map(c => ({ id: c.id, name: c.name, emoji: c.emoji || '☕' }))
  ];
  
  container.innerHTML = chips.map(c => 
    `<button data-category="${c.id}" class="category-chip ${c.id==='all'?'active':''} px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all whitespace-nowrap shadow-sm">
     ${c.name}
    </button>`
  ).join('');
  
  // Add click handlers
  container.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const category = e.currentTarget.dataset.category;
      setActiveCategory(category);
    });
  });
}

function setActiveCategory(categoryId){
  // Update active state
  document.querySelectorAll('.category-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === categoryId);
  });
  renderMenu();
  updateResultsCount();
}

function updateResultsCount(){
  const q = (el('search-input').value||'').toLowerCase();
  const activeChip = document.querySelector('.category-chip.active');
  const cat = activeChip ? activeChip.dataset.category : 'all';
  
  const items = MENU_ITEMS.filter(it=>{
    const matchSearch = !q || 
      (it.name||'').toLowerCase().includes(q) || 
      (it.description||'').toLowerCase().includes(q);
    const matchCategory = cat==='all' || it.category===cat;
    return matchSearch && matchCategory && it.available;
  });
  
  const countEl = el('results-count');
  if(countEl){
    countEl.textContent = `Menampilkan ${items.length} menu${q ? ` untuk "${q}"` : ''}`;
  }
}
async function loadMenu(){
  try{ const res = await fetch('/api/menu/items?available=true'); const j=await res.json(); if(j.success){ MENU_ITEMS=j.items||[]; renderMenu(); } }catch(e){ }
}

function renderMenu(){
  const grid = el('menu-grid');
  const q = (el('search-input').value||'').toLowerCase();
  const activeChip = document.querySelector('.category-chip.active');
  const cat = activeChip ? activeChip.dataset.category : 'all';
  
  // Enhanced filtering - search in name AND description
  const items = MENU_ITEMS.filter(it=>{
    const matchSearch = !q || 
      (it.name||'').toLowerCase().includes(q) || 
      (it.description||'').toLowerCase().includes(q);
    const matchCategory = cat==='all' || it.category===cat;
    return matchSearch && matchCategory && it.available; // Only show available items
  });
  
  if(items.length===0){
    grid.innerHTML = `<div class="col-span-full text-center py-16">
      <div class="text-5xl mb-3">🔍</div>
      <div class="text-charcoal/60 font-semibold">Tidak ada menu yang cocok</div>
      <div class="text-xs text-charcoal/40 mt-1">Coba kata kunci lain atau ubah kategori</div>
    </div>`;
    return;
  }
  
  grid.innerHTML = items.map(it=>{
    const price = fmt(it.price);
    // Show original/base price when provided and higher than selling price
    const basePriceNum = (it.basePrice !== undefined && it.basePrice !== null) ? Number(it.basePrice) : null;
    const showOriginal = basePriceNum !== null && basePriceNum > Number(it.price || 0);
    
    // Get category info
    const catObj = CATEGORIES.find(c=>c.id===it.category);
    const emoji = catObj?.emoji || '☕';
    const catName = catObj?.name || 'Menu';
    
    // Stock badge if using stock tracking
    const stockBadge = it.use_stock && it.stock_quantity !== undefined
      ? `<div class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold ${
          it.stock_quantity > 10 ? 'bg-green-100 text-green-700' : 
          it.stock_quantity > 0 ? 'bg-orange-100 text-orange-700' : 
          'bg-red-100 text-red-700'
        }">
          ${it.stock_quantity > 0 ? `Stok: ${it.stock_quantity}` : 'Habis'}
        </div>`
      : '';
    
    return `<div class="group relative rounded-xl border-2 border-charcoal/10 bg-white shadow-sm hover:shadow-lg hover:border-matcha/50 hover:-translate-y-1 transition-all duration-200">
      ${stockBadge}
      <div class="flex flex-col h-full">
        ${it.image 
          ? `<div class="relative w-full h-28 rounded-t-xl overflow-hidden bg-gradient-to-br from-cream to-peach/20">
              <img src="${it.image}" alt="${it.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-4xl\\'>${emoji}</div>'">
            </div>`
          : `<div class="relative w-full h-28 rounded-t-xl bg-gradient-to-br from-cream to-peach/20 flex items-center justify-center border-b border-charcoal/5">
              <div class="text-4xl group-hover:scale-110 transition-transform">${emoji}</div>
            </div>`
        }
        <div class="flex flex-col flex-1 p-3">
          <div class="flex-1 min-w-0 mb-2">
            <div class="font-bold text-sm leading-tight mb-1.5 line-clamp-2 group-hover:text-matcha transition">${it.name}</div>
            <div class="text-[10px] px-2 py-0.5 rounded-full bg-matcha/10 text-matcha font-bold inline-block">${catName}</div>
          </div>
          ${it.description 
            ? `<div class="text-xs text-charcoal/60 mb-2 line-clamp-2 leading-snug">${it.description}</div>`
            : ''
          }
          <div class="mt-auto space-y-2">
            ${showOriginal
              ? `<div class="flex items-baseline gap-2">
                   <span class="text-xs text-red-500 line-through font-semibold">Rp ${fmt(basePriceNum)}</span>
                   <span class="text-base font-extrabold text-matcha">Rp ${price}</span>
                 </div>`
              : `<div class="text-base font-extrabold text-matcha">Rp ${price}</div>`
            }
            <button class="w-full bg-gradient-to-r from-matcha to-green-600 text-white rounded-lg py-2 text-xs font-extrabold hover:shadow-md active:scale-95 transition-all add-to-cart-btn" data-item-id="${it.id}">
              <span class="inline-flex items-center justify-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Tambah
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAddToCart(btn.dataset.itemId));
  });
}

function handleAddToCart(itemId){
  const item = MENU_ITEMS.find(it => String(it.id) === String(itemId));
  if(!item) return;

  const availableAddons = normalizeAddons(item.addons || []);
  if(availableAddons.length === 0){
    const cartItem = buildCartItem(item, []);
    addCartEntry(cartItem, 1);
    return;
  }

  openAddonModal(item, availableAddons);
}

function addCartEntry(cartItem, quantity){
  const idx = CART.findIndex(i => i.cartKey === cartItem.cartKey);
  if(idx > -1){
    CART[idx].quantity += quantity;
  } else {
    const normalized = normalizeCartItem({...cartItem, quantity});
    if(normalized) CART.push(normalized);
  }
  renderCart();
}

function openAddonModal(item, addons){
  addonModalState = {
    item,
    addons,
    quantities: addons.map(addon => {
      if (addon.defaultQuantity !== null && addon.defaultQuantity !== undefined) return addon.defaultQuantity;
      if (addon.minQuantity) return addon.minQuantity;
      return 0;
    })
  };

  const titleEl = el('addon-modal-title');
  const subtitleEl = el('addon-modal-subtitle');
  if(titleEl) titleEl.textContent = `Add-on untuk ${item.name}`;
  if(subtitleEl) subtitleEl.textContent = 'Atur jumlah add-on sebelum menambah ke keranjang.';
  renderAddonModal();

  const modal = el('addon-modal');
  if(modal){
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      const container = modal.querySelector('.transform');
      if(container){
        container.classList.remove('opacity-0','scale-95');
        container.classList.add('opacity-100','scale-100');
      }
    });
  }
  updateAddonSkipButton();
}

function renderAddonModal(){
  const listEl = el('addon-modal-list');
  const summaryEl = el('addon-modal-summary');
  if(!addonModalState || !listEl) return;

  const { addons, quantities, item } = addonModalState;
  if(addons.length === 0){
    listEl.innerHTML = '<div class="rounded-xl border border-charcoal/10 bg-gray-50 px-4 py-6 text-center text-sm text-charcoal/60">Tidak ada add-on untuk item ini.</div>';
    if(summaryEl) summaryEl.textContent = '';
    return;
  }

  listEl.innerHTML = addons.map((addon, index) => {
    const qty = Number(quantities[index] ?? 0);
    const subtotal = qty * Number(addon.unitPrice || 0);
    const requirements = [];
    if(addon.isRequired && (addon.minQuantity || 0) > 0){
      requirements.push(`wajib min ${addon.minQuantity}`);
    } else if((addon.minQuantity || 0) > 0){
      requirements.push(`min ${addon.minQuantity}`);
    }
    if(addon.maxQuantity !== null && addon.maxQuantity !== undefined){
      requirements.push(`maks ${addon.maxQuantity}`);
    }

    return `<div class="rounded-xl border-2 border-charcoal/10 bg-gradient-to-br from-white to-cream/30 px-4 py-3 hover:border-matcha/30 transition-all">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm text-charcoal">${addon.name}</div>
          <div class="text-xs text-charcoal/60 mt-0.5 font-semibold">Rp ${fmt(addon.unitPrice)}${requirements.length ? ` • ${requirements.join(', ')}` : ''}</div>
        </div>
        <div class="flex items-center gap-1.5 bg-white rounded-xl px-2 py-1 border-2 border-charcoal/10 shadow-sm">
          <button class="w-7 h-7 rounded-lg bg-white border border-charcoal/10 text-base font-bold leading-none hover:bg-charcoal/5 active:scale-95 transition-all" data-addon-action="dec" data-index="${index}">−</button>
          <div id="addon-qty-${index}" class="w-7 text-center font-extrabold text-sm">${qty}</div>
          <button class="w-7 h-7 rounded-lg bg-matcha text-white border border-matcha text-base font-bold leading-none hover:bg-matcha/90 active:scale-95 transition-all" data-addon-action="inc" data-index="${index}">+</button>
        </div>
      </div>
      <div class="mt-2 text-xs font-bold text-matcha" id="addon-subtotal-${index}">Subtotal: Rp ${fmt(subtotal)}</div>
    </div>`;
  }).join('');

  if(summaryEl){
    const basePrice = computeMenuUnitPrice(item);
    const addonsTotal = addons.reduce((sum, addon, index) => sum + (addon.unitPrice || 0) * (Number(quantities[index] || 0)), 0);
    summaryEl.textContent = `Harga per item: Rp ${fmt(basePrice + addonsTotal)} (base Rp ${fmt(basePrice)} + add-on Rp ${fmt(addonsTotal)})`;
  }

  renderAddonSummary();
}

function updateAddonSkipButton(){
  const btn = el('addon-skip-btn');
  if(!btn) return;
  if(!addonModalState){
    btn.disabled = true;
    btn.classList.add('opacity-50','cursor-not-allowed');
    return;
  }
  const canSkip = addonModalState.addons.every(addon => !addon.isRequired && (addon.minQuantity || 0) === 0);
  btn.disabled = !canSkip;
  btn.classList.toggle('opacity-50', !canSkip);
  btn.classList.toggle('cursor-not-allowed', !canSkip);
  btn.textContent = canSkip ? 'Tanpa Add-on' : 'Add-on wajib dipilih';
}

function setAddonError(message){
  const errorEl = el('addon-modal-error');
  if(!errorEl) return;
  if(message){
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

function adjustAddonQuantity(index, delta){
  if(!addonModalState) return;
  const addon = addonModalState.addons[index];
  if(!addon) return;

  const min = addon.minQuantity || 0;
  const max = addon.maxQuantity === null || addon.maxQuantity === undefined ? Infinity : addon.maxQuantity;
  const current = Number(addonModalState.quantities[index] ?? (addon.defaultQuantity ?? min) ?? 0);
  let next = current + delta;
  if(delta < 0){
    next = Math.max(min, next);
  }
  if(delta > 0){
    next = Math.min(max, next);
  }
  next = Math.max(min, Math.min(max, next));
  addonModalState.quantities[index] = next;
  updateAddonRow(index);
  setAddonError('');
  renderAddonSummary();
}

function updateAddonRow(index){
  if(!addonModalState) return;
  const qtyEl = el(`addon-qty-${index}`);
  const subtotalEl = el(`addon-subtotal-${index}`);
  const addon = addonModalState.addons[index];
  const qty = Number(addonModalState.quantities[index] || 0);
  if(qtyEl) qtyEl.textContent = qty;
  if(subtotalEl) subtotalEl.textContent = `Subtotal: Rp ${fmt(qty * (addon.unitPrice || 0))}`;
}

function renderAddonSummary(){
  if(!addonModalState) return;
  const summaryEl = el('addon-modal-summary');
  if(!summaryEl) return;
  const basePrice = computeMenuUnitPrice(addonModalState.item);
  const addonsTotal = addonModalState.addons.reduce((sum, addon, index) => sum + (addon.unitPrice || 0) * (Number(addonModalState.quantities[index] || 0)), 0);
  summaryEl.textContent = `Harga per item: Rp ${fmt(basePrice + addonsTotal)} (base Rp ${fmt(basePrice)} + add-on Rp ${fmt(addonsTotal)})`;
}

function handleAddonListClick(e){
  const button = e.target.closest('[data-addon-action]');
  if(!button) return;
  const index = Number(button.dataset.index);
  if(Number.isNaN(index)) return;
  const action = button.dataset.addonAction || button.getAttribute('data-addon-action');
  if(action === 'inc') adjustAddonQuantity(index, 1);
  if(action === 'dec') adjustAddonQuantity(index, -1);
}

function confirmAddonSelection(){
  if(!addonModalState) return;
  const { addons, quantities, item } = addonModalState;
  const selections = [];
  const errors = [];

  addons.forEach((addon, index) => {
    const qty = Number(quantities[index] || 0);
    if(addon.isRequired && qty < (addon.minQuantity || 0)){
      errors.push(`${addon.name} minimal ${addon.minQuantity}`);
    }
    if(addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity){
      errors.push(`${addon.name} maksimal ${addon.maxQuantity}`);
    }
    if(qty > 0){
      selections.push({
        id: addon.id,
        name: addon.name,
        quantity: qty,
        unitPrice: addon.unitPrice
      });
    }
  });

  if(errors.length){
    setAddonError(errors.join('\n'));
    return;
  }

  setAddonError('');
  const cartItem = buildCartItem(item, selections);
  addCartEntry(cartItem, 1);
  closeAddonModal();
}

function skipAddonSelection(){
  if(!addonModalState) return;
  const canSkip = addonModalState.addons.every(addon => !addon.isRequired && (addon.minQuantity || 0) === 0);
  if(!canSkip){
    setAddonError('Add-on wajib minimal harus dipenuhi.');
    return;
  }
  addonModalState.quantities = addonModalState.addons.map(() => 0);
  confirmAddonSelection();
}

function closeAddonModal(){
  const modal = el('addon-modal');
  if(modal){
    const container = modal.querySelector('.transform');
    if(container){
      container.classList.remove('opacity-100','scale-100');
      container.classList.add('opacity-0','scale-95');
    }
    setTimeout(() => {
      modal.classList.add('hidden');
      setAddonError('');
      addonModalState = null;
    }, 200);
  } else {
    addonModalState = null;
  }
}
function changeQty(cartKey, delta){
  const idx = CART.findIndex(i=>i.cartKey===cartKey);
  if(idx===-1) return;
  CART[idx].quantity = Math.max(0,(CART[idx].quantity||0)+delta);
  if(CART[idx].quantity===0) CART.splice(idx,1);
  renderCart();
}
function removeItem(cartKey){ CART = CART.filter(i=>i.cartKey!==cartKey); renderCart(); }

function calcTotals(){
  const subtotal = CART.reduce((sum,item)=> sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
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
  const cartCount = el('cart-count');
  
  // Update cart count
  const totalItems = CART.reduce((sum, i) => sum + i.quantity, 0);
  if(cartCount) cartCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
  
  if(CART.length===0){ 
    list.innerHTML='<div class="text-center py-12 text-sm text-charcoal/50"><div class="text-4xl mb-2">🛒</div><div class="font-semibold">Keranjang masih kosong</div><div class="text-xs mt-1">Tambahkan menu dari daftar</div></div>'; 
  }
  else{
    list.innerHTML = CART.map(i=>
      `<div class="flex items-start gap-2 p-3 rounded-xl bg-gradient-to-br from-cream/60 to-cream/40 border border-charcoal/10 hover:border-matcha/30 hover:shadow-sm transition-all">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm truncate text-charcoal">${i.name}</div>
          <div class="text-xs text-charcoal/60 mt-0.5">@ Rp ${fmt(i.price)} × ${i.quantity}</div>
          <div class="text-xs font-bold text-matcha mt-0.5">Subtotal: Rp ${fmt(i.price * i.quantity)}</div>
          ${formatAddonLines(i.addons || [])}
          ${i.notes ? `<div class="text-xs text-charcoal/70 mt-2 bg-white/90 px-2 py-1.5 rounded-lg border border-charcoal/10 flex items-start gap-1"><span class="flex-shrink-0">📝</span><span class="flex-1">${i.notes.replace(/</g,'&lt;')}</span></div>` : ''}
        </div>
        <div class="flex flex-col gap-1.5 flex-shrink-0">
          <div class="flex items-center gap-0.5 bg-white rounded-lg border-2 border-charcoal/10 shadow-sm">
            <button class="px-2 py-1 hover:bg-charcoal/5 rounded-l-lg transition-all active:scale-95 font-bold" onclick="changeQty('${i.cartKey}',-1)">−</button>
            <div class="w-7 text-center font-extrabold text-sm">${i.quantity}</div>
            <button class="px-2 py-1 hover:bg-matcha/10 rounded-r-lg transition-all active:scale-95 font-bold text-matcha" onclick="changeQty('${i.cartKey}',1)">+</button>
          </div>
          <div class="flex gap-1">
            <button class="px-2 py-1 text-xs hover:bg-white rounded-lg border border-charcoal/10 transition-all active:scale-95 shadow-sm" title="Catatan" onclick="editNote('${i.cartKey}')">📝</button>
            <button class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-all active:scale-95 shadow-sm" title="Hapus" onclick="removeItem('${i.cartKey}')">🗑</button>
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

function showNoteModal(cartKey) {
  currentEditingCartKey = cartKey;
  const modal = el('note-modal');
  const textarea = el('note-input');
  const item = CART.find(i => i.cartKey === cartKey);
  
  if (!modal || !textarea || !item) return;
  
  textarea.value = item.notes || '';
  
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.querySelector('.transform').classList.remove('opacity-0', 'scale-95');
    modal.querySelector('.transform').classList.add('opacity-100', 'scale-100');
    textarea.focus();
    textarea.select();
  });
}

function hideNoteModal() {
  const modal = el('note-modal');
  if (!modal) return;
  
  modal.querySelector('.transform').classList.remove('opacity-100', 'scale-100');
  modal.querySelector('.transform').classList.add('opacity-0', 'scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
    currentEditingCartKey = null; // Clear the key after closing
  }, 200);
}

function saveNote() {
  if (!currentEditingCartKey) return;
  
  const idx = CART.findIndex(i => i.cartKey === currentEditingCartKey);
  if (idx === -1) return;
  
  const textarea = el('note-input');
  CART[idx].notes = textarea.value.trim();
  
  renderCart();
  hideNoteModal();
}

function editNote(cartKey){
  showNoteModal(cartKey);
}

async function createOrder(){
  if(CART.length===0) return alert('Keranjang kosong');
  const t = calcTotals();
  const items = CART.map(i=>({
    id: i.id,
    name: i.name,
    price: Number(i.price),
    basePrice: Number(i.basePrice || i.price),
    quantity: i.quantity,
    notes: i.notes || undefined,
    addons: Array.isArray(i.addons) ? i.addons.map(addon => ({
      id: addon.id,
      name: addon.name,
      quantity: addon.quantity,
      unitPrice: addon.unitPrice
    })) : []
  }));
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
    showQRISModal(order, payment); // Show modal instead of small panel
    const expiresAt = new Date(payment.expiresAt).toLocaleTimeString('id-ID');
    panel.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-xs text-charcoal/60">Order <span class="font-mono font-bold">#${order.orderId}</span></div>
          <span id="status-badge-${order.orderId}" class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">⏳ PENDING</span>
        </div>
        <div class="text-lg font-extrabold text-matcha">Rp ${fmt(order.pricing.total)}</div>
        <div class="text-xs text-charcoal/60 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Kadaluarsa: ${expiresAt}</span>
        </div>
        <button class="w-full bg-blue-500 text-white rounded-lg py-2.5 font-bold hover:bg-blue-600 transition active:scale-95" onclick='showQRISModal(${JSON.stringify(order)}, ${JSON.stringify(payment)})'>
          🔍 Tampilkan QR Lagi
        </button>
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

function showQRISModal(order, payment) {
  const modal = el('qris-modal');
  const modalContent = el('qris-modal-content');
  if (!modal || !modalContent) return;

  const q = encodeURIComponent(payment.qrisCode);
  const expiresAt = new Date(payment.expiresAt).toLocaleTimeString('id-ID');

  modalContent.innerHTML = `
    <div class="bg-gradient-to-br from-matcha/5 to-peach/5 rounded-2xl p-6 flex flex-col items-center border-2 border-matcha/20 shadow-inner">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${q}&qzone=1" alt="QRIS" class="rounded-xl border-4 border-white shadow-lg" />
      <div class="text-3xl font-extrabold text-matcha mt-4">Rp ${fmt(order.pricing.total)}</div>
      <div class="text-sm text-charcoal/60 mt-1">Order <span class="font-mono font-bold">#${order.orderId}</span></div>
    </div>
    <div class="text-xs text-charcoal/60 mt-3 flex items-center justify-center gap-1.5">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>Berlaku hingga: <strong>${expiresAt}</strong></span>
    </div>
  `;

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.querySelector('.transform').classList.remove('opacity-0', 'scale-95');
    modal.querySelector('.transform').classList.add('opacity-100', 'scale-100');
  });
}

function hideQRISModal() {
  const modal = el('qris-modal');
  if (!modal) return;
  modal.querySelector('.transform').classList.remove('opacity-100', 'scale-100');
  modal.querySelector('.transform').classList.add('opacity-0', 'scale-95');
  setTimeout(() => modal.classList.add('hidden'), 200);
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
  // Search with clear button and debounce
  const searchInput = el('search-input');
  const clearBtn = el('clear-search');
  
  searchInput.addEventListener('input', (e) => {
    if(e.target.value.trim()){
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
    renderMenu();
    updateResultsCount();
  });
  
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    renderMenu();
    updateResultsCount();
    searchInput.focus();
  });
  
  // Refresh menu button
  el('refresh-menu')?.addEventListener('click', async () => {
    await loadMenu();
    renderMenu();
    updateResultsCount();
  });
  
  el('create-order-btn').addEventListener('click', createOrder);
  // Ensure create-order button reflects store open/closed state
  checkStoreState();
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
  
  // QRIS Modal listeners
  el('close-qris-modal')?.addEventListener('click', hideQRISModal);
  el('qris-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'qris-modal') {
      hideQRISModal();
    }
  });

  // Note Modal listeners
  el('save-note-btn')?.addEventListener('click', saveNote);
  el('cancel-note-btn')?.addEventListener('click', hideNoteModal);
  el('note-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'note-modal') {
      hideNoteModal();
    }
  });
  // Also allow saving with Ctrl+Enter in textarea
  el('note-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveNote();
    }
  });

  // Add-on modal listeners
  el('addon-modal-list')?.addEventListener('click', handleAddonListClick);
  el('addon-confirm-btn')?.addEventListener('click', (e) => { e.preventDefault(); confirmAddonSelection(); });
  el('addon-skip-btn')?.addEventListener('click', (e) => { e.preventDefault(); skipAddonSelection(); });
  el('close-addon-modal')?.addEventListener('click', closeAddonModal);
  el('addon-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'addon-modal') {
      closeAddonModal();
    }
  });

  // Unlock audio on any user interaction
  document.body.addEventListener('click', unlockAudio, {once: true});
}

// Check store state and disable cashier actions when closed
async function checkStoreState(){
  try{
    const res = await fetch('/api/tools/store-state');
    const j = await res.json();
    if(!j.success) return;
    const state = j.state || { open: true };
    const btn = el('create-order-btn');
    const draftIndicator = el('draft-indicator');
    if(btn){
      if(state.open){
        btn.disabled = false;
        btn.classList.remove('opacity-50','cursor-not-allowed');
      } else {
        btn.disabled = true;
        btn.classList.add('opacity-50','cursor-not-allowed');
      }
    }
    if(draftIndicator && !state.open){
      draftIndicator.textContent = `Toko tutup • ${state.message || ''}`;
    } else if(draftIndicator && state.open){
      // restore previously saved status text if present
      const raw = localStorage.getItem(DRAFT_KEY);
      if(raw){
        const data = JSON.parse(raw || '{}');
        updateDraftIndicator(true, data.ts);
      } else {
        updateDraftIndicator(false);
      }
    }
  }catch(e){ /* ignore network errors */ }
  // re-check periodically (every 8s) to keep UI in sync
  setTimeout(checkStoreState, 8000);
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
  CART = Array.isArray(data.cart)? data.cart.map(normalizeCartItem).filter(Boolean) : [];
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
  updateResultsCount();
  bindEvents();
})();
