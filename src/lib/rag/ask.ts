// Ответ по корпусу: переписывание + автофильтры → гибридный поиск (вектор + FTS → RRF) → rerank LLM → соседи ±1 →
// контекст со сносками [n] → генерация. Порог rerank — честный отказ.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateLabels, type Field } from "../labeling/schema";
import { chat, parseJson, type Msg } from "../llm";
import { embed, vec } from "./embed";

export type Filters = Record<string, string | number | boolean>;
export type Hit = { id: number; document_id: string; unit_label: string; unit_no: number; header: string; content: string; score: number; rerank?: number | null };
export type Source = { n: number; chunk_id: number; document_id: string; filename: string; unit_label: string; unit_no: number; header: string; snippet: string; score: number | null };

export const REFUSAL = "В материалах нет ответа на этот вопрос.";
const RERANK_MIN = 4; // из 10: ниже — фрагмент не отвечает на вопрос
const TOP = 6;

/** Поля, по которым можно фильтровать точным совпадением меток (enum, int, bool с filter). */
export const filterFields = (fields: Field[]) => fields.filter((f) => f.filter && f.type !== "text");

/** Оставить только допустимые фильтры: известные поля-фильтры, значения из словаря (регистр → канон), числа в границах. */
export function cleanFilters(fields: Field[], raw: unknown): Filters {
  const ff = filterFields(fields).map((f) => ({ ...f, required: false, allowedBy: undefined }));
  if (typeof raw !== "object" || raw === null) return {};
  const present = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  return validateLabels(ff, present).values as Filters;
}

/** FTS-запрос «слово or слово»: websearch_to_tsquery по умолчанию требует все слова, для вопроса это слишком строго. */
export function ftsQuery(q: string): string {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(words)].slice(0, 12).join(" or ");
}

const models = () => ({
  fast: process.env.FAST_MODEL || process.env.LLM_MODEL || "",
  ask: process.env.ASK_MODEL || process.env.LLM_MODEL || "",
});

/** Переписать вопрос в поисковый запрос и найти фильтры, которые вопрос называет явно. Ошибка LLM → вопрос как есть. */
export async function rewrite(question: string, fields: Field[], llm = chat): Promise<{ query: string; filters: Filters }> {
  const ff = filterFields(fields);
  const desc = ff.map((f) => `- ${f.key} (${f.label}): ${f.type === "enum" ? f.values!.slice(0, 80).join(" | ") : f.type}`).join("\n");
  try {
    const r = await llm(models().fast, [
      { role: "system", content: "Ты готовишь поисковый запрос по учебным материалам. Отвечай только JSON." },
      {
        role: "user",
        content: `Вопрос студента: «${question}»\n\nПоля-фильтры корпуса:\n${desc || "(нет)"}\n\nВерни {"query": "поисковый запрос: ключевые термины и синонимы, без вежливых слов", "filters": {поле: значение}}. Фильтр ставь ТОЛЬКО если вопрос прямо называет значение (предмет, семестр, преподаватель, тип материала); значения — точно из списка. Сомневаешься — без фильтра.`,
      },
    ], { json: true, maxTokens: 1500, temperature: 0, timeoutMs: 30_000 });
    const j = parseJson<{ query?: unknown; filters?: unknown }>(r.text);
    const query = typeof j.query === "string" && j.query.trim().length > 2 ? j.query.trim().slice(0, 500) : question;
    return { query, filters: cleanFilters(fields, j.filters) };
  } catch {
    return { query: question, filters: {} };
  }
}

/** Гибридный поиск в БД (match_chunks: вектор top-40 + FTS top-40 → RRF). */
export async function retrieve(sb: SupabaseClient, datasetId: string, query: string, filters: Filters, k = 30, embedding?: number[]): Promise<Hit[]> {
  const e = embedding ?? (await embed([query]))[0];
  const { data, error } = await sb.rpc("match_chunks", { p_dataset: datasetId, p_embedding: vec(e), p_query: ftsQuery(query), p_filter: filters, p_k: k });
  if (error) throw error;
  return (data ?? []) as Hit[];
}

