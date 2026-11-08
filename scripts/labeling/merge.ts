// Слияние A/B (mergeLabels), каппа по полям, входы арбитру; после арбитра — итог и очередь человеку.
// Запуск:
//   node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/merge.ts prep    → referee/inputs/ref-NNN.json, kappa_v1.md
//   node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/merge.ts final   → final_v1.jsonl, review_queue.csv, merge_v1.md
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cohenKappa } from "../../src/lib/labeling/kappa";
import { mergeLabels, type Vote } from "../../src/lib/labeling/merge";
import { parseFields, validateLabels } from "../../src/lib/labeling/schema";
import { OUT } from "./common";

const mode = process.argv[2] ?? "prep";
const THRESHOLD = 0.7;
const REF_BATCH = 15;
const fields = parseFields(JSON.parse(readFileSync(join(OUT, "ruleset_v1.json"), "utf8")).fields);
const keyFields = fields.filter((f) => f.required || f.filter);

type Out = { doc_id: string; values: Record<string, unknown>; confidence: number; rationale: string; batch: string };
type Doc = { doc_id: string; filename: string; source_path: string; units: number; preview: string };

const A = new Map<string, Out>(
  readFileSync(join(OUT, "labels_A.jsonl"), "utf8").trim().split("\n").map((l) => {
    const r = JSON.parse(l);
    return [r.doc_id, { doc_id: r.doc_id, values: r.values, confidence: r.confidence, rationale: r.rationale, batch: r.batch }];
  }),
);
const B = new Map<string, Out>();
for (const f of readdirSync(join(OUT, "B")).filter((x) => /^batch-\d{3}\.json$/.test(x)).sort())
  for (const r of JSON.parse(readFileSync(join(OUT, "B", f), "utf8")) as Out[])
    B.set(r.doc_id, { ...r, values: validateLabels(fields, r.values).values, batch: f.slice(6, 9) });
const docs = new Map<string, Doc>();
for (const f of readdirSync(join(OUT, "inputs")).sort())
  for (const d of JSON.parse(readFileSync(join(OUT, "inputs", f), "utf8")).docs as Doc[]) docs.set(d.doc_id, d);

const vote = (o?: Out): Vote => (o ? { values: o.values, confidence: o.confidence } : null);
const ids = [...docs.keys()].sort();
const show = (v: unknown) => (v === undefined || v === null || v === "" ? "∅" : String(v));

// --- каппа по полям: всего и по частям B (Codex 001–018, Haiku 019–029)
function kappaTable(): string {
  const parts: [string, (o: Out) => boolean][] = [
    ["все 572", () => true],
    ["B = Codex (батчи 001–018)", (o) => o.batch <= "018"],
    ["B = Claude Haiku (019–029)", (o) => o.batch >= "019"],
  ];
  const rows = keyFields.map((f) => {
    const cells = parts.map(([, keep]) => {
      const both = ids.filter((id) => A.has(id) && B.has(id) && keep(B.get(id)!));
      const a = both.map((id) => show(A.get(id)!.values[f.key]));
      const b = both.map((id) => show(B.get(id)!.values[f.key]));
      const agree = a.filter((x, i) => x === b[i]).length;
      return `${cohenKappa(a, b).toFixed(3)} (${((agree / both.length) * 100).toFixed(1)} %)`;
    });
    return `| ${f.label} (${f.key}) | ${cells.join(" | ")} |`;
  });
  return `| поле | ${parts.map(([n]) => n).join(" | ")} |\n|---|${parts.map(() => "---").join("|")}|\n${rows.join("\n")}`;
}

