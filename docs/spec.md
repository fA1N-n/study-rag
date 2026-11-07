# ТЗ — Study RAG

Версия 2.0 (2026-11-07), статус: утверждено пользователем в чате. План работ — `docs/plan.md`.

Проект сдаётся по двум курсам: проектная работа по «Большим данным» (КАИ, отчёт .docx в формате кафедры, как у FlowDesk и SkillPath AI) и итоговый проект OTUS «Разработка веб-приложения с AI-агентами».

## 1. Идея

Пользователь загружает свой неразмеченный набор учебных документов. Агент-архитектор изучает выборку и предлагает схему разметки и правила, человек их утверждает. Документы делятся на батчи, два агента-разметчика размечают их независимо, арбитр решает расхождения, сомнительное уходит человеку. По размеченному корпусу работает RAG: ответ со сносками на документ и страницу/слайд, поля разметки становятся фильтрами и автофильтрами поиска.

Первый датасет — материалы группы КИ за 5 семестров (лекции, методички, задания, отчёты из Telegram и «Загрузок»; Blackboard догружается позже).

Отличие от NotebookLM / ChatGPT Projects: корпус на сотни документов, автоматическая разметка с контролем качества (согласие агентов, арбитр, очередь проверки), фильтры по меткам, ссылка на конкретную страницу, метрики качества разметки и поиска.

## 2. Роли и доступ

- **owner** — мы (аккаунты создаются вручную, регистрации нет): всё, без лимитов.
- **demo** — кнопка «Войти как проверяющий» на странице входа: видит демо-датасет, задаёт вопросы, может загрузить свой маленький датасет и разметить его. Лимиты: ≤ 30 вопросов в сутки, ≤ 30 документов на датасет, 1 активная разметка.
- Датасеты видит только владелец (RLS); демо-датасет — все аутентифицированные, правит только owner.
- История вопросов — у каждого своя.
- На публичном демо — только наши материалы; ФИО, телефоны и почты в документах маскируются.

## 3. User stories

| # | История | Проверяемый результат |
|---|---|---|
| US1 | Как пользователь, хочу войти по email/паролю или кнопкой «Войти как проверяющий» | неверный пароль — ошибка; демо-вход открывает демо-датасет |
| US2 | Хочу создать датасет и загрузить в него zip или файлы .md/.txt/.pdf/.docx | документы появились в списке; дубли по sha256 пропущены с пометкой |
| US3 | Хочу, чтобы система сама предложила схему разметки и правила | черновик правил: поля, допустимые значения, правила с примерами, замечания критика |
| US4 | Хочу править и утверждать правила | утверждённая версия фиксируется; разметка идёт только по утверждённой |
| US5 | Хочу запустить разметку и видеть прогресс вживую | доска: батчи по статусам, работа агентов, согласие, стоимость |
| US6 | Хочу проверить спорные документы | очередь: метки A, B, решение арбитра, цитаты; принять/исправить одним действием |
| US7 | Хочу править метки и удалять документы вручную | изменения сохраняются, метка помечается как «человек» |
| US8 | Хочу задать вопрос и получить ответ стримом со сносками | каждое утверждение со сноской; источник открывается рядом с подсветкой |
| US9 | Хочу фильтровать поиск по полям разметки | фильтры строятся из схемы датасета; автофильтры видны и снимаются |
| US10 | Хочу честный отказ, если ответа нет | без выдумки, с ближайшими документами |
| US11 | Хочу историю вопросов и оценку ответа 👍/👎 | история только своя; оценка сохраняется |
| US12 | Как разработчик, хочу метрики качества | eval разметки (точность по полям, каппа) и поиска (hit@5, MRR, отказы), сравнение «без меток / с метками» |

## 4. Схема БД

