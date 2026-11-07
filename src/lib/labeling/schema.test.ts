// Схема разметки и валидатор меток. Критерии S1–S8.
import { describe, expect, it } from "vitest";
import { parseFields, validateLabels, type Field } from "./schema";

const fields: Field[] = parseFields([
  { key: "subject", label: "Предмет", type: "enum", values: ["Операционные системы", "Физика"], required: true, filter: true },
  {
    key: "semester", label: "Семестр", type: "int", min: 1, max: 8, required: true, filter: true,
    allowedBy: { field: "subject", map: { "Операционные системы": [5], "Физика": [1, 2] } },
  },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
  { key: "has_pii", label: "Есть ПДн", type: "bool", required: false, filter: false },
]);

describe("validateLabels", () => {
  it("S1: значение вне словаря → ошибка по полю, значение выброшено", () => {
    const r = validateLabels(fields, { subject: "Химия", semester: 5 });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.key)).toContain("subject");
    expect(r.values.subject).toBeUndefined();
  });

  it("S2: нет обязательного поля → ошибка; null считается отсутствием", () => {
    const r = validateLabels(fields, { subject: "Физика", semester: null });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([expect.objectContaining({ key: "semester" })]);
  });

  it("S3: необязательное поле может отсутствовать", () => {
    const r = validateLabels(fields, { subject: "Физика", semester: 1 });
    expect(r).toEqual({ ok: true, values: { subject: "Физика", semester: 1 }, errors: [], dropped: [] });
  });

  it("S4: int — строка-число приводится, дробь и выход за min/max — ошибка", () => {
    expect(validateLabels(fields, { subject: "Физика", semester: "2" }).values.semester).toBe(2);
    expect(validateLabels(fields, { subject: "Физика", semester: 1.5 }).ok).toBe(false);
    expect(validateLabels(fields, { subject: "Физика", semester: "9" }).ok).toBe(false);
  });

  it("S5: bool — true/false и строки 'true'/'false'; прочее — ошибка", () => {
    const base = { subject: "Физика", semester: 1 };
    expect(validateLabels(fields, { ...base, has_pii: "false" }).values.has_pii).toBe(false);
    expect(validateLabels(fields, { ...base, has_pii: true }).values.has_pii).toBe(true);
    expect(validateLabels(fields, { ...base, has_pii: "да" }).ok).toBe(false);
  });

  it("S6: лишние ключи выброшены и перечислены в dropped, ok не портят", () => {
    const r = validateLabels(fields, { subject: "Физика", semester: 1, colour: "red" });
    expect(r.ok).toBe(true);
    expect(r.dropped).toEqual(["colour"]);
    expect(r.values).not.toHaveProperty("colour");
  });

  it("S8: зависимое поле — семестр должен подходить предмету", () => {
    const r = validateLabels(fields, { subject: "Операционные системы", semester: 4 });
    expect(r.ok).toBe(false);
    expect(r.errors[0].key).toBe("semester");
    expect(validateLabels(fields, { subject: "Операционные системы", semester: 5 }).ok).toBe(true);
  });

  it("S8: предмета нет в карте зависимостей — семестр не ограничен", () => {
    const f = parseFields([
      { key: "subject", label: "П", type: "enum", values: ["А", "Б"], required: true, filter: true },
      { key: "semester", label: "С", type: "int", required: true, filter: true, allowedBy: { field: "subject", map: { А: [1] } } },
    ]);
    expect(validateLabels(f, { subject: "Б", semester: 7 }).ok).toBe(true);
  });

  it("S1: текстовое поле обрезается по краям; не строка — ошибка", () => {
    const base = { subject: "Физика", semester: 1 };
    expect(validateLabels(fields, { ...base, title: "  Лекция 1 " }).values.title).toBe("Лекция 1");
    expect(validateLabels(fields, { ...base, title: 42 }).ok).toBe(false);
  });

  it("S2: не объект на входе → ошибка, а не исключение", () => {
    expect(validateLabels(fields, "мусор").ok).toBe(false);
    expect(validateLabels(fields, null).ok).toBe(false);
  });
});

describe("parseFields", () => {
  it("S7: некорректная схема → исключение", () => {
    const ok = { key: "subject", label: "П", type: "enum", values: ["А"], required: true, filter: true };
    expect(() => parseFields([{ ...ok, values: [] }])).toThrow(); // enum без значений
    expect(() => parseFields([ok, ok])).toThrow(); // повтор ключа
    expect(() => parseFields([{ ...ok, key: "Предмет" }])).toThrow(); // ключ не snake_case
    expect(() => parseFields([{ ...ok, type: "date" }])).toThrow();
    expect(() => parseFields([])).toThrow();
    expect(() =>
      parseFields([ok, { key: "s", label: "С", type: "int", required: true, filter: true, allowedBy: { field: "nope", map: {} } }]),
    ).toThrow(); // зависимость от несуществующего поля
  });
});
