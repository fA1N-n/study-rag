# STATUS — Study RAG

## Goal
Проект OTUS «Разработка веб-приложения с AI-агентами». RAG-ассистент по учебным материалам группы КИ за 5 семестров (лекции, методички, pptx, отчёты из Blackboard и Telegram): ответ со ссылкой на документ и слайд/страницу, фильтры по предмету/семестру/преподавателю/типу.
Успех: прод онлайн; hit@5 ≥ 0.8 на eval-наборе, без выдумок; закрыты все требования курса (ниже). Защита — дата неизвестна (точно не 20.10); план — 4 недельных этапа до ~08.11 (spec §12).

## Constraints (требования курса)
- ≥3 экранов, адаптив, формы, состояния загрузки/ошибок.
- Postgres ≥3 связанных таблиц, CRUD в UI (предметы и документы: создать/редактировать/удалить), auth, валидация.
- ≥2 доп. функций: внешний API (LLM), загрузка файлов, поиск/фильтры.
- Деплой онлайн, CI/CD автодеплой, Dockerfile, тесты, Git с понятной историей.
- README (идея, запуск, стек, скриншоты, ссылка на прод), `docs/ai-log.md` (AI на каждом этапе, промпты, проблемы, выводы) — вести с первого дня.
- Пользователь сам: Text-to-UI (v0/Lovable) со скриншотами, анализ конкурентов (NotebookLM, ChatGPT Projects), утверждение темы.
- Материалы КИ не в публичный репо (.gitignore).

## Key decisions
- Стек: Next.js (TS, Tailwind) + API routes (бэкенд, без Express) + Supabase (Postgres, pgvector, FTS russian, Auth, Storage) + Vercel + GitHub Actions; LLM DeepSeek через OpenRouter; эмбеддинги/reranker через API (выбор по eval); zod, Vitest.
- Регистрация закрыта, аккаунты вручную (Дима, Ксюша, проверяющий); RLS.
- Таблицы: subjects → documents → chunks, + questions (история, 👍/👎).
- Экраны: вход, чат, библиотека (фильтры + CRUD), загрузка, история, eval.
- RAG не упрощать: контекст в чанке (предмет·семестр·документ·слайд), гибрид FTS+вектор+RRF, rerank, переписывание запроса + автофильтры, соседние слайды ±1, честный отказ + сноски; потом дедуп, eval-таблица «до/после», фидбек, стриминг.
- Старый RAG (`OneDrive/Документы/RAG`) — только идеи, не код. Obsidian-заметки в корпус не брать.
- Данные: Ксюша + её Codex по `docs/data-collection.md` → `output/<сем>/<предмет>/*.md` (frontmatter, `## Слайд N`/`## Страница N`, `> [!image]`), `manifest.csv`, `questions.csv` (Codex генерирует 60–80, Ксюша ставит keep=0).

## Done
- Тема, стек, требования согласованы; `docs/data-collection.md` для Ксюши + Codex.
- 2026-10-11: git, Next.js 16.4 scaffold, `.gitignore`, `.env.example`, `docs/requirements.md`, `docs/ai-log.md`, `docs/spec.md` v0.1.
- 2026-10-17 — **часть 1 из 5 (интерфейс)**: 6 экранов на моках (`src/lib/mock.ts`): `/login`, `/` (чат: фильтры, имитация стрима, сноски, отказ, 👍/👎), `/library` (CRUD предметов/документов в `<dialog>`), `/library/[id]` (слайды с якорями), `/upload` (разбор frontmatter, прогресс), `/history`. Lint/tsc/build зелёные, проверено в браузере (десктоп + 375 px). Скриншоты `docs/screenshots/`. План в spec §12 переделан на 5 частей.
- 2026-10-17 — редизайн «читальный зал» (токены в `globals.css`, общие классы в `src/components/ui.ts`; Literata + IBM Plex Sans/Mono; светлая/тёмная тема). Экраны: Вопрос, Указатель, Поступления, Журнал. Проверено: десктоп, 375 px, dark. Скриншоты пересняты.

## Now
- 2026-11-07: поворот v2 — загрузка своего неразмеченного датасета → агент придумывает правила → батчи → мультиагентная разметка (A/B + арбитр + человек) → RAG по размеченному. План: `docs/plan.md` (этапы 0–8), на согласовании. Ориентир — проекты одногруппников по «Большим данным» (FlowDesk, SkillPath AI).
- Пришли данные без Blackboard (архив 07.11, 572 md, у 41 % нет предмета) — лежат вне репо, в репо не класть.
- `.env.local` нет — доступы (Supabase, OpenRouter, GitHub, Vercel) не заведены.

## Next
- Этап 0 из `docs/plan.md`: ответы на открытые вопросы, доступы, spec v2. Затем этап 1 — три варианта дизайна.

## Files
- `docs/*.md`, `docs/screenshots/`, `STATUS.md`, `README.md`, `.gitignore`, `.gitattributes`, `.env.example`.
- `src/lib/mock.ts`, `src/components/{ui.ts,Nav.tsx,AnswerView.tsx}`, `src/app/layout.tsx`, `src/app/login/`, `src/app/(app)/{layout,page}.tsx`, `library/`, `library/[id]/`, `upload/`, `history/`, `public/sample.md`.
- Вне репо: `C:\Dmitry\.claude\launch.json` (preview: `npm --prefix C:/Projects/study-rag run start`; нужна `npm run build` перед ним).

## Notes
- Next.js 16: читать `node_modules/next/dist/docs/` перед кодом (см. `AGENTS.md`); `middleware` → `proxy`.
- git identity в репо локальная: Dmitriy Nikulin / nikulin.dmitry11@gmail.com.
- Секретный ключ Supabase — только для локальных CLI (импорт, eval), не в Vercel.

## Deviations from plan
- Экран eval перенесён в P2 (CLI + `docs/eval.md`) — ждёт подтверждения.
- План: 4 этапа → 5 частей, первой идёт UI-прототип на моках (по просьбе пользователя, для отчётности).

## Tried / didn't work
- `next/link` на `#unit-N` не прокручивает к якорю → обычный `<a>`.
- Headless Edge `--screenshot` по URL с `#якорем` рисует sticky-шапку со сдвигом — такие кадры снимать во встроенном браузере.
- Стрелка в `useEffect` с неявным возвратом → краш в проде («i is not a function»); только блочное тело.
- `params` в странице при `cacheComponents: true` без `generateStaticParams` → ошибка prerender.
