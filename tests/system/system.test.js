// tests/system/system.test.js
// System-тест — в отличие от Integration (in-process, supertest), здесь СЕРВЕР ЗАПУСКАЕТСЯ
// ОТДЕЛЬНЫМ ПРОЦЕССОМ (как в реальной эксплуатации) и проверяется по-настоящему по сети (HTTP).
// Проверяем систему в целом как «чёрный ящик»: клиент ↔ сеть ↔ сервер ↔ файл БД.
// Запуск: npm run test:system

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 4310;
const BASE = 'http://localhost:' + PORT;
const TMP_DB = path.join(os.tmpdir(), 'shopkz-system-' + Date.now() + '.db');

let passed = 0, failed = 0;
const log = [];
function record(id, desc, ok, extra) {
  (ok ? passed++ : failed++);
  log.push({ id, desc, status: ok ? 'PASSED' : 'FAILED', extra: extra || '' });
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ': ' + desc + (extra ? '  (' + extra + ')' : ''));
}

// --- простой cookie-jar, потому что используем "голый" fetch, а не supertest.agent ---
let cookieJar = '';
function updateCookies(res) {
  const raw = res.headers.get('set-cookie');
  if (raw) cookieJar = raw.split(';')[0];
}
async function call(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookieJar ? { Cookie: cookieJar } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  updateCookies(res);
  let json = {};
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, body: json };
}
function waitForServer(retries) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      fetch(BASE + '/api/me').then(() => resolve()).catch(() => {
        if (n <= 0) return reject(new Error('Сервер не поднялся вовремя'));
        setTimeout(() => tryOnce(n - 1), 300);
      });
    };
    tryOnce(retries);
  });
}

async function main() {
  console.log('\n=== SYSTEM TEST: ShopKZ (реальный сервер, порт ' + PORT + ') ===\n');

  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: Object.assign({}, process.env, { PORT: String(PORT), SHOPKZ_DB_PATH: TMP_DB }),
    stdio: 'ignore'
  });

  try {
    await waitForServer(30);

    // ST-01: главная страница (статика) отдаётся сервером
    const home = await fetch(BASE + '/');
    record('ST-01', 'Главная HTML-страница отдаётся (GET /)', home.status === 200);

    // ST-02: каталог возвращает 12 seed-товаров
    const products = await call('GET', '/api/products');
    record('ST-02', 'Каталог содержит начальные товары', products.body.products.length === 12,
      'получено: ' + products.body.products.length);

    // ST-03: регистрация нового пользователя через реальный HTTP-запрос
    const reg = await call('POST', '/api/register', { email: 'sys@test.kz', password: 'pass123', name: 'Систем Тест' });
    record('ST-03', 'Регистрация нового пользователя', reg.status === 200);

    // ST-04: поиск и фильтрация каталога
    const filtered = await call('GET', '/api/products?category=Электроника&sort=price_asc');
    const sortedOk = filtered.body.products.every((p, i, arr) => i === 0 || arr[i - 1].price <= p.price);
    record('ST-04', 'Фильтр по категории + сортировка по цене работают', filtered.body.products.length > 0 && sortedOk);

    // ST-05: полный сценарий — добавление в корзину, промокод, оформление заказа
    await call('POST', '/api/cart', { productId: 'p005', qty: 1 });
    await call('POST', '/api/cart', { productId: 'p006', qty: 1 });
    const promo = await call('POST', '/api/promo/apply', { code: 'SALE10' });
    const order = await call('POST', '/api/orders', {
      address: 'г. Караганда, пр. Бухар жырау 10', phone: '+7 701 555 66 77',
      payment: 'card', cardNumber: '4532015112830366', cardExpiry: '11/28', cardCvv: '456',
      promoCode: promo.body.promo ? promo.body.promo.code : null
    });
    record('ST-05', 'Полный сценарий покупки (корзина → промокод → заказ) завершается успешно',
      order.status === 200 && order.body.order.discount === 10);

    // ST-06: заказ виден пользователю в его списке заказов
    const myOrders = await call('GET', '/api/orders');
    record('ST-06', 'Оформленный заказ появляется в «Мои заказы»',
      myOrders.body.orders.some(o => o.id === order.body.order.id));

    // ST-07: администратор (отдельная сессия) видит и обновляет статус этого заказа
    cookieJar = ''; // новая "сессия" — как будто отдельный клиент/браузер
    await call('POST', '/api/login', { email: 'admin@shopkz.kz', password: 'admin123' });
    const adminOrders = await call('GET', '/api/admin/orders');
    const found = adminOrders.body.orders.some(o => o.id === order.body.order.id);
    const upd = await call('PUT', '/api/admin/orders/' + order.body.order.id + '/status', { status: 'shipped' });
    record('ST-07', 'Админ видит заказ клиента и меняет статус на "shipped"', found && upd.status === 200);

    // ST-08: доставленный/отправленный заказ клиент больше не может отменить (regression-проверка фикса D-01)
    cookieJar = '';
    await call('POST', '/api/login', { email: 'sys@test.kz', password: 'pass123' });
    const cancelAttempt = await call('POST', '/api/orders/' + order.body.order.id + '/cancel');
    record('ST-08', 'Отправленный заказ нельзя отменить клиенту (регресс-проверка фикса D-01)', cancelAttempt.status === 400);

  } catch (e) {
    record('ST-ERROR', 'Ошибка выполнения сценария', false, e.message);
  } finally {
    server.kill();
    [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  }

  console.log('\n--- ИТОГО (System Test): ' + passed + ' passed, ' + failed + ' failed из ' + (passed + failed) + ' ---\n');
  fs.writeFileSync(path.join(__dirname, 'system-results.json'), JSON.stringify(log, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main();
