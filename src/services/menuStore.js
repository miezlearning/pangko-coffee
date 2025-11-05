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
  let db;
  try {
    db = getDb();
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
    const itemIds = items.map(item => item.id);

    let addonMap = {};
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const addonRows = db.prepare(`
        SELECT
          mia.item_id,
          mia.addon_id,
          mia.min_quantity,
          mia.max_quantity,
          mia.default_quantity,
          mia.is_required,
          mia.price_override,
          mia.sort_order,
          ma.name AS addon_name,
          ma.price AS addon_price,
          ma.description AS addon_description,
          ma.is_active AS addon_active
        FROM menu_item_addons mia
        JOIN menu_addons ma ON ma.id = mia.addon_id
        WHERE mia.item_id IN (${placeholders})
        ORDER BY mia.sort_order ASC, ma.name ASC
      `).all(...itemIds);

      addonMap = addonRows.reduce((acc, row) => {
        if (!acc[row.item_id]) acc[row.item_id] = [];
        acc[row.item_id].push({
          id: row.addon_id,
          name: row.addon_name,
          description: row.addon_description || null,
          basePrice: row.addon_price || 0,
          price: row.price_override !== null ? row.price_override : (row.addon_price || 0),
          priceOverride: row.price_override,
          isActive: row.addon_active === 1,
          minQuantity: row.min_quantity ?? 0,
          maxQuantity: row.max_quantity ?? 1,
          defaultQuantity: row.default_quantity ?? 0,
          isRequired: row.is_required === 1,
          sortOrder: row.sort_order ?? 0
        });
        return acc;
      }, {});
    }

    return items.map(item => ({
      ...item,
      available: item.available === 1,
      use_stock: item.use_stock === 1,
      show_in_transaction: item.show_in_transaction === 1,
      addons: addonMap[item.id] || []
    }));
  } catch (e) {
    console.error('Failed to get menu items:', e.message);
    return [];
  } finally {
    if (db) db.close();
  }
}

/**
 * Get menu item by ID
 */
