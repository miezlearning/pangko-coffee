// Menu Management JavaScript

let currentCategory = 'all';
let deleteItemId = null;

// Load menu items on page load
document.addEventListener('DOMContentLoaded', () => {
  loadMenuItems();
});

// Load menu items from API
async function loadMenuItems(category = 'all') {
  try {
    currentCategory = category;
    
    const url = category === 'all' 
      ? '/api/menu/items' 
      : `/api/menu/items?category=${category}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success) {
      displayMenuItems(data.items);
    } else {
      showError('Gagal memuat menu items');
    }
  } catch (error) {
    console.error('Failed to load menu items:', error);
    showError('Gagal memuat menu items');
  }
}

// Display menu items in table
function displayMenuItems(items) {
  const tbody = document.getElementById('menu-items-tbody');
  const emptyState = document.getElementById('empty-state');
  
  if (!items || items.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-matcha/5 transition-all">
      <td class="px-6 py-4">
        <span class="font-mono text-sm font-bold text-matcha bg-matcha/10 px-3 py-1 rounded-lg">${item.id}</span>
      </td>
      <td class="px-6 py-4">
        <div>
          <div class="font-semibold text-charcoal">${item.name}</div>
          ${item.description ? `<div class="text-sm text-charcoal/60 mt-1">${item.description}</div>` : ''}
        </div>
      </td>
      <td class="px-6 py-4">
        <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${getCategoryBadgeClass(item.category)}">
          ${getCategoryLabel(item.category)}
        </span>
      </td>
      <td class="px-6 py-4">
        <span class="font-semibold text-charcoal">Rp ${formatNumber(item.price)}</span>
      </td>
      <td class="px-6 py-4">
        ${item.available 
          ? '<span class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-100 text-green-700 border border-green-200">✓ Tersedia</span>'
          : '<span class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700 border border-red-200">✗ Habis</span>'
        }
      </td>
      <td class="px-6 py-4">
        <div class="flex items-center gap-2">
          <button onclick='editItem(${JSON.stringify(item)})' class="px-4 py-2 text-sm font-semibold text-matcha hover:bg-matcha/10 rounded-lg transition-all border border-matcha/20 hover:border-matcha/40">
            Edit
          </button>
          <button onclick="openDeleteModal('${item.id}', '${item.name}')" class="px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-all border border-red-200 hover:border-red-300">
            Hapus
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Get category badge class
function getCategoryBadgeClass(category) {
  switch (category) {
    case 'coffee':
      return 'bg-matcha/20 text-matcha border border-matcha/30';
    case 'nonCoffee':
      return 'bg-blue-100 text-blue-700 border border-blue-200';
    case 'food':
      return 'bg-peach/40 text-amber-800 border border-amber-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

// Get category label
function getCategoryLabel(category) {
  switch (category) {
    case 'coffee':
      return '☕ Kopi';
    case 'nonCoffee':
      return '🥤 Non-Kopi';
    case 'food':
      return '🍰 Makanan';
    default:
      return category;
  }
}

// Filter by category
function filterCategory(category) {
  // Update active tab
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.remove('active', 'bg-matcha', 'text-white', 'shadow-md');
    tab.classList.add('text-charcoal/70', 'hover:text-charcoal', 'hover:bg-matcha/10');
  });
  
  event.target.classList.remove('text-charcoal/70', 'hover:text-charcoal', 'hover:bg-matcha/10');
  event.target.classList.add('active', 'bg-matcha', 'text-white', 'shadow-md');
  
  loadMenuItems(category);
}

// Open add item modal
function openAddItemModal() {
  document.getElementById('modal-title').textContent = 'Tambah Item Menu';
  document.getElementById('item-form').reset();
  document.getElementById('item-edit-mode').value = 'false';
  document.getElementById('item-id').readOnly = false;
  document.getElementById('item-modal').classList.remove('hidden');
}

// Close item modal
function closeItemModal() {
  document.getElementById('item-modal').classList.add('hidden');
}

// Edit item
function editItem(item) {
  document.getElementById('modal-title').textContent = 'Edit Item Menu';
  document.getElementById('item-id').value = item.id;
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-category').value = item.category;
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-description').value = item.description || '';
  document.getElementById('item-available').checked = item.available;
  document.getElementById('item-edit-mode').value = 'true';
  document.getElementById('item-original-id').value = item.id;
  document.getElementById('item-id').readOnly = true;
  document.getElementById('item-modal').classList.remove('hidden');
}

// Save item
async function saveItem(event) {
  event.preventDefault();
  
  const itemData = {
    id: document.getElementById('item-id').value.trim().toUpperCase(),
    name: document.getElementById('item-name').value.trim(),
    category: document.getElementById('item-category').value,
    price: parseInt(document.getElementById('item-price').value),
    description: document.getElementById('item-description').value.trim() || null,
    available: document.getElementById('item-available').checked
  };
  
  try {
    const response = await fetch('/api/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      closeItemModal();
      loadMenuItems(currentCategory);
      showSuccess(result.message || 'Item berhasil disimpan');
    } else {
      showError(result.error || 'Gagal menyimpan item');
    }
  } catch (error) {
    console.error('Failed to save item:', error);
    showError('Gagal menyimpan item');
  }
}

// Open delete modal
function openDeleteModal(itemId, itemName) {
  deleteItemId = itemId;
  document.getElementById('delete-item-name').textContent = itemName;
  document.getElementById('delete-modal').classList.remove('hidden');
}

// Close delete modal
function closeDeleteModal() {
  deleteItemId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

// Confirm delete
async function confirmDelete() {
  if (!deleteItemId) return;
  
  try {
    const response = await fetch(`/api/menu/items/${deleteItemId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      closeDeleteModal();
      loadMenuItems(currentCategory);
      showSuccess(result.message || 'Item berhasil dihapus');
    } else {
      showError(result.error || 'Gagal menghapus item');
    }
  } catch (error) {
    console.error('Failed to delete item:', error);
    showError('Gagal menghapus item');
  }
}

// Show success notification
function showSuccess(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-24 right-5 bg-matcha text-white px-6 py-4 rounded-2xl shadow-2xl z-50 font-semibold flex items-center gap-3 animate-slide-in';
  toast.innerHTML = `
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Show error notification
function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-24 right-5 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 font-semibold flex items-center gap-3 animate-slide-in';
  toast.innerHTML = `
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Format number with thousand separator
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
