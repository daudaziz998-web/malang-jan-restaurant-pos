import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseSync | null = null;

// Determine persistent data directory safely across environments
export function resolveDataDir(): string {
  // 1. Explicit environment variable set by Electron main process (e.g. app.getPath('userData'))
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }

  // 2. Windows standard APPDATA directory if running natively on Windows
  if (process.platform === 'win32' && process.env.APPDATA) {
    const newDir = path.join(process.env.APPDATA, 'malang-jan-restaurant-pos');
    return newDir;
  }

  // 3. Fallback to ./data for web development and Cloud Run container
  return path.join(process.cwd(), 'data');
}

export function getDatabasePath(): string {
  const dir = resolveDataDir();
  return path.join(dir, 'restaurant.db');
}

export interface DBMenuItemVariant {
  id: string;
  menuItemId?: string;
  label: string;
  price: number;
}

export interface DBMenuItem {
  id: string;
  name: string;
  description: string;
  image: string;
  available: boolean;
  favorite: boolean;
  variants: Array<{ id: string; label: string; price: number }>;
}

export interface DBSettings {
  restaurantName: string;
  logo: string;
  address: string;
  phone: string;
  currency: string;
  receiptFooter: string;
  receiptFormat: 'thermal' | 'a4';
  printerWidth?: '58mm' | '80mm';
  nextOrderNumber: number;
  theme: 'dark' | 'light';
}

export interface DBOrderItem {
  id: string;
  orderId?: string;
  menuItemId: string | null;
  name: string;
  variantLabel: string;
  price: number;
  qty: number;
  notes: string;
  isExtra?: boolean;
}

export interface DBOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  tableNumber: string;
  createdAt: string;
  items: DBOrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: 'paid' | 'unpaid';
  paymentDate: string | null;
  stage: 'active' | 'completed';
}

export interface DBCustomer {
  id: string;
  name: string;
  phone: string;
  cnic?: string;
  totalOrders: number;
  totalSpent: number;
  lastVisit: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBEmployee {
  id: string;
  name: string;
  phone: string;
  salary: number;
  createdAt: string;
}

const DEFAULT_SETTINGS: DBSettings = {
  restaurantName: 'MALANG JAN RESTURANT',
  logo: '/logo.png',
  address: 'Main Bazaar',
  phone: '03229339158',
  currency: 'Rs',
  receiptFooter: 'Thank you for dining with us! Visit again.',
  receiptFormat: 'thermal',
  printerWidth: '80mm',
  nextOrderNumber: 1,
  theme: 'dark',
};

const DEFAULT_MENU_ITEMS: DBMenuItem[] = [
  {
    id: 'item_karahi',
    name: 'Chicken Karahi',
    description: 'Classic tomato-based karahi.',
    image: '',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_k_half', label: 'Half', price: 950 },
      { id: 'v_k_full', label: 'Full', price: 1750 },
    ],
  },
  {
    id: 'item_handi',
    name: 'Chicken Handi',
    description: 'Creamy, rich handi gravy.',
    image: '',
    available: true,
    favorite: false,
    variants: [
      { id: 'v_h_half', label: 'Half', price: 1000 },
      { id: 'v_h_full', label: 'Full', price: 1850 },
    ],
  },
  {
    id: 'item_tikka',
    name: 'Chicken Tikka',
    description: 'Char-grilled tikka pieces.',
    image: '',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_t_1', label: '1 Piece', price: 280 },
      { id: 'v_t_2', label: '2 Pieces', price: 540 },
      { id: 'v_t_full', label: 'Full', price: 1500 },
    ],
  },
  {
    id: 'item_biryani',
    name: 'Chicken Biryani',
    description: 'Fragrant basmati biryani.',
    image: '',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_b_half', label: 'Half Plate', price: 320 },
      { id: 'v_b_full', label: 'Full Plate', price: 550 },
    ],
  },
  {
    id: 'item_kabab',
    name: 'Seekh Kabab',
    description: 'Beef seekh kabab skewers.',
    image: '',
    available: true,
    favorite: false,
    variants: [{ id: 'v_sk_reg', label: 'Regular', price: 180 }],
  },
  {
    id: 'item_burger',
    name: 'Beef Burger',
    description: 'Grilled patty, cheese, salad.',
    image: '',
    available: true,
    favorite: false,
    variants: [{ id: 'v_bb_reg', label: 'Regular', price: 420 }],
  },
  {
    id: 'item_drink',
    name: 'Soft Drink',
    description: 'Chilled 345ml can.',
    image: '',
    available: true,
    favorite: false,
    variants: [
      { id: 'v_sd_can', label: 'Can', price: 120 },
      { id: 'v_sd_15l', label: '1.5L Bottle', price: 250 },
    ],
  },
  {
    id: 'item_kheer',
    name: 'Kheer',
    description: 'Traditional rice pudding.',
    image: '',
    available: true,
    favorite: false,
    variants: [{ id: 'v_kh_bowl', label: 'Bowl', price: 150 }],
  },
];

