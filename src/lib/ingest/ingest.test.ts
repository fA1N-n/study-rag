// Критерии — docs/ingest-core.md (I1–I21).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../labeling/units";
import { extract } from "./extract";
import { docx, pdf, u8, zip, zipCp866 } from "./fixtures";
import { ingestFiles, makePreview } from "./index";
import { unzip } from "./unzip";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const MD = "---\ntitle: \"Лекция 1\"\n---\n## Слайд 1\nВведение в ОС\n\n## Слайд 2\nПроцессы и потоки\n";

describe("unzip", () => {
  it("I1: файлы в папках с полным путём, записи папок не попадают", () => {
    const z = zip({ "a/b/лекция.md": MD, "a/c.txt": "текст", "a/": new Uint8Array() });
    const names = unzip(z).map((f) => f.name).sort();
    expect(names).toEqual(["a/b/лекция.md", "a/c.txt"]);
    expect(new TextDecoder().decode(unzip(z).find((f) => f.name === "a/c.txt")!.data)).toBe("текст");
  });

  it("I2: имя в CP866 без UTF-8-флага читается по-русски; UTF-8-имя — как есть", () => {
    const names = unzip(zipCp866({ "Лекция 1.md": MD, "папка/Отчёт №2.txt": "x" })).map((f) => f.name).sort();
    expect(names).toEqual(["Лекция 1.md", "папка/Отчёт №2.txt"]);
    expect(unzip(zip({ "Семафоры.md": MD }))[0].name).toBe("Семафоры.md");
  });

  it("I2: имя без флага, но валидное UTF-8, читается как UTF-8", () => {
    // байты UTF-8 вместо CP866: подменяем ASCII-заглушку той же длины, флаг UTF-8 не ставится
    const real = u8("Лекция__.md");
    const ph = u8("x".padEnd(real.length - 3, "_") + ".md");
    const z = zip({ [new TextDecoder().decode(ph)]: MD });
    for (let at = 0; at <= z.length - ph.length; at++) if (ph.every((b, k) => z[at + k] === b)) z.set(real, at);
    expect(unzip(z)[0].name).toBe("Лекция__.md");
  });

  it("I3: служебные файлы пропускаются", () => {
    const z = zip({ "__MACOSX/a/b.md": "x", "thumbs.db": "x", "__MACOSX/._a.md": "x", "a/.DS_Store": "x", "Thumbs.db": "x", "._b.md": "x", "~$док.docx": "x", "ok.md": MD });
    expect(unzip(z).map((f) => f.name)).toEqual(["ok.md"]);
  });

  it("I4: не zip и битый zip → понятная ошибка", () => {
    expect(() => unzip(u8("просто текст"))).toThrow(/zip/i);
    expect(() => unzip(u8("просто текст"))).toThrow(/[а-я]/);
    const z = zip({ "a.md": MD });
    expect(() => unzip(z.slice(0, z.length - 30))).toThrow(/zip/i);
  });

  it("I4: распакованный размер больше лимита → ошибка до распаковки", () => {
    const big = zip({ "a.txt": "я".repeat(200_000) });
    expect(() => unzip(big, { maxBytes: 100_000 })).toThrow(/размер|лимит/i);
    expect(unzip(big, { maxBytes: 1_000_000 })).toHaveLength(1);
  });
});

