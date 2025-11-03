// Menu Management JavaScript

let currentCategory = 'all';
let deleteItemId = null;

// Removed - moved to bottom with image preview listener

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
  
  tbody.innerHTML = items.map(item => {
    const finalPrice = item.discount_percent > 0 
      ? item.price - (item.price * item.discount_percent / 100) 
      : item.price;
    
    return `
    <tr class="hover:bg-matcha/5 transition-all">
      <td class="px-4 py-4">
        <div class="w-16 h-16 rounded-xl overflow-hidden bg-charcoal/5 border border-charcoal/10 flex items-center justify-center">
          ${item.image 
            ? `<img src="${item.image}" alt="${item.name}" class="w-full h-full object-cover" onerror="this.style.display='none'">` 
            : '<span class="text-2xl">📦</span>'}
        </div>
      </td>
      <td class="px-4 py-4">
        <div>
          <div class="font-semibold text-charcoal">${item.name}</div>
          ${item.description ? `<div class="text-xs text-charcoal/60 mt-1 line-clamp-1">${item.description}</div>` : ''}
          ${item.rack_location ? `<div class="text-xs text-blue-600 mt-1">📍 ${item.rack_location}</div>` : ''}
        </div>
      </td>
      <td class="px-4 py-4">
        <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${getTypeBadgeClass(item.item_type)}">
          ${getTypeLabel(item.item_type)}
        </span>
      </td>
      <td class="px-4 py-4">
        <span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${getCategoryBadgeClass(item.category)}">
          ${getCategoryLabel(item.category)}
        </span>
      </td>
      <td class="px-4 py-4">
        <div class="font-semibold text-charcoal">
          ${item.discount_percent > 0 
            ? `<div class="text-xs text-red-600 line-through">Rp ${formatNumber(item.price)}</div>
               <div class="text-sm text-matcha">Rp ${formatNumber(finalPrice)}</div>
               <div class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded inline-block mt-1">-${item.discount_percent}%</div>`
            : `<span class="text-sm">Rp ${formatNumber(item.price)}</span>`
          }
        </div>
      </td>
      <td class="px-4 py-4">
        ${item.use_stock 
          ? `<div class="text-sm font-semibold ${item.stock_quantity > 0 ? 'text-green-700' : 'text-red-600'}">
               ${item.stock_quantity} ${item.unit || 'pcs'}
             </div>`
          : '<span class="text-xs text-charcoal/40">-</span>'
        }
      </td>
      <td class="px-4 py-4">
        <div class="flex flex-col gap-1">
          ${item.available 
            ? '<span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 border border-green-200">✓ Tersedia</span>'
            : '<span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 border border-red-200">✗ Habis</span>'
          }
          ${!item.show_in_transaction 
            ? '<span class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">🔒 Hidden</span>'
            : ''
          }
        </div>
      </td>
      <td class="px-4 py-4">
        <div class="flex items-center gap-2">
          <button onclick='editItem(${JSON.stringify(item).replace(/'/g, "\\'")})' class="px-3 py-2 text-xs font-semibold text-matcha hover:bg-matcha/10 rounded-lg transition-all border border-matcha/20">
            Edit
          </button>
          <button onclick="openDeleteModal('${item.id}', '${item.name}')" class="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-all border border-red-200">
            Hapus
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

// Get type badge class
function getTypeBadgeClass(type) {
  switch (type) {
    case 'product':
      return 'bg-purple-100 text-purple-700 border border-purple-200';
    case 'ingredient':
      return 'bg-orange-100 text-orange-700 border border-orange-200';
    case 'packaging':
      return 'bg-teal-100 text-teal-700 border border-teal-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

// Get type label
function getTypeLabel(type) {
  switch (type) {
    case 'product':
      return '🍵 Produk';
    case 'ingredient':
      return '🧃 Bahan';
    case 'packaging':
      return '📦 Kemasan';
    default:
      return type || 'product';
  }
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
  document.getElementById('item-type').value = item.item_type || 'product';
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-discount').value = item.discount_percent || 0;
  document.getElementById('item-weight').value = item.weight || 0;
  document.getElementById('item-unit').value = item.unit || 'pcs';
  document.getElementById('item-stock').value = item.stock_quantity || 0;
  document.getElementById('item-rack').value = item.rack_location || '';
  document.getElementById('item-description').value = item.description || '';
  document.getElementById('item-notes').value = item.notes || '';
  document.getElementById('item-image').value = item.image || '';
  document.getElementById('item-available').checked = item.available;
  document.getElementById('item-use-stock').checked = item.use_stock;
  document.getElementById('item-show-transaction').checked = item.show_in_transaction !== false;
  document.getElementById('item-edit-mode').value = 'true';
  document.getElementById('item-original-id').value = item.id;
  document.getElementById('item-id').readOnly = true;
  
  // Update image preview
  updateImagePreview(item.image);
  
  document.getElementById('item-modal').classList.remove('hidden');
}

// Update image preview
function updateImagePreview(imageUrl) {
  const preview = document.getElementById('image-preview');
  if (imageUrl) {
    preview.innerHTML = `<img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
  } else {
    preview.innerHTML = '<span class="text-charcoal/30 text-xs">No Image</span>';
  }
}

// Listen to image input change
document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('item-image');
  if (imageInput) {
    imageInput.addEventListener('input', (e) => {
      updateImagePreview(e.target.value);
    });
  }
  
  loadMenuItems();
});

// Save item
async function saveItem(event) {
  event.preventDefault();
  
  const itemData = {
    id: document.getElementById('item-id').value.trim().toUpperCase(),
    name: document.getElementById('item-name').value.trim(),
    category: document.getElementById('item-category').value,
    item_type: document.getElementById('item-type').value,
    price: parseInt(document.getElementById('item-price').value),
    discount_percent: parseFloat(document.getElementById('item-discount').value) || 0,
    weight: parseFloat(document.getElementById('item-weight').value) || 0,
    unit: document.getElementById('item-unit').value,
    stock_quantity: parseInt(document.getElementById('item-stock').value) || 0,
    rack_location: document.getElementById('item-rack').value.trim() || null,
    description: document.getElementById('item-description').value.trim() || null,
    notes: document.getElementById('item-notes').value.trim() || null,
    image: document.getElementById('item-image').value.trim() || null,
    available: document.getElementById('item-available').checked,
    use_stock: document.getElementById('item-use-stock').checked,
    show_in_transaction: document.getElementById('item-show-transaction').checked
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
