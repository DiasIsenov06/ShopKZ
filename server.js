// server.js — REST API + раздача статики (public/) для сайта ShopKZ.
// Запуск: npm install && npm start   →  http://localhost:3000

require('dotenv').config(); // подхватывает .env, если он есть (см. .env.example)

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { genId, luhnOk, calcAverageRating, calcOrderTotal, isValidEmail, isFreeCancelWindow } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'shopkz-demo-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 часов
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Требуется авторизация.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора.' });
  }
  next();
}
function publicUser(u) {
  return { email: u.email, name: u.name, phone: u.phone, address: u.address, role: u.role };
}
function withRatings(p) {
  const revs = db.prepare('SELECT rating FROM reviews WHERE product_id=?').all(p.id);
  return { ...p, avgRating: calcAverageRating(revs), reviewCount: revs.length };
}
function cartWithProducts(email) {
  const rows = db.prepare('SELECT product_id,qty FROM carts WHERE user_email=?').all(email);
  return rows.map(r => {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(r.product_id);
    if (!p) return null;
    return { productId: p.id, name: p.name, price: p.price, img: p.img, stock: p.stock, qty: r.qty };
  }).filter(Boolean);
}
function rowToOrder(row) {
  return { ...row, items: JSON.parse(row.items), history: JSON.parse(row.history) };
}

/* ============================== AUTH ============================== */
app.post('/api/register', (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Введите корректный email.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Введите имя.' });
  const emailNorm = email.toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(emailNorm)) {
    return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован.' });
  }
  db.prepare('INSERT INTO users (email,password,name,phone,address,role) VALUES (?,?,?,?,?,?)')
    .run(emailNorm, bcrypt.hashSync(password, 10), name.trim(), phone || '', '', 'customer');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(emailNorm);
  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(400).json({ error: 'Неверный email или пароль.' });
  }
  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', (req, res) => { res.json({ user: req.session.user || null }); });

/* ============================ PRODUCTS ============================ */
app.get('/api/products', (req, res) => {
  const { search, category, sort } = req.query;
  let products = db.prepare('SELECT * FROM products').all().map(withRatings);
  if (category && category !== 'Все') products = products.filter(p => p.category === category);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(String(search).toLowerCase()));
  if (sort === 'price_asc') products.sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') products.sort((a, b) => b.price - a.price);
  if (sort === 'rating') products.sort((a, b) => b.avgRating - a.avgRating);
  res.json({ products });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Товар не найден.' });
  const reviews = db.prepare('SELECT author,rating,text,created_at as at FROM reviews WHERE product_id=? ORDER BY created_at DESC').all(p.id);
  res.json({ product: withRatings(p), reviews });
});

app.post('/api/products/:id/reviews', requireAuth, (req, res) => {
  const { rating, text } = req.body;
  if (!db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ error: 'Товар не найден.' }); // fix D-03: товар должен существовать
  }
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Некорректная оценка.' });
  db.prepare('INSERT INTO reviews (product_id,author,rating,text,created_at) VALUES (?,?,?,?,?)')
    .run(req.params.id, req.session.user.name, rating, (text || '').trim(), Date.now());
  res.json({ ok: true });
});

/* ============================== CART =============================== */
app.get('/api/cart', requireAuth, (req, res) => res.json({ items: cartWithProducts(req.session.user.email) }));

app.post('/api/cart', requireAuth, (req, res) => {
  const { productId, qty } = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!p) return res.status(404).json({ error: 'Товар не найден.' });
  if (p.stock <= 0) return res.status(400).json({ error: 'Товара нет в наличии.' });
  const existing = db.prepare('SELECT * FROM carts WHERE user_email=? AND product_id=?').get(req.session.user.email, productId);
  const newQty = Math.min((existing ? existing.qty : 0) + (qty || 1), p.stock);
  if (existing) db.prepare('UPDATE carts SET qty=? WHERE user_email=? AND product_id=?').run(newQty, req.session.user.email, productId);
  else db.prepare('INSERT INTO carts (user_email,product_id,qty) VALUES (?,?,?)').run(req.session.user.email, productId, newQty);
  res.json({ items: cartWithProducts(req.session.user.email) });
});

app.put('/api/cart/:productId', requireAuth, (req, res) => {
  const { qty } = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.productId);
  if (qty <= 0) {
    db.prepare('DELETE FROM carts WHERE user_email=? AND product_id=?').run(req.session.user.email, req.params.productId);
  } else {
    const clamped = Math.min(qty, p ? p.stock : qty);
    db.prepare('UPDATE carts SET qty=? WHERE user_email=? AND product_id=?').run(clamped, req.session.user.email, req.params.productId);
  }
  res.json({ items: cartWithProducts(req.session.user.email) });
});

app.delete('/api/cart/:productId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM carts WHERE user_email=? AND product_id=?').run(req.session.user.email, req.params.productId);
  res.json({ items: cartWithProducts(req.session.user.email) });
});

