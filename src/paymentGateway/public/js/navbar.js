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
          <div class="sm:hidden flex items-center gap-2">
            <a href="/search" class="rounded-full border border-matcha/40 bg-white/80 px-4 py-2 text-sm font-semibold text-matcha shadow-sm">Cari →</a>
            <a href="/analytics" class="rounded-full border border-matcha/40 bg-white/80 px-4 py-2 text-sm font-semibold text-matcha shadow-sm">Analisis →</a>
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
  
  // Add scroll effect for navbar (optional enhancement)
  addScrollEffect();
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
