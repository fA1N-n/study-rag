import { describe, expect, it } from "vitest";
import { chunkDocument, header, split } from "./chunk";

describe("split", () => {
  it("короткий — целиком, пустой — ничего", () => {
    expect(split("  абв  ")).toEqual(["абв"]);
    expect(split("   ")).toEqual([]);
    expect(split("а\u0000б\tв\u001f")).toEqual(["аб\tв"]);
  });
  it("длинный — части не длиннее size, с перекрытием, без потери текста", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Предложение номер ${i} про базы данных.`).join(" ");
    const parts = split(text, 300, 50);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    for (let i = 1; i < parts.length; i++) expect(parts[i - 1].slice(-20).trim().length).toBeGreaterThan(0);
    expect(parts.at(-1)!.endsWith("данных.")).toBe(true);
    for (let i = 0; i < 60; i++) expect(parts.some((p) => p.includes(`номер ${i} `))).toBe(true);
  });
});

describe("header и chunkDocument", () => {
  const fields = [
    { key: "subject", label: "Предмет", filter: true },
    { key: "semester", label: "Семестр", filter: true },
    { key: "title", label: "Название" },
  ];
  it("только ключевые непустые метки, имя без расширения, единица", () => {
    expect(header({ subject: "ОС", semester: null, title: "x" }, fields, "Лаба 2.pdf", "Слайд 5")).toBe("Предмет: ОС · Документ: Лаба 2 · Слайд 5");
  });
  it("unit_no — порядковый, части нумеруются, пустые единицы пропускаются", () => {
    const units = [
      { kind: "section" as const, no: 1, label: "Раздел: Вступление", text: "вступление" },
      { kind: "page" as const, no: 1, label: "Страница 1", text: "" },
      { kind: "page" as const, no: 2, label: "Страница 2", text: "а".repeat(500) },
    ];
    const ch = chunkDocument(units, { subject: "БД" }, fields, "d.md", 300, 50);
    expect(ch.map((c) => [c.unit_no, c.part])).toEqual([[1, 0], [3, 0], [3, 1]]);
    expect(ch[1].header).toBe("Предмет: БД · Документ: d · Страница 2");
  });
});