describe("extract", () => {
  it("I5: .md с заголовками → единицы parseDocument, frontmatter → meta", async () => {
    const r = await extract("л.md", u8(MD));
    expect(r.units.map((u) => u.label)).toEqual(["Слайд 1", "Слайд 2"]);
    expect(r.units[1].text).toBe("Процессы и потоки");
    expect(r.meta.title).toBe("Лекция 1");
  });

  it("I6: .md/.txt без заголовков → один «Раздел: имя»; пустой → ошибка", async () => {
    const r = await extract("папка/Конспект по ОС.txt", u8("строка 1\nстрока 2"));
    expect(r.units).toEqual([{ kind: "section", no: 1, label: "Раздел: Конспект по ОС", text: "строка 1\nстрока 2" }]);
    const m = await extract("заметки.md", u8("просто текст без заголовков"));
    expect(m.units.map((u) => u.label)).toEqual(["Раздел: заметки"]);
    await expect(extract("пусто.txt", u8("  \n\n "))).rejects.toThrow(/пуст/);
    await expect(extract("пусто.md", u8("---\ntitle: x\n---\n"))).rejects.toThrow(/пуст/);
  });

  it("I7: .pdf → «Страница N» по номеру в файле, пустые страницы пропущены", async () => {
    const r = await extract("m.pdf", pdf(["First page text", "", "Third page here"]));
    expect(r.units.map((u) => [u.kind, u.no, u.label])).toEqual([
      ["page", 1, "Страница 1"],
      ["page", 3, "Страница 3"],
    ]);
    expect(r.units[0].text).toContain("First page text");
    expect(r.units[1].text).toContain("Third page here");
  });

  it("I7: PDF без текста → ошибка «нет текстового слоя»; битый PDF → ошибка", async () => {
    await expect(extract("скан.pdf", pdf(["", ""]))).rejects.toThrow(/текстового слоя/);
    await expect(extract("битый.pdf", u8("%PDF-1.4 garbage"))).rejects.toThrow();
  });

  it("I8: .docx → разделы по заголовкам 1–2 уровня, текст до заголовка — Вступление", async () => {
    const r = await extract(
      "отчёт.docx",
      docx([[null, "Титульный лист"], ["Heading1", "Введение"], [null, "Цель работы"], ["Heading2", "Ход работы"], [null, "Шаг 1"], [null, "Шаг 2"]]),
    );
    expect(r.units.map((u) => u.label)).toEqual(["Раздел: Вступление", "Раздел: Введение", "Раздел: Ход работы"]);
    expect(r.units.map((u) => u.no)).toEqual([1, 2, 3]);
    expect(r.units[2].text).toBe("Шаг 1\n\nШаг 2");
  });

  it("I8: .docx без заголовков → одна единица", async () => {
    const r = await extract("Методичка.docx", docx([[null, "абзац 1"], [null, "абзац 2"]]));
    expect(r.units).toHaveLength(1);
    expect(r.units[0].text).toBe("абзац 1\n\nабзац 2");
  });

  it("I9: неподдерживаемый формат → ошибка «формат не поддерживается»; регистр расширения не важен", async () => {
    for (const n of ["a.pptx", "b.png", "c.exe", "без_расширения"])
      await expect(extract(n, u8("x"))).rejects.toThrow("формат не поддерживается");
    const r = await extract("A.PDF", pdf(["Upper case ext"]));
    expect(r.units[0].text).toContain("Upper case ext");
    expect((await extract("B.MD", u8(MD))).units).toHaveLength(2);
  });

  it("I10: BOM и CRLF убираются; .txt в Windows-1251 читается по-русски", async () => {
    const r = await extract("a.md", u8("\uFEFF## Страница 1\r\nтекст\r\nещё\r\n"));
    expect(r.units[0]).toMatchObject({ label: "Страница 1", text: "текст\nещё" });
    const cp1251 = Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // «Привет»
    expect((await extract("t.txt", cp1251)).units[0].text).toBe("Привет");
  });
});

