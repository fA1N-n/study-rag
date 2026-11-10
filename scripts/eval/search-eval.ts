// Оценка поиска на очищенном questions.csv: hit@5 и MRR@10 по документу (ожидаемый expected_md), отказы.
// Режимы: без меток (гибрид без фильтров), с метками (фильтр предмета — как выбрал бы студент), + rerank LLM (подвыборка:
// лимит бесплатных моделей), отказы на вопросах «нет ответа». Пишет data/eval/search.md и data/eval/questions_clean.csv.
// Запуск: node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/eval/search-eval.ts [--rerank N]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseFields } from "../../src/lib/labeling/schema";
import { cleanFilters, pickTop, rerank, retrieve, type Hit } from "../../src/lib/rag/ask";
import { embed } from "../../src/lib/rag/embed";

const RAW = "data/raw_2026-11-07";
const RERANK_N = Number(process.argv[process.argv.indexOf("--rerank") + 1] || 0);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

// CSV с кавычками
function csv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q && c === '"' && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (q || (c !== "," && c !== "\n")) cell += c;
    else {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...rest] = rows;
  return rest.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const all = csv(readFileSync(`${RAW}/questions.csv`, "utf8").replace(/^﻿/, ""));
// чистка: вопросы с именем файла (пользователь его не знает, и имена маскируются) и дубли формулировок
const seen = new Set<string>();
const clean = all.filter((q) => {
  const key = q.question.toLowerCase().replace(/\s+/g, " ").trim();
  const byFile = /(материал[а-я]*|файл[а-я]*|документ[а-я]*) «[^»]*[_.\d][^»]*»/i.test(q.question);
  if (byFile || seen.has(key)) return false;
  seen.add(key);
  return true;
});
const answerable = clean.filter((q) => q.kind !== "нет ответа");
const noAnswer = clean.filter((q) => q.kind === "нет ответа");

const { data: ds } = await sb.from("datasets").select("id,active_ruleset_id").eq("name", "Материалы КИ (5 семестров)").single();
const fields = parseFields((await sb.from("rulesets").select("fields").eq("id", ds!.active_ruleset_id).single()).data!.fields);
const { data: docs } = await sb.from("documents").select("id,sha256,filename").eq("dataset_id", ds!.id).limit(5000);
const bySha = new Map(docs!.map((d) => [d.sha256, d.id]));
const goldDoc = (q: Record<string, string>) => {
  try {
    return bySha.get(createHash("sha256").update(readFileSync(`${RAW}/${q.expected_md}`)).digest("hex")) ?? null;
  } catch {
    return null;
  }
};

const docRank = (hits: Hit[]) => [...new Set(hits.map((h) => h.document_id))];
const metrics = (ranks: (number | null)[]) => ({
  n: ranks.length,
  hit5: ranks.filter((r) => r !== null && r < 5).length / ranks.length,
  mrr: ranks.reduce<number>((s, r) => s + (r !== null && r < 10 ? 1 / (r + 1) : 0), 0) / ranks.length,
});

type Row = { id: string; gold: string; plain: number | null; filtered: number | null; reranked?: number | null; filter: Record<string, unknown> };
const rows: Row[] = [];
// кэш: эмбеддинги вопросов и порядок после rerank — повторный запуск не тратит дневные лимиты бесплатных API
mkdirSync("data/eval", { recursive: true });
const CACHE = "data/eval/cache.json";
const cache: { emb: Record<string, number[]>; rerank: Record<string, string[]> } = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { emb: {}, rerank: {} };
const save = () => writeFileSync(CACHE, JSON.stringify(cache));
const need = clean.filter((q) => !cache.emb[q.id]);
if (need.length) {
  const v = await embed(need.map((q) => q.question));
  need.forEach((q, i) => (cache.emb[q.id] = v[i]));
  save();
}
const reranked = async (id: string, question: string, hits: Hit[]) => {
  if (!cache.rerank[id]) {
    cache.rerank[id] = pickTop(await rerank(question, hits)).map((h) => h.document_id);
    save();
  }
  return cache.rerank[id];
};
for (const q of answerable) {
  const gold = goldDoc(q);
  if (!gold) continue;
  const filter = cleanFilters(fields, { subject: q.subject });
  const plain = await retrieve(sb, ds!.id, q.question, {}, 30, cache.emb[q.id]);
  const filtered = Object.keys(filter).length ? await retrieve(sb, ds!.id, q.question, filter, 30, cache.emb[q.id]) : plain;
  const pos = (h: Hit[]) => {
    const r = docRank(h).indexOf(gold);
    return r < 0 ? null : r;
  };
  const row: Row = { id: q.id, gold, plain: pos(plain), filtered: pos(filtered), filter };
  if (rows.filter((r) => r.reranked !== undefined).length < RERANK_N) {
    const r = [...new Set(await reranked(q.id, q.question, filtered))].indexOf(gold);
    row.reranked = r < 0 ? null : r;
  }
  rows.push(row);
  process.stdout.write(`\r${rows.length}/${answerable.length}`);
}

