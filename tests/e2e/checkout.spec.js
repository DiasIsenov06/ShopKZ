// tests/e2e/checkout.spec.js
// E2E-тест — единственный уровень, который управляет НАСТОЯЩИМ БРАУЗЕРОМ и кликает по
// реальному интерфейсу (в отличие от System/Integration, которые бьют только по API).
// Проверяет сценарий целиком глазами пользователя: каталог → товар → корзина → checkout → заказ.
//
// Запуск локально (не в песочнице Claude — здесь нет доступа к скачиванию браузеров):
//   npm install
//   npx playwright install
//   npx playwright test

const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const EMAIL = 'e2e_' + Date.now() + '@test.kz';

test('E2E-01: полный путь покупателя — от каталога до подтверждения заказа', async ({ page }) => {
  // 1. Открываем главную страницу
  await page.goto('/');
  await expect(page.locator('.logo')).toContainText('ShopKZ');

  // 2. Регистрируемся
  await page.click('text=Войти');
  await page.click('text=Зарегистрироваться');
  await page.fill('input[name=name]', 'E2E Покупатель');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=phone]', '+7 707 000 00 00');
  await page.fill('input[name=password]', 'pass123');
  await page.click('button:has-text("Создать аккаунт")');
  await expect(page.locator('.topbar')).toContainText('E2E Покупатель');

  // 3. Ищем товар через поиск
  await page.fill('input[name=q]', 'Наушники');
  await page.click('.searchbar button');
  await expect(page.locator('.p-card')).toHaveCount(1);

  // 4. Открываем карточку товара и добавляем в корзину
  await page.click('.p-card .name');
  await page.click('button:has-text("Добавить в корзину")');
  await expect(page.locator('.badge')).toContainText('1');

  // 5. Переходим в корзину и оформляем заказ
  await page.click('text=Корзина');
  await page.click('text=Оформить заказ');
  await page.fill('input[name=address]', 'г. Алматы, ул. E2E-тест 1');
  await page.fill('input[name=phone]', '+7 707 111 22 33');
  await page.fill('input[name=cardNumber]', '4532 0151 1283 0366');
  await page.fill('input[name=cardExpiry]', '12/27');
  await page.fill('input[name=cardCvv]', '123');
  await page.click('button:has-text("Оплатить и подтвердить заказ")');

  // 6. Проверяем страницу подтверждения заказа
  await expect(page.locator('h2')).toContainText('принят');

  // 7. Проверяем, что заказ отображается в "Мои заказы"
  await page.click('text=Мои заказы');
  await expect(page.locator('.card')).toContainText('В обработке');
});

test('E2E-02: платёж тестовой картой-отказом показывает пользователю ошибку', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Войти');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', 'pass123');
  await page.click('button:has-text("Войти")');

  await page.click('.p-card .name >> nth=0');
  await page.click('button:has-text("Добавить в корзину")');
  await page.click('text=Корзина');
  await page.click('text=Оформить заказ');
  await page.fill('input[name=address]', 'г. Алматы');
  await page.fill('input[name=phone]', '+7 707 000 00 00');
  await page.fill('input[name=cardNumber]', '4000 0000 0000 0002');
  await page.fill('input[name=cardExpiry]', '12/27');
  await page.fill('input[name=cardCvv]', '123');
  await page.click('button:has-text("Оплатить и подтвердить заказ")');

  await expect(page.locator('.error-text')).toContainText('отклонён');
});