describe("ingestFiles", () => {
  const f = (name: string, data: Uint8Array | string) => ({ name, data: typeof data === "string" ? u8(data) : data });

  it("I11: sha256 от байтов файла; дубль в загрузке и дубль из датасета пропускаются", async () => {
    const a = u8(MD);
    const r = await ingestFiles([f("a.md", a), f("копия a.md", a), f("b.txt", "другой текст")], { existing: new Set([sha(u8("другой текст"))]) });
    expect(r.docs.map((d) => [d.filename, d.sha256])).toEqual([["a.md", sha(a)]]);
    expect(r.skipped).toEqual([
      { name: "b.txt", reason: "дубль" },
      { name: "копия a.md", reason: "дубль" },
    ]);
  });

  it("I12: zip разворачивается, zip в zip — нет", async () => {
    const inner = zip({ "x.md": MD });
    const r = await ingestFiles([f("пак.zip", zip({ "в/лекция.md": MD, "в/вложенный.zip": inner, "в/c.txt": "текст c" }))]);
    expect(r.docs.map((d) => d.filename).sort()).toEqual(["c.txt", "лекция.md"]);
    expect(r.skipped).toEqual([{ name: "пак.zip/в/вложенный.zip", reason: "вложенный архив" }]);
  });

  it("I13: filename из original_file без префикса-хэша, кракозябры чинятся", async () => {
    const md = (orig: string) => `---\noriginal_file: "${orig}"\n---\n## Страница 1\nтекст ${orig}\n`;
    const r = await ingestFiles([
      f("1.md", md("C:/Загрузки/0123456789abcdef_Лекция 3.pdf")),
      f("2.md", md("x/ïáí«αáΓ«α¡á∩.docx")),
      f("3.md", "## Страница 1\nбез frontmatter"),
    ]);
    expect(r.docs.map((d) => d.filename).sort()).toEqual(["3.md", "Лекция 3.pdf", "Лабораторная.docx"].sort());
  });

  it("I14: markdown разбирается обратно в те же единицы", async () => {
    const r = await ingestFiles([
      f("o.docx", docx([[null, "вступ"], ["Heading1", "Глава"], [null, "текст главы"]])),
      f("p.pdf", pdf(["Page one", "Page two"])),
      f("t.txt", "просто текст"),
    ]);
    for (const d of r.docs) {
      const back = parseDocument(d.markdown).units.map((u) => [u.label, u.text]);
      expect(back).toEqual(d.units.map((u) => [u.label, u.text]));
    }
    expect(r.docs).toHaveLength(3);
  });

  it("I15: ошибка одного файла не роняет остальные", async () => {
    const r = await ingestFiles([f("пусто.txt", " "), f("битый.zip", "не zip"), f("ok.md", MD), f("скан.pdf", pdf([""]))]);
    expect(r.docs.map((d) => d.filename)).toEqual(["ok.md"]);
    expect(r.skipped.map((s) => s.name).sort()).toEqual(["битый.zip", "пусто.txt", "скан.pdf"]);
    expect(r.skipped.every((s) => s.reason.length > 3)).toBe(true);
  });

  it("I16: больше maxFiles → лишние пропущены с причиной «лимит», порядок по имени", async () => {
    const files = ["в.txt", "а.txt", "г.txt", "б.txt"].map((n) => f(n, `текст ${n}`));
    const r = await ingestFiles(files, { maxFiles: 2 });
    expect(r.docs.map((d) => d.filename)).toEqual(["а.txt", "б.txt"]);
    expect(r.skipped).toEqual([
      { name: "в.txt", reason: "лимит" },
      { name: "г.txt", reason: "лимит" },
    ]);
  });

  it("I21: piiFlag — по превью, имени файла и пути; имя файла маскируется в preview-заголовке, не в filename", async () => {
    const clean = await ingestFiles([f("Лекция 2.md", "## Слайд 1\nСемафоры")]);
    expect(clean.docs[0].piiFlag).toBe(false);
    const byName = await ingestFiles([f("лаб3Иванов.txt", "чистый текст")]);
    expect(byName.docs[0].piiFlag).toBe(true);
    expect(byName.docs[0].maskedFilename).toBe("лаб3[ФИО].txt");
    const byText = await ingestFiles([f("x.txt", "Выполнил: Петров Пётр Петрович")]);
    expect(byText.docs[0].piiFlag).toBe(true);
    expect(byText.docs[0].preview).not.toContain("Петров");
  });
});

describe("makePreview", () => {
  const units = [
    { kind: "page" as const, no: 1, label: "Страница 1", text: "Выполнил:\t\tстудент гр. 4307\n\n\n\nИванов Иван Иванович<br>Проверил: Сидоров С.С." },
    { kind: "page" as const, no: 2, label: "Страница 2", text: "Содержание ".repeat(50) },
  ];

  it("I17: не длиннее max, пробелы сжаты, <br> → пробел, ПДн скрыты, преподаватель из keepNames остаётся", () => {
    const p = makePreview(units, 300, ["Сидоров Сергей Сергеевич"]);
    expect(p.text.length).toBeLessThanOrEqual(300);
    expect(p.text).not.toMatch(/\t|\n\n\n|<br/);
    expect(p.text).not.toContain("Иванов");
    expect(p.text).toContain("Сидоров С.С.");
    expect(p.piiFlag).toBe(true);
    expect(makePreview(units, 0).text).toBe("");
  });
});

