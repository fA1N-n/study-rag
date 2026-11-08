// Байты файла → единицы «Страница N / Слайд N / Раздел: …». Форматы: md, txt, pdf (unpdf), docx (mammoth).
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { parseDocument, type Unit } from "../labeling/units";

export type Extracted = { units: Unit[]; meta: Record<string, string | number> };

const utf8 = new TextDecoder("utf-8");
const strict = new TextDecoder("utf-8", { fatal: true });
const cp1251 = new TextDecoder("windows-1251");
const HEADING = /^## (?:Страница \d+|Слайд \d+|Раздел: .+)\s*$/m;
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

/** UTF-8 (без BOM); если битых символов больше 1 % — Windows-1251; переводы строк → \n. */
export function decodeText(data: Uint8Array): string {
  let s: string;
  try {
    s = strict.decode(data); // валидный UTF-8, даже если внутри уже есть символ «�» из исходника
  } catch {
    s = utf8.decode(data);
    const bad = s.split("�").length - 1;
    if (bad / Math.max(1, s.length) > 0.01) s = cp1251.decode(data);
  }
  return s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export const SUPPORTED = new Set(["md", "markdown", "txt", "pdf", "docx"]);
export const stem = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, "");
export const ext = (name: string) => /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

function nonEmpty(units: Unit[]): Unit[] {
  if (!units.some((u) => u.text.trim())) throw new Error("пустой документ");
  return units;
}

function fromText(name: string, raw: string, isMd: boolean): Extracted {
  // frontmatter — только в .md и только из строк «ключ: значение»; иначе «---» — часть текста
  const fm = FRONTMATTER.exec(raw);
  const realFm = isMd && fm && fm[1].split("\n").every((l) => !l.trim() || /^[A-Za-z_]\w*:\s/.test(l));
  const text = realFm ? raw : `\n${raw}`; // ведущий перевод строки отключает разбор frontmatter
  const { meta, units } = parseDocument(text);
  if (HEADING.test(text)) return { meta, units: nonEmpty(units) };
  const body = units.map((u) => u.text).join("\n\n").trim();
  return { meta, units: nonEmpty([{ kind: "section", no: 1, label: `Раздел: ${stem(name)}`, text: body }]) };
}

async function fromPdf(data: Uint8Array): Promise<Extracted> {
  let pages: string[];
  try {
    pages = (await extractText(new Uint8Array(data), { mergePages: false })).text;
  } catch (e) {
    throw new Error(`не удалось прочитать PDF: ${(e as Error).message}`);
  }
  const units: Unit[] = pages
    .map((t, i) => ({ kind: "page" as const, no: i + 1, label: `Страница ${i + 1}`, text: t.trim() }))
    .filter((u) => u.text);
  if (!units.length) throw new Error("нет текстового слоя (скан?)");
  return { meta: {}, units };
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const htmlText = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|tr|h\d)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENT[e])
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function fromDocx(name: string, data: Uint8Array): Promise<Extracted> {
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(data) })).value;
  } catch (e) {
    throw new Error(`не удалось прочитать DOCX: ${(e as Error).message}`);
  }
  // режем по заголовкам 1–2 уровня; заголовок → подпись раздела
  const parts = html.split(/(<h[12][^>]*>[\s\S]*?<\/h[12]>)/i);
  const units: Unit[] = [];
  let label = "Раздел: Вступление";
  for (const p of parts) {
    const h = /^<h[12][^>]*>([\s\S]*?)<\/h[12]>$/i.exec(p);
    if (h) {
      label = `Раздел: ${htmlText(h[1]).replace(/\s+/g, " ") || "Без названия"}`;
      units.push({ kind: "section", no: units.length + 1, label, text: "" });
      continue;
    }
    const text = htmlText(p);
    if (!text) continue;
    const last = units.at(-1);
    if (last) last.text = last.text ? `${last.text}\n\n${text}` : text;
    else units.push({ kind: "section", no: 1, label, text });
  }
  // без заголовков — один раздел с именем файла, как у txt
  if (units.length === 1 && units[0].label === "Раздел: Вступление") units[0].label = `Раздел: ${stem(name)}`;
  return { meta: {}, units: nonEmpty(units) };
}

export async function extract(name: string, data: Uint8Array): Promise<Extracted> {
  switch (ext(name)) {
    case "md":
    case "markdown":
      return fromText(name, decodeText(data), true);
    case "txt":
      return fromText(name, decodeText(data), false);
    case "pdf":
      return fromPdf(data);
    case "docx":
      return fromDocx(name, data);
    default:
      throw new Error("формат не поддерживается");
  }
}
