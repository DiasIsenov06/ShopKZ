// Практическая №5: кейсы проверяют API оформления и реальные изменения SQLite.
const fs = require('fs');
const path = require('path');
const os = require('os');
const request = require('supertest');
const cases = require('../../practical5/cases.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopkz-pr5-'));
let app, db;
const results = [];
const phase = process.env.PRACTICAL5_REPORT_PHASE || 'after';

beforeAll(() => {
  process.env.SHOPKZ_DB_PATH = path.join(tmpDir, 'tests.db');
  jest.resetModules();
  app = process.env.PRACTICAL5_BASELINE === '1'
    ? require('../../practical5/server.before.cjs') : require('../../server');
  db = require('../../db');
});

beforeEach(() => {
  db.prepare('DELETE FROM carts').run();
  db.prepare('DELETE FROM orders').run();
  db.prepare('UPDATE products SET stock=14 WHERE id=?').run('p001');
  db.prepare('UPDATE products SET stock=3 WHERE id=?').run('p002');
});

afterAll(() => {
  const dir = path.join(__dirname, '../../practical5/results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${phase}-results.json`), JSON.stringify({
    phase, generatedAt: new Date().toISOString(), node: process.version,
    layer: 'API + SQLite; Supertest; интерфейс браузера этим запуском не проверяется',
    total: results.length, passed: results.filter(r => r.status === 'Passed').length,
    failed: results.filter(r => r.status === 'Failed').length, results
  }, null, 2));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function snapshot() {
  return {
    orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    cart: db.prepare('SELECT product_id, qty FROM carts ORDER BY product_id').all(),
    stock: db.prepare("SELECT id,stock FROM products WHERE id IN ('p001','p002') ORDER BY id").all()
  };
}

test.each(cases)('$id $type — $title', async c => {
  const agent = request.agent(app);
  if (!c.anonymous) {
    await agent.post('/api/login').send({ email: 'test@shopkz.kz', password: 'test1234' }).expect(200);
    for (const [productId, qty] of c.items) {
      await agent.post('/api/cart').send({ productId, qty }).expect(200);
    }
  }
  const before = snapshot();
  const res = await agent.post('/api/orders').send(c.data);
  const after = snapshot();
  const record = { id: c.id, title: c.title, type: c.type, status: 'Passed',
    actualHttp: res.status, error: res.body.error || null,
    orderStatus: res.body.order?.status || null, total: res.body.order?.total ?? null,
    before, after, defect: c.defect || null };
  results.push(record);
  try {
    expect(res.status).toBe(c.expectedStatus);
    if (c.expectedStatus === 200) {
      expect(res.body.order.status).toBe('processing');
      expect(res.body.order.total).toBe(c.expectedTotal);
      expect(res.body.order.discount).toBe(c.discount || 0);
      expect(res.body.order.address).toBe(c.data.address.trim());
      expect(res.body.order.payment).toBe(c.data.payment);
      expect(res.body.order.items.map(i => [i.productId, i.qty]).sort())
        .toEqual([...c.items].sort());
      expect(after.orders).toBe(1);
      expect(after.cart).toEqual([]);
      for (const item of before.stock) {
        const qty = c.items.find(i => i[0] === item.id)?.[1] || 0;
        expect(after.stock.find(i => i.id === item.id).stock).toBe(item.stock - qty);
      }
      const saved = await agent.get('/api/orders').expect(200);
      expect(saved.body.orders).toHaveLength(1);
      expect(saved.body.orders[0].id).toBe(res.body.order.id);
      expect(saved.body.orders[0].total).toBe(c.expectedTotal);
    } else {
      expect(res.body.error).toContain(c.expectedError);
      expect(after).toEqual(before);
    }
  } catch (error) {
    record.status = 'Failed';
    record.assertion = error.message.replace(/\u001b\[[0-9;]*m/g, '');
    throw error;
  }
});
