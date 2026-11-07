// Итог разметчика: labels_<X>.jsonl, summary_<X>.md, gold_candidates.csv (80 документов).
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/finalize.ts A
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFields, validateLabels } from "../../src/lib/labeling/schema";
import { parseDocument } from "../../src/lib/labeling/units";
import { OUT, RAW } from "./common";
import { checkBatch } from "./validate";

const who = process.argv[2] ?? "A";
const fields = parseFields(JSON.parse(readFileSync(join(OUT, "ruleset_v1.json"), "utf8")).fields);
type Idx = { doc_id: string; filename: string; units: number; path: string };
const index: Idx[] = JSON.parse(readFileSync(join(OUT, "docs_index.json"), "utf8"));
const byId = new Map(index.map((d) => [d.doc_id, d]));

type Row = { doc_id: string; batch: string; values: Record<string, unknown>; raw: Record<string, unknown>; confidence: number; rationale: string; errors: { key: string; message: string }[] };
const rows: Row[] = [];
const formatBad: string[] = [];
for (const f of readdirSync(join(OUT, "inputs")).sort()) {
  const no = f.slice(6, 9);
  const c = checkBatch(no, who);
  if (!c.exists || c.format.length) { formatBad.push(`${no}: ${c.exists ? c.format.slice(0, 3).join("; ") : "нет файла"}`); if (!c.exists) continue; }
  type Out = { doc_id: string; values?: Record<string, unknown>; confidence?: unknown; rationale?: unknown };
  let out: Out[];
  try { out = JSON.parse(readFileSync(join(OUT, who, f), "utf8")); } catch { continue; }
  if (!Array.isArray(out)) continue;
  for (const r of out) {
    if (!byId.has(r?.doc_id) || rows.some((x) => x.doc_id === r.doc_id)) continue;
    const v = validateLabels(fields, r.values);
    rows.push({ doc_id: r.doc_id, batch: no, values: v.values, raw: r.values ?? {}, confidence: Number(r.confidence), rationale: String(r.rationale ?? ""), errors: v.errors });
  }
}

writeFileSync(
  join(OUT, `labels_${who}.jsonl`),
  rows.map((r) => JSON.stringify({ doc_id: r.doc_id, labeler: who, ruleset_version: 1, batch: r.batch, values: r.values, raw_values: r.raw, confidence: r.confidence, rationale: r.rationale, validator_errors: r.errors })).join("\n") + "\n",
);

// --- сводка
const n = rows.length;
const pct = (k: number) => `${((k / (n || 1)) * 100).toFixed(1)} %`;
const dist = (key: string) => {
  const m = new Map<string, number>();
  for (const r of rows) { const v = r.values[key] === undefined ? "∅ (пусто)" : String(r.values[key]); m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]).map(([v, c]) => `| ${v} | ${c} | ${pct(c)} |`).join("\n");
};
const low = rows.filter((r) => r.confidence < 0.7);
const errs = rows.flatMap((r) => r.errors.map((e) => ({ ...e, doc_id: r.doc_id })));
const errByKey = new Map<string, number>();
for (const e of errs) errByKey.set(e.key, (errByKey.get(e.key) ?? 0) + 1);

// сверка с метками сборщика (ненадёжны; только как ориентир)
let collSubj = 0, collSubjEq = 0, collType = 0, collTypeEq = 0;
for (const r of rows) {
  const meta = parseDocument(readFileSync(join(RAW, byId.get(r.doc_id)!.path), "utf8")).meta;
  const s = String(meta.subject ?? "").replace("Английский язык", "Иностранный язык (английский)");
  if (s) { collSubj++; if (s === r.values.subject) collSubjEq++; }
  if (meta.doc_type && meta.doc_type !== "другое") { collType++; if (meta.doc_type === r.values.doc_type) collTypeEq++; }
}

