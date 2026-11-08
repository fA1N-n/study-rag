// Синтетические файлы для тестов ядра загрузки: zip (в т.ч. с именами CP866), PDF, DOCX. Не материалы КИ.
import { strToU8, zipSync } from "fflate";

const enc = new TextEncoder();
export const u8 = (s: string) => enc.encode(s);

/** zip с UTF-8-именами (fflate ставит флаг сам, если имя не ASCII). */
export const zip = (files: Record<string, Uint8Array | string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])));

const CP866 = (() => {
  const d = new TextDecoder("ibm866");
  const m = new Map<string, number>();
  for (let b = 0x80; b < 0x100; b++) m.set(d.decode(new Uint8Array([b])), b);
  return m;
})();
const toCp866 = (s: string) => Uint8Array.from([...s].map((c) => CP866.get(c) ?? c.charCodeAt(0)));

/** zip, где имена записаны в CP866 без UTF-8-флага (как у старых архиваторов Windows). */
export function zipCp866(files: Record<string, string>): Uint8Array {
  const names = Object.keys(files);
  const placeholders = names.map((n, i) => `${String(i).padStart(3, "0")}${"_".repeat(toCp866(n).length - 3)}`);
  const out = zip(Object.fromEntries(placeholders.map((p, i) => [p, files[names[i]]])));
  for (let i = 0; i < names.length; i++) {
    const ph = u8(placeholders[i]);
    const real = toCp866(names[i]);
    for (let at = 0; at <= out.length - ph.length; at++) {
      if (ph.every((b, k) => out[at + k] === b)) {
        out.set(real, at);
        // флаги записи: локальный заголовок (sig 504b0304, флаг +6) и центральный каталог (504b0102, флаг +8)
        for (const [sig, off, nameOff] of [[0x04034b50, 6, 30], [0x02014b50, 8, 46]] as const) {
          const h = at - nameOff;
          if (h >= 0 && new DataView(out.buffer, out.byteOffset).getUint32(h, true) === sig) out[h + off + 1] &= ~0x08;
        }
      }
    }
  }
  return out;
}

/** Минимальный PDF: по странице на строку (ASCII), пустая строка — пустая страница. */
export function pdf(pages: string[]): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((t, i) => {
    const s = t ? `BT /F1 12 Tf 72 720 Td (${t}) Tj ET` : "";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return u8(out);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Минимальный DOCX: абзацы [стиль | null, текст]; стили Heading1/2/3 и «1» (русский Word, имя heading 1) объявлены. */
export function docx(paras: [string | null, string][]): Uint8Array {
  const body = paras
    .map(([s, t]) => `<w:p>${s ? `<w:pPr><w:pStyle w:val="${s}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
    .join("");
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/></w:style></w:styles>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
  });
}
