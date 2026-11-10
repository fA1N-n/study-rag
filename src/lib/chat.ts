// Чат: формат сохранённого ответа (questions.answer + questions.sources) и разбор сносок [n].
import { z } from "zod";

export const sourceSchema = z.object({
  n: z.number().int().positive(),
  document_id: z.string().regex(/^[0-9a-f-]{36}$/),
  filename: z.string(),
  unit_label: z.string(),
  unit_no: z.number().int().nullable().optional(),
  quote: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

/** Источники из jsonb; битые записи отбрасываем, порядок — по номеру сноски. */
export function parseSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => sourceSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data)
    .sort((a, b) => a.n - b.n);
}

export type Piece = { text: string } | { ref: number };

/** Абзацы ответа, в каждом — текст и сноски [1], [2]. Сноски без источника остаются текстом. */
export function splitAnswer(answer: string, known: Set<number>): Piece[][] {
  return answer
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const out: Piece[] = [];
      let last = 0;
      for (const m of p.matchAll(/\[(\d{1,2})\]/g)) {
        const n = Number(m[1]);
        if (!known.has(n)) continue;
        if (m.index > last) out.push({ text: p.slice(last, m.index) });
        out.push({ ref: n });
        last = m.index + m[0].length;
      }
      if (last < p.length) out.push({ text: p.slice(last) });
      return out;
    });
}

/** Текст единицы с выделенной цитатой: [до, цитата, после]; цитаты нет в тексте — выделяем всю единицу. */
export function highlight(text: string, quote?: string): [string, string, string] {
  const q = quote?.trim();
  if (!q) return ["", text, ""];
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return ["", text, ""];
  return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}
