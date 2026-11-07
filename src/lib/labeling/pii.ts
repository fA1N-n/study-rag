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

export type PiiResult = { text: string; piiFlag: boolean; found: { emails: number; phones: number; names: number } };

export function maskPii(text: string, { keepNames = [] }: { keepNames?: string[] } = {}): PiiResult {
  const bases = keepNames
    .map((n) => n.split(/\s+/).find((w) => /^[А-ЯЁ][а-яё-]+$/.test(w)))
    .filter((w): w is string => !!w)
    .map((w) => w.toLowerCase().replace(/[ая]$/, ""));
  const kept = (surname: string) => {
    const w = surname.toLowerCase();
    return bases.some((b) => w.startsWith(b) && ENDINGS.has(w.slice(b.length)));
  };

  const found = { emails: 0, phones: 0, names: 0 };
  let t = text.replace(EMAIL, () => (found.emails++, "[почта]"));
  t = t.replace(PHONE, () => (found.phones++, "[телефон]"));
  t = t.replace(AFTER_KEYWORD, (m, head: string, names: string) =>
    kept(names.split(/\s+/)[0]) ? m : (found.names++, `${head}[ФИО]`),
  );
  t = t.replace(SURNAME_INITIALS, (m, surname: string) => (kept(surname) ? m : (found.names++, "[ФИО]")));
  t = t.replace(INITIALS_SURNAME, (m, surname: string) => (kept(surname) ? m : (found.names++, "[ФИО]")));

  return { text: t, piiFlag: found.emails + found.phones + found.names > 0, found };
}
