/**
 * Menu Routes
 * Endpoints untuk menu management
 */
const express = require('express');
const router = express.Router();
const menuStore = require('../../services/menuStore');

/**
 * GET /api/menu/categories
 * Get all categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = menuStore.getCategories();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/categories/:id
 * Get category by ID
 */
router.get('/categories/:id', (req, res) => {
  try {
    const category = menuStore.getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (error) {
    console.error('Failed to get category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/menu/categories
 * Create or update category
 */
router.post('/categories', (req, res) => {
  try {
    const { id, name, emoji, sortOrder } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID and name are required' 
      });
    }
    
    const success = menuStore.saveCategory({ id, name, emoji, sortOrder });
    
    if (success) {
      res.json({ success: true, message: 'Category saved successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save category' });
    }
  } catch (error) {
    console.error('Failed to save category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/menu/categories/:id
 * Delete category
 */
router.delete('/categories/:id', (req, res) => {
  try {
    const success = menuStore.deleteCategory(req.params.id);
    
    if (success) {
      res.json({ success: true, message: 'Category deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Category not found' });
    }
  } catch (error) {
    console.error('Failed to delete category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/items
 * Get all menu items (with optional filters)
 */
router.get('/items', (req, res) => {
  try {
    const filters = {};
    
    if (req.query.category) {
      filters.category = req.query.category;
    }
    
    if (req.query.available !== undefined) {
      filters.available = req.query.available === 'true';
    }
    
    const items = menuStore.getMenuItems(filters);
    res.json({ success: true, items });
  } catch (error) {
    console.error('Failed to get menu items:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/items/:id
 * Get menu item by ID
 */
router.get('/items/:id', (req, res) => {
  try {
    const item = menuStore.getMenuItemById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, item });
  } catch (error) {
    console.error('Failed to get menu item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper to sanitize item add-on payload
 */
function sanitizeItemAddons(addonsInput) {
  if (!Array.isArray(addonsInput)) return [];
  return addonsInput.map((addon, index) => {
    if (!addon || !addon.id) return null;
    const minQuantity = Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0;
    const maxQuantity = Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : 1;
    const defaultQuantity = Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : 0;
    const priceOverride = addon.priceOverride === null || addon.priceOverride === undefined
      ? null
      : Number(addon.priceOverride);
    const sortOrder = Number.isFinite(Number(addon.sortOrder)) ? Number(addon.sortOrder) : index;

    return {
      id: addon.id,
      minQuantity,
      maxQuantity,
      defaultQuantity,
      isRequired: !!addon.isRequired,
      priceOverride: Number.isFinite(priceOverride) ? priceOverride : null,
      sortOrder
    };
  }).filter(Boolean);
}

/**
 * POST /api/menu/items
 * Create or update menu item
 */
router.post('/items', (req, res) => {
  try {
    const { id, name, category } = req.body;
    const rawPrice = Number(req.body.price);

    if (!id || !name || !category || Number.isNaN(rawPrice)) {
      return res.status(400).json({
        success: false,
        error: 'ID, name, category, and price are required'
      });
    }

    if (rawPrice < 0) {
      return res.status(400).json({
        success: false,
        error: 'Price must be zero or positive'
      });
    }

    const payload = {
      id: id.trim(),
      name: name.trim(),
      category: category.trim(),
      price: Math.round(rawPrice),
      available: req.body.available !== false,
      description: req.body.description ? String(req.body.description).trim() : null,
      image: req.body.image ? String(req.body.image).trim() : null,
      item_type: req.body.item_type || 'product',
      use_stock: !!req.body.use_stock,
      show_in_transaction: req.body.show_in_transaction !== false,
      stock_quantity: Number.isFinite(Number(req.body.stock_quantity)) ? Math.max(0, Math.round(Number(req.body.stock_quantity))) : 0,
      weight: Number.isFinite(Number(req.body.weight)) ? Number(req.body.weight) : 0,
      unit: req.body.unit || 'pcs',
      discount_percent: Number.isFinite(Number(req.body.discount_percent)) ? Number(req.body.discount_percent) : 0,
      rack_location: req.body.rack_location ? String(req.body.rack_location).trim() : null,
      notes: req.body.notes ? String(req.body.notes).trim() : null,
      addons: sanitizeItemAddons(req.body.addons)
    };

    const success = menuStore.saveMenuItem(payload);

    if (success) {
      res.json({ success: true, message: 'Menu item saved successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save menu item' });
    }
  } catch (error) {
    console.error('Failed to save menu item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/menu/items/:id
 * Delete menu item
 */
router.delete('/items/:id', (req, res) => {
  try {
    const success = menuStore.deleteMenuItem(req.params.id);
    
    if (success) {
      res.json({ success: true, message: 'Menu item deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Item not found' });
    }
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/addons
 * List add-ons (optional ?activeOnly=true)
 */
router.get('/addons', (req, res) => {
  try {
    const activeOnly = (req.query.activeOnly || '').toString().toLowerCase() === 'true';
    const addons = menuStore.getAddons({ activeOnly });
    res.json({ success: true, addons });
  } catch (error) {
    console.error('Failed to get add-ons:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/addons/:id
 */
router.get('/addons/:id', (req, res) => {
  try {
    const addon = menuStore.getAddonById(req.params.id);
    if (!addon) {
      return res.status(404).json({ success: false, error: 'Add-on not found' });
    }
    res.json({ success: true, addon });
  } catch (error) {
    console.error('Failed to get add-on:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/menu/addons
 * Create or update add-on
 */
router.post('/addons', (req, res) => {
  try {
    const { id, name } = req.body;
    const price = Number(req.body.price);

    if (!id || !name || Number.isNaN(price)) {
      return res.status(400).json({
        success: false,
        error: 'ID, name, and price are required'
      });
    }

    if (price < 0) {
      return res.status(400).json({
        success: false,
        error: 'Price must be zero or positive'
      });
    }

    const success = menuStore.saveAddon({
      id: id.trim(),
      name: name.trim(),
      price: Math.round(price),
      description: req.body.description ? String(req.body.description).trim() : null,
      is_active: req.body.is_active !== false
    });

    if (success) {
      res.json({ success: true, message: 'Add-on saved successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save add-on' });
    }
  } catch (error) {
    console.error('Failed to save add-on:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/menu/addons/:id
 */
router.delete('/addons/:id', (req, res) => {
  try {
    const success = menuStore.deleteAddon(req.params.id);
    if (success) {
      res.json({ success: true, message: 'Add-on deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Add-on not found' });
    }
  } catch (error) {
    console.error('Failed to delete add-on:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/menu/grouped
 * Get menu grouped by category
 */
router.get('/grouped', (req, res) => {
  try {
    const grouped = menuStore.getMenuGrouped();
    res.json({ success: true, menu: grouped });
  } catch (error) {
    console.error('Failed to get grouped menu:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
