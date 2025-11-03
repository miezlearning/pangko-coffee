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
 * POST /api/menu/items
 * Create or update menu item
 */
router.post('/items', (req, res) => {
  try {
    const { id, name, category, price, available, description, image } = req.body;
    
    if (!id || !name || !category || price === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID, name, category, and price are required' 
      });
    }
    
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Price must be a positive number' 
      });
    }
    
    const success = menuStore.saveMenuItem({ 
      id, 
      name, 
      category, 
      price, 
      available: available !== false, // default true
      description, 
      image 
    });
    
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