// отказы: «нет ответа» должен дать пустой pickTop после rerank; ложные отказы — на подвыборке отвечаемых
const refusals: { id: string; kind: string; refused: boolean }[] = [];
if (RERANK_N) {
  for (const q of noAnswer) {
    const top = await reranked(q.id, q.question, await retrieve(sb, ds!.id, q.question, {}, 30, cache.emb[q.id]));
    refusals.push({ id: q.id, kind: "нет ответа", refused: top.length === 0 });
  }
}

const P = metrics(rows.map((r) => r.plain));
const F = metrics(rows.map((r) => r.filtered));
const withR = rows.filter((r) => r.reranked !== undefined);
const RR = withR.length ? metrics(withR.map((r) => r.reranked!)) : null;
const RF = withR.length ? metrics(withR.map((r) => r.filtered)) : null;
const falseRef = withR.filter((r) => (cache.rerank[r.id] ?? []).length === 0).length; // отказ = пустая выдача после rerank
const lost = withR.filter((r) => r.reranked === null).length;
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
const md = `## Качество поиска

Вопросы: \`questions.csv\` — ${all.length}; после чистки ${clean.length} (убраны ${all.length - clean.length}: со ссылкой на имя файла и дубли формулировок); отвечаемых ${answerable.length} (с найденным в БД ожидаемым документом — ${rows.length}), «нет ответа» ${noAnswer.length}.
Попадание — ожидаемый документ среди первых 5 документов выдачи (hit@5) и обратный ранг до 10 (MRR@10). Строго: если на вопрос отвечает и другой документ, это промах.

| Режим | n | hit@5 | MRR@10 |
|---|---|---|---|
| Без меток: гибрид вектор + FTS → RRF, без фильтров | ${P.n} | ${pct(P.hit5)} | ${P.mrr.toFixed(3)} |
| С метками: тот же гибрид + фильтр по предмету | ${F.n} | ${pct(F.hit5)} | ${F.mrr.toFixed(3)} |
${RR && RF ? `| Подвыборка: с метками, без rerank | ${RF.n} | ${pct(RF.hit5)} | ${RF.mrr.toFixed(3)} |
| Подвыборка: с метками + rerank LLM (порог 4/10) | ${RR.n} | ${pct(RR.hit5)} | ${RR.mrr.toFixed(3)} |
` : ""}
${refusals.length ? `Отказы: на ${refusals.length} вопросах «нет ответа» отказ в ${refusals.filter((r) => r.refused).length}; ложные отказы на отвечаемой подвыборке — ${falseRef} из ${withR.length}; ожидаемый документ выпал из выдачи после rerank — ${lost} из ${withR.length}.\n` : ""}
Заголовок чанка (метки) входит в эмбеддинг и FTS в обоих режимах — «без меток» здесь значит «без фильтров по меткам»; отдельный индекс без заголовков не строили (лимит бесплатных эмбеддингов).
`;
mkdirSync("data/eval", { recursive: true });
writeFileSync("data/eval/search.md", md);
writeFileSync("data/eval/search_rows.json", JSON.stringify({ rows, refusals }, null, 1));
writeFileSync("data/eval/questions_clean.csv", ["id,question,kind", ...clean.map((q) => `${q.id},"${q.question.replace(/"/g, '""')}",${q.kind}`)].join("\n"));
console.log(`\n${md}`);
