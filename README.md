# Study RAG

Учебный ассистент по материалам группы КИ: отвечает на вопросы по лекциям, методичкам и презентациям за 5 семестров со сносками на документ и слайд. Проектная работа OTUS.

В разработке, проект идёт в 5 частей (см. [spec §12](docs/spec.md)). Готова часть 1 — интерфейс на демо-данных. ТЗ — [docs/spec.md](docs/spec.md), требования — [docs/requirements.md](docs/requirements.md), журнал работы с AI — [docs/ai-log.md](docs/ai-log.md).

## Запуск

```bash
npm install
cp .env.example .env.local   # заполнить ключи
npm run dev
```

## Часть 1 — прототип интерфейса

Все экраны работают на вымышленных демо-данных (`src/lib/mock.ts`), без базы и LLM. В чате попробуйте примеры вопросов — ответ печатается по кусочкам, сноски ведут на слайд в документе.

Дизайн — «читальный зал»: бумага и чернила, засечки Literata, моноширинный IBM Plex Mono для служебного, сноски как в книге; переход по сноске подсвечивает слайд маркером. Светлая и тёмная тема по настройке системы.

| Экран | Путь | Скриншот |
|---|---|---|
| Вход | `/login` | [login.png](docs/screenshots/login.png) |
| Вопрос (чат) | `/` | [chat.jpg](docs/screenshots/chat.jpg), [мобильный](docs/screenshots/mobile-chat.png) |
| Указатель (CRUD предметов и документов) | `/library` | [library.png](docs/screenshots/library.png) |
| Документ по слайдам | `/library/d1#unit-5` | [library-d1.png](docs/screenshots/library-d1.png), [подсветка слайда](docs/screenshots/library-d1-slide5.jpg) |
| Поступления (загрузка .md) | `/upload` | [upload.png](docs/screenshots/upload.png) |
| Журнал (история) | `/history` | [history.png](docs/screenshots/history.png) |
