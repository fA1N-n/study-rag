# STATUS — Study RAG

## Goal
Веб-приложение: пользователь загружает свой неразмеченный набор учебных документов → агент-архитектор предлагает схему и правила разметки → человек утверждает → батчи → разметчики A/B + арбитр + очередь проверки → RAG по размеченному корпусу (ответ со сносками на страницу/слайд, фильтры из схемы разметки). Первый датасет — материалы группы КИ за 5 семестров.
Сдаём по двум курсам: «Большие данные» (КАИ, проектная работа, отчёт .docx) и OTUS «Разработка веб-приложения с AI-агентами».
Успех: прод онлайн с демо-входом; наш датасет загружен, размечен и отвечает; hit@5 ≥ 0.8; метрики разметки и поиска в `docs/eval.md`; все требования `docs/requirements.md` закрыты; отчёт .docx, презентация, README. Дата защиты неизвестна.

## Constraints
- Требования курсов — `docs/requirements.md`. Ориентир — FlowDesk и SkillPath AI (пути в `docs/plan.md`; в `flowdesk_dev.zip` чужой `.env` — не открывать).
- Материалы КИ не в репо: `data/raw_2026-11-07/` (в `.gitignore`).
- RAG не упрощать (гибрид, rerank, переписывание, соседи, отказ, сноски).
- Новые npm-пакеты — пачкой по согласованию. Утверждены и стоят (2026-11-07): zod, vitest, @supabase/supabase-js, @supabase/ssr, fflate, unpdf, mammoth, @electric-sql/pglite + pglite-pgvector, @playwright/test, supabase CLI, docx, pptxgenjs.
- Команды для пользователя — Windows PowerShell 5.1.
- **Золотой набор размечает не человек (решение пользователя 2026-11-08, нет времени):** «серебряный набор» — 80 документов из `gold_candidates.csv` размечает Opus по ПОЛНОМУ тексту (не preview), независимо от A/B и арбитра, по правилам v1; в отчёте честно называть «серебряным» и указать ограничение. Желательно: пользователь проверяет 20 случайных из 80 одним кликом в очереди проверки (~15 мин) — оценка ошибки самого набора.
- **Денег не тратим (решение пользователя 2026-11-07).** Только бесплатные тарифы: Supabase Free, Vercel Hobby, GitHub; LLM — бесплатные модели OpenRouter (`:free`, 50 запросов/день; DeepSeek/Qwen бесплатных нет, есть `google/gemma-4-31b-it:free`); эмбеддинги — Cloudflare Workers AI `@cf/baai/bge-m3` (1024 измерения = `halfvec(1024)`, бесплатно 10 000 neurons/день ≈ 9 млн токенов; Google нельзя — решение пользователя; запасной вариант — локальная модель через transformers.js, новый пакет); rerank — тем же бесплатным LLM; основной датасет размечаем агентами в Claude Code (A, арбитр) и Codex (B) по правилам приложения и импортируем в БД.
- Режим работы: «делай по плану до конца», останавливаться только на новых npm-пакетах (пачкой), отсутствии ключей и на этапе отчёта (состав команды). Каждый этап: проверка в браузере (десктоп, 375 px, тёмная), коммит, docs/ai-log.md, docs/requirements.md, STATUS.md. На этапе отчёта спросить состав команды для титульника.