const disputed = [...low].sort((a, b) => a.confidence - b.confidence).slice(0, 12)
  .map((r) => `| ${r.doc_id.slice(0, 8)} | ${byId.get(r.doc_id)!.filename.slice(0, 50)} | ${r.values.subject ?? "—"} / ${r.values.doc_type ?? "—"} / ${r.values.semester ?? "∅"} | ${r.confidence} | ${r.rationale.slice(0, 90).replace(/\|/g, "/").replace(/\n/g, " ")} |`).join("\n");
const mean = rows.reduce((s, r) => s + r.confidence, 0) / (n || 1);

writeFileSync(join(OUT, `summary_${who}.md`), `# Сводка разметчика ${who} (правила v1)

Размечено: **${n} из ${index.length}** документов. Батчей с ошибкой формата в итоге: ${formatBad.length}${formatBad.length ? "\n- " + formatBad.join("\n- ") : ""}.
Средняя уверенность: ${mean.toFixed(3)}. Уверенность < 0,7: ${low.length} (${pct(low.length)}).
Ошибки валидатора по значениям (значение выброшено, оставлено как данные для метрик): ${errs.length} — ${[...errByKey].map(([k, c]) => `${k}: ${c}`).join(", ") || "нет"}.
Сверка с метками сборщика (ненадёжны, только ориентир): предмет совпал ${collSubjEq}/${collSubj}, тип ${collTypeEq}/${collType} (тип «другое» у сборщика — значение по умолчанию, не считается).

${fields.filter((f) => f.type !== "text").map((f) => `## ${f.label} (${f.key})\n| значение | документов | доля |\n|---|---|---|\n${dist(f.key)}`).join("\n\n")}

## Ошибки валидатора
${errs.slice(0, 30).map((e) => `- ${e.doc_id.slice(0, 8)} ${e.key}: ${e.message}`).join("\n") || "нет"}

## Самые спорные (низкая уверенность)
| doc | файл | предмет / тип / семестр | ув. | rationale |
|---|---|---|---|---|
${disputed}
`);

// --- кандидаты в золотой набор: 80 документов, страты — предмет, тип, уверенность (включая низкую)
const h = (s: string) => createHash("md5").update("gold" + s).digest("hex");
const pool = [...rows].sort((a, b) => h(a.doc_id).localeCompare(h(b.doc_id)));
const gold = new Map<string, string>();
const take = (r: Row, why: string) => { if (gold.size < 80 && !gold.has(r.doc_id)) gold.set(r.doc_id, why); };
pool.filter((r) => r.confidence < 0.7).slice(0, 20).forEach((r) => take(r, "низкая уверенность"));
for (const key of ["subject", "doc_type"]) {
  const seen = new Set<string>();
  for (const r of pool) { const v = String(r.values[key] ?? "∅"); if (!seen.has(v)) { seen.add(v); take(r, `покрытие ${key}`); } }
}
const band = (c: number) => (c < 0.7 ? "low" : c < 0.9 ? "mid" : "high");
for (let i = 0; gold.size < 80 && i < pool.length; i++) { // добор: чередуем полосы уверенности
  const want = ["mid", "high", "low"][gold.size % 3];
  const r = pool.find((x) => !gold.has(x.doc_id) && band(x.confidence) === want) ?? pool.find((x) => !gold.has(x.doc_id));
  if (r) take(r, "добор по уверенности");
}
const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
const csv = ["doc_id,filename,md_path,reason,gold_subject,gold_semester,gold_teacher,gold_doc_type,gold_title,gold_has_pii,comment"]
  .concat([...gold].map(([id, why]) => [id, esc(byId.get(id)!.filename), esc(join(RAW, byId.get(id)!.path)), esc(why), "", "", "", "", "", "", ""].join(",")));
writeFileSync(join(OUT, "gold_candidates.csv"), "﻿" + csv.join("\r\n") + "\r\n");
console.log(`labels_${who}: ${n}/${index.length}, ошибок формата: ${formatBad.length}, ошибок значений: ${errs.length}, gold: ${gold.size}`);
