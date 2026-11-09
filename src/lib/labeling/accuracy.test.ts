import { describe, expect, it } from "vitest";
import { accuracy, norm, wilson } from "./accuracy";

describe("norm", () => {
  it("регистр, ё, пробелы, пустое; у преподавателя — фамилия", () => {
    expect(norm("subject", "  Базы  Данных ")).toBe("базы данных");
    expect(norm("doc_type", "отчёт")).toBe(norm("doc_type", "ОТЧЕТ"));
    expect(norm("x", null)).toBe("∅");
    expect(norm("x", "")).toBe("∅");
    expect(norm("teacher", "Бикмуллина И.И.")).toBe(norm("teacher", "Бикмуллина Ильсияр Ильдаровна"));
    expect(norm("teacher", "Петров-Водкин А.")).toBe("петров-водкин");
    expect(norm("semester", 3)).toBe("3");
  });
});

describe("accuracy", () => {
  it("только общие документы; по полям и целиком", () => {
    const gold = new Map([["1", { s: "А", t: 1 }], ["2", { s: "Б", t: 2 }], ["3", { s: "В", t: 3 }]]);
    const pred = new Map([["1", { s: "а", t: 1 }], ["2", { s: "Б", t: 9 }], ["9", { s: "x", t: 0 }]]);
    expect(accuracy(["s", "t"], pred, gold).map((x) => [x.field, x.n, x.correct])).toEqual([["s", 2, 2], ["t", 2, 1], ["все поля", 2, 1]]);
  });
  it("wilson: 80 из 80 — нижняя граница ниже 1, пусто — NaN", () => {
    const [lo, hi] = wilson(80, 80);
    expect(hi).toBe(1);
    expect(lo).toBeGreaterThan(0.94);
    expect(lo).toBeLessThan(0.96);
    expect(wilson(0, 0).every(Number.isNaN)).toBe(true);
  });
});
