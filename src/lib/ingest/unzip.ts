// Распаковка zip из браузера/Storage. Имена без UTF-8-флага: сначала пробуем UTF-8, иначе CP866 (архиватор Windows).
import { unzipSync } from "fflate";

export type RawFile = { name: string; data: Uint8Array };

const utf8 = new TextDecoder("utf-8", { fatal: true });
const cp866 = new TextDecoder("ibm866");
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._|~\$)/i;

/** fflate отдаёт имя без UTF-8-флага как latin1: код символа = байт. */
function fixName(name: string): string {
  // ponytail: флаг UTF-8 не виден снаружи fflate; имя с флагом из одних латинских символов > 0x7f (café) перекодируется неверно
  if ([...name].some((c) => c.charCodeAt(0) > 0xff)) return name; // уже Unicode (флаг стоял)
  if (!/[\x80-\xff]/.test(name)) return name;
  const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
  try {
    const s = utf8.decode(bytes);
    // CP866-байты «р…я»+«а…п» бывают валидным UTF-8 («ᠯ») — верим UTF-8, только если вышли латиница/кириллица
    if (/^[\x00-\x7f -ɏЀ-ӿ‐-№]*$/.test(s)) return s;
  } catch {}
  return cp866.decode(bytes);
}

export function unzip(bytes: Uint8Array, { maxBytes = 300 * 1024 * 1024 }: { maxBytes?: number } = {}): RawFile[] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith("/")) return false;
        total += f.originalSize;
        if (total > maxBytes) throw new RangeError(`распакованный размер больше лимита ${Math.round(maxBytes / 1048576)} МБ`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof RangeError) throw new Error(e.message);
    throw new Error(`не удалось прочитать zip: ${(e as Error).message}`);
  }
  return Object.entries(files)
    .map(([name, data]) => ({ name: fixName(name), data }))
    .filter((f) => !JUNK.test(f.name));
}
