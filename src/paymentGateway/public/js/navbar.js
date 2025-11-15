// Shared Navigation Component
// This file provides a reusable navbar for all dashboard pages

/**
 * Generate navbar HTML
 * @param {string} activePage - Current active page (dashboard, analytics, menu, etc.)
 * @returns {string} HTML string for navbar
 */
function generateNavbar(activePage = 'dashboard') {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', href: '/' },
    { id: 'analytics', label: 'Statistik', href: '/analytics' },
    { id: 'menu', label: 'Menu', href: '/menu' },
    { id: 'search', label: 'Cari Order', href: '/search' },
    { id: 'tools', label: 'Tools', href: '/tools' }
  ];

  const navHTML = navItems.map(item => {
    const isActive = item.id === activePage;
    const activeClass = isActive 
      ? 'bg-matcha text-white shadow-md' 
      : 'text-charcoal hover:bg-matcha/10 hover:text-matcha';
    const ariaCurrent = isActive ? 'aria-current="page"' : '';
    
    return `<a href="${item.href}" class="rounded-xl px-4 py-2 transition-all ${activeClass}" ${ariaCurrent}>${item.label}</a>`;
  }).join('\n            ');

  return `
    <nav id="app-navbar" class="fixed inset-x-0 top-0 z-50 py-3">
      <div class="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between gap-4 rounded-2xl border border-white/50 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-300 sm:px-6">
          <!-- Logo & Brand -->
          <div class="flex items-center gap-3 min-w-0">
            <img src="https://i.imgur.com/KJIUltC.jpeg" alt="Pangko Coffee" class="h-12 w-12 flex-shrink-0 rounded-full object-cover border-2 border-white shadow-md sm:h-14 sm:w-14" />
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] uppercase tracking-wider text-matcha font-bold sm:text-xs">Pangko Coffee</span>
              <strong class="text-xs text-charcoal truncate sm:text-sm">Simple coffee, gentle taste.</strong>
            </div>
          </div>
          
          <!-- Desktop Navigation -->
          <div class="hidden lg:flex items-center gap-2 text-xs font-bold">
            ${navHTML}
          </div>
          
          <!-- Store Controls (Desktop) -->
          <div id="store-controls" class="hidden lg:flex items-center gap-3 flex-shrink-0"></div>
          
          <!-- Mobile menu button -->
          <button id="nav-mobile-toggle" class="lg:hidden inline-flex items-center justify-center rounded-xl border-2 border-matcha/40 bg-white px-3 py-2 text-sm font-bold text-matcha shadow-sm transition-all hover:bg-matcha/10" aria-label="Buka menu">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        
        <!-- Mobile dropdown menu -->
        <div id="nav-mobile-menu" class="lg:hidden mt-3 hidden rounded-2xl border border-white/50 bg-white/95 backdrop-blur-md shadow-xl overflow-hidden">
          <div class="flex flex-col p-3">
            <div class="flex flex-col gap-1.5 pb-3 border-b border-charcoal/10">
              ${navItems.map(item => {
                const isActive = item.id === activePage;
                const activeClass = isActive ? 'bg-matcha text-white shadow-sm' : 'hover:bg-matcha/10 text-charcoal';
                const ariaCurrent = isActive ? 'aria-current="page"' : '';
                return `<a href="${item.href}" class="rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${activeClass}" ${ariaCurrent}>${item.label}</a>`;
              }).join('')}
            </div>
            <div id="store-controls-mobile" class="pt-3"></div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

/**
 * Initialize navbar on page load
 * Call this function in your page with the active page identifier
 * @param {string} activePage - Current active page identifier
 */
function initNavbar(activePage = 'dashboard') {
  // Find navbar container or create one
  let navContainer = document.getElementById('navbar-container');
  
  if (!navContainer) {
    // If no container exists, insert at the beginning of body
    const body = document.body;
    navContainer = document.createElement('div');
    navContainer.id = 'navbar-container';
    body.insertBefore(navContainer, body.firstChild);
  }
  
  // Insert navbar HTML
  navContainer.innerHTML = generateNavbar(activePage);
  // Initialize store controls
  initStoreControls();
  
  // Add scroll effect for navbar (optional enhancement)
  addScrollEffect();

  // Wire mobile menu toggle
  const toggleBtn = document.getElementById('nav-mobile-toggle');
  const mobileMenu = document.getElementById('nav-mobile-menu');
  if (toggleBtn && mobileMenu) {
    toggleBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!mobileMenu.classList.contains('hidden')) {
        const within = mobileMenu.contains(e.target) || toggleBtn.contains(e.target);
        if (!within) mobileMenu.classList.add('hidden');
      }
    });
  }
}

// Render store controls and wire actions
function initStoreControls(){
  const container = document.getElementById('store-controls');
  const containerMobile = document.getElementById('store-controls-mobile');
  if(!container) return;

  // Build initial skeleton
  const skeletonHTML = `
    <div id="store-status-pill" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 shadow-sm">Memuat...</div>
    <div id="store-actions" class="flex items-center gap-2"></div>
  `;
  container.innerHTML = skeletonHTML;
  if(containerMobile) containerMobile.innerHTML = skeletonHTML.replace('store-status-pill', 'store-status-pill-mobile').replace('store-actions', 'store-actions-mobile');

  async function refresh(){
    try{
      const r = await fetch('/api/tools/store-state');
      const j = await r.json();
      if(!j.success) throw new Error('no');
      const state = j.state || { open:true };
      const pill = document.getElementById('store-status-pill');
      const pillMobile = document.getElementById('store-status-pill-mobile');
      const actions = document.getElementById('store-actions');
      const actionsMobile = document.getElementById('store-actions-mobile');
      
      if(state.open){
        const pillClass = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-green-100 text-green-700 shadow-sm';
        const pillText = '🟢 OPEN';
        const actionsHTML = `<button id="btn-close-store" class="rounded-xl px-3 py-1.5 text-xs font-bold border-2 border-red-200 bg-white text-red-600 transition-all hover:bg-red-50 shadow-sm">Tutup Toko</button>`;
        
        if(pill) { pill.textContent = pillText; pill.className = pillClass; }
        if(pillMobile) { pillMobile.textContent = pillText; pillMobile.className = pillClass; }
        if(actions) actions.innerHTML = actionsHTML;
        if(actionsMobile) actionsMobile.innerHTML = actionsHTML.replace('btn-close-store', 'btn-close-store-mobile');
        syncHeroStoreState(true);
      } else {
        const pillClass = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-red-100 text-red-700 shadow-sm';
        const pillText = '🔴 CLOSED';
        const actionsHTML = `<button id="btn-open-store" class="rounded-xl px-3 py-1.5 text-xs font-bold border-2 border-green-200 bg-white text-green-600 transition-all hover:bg-green-50 shadow-sm">Buka Toko</button>`;
        
        if(pill) { pill.textContent = pillText; pill.className = pillClass; }
        if(pillMobile) { pillMobile.textContent = pillText; pillMobile.className = pillClass; }
        if(actions) actions.innerHTML = actionsHTML;
        if(actionsMobile) actionsMobile.innerHTML = actionsHTML.replace('btn-open-store', 'btn-open-store-mobile');
        syncHeroStoreState(false);
      }

      // Wire buttons (both desktop and mobile)
      const btnOpen = document.getElementById('btn-open-store');
      const btnClose = document.getElementById('btn-close-store');
      const btnOpenMobile = document.getElementById('btn-open-store-mobile');
      const btnCloseMobile = document.getElementById('btn-close-store-mobile');
      
      if(btnOpen) btnOpen.addEventListener('click', () => toggleStore(true));
      if(btnClose) btnClose.addEventListener('click', () => {
        const reason = prompt('Alasan tutup (opsional):') || '';
        toggleStore(false, reason);
      });
      if(btnOpenMobile) btnOpenMobile.addEventListener('click', () => toggleStore(true));
      if(btnCloseMobile) btnCloseMobile.addEventListener('click', () => {
        const reason = prompt('Alasan tutup (opsional):') || '';
        toggleStore(false, reason);
      });

    }catch(e){
      // ignore
    }
  }

  async function toggleStore(open, message){
    try{
      const body = { open: !!open, message: message || null, updatedBy: 'dashboard' };
      const res = await fetch('/api/tools/store-open',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const j = await res.json();
      if(!j.success) return alert('Gagal mengubah status toko: '+(j.message||'unknown'));
      // Refresh UI
      refresh();
      // Notify user briefly
      const pill = document.getElementById('store-status-pill');
      if(pill) pill.animate([{opacity:0.6},{opacity:1}],{duration:400,iterations:1});
    }catch(e){
      alert('Gagal mengubah status toko: '+(e && e.message));
    }
  }

  // Initial load + periodic refresh every 8s
  refresh();
  setInterval(refresh, 8000);
}

function syncHeroStoreState(isOpen){
  const badge = document.getElementById('store-state-badge');
  const chip = document.getElementById('store-state-chip');
  const indicator = document.getElementById('store-state-indicator');
  if(!badge || !chip || !indicator) return;
  if(isOpen){
    badge.className = 'inline-flex items-center gap-2 rounded-full bg-matcha/15 px-3 py-1 text-xs font-semibold text-matcha';
    indicator.className = 'h-2 w-2 rounded-full bg-matcha';
    chip.textContent = 'Buka';
  } else {
    badge.className = 'inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600';
    indicator.className = 'h-2 w-2 rounded-full bg-red-500';
    chip.textContent = 'Tutup';
  }
}

/**
 * Add scroll effect to navbar
 * Makes navbar background more solid on scroll
 */
function addScrollEffect() {
  let lastScroll = 0;
  const navbar = document.getElementById('app-navbar');
  
  if (!navbar) return;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 50) {
      navbar.querySelector('div > div').classList.add('bg-white/95', 'shadow-xl');
      navbar.querySelector('div > div').classList.remove('bg-white/80', 'shadow-lg');
    } else {
      navbar.querySelector('div > div').classList.remove('bg-white/95', 'shadow-xl');
      navbar.querySelector('div > div').classList.add('bg-white/80', 'shadow-lg');
    }
    
    lastScroll = currentScroll;
  });
}

// Auto-initialize if data-page attribute exists on body
document.addEventListener('DOMContentLoaded', () => {
  const activePage = document.body.getAttribute('data-page');
  if (activePage) {
    initNavbar(activePage);
  }
});

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateNavbar, initNavbar };
}
