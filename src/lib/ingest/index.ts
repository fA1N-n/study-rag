// Ядро загрузки: файлы (в т.ч. zip) → нормализованные документы. Критерии — docs/ingest-core.md.
import { createHash } from "node:crypto";
import { maskFilename, maskPath, maskPii } from "../labeling/pii";
import { preview, type Unit } from "../labeling/units";
import { ext, extract, SUPPORTED } from "./extract";
import { unzip, type RawFile } from "./unzip";

export type IngestedDoc = {
  filename: string;
  maskedFilename: string;
  maskedPath: string;
  sha256: string;
  units: Unit[];
  markdown: string;
  preview: string;
  piiFlag: boolean;
  meta: Record<string, string | number>;
};
export type Skipped = { name: string; reason: string };
export type IngestOptions = { existing?: Set<string>; keepNames?: string[]; maxFiles?: number; previewChars?: number };

// CP866, прочитанный как CP437 (сборщик): «ïáí«αáΓ«α¡á∩» → «Лабораторная»
const CP437 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
// последний символ таблицы (0xFF, неразрывный пробел) в исходнике стал обычным пробелом — ASCII в карту не берём
const CP437_BYTE = new Map([...CP437].map((c, i) => [c, 0x80 + i] as const).filter(([c]) => c.charCodeAt(0) >= 0x80));
const cp866 = new TextDecoder("ibm866");

/** Кракозябры чинятся по словам: рядом может стоять уже нормальная кириллица («Ксения/ïáí« Ивановой»). */
export function fixMojibake(s: string): string {
  const parts = s.split(/([\\/\s_])/);
  const any = parts.some((p) => fixPart(p, 3) !== p);
  // если в строке есть явные кракозябры, чиним и короткие слова («¡á» → «на»)
  return parts.map((p) => fixPart(p, any ? 1 : 3)).join("");
}

function fixPart(s: string, minOdd: number): string {
  const letters = [...s].filter((c) => /\p{L}/u.test(c));
  const odd = [...s].filter((c) => CP437_BYTE.has(c)).length;
  // кириллица в CP437 — почти сплошь не-ASCII; латиница с диакритикой (Café) — редкие вкрапления
  if (/[А-Яа-яЁё]/.test(s) || odd < minOdd || odd < letters.length * 0.5) return s;
  const bytes = [...s].map((c) => CP437_BYTE.get(c) ?? (c.charCodeAt(0) < 0x80 ? c.charCodeAt(0) : null));
  if (bytes.some((b) => b === null)) return s;
  return cp866.decode(new Uint8Array(bytes as number[]));
}

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Единицы → .md в формате docs/data-collection.md (без frontmatter). */
export function toMarkdown(units: Unit[]): string {
  return units.map((u) => `## ${u.label}\n${u.text}`).join("\n\n") + "\n";
}

/** Превью для агентов: пробелы сжаты, <br> → пробел, ПДн скрыты. */
export function makePreview(units: Unit[], max: number, keepNames: string[] = []): { text: string; piiFlag: boolean } {
  let piiFlag = false;
  // сначала сжать и замаскировать каждую единицу целиком, потом резать: обрезок ФИО не узнать
  const dense = units.map((u) => {
    const m = maskPii(u.text.replace(/<br\s*\/?>/gi, " ").replace(/[ \t ]+/g, " ").replace(/ *\n\s*/g, "\n").trim(), { keepNames });
    piiFlag ||= m.piiFlag;
    return { ...u, text: m.text };
  });
  return { text: preview(dense, Math.max(0, max)), piiFlag };
}

// строка-заголовок единицы внутри текста сломала бы обратный разбор — понижаем до ###
const INNER_HEAD = /^## (?=(?:Страница|Слайд) \d+|Раздел: )/gm;

export async function ingestFiles(files: RawFile[], opts: IngestOptions = {}): Promise<{ docs: IngestedDoc[]; skipped: Skipped[] }> {
  const { keepNames = [], maxFiles = Infinity, previewChars = 3000 } = opts;
  const seen = new Set(opts.existing ?? []);
  const skipped: Skipped[] = [];

  // разворачиваем zip верхнего уровня; вложенные архивы — пропуск
  const flat: RawFile[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      flat.push(f);
      continue;
    }
    try {
      for (const inner of unzip(f.data)) {
        const name = `${f.name}/${inner.name}`;
        if (/\.zip$/i.test(inner.name)) skipped.push({ name, reason: "вложенный архив" });
        else flat.push({ name, data: inner.data });
      }
    } catch (e) {
      skipped.push({ name: f.name, reason: (e as Error).message });
    }
  }
  flat.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const docs: IngestedDoc[] = [];
  for (const f of flat) {
    const shown = f.name.includes(".zip/") ? base(f.name) : f.name;
    const hash = sha256(f.data);
    if (seen.has(hash)) {
      skipped.push({ name: shown, reason: "дубль" });
      continue;
    }
    if (!SUPPORTED.has(ext(f.name))) {
      skipped.push({ name: shown, reason: "формат не поддерживается" });
      continue;
    }
    if (docs.length >= maxFiles) {
      skipped.push({ name: shown, reason: "лимит" });
      continue;
    }
    try {
      const ex = await extract(f.name, f.data);
      let textPii = false;
      const units = ex.units.map((u) => {
        const m = maskPii(u.text.replace(INNER_HEAD, "### "), { keepNames });
        // подпись раздела — это имя файла или заголовок: маскируем и как текст, и как имя файла
        let label = u.label;
        if (u.kind === "section") {
          const head = maskPii(label.slice("Раздел: ".length), { keepNames });
          const asName = maskFilename(head.text, { keepNames });
          label = `Раздел: ${asName.text}`;
          textPii ||= head.piiFlag || asName.masked;
        }
        textPii ||= m.piiFlag;
        return { ...u, label, text: m.text.trim() };
      });
      const meta = ex.meta;
      seen.add(hash);
      const orig = typeof meta.original_file === "string" ? meta.original_file : "";
      const filename = fixMojibake(orig ? base(orig).replace(/^[0-9a-f]{16}_/, "") : base(f.name));
      const path = fixMojibake(typeof meta.source_path === "string" ? meta.source_path : f.name);
      const name = maskFilename(filename, { keepNames });
      const where = maskPath(path, { keepNames });
      const pv = makePreview(units, previewChars, keepNames);
      docs.push({
        filename,
        maskedFilename: name.text,
        maskedPath: where.text,
        sha256: hash,
        units,
        markdown: toMarkdown(units),
        preview: pv.text,
        piiFlag: textPii || pv.piiFlag || name.masked || where.masked,
        meta,
      });
    } catch (e) {
      skipped.push({ name: shown, reason: (e as Error).message });
    }
  }
  skipped.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { docs, skipped };
}