/* ============================ WISHLIST ============================= */
app.get('/api/wishlist', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT product_id FROM wishlists WHERE user_email=?').all(req.session.user.email);
  const products = rows.map(r => db.prepare('SELECT * FROM products WHERE id=?').get(r.product_id)).filter(Boolean).map(withRatings);
  res.json({ products, ids: rows.map(r => r.product_id) });
});

app.post('/api/wishlist/:productId', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM wishlists WHERE user_email=? AND product_id=?').get(req.session.user.email, req.params.productId);
  if (existing) {
    db.prepare('DELETE FROM wishlists WHERE user_email=? AND product_id=?').run(req.session.user.email, req.params.productId);
    res.json({ wished: false });
  } else {
    db.prepare('INSERT INTO wishlists (user_email,product_id) VALUES (?,?)').run(req.session.user.email, req.params.productId);
    res.json({ wished: true });
  }
});

/* ============================== PROMO =============================== */
app.post('/api/promo/apply', requireAuth, (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  const promo = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(code);
  if (!promo) return res.status(400).json({ error: 'Промокод не найден или недействителен.' });
  res.json({ promo });
});

/* ============================== ORDERS =============================== */
app.post('/api/orders', requireAuth, (req, res) => {
  const { address, phone, payment, cardNumber, cardExpiry, cardCvv, promoCode } = req.body;
  const email = req.session.user.email;
  const cart = cartWithProducts(email);
  if (!cart.length) return res.status(400).json({ error: 'Корзина пуста.' });
  if (!address || !address.trim()) return res.status(400).json({ error: 'Укажите адрес доставки.' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Укажите номер телефона.' });
  // Практическая №5, D5-01: отклоняем способы оплаты, отсутствующие в интерфейсе.
  if (!['card', 'ewallet'].includes(payment)) {
    return res.status(400).json({ error: 'Некорректный способ оплаты.' });
  }

  let discount = 0, promoUsed = null;
  if (promoCode) {
    const promo = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(promoCode.toUpperCase());
    if (!promo) return res.status(400).json({ error: 'Промокод недействителен.' });
    discount = promo.percent; promoUsed = promo.code;
  }

  if (payment === 'card') {
    const digits = (cardNumber || '').replace(/\D/g, '');
    if (digits.length !== 16) return res.status(400).json({ error: 'Номер карты должен содержать 16 цифр.' });
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry || '')) return res.status(400).json({ error: 'Введите срок действия в формате ММ/ГГ.' });
    // Практическая №5, D5-02: карта действительна до конца указанного месяца.
    const [expiryMonth, expiryYear] = cardExpiry.split('/').map(Number);
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    const fullExpiryYear = 2000 + expiryYear;
    if (expiryMonth < 1 || expiryMonth > 12 || fullExpiryYear < currentYear ||
        (fullExpiryYear === currentYear && expiryMonth < currentMonth)) {
      return res.status(400).json({ error: 'Срок действия карты некорректен или истёк.' });
    }
    if (!/^\d{3}$/.test(cardCvv || '')) return res.status(400).json({ error: 'CVV должен содержать 3 цифры.' });
    if (digits === '4000000000000002') return res.status(402).json({ error: 'Платёж отклонён банком-эмитентом. Проверьте данные карты или выберите другой способ оплаты.' });
    if (!luhnOk(digits)) return res.status(400).json({ error: 'Некорректный номер карты.' });
  }

  for (const item of cart) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.productId);
    if (!p || p.stock < item.qty) return res.status(400).json({ error: `Товара «${item.name}» уже недостаточно на складе.` });
  }

  const items = cart.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty, img: i.img }));
  items.forEach(i => db.prepare('UPDATE products SET stock = stock - ? WHERE id=?').run(i.qty, i.productId));

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = calcOrderTotal(subtotal, discount);
  const order = {
    id: genId('ORD-').toUpperCase(),
    user_email: email,
    items: JSON.stringify(items),
    subtotal, discount, total,
    address: address.trim(), phone: phone.trim(), payment,
    promo: promoUsed,
    status: 'processing',
    created_at: Date.now(),
    history: JSON.stringify([{ status: 'processing', at: Date.now() }])
  };
  db.prepare(`INSERT INTO orders (id,user_email,items,subtotal,discount,total,address,phone,payment,promo,status,created_at,history)
    VALUES (@id,@user_email,@items,@subtotal,@discount,@total,@address,@phone,@payment,@promo,@status,@created_at,@history)`).run(order);
  db.prepare('DELETE FROM carts WHERE user_email=?').run(email);

  res.json({ order: { ...order, items } });
});

app.get('/api/orders', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_email=? ORDER BY created_at DESC').all(req.session.user.email);
  res.json({ orders: rows.map(rowToOrder) });
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Заказ не найден.' });
  if (row.user_email !== req.session.user.email && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа.' });
  res.json({ order: rowToOrder(row) });
});