## Key decisions
- Стек: Next.js 16.4.5 + Supabase (Postgres, pgvector halfvec, FTS russian, Auth, Storage, pg_cron + pg_net) + Vercel + GitHub Actions + OpenRouter (fetch, без SDK). Dockerfile, `output: "standalone"`.
- Дизайн — вариант A «Консоль»: `docs/design.md`, классы в `src/components/ui.ts`. Прототип v1 на моках удалён (есть в истории git, коммит c8ae775).
- Ключевые поля разметки = `required` или `filter`; enum без учёта регистра → каноническое значение; ПДн: регулярки + `keepNames` (преподаватели из схемы).
- БД: RLS через `can_read_dataset`/`can_write_dataset`; лимиты демо триггерами (30 документов с `pg_advisory_xact_lock`, 30 вопросов/сутки); разметка только по утверждённым правилам; одна активная разметка; `claim_batches` только для сервисного ключа; Storage: владелец — своя папка, чужой демо-датасет — только `docs/`.
- Next.js 16: перед кодом читать `node_modules/next/dist/docs/`; `proxy.ts` вместо middleware; `cacheComponents: true` → страницы читают `params`/`searchParams` внутри `<Suspense>`; клиент Supabase на сервере вызывает `await connection()` (иначе «Date.now() while prerendering»).
- Загрузка синхронная в одном запросе (`maxDuration 300`, без очереди): наш архив разбирается за ~2 с. Документ хранится уже замаскированным (текст, подписи, имя файла, путь) — RAG и демо не видят ПДн. Флаг ПДн домашняя папка сборщика не ставит.
- Статус датасета `rules` = правила утверждены.
- Разметка в приложении: один запрос LLM на батч для A и для B, арбитр — один запрос на спорные документы батча (лимит бесплатных моделей 50 запросов/день).
- LLM: `chat()`/`chatStream()` идут цепочкой — бесплатные модели OpenRouter одним запросом (`models`, список через запятую в `*_MODEL`), при отказе — Cloudflare `@cf/qwen/qwen3.8-27b`; тайм-аут на шаг (`timeoutMs`), `reasoning: low`, пустой ответ — ошибка. Модели: `LABELER_A/B`, `REFEREE`, `ARCHITECT`, `FAST_MODEL` (переписывание, rerank), `ASK_MODEL` (ответ).
- Rerank — LLM 0–10 по 20 кандидатам, порог 4 → отказ; `@cf/baai/bge-reranker-base` на русском не годится (проверено).
- Очередь: `claim_batches` (аренда 10 мин) → `processBatch` → `finish_batch` (миграция 6); индексация — `claim_index` (аренда 5 мин, миграция 7); тик — `/api/worker/tick` (ответ сразу, работа в `after()`), cron срабатывает при батчах в очереди или датасете в статусе `indexing` (миграция 8).
- Чанк: `unit_no` — порядковый номер единицы (номера страниц повторяются), соседи ±1 по нему.

