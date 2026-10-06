// tests/integration/api.test.js
// Integration-тесты — проверяют связку МАРШРУТ ↔ SQLite БД ↔ СЕССИЯ,
// то есть взаимодействие как минимум двух компонентов вместе (в отличие от Unit).
// Для изоляции от рабочих данных каждый прогон использует отдельный временный файл БД.

const path = require('path');
const fs = require('fs');
const os = require('os');

let app, request;
const TMP_DB = path.join(os.tmpdir(), 'shopkz-test-' + Date.now() + '.db');

beforeAll(() => {
  process.env.SHOPKZ_DB_PATH = TMP_DB;
  jest.resetModules();
  app = require('../../server');
  request = require('supertest');
});

afterAll(() => {
  [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
});

describe('IT-01: Регистрация ↔ таблица users ↔ сессия', () => {
  test('после регистрации GET /api/me возвращает нового пользователя', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/register').send({
      email: 'ivan@test.kz', password: 'pass123', name: 'Иван Иванов', phone: '+7 701 000 00 00'
    });
    expect(reg.status).toBe(200);
    expect(reg.body.user.email).toBe('ivan@test.kz');

    const me = await agent.get('/api/me');
    expect(me.body.user.email).toBe('ivan@test.kz');
  });

  test('повторная регистрация с тем же email → ошибка 400 (компонент валидации ↔ БД)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({ email: 'dup@test.kz', password: 'pass123', name: 'Тест' });
    const res = await agent.post('/api/register').send({ email: 'dup@test.kz', password: 'pass123', name: 'Тест2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/уже зарегистрирован/);
  });
});

describe('IT-02: Логин ↔ bcrypt ↔ users', () => {
  test('верные учётные данные seed-пользователя → успешный вход', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('customer');
  });
  test('неверный пароль → 400 и понятная ошибка', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'wrongpass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Неверный/);
  });
});

describe('IT-03: Корзина ↔ таблица products ↔ таблица carts', () => {
  test('добавление товара в корзину отражается в GET /api/cart', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });

    const add = await agent.post('/api/cart').send({ productId: 'p001', qty: 2 });
    expect(add.status).toBe(200);
    expect(add.body.items.find(i => i.productId === 'p001').qty).toBe(2);

    const cart = await agent.get('/api/cart');
    expect(cart.body.items.length).toBe(1);
  });

  test('количество не может превысить остаток на складе (p002 stock=3)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });
    await agent.post('/api/cart').send({ productId: 'p002', qty: 10 });
    const cart = await agent.get('/api/cart');
    const item = cart.body.items.find(i => i.productId === 'p002');
    expect(item.qty).toBeLessThanOrEqual(item.stock);
  });

  test('нельзя добавить товар с нулевым остатком (p003 stock=0)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });
    const res = await agent.post('/api/cart').send({ productId: 'p003', qty: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/наличии/);
  });
});

describe('IT-04: Оформление заказа ↔ cart ↔ products ↔ orders (несколько таблиц сразу)', () => {
  test('заказ создаётся, остаток товара уменьшается, корзина очищается', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({ email: 'buyer@test.kz', password: 'pass123', name: 'Покупатель' });

    const before = await agent.get('/api/products/p004');
    const stockBefore = before.body.product.stock;

    await agent.post('/api/cart').send({ productId: 'p004', qty: 2 });
    const order = await agent.post('/api/orders').send({
      address: 'г. Астана, ул. Тестовая 1', phone: '+7 700 111 22 33',
      payment: 'card', cardNumber: '4532015112830366', cardExpiry: '12/27', cardCvv: '123'
    });

    expect(order.status).toBe(200);
    expect(order.body.order.status).toBe('processing');

    const after = await agent.get('/api/products/p004');
    expect(after.body.product.stock).toBe(stockBefore - 2);

    const cart = await agent.get('/api/cart');
    expect(cart.body.items.length).toBe(0);
  });

  test('оплата тестовой картой-отказом 4000000000000002 → заказ НЕ создаётся', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({ email: 'declined@test.kz', password: 'pass123', name: 'Тест Отказ' });
    await agent.post('/api/cart').send({ productId: 'p005', qty: 1 });
    const order = await agent.post('/api/orders').send({
      address: 'г. Алматы', phone: '+7 700 000 00 01',
      payment: 'card', cardNumber: '4000 0000 0000 0002', cardExpiry: '12/27', cardCvv: '123'
    });
    expect(order.status).toBe(402);
    expect(order.body.error).toMatch(/отклонён/);
  });
});

describe('IT-05: Права доступа ↔ сессия ↔ admin-маршруты', () => {
  test('обычный пользователь не может зайти в /api/admin/overview (403)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });
    const res = await agent.get('/api/admin/overview');
    expect(res.status).toBe(403);
  });
  test('администратор получает доступ к /api/admin/overview (200)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'admin@shopkz.kz', password: 'admin123' });
    const res = await agent.get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalOrders');
  });
  test('неавторизованный запрос к /api/cart → 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });
});

describe('IT-06 (обнаружение дефекта D-01): повторная отмена заказа', () => {
  test('повторный вызов /cancel на уже отменённом заказе не должен повторно пополнять склад', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({ email: 'cancel@test.kz', password: 'pass123', name: 'Тест Отмена' });

    const before = await agent.get('/api/products/p006');
    const stockBefore = before.body.product.stock;

    await agent.post('/api/cart').send({ productId: 'p006', qty: 1 });
    const orderRes = await agent.post('/api/orders').send({
      address: 'г. Шымкент', phone: '+7 700 222 33 44',
      payment: 'ewallet'
    });
    const orderId = orderRes.body.order.id;

    // первая отмена — ожидаемо возвращает товар на склад
    await agent.post('/api/orders/' + orderId + '/cancel');
    const afterFirstCancel = await agent.get('/api/products/p006');
    expect(afterFirstCancel.body.product.stock).toBe(stockBefore); // товар вернулся

    // повторная отмена уже отменённого заказа — склад НЕ должен измениться повторно
    await agent.post('/api/orders/' + orderId + '/cancel');
    const afterSecondCancel = await agent.get('/api/products/p006');
    expect(afterSecondCancel.body.product.stock).toBe(stockBefore); // ожидание: осталось столько же
  });
});
