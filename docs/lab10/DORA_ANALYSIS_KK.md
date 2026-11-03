# DORA: нақты деректер, әдіс және жақсарту

## Нені өлшейміз

Тапсырмадағы төрт көрсеткіш сақталды. Қазіргі DORA нұсқаулығында бес көрсеткіш бар; мұнда тапсырманың ауқымына сәйкес deployment frequency, change lead time, change failure rate және failed deployment recovery time есептеледі. Бұрынғы MTTR атауының орнына релизден туындаған ақауды қалпына келтіру уақыты қолданылады. Қалпына келтіру уақыты — медиана; ол орташа арифметикалық MTTR емес.

Дерек көзі — `DiasIsenov06/ShopKZ` ашық репозиторийінің GitHub REST API жауаптары. `dora/data/api-responses.json` URL, алынған уақыт, толық жауап мәтіні және SHA-256 сақтайды. `snapshot.json` — есептеу кірісі; `metrics.json` — нәтиже. Коллектор deployment, status, issue және commit тізімдерінің барлық беттерін оқиды. Сұрау сәтсіз болса, оны нөл оқиға деп түсіндірмей тоқтайды. Token міндетті емес; аутентификациясыз rate limit төмен.

## Расталған бастапқы жағдай

2026 жылғы 3 қарашада жиналған деректер: репозиторийдің бүкіл қолжетімді тарихында 4 commit және 27 issue; Алғашқы baseline-да PR — 0, Actions run — 0, deployment — 0 болды. CI бапталғаннан кейін PR №28 ашылды және бірінші Actions run сәтті өтті; production deployment әлі 0. Соңғы snapshot workflow_run_count мәнін жаңартып көрсетеді. Алдын ала бөлек тексерілген releases endpoint те бос. Негізгі бұтақ — main. Талдау терезесі snapshot-та UTC бойынша дәл берілген: 30 күн, `[start, end)`. Commit саны бүкіл тарихқа қатысты контекст, ол осы 30 күндегі deployment жиілігі емес.

| Метрика | Есептеу | Ағымдағы нәтиже | Команданың ағымдағы деңгейі |
|---|---|---|---|
| Deployment frequency | Терезеде алғаш рет success статусын алған production deployment саны / күн саны | 0 / 30 = 0 deployment/күн | N/A: production оқиғалары тіркелмеген; API-ден нақты жеткізу қабілетін бағалау мүмкін емес |
| Lead time for changes | Commit committer timestamp-ынан осы өзгерісті алғаш сәтті орналастырған production success уақытына дейінгі аралықтардың медианасы | N/A, үлгі саны 0 | Анықталмайды |
| Change failure rate | Ақау туғызған бірегей production deployment саны / барлық сәтті production deployment саны × 100% | N/A: бөлім 0, инцидент тізілімінің толықтығы расталмаған | Анықталмайды |
| Failed deployment recovery time | Ақау басталған уақыттан QA растаған қалпына келуге дейінгі уақыт медианасы | N/A, қалпына келтірілген оқиға 0 | Анықталмайды |

N/A — қате немесе нөл пайыз емес. Таза commit тарихы бойынша CFR мен recovery-ді есептеу мүмкін емес: deployment және оған байланыстырылған инцидент қажет. Ақауларды issues санына, ал deployment-ті CI run санына теңеу көрсеткіштердің мағынасын бұзады. Сондықтан «төрт метрика бойынша нақты командалық деңгей анықталды» деген тұжырым жасалмайды. Бағалау үшін кемінде 30 күн production оқиғаларын және толық инцидент тізілімін жинау ұсынылады; сирек релиздер болса терезе ұзартылуы тиіс.

## Деректерді байланыстыру

Production орналастыруы қабылданғаннан кейін `scripts/record-deployment.py` нақты SHA-мен GitHub Deployment және success статусын тіркейді. Скрипт кодты орналастырмайды; аяқталған әрекеттің дәлелін тіркейді. Орта атауы әдепкіде `production`. Басқа орта үшін коллекторға `--environment` беріледі.

Lead time үшін алдыңғы сәтті production SHA мен келесі SHA GitHub Compare API арқылы салыстырылады. Commit қайта deploy жасалғанда қайта есептелмейді. Терезе алдындағы baseline deployment те оқылады. Бірінші deployment үшін салыстыру нүктесі жоқ болса, lead time N/A болады. Diverged немесе rollback диапазоны lead time-ға кірмейді, ескерту жазылады; бірақ нақты rollback success deployment жиілігіне кіреді. Уақыт — UTC, end шекарасы кірмейді. Қате теріс аралықтар жасырынып оң мәнге айналдырылмайды.

Инцидент `incident` белгісі бар issue ішінде төмендегідей marker арқылы байланыстырылады (бұл тек формат үлгісі, snapshot-қа қосылмайды):

```text
<!-- dora {"deployment_id": 123456, "started_at": "2026-11-13T10:05:00Z", "restored_at": "2026-11-13T10:20:00Z"} -->
```

`deployment_id` нақты success deployment-ке тиесілі болуы керек. Бір deployment бірнеше issue туғызса да CFR numerator-ында бір рет саналады. `restored_at: null` — ашық инцидент: ол CFR-ға кіреді, recovery медианасына әзірге кірмейді. Issue-дің жабылу уақыты қызметтің қалпына келу уақыты ретінде қолданылмайды. Бірнеше issue бір ақаудың көшірмесі болса, тек біреуінде `incident` белгісін қалдыру керек. Инцидентті кеш байқау recovery-ді қысқартуы мүмкін; мониторингтің толықтығын команда тексеруі тиіс. Incident толықтығы бекітілгенде ғана `--incidents-complete` беріліп CFR есептеледі. Кейін табылған инцидент snapshot қайта жиналғанда бұрынғы нәтижені өзгерте алады.

