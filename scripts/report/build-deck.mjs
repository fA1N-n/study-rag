// Презентация к защите: node scripts/report/build-deck.mjs → docs/report/Study_RAG_защита.pptx
// Цифры — из docs/eval.md и STATUS.md (как в отчёте).
import pptxgen from "pptxgenjs";

const THEME = {
  name: "Study RAG",
  headFontFace: "Arial", bodyFontFace: "Calibri",
  colors: {
    dk1: "16152B", lt1: "FFFFFF", dk2: "2A2860", lt2: "F2F2F7",
    accent1: "4F46E5", accent2: "16A34A", accent3: "D97706", accent4: "DC2626", accent5: "64748B", accent6: "A5B4FC",
    hlink: "4F46E5", folHlink: "4338CA",
  },
};
const HEX = THEME.colors;
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Study RAG — защита проекта";
pres.author = "Никулин Д.Э., Тугулева К.С.";
const C = { text1: HEX.dk1, text2: HEX.dk2, background1: HEX.lt1, background2: HEX.lt2, accent1: HEX.accent1, accent2: HEX.accent2, accent3: HEX.accent3, accent4: HEX.accent4, accent5: HEX.accent5, accent6: HEX.accent6 };
const S = "docs/screenshots/";

pres.defineSlideMaster({
  title: "CONTENT", background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 32, bold: true, color: C.text1, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Study RAG · КНИТУ-КАИ, 2026", options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5 },
});
pres.defineSlideMaster({ title: "DARK", background: { color: HEX.dk2 }, objects: [] });

const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, valign: "top", ...o });
const title = (s, t) => s.addText(t, { placeholder: "title" });
const card = (s, x, y, w, h, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name });
const stat = (s, x, y, w, big, small, color = C.accent1) => {
  card(s, x, y, w, 1.7, "stat " + big);
  T(s, big, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.8, fontSize: 40, bold: true, color, fontFace: "Arial" });
  T(s, small, { x: x + 0.25, y: y + 1.0, w: w - 0.5, h: 0.6, fontSize: 14, color: C.text2 });
};
const bullets = (s, items, o) => s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 8 } })), { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, valign: "top", ...o });
const note = (s, text, o) => T(s, text, { fontSize: 12, italic: true, color: C.accent5, ...o });
const chartBase = { catAxisLabelColor: HEX.accent5, valAxisLabelColor: HEX.accent5, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt", valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 12, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, valAxisMinVal: 0, valAxisMaxVal: 115, valAxisMajorUnit: 20, dataLabelFormatCode: "0.0\"%\"", showTitle: true, titleFontSize: 14, titleColor: HEX.dk1 };

// 1. Титул
let s = pres.addSlide({ masterName: "DARK" });
T(s, "Проектная работа · Большие данные", { x: 0.8, y: 0.8, w: 11, h: 0.4, fontSize: 16, color: C.accent6 });
T(s, "Study RAG", { x: 0.8, y: 1.6, w: 11, h: 1.2, fontSize: 60, bold: true, color: C.background1, fontFace: "Arial" });
T(s, "Мультиагентная разметка учебных материалов и поиск по ним с ответами со ссылками на источник", { x: 0.8, y: 2.9, w: 10.5, h: 1.0, fontSize: 22, color: C.background1 });
T(s, "Никулин Д.Э., Тугулева К.С. · группа 4307\nРуководитель: Мокшин В.В.", { x: 0.8, y: 4.6, w: 8, h: 0.9, fontSize: 16, color: C.accent6 });
T(s, "study-rag-livid.vercel.app · вход «Войти как проверяющий»", { x: 0.8, y: 6.3, w: 10, h: 0.4, fontSize: 16, color: C.background1 });
s.addNotes("Тема, команда. Приложение открыто по ссылке, вход без регистрации.");

