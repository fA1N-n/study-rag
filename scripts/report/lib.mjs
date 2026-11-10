// Общие помощники для отчёта .docx в формате КАИ (образец — отчёт SkillPath AI):
// Times New Roman 14, интервал 1,5, отступ 1,25 см, поля 3 / 1,5 / 2 / 2 см.
import fs from "node:fs";
import {
  AlignmentType, BorderStyle, HeadingLevel, ImageRun, LevelFormat, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

export const FONT = "Times New Roman";
export const TEXT_W = 9355; // 16,5 см в DXA
const CM = 567;

let tableNo = 0;
let figNo = 0;
export const nextTable = () => ++tableNo;
export const resetCounters = () => { tableNo = 0; figNo = 0; };
export const nextFig = () => ++figNo;

/** Строка с **жирным** и `моно` внутри. */
export function runs(text, base = {}) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
    if (part.startsWith("**")) return new TextRun({ ...base, text: part.slice(2, -2), bold: true });
    if (part.startsWith("`")) return new TextRun({ ...base, text: part.slice(1, -1), font: "Courier New", size: (base.size ?? 28) - 4 });
    return new TextRun({ ...base, text: part });
  });
}

export const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
export const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
export const P = (t) => new Paragraph({ children: runs(t) });
export const LI = (t) => new Paragraph({ numbering: { reference: "dash", level: 0 }, children: runs(t) });
export const NUM = (t, ref = "num") => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t) });
export const CODE = (lines) => lines.map((l) => new Paragraph({
  indent: { firstLine: 0 }, spacing: { line: 240, before: 0, after: 0 },
  children: [new TextRun({ text: l || " ", font: "Courier New", size: 20 })],
}));
export const caption = (t) => new Paragraph({
  alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, spacing: { before: 60, after: 120 }, keepNext: true,
  children: [new TextRun({ text: t, size: 24 })],
});

/** Таблица с подписью «Таблица N. …» над ней. widths — доли, сумма 1. */
export function table(title, head, rows, widths) {
  const n = nextTable();
  const cols = widths.map((w) => Math.round(w * TEXT_W));
  cols[cols.length - 1] = TEXT_W - cols.slice(0, -1).reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (t, i, header) => new TableCell({
    width: { size: cols[i], type: WidthType.DXA }, borders,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: "E7E6E6" } : undefined,
    children: String(t).split("\n").map((line) => new Paragraph({
      indent: { firstLine: 0 }, alignment: AlignmentType.LEFT, spacing: { line: 240, before: 0, after: 0 },
      children: runs(line, { size: 24, bold: header || undefined }),
    })),
  });
  return [
    new Paragraph({ alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: `Таблица ${n}. ${title}`, size: 24 })] }),
    new Table({
      width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: cols,
      rows: [
        new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
      ],
    }),
    new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
  ];
}

function dims(buf) {
  if (buf[0] === 0x89) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  for (let i = 2; i < buf.length;) {
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("не JPEG/PNG");
}

/** Рисунок по ширине в см (не выше maxH см) с подписью «Рис. N. …» под ним. */
export function figure(path, title, widthCm = 16, maxHCm = 21) {
  const n = nextFig();
  const data = fs.readFileSync(path);
  const [w, h] = dims(data);
  let wc = widthCm, hc = (widthCm * h) / w;
  if (hc > maxHCm) { hc = maxHCm; wc = (maxHCm * w) / h; }
  const px = (cm) => Math.round((cm / 2.54) * 96);
  return {
    n,
    items: [
      new Paragraph({ alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, keepNext: true, spacing: { before: 120, after: 0, line: 240 },
        children: [new ImageRun({ type: path.endsWith(".png") ? "png" : "jpg", data, transformation: { width: px(wc), height: px(hc) } })] }),
      caption(`Рис. ${n}. ${title}`),
    ],
  };
}

export const styles = {
  paragraphStyles: ["TOC1", "TOC2"].map((id, i) => ({ id, name: `toc ${i + 1}`, basedOn: "Normal", next: "Normal", quickFormat: true, paragraph: { spacing: { line: 276, before: 0, after: 40 }, indent: { left: i * 400, firstLine: 0 } } })),
  default: {
    document: { run: { font: FONT, size: 28 }, paragraph: { spacing: { line: 360, before: 0, after: 0 }, indent: { firstLine: Math.round(1.25 * CM) }, alignment: AlignmentType.JUSTIFIED } },
    heading1: { run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240, line: 360 }, indent: { firstLine: 0 }, keepNext: true, pageBreakBefore: true } },
    heading2: { run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 120, line: 360 }, indent: { firstLine: Math.round(1.25 * CM) }, keepNext: true } },
  },
};

export const numbering = {
  config: [
    { reference: "dash", levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: Math.round(1.25 * CM) + 360, hanging: 360 } } } }] },
    ...["num", "num2", "num3", "num4"].map((reference) => ({
      reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: Math.round(1.25 * CM) + 360, hanging: 360 } } } }],
    })),
  ],
};

export const page = { size: { width: 11906, height: 16838 }, margin: { left: 3 * CM, right: Math.round(1.5 * CM), top: 2 * CM, bottom: 2 * CM } };
