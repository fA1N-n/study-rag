// Разметчики A/B и арбитр в приложении: один запрос LLM на батч (бесплатные модели — 50 запросов/день).
import { chat, parseJson, type Usage } from "./llm";
import { mergeLabels, type Merged } from "./labeling/merge";
import { validateLabels, type Field } from "./labeling/schema";

export type BatchDoc = { id: string; filename: string; source_path: string; units: number; preview: string };
export type AgentVote = { doc_id: string; values: Record<string, unknown>; confidence: number; rationale: string };
export type Ruleset = { fields: Field[]; rules: string };
type Chat = typeof chat;

const docBlock = (d: BatchDoc) => `### doc_id: ${d.id}\nимя: ${d.filename}\nпуть: ${d.source_path}\nединиц: ${d.units}\n${d.preview}`;
const schemaBlock = (rs: Ruleset) => `Поля (JSON):\n${JSON.stringify(rs.fields)}\n\nПравила:\n${rs.rules}`;

/** Ответ агента → голоса по документам батча: чужие doc_id отбрасываются, значения проходят валидатор. */
export function readVotes(text: string, docs: BatchDoc[], fields: Field[]): AgentVote[] {
  const raw = parseJson<{ labels?: unknown } | unknown[]>(text);
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { labels?: unknown }).labels) ? ((raw as { labels: unknown[] }).labels) : [];
  const ids = new Set(docs.map((d) => d.id));
  const out = new Map<string, AgentVote>();
  for (const r of list as Record<string, unknown>[]) {
    const id = String(r?.doc_id ?? "");
    if (!ids.has(id) || out.has(id)) continue;
    const c = Number(r.confidence);
    out.set(id, {
      doc_id: id,
      values: validateLabels(fields, r.values).values,
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
      rationale: String(r.rationale ?? "").slice(0, 500),
    });
  }
  return [...out.values()];
}

export async function labelBatch(model: string, rs: Ruleset, docs: BatchDoc[], who: "A" | "B", llm: Chat = chat) {
  // B получает другой порядок документов и другую формулировку — меньше общих ошибок с A
  const ordered = who === "B" ? [...docs].reverse() : docs;
  const r = await llm(model, [
    { role: "system", content: `Ты — разметчик ${who} учебных документов. Размечай строго по правилам. Отвечай только JSON.` },
    {
      role: "user",
      content: `${schemaBlock(rs)}\n\nРазметь каждый документ ниже. Ответ: {"labels": [{"doc_id": "...", "values": {<поле>: <значение>}, "confidence": 0..1, "rationale": "1–2 дословные цитаты"}]}. Значения enum — точно из списка; не угадывай необязательные поля.${who === "B" ? " Сначала найди в тексте признаки, потом выбирай значение." : ""}\n\n${ordered.map(docBlock).join("\n\n")}`,
    },
  ], { json: true, maxTokens: 12000 });
  return { votes: readVotes(r.text, docs, rs.fields), usage: r.usage, model: r.model };
}

export async function refereeBatch(model: string, rs: Ruleset, items: { doc: BatchDoc; a: AgentVote; b: AgentVote; disputed: string[] }[], llm: Chat = chat) {
  const r = await llm(model, [
    { role: "system", content: "Ты — арбитр разметки. Решай спорные поля строго по правилам. Отвечай только JSON." },
    {
      role: "user",
      content: `${schemaBlock(rs)}\n\nРазметчики A и B разошлись. Для каждого документа реши спорные поля (можно третье значение), остальные перепиши из A. confidence — уверенность в решении спорных полей. Ответ: {"labels": [{"doc_id", "values", "confidence", "rationale"}]}.\n\n${items
        .map((x) => `${docBlock(x.doc)}\nспорные: ${x.disputed.join(", ")}\nA: ${JSON.stringify(x.a.values)} (${x.a.confidence}) — ${x.a.rationale}\nB: ${JSON.stringify(x.b.values)} (${x.b.confidence}) — ${x.b.rationale}`)
        .join("\n\n")}`,
    },
  ], { json: true, maxTokens: 10000 });
  return { votes: readVotes(r.text, items.map((x) => x.doc), rs.fields), usage: r.usage, model: r.model };
}

export type BatchResult = {
  results: { doc_id: string; merged: Merged; a?: AgentVote; b?: AgentVote; referee?: AgentVote }[];
  usage: Usage;
  models: { A: string; B: string; referee?: string };
};

/** Полный цикл батча: A и B параллельно → слияние → арбитр по спорным → итог. */
export async function runBatch(rs: Ruleset, docs: BatchDoc[], m: { A: string; B: string; referee: string }, threshold = 0.7, llm: Chat = chat): Promise<BatchResult> {
  const [ra, rb] = await Promise.all([labelBatch(m.A, rs, docs, "A", llm), labelBatch(m.B, rs, docs, "B", llm)]);
  const usage: Usage = { tokensIn: ra.usage.tokensIn + rb.usage.tokensIn, tokensOut: ra.usage.tokensOut + rb.usage.tokensOut };
  const A = new Map(ra.votes.map((v) => [v.doc_id, v]));
  const B = new Map(rb.votes.map((v) => [v.doc_id, v]));
  const first = docs.map((d) => ({ d, merged: mergeLabels(rs.fields, A.get(d.id) ?? null, B.get(d.id) ?? null, null, threshold) }));
  const need = first.filter((x) => x.merged.status === "needs_referee" && A.has(x.d.id) && B.has(x.d.id));
  let R = new Map<string, AgentVote>();
  let refModel: string | undefined;
  if (need.length) {
    const rr = await refereeBatch(m.referee, rs, need.map((x) => ({ doc: x.d, a: A.get(x.d.id)!, b: B.get(x.d.id)!, disputed: x.merged.disputed })), llm);
    usage.tokensIn += rr.usage.tokensIn;
    usage.tokensOut += rr.usage.tokensOut;
    R = new Map(rr.votes.map((v) => [v.doc_id, v]));
    refModel = rr.model;
  }
  const results = first.map(({ d, merged }) => {
    const ref = R.get(d.id);
    const final = ref ? mergeLabels(rs.fields, A.get(d.id) ?? null, B.get(d.id) ?? null, ref, threshold) : merged;
    // арбитр не ответил по документу → человеку
    return { doc_id: d.id, merged: final.status === "needs_referee" ? { ...final, status: "review" as const } : final, a: A.get(d.id), b: B.get(d.id), referee: ref };
  });
  return { results, usage, models: { A: ra.model, B: rb.model, referee: refModel } };
}