## Деңгейлердің оқу шкаласы

Деңгейлер өнімді командаларды салыстыратын ресми рейтинг емес. Скриптте тапсырманы көрсету үшін тұрақты оқу шектері берілген; әртүрлі жылдағы DORA кластерлері бірдей емес. Толық емес дерекке деңгей берілмейді.

| Метрика | Elite | High | Medium | Low |
|---|---|---|---|---|
| Deployment frequency | ≥1/күн | ≥1/7 күн және <1/күн | ≥1/30 күн және <1/7 күн | <1/30 күн, бірақ production дерегі бар |
| Lead time медианасы | <24 сағ. | 24–<168 сағ. | 168–<720 сағ. | ≥720 сағ. |
| Change failure rate | ≤15% | >15–30% | >30–45% | >45% |
| Recovery медианасы | <1 сағ. | 1–<24 сағ. | 24–<168 сағ. | ≥168 сағ. |

Деплой жоқ болса frequency сандық мәні 0 болғанымен деңгей N/A: оқиғалар мүлде тіркелмеген болуы мүмкін. Нөл инцидент болғанда recovery Elite деп белгіленбейді.

## Әр метрикаға екі нақты жақсарту

Төмендегі әсерлер — іске асырылған нәтиже емес, келесі 30–60 күнде тексерілетін мақсаттар. Қазіргі baseline жоқ болғандықтан «30% жақсарды» секілді тұжырым жасауға негіз жоқ.

| Метрика | Нақты әрекет | Жауапты | Күтілетін әсер және тексеру |
|---|---|---|---|
| Deployment frequency | Әр қабылданған production релизін нақты SHA және success timestamp арқылы GitHub Deployments-ке тіркеу | Backend, Диас бақылайды | 30 күндегі орналастырулардың 100%-ын журналға түсіру; қол журналымен салыстыру |
| Deployment frequency | Үлкен өзгерісті шағын, тәуелсіз PR-ларға бөлу; негізгі R1–R3 аралығында қажет шағын түзетулерге апталық терезе бөлу | Диас + reviewer | Дайын өзгеріс болса аптасына кемінде 1 қабылданған орналастыру; сапа шектері сақталады |
| Lead time | PR-ды жұмыс күнінде 24 сағаттан кешіктірмей review жасау, бір reviewer кезекшілігін енгізу | Автордан бөлек 2/3/4-студент | Review кезегін ≤1 жұмыс күніне жеткізу; PR created/reviewed уақыттарын бөлек салыстыру |
| Lead time | `npm ci`, parallel quality/security және дайын artifact арқылы қайта build жасамай шығару | Backend | Жасыл CI-ден release кандидатына дейін ≤30 минут; commit→production медианасын алғаш өлшеп, 60 күнде <7 күнге ұмтылу |
| Change failure rate | Checkout, login, stock және admin smoke-ты staging-та міндетті release gate ету | QA | Бірінші 10 production орналастыруында CFR ≤15% мақсат; жетпесе себептерін incident бойынша талдау |
| Change failure rate | HIGH/CRITICAL осалдықта merge-ті тоқтату; checkout өзгерістеріне тәуелсіз review; барлық live ақауларын deployment ID-мен issue-де тіркеу | Reviewer + QA | Толық incident есебі; алдын ала табылған ақаулар live ортаға өтпейді. Алғашқы кезде есеп толыққандықтан CFR жоғарылауы мүмкін |
| Recovery time | Бұрынғы SHA артефактын және SQLite резервін сақтап, staging-та айына бір rollback жаттығуын өткізу | Backend + QA | Шешімнен қызмет қалпына келуіне дейін ≤15 минут; жаттығу уақытын нақты production метрикасына араластырмау |
| Recovery time | Health тексеруін минут сайын іске қосу; ақау үшін бір жауапты және escalation жолын бекіту | Диас + QA | Ақауды ≤5 минутта байқау, аяқталған инцидент медианасын <1 сағатқа жеткізу мақсаты; started_at/restored_at-пен тексеру |

## Дереккөздер

1. DORA. Software delivery performance metrics: https://dora.dev/guides/dora-metrics/
2. DORA. A history of DORA’s software delivery metrics: https://dora.dev/insights/dora-metrics-history/
3. Google/DORA Four Keys, есептеу әдісі: https://github.com/dora-team/fourkeys/blob/main/METRICS.md
4. GitHub REST Deployments: https://docs.github.com/en/rest/deployments/deployments
5. GitHub REST Deployment statuses: https://docs.github.com/en/rest/deployments/statuses
6. GitHub REST Compare commits: https://docs.github.com/en/rest/commits/commits#compare-two-commits
7. GitHub branch protection: https://docs.github.com/en/rest/branches/branch-protection
8. GitHub workflow artifacts: https://docs.github.com/en/actions/tutorials/store-and-share-data
9. Trivy filesystem scanner: https://trivy.dev/docs/dev/target/filesystem/

Қаралған күні: 03.11.2026. Бастапқы жоба тарихының дәлелдері дашбордтың API snapshot файлдарында берілген.
