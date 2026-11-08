// Дефекты, найденные финальным критиком ядра загрузки (docs/ingest-core.md, раздел «Финальный критик»).
import { describe, expect, it } from "vitest";
import { maskPii } from "../labeling/pii";
import { decodeText, extract } from "./extract";
import { docx, u8, zipCp866 } from "./fixtures";
import { fixMojibake, ingestFiles } from "./index";
import { unzip } from "./unzip";

const f = (name: string, data: Uint8Array | string) => ({ name, data: typeof data === "string" ? u8(data) : data });

describe("финальный критик", () => {
  it("D1 (I22): подписи единиц тоже маскируются — имя файла и заголовки", async () => {
    const r = await ingestFiles([
      f("лаб3Иванов.txt", "чистый текст"),
      f("o.docx", docx([["Heading1", "Иванов Иван Иванович"], [null, "текст"]])),
      f("m.md", "## Раздел: Петрова Анна Ивановна\nтекст"),
    ]);
    for (const d of r.docs) {
      expect(d.markdown).not.toMatch(/Иванов|Петрова/);
      expect(d.preview).not.toMatch(/Иванов|Петрова/);
      expect(d.piiFlag).toBe(true);
    }
  });

  it("D3: кракозябры в каждой части пути чинятся по отдельности (и фамилия маскируется)", async () => {
    const md = '---\nsource_path: "Ксения/ïáí«αáΓ«α¡á∩ ¡á Ивановой.docx"\n---\n## Страница 1\nтекст';
    const r = await ingestFiles([f("a.md", md)]);
    expect(r.docs[0].maskedPath).toBe("Ксения/Лабораторная на [ФИО].docx");
  });

  it("D4 (I18): длинные числа в лабах и ISBN-13 не трогаются; паспорт и билет — маскируются", () => {
    for (const s of ["Ответ: 98710 = 1100000011001110", "ISBN 9785936290315", "2147483647 и 4294967296", "π = 3.14159265358979"])
      expect(maskPii(s).text).toBe(s);
    expect(maskPii("паспорт 9204 123456").text).toBe("паспорт [номер]");
    expect(maskPii("ПАСПОРТ РФ 1234567890").text).toBe("ПАСПОРТ РФ [номер]");
    expect(maskPii("билет № 123456789012").text).toBe("билет № [номер]");
    expect(maskPii("СНИЛС 123-456-789 01").text).toBe("СНИЛС [номер]");
  });

  it("D9: .txt не разбирает frontmatter; md — только если внутри строки key: value", async () => {
    const t = "---\nключ: значение\nабзац текста\n---\nостальное";
    expect((await extract("a.txt", u8(t))).units[0].text).toBe(t);
    expect((await extract("b.md", u8(t))).units[0].text).toContain("абзац текста");
    expect((await extract("c.md", u8('---\ntitle: "x"\n---\n## Страница 1\nт'))).meta.title).toBe("x");
  });

  it("D10 (I14): заголовок docx с переносом строки и <br> — обратный разбор совпадает", async () => {
    const r = await ingestFiles([f("o.docx", docx([["Heading1", "Глава</w:t><w:br/><w:t>вторая строка"], [null, "текст"]]))]);
    const d = r.docs[0];
    expect(d.units[0].label).toBe("Раздел: Глава вторая строка");
    const { parseDocument } = await import("../labeling/units");
    expect(parseDocument(d.markdown).units.map((u) => [u.label, u.text])).toEqual(d.units.map((u) => [u.label, u.text]));
  });

  it("D12 (I2): имя в CP866, случайно валидное как UTF-8, читается как CP866", () => {
    expect(unzip(zipCp866({ "сап.md": "x", "рап спа.txt": "y" })).map((x) => x.name).sort()).toEqual(["рап спа.txt", "сап.md"]);
  });

  it("D13: fixMojibake не трогает латиницу с диакритикой", () => {
    expect(fixMojibake("Café Español Résumé.pdf")).toBe("Café Español Résumé.pdf");
    expect(fixMojibake("ïáí«αáΓ«α¡á∩")).toBe("Лабораторная");
  });

  it("D14 (I10): один битый байт в UTF-8 не переводит файл в CP1251", () => {
    const bytes = new Uint8Array([...u8("Привет мир, длинный текст для доли ".repeat(5)), 0xff, ...u8(" ещё текст")]);
    expect(decodeText(bytes)).toMatch(/^Привет мир/);
    expect(decodeText(Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]))).toBe("Привет");
    // «�» как настоящий символ в валидном UTF-8 (битые имена у сборщика) — не повод для CP1251 (было: 8 единиц → 1)
    expect(decodeText(u8("## Страница 1\n" + "�".repeat(50)))).toMatch(/^## Страница 1/);
  });

  it("D15 (I9): неподдерживаемый формат после лимита — «формат не поддерживается», не «лимит»", async () => {
    const r = await ingestFiles([f("а.txt", "один"), f("б.png", "x")], { maxFiles: 1 });
    expect(r.skipped).toEqual([{ name: "б.png", reason: "формат не поддерживается" }]);
  });
});