if (mode === "prep") {
  const need: string[] = [];
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const m = mergeLabels(fields, vote(A.get(id)), vote(B.get(id)), null, THRESHOLD);
    counts[m.status] = (counts[m.status] ?? 0) + 1;
    if (m.status === "needs_referee") need.push(id);
  }
  const dir = join(OUT, "referee", "inputs");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(OUT, "referee", "out"), { recursive: true });
  for (let i = 0; i < need.length; i += REF_BATCH) {
    const part = need.slice(i, i + REF_BATCH).map((id) => {
      const m = mergeLabels(fields, vote(A.get(id)), vote(B.get(id)), null, THRESHOLD);
      const { doc_id, filename, source_path, units, preview } = docs.get(id)!;
      const pick = (o: Out) => ({ values: o.values, confidence: o.confidence, rationale: o.rationale });
      return { doc_id, filename, source_path, units, preview, disputed: m.disputed, A: pick(A.get(id)!), B: pick(B.get(id)!) };
    });
    writeFileSync(join(dir, `ref-${String(i / REF_BATCH + 1).padStart(3, "0")}.json`), JSON.stringify({ docs: part }, null, 1));
  }
  writeFileSync(
    join(OUT, "kappa_v1.md"),
    `# Согласие разметчиков A и B (правила v1)\n\nКаппа Коэна по ключевым полям (пустое значение — отдельная категория «∅»), в скобках — доля совпадений.\nA — Claude Sonnet (все батчи); B — Codex/GPT (001–018) и Claude Haiku (019–029).\n\n${kappaTable()}\n\nСлияние без арбитра (порог уверенности ${THRESHOLD}): ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}. Арбитру: ${need.length} документов, ${Math.ceil(need.length / REF_BATCH)} батчей по ≤${REF_BATCH}.\n`,
  );
  console.log(counts, `арбитру ${need.length} → ${Math.ceil(need.length / REF_BATCH)} батчей`);
} else {
  const R = new Map<string, Out>();
  const refDir = join(OUT, "referee", "out");
  for (const f of existsSync(refDir) ? readdirSync(refDir).sort() : [])
    for (const r of JSON.parse(readFileSync(join(refDir, f), "utf8")) as Out[]) R.set(r.doc_id, { ...r, batch: f.slice(4, 7) });
  const out: string[] = [];
  const queue: string[] = ["doc_id;filename;status;disputed;A;B;referee"];
  const counts: Record<string, number> = {};
  const changed: Record<string, { A: number; B: number }> = {};
  for (const id of ids) {
    const m = mergeLabels(fields, vote(A.get(id)), vote(B.get(id)), vote(R.get(id)), THRESHOLD);
    const status = m.status === "needs_referee" ? "review" : m.status; // арбитр не ответил → человеку
    counts[status] = (counts[status] ?? 0) + 1;
    if (R.has(id))
      for (const k of m.disputed) {
        changed[k] ??= { A: 0, B: 0 };
        if (show(m.values[k]) === show(A.get(id)!.values[k])) changed[k].A++;
        else if (show(m.values[k]) === show(B.get(id)!.values[k])) changed[k].B++;
      }
    out.push(JSON.stringify({ doc_id: id, status, values: m.values, disputed: m.disputed, referee: R.get(id) ?? null }));
    if (status === "review") {
      const brief = (o?: Out) => (o ? `${keyFields.map((f) => show(o.values[f.key])).join(" / ")} (${o.confidence})` : "—");
      queue.push([id, docs.get(id)!.filename, status, m.disputed.join(","), brief(A.get(id)), brief(B.get(id)), brief(R.get(id))].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    }
  }
  writeFileSync(join(OUT, "final_v1.jsonl"), out.join("\n") + "\n");
  writeFileSync(join(OUT, "review_queue.csv"), "﻿" + queue.join("\n") + "\n");
  const total = ids.length;
  writeFileSync(
    join(OUT, "merge_v1.md"),
    `# Итог мультиагентной разметки (правила v1)\n\n| статус | документов | доля |\n|---|---|---|\n${Object.entries(counts).map(([k, v]) => `| ${k} | ${v} | ${((v / total) * 100).toFixed(1)} % |`).join("\n")}\n\nАрбитр ответил по ${R.size} документам. На чьей стороне арбитр по спорным полям:\n\n| поле | как A | как B |\n|---|---|---|\n${Object.entries(changed).map(([k, v]) => `| ${k} | ${v.A} | ${v.B} |`).join("\n")}\n\n${kappaTable()}\n`,
  );
  console.log(counts, `арбитр: ${R.size}`);
}
