// Регрессии по финальному критику кода (все входы — найденные им контрпримеры).
import { describe, expect, it } from "vitest";
import { makeBatches } from "./batching";
import { mergeLabels } from "./merge";
import { maskPii } from "./pii";
import { parseFields, validateLabels } from "./schema";
import { parseDocument, preview } from "./units";

describe("units", () => {
  it("U2: BOM в начале не мешает frontmatter; пустой frontmatter распознаётся", () => {
    expect(parseDocument("﻿---\na: 1\n---\nx").meta).toEqual({ a: 1 });
    expect(parseDocument("---\n---\n## Страница 1\nа").units.map((u) => u.label)).toEqual(["Страница 1"]);
  });
  it("U1: число с ведущим нулём остаётся строкой", () => {
    expect(parseDocument('---\ncode: 007\n---\n').meta.code).toBe("007");
  });
  it("U8: отрицательный лимит → пустая строка", () => {
    expect(preview(parseDocument("## Слайд 1\nа").units, -1)).toBe("");
  });
});

describe("batching", () => {
  it("B5: бесконечные токены и дробный maxDocs → ошибка", () => {
    expect(() => makeBatches([{ id: "a", tokens: Infinity }], { maxTokens: 10, maxDocs: 2 })).toThrow();
    expect(() => makeBatches([{ id: "a", tokens: 1 }], { maxTokens: 10, maxDocs: 1.5 })).toThrow();
  });
});

describe("schema", () => {
  const f = parseFields([
    { key: "subject", label: "П", type: "enum", values: ["ОС", "toString"], required: true, filter: true },
    { key: "semester", label: "С", type: "int", required: false, filter: true, allowedBy: { field: "subject", map: { ОС: [5] } } },
    { key: "title", label: "Н", type: "text", required: true, filter: false },
  ]);
  it("S2: обязательный текст из пробелов → ошибка", () => {
    expect(validateLabels(f, { subject: "ОС", title: "   " }).errors.map((e) => e.key)).toEqual(["title"]);
  });
  it("S8: значение родителя совпадает с полем прототипа — без исключения, без ограничения", () => {
    expect(validateLabels(f, { subject: "toString", semester: 3, title: "x" }).ok).toBe(true);
  });
  it("S6: ключ поля «constructor» не берётся из прототипа", () => {
    const g = parseFields([{ key: "constructor", label: "К", type: "text", required: false, filter: false }]);
    expect(validateLabels(g, {})).toMatchObject({ ok: true, values: {} });
  });
  it("S1: enum без учёта регистра и пробелов → каноническое значение", () => {
    const g = parseFields([{ key: "t", label: "Т", type: "enum", values: ["лекция"], required: true, filter: true }]);
    expect(validateLabels(g, { t: " Лекция " }).values.t).toBe("лекция");
  });
  it("S7: повтор значений enum, values у не-enum, min > max, зависимость от себя → исключение", () => {
    const e = { key: "t", label: "Т", type: "enum", required: true, filter: true };
    expect(() => parseFields([{ ...e, values: ["а", "а"] }])).toThrow();
    expect(() => parseFields([{ ...e, type: "text", values: ["а"] }])).toThrow();
    expect(() => parseFields([{ ...e, type: "int", min: 5, max: 1 }])).toThrow();
    expect(() => parseFields([{ ...e, values: ["а"], allowedBy: { field: "t", map: {} } }])).toThrow();
  });
});

describe("merge", () => {
  const noKey = parseFields([{ key: "note", label: "З", type: "text", required: false, filter: false }]);
  const f = parseFields([
    { key: "subject", label: "П", type: "enum", values: ["ОС", "Физика"], required: true, filter: true },
    { key: "doc_type", label: "Т", type: "enum", values: ["лекция", "задание"], required: false, filter: true },
  ]);
  it("M5: схема без ключевых полей и нет одного разметчика → review, без исключения", () => {
    expect(mergeLabels(noKey, null, { values: {}, confidence: 0.9 }, null, 0.7).status).toBe("review");
  });
  it("M4: арбитр законно оставил необязательное спорное поле пустым → refereed", () => {
    const r = mergeLabels(
      f,
      { values: { subject: "ОС", doc_type: "лекция" }, confidence: 0.9 },
      { values: { subject: "ОС" }, confidence: 0.9 },
      { values: { subject: "ОС" }, confidence: 0.9 },
      0.7,
    );
    expect(r).toEqual({ status: "refereed", values: { subject: "ОС" }, disputed: ["doc_type"] });
  });
  it("M2: уверенность вне 0..1 → review", () => {
    const a = { values: { subject: "ОС" }, confidence: 7 };
    expect(mergeLabels(f, a, { values: { subject: "ОС" }, confidence: 0.9 }, null, 0.7).status).toBe("review");
  });
});

describe("pii", () => {
  it("P2: ряды чисел, начинающиеся с 8, — не телефоны (код оператора 3/4/8/9)", () => {
    for (const s of ["8 128 256 32 64", "Таблица: 8 100 200 30 40 50"]) expect(maskPii(s).text).toBe(s);
    expect(maskPii("8 843 231-00-00").text).toBe("[телефон]");
  });
  it("P4: «Выполнил(а):», «студенты», перечисление через запятую", () => {
    expect(maskPii("Выполнил(а): Петрова Ксения").text).toBe("Выполнил(а): [ФИО]");
    expect(maskPii("Выполнили студенты группы 4107 Иванов Иван, Петров Пётр").text).toBe("Выполнили студенты группы 4107 [ФИО]");
  });
  it("P5: keepNames — только формы той же фамилии, не всё с тем же началом", () => {
    expect(maskPii("Иванченко И.И.", { keepNames: ["Иванов Иван Иванович"] }).text).toBe("[ФИО]");
    expect(maskPii("Иванова И.И. и Иванову А.А.", { keepNames: ["Иванова А. Р."] }).text).toBe("Иванова И.И. и Иванову А.А.");
    expect(maskPii("доц. Сидоров А.Б.", { keepNames: ["доц. Сидоров"] }).text).toBe("доц. Сидоров А.Б.");
    expect(maskPii("Ли А.Б.", { keepNames: ["Ли Анна Борисовна"] }).text).toBe("Ли А.Б.");
  });
  it("P8: «имени А.Н. Туполева» не маскируется", () => {
    const s = "университет имени А.Н. Туполева";
    expect(maskPii(s).text).toBe(s);
  });
  it("P8: «Выполнил » + «гр.:»×30 — без экспоненциального перебора", () => {
    const s = "Выполнил " + "гр.:".repeat(30) + " x";
    const t0 = performance.now();
    maskPii(s);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