function getMenuItemById(id) {
  let db;
  try {
    db = getDb();
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    if (!item) {
      return null;
    }

    const addons = db.prepare(`
      SELECT
        mia.addon_id,
        mia.min_quantity,
        mia.max_quantity,
        mia.default_quantity,
        mia.is_required,
        mia.price_override,
        mia.sort_order,
        ma.name AS addon_name,
        ma.price AS addon_price,
        ma.description AS addon_description,
        ma.is_active AS addon_active
      FROM menu_item_addons mia
      JOIN menu_addons ma ON ma.id = mia.addon_id
      WHERE mia.item_id = ?
      ORDER BY mia.sort_order ASC, ma.name ASC
    `).all(id).map(row => ({
      id: row.addon_id,
      name: row.addon_name,
      description: row.addon_description || null,
      basePrice: row.addon_price || 0,
      price: row.price_override !== null ? row.price_override : (row.addon_price || 0),
      priceOverride: row.price_override,
      isActive: row.addon_active === 1,
      minQuantity: row.min_quantity ?? 0,
      maxQuantity: row.max_quantity ?? 1,
      defaultQuantity: row.default_quantity ?? 0,
      isRequired: row.is_required === 1,
      sortOrder: row.sort_order ?? 0
    }));

    return {
      ...item,
      available: item.available === 1,
      use_stock: item.use_stock === 1,
      show_in_transaction: item.show_in_transaction === 1,
      addons
    };
  } catch (e) {
    console.error('Failed to get menu item:', e.message);
    return null;
  } finally {
    if (db) db.close();
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

function migrateAddonTables() {
  let db;
  try {
    db = getDb();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS menu_addons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS menu_item_addons (
        item_id TEXT NOT NULL,
        addon_id TEXT NOT NULL,
        min_quantity INTEGER DEFAULT 0,
        max_quantity INTEGER DEFAULT 1,
        default_quantity INTEGER DEFAULT 0,
        is_required INTEGER DEFAULT 0,
        price_override INTEGER,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (item_id, addon_id),
        FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        FOREIGN KEY (addon_id) REFERENCES menu_addons(id) ON DELETE CASCADE
      )
    `).run();
  } catch (e) {
    console.error('Failed to migrate add-on tables:', e.message);
  } finally {
    if (db) db.close();
  }
}

function getAddons(options = {}) {
  let db;
  try {
    db = getDb();
    let query = 'SELECT * FROM menu_addons';
    const conditions = [];
    const params = [];

    if (options.activeOnly) {
      conditions.push('is_active = 1');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name ASC';
    return db.prepare(query).all(...params).map(addon => ({
      ...addon,
      is_active: addon.is_active === 1,
      isActive: addon.is_active === 1
    }));
  } catch (e) {
    console.error('Failed to get add-ons:', e.message);
    return [];
  } finally {
    if (db) db.close();
  }
}

function getAddonById(id) {
  let db;
  try {
    db = getDb();
    const addon = db.prepare('SELECT * FROM menu_addons WHERE id = ?').get(id);
    if (!addon) return null;
    return {
      ...addon,
      is_active: addon.is_active === 1,
      isActive: addon.is_active === 1
    };
  } catch (e) {
    console.error('Failed to get add-on:', e.message);
    return null;
  } finally {
    if (db) db.close();
  }
}

function saveAddon(addonData) {
  let db;
  try {
    db = getDb();
    const stmt = db.prepare(`
      INSERT INTO menu_addons (id, name, price, description, is_active, updatedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        description = excluded.description,
        is_active = excluded.is_active,
        updatedAt = CURRENT_TIMESTAMP
    `);

    const isActiveFlag = addonData.is_active !== undefined ? addonData.is_active : addonData.isActive;

    stmt.run(
      addonData.id,
      addonData.name,
      addonData.price,
      addonData.description || null,
      isActiveFlag !== false ? 1 : 0
    );

    return true;
  } catch (e) {
    console.error('Failed to save add-on:', e.message);
    return false;
  } finally {
    if (db) db.close();
  }
}

function deleteAddon(id) {
  let db;
  try {
    db = getDb();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM menu_item_addons WHERE addon_id = ?').run(id);
      return db.prepare('DELETE FROM menu_addons WHERE id = ?').run(id);
    });

    const result = transaction();
    return result && result.changes > 0;
  } catch (e) {
    console.error('Failed to delete add-on:', e.message);
    return false;
  } finally {
    if (db) db.close();
  }
}

/**
 * Create or update menu item
 */
function saveMenuItem(itemData) {
  let db;
  try {
    db = getDb();
    const transaction = db.transaction(() => {
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

      if (Array.isArray(itemData.addons)) {
        const deleteStmt = db.prepare('DELETE FROM menu_item_addons WHERE item_id = ?');
        deleteStmt.run(itemData.id);

        const insertStmt = db.prepare(`
          INSERT INTO menu_item_addons (
            item_id, addon_id, min_quantity, max_quantity, default_quantity,
            is_required, price_override, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        itemData.addons.forEach(link => {
          if (!link || !link.id) return;
          insertStmt.run(
            itemData.id,
            link.id,
            link.minQuantity ?? 0,
            link.maxQuantity ?? 1,
            link.defaultQuantity ?? 0,
            link.isRequired ? 1 : 0,
            link.priceOverride !== undefined && link.priceOverride !== null
              ? Number(link.priceOverride)
              : null,
            link.sortOrder ?? 0
          );
        });
      }
    });

    transaction();
    return true;
  } catch (e) {
    console.error('Failed to save menu item:', e.message);
    return false;
  } finally {
    if (db) db.close();
  }
}

/**
 * Delete menu item
 */
function deleteMenuItem(id) {
  let db;
  try {
    db = getDb();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM menu_item_addons WHERE item_id = ?').run(id);
      return db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    });

    const result = transaction();
    return result && result.changes > 0;
  } catch (e) {
    console.error('Failed to delete menu item:', e.message);
    return false;
  } finally {
    if (db) db.close();
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
migrateAddonTables();
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
  migrateMenuItemsTable,
  migrateAddonTables,
  getAddons,
  getAddonById,
  saveAddon,
  deleteAddon
};
