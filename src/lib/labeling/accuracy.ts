// Точность разметки против эталона (серебряный набор, ручная проверка) с нормализацией написания.

export type Labels = Record<string, unknown>;

/** Значение для сравнения: регистр, ё/е, пробелы; у преподавателя — только фамилия («Бикмуллина И.И.» = «Бикмуллина Ильсияр Ильдаровна»). */
export function norm(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  const s = String(v).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  return field === "teacher" ? (s.match(/^[\p{L}-]+/u)?.[0] ?? s) : s;
}

export type Score = { field: string; n: number; correct: number; acc: number };

/** Доля совпадений по полям и по документу целиком (все поля сразу) на общих документах. */
export function accuracy(fields: string[], pred: Map<string, Labels>, gold: Map<string, Labels>): Score[] {
  const ids = [...gold.keys()].filter((id) => pred.has(id));
  const one = (f: string) => ids.filter((id) => norm(f, pred.get(id)![f]) === norm(f, gold.get(id)![f])).length;
  const all = ids.filter((id) => fields.every((f) => norm(f, pred.get(id)![f]) === norm(f, gold.get(id)![f]))).length;
  const mk = (field: string, correct: number): Score => ({ field, n: ids.length, correct, acc: ids.length ? correct / ids.length : NaN });
  return [...fields.map((f) => mk(f, one(f))), mk("все поля", all)];
}

/** 95 % доверительный интервал Уилсона для доли — на 80 документах он широкий, это надо видеть. */
export function wilson(correct: number, n: number): [number, number] {
  if (!n) return [NaN, NaN];
  const z = 1.96;
  const p = correct / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
