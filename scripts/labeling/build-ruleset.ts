// Собирает data/labeling/ruleset_vN.json (формат таблицы rulesets): fields из subjects.csv + rules_vN.md + examples_vN.json (+ critique_vN.md).
// Запуск: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/build-ruleset.ts 1
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFields, validateLabels, type Field } from "../../src/lib/labeling/schema";
import { OUT, readSubjects } from "./common";

const v = process.argv[2] ?? "1";
const ENGLISH = "Иностранный язык (английский)";
const rows = readSubjects().map((r) => (r.subject === "Английский язык" ? { ...r, subject: ENGLISH } : r));

const subjects = [...new Set(rows.map((r) => r.subject))];
const semesters: Record<string, number[]> = {};
for (const r of rows) {
  const s = (semesters[r.subject] ??= []);
  if (!s.includes(r.semester)) s.push(r.semester);
}
const teachers = [...new Set(rows.map((r) => r.teacher).filter(Boolean))];
const teacherBySubject: Record<string, string[]> = { другое: ["неизвестно"] };
for (const s of subjects) {
  const t = [...new Set(rows.filter((r) => r.subject === s).map((r) => r.teacher || "неизвестно"))];
  if (t.length !== 1) throw new Error(`у предмета ${s} преподавателей: ${t.join(", ")}`);
  teacherBySubject[s] = t;
}
const DOC_TYPES = ["лекция", "методичка", "задание", "отчёт", "практика", "конспект", "билеты", "пособие", "презентация", "статья", "организационное", "другое"];

const fields: Field[] = parseFields([
  { key: "subject", label: "Предмет", type: "enum", required: true, filter: true, values: [...subjects, "другое"] },
  { key: "semester", label: "Семестр", type: "int", required: false, filter: true, min: 1, max: 8, allowedBy: { field: "subject", map: semesters } },
  // у каждого предмета в subjects.csv один преподаватель; нет преподавателя → «неизвестно» (замечание критика №1)
  { key: "teacher", label: "Преподаватель", type: "enum", required: true, filter: true, values: [...teachers, "неизвестно"], allowedBy: { field: "subject", map: teacherBySubject } },
  { key: "doc_type", label: "Тип документа", type: "enum", required: true, filter: true, values: DOC_TYPES },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
  { key: "has_pii", label: "Есть ПДн", type: "bool", required: true, filter: false },
]);

const examples = JSON.parse(readFileSync(join(OUT, `examples_v${v}.json`), "utf8"));
for (const e of examples) {
  const r = validateLabels(fields, e.values);
  if (!r.ok) throw new Error(`пример ${e.filename}: ${JSON.stringify(r.errors)}`);
}
const critique = join(OUT, `critique_v${v}.md`);
writeFileSync(
  join(OUT, `ruleset_v${v}.json`),
  JSON.stringify({
    version: Number(v),
    status: "draft", // утверждение человеком — задним числом
    author: "agent",
    fields,
    rules: readFileSync(join(OUT, `rules_v${v}.md`), "utf8"),
    examples,
    critique: existsSync(critique) ? readFileSync(critique, "utf8") : null,
  }, null, 1),
);
console.log(`ruleset_v${v}: полей ${fields.length}, предметов ${subjects.length}, преподавателей ${teachers.length}, примеров ${examples.length}`);