```sql
create extension if not exists vector;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'demo' check (role in ('owner','demo'))
);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  name text not null check (length(name) between 2 and 120),
  description text,
  is_demo boolean not null default false,
  status text not null default 'empty' check (status in
    ('empty','ingesting','ingested','rules','labeling','labeled','indexing','ready','failed')),
  active_ruleset_id uuid,                 -- fk добавляется после rulesets
  stats jsonb not null default '{}',      -- число документов, единиц, доли меток, стоимость
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  filename text not null,
  storage_path text not null,             -- нормализованный .md в Storage
  sha256 text not null,
  units int not null default 0,
  preview text not null default '',       -- начало документа после маскирования ПДн — вход агентов
  pii_flag boolean not null default false,
  labels jsonb not null default '{}',     -- итоговые метки по схеме активных правил
  label_status text not null default 'unlabeled' check (label_status in
    ('unlabeled','agreed','refereed','review','human')),
  created_at timestamptz not null default now(),
  unique (dataset_id, sha256)
);
create index on documents using gin (labels jsonb_path_ops);

create table rulesets (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  version int not null,
  fields jsonb not null,    -- [{key, label, type: enum|text|int|bool, values?, required, filter}]
  rules text not null,      -- правила для агентов, markdown
  examples jsonb not null default '[]',
  critique text,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  author text not null check (author in ('agent','user')),
  created_at timestamptz not null default now(),
  unique (dataset_id, version)
);

create table label_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  ruleset_id uuid not null references rulesets(id),
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  total_batches int not null default 0,
  done_batches int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric(10,4) not null default 0,
  started_at timestamptz, finished_at timestamptz
);

create table batches (
  id bigint generated always as identity primary key,
  job_id uuid not null references label_jobs(id) on delete cascade,
  seq int not null,
  document_ids uuid[] not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  locked_until timestamptz,
  error text
);

create table labels (                     -- каждое решение каждого агента
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  job_id uuid references label_jobs(id) on delete cascade,
  agent text not null check (agent in ('A','B','referee','human')),
  model text,
  values jsonb not null,
  confidence real check (confidence between 0 and 1),
  rationale text,
  created_at timestamptz not null default now()
);

create table chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  unit_label text not null,               -- 'Страница 12' | 'Слайд 5' | 'Раздел: …'
  unit_no int,
  part smallint not null default 0,
  header text not null,                   -- метки + название + единица
  content text not null,
  embedding halfvec(1024),
  tsv tsvector generated always as (to_tsvector('russian', header || ' ' || content)) stored,
  unique (document_id, unit_no, part)
);
create index on chunks using hnsw (embedding halfvec_cosine_ops);
create index on chunks using gin (tsv);

create table questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  question text not null check (length(question) between 2 and 2000),
  rewritten_query text, filters jsonb, answer text, sources jsonb,
  refused boolean not null default false,
  feedback smallint check (feedback in (-1, 1)),
  model text, latency_ms int,
  created_at timestamptz not null default now()
);
```

- Метки хранятся в `documents.labels` (jsonb + GIN), поэтому схема разметки может быть любой — фильтр `labels @> '{"subject":"…"}'`.
- `halfvec(1024)` — вдвое меньше места (лимит 500 МБ на бесплатном Supabase).
- RLS: датасет и всё, что ниже, — владельцу; демо-датасет — чтение всем аутентифицированным; `questions` — только свои.
- RPC: `match_chunks(dataset, embedding, text, filters, k)` — гибрид с RRF; `neighbor_chunks(ids)`; `claim_batches(n)` — `FOR UPDATE SKIP LOCKED`.

## 5. Экраны

| Экран | Путь | Содержимое |
|---|---|---|
| Вход | `/login` | email/пароль, кнопка «Войти как проверяющий» |
| Датасеты | `/` | карточки датасетов: шаги конвейера (загрузка → правила → разметка → индекс → чат), счётчики; создать/переименовать/удалить |
| Датасет | `/d/[id]` | обзор: статистика, распределение меток, что делать дальше |
| Загрузка | `/d/[id]/upload` | перетаскивание zip/файлов, прогресс, итог (новые / дубли / ошибки) |
| Правила | `/d/[id]/rules` | поля и значения, текст правил, примеры, замечания критика, версии, «Утвердить» |
| Разметка | `/d/[id]/labeling` | доска: сетка батчей, дорожки агентов, согласие, токены, стоимость, «Запустить/Остановить» |
| Проверка | `/d/[id]/review` | документ слева; метки A, B, арбитра с цитатами справа; принять/исправить, горячие клавиши |
| Документы | `/d/[id]/docs`, `/d/[id]/docs/[docId]` | таблица с метками и фильтрами, правка меток, удаление; просмотр по страницам |
| Чат | `/d/[id]/chat` | три колонки: фильтры из схемы и история — ответ стримом со сносками — источник с подсветкой |
| История | `/history` | свои вопросы, поиск, фильтр «👎» |

Адаптив от 360 px (на телефоне колонки — вкладки), состояния загрузки/пусто/ошибка на каждом экране. Дизайн выбирается на этапе 1 из трёх вариантов и описывается в `docs/design.md`.

## 6. Конвейер

### Загрузка
Браузер кладёт файлы прямо в Storage по подписанной ссылке (у Vercel лимит тела 4,5 МБ) → воркер распаковывает zip, приводит .md/.txt/.pdf/.docx к единицам `## Страница N` / `## Слайд N` / `## Раздел: …` (формат из `docs/data-collection.md`), чинит битые имена, считает sha256, маскирует ПДн в `preview`.

### Правила
Архитектор берёт стратифицированную выборку 20–30 документов (источник, папка, размер) и выдаёт JSON: поля, значения, правила, примеры. Критик проверяет их на другой выборке, архитектор правит (одна итерация). Человек правит и утверждает.

### Разметка
Координатор режет документы на батчи (~15–20 по бюджету токенов). Разметчики A и B (разные модели или промпты) независимо выдают по каждому документу значения + уверенность + цитату. Валидатор (zod по схеме) отбрасывает недопустимые значения. Совпали ключевые поля → `agreed`. Расходятся → арбитр → `refereed`. Арбитр не уверен или уверенность ниже порога → `review`. Ошибки батча — повтор до 3 раз.

