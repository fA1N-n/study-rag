// Оценка разметки: A, B, «двое + арбитр» (итог v1) против серебряного набора (Opus по полному тексту, 80 документов)
// и против ручной проверки пользователя (19 документов). Пишет data/eval/labeling.md.
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/eval/labeling-eval.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { accuracy, wilson, type Labels } from "../../src/lib/labeling/accuracy";

const D = "data/labeling";
const FIELDS = ["subject", "semester", "teacher", "doc_type", "has_pii"];
type Vote = { doc_id: string; values: Labels; confidence?: number };

const jsonl = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const map = (rows: Vote[]) => new Map(rows.map((r) => [r.doc_id, r.values]));

const A = map(jsonl(`${D}/labels_A.jsonl`));
const B = map(readdirSync(`${D}/B`).filter((f) => /^batch-\d{3}\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(`${D}/B/${f}`, "utf8")) as Vote[]));
const finalRows = jsonl(`${D}/final_v1.jsonl`) as (Vote & { status: string })[];
const F = map(finalRows);
const status = new Map(finalRows.map((r) => [r.doc_id, r.status]));
const silverRows = readdirSync(`${D}/silver/out`).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(`${D}/silver/out/${f}`, "utf8")) as Vote[]);
const S = map(silverRows);
const H = new Map(Object.entries(JSON.parse(readFileSync(`${D}/gold_human/gold_human_results.json`, "utf8")) as Record<string, { values: Labels }>).map(([k, v]) => [k, v.values]));

const pct = (x: number) => (Number.isNaN(x) ? "—" : `${(x * 100).toFixed(1).replace(".", ",")} %`);
function table(title: string, gold: Map<string, Labels>, rows: [string, Map<string, Labels>][]) {
  const scores = rows.map(([name, pred]) => [name, accuracy(FIELDS, pred, gold)] as const);
  const head = `| Разметчик | n | ${[...FIELDS, "все поля"].join(" | ")} |\n|---|---|${[...FIELDS, 0].map(() => "---").join("|")}|`;
  const body = scores.map(([name, sc]) => `| ${name} | ${sc[0].n} | ${sc.map((s) => pct(s.acc)).join(" | ")} |`).join("\n");
  const ci = scores.map(([name, sc]) => {
    const all = sc.at(-1)!;
    const [lo, hi] = wilson(all.correct, all.n);
    return `${name}: ${pct(lo)}–${pct(hi)}`;
  });
  return `### ${title}\n\n${head}\n${body}\n\n95 % интервал Уилсона для «все поля»: ${ci.join("; ")}.\n`;
}

const sub = (st: string) => new Map([...S].filter(([id]) => status.get(id) === st));
const silverIds = new Set(S.keys());
const both = [...H.keys()].filter((id) => silverIds.has(id));

const md = [
  `## Точность разметки\n\nПоля: ${FIELDS.join(", ")} (название — свободный текст, не сравнивается). Сравнение без учёта регистра, ё/е и пробелов; у преподавателя — по фамилии.\n`,
  table(`Против серебряного набора (${S.size} документов, Opus по полному тексту)`, S, [["A (Sonnet, превью)", A], ["B (Codex/Haiku, превью)", B], ["Двое + арбитр (итог v1)", F]]),
  table("Итог v1 против серебряного по статусу документа", S, [
    [`agreed (${sub("agreed").size})`, new Map([...F].filter(([id]) => status.get(id) === "agreed"))],
    [`refereed (${sub("refereed").size})`, new Map([...F].filter(([id]) => status.get(id) === "refereed"))],
    [`review (${sub("review").size})`, new Map([...F].filter(([id]) => status.get(id) === "review"))],
  ]),
  table(`Против ручной проверки пользователя (${H.size} документов)`, H, [["A", A], ["B", B], ["Двое + арбитр (итог v1)", F], ["Серебряный набор", S]]),
  `Пересечение ручной проверки и серебряного набора: ${both.length} документов.\n`,
].join("\n");

mkdirSync("data/eval", { recursive: true });
writeFileSync("data/eval/labeling.md", md);
console.log(md);
