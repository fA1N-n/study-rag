// Дополнения по критику тестов: units (U1–U9) и batching (B5).
import { describe, expect, it } from "vitest";
import { makeBatches } from "./batching";
import { estimateTokens, parseDocument, preview } from "./units";

const doc = "## Слайд 1\nа\n\n## Слайд 2\n\n## Страница 12\nб\n## Раздел: Введение\nв";

describe("units — дополнения критика", () => {
  it("U1: значение без кавычек — строкой", () => {
    expect(parseDocument("---\nlang: ru\n---\n").meta).toEqual({ lang: "ru" });
  });
  it("U2: только frontmatter → нет единиц", () => {
    expect(parseDocument("---\na: 1\n---\n").units).toEqual([]);
  });
  it("U2: незакрытый frontmatter — весь текст тело документа", () => {
    const r = parseDocument("---\ntitle: x\n## Страница 1\nа");
    expect(r.meta).toEqual({});
    expect(r.units.map((u) => u.label)).toEqual(["Раздел: Вступление", "Страница 1"]);
  });
  it("U4: «Вступление» получает номер 1, следующие единицы считаются дальше", () => {
    expect(parseDocument("вводный\n## Раздел: А\nа").units.map((x) => x.no)).toEqual([1, 2]);
  });
  it("U5: «## Другое» не режет единицу", () => {
    expect(parseDocument("## Слайд 1\nа\n## Другое\nб").units).toEqual([
      { kind: "slide", no: 1, label: "Слайд 1", text: "а\n## Другое\nб" },
    ]);
  });
  it("U5: «## Страница abc» и «## Слайд» без номера — обычный текст", () => {
    const u = parseDocument("## Страница 1\nа\n## Страница abc\n## Слайд\nб").units;
    expect(u).toHaveLength(1);
    expect(u[0].text).toBe("а\n## Страница abc\n## Слайд\nб");
  });
  it("U3: большой документ — 2000 страниц по порядку", () => {
    const md = Array.from({ length: 2000 }, (_, i) => `## Страница ${i + 1}\nтекст ${i + 1}`).join("\n");
    const u = parseDocument(md).units;
    expect(u).toHaveLength(2000);
    expect(u[1999]).toEqual({ kind: "page", no: 2000, label: "Страница 2000", text: "текст 2000" });
  });
  it("U8: порядок единиц в preview и жёсткий лимит", () => {
    const p = preview(parseDocument(doc).units, 10_000);
    expect(p.indexOf("Слайд 2")).toBeLessThan(p.indexOf("Страница 12"));
    expect(p.indexOf("Страница 12")).toBeLessThan(p.indexOf("Раздел: Введение"));
    expect(preview(parseDocument(doc).units, 3).length).toBeLessThanOrEqual(3);
  });
  it("U9: округление вверх (не floor)", () => {
    expect(estimateTokens("абвгд")).toBeGreaterThanOrEqual(2);
  });
});

describe("makeBatches — дополнения критика", () => {
  it("B5: отрицательные параметры; проверка параметров и на пустом входе", () => {
    const one = [{ id: "d0", tokens: 1 }];
    expect(() => makeBatches(one, { maxTokens: -5, maxDocs: 5 })).toThrow();
    expect(() => makeBatches(one, { maxTokens: 10, maxDocs: -1 })).toThrow();
    expect(() => makeBatches([], { maxTokens: 0, maxDocs: 5 })).toThrow();
  });
});
