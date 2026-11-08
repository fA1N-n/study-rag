// Генерация правил разметки: архитектор (выборка A) → критик (выборка B) → архитектор правит. Модели — бесплатные OpenRouter.
import { chat, parseJson, type Usage } from "./llm";
import { fieldsSchema, type Field } from "./labeling/schema";

export type SampleDoc = { id: string; filename: string; source_path: string; units: number; preview: string };
export type Draft = { fields: Field[]; rules: string; examples: unknown[]; critique: string; usage: Usage; model: string };

/** Стратифицированная выборка: по верхней папке пути и размеру, без повторов; детерминированно (по id). */
export function stratify(docs: SampleDoc[], n: number, exclude = new Set<string>()): SampleDoc[] {
  const pool = docs.filter((d) => !exclude.has(d.id)).sort((a, b) => a.id.localeCompare(b.id));
  const strata = new Map<string, SampleDoc[]>();
  for (const d of pool) {
    const top = d.source_path.split(/[\\/]/).filter((p) => p && !/^[A-Z]:$/i.test(p) && p !== "Users" && p !== "[пользователь]")[0] ?? "";
    const size = d.units < 5 ? "s" : d.units < 25 ? "m" : "l";
    const k = `${top}|${size}`;
    strata.set(k, [...(strata.get(k) ?? []), d]);
  }
  const out: SampleDoc[] = [];
  const lists = [...strata.values()];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++)
    for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

const show = (docs: SampleDoc[], chars: number) =>
  docs.map((d, i) => `### Документ ${i + 1}\nимя: ${d.filename}\nпуть: ${d.source_path}\nединиц: ${d.units}\n${d.preview.slice(0, chars)}`).join("\n\n");

const SCHEMA_HELP = `Формат ответа — один JSON-объект:
{"fields": [{"key": "snake_case", "label": "Название", "type": "enum|text|int|bool", "required": true|false, "filter": true|false, "values": ["..."] (только у enum), "min": 1, "max": 8 (у int, необязательно)}],
 "rules": "правила для разметчиков в markdown: порядок решения, как различать похожие значения, когда оставлять пусто",
 "examples": [{"doc": "имя файла", "values": {...}, "why": "почему"}]}
Ограничения: 3–8 полей; поля-фильтры — то, по чему студент будет фильтровать поиск (предмет, семестр, тип документа, преподаватель…); у enum — исчерпывающий список значений плюс «другое»; не придумывай поля, которых нельзя определить по началу документа.`;

export async function generateRules(docs: SampleDoc[], model: string, critic: string): Promise<Draft> {
  const sampleA = stratify(docs, 25);
  const sampleB = stratify(docs, 15, new Set(sampleA.map((d) => d.id)));
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  const add = (u: Usage) => ((usage.tokensIn += u.tokensIn), (usage.tokensOut += u.tokensOut));

  const sys = "Ты — архитектор схемы разметки учебных документов. Отвечай только JSON.";
  const ask = `Ниже ${sampleA.length} документов из набора (начало каждого, ПДн замаскированы). Предложи схему разметки и правила для двух независимых разметчиков-LLM, чтобы они размечали одинаково.\n\n${SCHEMA_HELP}\n\n${show(sampleA, 1500)}`;
  const first = await chat(model, [{ role: "system", content: sys }, { role: "user", content: ask }], { json: true, maxTokens: 6000 });
  add(first.usage);
  let draft = parseDraft(first.text);

  const crit = await chat(critic, [
    { role: "system", content: "Ты — критик правил разметки. Найди, где два добросовестных разметчика разойдутся." },
    { role: "user", content: `Схема и правила:\n${JSON.stringify(draft)}\n\nПримени их строго к ${sampleB.length} документам, которых архитектор не видел. Перечисли нумерованным списком: противоречия в правилах, документы вне значений enum, неоднозначные места; для каждого — точный текст правки. Не больше 12 пунктов.\n\n${show(sampleB, 1200)}` },
  ], { maxTokens: 3000 });
  add(crit.usage);

  const fix = await chat(model, [
    { role: "system", content: sys },
    { role: "user", content: ask },
    { role: "assistant", content: JSON.stringify(draft) },
    { role: "user", content: `Критик проверил правила на других документах:\n${crit.text}\n\nИсправь схему и правила с учётом замечаний (одна итерация). Верни полный JSON в том же формате.` },
  ], { json: true, maxTokens: 6000 });
  add(fix.usage);
  try {
    draft = parseDraft(fix.text);
  } catch {
    // правка не разобралась — остаёмся на первой версии, замечания критика всё равно сохраним
  }
  return { ...draft, critique: crit.text, usage, model: first.model };
}

function parseDraft(text: string): Omit<Draft, "critique" | "usage" | "model"> {
  const raw = parseJson<{ fields?: unknown; rules?: unknown; examples?: unknown }>(text);
  const fields = fieldsSchema.parse(raw.fields);
  return { fields, rules: String(raw.rules ?? ""), examples: Array.isArray(raw.examples) ? raw.examples : [] };
}