// 2. Проблема
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Материалы есть, но искать по ним нельзя");
stat(s, 0.6, 1.5, 2.85, "572", "документа КИ за I–V семестры");
stat(s, 3.7, 1.5, 2.85, "41 %", "без предмета", C.accent4);
stat(s, 6.8, 1.5, 2.85, "≈248", "с титульными листами: чужие ФИО, группы", C.accent3);
stat(s, 9.9, 1.5, 2.85, "5 014", "картинок без описаний", C.accent5);
bullets(s, [
  "Тип документа ставился по умолчанию: «задание» у 244, «другое» у 131",
  "Без меток нет фильтров «предмет», «преподаватель», «семестр»",
  "Чат-бот общего назначения отвечает без ссылки на слайд",
], { x: 0.6, y: 3.7, w: 7.4, h: 2.5 });
card(s, 8.4, 3.7, 4.35, 2.5, "idea");
T(s, "Идея", { x: 8.65, y: 3.9, w: 3.9, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
T(s, "Разметку делает приложение: агенты предлагают правила и размечают, человек утверждает и разбирает сомнительное. По размеченному корпусу работает RAG.", { x: 8.65, y: 4.35, w: 3.9, h: 1.8, fontSize: 15 });
s.addNotes("Почему нельзя просто загрузить архив в RAG: 41 % без предмета, ПДн, тип по умолчанию.");

// 3. Конвейер
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Конвейер: от загрузки до ответа со сносками");
s.addImage({ path: S + "report/pipe.png", x: 0.9, y: 1.4, w: 11.5, h: 11.5 * 988 / 2200 });
note(s, "Схема полей не зашита в код: её предлагает агент под конкретный набор, поэтому конвейер подходит для любых документов", { x: 0.9, y: 6.6, w: 11.5, h: 0.3 });
s.addNotes("Два контура: разметка (загрузка, правила, батчи, очередь проверки) и поиск (индекс, переписывание, гибрид, rerank).");

// 4. Архитектура
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Архитектура на бесплатных тарифах");
s.addImage({ path: S + "report/arch.png", x: 0.6, y: 1.45, w: 7.8, h: 7.8 * 928 / 2200 });
bullets(s, [
  "Next.js 16 на Vercel: экраны и 18 API-маршрутов",
  "Supabase: 9 таблиц, RLS, pgvector, FTS russian",
  "Очередь в Postgres; pg_cron раз в минуту будит воркер, если есть работа",
  "LLM — бесплатные модели OpenRouter, запасная — Cloudflare",
  "Сервисы и модели приложения — 0 ₽ (офлайн-разметка — по имеющейся подписке)",
], { x: 8.8, y: 1.5, w: 3.95, h: 4.5, fontSize: 15 });
s.addNotes("Долгая работа не влезает в 300 с функции Vercel — поэтому очередь и короткие тики.");

// 5. Разметка
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Двое разметчиков, арбитр и очередь человеку");
s.addChart(pres.charts.DOUGHNUT, [{ name: "Итог", labels: ["agreed", "refereed", "review"], values: [434, 39, 99] }], {
  x: 0.5, y: 1.4, w: 4.4, h: 4.2, holeSize: 55, chartColors: [HEX.accent2, HEX.accent3, HEX.accent4], showPercent: true, showValue: false, showLegend: true, legendPos: "b", legendFontFace: "+mn-lt", legendFontSize: 12, dataLabelColor: "FFFFFF", dataLabelFontSize: 12, dataLabelFontFace: "+mn-lt", showTitle: true, title: "572 документа после разметки", titleFontFace: "+mn-lt", titleFontSize: 14, titleColor: HEX.dk1,
});
bullets(s, [
  "Правила v1: архитектор по 30 документам, критик по другим 20 — 16 правок",
  "A — Claude Sonnet, B — Codex и Claude Haiku, арбитр — Claude Opus",
  "Каппа Коэна A/B по полям: 0,907–0,965 (A и Haiku — одно семейство, согласие завышено)",
  "Арбитр уверенно решил 39 из 69 споров, остальное — человеку",
], { x: 5.2, y: 1.5, w: 3.9, h: 4.2, fontSize: 15 });
s.addImage({ path: S + "v2/labeling.jpg", x: 9.3, y: 1.5, w: 3.45, h: 3.45 * 800 / 1280 });
note(s, "Доска разметки на проде", { x: 9.3, y: 1.5 + 3.45 * 800 / 1280 + 0.1, w: 3.45, h: 0.3 });
note(s, "Основной датасет размечен агентами офлайн (50 бесплатных запросов в день не хватает); в приложении весь путь проверен на 8 документах: 192 с, $0", { x: 0.6, y: 6.2, w: 12.1, h: 0.5 });
s.addNotes("Каппа с Haiku выше, чем с Codex: A и Haiku — одно семейство, общие ошибки каппа не видит.");

// 6. Качество разметки
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Схема не точнее лучшего разметчика, но сортирует");
s.addChart(pres.charts.BAR, [{ name: "Все поля верно", labels: ["A (Sonnet)", "B (Codex/Haiku)", "Двое + арбитр"], values: [83.8, 67.5, 83.8] }], {
  ...chartBase, x: 0.5, y: 1.4, w: 6.0, h: 4.3, barDir: "col", chartColors: [HEX.accent1], showLegend: false, title: "Совпадение с серебряным набором, все поля, n = 80",
});
s.addChart(pres.charts.BAR, [{ name: "Все поля верно", labels: ["agreed (41)", "refereed (7)", "review (32)"], values: [92.7, 100, 68.8] }], {
  ...chartBase, x: 6.8, y: 1.4, w: 6.0, h: 4.3, barDir: "col", chartColors: [HEX.accent2, HEX.accent3, HEX.accent4], showLegend: false, title: "Совпадение с серебряным набором по статусу",
});
note(s, "Эталон — разметка Claude Opus, не людей (с 19 ручными проверками совпадает на 36,8 %). Выборка 80 не случайная: 43 документа — с низкой уверенностью. review: 10 расхождений из 32, agreed: 3 из 41.", { x: 0.6, y: 5.9, w: 12.1, h: 0.7 });
s.addNotes("Человеку уходит 17 % корпуса; на выборке там в ~4 раза больше расхождений с серебряным набором (31 % против 7 %). Эталон — модель.");

// 7. Поиск
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Верный фильтр из разметки: hit@5 83 % вместо 74 %");
s.addChart(pres.charts.BAR, [{ name: "hit@5", labels: ["Гибрид без фильтров", "Гибрид + верный фильтр по предмету"], values: [73.6, 83.0] }], {
  ...chartBase, x: 0.5, y: 1.4, w: 6.2, h: 4.3, barDir: "col", chartColors: [HEX.accent5, HEX.accent1], showLegend: false, title: "hit@5, 53 вопроса",
});
stat(s, 7.1, 1.5, 2.7, "+9,4", "п. п. hit@5 от фильтра (5 вопросов из 53)", C.accent2);
stat(s, 10.05, 1.5, 2.7, "−10", "п. п. hit@5 от rerank (2 вопроса из 20)", C.accent4);
bullets(s, [
  "MRR@10: 0,544 → 0,630",
  "Пустая выдача после rerank на вопросах без ответа: 6 из 8",
  "Ложные отказы: 2 из 20",
], { x: 7.1, y: 3.5, w: 5.6, h: 1.8, fontSize: 15 });
note(s, "Фильтр взят из разметки вопроса (заранее верный), запрос не переписывался; интервал для 83 % — 71–91 %. Вопросы сгенерированы моделью. Путь с rerank — 70 % на 20 вопросах.", { x: 0.6, y: 5.9, w: 12.1, h: 0.7 });
s.addNotes("Главный эксперимент проекта: польза разметки для поиска.");

// 8. Демо
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Демо: вопрос → ответ со сносками");
note(s, "Чат тестового датасета; основной тоже отвечает — поиск 0,45 с (миграция 9)", { x: 0.6, y: 6.35, w: 7.7, h: 0.4 });
s.addImage({ path: S + "v2/chat.jpg", x: 0.6, y: 1.4, w: 7.7, h: 7.7 * 800 / 1280 });
bullets(s, [
  "Вход «Войти как проверяющий»",
  "Обзор датасета: 572 документа, ПДн замаскированы в 410 (не только титульники)",
  "Правила v1 и доска разметки",
  "Очередь проверки: голоса A и B с цитатами",
  "Чат: переписанный запрос, сноски [n], источник со страницей",
], { x: 8.6, y: 1.5, w: 4.15, h: 4.5, fontSize: 15 });
s.addNotes("Сценарий — docs/report/demo-script.md. Ответ бесплатной моделью идёт 30–100 с, запускать вопрос заранее.");

// 9. Инженерия и ИИ
s = pres.addSlide({ masterName: "CONTENT" });
title(s, "Как делали: ИИ-агенты и проверки");
stat(s, 0.6, 1.5, 2.85, "229", "автотестов, из них 27 SQL/RLS");
stat(s, 3.7, 1.5, 2.85, "16", "дефектов нашёл финальный критик загрузки", C.accent3);
stat(s, 6.8, 1.5, 2.85, "11", "экранов, мобильная и тёмная тема", C.accent2);
stat(s, 9.9, 1.5, 2.85, "0 ₽", "на сервисы и модели приложения", C.accent5);
bullets(s, [
  "Claude Code писал код; субагенты — разметчики, арбитры, критики",
  "TDD с двумя независимыми критиками для загрузки и разметки",
  "Каждая цифра отчёта сверяется с таблицей (ловили «21 вопрос» вместо 1)",
], { x: 0.6, y: 3.7, w: 7.4, h: 2.6, fontSize: 15 });
card(s, 8.4, 3.7, 4.35, 2.6, "v0");
T(s, "Text-to-UI в v0", { x: 8.65, y: 3.9, w: 3.9, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
T(s, "Экраны чата и доски по текстовому описанию: 15 файлов, раскладка по нашему дизайну, но ответ — заглушка 501. Ветка не слита.", { x: 8.65, y: 4.35, w: 3.9, h: 1.9, fontSize: 15 });
s.addNotes("CI: lint, типы, тесты, сборка на push в main и pull request; автодеплой Vercel.");

// 10. Итоги
s = pres.addSlide({ masterName: "DARK" });
T(s, "Итоги", { x: 0.8, y: 0.6, w: 11, h: 0.9, fontSize: 40, bold: true, color: C.background1, fontFace: "Arial" });
s.addText([
  { text: "Работает: загрузка с маскированием ПДн → правила агентов → разметка «двое + арбитр + человек» → RAG со сносками", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
  { text: "Разметка помогает поиску: с верным фильтром по предмету hit@5 83,0 % против 73,6 % без", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
  { text: "Человеку — 17 % корпуса; там в ~4 раза больше расхождений с серебряным набором", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
  { text: "Ограничения: серебряный набор — модель, вопросы сгенерированы, фильтр в оценке задан заранее, rerank ухудшил выдачу, ответ бесплатной моделью — до 100 с", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
  { text: "Дальше: правила v2, ручная проверка очереди, настоящие вопросы студентов", options: { bullet: true } },
], { isTextBox: true, x: 0.8, y: 1.8, w: 11.6, h: 4.2, margin: 0, fontSize: 20, color: C.background1, valign: "top" });
T(s, "study-rag-livid.vercel.app · github.com/fA1N-n/study-rag", { x: 0.8, y: 6.4, w: 11, h: 0.4, fontSize: 16, color: C.accent6 });

const out = "docs/report/Study_RAG_защита.pptx";
await pres.writeFile({ fileName: out });
console.log(out);
