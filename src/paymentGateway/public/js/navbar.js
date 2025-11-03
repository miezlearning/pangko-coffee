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
    { id: 'import', label: 'Import', href: '/import' },
    { id: 'search', label: 'Cari Order', href: '/search' },
    { id: 'webhook', label: 'Webhook Tester', href: '/webhook-tester' }
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
            <img src="https://media.discordapp.net/attachments/1403748644657828031/1434222820501487791/567458429_17844516144596099_4231043402342710190_n.jpg?ex=69078b96&is=69063a16&hm=501155baf10b69fcf042da9c625e7259b0cbf9e660fce9f608e542b884a46eb2&=&format=webp&width=805&height=805" alt="Pangko Coffee" class="h-14 w-14 rounded-full object-cover border-2 border-white shadow-sm sm:h-16 sm:w-16 md:h-20 md:w-20" />
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
