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
      ? 'bg-matcha text-white' 
      : 'hover:bg-matcha hover:text-white';
    const ariaCurrent = isActive ? 'aria-current="page"' : '';
    
    return `<a href="${item.href}" class="rounded-full px-4 py-2 transition ${activeClass}" ${ariaCurrent}>${item.label}</a>`;
  }).join('\n            ');

  return `
    <nav id="app-navbar" class="fixed inset-x-0 top-0 z-50 py-4">
      <div class="mx-auto w-full max-w-[1180px] px-5">
        <div class="flex items-center justify-between rounded-2xl border border-white/40 bg-white/60 px-6 py-3 backdrop-blur transition-all duration-300">
          <div class="flex items-center gap-3">
            <img src="https://i.imgur.com/KJIUltC.jpeg" alt="Pangko Coffee" class="h-14 w-14 rounded-full object-cover border-2 border-white shadow-sm sm:h-16 sm:w-16 md:h-20 md:w-20" />
            <div class="flex flex-col">
              <span class="text-sm uppercase tracking-[0.18em] text-matcha">Pangko Coffee</span>
              <strong class="text-base">Simple coffee, gentle taste.</strong>
            </div>
          </div>
          <div class="hidden items-center gap-5 text-sm font-semibold sm:flex">
            ${navHTML}
          </div>
          <div id="store-controls" class="ml-4 hidden sm:flex items-center gap-3"></div>
          <!-- Mobile menu button -->
          <button id="nav-mobile-toggle" class="sm:hidden inline-flex items-center justify-center rounded-full border border-matcha/40 bg-white/80 px-3 py-2 text-sm font-semibold text-matcha shadow-sm" aria-label="Buka menu">
            ☰
          </button>
        </div>
        <!-- Mobile dropdown menu -->
        <div id="nav-mobile-menu" class="sm:hidden mt-2 hidden rounded-2xl border border-white/40 bg-white/90 px-4 py-3 text-sm font-semibold shadow">
          <div class="flex flex-col gap-2">
            ${navItems.map(item => {
              const isActive = item.id === activePage;
              const activeClass = isActive ? 'bg-matcha text-white' : 'hover:bg-matcha hover:text-white';
              const ariaCurrent = isActive ? 'aria-current="page"' : '';
              return `<a href="${item.href}" class="rounded-full px-4 py-2 transition ${activeClass}" ${ariaCurrent}>${item.label}</a>`;
            }).join('')}
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
  if(!container) return;

  // Build initial skeleton
  container.innerHTML = `
    <div id="store-status-pill" class="px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">Memuat...</div>
    <div id="store-actions" class="flex items-center gap-2"></div>
  `;

  async function refresh(){
    try{
      const r = await fetch('/api/tools/store-state');
      const j = await r.json();
      if(!j.success) throw new Error('no');
      const state = j.state || { open:true };
      const pill = document.getElementById('store-status-pill');
      const actions = document.getElementById('store-actions');
      if(!pill || !actions) return;
      if(state.open){
        pill.textContent = '🟢 OPEN';
        pill.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800';
        actions.innerHTML = `<button id="btn-close-store" class="rounded-full px-3 py-1 text-sm font-semibold border border-red-200 bg-white text-red-600">Tutup Toko</button>`;
        syncHeroStoreState(true);
      } else {
        pill.textContent = '🔴 CLOSED';
        pill.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700';
        actions.innerHTML = `<button id="btn-open-store" class="rounded-full px-3 py-1 text-sm font-semibold border border-green-200 bg-white text-green-600">Buka Toko</button>`;
        syncHeroStoreState(false);
      }

      // Wire buttons
      const btnOpen = document.getElementById('btn-open-store');
      const btnClose = document.getElementById('btn-close-store');
      if(btnOpen) btnOpen.addEventListener('click', () => toggleStore(true));
      if(btnClose) btnClose.addEventListener('click', () => {
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
      navbar.querySelector('div > div').classList.add('bg-white/80', 'shadow-lg');
      navbar.querySelector('div > div').classList.remove('bg-white/60');
    } else {
      navbar.querySelector('div > div').classList.remove('bg-white/80', 'shadow-lg');
      navbar.querySelector('div > div').classList.add('bg-white/60');
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
