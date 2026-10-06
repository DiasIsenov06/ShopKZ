// tests/acceptance/acceptance.test.js
// Acceptance-тесты проверяют БИЗНЕС-КРИТЕРИИ ПРИЁМКИ (что должен получить заказчик/пользователь),
// а не техническую связку компонентов — в этом их отличие от Integration-тестов.
// Формат — Given / When / Then, критерии AC-01..AC-05 см. в отчёте (Тапсырма 11).

const path = require('path');
const fs = require('fs');
const os = require('os');

let app, request;
const TMP_DB = path.join(os.tmpdir(), 'shopkz-acceptance-' + Date.now() + '.db');

beforeAll(() => {
  process.env.SHOPKZ_DB_PATH = TMP_DB;
  jest.resetModules();
  app = require('../../server');
  request = require('supertest');
});
afterAll(() => {
  [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
});

test('AC-01: успешное оформление заказа авторизованным клиентом с валидной картой', async () => {
  // Given: авторизованный клиент с товаром в корзине
  const agent = request.agent(app);
  await agent.post('/api/register').send({ email: 'ac01@test.kz', password: 'pass123', name: 'Клиент AC01' });
  await agent.post('/api/cart').send({ productId: 'p007', qty: 1 });

  // When: клиент оформляет заказ с корректными данными доставки и валидной картой
  const res = await agent.post('/api/orders').send({
    address: 'г. Актобе, ул. Абулхаир хана 5', phone: '+7 705 111 22 33',
    payment: 'card', cardNumber: '4532015112830366', cardExpiry: '10/27', cardCvv: '321'
  });

  // Then: заказ создан со статусом "processing", клиент может увидеть его в своих заказах
  expect(res.status).toBe(200);
  expect(res.body.order.status).toBe('processing');
  const orders = await agent.get('/api/orders');
  expect(orders.body.orders.length).toBe(1);
});

test('AC-02: заказ с картой-отказом не создаётся и клиент видит понятную причину', async () => {
  // Given: клиент с товаром в корзине
  const agent = request.agent(app);
  await agent.post('/api/register').send({ email: 'ac02@test.kz', password: 'pass123', name: 'Клиент AC02' });
  await agent.post('/api/cart').send({ productId: 'p008', qty: 1 });

  // When: клиент пытается оплатить тестовой картой-отказом
  const res = await agent.post('/api/orders').send({
    address: 'г. Павлодар', phone: '+7 705 000 11 22',
    payment: 'card', cardNumber: '4000000000000002', cardExpiry: '10/27', cardCvv: '321'
  });

  // Then: заказ не создан, клиенту показана причина отказа
  expect(res.status).toBe(402);
  expect(res.body.error.length).toBeGreaterThan(0);
  const orders = await agent.get('/api/orders');
  expect(orders.body.orders.length).toBe(0);
});

test('AC-03: бесплатная отмена заказа возможна только в первые 30 минут', async () => {
  // Given: у клиента есть только что оформленный заказ
  const agent = request.agent(app);
  await agent.post('/api/register').send({ email: 'ac03@test.kz', password: 'pass123', name: 'Клиент AC03' });
  await agent.post('/api/cart').send({ productId: 'p009', qty: 1 });
  const order = await agent.post('/api/orders').send({
    address: 'г. Костанай', phone: '+7 705 333 44 55', payment: 'ewallet'
  });

  // When: клиент отменяет заказ сразу после оформления
  const cancel = await agent.post('/api/orders/' + order.body.order.id + '/cancel');

  // Then: заказ отменяется бесплатно (без обращения в поддержку)
  expect(cancel.body.status).toBe('cancelled');
});

test('AC-04: нельзя купить товар, которого нет в наличии', async () => {
  // Given: клиент и товар с нулевым остатком (p003)
  const agent = request.agent(app);
  await agent.post('/api/register').send({ email: 'ac04@test.kz', password: 'pass123', name: 'Клиент AC04' });

  // When: клиент пытается добавить товар с нулевым остатком в корзину
  const res = await agent.post('/api/cart').send({ productId: 'p003', qty: 1 });

  // Then: система отказывает с понятным сообщением
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/наличии/);
});

test('AC-05: промокод корректно уменьшает сумму заказа на заявленный процент', async () => {
  // Given: клиент с товаром на известную сумму в корзине
  const agent = request.agent(app);
  await agent.post('/api/register').send({ email: 'ac05@test.kz', password: 'pass123', name: 'Клиент AC05' });
  const productRes = await agent.get('/api/products/p010');
  const price = productRes.body.product.price;
  await agent.post('/api/cart').send({ productId: 'p010', qty: 1 });

  // When: клиент применяет промокод SALE10 (-10%) и оформляет заказ
  const order = await agent.post('/api/orders').send({
    address: 'г. Тараз', phone: '+7 705 777 88 99', payment: 'ewallet', promoCode: 'SALE10'
  });

  // Then: итоговая сумма ровно на 10% меньше цены товара
  expect(order.body.order.total).toBe(Math.round(price * 0.9));
});
