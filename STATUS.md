# STATUS — Study RAG

## Goal
Веб-приложение: пользователь загружает свой неразмеченный набор учебных документов → агент-архитектор предлагает схему и правила разметки → человек утверждает → батчи → разметчики A/B + арбитр + очередь проверки → RAG по размеченному корпусу (ответ со сносками на страницу/слайд, фильтры из схемы разметки). Первый датасет — материалы группы КИ за 5 семестров.
Сдаём по двум курсам: «Большие данные» (КАИ, проектная работа, отчёт .docx) и OTUS «Разработка веб-приложения с AI-агентами».
Успех: прод онлайн с демо-входом; наш датасет загружен, размечен и отвечает; hit@5 ≥ 0.8; метрики разметки и поиска в `docs/eval.md`; все требования `docs/requirements.md` закрыты; отчёт .docx, презентация, README. Дата защиты неизвестна (точно не 20.10).

## Constraints
- Требования курсов — `docs/requirements.md`. Ориентир по уровню — проекты одногруппников по «Большим данным»: FlowDesk (`C:\Users\dimik\Downloads\FlowDesk_Отчет.docx`, `FlowDesk_Презентация.pptx`, код `flowdesk_dev.zip` — внутри чужой `.env`, не открывать и не пересылать) и SkillPath AI (`Проект_Садриев_Поливцев_Насыбуллина_Skillpath.docx`, github.com/sadrieff/skillpath-ai).
- Материалы КИ не в репо: лежат в `data/` (в `.gitignore`).
- RAG не упрощать (гибрид, rerank, переписывание, соседи, отказ, сноски).
- Новые npm-пакеты — по согласованию с пользователем (пачкой).
- Команды для пользователя — Windows PowerShell 5.1.

## Key decisions
- Стек: Next.js 16 + Supabase (Postgres, pgvector halfvec, FTS russian, Auth, Storage, pg_cron + pg_net) + Vercel + GitHub Actions + OpenRouter. Dockerfile.
- Роли owner/demo; кнопка «Войти как проверяющий» с лимитами; регистрации нет.
- Метки в `documents.labels` jsonb + GIN — схема разметки произвольная; фильтры чата строятся из схемы.
- Долгие задачи: очередь в Postgres (`claim_batches` с `SKIP LOCKED`), pg_cron → `/api/worker/tick`.
- Загрузка в Storage напрямую из браузера (лимит Vercel 4,5 МБ).
- Дизайн «читальный зал» отвергнут пользователем — на этапе 1 три варианта на выбор (трёхколоночный чат с источником рядом + доска разметки).
- Next.js 16: перед кодом читать `node_modules/next/dist/docs/`; `middleware` → `proxy`; `cacheComponents: true` → `params` только с `generateStaticParams` или под `<Suspense>`.

## Done
- 2026-10-11: git, Next.js 16.4 scaffold, `.gitignore`, `.env.example`, `docs/data-collection.md`.
- 2026-10-17: прототип UI v1 на моках (6 экранов, `src/lib/mock.ts`), затем редизайн «читальный зал». Скриншоты `docs/screenshots/`.
- 2026-11-07: поворот v2. `docs/plan.md` (этапы 0–8), `docs/spec.md` v2.0, `docs/requirements.md` под v2 и два курса. Данные без Blackboard распакованы в `data/raw_2026-11-07/` (572 md, 22 МБ; без предмета 41 %, без преподавателя 240, битых имён 104, картинки без описаний 5 014, ~248 документов с чужими ФИО; `questions.csv` 64 непроверенных).

## Now
- Этап 0 почти закрыт: решения приняты; осталось пользователю завести доступы (Supabase, OpenRouter, GitHub + `gh auth login`, Vercel) и `.env.local` (сейчас нет).

## Next (по `docs/plan.md`)
1. Этап 1 — три варианта дизайна (HTML-моки: чат в три колонки + доска разметки) → выбор → токены, `docs/design.md`.
2. Ядро разметки без ключей (TDD): разбор единиц, батчинг, валидатор схемы, слияние A/B/арбитр, каппа, маскирование ПДн.
3. Этап 2 — инфраструктура (нужны ключи), этапы 3–8.

## Files
- `docs/plan.md`, `docs/spec.md`, `docs/requirements.md`, `docs/ai-log.md`, `docs/data-collection.md`, `docs/screenshots/`, `README.md`, `STATUS.md`.
- `src/` — прототип v1 на моках (будет заменён).
- Вне репо: `C:\Dmitry\.claude\launch.json` (preview `npm --prefix C:/Projects/study-rag run start`, перед ним `npm run build`; для правок — `run dev`).

## Deviations from plan
- v1 (готовый корпус) → v2 (свой датасет + мультиагентная разметка) по решению пользователя 2026-11-07.
- План из 5 недельных частей заменён этапами 0–8 без привязки к неделям.

## Tried / didn't work
- `next/link` на `#якорь` не прокручивает → обычный `<a>`.
- Стрелка в `useEffect` с неявным возвратом → краш в проде («i is not a function»).
- `params` при `cacheComponents: true` без `generateStaticParams` → ошибка prerender.
- Headless Edge `--screenshot` по URL с `#якорем` рисует sticky-шапку со сдвигом — такие кадры снимать во встроенном браузере.
- Локально нет Docker и Postgres: для SQL-тестов нужен PGlite (пакет — согласовать) или облачный Supabase.
