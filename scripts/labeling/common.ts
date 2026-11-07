// Общее для скриптов офлайн-разметки: пути, чтение subjects.csv, обход output/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RAW = "data/raw_2026-11-07";
export const OUT = "data/labeling";

export type SubjectRow = { semester: number; subject: string; teacher: string };

export function readSubjects(): SubjectRow[] {
  const lines = readFileSync(join(RAW, "subjects.csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  return lines.slice(1).map((l) => {
    const [semester, subject, , teacher] = l.split(",");
    return { semester: Number(semester), subject: subject.trim(), teacher: (teacher ?? "").trim() };
  });
}

export function listDocs(dir = join(RAW, "output")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listDocs(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : [],
  );
}

// Имена из zip в CP866, прочитанные как CP437 («ïáí«αáΓ«α¡á∩» → «Лаборатория»). «����» не восстановить.
const CP437 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const CP437_BYTE = new Map([...CP437].map((c, i) => [c, 0x80 + i]));
const cp866 = new TextDecoder("ibm866");

export function fixMojibake(s: string): string {
  if (/[А-Яа-яЁё]/.test(s) || [...s].filter((c) => CP437_BYTE.has(c)).length < 3) return s;
  const bytes = [...s].map((c) => CP437_BYTE.get(c) ?? (c.charCodeAt(0) < 0x80 ? c.charCodeAt(0) : null));
  if (bytes.some((b) => b === null)) return s;
  return cp866.decode(new Uint8Array(bytes as number[]));
}