## Done
- 2026-10-11 … 2026-11-07: scaffold, прототип v1, план v2, spec v2.0, этап 1 (дизайн A), ядро разметки (99 тестов), заготовки этапа 2, офлайн-разметка A — см. `docs/ai-log.md`.
- 2026-11-08 разметчик B (другая сессия, 29382a1): 572/572; 001–018 Codex, 019–029 Claude Haiku (`data/labeling/B/models.json`).
- 2026-11-08 этап 2 (bc224da): публичный репо https://github.com/fA1N-n/study-rag (история без данных и секретов), Supabase `iekwfiiptbyujzsfhynr` (eu-west-3) — 5 миграций, Vault `worker_secret` (`worker_url` — после Vercel), пользователи demo и owner (`scripts/setup-users.ts`), вход + демо-вход (`src/proxy.ts`, `/api/auth/demo`), CRUD датасетов, CI зелёный (`next typegen` перед tsc). Проверено в браузере: редирект, неверный пароль, демо-вход, API 401, CRUD, 375 px тёмная.
- 2026-11-08 этап 3 (02bad95): ядро загрузки `src/lib/ingest/` через tdd-critic (22 критерия `docs/ingest-core.md`, критик тестов + финальный критик на 572 реальных документах, 16 дефектов исправлены); маршрут `/api/datasets/[id]/ingest`; экраны: вкладки датасета, обзор, загрузка, документы (фильтры, пагинация), документ (единицы, правка меток человеком, удаление). Наш датасет «Материалы КИ (5 семестров)» (is_demo) загружен `scripts/import-dataset.ts`: 572 документа, 5 787 единиц, ПДн у 410. Проверено в браузере: обзор, список, документ под демо (375 px, тёмная), загрузка через UI (2 новых + дубль), маскирование имени файла.
- 2026-11-08 арбитр (de01f8e): `scripts/labeling/merge.ts` (prep/final), арбитр — 5 субагентов Opus по `scripts/labeling/referee-prompt.md` на 69 спорных; итог `data/labeling/final_v1.jsonl`, `merge_v1.md`, `kappa_v1.md`, `review_queue.csv`. Каппа A/B (все / Codex / Haiku): предмет 0,959 / 0,941 / 0,990; семестр 0,934 / 0,905 / 0,982; преподаватель 0,962 / 0,945 / 0,989; тип 0,907 / 0,872 / 0,968; ПДн 0,965 / 0,946 / 1,000. Итог: agreed 434 (75,9 %), refereed 39 (6,8 %), review 99 (17,3 %). Импорт в БД (`scripts/import-labels.ts`): правила v1 (draft, active), все голоса A/B/арбитра в `labels`, итог в `documents`, сводка в `datasets.stats.labeling`, статус датасета `labeled`.
- 2026-11-08 заготовки этапов 4–5 (de01f8e, НЕ проверены в браузере): `src/lib/llm.ts` (OpenRouter, `parseJson`), `src/lib/rules.ts` (архитектор → критик → правка, стратифицированная выборка), API `/api/datasets/[id]/rulesets` (GET, POST — генерация), `/api/rulesets/[id]` (PATCH: правка черновика, правка утверждённой → новая версия, утверждение), экран `/d/[id]/rules`; экран `/d/[id]/review` (голоса A/B/арбитра, клавиши 1/2/3/Enter/→); `src/lib/labeler.ts` (`runBatch`: A и B параллельно → merge → арбитр по спорным), тесты на подставной LLM.
- Ручная проверка пользователя: `data/labeling/gold_human/gold_human_results.json` — 19 документов (из 20 в форме один не размечен). Сырое совпадение с итогом без нормализации написания (UNCONFIRMED до этапа 7): предмет 15/19, семестр 16/19, преподаватель 15/19, тип 16/19, ПДн 12/19.
- 2026-11-08 этапы 4–5 в приложении (проверено в браузере: десктоп, 375 px, тёмная): генерация правил бесплатной моделью на тестовом датасете демо «Тест: 8 документов КИ» и утверждение в UI; миграция 6 (`finish_batch`, новый `claim_batches`, применена в Supabase); `src/lib/worker.ts`, `/api/datasets/[id]/jobs`, `/api/jobs/[id]`, `/api/jobs/[id]/cancel`, `/api/worker/tick`, запуск через `after()`; доска `/d/[id]/labeling`; прогон 8 документов (1 батч, 192 с, agreed 1 / refereed 6 / review 1), решение человека в очереди, отмена. Запасные модели через запятую в `*_MODEL` (OpenRouter `models`).
- Тестов: 214 (19 файлов), lint/tsc чистые.
- 2026-11-08/09 этап 6 (71f49a4): чанки + bge-m3 + `claim_index`, `/api/ask` (SSE), чат `/d/[id]/chat` (фильтры из схемы, автофильтры-чипы, сноски, панель источника с подсветкой, 👍/👎), `/history`, кнопка «Индексировать». Индекс основного датасета — 11 082 чанка, тестового — 59. Проверено в браузере на тестовом датасете: два ответа со сносками, rerank 10/10 и 7/10, источник, 👍 в истории.
- 2026-11-09 этап 7 (3726adb): серебряный набор 80/80 (8 агентов Opus, полный замаскированный текст) → `docs/eval.md`: против серебряного A 83,8 %, B 67,5 %, итог 83,8 % документов верно по всем полям; agreed 92,7 %, review 68,8 %; против 19 ручных все 32–37 % (ПДн). Smoke 3/3 на `next build && next start`. README v2, `ARCHITECTURE.md`, скриншоты `docs/screenshots/v2/`.
- Тестов: 227 (21 файл) + smoke 3; lint/tsc чистые; `next build` проходит.
- 2026-11-10 этап 8 (план: этап 8): отчёт `docs/report/Проект_Никулин_Тугулева_StudyRAG.docx` (42 с., 15 таблиц, 17 рисунков; проверен fable), презентация `docs/report/Study_RAG_защита.pptx` (10 слайдов), сценарий `docs/report/demo-script.md`; сборщики в `scripts/report/`; скриншоты прода в `docs/screenshots/v2/`, схемы в `docs/screenshots/report/`. Этапы 0–7 отмечены в `docs/plan.md`.

- 2026-11-10 миграция 9 (429cd7f, применена на прод): `match_chunks`/`neighbor_chunks` — `security definer`, одна проверка `can_read_dataset(p_dataset)`; `neighbor_chunks(p_dataset, p_ids)`; анониму execute отозван; тесты D15. Поиск под демо на проде 1,3–1,8 с → 0,45 с; вопрос в основном датасете отвечает (56 с). Отчёт 12.2 и `demo-script.md` поправлены, отчёт пересобран (42 с.). Тестов: 229 (21 файл) + smoke 3.

## Now
- Этап 8 (`docs/plan.md`, этап 8) готов 2026-11-10: отчёт (42 с.), презентация (10 слайдов), сценарий демо; независимая проверка (fable) пройдена, 13 замечаний исправлены (главное: hit@5 83 % — с заранее верным фильтром-оракулом, интервал 71–91 %).

