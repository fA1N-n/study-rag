// Проверка выхода разметчика: формат батча + validateLabels по полям.
//   validate.ts A 007   — один батч; код выхода 1, если ошибки формата (батч переразметить)
//   validate.ts A       — все батчи → data/labeling/progress_A.json и progress.md
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/validate.ts A [NNN]
import { existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseFields, validateLabels } from "../../src/lib/labeling/schema";
import { OUT } from "./common";

const [who = "A", one] = process.argv.slice(2);
const ruleset = JSON.parse(readFileSync(join(OUT, "ruleset_v1.json"), "utf8"));
const fields = parseFields(ruleset.fields);

export type BatchCheck = { batch: string; exists: boolean; format: string[]; valueErrors: { doc_id: string; key: string; message: string }[]; conf: number[] };

export function checkBatch(no: string, labeler = who): BatchCheck {
  const input = JSON.parse(readFileSync(join(OUT, "inputs", `batch-${no}.json`), "utf8"));
  const file = join(OUT, labeler, `batch-${no}.json`);
  const res: BatchCheck = { batch: no, exists: existsSync(file), format: [], valueErrors: [], conf: [] };
  if (!res.exists) return res;
  let out: unknown;
  try {
    out = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    res.format.push(`не JSON: ${(e as Error).message}`);
    return res;
  }
  if (!Array.isArray(out)) return (res.format.push("ожидается массив"), res);
  const want = new Set<string>(input.docs.map((d: { doc_id: string }) => d.doc_id));
  const seen = new Set<string>();
  for (const [i, r] of out.entries()) {
    const at = `#${i}`;
    if (typeof r !== "object" || r === null) { res.format.push(`${at}: не объект`); continue; }
    if (!want.has(r.doc_id)) res.format.push(`${at}: чужой doc_id ${String(r.doc_id).slice(0, 8)}`);
    if (seen.has(r.doc_id)) res.format.push(`${at}: повтор doc_id ${String(r.doc_id).slice(0, 8)}`);
    seen.add(r.doc_id);
    if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) res.format.push(`${at}: confidence вне 0..1`);
    else res.conf.push(r.confidence);
    if (typeof r.rationale !== "string" || !r.rationale.trim()) res.format.push(`${at}: нет rationale`);
    const v = validateLabels(fields, r.values);
    if (v.errors.some((e) => e.key === "*")) res.format.push(`${at}: values не объект`);
    else for (const e of v.errors) res.valueErrors.push({ doc_id: r.doc_id, ...e });
  }
  for (const id of want) if (!seen.has(id)) res.format.push(`нет doc_id ${id.slice(0, 8)}`);
  return res;
}

const batches = readdirSync(join(OUT, "inputs")).map((f) => f.slice(6, 9)).sort();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

if (import.meta.main) {
  if (one) {
    const r = checkBatch(one);
    console.log(JSON.stringify({ batch: one, exists: r.exists, format: r.format, valueErrors: r.valueErrors.length, meanConf: +mean(r.conf).toFixed(3) }));
    process.exit(r.exists && r.format.length === 0 ? 0 : 1);
  }
  const all = batches.map((b) => checkBatch(b));
  const done = all.filter((r) => r.exists && !r.format.length);
  const conf = done.flatMap((r) => r.conf);
  const line = `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${done.length}/${batches.length} | ${conf.length} | ${all.filter((r) => r.format.length).length} | ${done.reduce((s, r) => s + r.valueErrors.length, 0)} | ${mean(conf).toFixed(3)} | ${(conf.filter((c) => c < 0.7).length / (conf.length || 1) * 100).toFixed(1)} % |`;
  const md = join(OUT, "progress.md");
  if (!existsSync(md))
    writeFileSync(md, `# Прогресс разметки ${who}\n\n| время UTC | батчей готово | документов | батчей с ошибкой формата | ошибок по значениям | ср. уверенность | доля < 0,7 |\n|---|---|---|---|---|---|---|\n`);
  appendFileSync(md, line + "\n");
  console.log(line);
}
