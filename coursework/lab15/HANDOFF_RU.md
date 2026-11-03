# Передача итогового комплекта

Архив содержит исходный инкремент, результаты тестов и AI eval, шесть отдельных отчётов, планы, инструкции и проверяемые снимки GitHub. Секреты, cookie, рабочие базы и node_modules исключены.

## Запуск

1. Из каталога ShopKZ_GitHub: `npm ci`, `npm start` для изолированного демо. Настроить переменные по `.env.example`.
2. `pip install -r coursework/requirements.txt`. Тесты: `python coursework/lab11/run_checks.py` (Bruno CLI должен быть установлен).
3. Docker: задать случайный `SHOPKZ_SESSION_SECRET`, выполнить `docker compose -f coursework/lab11/compose.yaml up -d --build`. Открыть localhost:3001, создать администратора и HTTP monitor `http://shopkz:3000/api/products`. Остановка: та же команда с `down`. Данные сохраняются в named volumes.
4. PM: `ollama serve`, `ollama pull qwen2.5:0.5b`, `python coursework/lab13/pm_assistant.py --replay`. Снимки содержат реальные исторические данные репозитория.
5. Dashboard: `streamlit run coursework/lab14/streamlit_app.py`. Обновление снимка: `python coursework/lab14/dashboard.py` после актуализации источников GitHub.

## Обязательные действия с настоящими участниками

Представитель другой команды выполняет UAT-01…10 и заполняет протокол. Спонсор выбирает один из трёх числовых вариантов. Интервьюер проводит десятиминутное интервью и даёт оценку по рубрике. Команда проводит финальную ретроспективу. Имена и подписи заранее не заполнены.

Защита: 15 минут по презентации и сценарию отчёта №15. Перед показом подготовить тестовую БД и новый example.test аккаунт. Не вводить реальные банковские реквизиты.

Main защищён: merge и активный weekly cron требуют независимого review. Подготовленные PR не означают автоматически принятый релиз.