## Next
1. Презентация: слайды 6 и 9 (`scripts/report/build-deck.mjs:139,174`) всё ещё говорят «чат основного датасета 10.11 упал по тайм-ауту» — поправить и пересобрать, если пользователь решит. При желании — `alter role authenticated set statement_timeout` с запасом на холодный старт (настройка прода, только по решению пользователя).
2. По желанию: оценить весь путь `/api/ask` (автофильтр вместо оракула) — нужен лимит запросов; порог rerank 3/10.
3. Открыто в требованиях: `docker build` (Docker не установлен), утверждение темы у преподавателя. Дата защиты неизвестна.
4. Титульник: Никулин Д.Э., Тугулева К.С. (4307), руководитель Мокшин В.В. Анализ конкурентов, настоящие вопросы, очередь проверки (99) — пользователь отказался, в отчёте как ограничения.

## Files (чат 2026-11-08, этапы 2–арбитр)
- Этапы 2–арбитр: см. git log до 91aaefc.
- Этапы 4–5 (f6d9515): миграция 6, `src/lib/worker.ts`, `src/app/api/{datasets/[id]/jobs,jobs/[id],jobs/[id]/cancel,worker/tick}`, `src/app/(app)/d/[id]/labeling`, `src/components/LabelingActions.tsx`; правки `llm.ts`, `rules.ts`, `labeler.ts`, `RulesActions.tsx`, `ReviewForm.tsx`, review и rules pages, `scripts/import-dataset.ts`, `.env.example`.
- Этап 6 (71f49a4): миграции 7–8, `src/lib/rag/{chunk,embed,indexer,ask}.ts`, `src/app/api/{ask,questions,questions/[id],documents/[id]/units,datasets/[id]/index}`, `src/app/(app)/d/[id]/chat`, `src/components/Chat.tsx`, `src/app/(app)/history/page.tsx`, `scripts/index-dataset.ts`.
- Этап 7 (3726adb): `scripts/labeling/silver-{prep.ts,prompt.md}`, `scripts/eval/{labeling-eval,search-eval}.ts`, `src/lib/labeling/accuracy.ts`, `smoke/smoke.test.ts`, `docs/eval.md`, `README.md`, `ARCHITECTURE.md`, `docs/screenshots/v2/`.
- Этап 8: `scripts/report/{shots.mjs,diagrams.html,diagrams.mjs,lib.mjs,build-report.mjs,build-deck.mjs,word-update.ps1,ppt-pdf.ps1}`, `docs/report/` (docx, pdf, pptx, pdf, demo-script.md), `docs/screenshots/v2/` (пересняты на проде 1280×800, новые: datasets, docs, document, rules, upload, chat-source, chat-mobile-dark, overview-mobile-dark), `docs/screenshots/report/`; правки `docs/plan.md`, `docs/requirements.md`, `docs/ai-log.md`.
- `.env.local`: изменены только строки `*_MODEL`, добавлены `FAST_MODEL`, `ASK_MODEL`.
- Данные (вне git): `data/labeling/silver/{in,out}/`, `data/eval/{labeling.md,cache.json}`; в БД — тестовый датасет демо «Тест: 8 документов КИ» (правила v1 агента, утверждены; 2 вопроса в истории демо).

## Deviations from plan
- Загрузка без очереди воркера (синхронно в запросе) — проще и укладывается в лимит; очередь — если загрузки вырастут.
- Наш датасет загружен скриптом через то же ядро, а не через UI: выбрать 572 файла во встроенном браузере нельзя; загрузка через UI проверена на малом наборе.
- Правила v1 и метки импортированы до утверждения правил человеком (офлайн-разметка); утверждение — задним числом в UI.
- Арбитр стоял на стороне A в 102 из 116 спорных полей (A — Sonnet, арбитр — Opus, обе модели Claude): возможное смещение «своей» модели — в отчёт как ограничение.
- В примерах `ruleset_v1.json` документ 5e2d9122 (LECTURES_SUMMARY.md) с `has_pii=false` противоречит правилу «имя студента в имени архива → true» (заметил арбитр батча 002) — поправить в правилах v2.
- Критерии TDD ядра загрузки не согласовывались отдельно (режим «без промежуточных согласований») — в `docs/ingest-core.md`.
- Rerank — не отдельная модель, а бесплатный LLM (reranker Cloudflare плох на русском).
- «RAG без меток» в eval = без фильтров по меткам; заголовок чанка с метками есть в обоих режимах (второй индекс без заголовков не строили — лимит эмбеддингов).
- Серебряный набор сделан 8 агентами Opus по полному тексту (не человеком, решение пользователя 2026-11-08); с ручной проверкой он сходится на 37 % по документу целиком.
- Основной датасет проиндексирован скриптом, а не кнопкой (572 документа дольше лимита функции); кнопка проверена на тестовом.

