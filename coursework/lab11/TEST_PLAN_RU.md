# План тестирования ShopKZ

Объект: учебный инкремент Node.js Express SQLite. Цель: проверить основной покупательский путь и отказоустойчивость демостенда. Реальный эквайринг, нагрузка коммерческого магазина и production SLA вне границ учебного стенда.

| Уровень | Средство | Покрытие и входные условия | Выход |
|---|---|---|---|
| Unit | Jest, pytest для Python артефактов | Цена, скидка, карта, схема метрик | Все тесты пройдены |
| Integration API | pytest requests, Bruno | Каталог, регистрация, сессии, запрет доступа, checkout | 14 pytest и 5 Bruno assertions без отказов |
| System | существующие HTTP тесты | Отдельный процесс и временная SQLite | 8 сценариев успешны в CI ЗС10 |
| E2E | Playwright Chromium | Путь покупки, отказ карты, 5 размеров экрана, гостевое состояние | 9 сценариев успешны в GitHub Actions |
| Load | Locust | Только чтение каталога и поиск, 10 пользователей, 12 секунд | HTTP failures <1%, p95 <500 мс; это smoke нагрузки |
| UAT | представитель другой команды | Минимум 8 пользовательских сценариев | Реальный протокол и решение заказчика |

Данные: временная SQLite и seed каталог, e-mail домена example.test, тестовые реквизиты, локальная имитация оплаты. Каждому тесту новый пользователь и session. Боевые базы и настоящие карты запрещены. TMP папка очищается после запуска, сырые результаты сохраняются отдельно.

Среда: Node.js 24, Python 3.12, Linux, localhost:4331. В production URL проверки автоматически не отправляются. По окончании child process останавливается. CI из ЗС10 остается отдельным доказательством E2E, локальный Chromium ограничен средой.

Команды: pip install -r coursework/requirements.txt; npm ci; BRUNO_CLI=bru python coursework/lab11/run_checks.py. Bruno ставится npm install -g @usebruno/cli. Locust: SHOPKZ_NO_PROCESS_METRICS=1 python -m locust -f coursework/lab11/locustfile.py --headless -H http://localhost:4331 -u 10 -r 5 -t 12s. Флаг отключает только psutil CPU monitor в ограниченном PID namespace, HTTP статистика остается настоящей. Первый неуспешный запуск сохранен в results/initial-attempt.

Мониторинг: docker compose -f coursework/lab11/compose.yaml up -d. Локально Docker отсутствует; отдельный GitHub Actions run 41639836731 подтвердил контейнерный Uptime Kuma 2.0.2, DOWN/UP, restart и rollback. Учебный monitor: 20 с, timeout 3 с, retries=0. Для постоянного демостенда ниже приведена отдельная конфигурация. На машине с Docker задать SHOPKZ_SESSION_SECRET, открыть localhost:3001, создать администратора, HTTP monitor http://shopkz:3000/api/products, 60 секунд, 2 retries, допустимый статус 200. Панель привязана только к localhost. Контролируемые чтения в incident.json выполнены отдельным Python probe, не выдаются за Kuma.

Критерии остановки: любое изменение реальных данных, отказ критического checkout, HTTP error >1%, 5xx рост, невалидный артефакт. Критерий приемки релиза: все технические gate и внешняя UAT, нет открытых P0/P1 без согласованного исключения. Автотесты не заменяют подпись заказчика.
