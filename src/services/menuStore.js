const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Store database under src/data/database.db (same as orderStore)
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'database.db');

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
}

function getDb() {
  ensureDir();
  return new Database(DB_FILE);
}

/**
 * Initialize menu with default data from config if tables are empty
 */
function initializeDefaultMenu() {
  try {
    const config = require('../config/config');
    const db = getDb();
    
    // Check if categories exist
    const categoryCount = db.prepare('SELECT COUNT(*) as count FROM menu_categories').get();
    if (categoryCount.count === 0) {
      // Insert default categories
      const insertCategory = db.prepare(`
        INSERT INTO menu_categories (id, name, emoji, sortOrder)
        VALUES (?, ?, ?, ?)
      `);
      
      const categories = [
        { id: 'coffee', name: '☕ Kopi', emoji: '☕', sortOrder: 1 },
        { id: 'nonCoffee', name: '🥤 Non-Kopi', emoji: '🥤', sortOrder: 2 },
        { id: 'food', name: '🍰 Makanan', emoji: '🍰', sortOrder: 3 }
      ];
      
      categories.forEach(cat => {
        insertCategory.run(cat.id, cat.name, cat.emoji, cat.sortOrder);
      });
      
      console.log('✅ Default categories initialized');
    }
    
    // Check if menu items exist
    const itemCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
    if (itemCount.count === 0 && config.menu && config.menu.items) {
      // Insert default menu items from config
      const insertItem = db.prepare(`
        INSERT INTO menu_items (id, name, category, price, available, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      config.menu.items.forEach(item => {
        insertItem.run(
          item.id,
          item.name,
          item.category,
          item.price,
          item.available ? 1 : 0,
          item.description || null
        );
      });
      
      console.log(`✅ Default menu items initialized (${config.menu.items.length} items)`);
    }
    
    db.close();
  } catch (e) {
    console.error('Failed to initialize default menu:', e.message);
  }
}

/**
 * Get all categories
 */
function getCategories() {
  try {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM menu_categories ORDER BY sortOrder ASC').all();
    db.close();
    return categories;
  } catch (e) {
    console.error('Failed to get categories:', e.message);
    return [];
  }
}

/**
 * Get category by ID
 */
function getCategoryById(id) {
  try {
    const db = getDb();
    const category = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(id);
    db.close();
    return category || null;
  } catch (e) {
    console.error('Failed to get category:', e.message);
    return null;
  }
}

/**
 * Create or update category
 */
function saveCategory(categoryData) {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO menu_categories (id, name, emoji, sortOrder, updatedAt)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        emoji = excluded.emoji,
        sortOrder = excluded.sortOrder,
        updatedAt = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      categoryData.id,
      categoryData.name,
      categoryData.emoji || '',
      categoryData.sortOrder || 0
    );
    
    db.close();
    return true;
  } catch (e) {
    console.error('Failed to save category:', e.message);
    return false;
  }
}

/**
 * Delete category
 */
function deleteCategory(id) {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM menu_categories WHERE id = ?').run(id);
    db.close();
    return result.changes > 0;
  } catch (e) {
    console.error('Failed to delete category:', e.message);
    return false;
  }
}

/**
 * Get all menu items
 */
function getMenuItems(filters = {}) {
  try {
    const db = getDb();
    let query = 'SELECT * FROM menu_items';
    const conditions = [];
    const params = [];
    
    if (filters.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }
    
    if (filters.available !== undefined) {
      conditions.push('available = ?');
      params.push(filters.available ? 1 : 0);
    }
    
    if (filters.item_type) {
      conditions.push('item_type = ?');
      params.push(filters.item_type);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY category, name';
    
    const items = db.prepare(query).all(...params);
    db.close();
    
    // Convert boolean fields back
    return items.map(item => ({
      ...item,
      available: item.available === 1,
      use_stock: item.use_stock === 1,
      show_in_transaction: item.show_in_transaction === 1
    }));
  } catch (e) {
    console.error('Failed to get menu items:', e.message);
    return [];
  }
}

/**
 * Get menu item by ID
 */
function getMenuItemById(id) {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    db.close();
    
    if (!item) return null;
    
    return {
      ...item,
      available: item.available === 1,
      use_stock: item.use_stock === 1,
      show_in_transaction: item.show_in_transaction === 1
    };
  } catch (e) {
    console.error('Failed to get menu item:', e.message);
    return null;
  }
}

/**
 * Migrate existing menu_items table to add new columns if they don't exist
 */
function migrateMenuItemsTable() {
  try {
    const db = getDb();
    const newColumns = [
      { name: 'item_type', type: 'TEXT DEFAULT "product"' },
      { name: 'use_stock', type: 'INTEGER DEFAULT 0' },
      { name: 'show_in_transaction', type: 'INTEGER DEFAULT 1' },
      { name: 'stock_quantity', type: 'INTEGER DEFAULT 0' },
      { name: 'weight', type: 'REAL DEFAULT 0' },
      { name: 'unit', type: 'TEXT DEFAULT "pcs"' },
      { name: 'discount_percent', type: 'REAL DEFAULT 0' },
      { name: 'rack_location', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' }
    ];
    
    newColumns.forEach(col => {
      try {
        db.prepare(`ALTER TABLE menu_items ADD COLUMN ${col.name} ${col.type}`).run();
        console.log(`✅ Added column: ${col.name}`);
      } catch (e) {
        // Column already exists, ignore
        if (!e.message.includes('duplicate column')) {
          console.error(`Failed to add column ${col.name}:`, e.message);
        }
      }
    });
    
    db.close();
  } catch (e) {
    console.error('Migration failed:', e.message);
  }
}

/**
 * Create or update menu item
 */
function saveMenuItem(itemData) {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO menu_items (
        id, name, category, price, available, description, image,
        item_type, use_stock, show_in_transaction, stock_quantity,
        weight, unit, discount_percent, rack_location, notes, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        price = excluded.price,
        available = excluded.available,
        description = excluded.description,
        image = excluded.image,
        item_type = excluded.item_type,
        use_stock = excluded.use_stock,
        show_in_transaction = excluded.show_in_transaction,
        stock_quantity = excluded.stock_quantity,
        weight = excluded.weight,
        unit = excluded.unit,
        discount_percent = excluded.discount_percent,
        rack_location = excluded.rack_location,
        notes = excluded.notes,
        updatedAt = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      itemData.id,
      itemData.name,
      itemData.category,
      itemData.price,
      itemData.available ? 1 : 0,
      itemData.description || null,
      itemData.image || null,
      itemData.item_type || 'product',
      itemData.use_stock ? 1 : 0,
      itemData.show_in_transaction !== false ? 1 : 0,
      itemData.stock_quantity || 0,
      itemData.weight || 0,
      itemData.unit || 'pcs',
      itemData.discount_percent || 0,
      itemData.rack_location || null,
      itemData.notes || null
    );
    
    db.close();
    return true;
  } catch (e) {
    console.error('Failed to save menu item:', e.message);
    return false;
  }
}

/**
 * Delete menu item
 */
function deleteMenuItem(id) {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    db.close();
    return result.changes > 0;
  } catch (e) {
    console.error('Failed to delete menu item:', e.message);
    return false;
  }
}

/**
 * Get menu grouped by category (for display)
 */
function getMenuGrouped() {
  try {
    const categories = getCategories();
    const items = getMenuItems({ available: true });
    
    const grouped = {};
    categories.forEach(cat => {
      grouped[cat.id] = {
        name: cat.name,
        emoji: cat.emoji,
        items: items.filter(item => item.category === cat.id)
      };
    });
    
    return grouped;
  } catch (e) {
    console.error('Failed to get grouped menu:', e.message);
    return {};
  }
}

// Run migrations and initialize default menu on module load
migrateMenuItemsTable();
initializeDefaultMenu();

module.exports = {
  getCategories,
  getCategoryById,
  saveCategory,
  deleteCategory,
  getMenuItems,
  getMenuItemById,
  saveMenuItem,
  deleteMenuItem,
  getMenuGrouped,
  initializeDefaultMenu,
  migrateMenuItemsTable
};
