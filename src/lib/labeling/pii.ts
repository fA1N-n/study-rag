// Маскирование ПДн (почта, телефон, ФИО) перед отправкой текста в LLM.
// ponytail: регулярки по шаблонам титульников КАИ; NER-модель — если начнут пропускаться имена вне титульников.
// Известные пределы: латиница и КАПС не ловятся; после «Выполнил/Студент» Title Case-заголовок замаскируется
// (ошибка в безопасную сторону); «И.О. Фамилия» учёных в тексте лекций тоже маскируется.

const L = "А-Яа-яЁёA-Za-z";
const NAME = "[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?";

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// код оператора/города начинается с 3, 4, 8 или 9 — отсекает ряды чисел вида «8 128 256 32 64»
const PHONE = /(?<!\d)(?:\+7|8)[\s(-]*[3489]\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g;

const KEYWORD = "(?:[Вв]ыполнил[аи]?(?:\\(а\\))?|[Пп]одготовил[аи]?(?:\\(а\\))?|Студент(?:ка|ки|а|ы)?|Обучающ(?:ийся|аяся|иеся))";
const PERSON = `(?!${KEYWORD}(?![${L}]))${NAME}`; // слово-ключ не может быть частью имени
const FULL = `${PERSON}(?:[ \\t]+${PERSON}){1,2}`;
// Разделители и слова-связки не пересекаются по символам — иначе перебор экспоненциален.
const AFTER_KEYWORD = new RegExp(
  `(${KEYWORD}(?:[\\s:,.]+(?:студент(?:ка|ки|ы|а)?|гр|групп[аы]|№?\\d{4}|№))*[\\s:,.]+)(${FULL}(?:,[ \\t]*${FULL})*)(?![${L}])`,
  "g",
);
// «Петрова К.С.», «Сидоров А. Б.»
const SURNAME_INITIALS = new RegExp(`(?<![${L}])(${NAME})[ \\t]+[А-ЯЁ]\\.[ \\t]?[А-ЯЁ]\\.(?![${L}])`, "g");
// «К.С. Петрова», но не «им. / имени А.Н. Туполева»
const INITIALS_SURNAME = new RegExp(`(?<![${L}.])(?<!им(?:\\.|ени)\\s?)[А-ЯЁ]\\.[ \\t]?[А-ЯЁ]\\.[ \\t]?(${NAME})(?![${L}])`, "g");

// окончания русских фамилий по падежам (Иванов-а-у-ым-е, Иванова → Ивановой/Иванову)
const ENDINGS = new Set(["", "а", "я", "у", "ю", "ой", "ей", "ым", "им", "ом", "ем", "е", "ы", "и"]);

// ФИО с отчеством в любом порядке (обычный регистр и КАПС) и номера из 9+ цифр (паспорт, билет) — пропуски ядра на реальных данных.
const W = "[А-ЯЁ][а-яё]+";
const P = "[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)";
const WC = "[А-ЯЁ]{2,}";
const PC = "[А-ЯЁ]{2,}(?:ОВИЧ|ЕВИЧ|ИЧ|ОВНА|ЕВНА|ИЧНА)";
const FIO_PATRONYMIC = new RegExp(
  `(?<![${L}])(?:(?:${W}[ \t]+)?${W}[ \t]+${P}(?:[ \t]+${W})?|(?:${WC}[ \t]+)?${WC}[ \t]+${PC}(?:[ \t]+${WC})?)(?![А-Яа-яЁё])`,
  "g",
);
// Номер документа — только после слова-маркера: голые длинные числа в лабах (двоичные, 2^31) не ПДн.
const LONG_NUMBER = /((?:паспорт|серия|билет|снилс|инн|полис)[^\n\d]{0,15}?(?:№\s*)?)\d[\d -]{7,}\d/gi;

// Фамилия в имени файла: по окончаниям русских фамилий (+ падежные окончания), с инициалами после неё.
// ponytail: эвристика по суффиксам; иностранные фамилии и латиница не ловятся, слова на «-ский/-ин» могут замаскироваться.
const SURNAME_WORD = /^[А-ЯЁ][а-яё]{2,}(?:(?:ов|ев|ёв|ин|ын)(?:а|у|ым|ой|ых)?|(?:ск|цк)(?:ий|ая|ого|ой|ому|им)|енко|чук|ук|юк|ян|швили|дзе)$/;
const FILE_WORD = /[А-ЯЁ][а-яё]+(?:[ _]+[А-ЯЁ]\.[ _]?[А-ЯЁ]\.)?/g;

export type PiiResult = { text: string; piiFlag: boolean; found: { emails: number; phones: number; names: number } };

function keeper(keepNames: string[]) {
  const bases = keepNames
    .map((n) => n.split(/\s+/).find((w) => /^[А-ЯЁ][а-яё-]+$/.test(w)))
    .filter((w): w is string => !!w)
    .map((w) => w.toLowerCase().replace(/[ая]$/, ""));
  const words = new Set(keepNames.flatMap((n) => n.toLowerCase().split(/\s+/)));
  const kept = (surname: string) => {
    const w = surname.toLowerCase();
    return bases.some((b) => w.startsWith(b) && ENDINGS.has(w.slice(b.length)));
  };
  // ФИО целиком: фамилия преподавателя или хотя бы два слова из его ФИО (имя + отчество)
  const keptFull = (fio: string) => {
    const ws = fio.split(/[ \t]+/);
    return ws.some(kept) || ws.filter((x) => words.has(x.toLowerCase())).length >= 2;
  };
  return { kept, keptFull };
}

export function maskPii(text: string, { keepNames = [] }: { keepNames?: string[] } = {}): PiiResult {
  const { kept, keptFull } = keeper(keepNames);
  const found = { emails: 0, phones: 0, names: 0 };
  let t = text.replace(/<br\s*\/?>/gi, " ");
  t = t.replace(EMAIL, () => (found.emails++, "[почта]"));
  t = t.replace(PHONE, () => (found.phones++, "[телефон]"));
  t = t.replace(LONG_NUMBER, (_, head: string) => (found.phones++, `${head}[номер]`));
  t = t.replace(AFTER_KEYWORD, (m, head: string, names: string) =>
    kept(names.split(/\s+/)[0]) ? m : (found.names++, `${head}[ФИО]`),
  );
  t = t.replace(FIO_PATRONYMIC, (m) => (keptFull(m) ? m : (found.names++, "[ФИО]")));
  t = t.replace(SURNAME_INITIALS, (m, surname: string) => (kept(surname) ? m : (found.names++, "[ФИО]")));
  t = t.replace(INITIALS_SURNAME, (m, surname: string) => (kept(surname) ? m : (found.names++, "[ФИО]")));

  return { text: t, piiFlag: found.emails + found.phones + found.names > 0, found };
}

export type MaskResult = { text: string; masked: boolean };

/** Фамилии в имени файла → [ФИО]; расширение не трогается. */
export function maskFilename(name: string, { keepNames = [] }: { keepNames?: string[] } = {}): MaskResult {
  const { kept } = keeper(keepNames);
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let masked = false;
  const out = stem.replace(FILE_WORD, (m) => {
    const word = m.split(/[ _]/)[0];
    if (!SURNAME_WORD.test(word) || kept(word)) return m;
    masked = true;
    return "[ФИО]";
  });
  // «Смирнова А.А..docx»: точка инициала стоит прямо перед расширением
  return { text: out.replace(/\[ФИО\]\.$/, "[ФИО]") + ext, masked };
}

/** Путь: домашняя папка → [пользователь] (след сборщика, не ПДн документа — флаг не ставит), в каждой части — maskFilename. */
export function maskPath(path: string, opts: { keepNames?: string[] } = {}): MaskResult {
  let masked = false;
  const t = path
    .replace(/((?:^|[\\/])(?:Users|home)[\\/])([^\\/]+)/gi, (_, head: string) => `${head}[пользователь]`)
    .split(/([\\/])/)
    .map((part) => {
      if (part === "[пользователь]" || part === "/" || part === "\\") return part;
      const r = maskFilename(part, opts);
      masked ||= r.masked;
      return r.text;
    })
    .join("");
  return { text: t, masked };
}
