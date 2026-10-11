# STATUS — Study RAG

## Goal
Проект OTUS «Разработка веб-приложения с AI-агентами». RAG-ассистент по учебным материалам группы КИ за 5 семестров (лекции, методички, pptx, отчёты из Blackboard и Telegram): ответ со ссылкой на документ и слайд/страницу, фильтры по предмету/семестру/преподавателю/типу.
Успех: прод онлайн; hit@5 ≥ 0.8 на eval-наборе, без выдумок; закрыты все требования курса (ниже). Защита ~20.10.2026, сдача ~за неделю (даты в презе неточные — UNCONFIRMED).

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
1. Правки ТЗ по замечаниям.
2. Supabase: `supabase/migrations/` по схеме из spec §4 (таблицы, RLS, `match_chunks`, `neighbor_chunks`, bucket), signup off, 3 аккаунта; `supabase link` + `db push`.
3. Auth: `@supabase/ssr`, `src/proxy.ts` (не middleware — Next 16), `/login`.
4. Парсер .md + чанкер (TDD, синтетические фикстуры) → импорт CLI → эмбеддинги; поиск; чат. Пока данных нет — мини-корпус из 2–3 синтетических md.
5. GitHub repo + Actions, Vercel, Dockerfile.

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
