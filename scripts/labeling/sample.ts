// Стратифицированные непересекающиеся выборки для архитектора (30) и критика (20).
// Страты: папка семестра × источник × расширение × размер. Путь — только для стратификации, агентам не уходит.
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/sample.ts
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { OUT } from "./common";

type Idx = { doc_id: string; filename: string; source_path: string; units: number; path: string };
const index: Idx[] = JSON.parse(readFileSync(join(OUT, "docs_index.json"), "utf8"));
const view = new Map<string, unknown>();
for (const f of readdirSync(join(OUT, "inputs")))
  for (const d of JSON.parse(readFileSync(join(OUT, "inputs", f), "utf8")).docs) view.set(d.doc_id, d);

const stratum = (d: Idx) => {
  const sem = d.path.split(/[\\/]/)[1];
  const src = d.source_path.includes("ChatExport") ? "tg" : "dl";
  const ext = d.filename.split(".").pop()!.toLowerCase();
  const size = d.units <= 1 ? "1" : d.units <= 10 ? "≤10" : "big";
  return `${sem}|${src}|${ext}|${size}`;
};

function pick(n: number, salt: string, exclude: Set<string>): Idx[] {
  const pool = index
    .filter((d) => !exclude.has(d.doc_id))
    .sort((a, b) => createHash("md5").update(salt + a.doc_id).digest("hex").localeCompare(createHash("md5").update(salt + b.doc_id).digest("hex")));
  const out: Idx[] = [];
  const seen = new Set<string>();
  for (const d of pool) // сначала по одному на страту
    if (out.length < n && !seen.has(stratum(d))) {
      seen.add(stratum(d));
      out.push(d);
    }
  for (const d of pool) if (out.length < n && !out.includes(d)) out.push(d);
  return out;
}

const arch = pick(30, "architect", new Set());
const critic = pick(20, "critic", new Set(arch.map((d) => d.doc_id)));
for (const [name, s] of [["sample_architect", arch], ["sample_critic", critic]] as const) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(s.map((d) => view.get(d.doc_id)), null, 1));
  console.log(name, s.length, [...new Set(s.map(stratum))].length, "страт");
}
