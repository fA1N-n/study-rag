// Входы для разметчиков: data/labeling/inputs/batch-NNN.json + teachers.json.
// Метки сборщика (subject/semester/teacher/doc_type, папка output/<сем>/<предмет>/) агентам НЕ передаются.
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/prepare.ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { estimateTokens, parseDocument, preview } from "../../src/lib/labeling/units";
import { makeBatches } from "../../src/lib/labeling/batching";
import { maskPii } from "../../src/lib/labeling/pii";
import { OUT, RAW, fixMojibake, listDocs, readSubjects } from "./common";

const PREVIEW_CHARS = 3000;
const fixPath = (s: string) => s.split(/([\\/!])/).map(fixMojibake).join("");

const subjects = readSubjects();
const teachers = [...new Set(subjects.map((s) => s.teacher).filter(Boolean))];

// Дополнение к maskPii для того, что ядро пропускает на этих данных (ядро не трогаем — отдельный TDD-этап):
// ФИО с отчеством в любом порядке и КАПСОМ (билеты, распечатки тестов, статьи), длинные номера (паспорт), <br> в таблицах.
// ponytail: эвристика по окончаниям отчеств; «Фамилия Имя» без отчества не ловится — перенести в pii.ts с тестами.
const teacherWords = new Set(teachers.flatMap((t) => t.toLowerCase().split(/\s+/)));
const surnameBases = teachers.map((t) => t.split(/\s+/)[0].toLowerCase().replace(/[ая]$/, ""));
const isTeacher = (words: string[]) => {
  const w = words.map((x) => x.toLowerCase());
  return w.some((x) => surnameBases.some((b) => x.startsWith(b) && x.length - b.length <= 3)) || w.filter((x) => teacherWords.has(x)).length >= 2;
};
const W = "[А-ЯЁ][а-яё]+", P = "[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)";
const WC = "[А-ЯЁ]{2,}", PC = "[А-ЯЁ]{2,}(?:ОВИЧ|ЕВИЧ|ИЧ|ОВНА|ЕВНА|ИЧНА)";
const FIO = new RegExp(`(?<![А-Яа-яЁё])(?:(?:${W}[ \\t]+)?${W}[ \\t]+${P}(?:[ \\t]+${W})?|(?:${WC}[ \\t]+)?${WC}[ \\t]+${PC}(?:[ \\t]+${WC})?)(?![А-Яа-яЁё])`, "g");
function maskExtra(text: string): { text: string; n: number } {
  let n = 0;
  const t = text
    .replace(FIO, (m) => (isTeacher(m.split(/[ \t]+/)) ? m : (n++, "[ФИО]")))
    .replace(/(?<![\d-])\d{9,}(?![\d-])/g, () => (n++, "[номер]"));
  return { text: t, n };
}
// самопроверка эвристики на случаях из данных
for (const [src, want] of [
  // синтетические ФИО и номер — по шаблонам из данных, не настоящие
  ["ПАСПОРТ РФ 1234567890 ПЕТРОВА АННА ИВАНОВНА", "ПАСПОРТ РФ [номер] [ФИО]"],
  ["Пользователь 4107 Иван Петрович Сидоров", "Пользователь 4107 [ФИО]"],
  ["Петрова Анна Ивановна1, студент", "[ФИО]1, студент"],
  ["Бикмуллина Ильсияр Ильдаровна1, доцент; Ильсияр Ильдаровна", "Бикмуллина Ильсияр Ильдаровна1, доцент; Ильсияр Ильдаровна"],
  ["ORCID: 0009-0003-2501-6316, ISBN 5-93629-031-X", "ORCID: 0009-0003-2501-6316, ISBN 5-93629-031-X"],
])
  if (maskExtra(src).text !== want) throw new Error(`maskExtra: «${src}» → «${maskExtra(src).text}»`);
let extraHits = 0;

const docs = listDocs()
  .map((path) => {
    const { meta, units } = parseDocument(readFileSync(path, "utf8"));
    const file = basename(String(meta.original_file ?? path)).replace(/^[0-9a-f]{16}_/, "");
    // табы и пустые строки титульников съедают превью — сжимаем до нарезки
    const dense = units.map((u) => ({ ...u, text: u.text.replace(/[ \t ]+/g, " ").replace(/ *\n[\s]*/g, "\n").trim() }));
    const core = maskPii(preview(dense, PREVIEW_CHARS).replace(/<br\s*\/?>/gi, " "), { keepNames: teachers });
    const extra = maskExtra(core.text);
    const masked = { text: extra.text, piiFlag: core.piiFlag || extra.n > 0 };
    extraHits += extra.n;
    return {
      doc_id: String(meta.sha256),
      filename: fixPath(file),
      source_path: fixPath(String(meta.source_path ?? "")),
      units: units.length,
      preview: masked.text,
      pii_found: masked.piiFlag,
      path: path.slice(RAW.length + 1), // только для служебных отчётов, агентам не уходит
    };
  })
  .sort((a, b) => a.doc_id.localeCompare(b.doc_id)); // порядок по хэшу перемешивает предметы и источники

const ids = new Set(docs.map((d) => d.doc_id));
if (ids.size !== docs.length || docs.some((d) => !/^[0-9a-f]{64}$/.test(d.doc_id))) throw new Error("sha256 не уникальны или пусты");

const byId = new Map(docs.map((d) => [d.doc_id, d]));
const batches = makeBatches(
  docs.map((d) => ({ id: d.doc_id, tokens: estimateTokens(d.preview + d.filename + d.source_path) })),
  { maxTokens: 20_000, maxDocs: 20 }, // ≈ 60 тыс. символов
);

rmSync(join(OUT, "inputs"), { recursive: true, force: true }); // старые батчи от прошлого запуска
mkdirSync(join(OUT, "inputs"), { recursive: true });
batches.forEach((b, i) => {
  const no = String(i + 1).padStart(3, "0");
  const items = b.map((id) => {
    const d = byId.get(id)!;
    return { doc_id: d.doc_id, filename: d.filename, source_path: d.source_path, units: d.units, preview: d.preview };
  });
  writeFileSync(join(OUT, "inputs", `batch-${no}.json`), JSON.stringify({ batch: no, docs: items }, null, 1));
});

// служебный индекс (с путём и метками сборщика) — для стратификации и сводок, агентам не давать
writeFileSync(
  join(OUT, "docs_index.json"),
  JSON.stringify(docs.map((d) => ({ doc_id: d.doc_id, filename: d.filename, source_path: d.source_path, units: d.units, pii_found: d.pii_found, path: d.path })), null, 1),
);
writeFileSync(join(OUT, "teachers.json"), JSON.stringify({ teachers, subjects }, null, 1));
console.log(`документов: ${docs.length}, батчей: ${batches.length}, ПДн в превью: ${docs.filter((d) => d.pii_found).length}, доп. замен: ${extraHits}`);