Очередь: pg_cron раз в минуту вызывает `/api/worker/tick` (по секрету); тик забирает несколько батчей, обрабатывает их параллельно и укладывается в лимит функции. Кнопка «Запустить» вызывает тик сразу. UI опрашивает прогресс.

### Индексация и ответ
Чанк = единица (длинная — частями по ~2000 символов с перекрытием ~200), `header` из меток. Ответ: переписывание запроса + автофильтры по полям схемы → гибрид вектор top-40 + FTS top-40 → RRF → top-30 → rerank → top-6 → порог (отказ) → соседи ±1 → генерация со сносками, стрим → запись в `questions`.

## 7. API (Route Handlers)

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/auth/demo` | вход демо-пользователя |
| GET, POST | `/api/datasets` | список, создать |
| GET, PATCH, DELETE | `/api/datasets/[id]` | датасет, переименовать, удалить |
| POST | `/api/datasets/[id]/upload-url` | подписанная ссылка в Storage |
| POST | `/api/datasets/[id]/ingest` | поставить распаковку в очередь |
| GET | `/api/datasets/[id]/documents` | `?filter&q&page` |
| PATCH, DELETE | `/api/documents/[id]` | правка меток (→ `human`), удаление |
| POST | `/api/datasets/[id]/rulesets` | сгенерировать черновик (архитектор + критик) |
| PATCH | `/api/rulesets/[id]` | правка, утверждение |
| POST | `/api/datasets/[id]/jobs` | запустить разметку |
| GET, POST | `/api/jobs/[id]`, `/api/jobs/[id]/cancel` | прогресс, остановка |
| GET | `/api/datasets/[id]/review` | очередь проверки |
| POST | `/api/datasets/[id]/index` | индексация |
| POST | `/api/worker/tick` | обработка очереди (секрет) |
| POST | `/api/ask` | вопрос → SSE: `sources`, `token`…, `done` |
| GET, PATCH | `/api/questions`, `/api/questions/[id]` | история, оценка |
| GET | `/api/health` | для Docker и smoke |

Все маршруты, кроме health, worker (секрет) и demo, требуют сессию; ввод — zod; лимиты demo проверяются на сервере. Секретный ключ Supabase — только у воркера и CLI.

## 8. Стек

Next.js 16 (App Router, TS), Tailwind 4, zod, `@supabase/ssr` + `@supabase/supabase-js`, Vitest; Supabase (Postgres + pgvector + FTS russian, Auth, Storage, pg_cron + pg_net); OpenRouter (DeepSeek и вторая модель для разметчика B; эмбеддинги и reranker — по eval); Vercel + GitHub Actions; Dockerfile (`output: 'standalone'`). Новые пакеты (распаковка zip, pdf, docx, тестовая БД) — по согласованию с пользователем.

## 9. Тесты и качество

- Unit: разбор единиц, батчинг, валидатор схемы, слияние A/B/арбитр, каппа, маскирование ПДн, сборка `header`, сноски.
- SQL: миграции и RLS (владелец, чужой, demo), `match_chunks`, `claim_batches`.
- Smoke: health, вход, демо-вход.
- Eval разметки: золотой набор ~80 документов → точность по полям, каппа A/B, доли agreed/refereed/review, стоимость; «один разметчик» против «двое + арбитр».
- Eval поиска: очищенный `questions.csv` + 15–20 настоящих вопросов → hit@5, MRR@10, правильные отказы; «RAG без меток» против «с метками». Таблицы — `docs/eval.md`.

## 10. Критерии приёмки

1. Без входа всё, кроме `/login`, редиректит на вход; API — 401; регистрации нет; демо-вход работает и упирается в лимиты.
2. Датасет создаётся, переименовывается, удаляется; загрузка нашего архива даёт 572 документа, повторная — 0 новых.
3. Черновик правил генерируется, правится, утверждается; разметка без утверждённых правил не запускается.
4. Разметка всего датасета доходит до конца с прогрессом вживую; упавшие батчи повторяются; итог: доли agreed/refereed/review и стоимость.
5. Очередь проверки показывает A, B, арбитра; решение человека сохраняется как `human`.
6. Ответ стримом со сносками; источник открывается рядом с подсветкой нужной страницы; фильтры из схемы работают.
7. На вопрос без ответа — отказ без выдумки.
8. История и 👍/👎 — только свои (проверено вторым аккаунтом).
9. Eval: точность разметки и hit@5 записаны в `docs/eval.md`; цель hit@5 ≥ 0.8.
10. Все экраны работают на 360 px и десктопе, с состояниями загрузки/ошибки/пусто.
11. CI зелёный (lint, типы, тесты, build); push в `main` деплоит на Vercel; `docker run` поднимает приложение, `/api/health` → 200.
12. В git нет материалов КИ и секретов.

## 11. Вне рамок

- Описание картинок vision-моделью (оригиналов нет в архиве).
- pptx и сканы на сервере (их конвертирует конвейер сбора `docs/data-collection.md`).
- Мультиходовой чат с памятью диалога.