describe("дополнения после критика", () => {
  const f = (name: string, data: Uint8Array | string) => ({ name, data: typeof data === "string" ? u8(data) : data });
  const keep = ["Бикмуллина Ильсияр Ильдаровна"];

  it("I17: маскирование до нарезки — обрезанное ФИО не просачивается", () => {
    const units = [{ kind: "page" as const, no: 1, label: "Страница 1", text: "Выполнил: Иванов Иван Иванович" }];
    for (let max = 1; max <= 60; max++) expect(makePreview(units, max).text).not.toMatch(/Иван/);
  });

  it("I17: сжатие пробелов до нарезки; пустые единицы", () => {
    const units = [{ kind: "page" as const, no: 1, label: "Страница 1", text: "\n\n\t\t".repeat(200) + "Важный текст" }];
    expect(makePreview(units, 60).text).toContain("Важный");
    expect(makePreview([], 100)).toEqual({ text: "", piiFlag: false });
  });

  it("I21: фамилия в пути внутри zip ставит флаг; filename исходный, maskedFilename скрыт", async () => {
    const r = await ingestFiles([f("пак.zip", zip({ "Иванов/лаб.txt": "чистый текст" }))]);
    expect(r.docs[0].piiFlag).toBe(true);
    expect(r.docs[0].maskedPath).toContain("[ФИО]");
    const n = await ingestFiles([f("лаб3Иванов.txt", "чистый текст")]);
    expect(n.docs[0].filename).toBe("лаб3Иванов.txt");
    expect(n.docs[0].maskedFilename).toBe("лаб3[ФИО].txt");
  });

  it("I17/I18: преподаватель из keepNames в тексте не маскируется и флаг не ставит", async () => {
    const r = await ingestFiles([f("a.txt", "Ильсияр Ильдаровна Бикмуллина, доцент")], { keepNames: keep });
    expect(r.docs[0].piiFlag).toBe(false);
    expect(r.docs[0].preview).toContain("Бикмуллина");
  });

  it("I22: текст единиц и markdown замаскированы", async () => {
    const r = await ingestFiles([f("t.md", "## Страница 1\nВыполнил: Петров Пётр Петрович, тел. +7 912 345-67-89")]);
    expect(r.docs[0].markdown).not.toMatch(/Петров|912/);
    expect(r.docs[0].units[0].text).toContain("[ФИО]");
    expect(r.docs[0].units[0].text).toContain("[телефон]");
  });

  it("I14: строка «## Слайд 9» внутри текста не создаёт единицу; kind и no совпадают", async () => {
    const r = await ingestFiles([f("o.docx", docx([[null, "вступ"], ["Heading1", "Глава"], [null, "## Слайд 9"], [null, "после"]]))]);
    const d = r.docs[0];
    const back = parseDocument(d.markdown).units;
    expect(back.map((u) => [u.kind, u.no, u.label, u.text])).toEqual(d.units.map((u) => [u.kind, u.no, u.label, u.text]));
    expect(back).toHaveLength(2);
  });

  it("I12: docx внутри zip — документ, не архив; .ZIP в верхнем регистре разворачивается", async () => {
    const r = await ingestFiles([f("ПАК.ZIP", zip({ "в/отчёт.docx": docx([[null, "текст отчёта"]]) }))]);
    expect(r.docs.map((d) => d.filename)).toEqual(["отчёт.docx"]);
    expect(r.skipped).toEqual([]);
  });

  it("I13: обратные слэши в original_file и «ЛР_1» без ложного срезания", async () => {
    const r = await ingestFiles([f("1.md", '---\noriginal_file: "C:\\\\Загрузки\\\\ЛР_1 Отчёт.pdf"\n---\n## Страница 1\nтекст')]);
    expect(r.docs[0].filename).toBe("ЛР_1 Отчёт.pdf");
  });

  it("I16: дубли и ошибки не занимают место в лимите; пустой список", async () => {
    const r = await ingestFiles([f("а.txt", "один"), f("б.txt", "один"), f("в.txt", " "), f("г.txt", "два"), f("д.txt", "три")], { maxFiles: 2 });
    expect(r.docs.map((d) => d.filename)).toEqual(["а.txt", "г.txt"]);
    expect(r.skipped.find((s) => s.name === "д.txt")?.reason).toBe("лимит");
    expect(await ingestFiles([])).toEqual({ docs: [], skipped: [] });
  });

  it("I10: .txt с BOM и CRLF", async () => {
    expect((await extract("t.txt", u8("\uFEFFстрока\r\nдва"))).units[0].text).toBe("строка\nдва");
  });

  it("I8: стиль по имени (id «1»), Heading3 не режет, подпись без заголовков — имя файла, битый docx", async () => {
    const ru = docx([[null, "вступ"], ["1", "Глава по-русски"], [null, "текст"], ["Heading3", "Подзаголовок"], [null, "ещё"]]);
    const r = await extract("ru.docx", ru);
    expect(r.units.map((u) => u.label)).toEqual(["Раздел: Вступление", "Раздел: Глава по-русски"]);
    expect(r.units[1].text).toContain("Подзаголовок");
    expect((await extract("папка/Методичка.docx", docx([[null, "абзац"]]))).units[0].label).toBe("Раздел: Методичка");
    await expect(extract("битый.docx", u8("PK не docx"))).rejects.toThrow(/DOCX/);
  });
});
