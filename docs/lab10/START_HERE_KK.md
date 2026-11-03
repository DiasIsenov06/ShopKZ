# ЗС 10 — іске қосу және оқытушыға көрсету

Бұл пакет ShopKZ жобасының GitHub-қа арналған нұсқасы негізінде дайындалды. Қалған алдыңғы зертханалардың материалдары сақталды. Осы жұмыстың жаңа тексеру дәлелдері тек `verification/lab10/` ішінде. `docs/project-plan.md` бұрынғы жоспарлық құжат, ондағы архив құрамы туралы жолдар осы жаңа пакетке қолданылмайды.

## Жергілікті іске қосу

Талаптар: Node.js 24, npm, Python 3.10+ (дашборд үшін matplotlib).

```bash
npm ci
npm run lint
npm run check
npm run test:coverage
npm run test:system
npx playwright install --with-deps chromium
npm run test:e2e
python -m unittest discover -s dora -p 'test_*.py' -v
npm run build
```

`dist/` — іске қосылатын 27 runtime файл және SHA256SUMS. Express жобасында frontend bundler жоқ: build қажетті сервер және static файлдарын таза каталогқа жинайды. Орнату: `cd dist`, `npm ci --omit=dev`, `node server.js`. Жұмыс SQLite базасын және SESSION_SECRET-ті release каталогынан тыс сақтаңыз.

```bash
python -m pip install -r dora/requirements.txt
python dora/collect.py --repo DiasIsenov06/ShopKZ
python dora/render.py
```

`dora/data/dashboard.html` файлын браузерде ашыңыз. Дайын PNG де сол каталогта. Кэштен дәл қайта есептеу:

```bash
python dora/collect.py --snapshot dora/data/snapshot.json --out /tmp/shopkz-dora-replay
```

PowerShell-де `/tmp/...` орнына өз уақытша каталогыңызды беріңіз. Ашық репозиторийді оқу үшін токенсіз сұрау жасалады. Rate limit болса GH_TOKEN орта айнымалысына тек оқу токенін қойыңыз. Токенді чатқа, `.env.example` немесе Git-ке жазбаңыз. `--incidents-complete` параметрін барлық live ақаулары тіркелгенін команда растағаннан кейін ғана қосыңыз.

## GitHub-та іске қосу

Жұмыс файлы `ShopKZ_GitHub` жобасының түбіріне орналастырылуы тиіс. `.github/workflows/ci.yml` ішкі parent каталогта қалмауы керек. Дайын файлдарды бұрынғы репозиторийдің бөлек бұтағына көшіріп, PR жасаңыз. Бұл пакет `.git` каталогын қоспайды; өз репозиторийіңізді clone жасап, оның үстіне файлдарды көшіріңіз.

```bash
git clone https://github.com/DiasIsenov06/ShopKZ.git
cd ShopKZ
git switch -c lab10-cicd-dora
# Осы каталогқа пакеттің файлдарын көшіріңіз (.github бірге).
git add .
git commit -m "Add CI, DORA dashboard and release controls"
git push -u origin lab10-cicd-dora
```

GitHub-та PR ашыңыз. Бірінші тексеру аяқталғаннан кейін үш job-тың нақты атауы quality/security/build екенін тексеріңіз. Олар бөлек status checks. Кез келгені өтпесе merge жасамаңыз. Бұл — ашық репозиторий, сондықтан тапсырмадағы GitHub Actions hosted runner нұсқасы қолданылады. Репозиторий кейін private болса, self-hosted runner орнатып, `runs-on` мәндерін соған ауыстырыңыз; public fork-тың сенімсіз кодын жеке ноутбук runner-ында іске қоспаңыз.

## main қорғанысы және review

Файлдық конфигурация өздігінен GitHub ережесін қоспайды. Repository Administration құқығы бар пайдаланушы GitHub CLI арқылы:

```bash
gh auth login
bash scripts/protect-main.sh DiasIsenov06/ShopKZ
```

