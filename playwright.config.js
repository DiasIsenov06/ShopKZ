// playwright.config.js
// Запуск: npx playwright install   (один раз, скачивает браузеры)
//         npx playwright test
// Сам поднимет сервер (webServer) на порту 3100 с отдельной тестовой БД.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    port: 3100,
    env: { PORT: '3100', SHOPKZ_DB_PATH: './shopkz-e2e-test.db' },
    reuseExistingServer: false,
    timeout: 15000
  }
});
