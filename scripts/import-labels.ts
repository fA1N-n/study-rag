// Импорт офлайн-разметки в БД: правила v1 (черновик — утверждает человек в UI), решения A, B, арбитра (labels),
// итог (documents.labels + label_status), сводка в datasets.stats.labeling.
// Запуск: node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/import-labels.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUT = "data/labeling";
const NAME = "Материалы КИ (5 семестров)";
const env = process.env;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const must = <T>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};

const ds = must(await sb.from("datasets").select("id,stats").eq("name", NAME).single())!;
const docs = must(await sb.from("documents").select("id,meta").eq("dataset_id", ds.id)) as { id: string; meta: { source_sha256?: string } }[];
const byDocId = new Map(docs.map((d) => [d.meta.source_sha256!, d.id]));

// правила v1
const rs = JSON.parse(readFileSync(join(OUT, "ruleset_v1.json"), "utf8"));
let ruleset = (await sb.from("rulesets").select("id").eq("dataset_id", ds.id).eq("version", 1).maybeSingle()).data;
if (!ruleset)
  ruleset = must(
    await sb
      .from("rulesets")
      .insert({ dataset_id: ds.id, version: 1, fields: rs.fields, rules: rs.rules, examples: rs.examples, critique: rs.critique, author: "agent", status: "draft" })
      .select("id")
      .single(),
  );

// решения агентов
const modelB = (batch: string) => (batch <= "018" ? "codex (GPT)" : "claude-haiku");
type Vote = { doc_id: string; values: object; confidence: number; rationale: string };
const rows: object[] = [];
for (const l of readFileSync(join(OUT, "labels_A.jsonl"), "utf8").trim().split("\n")) {
  const r = JSON.parse(l);
  rows.push({ document_id: byDocId.get(r.doc_id), agent: "A", model: "claude-sonnet", values: r.values, confidence: r.confidence, rationale: r.rationale });
}
for (const f of readdirSync(join(OUT, "B")).filter((x) => /^batch-\d{3}\.json$/.test(x)))
  for (const r of JSON.parse(readFileSync(join(OUT, "B", f), "utf8")) as Vote[])
    rows.push({ document_id: byDocId.get(r.doc_id), agent: "B", model: modelB(f.slice(6, 9)), values: r.values, confidence: r.confidence, rationale: r.rationale });
for (const f of readdirSync(join(OUT, "referee", "out")))
  for (const r of JSON.parse(readFileSync(join(OUT, "referee", "out", f), "utf8")) as Vote[])
    rows.push({ document_id: byDocId.get(r.doc_id), agent: "referee", model: "claude-opus", values: r.values, confidence: r.confidence, rationale: r.rationale });
if (rows.some((r) => !(r as { document_id?: string }).document_id)) throw new Error("есть метки без документа в БД");

must(await sb.from("labels").delete().in("document_id", docs.map((d) => d.id)).neq("agent", "human"));
for (let i = 0; i < rows.length; i += 500) must(await sb.from("labels").insert(rows.slice(i, i + 500)));

// итог
const final = readFileSync(join(OUT, "final_v1.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { doc_id: string; status: string; values: object });
const counts: Record<string, number> = {};
for (let i = 0; i < final.length; i += 25)
  await Promise.all(
    final.slice(i, i + 25).map(async (r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      must(await sb.from("documents").update({ labels: r.values, label_status: r.status }).eq("id", byDocId.get(r.doc_id)!));
    }),
  );

// каппа из kappa_v1.md (уже посчитана merge.ts) — в сводку датасета
const kappa = Object.fromEntries(
  [...readFileSync(join(OUT, "kappa_v1.md"), "utf8").matchAll(/^\| .+? \((\w+)\) \| ([\d.]+)/gm)].map((m) => [m[1], Number(m[2])]),
);
const labeling = { ...counts, total: final.length, kappa, agents: { A: "claude-sonnet", B: "codex (001–018) + claude-haiku (019–029)", referee: "claude-opus" }, offline: true };
must(await sb.from("datasets").update({ active_ruleset_id: ruleset!.id, status: "labeled", stats: { ...(ds.stats as object), labeling } }).eq("id", ds.id));
console.log("метки:", rows.length, "итог:", counts, "каппа:", kappa);
