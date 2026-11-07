// Разбор документа на единицы. Критерии U1–U9 (docs/labeling-core.md).
import { describe, expect, it } from "vitest";
import { estimateTokens, parseDocument, preview } from "./units";

const doc = [
  "---",
  'title: "Лекция 5. Семафоры"',
  "semester: 3",
  'source_path: "C:\\\\Users\\\\x\\\\a.docx"',
  'date: ""',
  "---",
  "",
  "## Слайд 1",
  "Текст слайда",
  "### Подзаголовок",
  "ещё текст",
  "",
  "## Слайд 2",
  "",
  "## Страница 12",
  "страница",
  "## Раздел: Введение",
  "раздел один",
  "## Раздел: Итоги",
  "раздел два",
].join("\n");

describe("parseDocument", () => {
  it("U1: frontmatter — строки без кавычек, числа числом, \\\\ → \\, пустая строка", () => {
    const { meta } = parseDocument(doc);
    expect(meta).toEqual({ title: "Лекция 5. Семафоры", semester: 3, source_path: "C:\\Users\\x\\a.docx", date: "" });
  });

  it("U2: без frontmatter — meta пустой, единицы разобраны", () => {
    const r = parseDocument("## Страница 1\nтекст");
    expect(r.meta).toEqual({});
    expect(r.units).toHaveLength(1);
  });

  it("U3: Слайд/Страница/Раздел → вид, номер, подпись", () => {
    const { units } = parseDocument(doc);
    expect(units.map((u) => [u.kind, u.no, u.label])).toEqual([
      ["slide", 1, "Слайд 1"],
      ["slide", 2, "Слайд 2"],
      ["page", 12, "Страница 12"],
      ["section", 4, "Раздел: Введение"],
      ["section", 5, "Раздел: Итоги"],
    ]);
  });

  it("U4: текст до первого заголовка — раздел «Вступление», пустой — отбрасывается", () => {
    const r = parseDocument("вводный текст\n\n## Страница 1\nа");
    expect(r.units[0]).toMatchObject({ kind: "section", label: "Раздел: Вступление", text: "вводный текст" });
    expect(parseDocument("\n\n## Страница 1\nа").units).toHaveLength(1);
  });

  it("U5: прочие заголовки остаются внутри единицы", () => {
    expect(parseDocument(doc).units[0].text).toBe("Текст слайда\n### Подзаголовок\nещё текст");
  });

  it("U6: пустая единица сохраняется с пустым текстом", () => {
    expect(parseDocument(doc).units[1].text).toBe("");
  });

  it("U7: CRLF разбирается как LF", () => {
    const r = parseDocument(doc.replace(/\n/g, "\r\n"));
    expect(r.meta.title).toBe("Лекция 5. Семафоры");
    expect(r.units[0].text).toBe("Текст слайда\n### Подзаголовок\nещё текст");
  });

  it("U2: пустой документ → ни одной единицы", () => {
    expect(parseDocument("")).toEqual({ meta: {}, units: [] });
  });
});

describe("preview и estimateTokens", () => {
  it("U8: preview — подписи и тексты по порядку, не длиннее лимита", () => {
    const { units } = parseDocument(doc);
    const p = preview(units, 40);
    expect(p.startsWith("Слайд 1\nТекст слайда")).toBe(true);
    expect(p.length).toBeLessThanOrEqual(40);
    expect(preview(units, 10_000)).toContain("Раздел: Итоги\nраздел два");
  });

  it("U9: estimateTokens — 0 для пустого, растёт с длиной", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("а".repeat(300))).toBeGreaterThan(estimateTokens("а".repeat(30)));
    expect(estimateTokens("а".repeat(300))).toBeGreaterThanOrEqual(75);
  });
});
