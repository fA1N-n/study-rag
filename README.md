# Study RAG

Веб-приложение для неразмеченных учебных материалов: вы загружаете набор документов, агент-архитектор предлагает схему и правила разметки, человек их утверждает, два агента-разметчика размечают корпус батчами, арбитр решает споры, сомнительное уходит человеку. По размеченному корпусу работает RAG: ответ стримом со сносками на документ и страницу/слайд, поля разметки становятся фильтрами поиска.

Первый датасет — материалы группы КИ за 5 семестров: 572 документа, 5 787 страниц/слайдов, 11 082 чанка.

Проект сдаётся по двум курсам: «Большие данные» (КАИ) и OTUS «Разработка веб-приложения с AI-агентами». ТЗ — [docs/spec.md](docs/spec.md), архитектура — [ARCHITECTURE.md](ARCHITECTURE.md), метрики — [docs/eval.md](docs/eval.md), требования — [docs/requirements.md](docs/requirements.md), журнал работы с AI — [docs/ai-log.md](docs/ai-log.md).

**Прод:** https://study-rag-livid.vercel.app — вход без регистрации кнопкой «Войти как проверяющий». Ответ в чате идёт 30–100 с: бесплатные модели медленные.

**Text-to-UI:** экраны чата и доски, сгенерированные v0 по текстовому описанию, — ветка [`v0/chat-and-labeling-board`](https://github.com/fA1N-n/study-rag/tree/v0/chat-and-labeling-board) (в `main` не сливалась).

## Как это работает

```
загрузка zip/md/txt/pdf/docx → единицы «Страница/Слайд/Раздел», дедуп sha256, маскирование ПДн
  → правила: архитектор (выборка 25) → критик (другие 15) → правка → человек утверждает
  → разметка: батчи → разметчики A и B → валидатор (zod по схеме) → арбитр по спорным → очередь человеку
  → индекс: чанк = единица (~2000 символов), заголовок из меток, эмбеддинги bge-m3
  → чат: переписывание + автофильтры → вектор + FTS → RRF → rerank LLM → соседи ±1 → ответ со сносками или отказ
```

## Стек

Next.js 16 (App Router, TypeScript), Tailwind 4, zod · Supabase: Postgres + pgvector (`halfvec(1024)`) + FTS russian, Auth, Storage, pg_cron + pg_net · бесплатные LLM OpenRouter (`:free`) с запасным Cloudflare Workers AI, эмбеддинги Cloudflare `@cf/baai/bge-m3` · Vitest + PGlite (SQL и RLS в памяти) · GitHub Actions · Vercel · Dockerfile (`output: "standalone"`).

Денег проект не тратит: все сервисы на бесплатных тарифах.

## Экраны

| Экран | Путь | Скриншот |
|---|---|---|
| Вход | `/login` | [login.jpg](docs/screenshots/v2/login.jpg) |
| Обзор датасета | `/d/[id]` | [overview.jpg](docs/screenshots/v2/overview.jpg) |
| Правила разметки | `/d/[id]/rules` | [375 px, тёмная](docs/screenshots/v2/rules-mobile-dark.jpg) |
| Доска разметки | `/d/[id]/labeling` | [labeling.jpg](docs/screenshots/v2/labeling.jpg), [офлайн-итог, тёмная](docs/screenshots/v2/labeling-offline-dark.jpg), [375 px](docs/screenshots/v2/labeling-mobile-dark.jpg) |
| Очередь проверки | `/d/[id]/review` | [review.jpg](docs/screenshots/v2/review.jpg), [375 px](docs/screenshots/v2/review-mobile-dark.jpg) |
| Чат | `/d/[id]/chat` | [chat.jpg](docs/screenshots/v2/chat.jpg) |
| История | `/history` | [history.jpg](docs/screenshots/v2/history.jpg) |

Ещё: список датасетов `/`, загрузка, таблица документов с фильтрами, документ по страницам с правкой меток. Три итерации дизайна — [docs/design.md](docs/design.md).

## Запуск локально

```bash
npm ci
cp .env.example .env.local   # заполнить ключи: Supabase, OpenRouter, Cloudflare, демо-пользователь, WORKER_SECRET
npx supabase link --project-ref <ref>
npx supabase db push
node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/setup-users.ts
npm run dev
```

Docker: `docker build -t study-rag . && docker run -p 3000:3000 --env-file .env.local study-rag`, проверка — `GET /api/health`.

## Проверки

```bash
npm run lint && npx next typegen && npx tsc --noEmit
npm test                                               # unit + SQL/RLS в PGlite
SMOKE_URL=http://localhost:3000 npx vitest run smoke   # smoke по живому серверу
```

## Скрипты

| Скрипт | Что делает |
|---|---|
| `scripts/import-dataset.ts` | загрузка папки .md тем же ядром, что и UI (`IMPORT_AS=demo IMPORT_PICK=8` — тестовый датасет демо) |
| `scripts/index-dataset.ts` | индексация большого датасета (дольше лимита функции) |
| `scripts/labeling/*` | офлайн-разметка агентами Claude Code / Codex, арбитр, серебряный набор |
| `scripts/eval/labeling-eval.ts` | точность разметки против серебряного набора и ручной проверки |
| `scripts/eval/search-eval.ts` | hit@5, MRR@10, отказы на очищенном `questions.csv` |

Материалы КИ в репозиторий не входят (`data/` в `.gitignore`).
