// Разбор нормализованного .md (формат docs/data-collection.md) на единицы «Страница/Слайд/Раздел».

export type Unit = { kind: "page" | "slide" | "section"; no: number; label: string; text: string };
export type ParsedDoc = { meta: Record<string, string | number>; units: Unit[] };

const HEAD = /^## (?:(Страница|Слайд) (\d+)|Раздел: (.+))\s*$/;

function parseMeta(block: string): Record<string, string | number> {
  const meta: Record<string, string | number> = {};
  for (const line of block.split("\n")) {
    const m = /^([A-Za-z_]\w*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const raw = m[2].trim();
    if (/^".*"$/.test(raw)) meta[m[1]] = raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
    else if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw)) meta[m[1]] = Number(raw);
    else meta[m[1]] = raw;
  }
  return meta;
}

export function parseDocument(md: string): ParsedDoc {
  let body = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let meta: Record<string, string | number> = {};
  const fm = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/.exec(body);
  if (fm) {
    meta = parseMeta(fm[1] ?? "");
    body = body.slice(fm[0].length);
  }

  const units: Unit[] = [];
  let cur: { kind: Unit["kind"]; no: number | null; label: string; lines: string[] } = {
    kind: "section", no: null, label: "Раздел: Вступление", lines: [],
  };
  let intro = true;
  const flush = () => {
    const text = cur.lines.join("\n").trim();
    if (intro && !text) return;
    units.push({ kind: cur.kind, no: cur.no ?? units.length + 1, label: cur.label, text });
  };

  for (const line of body.split("\n")) {
    const h = HEAD.exec(line);
    if (!h) {
      cur.lines.push(line);
      continue;
    }
    flush();
    intro = false;
    cur = h[3] !== undefined
      ? { kind: "section", no: null, label: `Раздел: ${h[3].trim()}`, lines: [] }
      : { kind: h[1] === "Слайд" ? "slide" : "page", no: Number(h[2]), label: `${h[1]} ${h[2]}`, lines: [] };
  }
  flush();
  return { meta, units };
}

/** Начало документа для агентов: «подпись\nтекст» по порядку, не длиннее max. */
export function preview(units: Unit[], max: number): string {
  return units.map((u) => `${u.label}\n${u.text}`).join("\n\n").slice(0, Math.max(0, max));
}

/** Грубая оценка токенов для русского текста: ~3 символа на токен (с запасом). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
