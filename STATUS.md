# STATUS — Study RAG

## Goal
Проект OTUS «Разработка веб-приложения с AI-агентами». RAG-ассистент по учебным материалам группы КИ за 5 семестров (лекции, методички, pptx, отчёты из Blackboard и Telegram): ответ со ссылкой на документ и слайд/страницу, фильтры по предмету/семестру/преподавателю/типу.
Успех: прод онлайн; hit@5 ≥ 0.8 на eval-наборе, без выдумок; закрыты все требования курса (ниже). Защита ~20.10.2026 по презе (UNCONFIRMED) — конфликтует с планом из 4 недельных этапов до 08.11, уточнить.

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
- Тема, стек, требования согласованы.
- `docs/data-collection.md` — инструкция Ксюше + Codex.
- Этап 1 (2026-10-11): git (`main`, 2 коммита), Next.js 16.4 scaffold (TS, Tailwind 4, ESLint, `src/`), `.gitignore` (материалы КИ, `.env*` кроме `.env.example`), `.gitattributes` (LF), `.env.example`, README-заглушка, `docs/requirements.md`, `docs/ai-log.md` (3 записи; запись 04.10 восстановлена по заметкам — UNCONFIRMED), `docs/spec.md` v0.1.

## Now
- ТЗ на согласовании у пользователя (и у преподавателя).
- Пользователь регистрирует Supabase / OpenRouter / GitHub / Vercel и заполняет `.env.local`.
- Ксюша собирает данные (статус UNCONFIRMED).

## Next
Работаем по этапам из spec §12: раз в неделю показ рабочей версии, за чат — один этап (или его часть), не всё сразу.
- Этап 1 (до показа ~18.10, остаток): правки ТЗ; диаграмма архитектуры; GitHub repo + push; миграции Supabase (таблицы, RLS, bucket; функции поиска — заготовкой); вход (`@supabase/ssr`, `src/proxy.ts`, `/login`); пустые экраны с навигацией; CI (lint, typecheck, build) + Vercel.
- Этап 2 (19–25.10): CRUD, загрузка .md, парсер/чанкер TDD, импорт, эмбеддинги, просмотр документа.
- Этап 3 (26.10–01.11): поиск, rerank, чат, история, фидбек.
- Этап 4 (02–08.11): eval, Docker, README, презентация.

## Files
- `docs/data-collection.md`, `docs/requirements.md`, `docs/ai-log.md`, `docs/spec.md`, `STATUS.md`, `README.md`, `.gitignore`, `.gitattributes`, `.env.example`, scaffold Next.js.

## Notes
- Next.js 16: читать `node_modules/next/dist/docs/` перед кодом (см. `AGENTS.md`); `middleware` → `proxy`.
- git identity в репо локальная: Dmitriy Nikulin / nikulin.dmitry11@gmail.com.
- Секретный ключ Supabase — только для локальных CLI (импорт, eval), не в Vercel.

## Deviations from plan
- Экран eval перенесён в P2 (CLI + `docs/eval.md`) — ждёт подтверждения.

## Tried / didn't work
- —
