// Menu Management JavaScript

let currentCategory = 'all';
let deleteItemId = null;
let ADDONS = [];
let editingAddonId = null;

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
          ${item.addons && item.addons.length
            ? `<div class="text-[11px] mt-2 inline-flex items-center gap-1 rounded-full bg-matcha/10 text-matcha px-2 py-0.5 font-semibold">
                 🍧 ${item.addons.length} add-on
               </div>`
            : ''}
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
              ${item.basePrice && Number(item.basePrice) > Number(item.price)
                ? `<div class="text-xs text-red-500 line-through">Rp ${formatNumber(item.basePrice)}</div>
                   <div class="text-sm">Rp ${formatNumber(item.price)}</div>`
                : `<div class="text-sm">Rp ${formatNumber(item.price)}</div>`
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

async function loadAddons() {
  try {
    const response = await fetch('/api/menu/addons');
    const data = await response.json();
    if (data.success) {
      ADDONS = (data.addons || []).map(addon => ({
        ...addon,
        price: Number(addon.price || 0),
        isActive: addon.isActive !== undefined ? addon.isActive : addon.is_active === 1
      }));
      renderAddonManagerList();
      renderItemAddonOptions(collectSelectedAddons());
    } else {
      showError(data.error || 'Gagal memuat add-on');
    }
  } catch (error) {
    console.error('Failed to load add-ons:', error);
    showError('Gagal memuat add-on');
  }
}

function renderAddonManagerList() {
  const listEl = document.getElementById('addon-list');
  const emptyEl = document.getElementById('addon-empty');
  const countEl = document.getElementById('addon-count');

  if (!listEl) return;

  if (!ADDONS.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (countEl) countEl.textContent = '0 add-on';
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');
  if (countEl) countEl.textContent = `${ADDONS.length} add-on`;

  listEl.innerHTML = ADDONS.map(addon => {
    const statusBadge = addon.isActive
      ? '<span class="text-[11px] font-semibold text-matcha bg-matcha/10 px-2 py-0.5 rounded-full">Aktif</span>'
      : '<span class="text-[11px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Nonaktif</span>';

    return `
      <div class="px-4 py-3 hover:bg-matcha/5 flex items-start justify-between gap-4" data-addon-id="${addon.id}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-sm font-semibold text-charcoal">${addon.name}</div>
            ${statusBadge}
          </div>
          <div class="text-xs text-charcoal/50 mt-1">ID: ${addon.id}</div>
          <div class="text-xs text-charcoal/70 mt-1">Harga: Rp ${formatNumber(addon.price)}</div>
          ${addon.description ? `<div class="text-xs text-charcoal/60 mt-1">${addon.description}</div>` : ''}
        </div>
        <div class="flex flex-col gap-2 text-xs font-semibold">
          <button class="px-3 py-1 rounded-lg border border-matcha/30 text-matcha hover:bg-matcha/10 transition" onclick="editAddon('${addon.id}')">Edit</button>
          <button class="px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition" onclick="confirmDeleteAddon('${addon.id}')">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

function openAddonManagerModal() {
  const modal = document.getElementById('addon-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
}

function closeAddonManagerModal() {
  const modal = document.getElementById('addon-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  resetAddonForm();
}

function resetAddonForm() {
  const form = document.getElementById('addon-form');
  if (!form) return;
  form.reset();
  editingAddonId = null;
  const title = document.getElementById('addon-form-title');
  if (title) title.textContent = 'Tambah Add-on';
  const idField = document.getElementById('addon-id');
  if (idField) idField.readOnly = false;
  const editFlag = document.getElementById('addon-edit-mode');
  if (editFlag) editFlag.value = 'false';
  const activeField = document.getElementById('addon-active');
  if (activeField) activeField.checked = true;
}

async function saveAddon(event) {
  event.preventDefault();
  const id = document.getElementById('addon-id').value.trim().toUpperCase();
  const name = document.getElementById('addon-name').value.trim();
  const price = Number(document.getElementById('addon-price').value);
  const description = document.getElementById('addon-description').value.trim();
  const isActive = document.getElementById('addon-active').checked;

  if (!id || !name || Number.isNaN(price) || price < 0) {
    showError('ID, nama, dan harga add-on wajib diisi');
    return;
  }

  try {
    const currentSelections = collectSelectedAddons();
    const response = await fetch('/api/menu/addons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        price: Math.round(price),
        description: description || null,
        is_active: isActive
      })
    });

    const data = await response.json();
    if (data.success) {
      await loadAddons();
      renderItemAddonOptions(currentSelections);
      resetAddonForm();
      showSuccess(data.message || 'Add-on disimpan');
    } else {
      showError(data.error || 'Gagal menyimpan add-on');
    }
  } catch (error) {
    console.error('Failed to save addon:', error);
    showError('Gagal menyimpan add-on');
  }
}

function editAddon(addonId) {
  const addon = ADDONS.find(a => a.id === addonId);
  if (!addon) return;
  editingAddonId = addon.id;
  const title = document.getElementById('addon-form-title');
  if (title) title.textContent = 'Edit Add-on';

  document.getElementById('addon-id').value = addon.id;
  document.getElementById('addon-id').readOnly = true;
  document.getElementById('addon-name').value = addon.name;
  document.getElementById('addon-price').value = addon.price || 0;
  document.getElementById('addon-description').value = addon.description || '';
  document.getElementById('addon-active').checked = addon.isActive !== false;
  document.getElementById('addon-edit-mode').value = 'true';
}

async function confirmDeleteAddon(addonId) {
  const addon = ADDONS.find(a => a.id === addonId);
  if (!addon) return;
  const confirmed = confirm(`Hapus add-on ${addon.name}?`);
  if (!confirmed) return;

  try {
    const currentSelections = collectSelectedAddons();
    const response = await fetch(`/api/menu/addons/${addonId}`, { method: 'DELETE' });
    const data = await response.json();
    if (data.success) {
      await loadAddons();
      renderItemAddonOptions(currentSelections.filter(addon => addon.id !== addonId));
      showSuccess(data.message || 'Add-on dihapus');
    } else {
      showError(data.error || 'Gagal menghapus add-on');
    }
  } catch (error) {
    console.error('Failed to delete addon:', error);
    showError('Gagal menghapus add-on');
  }
}

function renderItemAddonOptions(selected = []) {
  const container = document.getElementById('item-addon-options');
  const emptyState = document.getElementById('item-addon-empty');
  const warning = document.getElementById('addon-warning');
  if (!container) return;

  const selectedMap = Array.isArray(selected)
    ? selected.reduce((map, addon) => {
        if (addon && addon.id) map[addon.id] = addon;
        return map;
      }, {})
    : {};

  if (!ADDONS.length) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    if (warning) warning.classList.add('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = ADDONS.map((addon, index) => {
    const selectedAddon = selectedMap[addon.id];
    const enabled = !!selectedAddon;
    const minQuantity = selectedAddon ? selectedAddon.minQuantity ?? 0 : 0;
    const maxQuantity = selectedAddon ? selectedAddon.maxQuantity ?? 1 : 1;
    const defaultQuantity = selectedAddon ? selectedAddon.defaultQuantity ?? 0 : 0;
    const priceOverride = selectedAddon && selectedAddon.priceOverride !== undefined && selectedAddon.priceOverride !== null
      ? selectedAddon.priceOverride
      : '';
    const isRequired = selectedAddon ? !!selectedAddon.isRequired : false;
    const sortOrder = selectedAddon ? selectedAddon.sortOrder ?? index : index;

    return `
      <div class="border border-charcoal/10 rounded-xl p-4 bg-white/90 hover:border-matcha/40 transition" data-addon-card data-addon-id="${addon.id}" data-sort-order="${sortOrder}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <label class="inline-flex items-center gap-2 text-sm font-semibold text-charcoal">
              <input type="checkbox" class="addon-enable h-4 w-4 text-matcha rounded" ${enabled ? 'checked' : ''}>
              <span>${addon.name}</span>
            </label>
            <div class="text-xs text-charcoal/50 mt-1">ID: ${addon.id}</div>
          </div>
          <div class="text-xs font-semibold text-matcha">Rp ${formatNumber(addon.price || 0)}</div>
        </div>
        ${addon.description ? `<div class="text-xs text-charcoal/60 mt-2">${addon.description}</div>` : ''}
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label class="block text-[10px] font-semibold text-charcoal mb-1">Minimal</label>
            <input type="number" class="addon-min w-full rounded-lg border border-charcoal/15 px-2 py-1 text-xs" min="0" value="${minQuantity}">
          </div>
          <div>
            <label class="block text-[10px] font-semibold text-charcoal mb-1">Maksimal</label>
            <input type="number" class="addon-max w-full rounded-lg border border-charcoal/15 px-2 py-1 text-xs" min="0" value="${maxQuantity}">
          </div>
          <div>
            <label class="block text-[10px] font-semibold text-charcoal mb-1">Default</label>
            <input type="number" class="addon-default w-full rounded-lg border border-charcoal/15 px-2 py-1 text-xs" min="0" value="${defaultQuantity}">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label class="block text-[10px] font-semibold text-charcoal mb-1">Harga Override</label>
            <input type="number" class="addon-price-override w-full rounded-lg border border-charcoal/15 px-2 py-1 text-xs" min="0" placeholder="Ikuti default" value="${priceOverride === '' ? '' : priceOverride}">
          </div>
          <label class="flex items-center gap-2 text-xs font-semibold text-charcoal mt-5">
            <input type="checkbox" class="addon-required h-4 w-4 text-matcha rounded" ${isRequired ? 'checked' : ''}>
            Wajib dipilih
          </label>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-addon-card]').forEach(card => {
    const checkbox = card.querySelector('.addon-enable');
    const inputs = card.querySelectorAll('input[type="number"], .addon-required');
    const toggleState = (enabled) => {
      inputs.forEach(input => {
        if (!input.classList.contains('addon-required')) {
          input.disabled = !enabled;
          input.classList.toggle('opacity-40', !enabled);
        } else {
          input.disabled = !enabled;
        }
      });
      card.classList.toggle('opacity-60', !enabled);
    };

    toggleState(checkbox.checked);
    checkbox.addEventListener('change', (e) => {
      toggleState(e.target.checked);
    });
  });
}

function collectSelectedAddons() {
  const container = document.getElementById('item-addon-options');
  if (!container) return [];
  const cards = container.querySelectorAll('[data-addon-card]');
  const selected = [];
  cards.forEach((card, index) => {
    const addonId = card.getAttribute('data-addon-id');
    const enabled = card.querySelector('.addon-enable').checked;
    if (!enabled) return;
    const minQuantity = Number(card.querySelector('.addon-min').value) || 0;
    const maxQuantity = Number(card.querySelector('.addon-max').value) || 0;
    const defaultQuantity = Number(card.querySelector('.addon-default').value) || 0;
    const isRequired = card.querySelector('.addon-required').checked;
    const priceOverrideInput = card.querySelector('.addon-price-override').value;
    const priceOverride = priceOverrideInput === '' ? null : Number(priceOverrideInput);
    const sortOrder = Number(card.getAttribute('data-sort-order')) || index;

    selected.push({
      id: addonId,
      minQuantity,
      maxQuantity,
      defaultQuantity,
      isRequired: isRequired || minQuantity > 0,
      priceOverride: priceOverride !== null && !Number.isNaN(priceOverride) ? priceOverride : null,
      sortOrder
    });
  });
  return selected;
}

// Get type badge class
function getTypeBadgeClass(type) {
  switch (type) {
    case 'gelas':
      return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    case 'cup':
      return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
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
    case 'gelas':
      return 'Gelas';
    case 'cup':
      return 'Cup';
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
  renderItemAddonOptions([]);
  const warning = document.getElementById('addon-warning');
  if (warning) warning.classList.add('hidden');
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
  // Populate base price if present (fallback to price)
  document.getElementById('item-base-price').value = (item.basePrice !== undefined && item.basePrice !== null) ? item.basePrice : item.price;
  document.getElementById('item-weight').value = item.weight || 0;
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
  renderItemAddonOptions(item.addons || []);
  const warning = document.getElementById('addon-warning');
  if (warning) warning.classList.add('hidden');
  
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
  loadAddons();
  renderItemAddonOptions();
});

// Save item
async function saveItem(event) {
  event.preventDefault();
  const warning = document.getElementById('addon-warning');
  if (warning) warning.classList.add('hidden');

  const selectedAddons = collectSelectedAddons();
  const invalidAddon = selectedAddons.find(addon => {
    if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && addon.maxQuantity < addon.minQuantity) {
      return true;
    }
    if (addon.defaultQuantity < addon.minQuantity) return true;
    if (addon.maxQuantity > 0 && addon.defaultQuantity > addon.maxQuantity) return true;
    return false;
  });

  if (invalidAddon) {
    if (warning) {
      warning.textContent = `Konfigurasi add-on tidak valid. Pastikan default berada di antara minimal dan maksimal serta maksimal ≥ minimal.`;
      warning.classList.remove('hidden');
    }
    return;
  }
  
  const itemData = {
    id: document.getElementById('item-id').value.trim().toUpperCase(),
    name: document.getElementById('item-name').value.trim(),
    category: document.getElementById('item-category').value,
    item_type: document.getElementById('item-type').value,
    price: parseInt(document.getElementById('item-price').value),
    basePrice: (function(){
      const v = document.getElementById('item-base-price').value;
      const n = Number(v);
      return (v !== '' && Number.isFinite(n)) ? Math.max(0, Math.round(n)) : Math.max(0, Math.round(Number(document.getElementById('item-price').value || 0)));
    })(),
    discount_percent: 0, // No discount system
    weight: parseFloat(document.getElementById('item-weight').value) || 0,
    // 'unit' field removed from form; keep null to avoid breaking API
    unit: null,
    stock_quantity: parseInt(document.getElementById('item-stock').value) || 0,
    rack_location: document.getElementById('item-rack').value.trim() || null,
    description: document.getElementById('item-description').value.trim() || null,
    notes: document.getElementById('item-notes').value.trim() || null,
    image: document.getElementById('item-image').value.trim() || null,
    available: document.getElementById('item-available').checked,
    use_stock: document.getElementById('item-use-stock').checked,
    show_in_transaction: document.getElementById('item-show-transaction').checked,
    addons: selectedAddons
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