app.post('/api/orders/:id/cancel', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!row || row.user_email !== req.session.user.email) return res.status(404).json({ error: 'Заказ не найден.' });
  const order = rowToOrder(row);
  // fix D-01: отменять можно только заказ, ещё находящийся в обработке —
  // иначе повторный вызов повторно пополнял склад / отменял уже доставленный заказ.
  if (order.status !== 'processing') {
    return res.status(400).json({ error: 'Этот заказ уже нельзя отменить в текущем статусе: ' + order.status + '.' });
  }
  const freeWindow = isFreeCancelWindow(order.created_at);
  const newStatus = freeWindow ? 'cancelled' : 'pending_cancel';
  if (newStatus === 'cancelled') {
    order.items.forEach(i => db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(i.qty, i.productId));
  }
  order.history.push({ status: newStatus, at: Date.now() });
  db.prepare('UPDATE orders SET status=?, history=? WHERE id=?').run(newStatus, JSON.stringify(order.history), order.id);
  res.json({ status: newStatus });
});

/* ============================== PROFILE =============================== */
app.put('/api/profile', requireAuth, (req, res) => {
  const { name, phone, address } = req.body;
  db.prepare('UPDATE users SET name=?, phone=?, address=? WHERE email=?').run(name, phone, address, req.session.user.email);
  req.session.user = { ...req.session.user, name, phone, address };
  res.json({ user: req.session.user });
});

app.put('/api/profile/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(req.session.user.email);
  if (!bcrypt.compareSync(oldPassword || '', user.password)) return res.status(400).json({ error: 'Текущий пароль указан неверно.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Новый пароль должен содержать не менее 6 символов.' });
  db.prepare('UPDATE users SET password=? WHERE email=?').run(bcrypt.hashSync(newPassword, 10), req.session.user.email);
  res.json({ ok: true });
});

/* =============================== ADMIN ================================ */
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders').all().map(rowToOrder);
  const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const products = db.prepare('SELECT * FROM products').all();
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c;
  res.json({
    totalOrders: orders.length,
    revenue,
    users,
    lowStock: products.filter(p => p.stock > 0 && p.stock <= 3).length,
    outStock: products.filter(p => p.stock === 0).length
  });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json({ orders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all().map(rowToOrder) });
});

app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Заказ не найден.' });
  const order = rowToOrder(row);
  if (status === 'cancelled' && order.status !== 'cancelled') {
    order.items.forEach(i => db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(i.qty, i.productId));
  }
  order.history.push({ status, at: Date.now() });
  db.prepare('UPDATE orders SET status=?, history=? WHERE id=?').run(status, JSON.stringify(order.history), order.id);
  res.json({ ok: true });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { name, category, price, stock, img, desc } = req.body;
  if (!name || !category || !price || price <= 0) return res.status(400).json({ error: 'Заполните название, категорию и корректную цену.' });
  const id = genId('p');
  db.prepare('INSERT INTO products (id,name,category,price,stock,img,desc) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, category, price, stock || 0, img || `https://picsum.photos/seed/${id}/600/600`, desc || '');
  res.json({ ok: true, id });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { name, category, price, stock, img, desc } = req.body;
  if (!db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Товар не найден.' });
  // fix D-02: PUT не проверял входные данные (в отличие от POST) — цену/остаток можно было
  // отправить отрицательными или пустыми напрямую через API, минуя проверки на клиенте.
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Введите название товара.' });
  if (!category || !String(category).trim()) return res.status(400).json({ error: 'Введите категорию.' });
  if (price === undefined || price === null || Number(price) <= 0) return res.status(400).json({ error: 'Цена должна быть больше нуля.' });
  if (stock === undefined || stock === null || Number(stock) < 0) return res.status(400).json({ error: 'Остаток не может быть отрицательным.' });
  db.prepare('UPDATE products SET name=?,category=?,price=?,stock=?,img=?,desc=? WHERE id=?')
    .run(name, category, Number(price), Number(stock), img, desc, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/promos', requireAdmin, (req, res) => res.json({ promos: db.prepare('SELECT * FROM promos').all() }));

app.post('/api/admin/promos', requireAdmin, (req, res) => {
  const { code, percent } = req.body;
  const c = (code || '').trim().toUpperCase();
  if (!c || !percent || percent <= 0) return res.status(400).json({ error: 'Заполните код и процент скидки.' });
  if (db.prepare('SELECT code FROM promos WHERE code=?').get(c)) return res.status(400).json({ error: 'Такой промокод уже существует.' });
  db.prepare('INSERT INTO promos (code,percent,active) VALUES (?,?,1)').run(c, percent);
  res.json({ ok: true });
});

app.put('/api/admin/promos/:code/toggle', requireAdmin, (req, res) => {
  const promo = db.prepare('SELECT * FROM promos WHERE code=?').get(req.params.code);
  if (!promo) return res.status(404).json({ error: 'Не найден.' });
  db.prepare('UPDATE promos SET active=? WHERE code=?').run(promo.active ? 0 : 1, req.params.code);
  res.json({ ok: true });
});

// app.listen вызывается только при прямом запуске (node server.js),
// а не при require('./server') из тестов (supertest сам открывает порт).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  ShopKZ запущен: http://localhost:${PORT}\n`);
  });
}

module.exports = app;