// Helper to upsert customer record into structured customers table
export function upsertCustomerRecord(
  db: DatabaseSync,
  data: {
    name: string;
    phone?: string;
    cnic?: string;
    lastVisit?: string;
    orderSpent?: number;
  }
): void {
  const name = (data.name || '').trim();
  if (!name || name.toLowerCase() === 'walk-in') return;

  const phone = (data.phone || '').trim();
  const cnic = (data.cnic || '').trim();
  const now = new Date().toISOString();
  const lastVisit = data.lastVisit || now;

  let existing: any = null;
  if (phone) {
    existing = db.prepare('SELECT * FROM customers WHERE phone = ? LIMIT 1').get(phone);
  }
  if (!existing) {
    existing = db.prepare('SELECT * FROM customers WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name);
  }

  if (existing) {
    const totalOrders = Number(existing.total_orders || 0) + (data.orderSpent !== undefined ? 1 : 0);
    const totalSpent = Number(existing.total_spent || 0) + (data.orderSpent ? Number(data.orderSpent) : 0);
    const updatedPhone = phone || existing.phone || '';
    const updatedCnic = cnic || existing.cnic || '';
    const updatedLastVisit = lastVisit > (existing.last_visit || '') ? lastVisit : existing.last_visit;

    db.prepare(`
      UPDATE customers SET
        name = ?,
        phone = ?,
        cnic = ?,
        total_orders = ?,
        total_spent = ?,
        last_visit = ?,
        updated_at = ?
      WHERE id = ?
    `).run(name, updatedPhone, updatedCnic, totalOrders, totalSpent, updatedLastVisit, now, existing.id);
  } else {
    const id = `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const totalOrders = data.orderSpent !== undefined ? 1 : 0;
    const totalSpent = data.orderSpent ? Number(data.orderSpent) : 0;

    db.prepare(`
      INSERT INTO customers (id, name, phone, cnic, total_orders, total_spent, last_visit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, phone, cnic, totalOrders, totalSpent, lastVisit, now, now);
  }
}

// Synchronize all existing customers from orders
export function syncCustomersFromOrders(db: DatabaseSync): void {
  try {
    const ordersCols = (db.prepare("PRAGMA table_info(orders)").all() as any[]).map((c: any) => c.name);
    if (ordersCols.includes('order_data')) {
      const orderRows = db.prepare("SELECT order_data FROM orders").all() as any[];
      for (const r of orderRows) {
        if (r.order_data) {
          try {
            const o = JSON.parse(r.order_data);
            if (o.customerName && String(o.customerName).trim().toLowerCase() !== 'walk-in') {
              upsertCustomerRecord(db, {
                name: o.customerName,
                lastVisit: o.createdAt,
                orderSpent: Number(o.total) || 0,
              });
            }
          } catch (_) {}
        }
      }
    } else if (ordersCols.includes('customerName')) {
      const orders = db.prepare("SELECT customerName, total, createdAt FROM orders WHERE customerName IS NOT NULL AND customerName != ''").all() as any[];
      for (const o of orders) {
        upsertCustomerRecord(db, {
          name: o.customerName,
          lastVisit: o.createdAt,
          orderSpent: Number(o.total) || 0,
        });
      }
    }
  } catch (err) {
    console.warn('Customer sync notice:', err);
  }
}

// Schema Migrations Runner: Safe, non-destructive schema evolution
function runSchemaMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // Drop room tables completely to remove room booking system
  try {
    db.exec(`
      DROP TABLE IF EXISTS room_payments;
      DROP TABLE IF EXISTS room_bookings;
      DROP TABLE IF EXISTS rooms;
    `);
  } catch (_) {}

  // Update restaurant name to MALANG JAN RESTURANT in settings table
  try {
    db.prepare(`
      UPDATE settings
      SET restaurantName = 'MALANG JAN RESTURANT'
      WHERE id = 'pos_config' AND (restaurantName LIKE '%Timergara%' OR restaurantName LIKE '%tiemargar%' OR restaurantName IS NULL OR restaurantName = '');
    `).run();
  } catch (_) {}

  const appliedRows = (db.prepare('SELECT version FROM schema_migrations').all() as any[]) || [];
  const appliedVersions = new Set<number>(appliedRows.map((r: any) => Number(r.version)));

  const migrations: Array<{ version: number; name: string; run: (database: DatabaseSync) => void }> = [
    {
      version: 2,
      name: 'add_indices_and_updater_metadata',
      run: (database) => {
        try {
          database.exec(`
            CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(createdAt);
            CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(orderNumber);
            CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(available);
            CREATE TABLE IF NOT EXISTS app_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        } catch (_) {}
      },
    },
    {
      version: 4,
      name: 'cleanup_stock_tables',
      run: (database) => {
        try {
          database.exec(`
            DROP TABLE IF EXISTS stock_consumption;
            DROP TABLE IF EXISTS stock_items;
          `);
        } catch (_) {}
      },
    },
    {
      version: 8,
      name: 'add_printer_width',
      run: (database) => {
        try {
          const settingsCols = database.prepare("PRAGMA table_info(settings)").all() as any[];
          const hasPrinterWidth = settingsCols.some((c) => c.name === 'printer_width');
          if (!hasPrinterWidth) {
            database.exec("ALTER TABLE settings ADD COLUMN printer_width TEXT NOT NULL DEFAULT '80mm';");
          }
        } catch (err) {
          console.warn('Migration 8 notice:', err);
        }
      },
    },
    {
      version: 12,
      name: 'create_order_items_menu_variants_and_customers_tables',
      run: (database) => {
        try {
          database.exec(`
            CREATE TABLE IF NOT EXISTS menu_item_variants (
              id TEXT PRIMARY KEY,
              menu_item_id TEXT NOT NULL,
              label TEXT NOT NULL,
              price REAL NOT NULL,
              FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item_id ON menu_item_variants(menu_item_id);

            CREATE TABLE IF NOT EXISTS customers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              phone TEXT,
              cnic TEXT,
              total_orders INTEGER DEFAULT 0,
              total_spent REAL DEFAULT 0,
              last_visit TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
            CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
          `);

          syncCustomersFromOrders(database);
        } catch (err) {
          console.warn('Migration 12 notice:', err);
        }
      },
    },
    {
      version: 13,
      name: 'restore_complete_json_order_storage',
      run: (database) => {
        try {
          database.exec('DROP TABLE IF EXISTS order_items;');
          const cols = (database.prepare("PRAGMA table_info(orders)").all() as any[]).map((c: any) => c.name);
          const existingOrdersData: any[] = [];
          if (cols.length > 0) {
            const existingRows = database.prepare("SELECT * FROM orders").all() as any[];
            for (const row of existingRows) {
              if (row.order_data) {
                try {
                  existingOrdersData.push(JSON.parse(row.order_data));
                } catch (_) {}
              } else {
                let items: any[] = [];
                if (row.items_json) {
                  try { items = JSON.parse(row.items_json); } catch (_) {}
                }
                existingOrdersData.push({
                  id: row.id,
                  orderNumber: Number(row.orderNumber) || 1,
                  customerName: row.customerName !== undefined ? String(row.customerName) : '',
                  tableNumber: row.tableNumber !== undefined ? String(row.tableNumber) : '',
                  createdAt: row.createdAt || new Date().toISOString(),
                  items: items,
                  subtotal: Number(row.subtotal) || 0,
                  discount: Number(row.discount) || 0,
                  total: Number(row.total) || 0,
                  paymentStatus: row.paymentStatus || 'unpaid',
                  paymentDate: row.paymentDate || null,
                  stage: row.stage || 'active'
                });
              }
            }

            database.exec(`
              DROP TABLE IF EXISTS orders;
              CREATE TABLE orders (
                id TEXT PRIMARY KEY,
                order_data TEXT NOT NULL
              );
            `);

            const insertStmt = database.prepare('INSERT INTO orders (id, order_data) VALUES (?, ?)');
            for (const ord of existingOrdersData) {
              insertStmt.run(ord.id, JSON.stringify(ord, null, 2));
            }
          }
        } catch (err) {
          console.warn('Migration 13 notice:', err);
        }
      },
    },
    {
      version: 14,
      name: 'rebrand_to_malang_jan_restaurant_and_remove_rooms',
      run: (database) => {
        try {
          database.exec(`
            DROP TABLE IF EXISTS room_payments;
            DROP TABLE IF EXISTS room_bookings;
            DROP TABLE IF EXISTS rooms;
            UPDATE settings
            SET restaurantName = 'MALANG JAN RESTURANT'
            WHERE id = 'pos_config';
          `);
        } catch (err) {
          console.warn('Migration 14 notice:', err);
        }
      },
    },
  ];

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      try {
        m.run(db);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          m.version,
          m.name,
          new Date().toISOString()
        );
      } catch (err) {
        console.warn(`Migration ${m.version} notice:`, err);
      }
    }
  }
}

function initDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);

  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    const currentMode = (db.prepare('PRAGMA journal_mode;').get() as any)?.journal_mode;
    if (currentMode && currentMode.toLowerCase() !== 'delete') {
      try {
        db.exec('PRAGMA journal_mode = DELETE;');
      } catch (_) {}
    }
    db.exec('PRAGMA synchronous = NORMAL;');
  } catch (e) {}

  // Drop room tables if exists
  try {
    db.exec(`
      DROP TABLE IF EXISTS room_payments;
      DROP TABLE IF EXISTS room_bookings;
      DROP TABLE IF EXISTS rooms;
    `);
  } catch (_) {}

  // Create required structured tables if they do not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      restaurantName TEXT,
      logo TEXT,
      address TEXT,
      phone TEXT,
      currency TEXT,
      receiptFooter TEXT,
      receiptFormat TEXT,
      printer_width TEXT DEFAULT '80mm',
      nextOrderNumber INTEGER,
      theme TEXT
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image TEXT,
      available INTEGER NOT NULL DEFAULT 1,
      favorite INTEGER NOT NULL DEFAULT 0,
      variants_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_item_variants (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT NOT NULL,
      label TEXT NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_data TEXT NOT NULL
    );

    DROP TABLE IF EXISTS order_items;

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      cnic TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      last_visit TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      salary REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    DROP TABLE IF EXISTS stock_consumption;
    DROP TABLE IF EXISTS stock_items;
  `);

  runSchemaMigrations(db);

  // Initialize Settings if table empty
  const existingSettings = db.prepare('SELECT * FROM settings WHERE id = ?').get('pos_config') as any;
  if (!existingSettings) {
    db.prepare(
      `INSERT INTO settings (id, restaurantName, logo, address, phone, currency, receiptFooter, receiptFormat, nextOrderNumber, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'pos_config',
      DEFAULT_SETTINGS.restaurantName,
      DEFAULT_SETTINGS.logo,
      DEFAULT_SETTINGS.address,
      DEFAULT_SETTINGS.phone,
      DEFAULT_SETTINGS.currency,
      DEFAULT_SETTINGS.receiptFooter,
      DEFAULT_SETTINGS.receiptFormat,
      DEFAULT_SETTINGS.nextOrderNumber,
      DEFAULT_SETTINGS.theme
    );
  } else if (!existingSettings.restaurantName || existingSettings.restaurantName.toLowerCase().includes('timergara') || existingSettings.restaurantName.toLowerCase().includes('tiemargar')) {
    db.prepare('UPDATE settings SET restaurantName = ? WHERE id = ?').run(DEFAULT_SETTINGS.restaurantName, 'pos_config');
  }

  // Initialize Menu Items if table empty
  const menuItemCount = db.prepare('SELECT count(*) as count FROM menu_items').get() as { count: number } | undefined;
  if (!menuItemCount || menuItemCount.count === 0) {
    const insertStmt = db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertVarStmt = db.prepare(
      `INSERT INTO menu_item_variants (id, menu_item_id, label, price)
       VALUES (?, ?, ?, ?)`
    );

    for (const item of DEFAULT_MENU_ITEMS) {
      insertStmt.run(
        item.id,
        item.name,
        item.description,
        item.image,
        item.available ? 1 : 0,
        item.favorite ? 1 : 0,
        JSON.stringify(item.variants)
      );
      for (const v of item.variants) {
        insertVarStmt.run(v.id, item.id, v.label, v.price);
      }
    }
  }

  return db;
}

export function getDB(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dataDir = resolveDataDir();
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    dbInstance = initDatabase(dbPath);
    return dbInstance;
  } catch (err: any) {
    console.error(`SQLite database error at ${dbPath}:`, err);
    if (err?.code === 'ERR_SQLITE_ERROR' || String(err).includes('malformed') || String(err).includes('corrupt')) {
      const backupCorruptedPath = `${dbPath}.corrupted.${Date.now()}`;
      try {
        if (fs.existsSync(dbPath)) {
          fs.renameSync(dbPath, backupCorruptedPath);
        }
        if (fs.existsSync(`${dbPath}-wal`)) {
          try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
        }
        if (fs.existsSync(`${dbPath}-shm`)) {
          try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}
        }
      } catch (backupErr) {
        console.error('Failed to handle corrupted database files:', backupErr);
      }
      dbInstance = initDatabase(dbPath);
      return dbInstance;
    }
    throw err;
  }
}

// ----------------------------------------------------
// Settings Management
// ----------------------------------------------------
export function getSettings(): DBSettings {
  const db = getDB();
  const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('pos_config') as any;
  if (!row) return DEFAULT_SETTINGS;

  let rName = row.restaurantName || DEFAULT_SETTINGS.restaurantName;
  let rLogo = row.logo || DEFAULT_SETTINGS.logo;
  let rPhone = row.phone || DEFAULT_SETTINGS.phone;
  let rAddress = row.address || DEFAULT_SETTINGS.address;

  if (!rName || rName.toLowerCase().includes('timergara') || rName.toLowerCase().includes('tiemargar')) {
    rName = 'MALANG JAN RESTURANT';
  }
  if (rPhone === '+92 300 1234567') {
    rPhone = '03229339158';
  }
  if (rLogo === ' ' || !rLogo) {
    rLogo = '/logo.png';
  }

  return {
    restaurantName: rName,
    logo: rLogo,
    address: rAddress,
    phone: rPhone,
    currency: row.currency || DEFAULT_SETTINGS.currency,
    receiptFooter: row.receiptFooter || DEFAULT_SETTINGS.receiptFooter,
    receiptFormat: row.receiptFormat || DEFAULT_SETTINGS.receiptFormat,
    printerWidth: (row.printer_width || row.printerWidth || DEFAULT_SETTINGS.printerWidth) as '58mm' | '80mm',
    nextOrderNumber: Number(row.nextOrderNumber) || 1,
    theme: row.theme || 'dark',
  };
}

export function updateSettings(settings: Partial<DBSettings>): DBSettings {
  const db = getDB();
  const current = getSettings();
  const updated: DBSettings = { ...current, ...settings };

  db.prepare(
    `UPDATE settings SET
      restaurantName = ?,
      logo = ?,
      address = ?,
      phone = ?,
      currency = ?,
      receiptFooter = ?,
      receiptFormat = ?,
      printer_width = ?,
      nextOrderNumber = ?,
      theme = ?
     WHERE id = ?`
  ).run(
    updated.restaurantName,
    updated.logo,
    updated.address,
    updated.phone,
    updated.currency,
    updated.receiptFooter,
    updated.receiptFormat,
    updated.printerWidth || '80mm',
    updated.nextOrderNumber,
    updated.theme,
    'pos_config'
  );

  return updated;
}

// ----------------------------------------------------
// Menu & Variants Management (Relational SQLite)
// ----------------------------------------------------
export function getMenuItems(): DBMenuItem[] {
  const db = getDB();
  const itemRows = db.prepare('SELECT * FROM menu_items').all() as any[];
  const variantRows = db.prepare('SELECT * FROM menu_item_variants ORDER BY price ASC').all() as any[];

  const variantsByItem = new Map<string, Array<{ id: string; label: string; price: number }>>();
  for (const v of variantRows) {
    const list = variantsByItem.get(v.menu_item_id) || [];
    list.push({
      id: v.id,
      label: v.label,
      price: Number(v.price) || 0,
    });
    variantsByItem.set(v.menu_item_id, list);
  }

  return itemRows.map((r) => {
    let variants = variantsByItem.get(r.id);
    if (!variants || variants.length === 0) {
      try {
        variants = JSON.parse(r.variants_json || '[]');
      } catch (_) {
        variants = [];
      }
    }
    const rawImg = r.image ? String(r.image).trim() : '';
    const isRealImage = rawImg.startsWith('data:') || rawImg.startsWith('http:') || rawImg.startsWith('https:') || rawImg.startsWith('/');
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      image: isRealImage ? rawImg : '',
      available: Boolean(r.available),
      favorite: Boolean(r.favorite),
      variants: variants || [],
    };
  });
}

export function saveMenuItem(item: DBMenuItem): DBMenuItem {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(item.id);
  const variantsJson = JSON.stringify(item.variants || []);

  if (existing) {
    db.prepare(
      `UPDATE menu_items SET
        name = ?,
        description = ?,
        image = ?,
        available = ?,
        favorite = ?,
        variants_json = ?
       WHERE id = ?`
    ).run(
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      variantsJson,
      item.id
    );
  } else {
    db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      item.id,
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      variantsJson
    );
  }

  db.prepare('DELETE FROM menu_item_variants WHERE menu_item_id = ?').run(item.id);
  const insertVariantStmt = db.prepare(`
    INSERT INTO menu_item_variants (id, menu_item_id, label, price)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < (item.variants || []).length; i++) {
    const v = item.variants[i];
    const vId = v.id || `var_${item.id}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    insertVariantStmt.run(vId, item.id, v.label, Number(v.price) || 0);
  }

  return item;
}

export function deleteMenuItem(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM menu_item_variants WHERE menu_item_id = ?').run(id);
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  return true;
}

// ----------------------------------------------------
// Orders Management (Complete Text/JSON Record Storage)
// ----------------------------------------------------
export function getOrders(): DBOrder[] {
  const db = getDB();
  const orderRows = db.prepare('SELECT order_data FROM orders').all() as any[];
  const orders: DBOrder[] = [];

  for (const r of orderRows) {
    if (r.order_data) {
      try {
        const order = JSON.parse(r.order_data);
        orders.push(order);
      } catch (err) {
        console.error('Failed to parse order JSON record:', err);
      }
    }
  }

  orders.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return (b.orderNumber || 0) - (a.orderNumber || 0);
  });

  return orders;
}

export function createOrder(orderData: Partial<DBOrder> & { items: DBOrderItem[]; subtotal: number; total: number }): DBOrder {
  const db = getDB();
  const settings = getSettings();
  const orderNumber = settings.nextOrderNumber;
  const id = orderData.id || `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const customerName = orderData.customerName !== undefined ? String(orderData.customerName) : '';
  const tableNumber = orderData.tableNumber !== undefined ? String(orderData.tableNumber) : '';
  const createdAt = orderData.createdAt || new Date().toISOString();
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const subtotal = Number(orderData.subtotal) || 0;
  const discount = Number(orderData.discount) || 0;
  const total = Number(orderData.total) || 0;
  const paymentStatus = orderData.paymentStatus === 'paid' ? 'paid' : 'unpaid';
  const paymentDate = orderData.paymentDate || (paymentStatus === 'paid' ? new Date().toISOString() : null);
  const stage = orderData.stage === 'completed' ? 'completed' : 'active';

  const order: DBOrder = {
    ...orderData,
    id,
    orderNumber,
    customerName,
    tableNumber,
    createdAt,
    items,
    subtotal,
    discount,
    total,
    paymentStatus,
    paymentDate,
    stage,
  };

  const orderJson = JSON.stringify(order, null, 2);
  db.prepare('INSERT INTO orders (id, order_data) VALUES (?, ?)').run(order.id, orderJson);

  db.prepare('UPDATE settings SET nextOrderNumber = ? WHERE id = ?').run(orderNumber + 1, 'pos_config');

  if (customerName && customerName.trim().toLowerCase() !== 'walk-in') {
    upsertCustomerRecord(db, { name: customerName, lastVisit: createdAt, orderSpent: total });
  }

  return order;
}

export function updateOrder(id: string, patch: Partial<DBOrder>): DBOrder | null {
  const db = getDB();
  const existing = db.prepare('SELECT order_data FROM orders WHERE id = ?').get(id) as any;
  if (!existing || !existing.order_data) return null;

  let current: DBOrder;
  try {
    current = JSON.parse(existing.order_data);
  } catch (err) {
    console.error('Failed to parse existing order JSON:', err);
    return null;
  }

  const updated: DBOrder = {
    ...current,
    ...patch,
  };

  if (patch.items !== undefined && patch.total === undefined) {
    const subtotal = (updated.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
    updated.subtotal = subtotal;
    updated.total = Math.max(0, subtotal - (Number(updated.discount) || 0));
  }

  const orderJson = JSON.stringify(updated, null, 2);
  db.prepare('UPDATE orders SET order_data = ? WHERE id = ?').run(orderJson, id);

  if (updated.customerName && updated.customerName.trim().toLowerCase() !== 'walk-in') {
    upsertCustomerRecord(db, { name: updated.customerName, lastVisit: updated.createdAt, orderSpent: updated.total });
  }

  return updated;
}

export function deleteOrder(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  return true;
}

export function clearAllOrders(): boolean {
  const db = getDB();
  db.prepare('DELETE FROM orders').run();
  return true;
}

// ----------------------------------------------------
// Customers Management (Relational SQLite)
// ----------------------------------------------------
export function getCustomers(): DBCustomer[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM customers ORDER BY last_visit DESC, updated_at DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    cnic: r.cnic || '',
    totalOrders: Number(r.total_orders) || 0,
    totalSpent: Number(r.total_spent) || 0,
    lastVisit: r.last_visit || r.updated_at || r.created_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ----------------------------------------------------
// Employees Management
// ----------------------------------------------------
export function getEmployees(): DBEmployee[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM employees ORDER BY createdAt DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    salary: Number(r.salary) || 0,
    createdAt: r.createdAt,
  }));
}

export function saveEmployee(emp: DBEmployee): DBEmployee {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(emp.id);

  if (existing) {
    db.prepare(
      `UPDATE employees SET
        name = ?,
        phone = ?,
        salary = ?
       WHERE id = ?`
    ).run(emp.name, emp.phone, Number(emp.salary) || 0, emp.id);
  } else {
    db.prepare(
      `INSERT INTO employees (id, name, phone, salary, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(emp.id, emp.name, emp.phone, Number(emp.salary) || 0, emp.createdAt || new Date().toISOString());
  }

  return emp;
}

export function deleteEmployee(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  return true;
}

// ----------------------------------------------------
// Defaults Reset & Backup Import
// ----------------------------------------------------
export function resetAllDataToDefaults(): void {
  const db = getDB();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM menu_item_variants').run();
  db.prepare('DELETE FROM menu_items').run();
  db.prepare(
    `UPDATE settings SET
      restaurantName = ?,
      logo = ?,
      address = ?,
      phone = ?,
      currency = ?,
      receiptFooter = ?,
      receiptFormat = ?,
      nextOrderNumber = ?,
      theme = ?
     WHERE id = ?`
  ).run(
    DEFAULT_SETTINGS.restaurantName,
    DEFAULT_SETTINGS.logo,
    DEFAULT_SETTINGS.address,
    DEFAULT_SETTINGS.phone,
    DEFAULT_SETTINGS.currency,
    DEFAULT_SETTINGS.receiptFooter,
    DEFAULT_SETTINGS.receiptFormat,
    1,
    DEFAULT_SETTINGS.theme,
    'pos_config'
  );

  const insertStmt = db.prepare(
    `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertVarStmt = db.prepare(
    `INSERT INTO menu_item_variants (id, menu_item_id, label, price)
     VALUES (?, ?, ?, ?)`
  );

  for (const item of DEFAULT_MENU_ITEMS) {
    insertStmt.run(
      item.id,
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      JSON.stringify(item.variants)
    );
    for (const v of item.variants) {
      insertVarStmt.run(v.id, item.id, v.label, v.price);
    }
  }
}

export function importBackupData(data: {
  settings?: Partial<DBSettings>;
  menuItems?: DBMenuItem[];
  orders?: DBOrder[];
  employees?: DBEmployee[];
}): void {
  const db = getDB();

  if (data.settings) {
    updateSettings(data.settings);
  }

  if (Array.isArray(data.menuItems) && data.menuItems.length > 0) {
    db.prepare('DELETE FROM menu_item_variants').run();
    db.prepare('DELETE FROM menu_items').run();

    const insertStmt = db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertVarStmt = db.prepare(
      `INSERT INTO menu_item_variants (id, menu_item_id, label, price)
       VALUES (?, ?, ?, ?)`
    );

    for (const item of data.menuItems) {
      insertStmt.run(
        item.id,
        item.name,
        item.description,
        item.image,
        item.available ? 1 : 0,
        item.favorite ? 1 : 0,
        JSON.stringify(item.variants || [])
      );
      if (Array.isArray(item.variants)) {
        for (let i = 0; i < item.variants.length; i++) {
          const v = item.variants[i];
          const vId = v.id || `var_${item.id}_${i}_${Math.random().toString(36).slice(2, 6)}`;
          insertVarStmt.run(vId, item.id, v.label, Number(v.price) || 0);
        }
      }
    }
  }

  if (Array.isArray(data.orders)) {
    db.prepare('DELETE FROM orders').run();
    const insertOrderStmt = db.prepare('INSERT INTO orders (id, order_data) VALUES (?, ?)');
    for (const order of data.orders) {
      if (order && order.id) {
        insertOrderStmt.run(order.id, JSON.stringify(order, null, 2));
      }
    }
    syncCustomersFromOrders(db);
  }

  if (Array.isArray(data.employees)) {
    db.prepare('DELETE FROM employees').run();
    const insertEmpStmt = db.prepare(
      `INSERT INTO employees (id, name, phone, salary, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const emp of data.employees) {
      insertEmpStmt.run(
        emp.id,
        emp.name,
        emp.phone || '',
        Number(emp.salary) || 0,
        emp.createdAt || new Date().toISOString()
      );
    }
  }
}
