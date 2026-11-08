// Шаги конвейера датасета и куда ведёт каждый.
export const STEPS = [
  { key: "upload", label: "Загрузка", href: "upload", done: ["ingested", "rules", "labeling", "labeled", "indexing", "ready"] },
  { key: "rules", label: "Правила", href: "rules", done: ["labeling", "labeled", "indexing", "ready"] },
  { key: "labeling", label: "Разметка", href: "labeling", done: ["labeled", "indexing", "ready"] },
  { key: "index", label: "Индекс", href: "labeling", done: ["ready"] },
  { key: "chat", label: "Чат", href: "chat", done: [] as string[] },
] as const;

export const STATUS_RU: Record<string, string> = {
  empty: "пустой", ingesting: "загрузка", ingested: "загружен", rules: "правила", labeling: "разметка",
  labeled: "размечен", indexing: "индексация", ready: "готов", failed: "ошибка",
};

/** Индекс текущего шага: первый невыполненный. */
export const currentStep = (status: string) => {
  const i = STEPS.findIndex((s) => !(s.done as readonly string[]).includes(status));
  return i < 0 ? STEPS.length - 1 : i;
};