/** Ответ reranker → оценки по номерам кандидатов (мусор и чужие номера отбрасываются). */
export function readScores(text: string, n: number): Map<number, number> {
  const j = parseJson<{ scores?: unknown } | unknown[]>(text);
  const list = (Array.isArray(j) ? j : Array.isArray((j as { scores?: unknown }).scores) ? (j as { scores: unknown[] }).scores : []) as Record<string, unknown>[];
  const out = new Map<number, number>();
  for (const x of list) {
    const i = Number(x?.i ?? x?.id);
    const s = Number(x?.score);
    if (Number.isInteger(i) && i >= 1 && i <= n && Number.isFinite(s)) out.set(i, Math.max(0, Math.min(10, s)));
  }
  return out;
}

/** Rerank LLM: оценка 0–10 «отвечает ли фрагмент на вопрос». Ошибка LLM → порядок RRF, оценки null. */
export async function rerank(question: string, hits: Hit[], llm = chat, max = 20): Promise<Hit[]> {
  const cand = hits.slice(0, max);
  if (!cand.length) return [];
  try {
    const r = await llm(models().fast, [
      { role: "system", content: "Ты оцениваешь фрагменты учебных материалов для ответа на вопрос. Отвечай только JSON." },
      {
        role: "user",
        content: `Вопрос: «${question}»\n\n${cand.map((h, i) => `[${i + 1}] ${h.header}\n${h.content.slice(0, 450)}`).join("\n\n")}\n\nОцени каждый фрагмент от 0 (не по теме) до 10 (прямо отвечает на вопрос). Ответ: {"scores": [{"i": 1, "score": 7}, ...]} для всех ${cand.length}.`,
      },
    ], { json: true, maxTokens: 1500, temperature: 0, timeoutMs: 30_000 });
    const sc = readScores(r.text, cand.length);
    if (!sc.size) throw new Error("пустые оценки");
    return cand.map((h, i) => ({ ...h, rerank: sc.get(i + 1) ?? 0 })).sort((a, b) => b.rerank! - a.rerank! || b.score - a.score);
  } catch {
    return cand.map((h) => ({ ...h, rerank: null }));
  }
}

/** Лучшие фрагменты после rerank; пусто — отказ (все оценки ниже порога). Без оценок (rerank упал) — top по RRF. */
export function pickTop(ranked: Hit[]): Hit[] {
  if (ranked.some((h) => h.rerank === null || h.rerank === undefined)) return ranked.slice(0, TOP);
  return ranked.filter((h) => h.rerank! >= RERANK_MIN).slice(0, TOP);
}

/** Контекст для генерации: источник [n] = найденный фрагмент + соседние единицы того же документа. */
export function buildContext(sources: Source[], hits: Hit[], neighbors: Hit[]): string {
  return sources
    .map((s) => {
      const hit = hits.find((h) => h.id === s.chunk_id)!;
      const near = neighbors.filter((x) => x.document_id === s.document_id && Math.abs(x.unit_no - s.unit_no) === 1).sort((a, b) => a.unit_no - b.unit_no);
      const before = near.filter((x) => x.unit_no < s.unit_no).map((x) => `(${x.unit_label}) ${x.content.slice(0, 800)}`);
      const after = near.filter((x) => x.unit_no > s.unit_no).map((x) => `(${x.unit_label}) ${x.content.slice(0, 800)}`);
      return `[${s.n}] ${s.header}\n${[...before, `(${s.unit_label}) ${hit.content}`, ...after].join("\n")}`;
    })
    .join("\n\n---\n\n");
}

export function answerMessages(question: string, context: string): Msg[] {
  return [
    {
      role: "system",
      content: `Ты — учебный ассистент. Отвечай по-русски ТОЛЬКО по источникам ниже. После каждого утверждения ставь сноску на источник в квадратных скобках: [1], [2]. Не выдумывай и не используй знания вне источников. Если в источниках нет ответа, ответь ровно: «${REFUSAL}» — и ничего больше. Пиши коротко и по делу, списками, если уместно.`,
    },
    { role: "user", content: `Источники:\n\n${context}\n\nВопрос: ${question}` },
  ];
}

export const isRefusal = (answer: string) => answer.trim().startsWith(REFUSAL.slice(0, 22));

/** Номера сносок, которые встречаются в ответе. */
export const citedNumbers = (answer: string) => [...new Set([...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))];
