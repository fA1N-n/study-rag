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
- **Денег не тратим (решение пользователя 2026-11-07).** Только бесплатные тарифы: Supabase Free, Vercel Hobby, GitHub; LLM — бесплатные модели OpenRouter (`:free`, 50 запросов/день; DeepSeek/Qwen бесплатных нет, есть `google/gemma-4-31b-it:free`); эмбеддинги — Cloudflare Workers AI `@cf/baai/bge-m3` (1024 измерения = `halfvec(1024)`, бесплатно 10 000 neurons/день ≈ 9 млн токенов; Google нельзя — решение пользователя; запасной вариант — локальная модель через transformers.js, новый пакет); rerank — тем же бесплатным LLM; основной датасет размечаем агентами в Claude Code (A, арбитр) и Codex (B) по правилам приложения и импортируем в БД.
- Режим работы: «делай по плану до конца», останавливаться только на выборе дизайна (сделан), новых пакетах, отсутствии ключей. На этапе отчёта спросить состав команды для титульника.

## Key decisions
- Стек: Next.js 16.4.5 + Supabase (Postgres, pgvector halfvec, FTS russian, Auth, Storage, pg_cron + pg_net) + Vercel + GitHub Actions + OpenRouter (fetch, без SDK). Dockerfile, `output: "standalone"`.
- Дизайн — вариант A «Консоль» (выбран по критерию «проще и быстрее»): `docs/design.md`, токены в `src/app/globals.css` (старые имена прототипа — алиасы, уйдут вместе с прототипом).
- Ключевые поля разметки = `required` или `filter`; enum без учёта регистра → каноническое значение; ПДн: регулярки + `keepNames` (преподаватели из схемы) по формам фамилии, не по префиксу.
- БД: RLS через `can_read_dataset`/`can_write_dataset` (security definer); лимит демо 30 документов — триггер; разметка только по утверждённым правилам — триггер; одна активная разметка — частичный unique-индекс; `claim_batches` только для сервисного ключа.
- Next.js 16: перед кодом читать `node_modules/next/dist/docs/`; `middleware` → `proxy`; `cacheComponents: true` → `params` только с `generateStaticParams` или под `<Suspense>`; динамический GET-хендлер — `await connection()`.

## Done
- 2026-10-11 … 2026-11-07: scaffold, прототип v1 на моках, план v2, spec v2.0, данные распакованы.
- 2026-11-07 этап 1 (коммит 15a11f1): три HTML-мока `docs/design/variant-{a,b,c}.html`, 18 скриншотов `docs/screenshots/design/`, выбран A, токены, `docs/design.md`.
- 2026-11-07 ядро разметки (fc8dcd8): `src/lib/labeling/` — units, batching, schema (zod), merge A/B/арбитр, kappa, pii; критерии `docs/labeling-core.md`; TDD с двумя критиками (Opus). 99 тестов. На реальных данных: 572 документа, 5 787 единиц (совпало с frontmatter у всех), ПДн в 349 документах, 0,5 с.
- 2026-11-07 заготовки этапа 2 без ключей (0fa3884): миграции `supabase/migrations/` (схема v2, RLS, `match_chunks` RRF, `neighbor_chunks`, `claim_batches`; Storage + pg_cron отдельным файлом), 21 SQL/RLS-тест в PGlite (мутационная проверка: ломаются нужные), `/api/health`, `.github/workflows/ci.yml`, `Dockerfile`, `.env.example` под v2, Next 16.4.5 (уязвимость 16.4.0).
- Всего тестов: 120, lint/tsc/build чистые.

## Now
- Ждём ключи от пользователя (этап 2): Supabase, OpenRouter, `gh auth login`, `npx supabase login`, Vercel, `.env.local`. Без них этапы 2–8 не проверить.

## Next
1. Без ключей: ядро загрузки (этап 3) через TDD — zip (fflate, имена CP866 через `TextDecoder('ibm866')`), pdf (unpdf, по страницам), docx (mammoth → разделы), txt/md → единицы, sha256, дедуп, маскирование в `preview`.
2. С ключами: этап 2 — репо на GitHub, `supabase db push`, Vault-секреты, вход + демо-вход (`proxy`), Vercel, CI зелёный.
3. Этапы 3–8 по `docs/plan.md`; экраны — по `docs/design.md` (вариант A), проверка в браузере: десктоп, 375 px, тёмная тема.

## Files (этот чат)
- Новые: `docs/design.md`, `docs/design/*`, `docs/screenshots/design/*`, `docs/labeling-core.md`, `src/lib/labeling/*`, `supabase/migrations/*`, `supabase/tests/db.test.ts`, `src/app/api/health/route.ts`, `.github/workflows/ci.yml`, `Dockerfile`, `.dockerignore`.
- Изменены: `src/app/globals.css`, `src/app/layout.tsx`, `next.config.ts`, `package.json`, `.env.example`, `docs/ai-log.md`, `docs/requirements.md`.
- Вне репо: `C:\Dmitry\.claude\launch.json` — конфиги `study-rag` (start), `study-rag-dev`, `design-mocks` (python http.server на 8765).

## Deviations from plan
- Критерии TDD не согласовывались отдельно (пользователь: «без промежуточных согласований») — записаны в `docs/labeling-core.md`.
- Миграция написана до SQL-тестов (не чистый TDD); компенсировано мутационной проверкой.
- Пакет `@electric-sql/pglite-pgvector` добавлен вторым вопросом (в PGlite 0.5 pgvector вынесен отдельно).

## Tried / didn't work
- Headless Edge: в песочнице не запускается; в bash-цикле `\\$v` в пути давал файлы `design$v-…png` — использовать `docs/design/shot.sh` (по кадру, вне песочницы).
- Локальные `file://` во встроенном браузере — только статичный снимок; моки отдавать через `design-mocks`.
- Python на Windows пишет CRLF в текстовом режиме — `io.open(..., newline='')`.
- Убивать все `node`-процессы для остановки сервера — запрещено автоматикой; использовать preview_start/stop.
- `docker build` — UNCONFIRMED (Docker не установлен). CI — UNCONFIRMED (не запускался).
- `next/link` на `#якорь` не прокручивает → `<a>`; стрелка в `useEffect` с неявным возвратом → краш в проде.
