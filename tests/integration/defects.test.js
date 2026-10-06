// tests/integration/defects.test.js
// Целевые тесты для проверки подозрительных мест в API (обнаружение дефектов D-02, D-03).

const path = require('path');
const fs = require('fs');
const os = require('os');

let app, request;
const TMP_DB = path.join(os.tmpdir(), 'shopkz-defects-' + Date.now() + '.db');

beforeAll(() => {
  process.env.SHOPKZ_DB_PATH = TMP_DB;
  jest.resetModules();
  app = require('../../server');
  request = require('supertest');
});
afterAll(() => {
  [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
});

describe('D-02: PUT /api/admin/products/:id — валидация на сервере', () => {
  test('админ не должен иметь возможность сохранить отрицательную цену через прямой запрос к API', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'admin@shopkz.kz', password: 'admin123' });
    const res = await agent.put('/api/admin/products/p001').send({
      name: 'Наушники', category: 'Электроника', price: -500, stock: 10, img: '', desc: ''
    });
    // Ожидание: сервер должен отклонить некорректную цену (400)
    expect(res.status).toBe(400);
  });
});

describe('D-03: POST /api/products/:id/reviews — товар должен существовать', () => {
  test('нельзя оставить отзыв на несуществующий товар', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' });
    const res = await agent.post('/api/products/NOT_EXISTING_ID/reviews').send({ rating: 5, text: 'Отлично' });
    expect(res.status).toBe(404);
  });
});
