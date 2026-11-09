// Чанки для поиска: чанк = единица документа (страница/слайд/раздел); длинная — частями с перекрытием.
import type { Unit } from "../labeling/units";

export type Chunk = { unit_no: number; unit_label: string; part: number; header: string; content: string };
type FieldLite = { key: string; label: string; filter?: boolean; required?: boolean };

/** Режет текст на части ~size символов с перекрытием overlap, по возможности на границе абзаца/предложения. */
export function split(text: string, size = 2000, overlap = 200): string[] {
  // управляющие символы (\u0000 и др. из битых pdf) Postgres в text не примет
  const t = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (t.length <= size) return t ? [t] : [];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(t.length, start + size);
    if (end < t.length) {
      const win = t.slice(start + Math.floor(size * 0.6), end);
      const cut = Math.max(win.lastIndexOf("\n\n"), win.lastIndexOf("\n"), win.lastIndexOf(". "));
      if (cut >= 0) end = start + Math.floor(size * 0.6) + cut + 1;
    }
    out.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}

/** Заголовок чанка: метки-фильтры документа · документ · единица — попадает и в FTS, и в эмбеддинг. */
export function header(labels: Record<string, unknown>, fields: FieldLite[], filename: string, unitLabel: string): string {
  const parts = fields
    .filter((f) => (f.filter || f.required) && labels[f.key] !== null && labels[f.key] !== undefined && labels[f.key] !== "")
    .map((f) => `${f.label}: ${labels[f.key]}`);
  return [...parts, `Документ: ${filename.replace(/\.[a-z0-9]{2,5}$/i, "")}`, unitLabel].join(" · ");
}

/** Все чанки документа. unit_no — порядковый номер единицы (соседи ±1 считаются по нему, номера страниц могут повторяться). */
export function chunkDocument(units: Unit[], labels: Record<string, unknown>, fields: FieldLite[], filename: string, size = 2000, overlap = 200): Chunk[] {
  return units.flatMap((u, i) =>
    split(u.text, size, overlap).map((content, part) => ({ unit_no: i + 1, unit_label: u.label, part, header: header(labels, fields, filename, u.label), content })),
  );
}