## Tried / didn't work
- 2026-11-10: чат основного датасета (11 082 чанка) на проде без фильтров — «canceling statement due to statement timeout»; утром тот же вопрос прошёл за 98 с. `match_chunks` без RLS (postgres, `--read-only` explain) — 0,7 с. Под `authenticated` не проверено: `supabase db query --read-only` не пускает `SET ROLE`, без `--read-only` нужен `--yes` (запись в прод). Решено миграцией 9 (см. Done). Под ролью мерить через supabase-js: вход демо (`signInWithPassword`) + `rpc` — только чтение. Итог замеров: RLS ×2–2,5 (прод 1,3–1,8 с против 0,54 с), сам по себе до 8 с не доходит; тайм-аут — вероятно, холодная база (первый вызов без RLS 5,8 с) × RLS — UNCONFIRMED, один замер.
- PGlite: 10 тыс. случайных векторов `array(select random() …)` на строку генерируются > 10 мин — брать 200 векторов на все чанки.
- `scripts/report/*`: pdftoppm не открывает пути с кириллицей — копировать PDF во временный ASCII-путь; `apply_theme.js` навыка pptx не видит pptxgenjs проекта; `validate.py` навыка требует pip `defusedxml` (не стоит) — проверка pptx открытием в PowerPoint.
- `.env.local` дважды перезаписан шаблоном (17:53 и 18:24, вероятно повторный `Copy-Item .env.example`): ключи Supabase восстанавливаются `npx supabase projects api-keys --project-ref iekwfiiptbyujzsfhynr --reveal --output json` (заменять только строки-плейсхолдеры), пароль демо — `scripts/setup-users.ts`, секрет воркера — новый + `vault.update_secret`. Проверка без вывода значений — запрос к `documents`, вход демо, сравнение секрета в SQL.
- `NEXT_PUBLIC_SUPABASE_URL` с хвостом `/rest/v1/` ломает Auth («Invalid path»).
- Heredoc с кириллицей и кавычками в Bash иногда не разбирается («unexpected EOF») — писать скрипты через Write в файл; в Python-заменах обратные слэши путей Windows ломают строки — править через Edit.
- Таблица CP437 в `scripts/labeling/common.ts`: последний символ (неразрывный пробел) сохранён как обычный пробел → пробел мог превращаться в 0xFF; в ядре исправлено, в офлайн-скрипте нет (UNCONFIRMED, затронуло ли имена у разметчиков).
- 104 имени файлов `����` не восстановить. `rm -rf` в Bash запрещён — удалять через `node -e "fs.rmSync(...)"`.
- Headless Edge в песочнице не запускается — `docs/design/shot.sh`. Убивать все `node` запрещено — preview_start/stop. `docker build` — UNCONFIRMED (Docker не установлен).
- Файлы в браузерной панели не выбрать диалогом — для проверки загрузки подкладывать `File` в `input[type=file]` через `DataTransfer` и событие `change`.
- Gemma `:free` часто 429 «rate-limited upstream» (общий пул) → запасные модели. Nemotron Ultra (рассуждающая) медленная и может вернуть пустой `content` → `reasoning: low`, пустой ответ — ошибка.
- `@cf/deepseek-ai/deepseek-v4-flash` недоступна на бесплатном плане Workers; `@cf/baai/bge-reranker-base` на русском ставит правильный фрагмент последним.
- Индексация 11 тыс. чанков съела ≈8 тыс. нейронов Cloudflare (оценка была 4 тыс.) → в тот же день чат и eval остались без эмбеддингов. Переиндексировать большой датасет — только в день без других задач.
- Tailwind в `next dev` (Turbopack) не видит классы новых файлов до перезапуска dev-сервера.
- Процесс, запущенный через `&` в Bash, умирает с оболочкой — долгие скрипты только `run_in_background`.
- `node --import` (strip-only) не понимает parameter properties (`constructor(readonly x)`).
- `supabase db push` на прод в агентском режиме требует `--remote --yes`.
- Скриншоты во встроенном браузере ночью могут не дорисовываться (окно скрыто) — снимать днём.
