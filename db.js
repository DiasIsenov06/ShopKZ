// db.js — подключение к SQLite, создание схемы и начальное заполнение данными.
// Файл базы данных shopkz.db создаётся автоматически в корне проекта при первом запуске.

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// SHOPKZ_DB_PATH позволяет тестам подключать отдельную (временную) базу данных,
// не затрагивая рабочую shopkz.db.
const DB_PATH = process.env.SHOPKZ_DB_PATH || path.join(__dirname, 'shopkz.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name     TEXT NOT NULL,
  phone    TEXT DEFAULT '',
  address  TEXT DEFAULT '',
  role     TEXT DEFAULT 'customer'
);

CREATE TABLE IF NOT EXISTS products (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  price    INTEGER NOT NULL,
  stock    INTEGER NOT NULL DEFAULT 0,
  img      TEXT,
  desc     TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  items      TEXT NOT NULL,      -- JSON-массив позиций заказа
  subtotal   INTEGER,
  discount   INTEGER,
  total      INTEGER,
  address    TEXT,
  phone      TEXT,
  payment    TEXT,
  promo      TEXT,
  status     TEXT DEFAULT 'processing',
  created_at INTEGER,
  history    TEXT                -- JSON-массив истории статусов
);

CREATE TABLE IF NOT EXISTS carts (
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  PRIMARY KEY (user_email, product_id)
);

CREATE TABLE IF NOT EXISTS wishlists (
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (user_email, product_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  author     TEXT,
  rating     INTEGER,
  text       TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS promos (
  code    TEXT PRIMARY KEY,
  percent INTEGER,
  active  INTEGER DEFAULT 1
);
`);

/* ------------------------------------------------------------- seed data */
const productCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
if (productCount === 0) {
  const seedProducts = [
    ['p001', 'Беспроводные наушники AirBeat Pro', 'Электроника', 24900, 14, 'https://picsum.photos/seed/shopkz-headph/600/600', 'Bluetooth 5.3, активное шумоподавление, до 30 часов работы от аккумулятора.'],
    ['p002', 'Смарт-часы Pulse Watch 2', 'Электроника', 38500, 3, 'https://picsum.photos/seed/shopkz-watch/600/600', 'Мониторинг пульса и сна, GPS, водозащита 5 ATM, поддержка звонков.'],
    ['p003', 'Повербанк VoltCell 20000mAh', 'Электроника', 9900, 0, 'https://picsum.photos/seed/shopkz-power/600/600', 'Быстрая зарядка 22.5W, два USB-A порта и один USB-C.'],
    ['p004', 'Клавиатура механическая KeyForge', 'Электроника', 21500, 9, 'https://picsum.photos/seed/shopkz-kb/600/600', 'RGB-подсветка, hot-swap переключатели, USB-C кабель в комплекте.'],
    ['p005', 'Куртка утеплённая StormLine', 'Одежда', 32900, 18, 'https://picsum.photos/seed/shopkz-jacket/600/600', 'Мембранная ткань, подкладка из синтепона, для температуры до -25°C.'],
    ['p006', 'Кроссовки городские UrbanStep', 'Одежда', 18700, 22, 'https://picsum.photos/seed/shopkz-shoes/600/600', 'Лёгкая амортизирующая подошва, сетчатый верх, дышащий материал.'],
    ['p007', 'Свитер шерстяной Nomad Wool', 'Одежда', 14300, 5, 'https://picsum.photos/seed/shopkz-sweater/600/600', '100% мериносовая шерсть, ручная вязка, унисекс.'],
    ['p008', 'Кофемашина BrewMaster Home', 'Бытовая техника', 54900, 7, 'https://picsum.photos/seed/shopkz-coffee/600/600', 'Автоматический капучинатор, 15 бар давления, съёмный резервуар 1.8л.'],
    ['p009', 'Робот-пылесос CleanBot X3', 'Бытовая техника', 69900, 4, 'https://picsum.photos/seed/shopkz-vacuum/600/600', 'Лазерная навигация, влажная уборка, управление через приложение.'],
    ['p010', 'Фен Aero Style 2200W', 'Бытовая техника', 11200, 16, 'https://picsum.photos/seed/shopkz-dryer/600/600', 'Ионизация воздуха, 3 режима температуры, концентратор в комплекте.'],
    ['p011', 'Набор кастрюль SteelChef 5в1', 'Бытовая техника', 27800, 6, 'https://picsum.photos/seed/shopkz-pots/600/600', 'Нержавеющая сталь, индукционное дно, стеклянные крышки.'],
    ['p012', 'Рюкзак городской TrekPack 25L', 'Одежда', 15900, 11, 'https://picsum.photos/seed/shopkz-bag/600/600', 'Отделение для ноутбука 15", влагостойкая ткань, USB-выход для зарядки.']
  ];
  const insert = db.prepare('INSERT INTO products (id,name,category,price,stock,img,desc) VALUES (?,?,?,?,?,?,?)');
  seedProducts.forEach(p => insert.run(...p));
  console.log('[seed] Добавлено товаров:', seedProducts.length);
}

const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (userCount === 0) {
  const insertUser = db.prepare('INSERT INTO users (email,password,name,phone,address,role) VALUES (?,?,?,?,?,?)');
  insertUser.run('admin@shopkz.kz', bcrypt.hashSync('admin123', 10), 'Администратор', '', '', 'admin');
  insertUser.run('test@shopkz.kz', bcrypt.hashSync('test1234', 10), 'Тестовый пользователь', '+7 700 123 45 67', 'г. Алматы, ул. Абая 10', 'customer');
  console.log('[seed] Созданы тестовые пользователи: admin@shopkz.kz / admin123, test@shopkz.kz / test1234');
}

const promoCount = db.prepare('SELECT COUNT(*) c FROM promos').get().c;
if (promoCount === 0) {
  db.prepare('INSERT INTO promos (code,percent,active) VALUES (?,?,1)').run('SALE10', 10);
  db.prepare('INSERT INTO promos (code,percent,active) VALUES (?,?,1)').run('WELCOME15', 15);
  console.log('[seed] Добавлены промокоды: SALE10, WELCOME15');
}

module.exports = db;