Скрипт main үшін кемінде бір тәуелсіз approval, соңғы push-қа автордан бөлек approval, ескірген review-ді жою, міндетті quality/security/build, up-to-date branch, шешілген пікірлер, linear history және admin-ге де қолданылатын қорғанысты орнатады. Force-push және branch deletion бұғатталады. JSON: `.github/branch-protection.json`. Нәтиженің API дәлелі `verification/lab10/branch-protection-applied.json` ішінде сақталады. Reviewer ретінде репозиторийге write құқығы бар басқа адам керек; PR авторы өзіне approval бере алмайды. CODEOWNERS шектеуі қосылмаған, себебі басқа қатысушылардың GitHub аттары берілмеген.

Балама: Settings → Branches → Add branch protection rule → main. JSON-дағы талаптарды UI-де дәл сәйкестендіріп, сақтаңыз. CI конфигурациясын негізгі бұтаққа енгізу үшін алғашқы PR-ды да тексеріп, тәуелсіз reviewer арқылы өткізіңіз; кейін қорғауды қолданыңыз.

## Құбыржол

- quality: npm ci → ESLint → syntax → Jest coverage → system → Playwright Chromium → DORA unit tests.
- security: Trivy filesystem, HIGH/CRITICAL табылса exit 1. Ешқандай continue-on-error жоқ. `trivy.yaml` арқылы runtime және dev npm тәуелділіктері тексеріледі; npm audit есебі де бөлек берілген.
- build: quality/security сәтті өткенде таза runtime жиынын жасау, checksum және tar.gz жариялау.
- Fail болса да тест дәлелі және бар Trivy есебі артефактқа жүктеледі. PR-ға write-token берілмейді.
- DORA snapshot workflow: қолмен немесе әр дүйсенбі 04:00 UTC (09:00 UTC+05:00), нақты API дерегін алып PNG/HTML/JSON жариялайды. Бұл дашборд CI нәтижесін deployment ретінде есептемейді.

Құбыржол үздіксіз жеткізу кандидатын шығарады; серверге автоматты орналастыру бұл конфигурацияда жоқ. Шығаруды release plan бойынша оператор орындайды. Нақты орналастырудан кейін ғана deployment event тіркеледі.

## Қорғау кезіндегі көрсету реті

1. GitHub Actions → ShopKZ CI → сәтті run. quality/security/build нәтижелерін және checksum бар artifact-ты көрсетіңіз. Жергілікті лог remote run дәлелі емес.
2. Settings → Branches → main protection. Reviewer және checks талаптарын көрсетіңіз.
3. `dora/data/dashboard.html`: 30 күн, source repository, 0 observed deployment және үш N/A түсіндіріңіз. Жалған Elite бағасы қойылмаған.
4. `DORA_ANALYSIS_KK.md`: төрт формула, дерек шектеулері, 8 жақсарту және болжанған әсер.
5. `RELEASE_PLAN_KK.md`: R1–R3 терезелері, рөлдер, Go/no-go, DB резерві және rollback.

## Расталған сыртқы нәтиже және дерек шегі

PR №28: https://github.com/DiasIsenov06/ShopKZ/pull/28

Actions run 41627705114 толық сәтті өтті: quality, security және build; 77 Jest, 8 system, 9 Playwright және 7 DORA тесті. Үш артефакт жарияланды. Main қорғауы браузер арқылы қолданылды (rule ID 85748334): кемінде бір approval, үш міндетті check, stale review dismissal, last-push approval, up-to-date branch, conversation resolution, linear history және admin bypass тыйымы. Дәлелдер verification/lab10/ ішінде.

PR main-ге біріктірілген жоқ: автордан бөлек reviewer-дің мақұлдауы қажет. Оны жасанды түрде алмастыруға болмайды. Репозиторийде әзірге production тарихы жоқ: қалған DORA мәндері мен команданың деңгейі N/A. Құбыржол артефакт жариялайды, серверге автоматты deploy жасамайды.
