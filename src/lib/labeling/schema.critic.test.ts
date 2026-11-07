// Дополнения по критику тестов: schema (S2–S7) и merge (M1–M7).
import { describe, expect, it } from "vitest";
import { disputedKeys, mergeLabels } from "./merge";
import { parseFields, validateLabels } from "./schema";

const fields = parseFields([
  { key: "subject", label: "Предмет", type: "enum", values: ["ОС", "Физика"], required: true, filter: true },
  { key: "doc_type", label: "Тип", type: "enum", values: ["лекция", "задание"], required: false, filter: true },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
]);
const intOnly = parseFields([{ key: "n", label: "N", type: "int", min: 1, max: 8, required: true, filter: false }]);
const boolOnly = parseFields([{ key: "b", label: "B", type: "bool", required: true, filter: false }]);
const T = 0.7;
const v = (values: Record<string, unknown>, confidence = 0.9) => ({ values, confidence });

describe("validateLabels — дополнения критика", () => {
  it("S2: отсутствующий ключ (не null) → ошибка ровно по нему; массив → ошибка", () => {
    expect(validateLabels(fields, { title: "x" }).errors.map((e) => e.key)).toEqual(["subject"]);
    expect(validateLabels(fields, []).ok).toBe(false);
  });
  it("S4: int без зависимостей — дробь, 0, 9, 'abc', '2.5', true → ошибка; ' 3 ' → 3, 8 → ok", () => {
    for (const bad of [1.5, 0, 9, "abc", "2.5", true]) expect(validateLabels(intOnly, { n: bad }).ok).toBe(false);
    expect(validateLabels(intOnly, { n: " 3 " }).values.n).toBe(3);
    expect(validateLabels(intOnly, { n: 8 }).ok).toBe(true);
  });
  it("S5: 'true' → true, false → false, 1 → ошибка", () => {
    expect(validateLabels(boolOnly, { b: "true" }).values.b).toBe(true);
    expect(validateLabels(boolOnly, { b: false }).values.b).toBe(false);
    expect(validateLabels(boolOnly, { b: 1 }).ok).toBe(false);
  });
  it("S3: отсутствующее поле не попадает в values даже как undefined", () => {
    expect(Object.keys(validateLabels(fields, { subject: "ОС" }).values)).toEqual(["subject"]);
  });
  it("S7: null и ключ с дефисом → исключение", () => {
    expect(() => parseFields(null)).toThrow();
    expect(() => parseFields([{ key: "subject-name", label: "П", type: "text", required: true, filter: true }])).toThrow();
  });
});

describe("mergeLabels — дополнения критика", () => {
  it("M1: некл. поля берутся от A, а не от B; уверенность ровно на пороге — agreed", () => {
    const r = mergeLabels(fields, v({ subject: "ОС", title: "Л1" }, 0.7), v({ subject: "ОС", title: "Л2" }, 0.7), null, T);
    expect(r).toEqual({ status: "agreed", values: { subject: "ОС", title: "Л1" }, disputed: [] });
  });
  it("M2: ниже порога только у B → review; NaN → review", () => {
    expect(mergeLabels(fields, v({ subject: "ОС" }, 0.9), v({ subject: "ОС" }, 0.5), null, T).status).toBe("review");
    expect(mergeLabels(fields, v({ subject: "ОС" }, NaN), v({ subject: "ОС" }), null, T).status).toBe("review");
  });
  it("M4: уверенный арбитр не дал значения спорного поля → review", () => {
    const r = mergeLabels(fields, v({ subject: "ОС" }), v({ subject: "Физика" }), v({ doc_type: "лекция" }, 0.9), T);
    expect(r.status).toBe("review");
  });
  it("M5: нет A → все ключевые спорные; нет обоих → тоже", () => {
    const all = { status: "needs_referee", disputed: ["subject", "doc_type"] };
    expect(mergeLabels(fields, null, v({ subject: "ОС" }), null, T)).toMatchObject(all);
    expect(mergeLabels(fields, null, null, null, T)).toMatchObject(all);
  });
  it("M7: недопустимо у обоих → не спор, но итог невалиден → review", () => {
    expect(mergeLabels(fields, v({ subject: "Химия" }), v({ subject: "Марс" }), null, T)).toMatchObject({ status: "review", disputed: [] });
  });
  it("M1: ключевое поле = required даже без filter", () => {
    const f = parseFields([
      { key: "subject", label: "П", type: "enum", values: ["ОС", "Физика"], required: true, filter: false },
      { key: "note", label: "Заметка", type: "text", required: false, filter: false },
    ]);
    expect(disputedKeys(f, { subject: "ОС", note: "а" }, { subject: "Физика", note: "б" })).toEqual(["subject"]);
  });
});
