// Слияние разметчиков A/B и арбитра в итоговый статус документа.
import { validateLabels, type Field } from "./schema";

export type Vote = { values: Record<string, unknown>; confidence: number } | null;
export type Merged = {
  status: "agreed" | "refereed" | "review" | "needs_referee";
  values: Record<string, unknown>;
  disputed: string[];
};

const keyFields = (fields: Field[]) => fields.filter((f) => f.required || f.filter);
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const sure = (vote: Vote, t: number) =>
  !!vote && typeof vote.confidence === "number" && vote.confidence >= 0 && vote.confidence <= 1 && vote.confidence >= t;

/** Ключевые поля (required или filter), по которым A и B расходятся. */
export function disputedKeys(fields: Field[], a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return keyFields(fields)
    .filter((f) => norm(a[f.key]) !== norm(b[f.key]))
    .map((f) => f.key);
}

export function mergeLabels(fields: Field[], a: Vote, b: Vote, referee: Vote, threshold: number): Merged {
  const va = a ? validateLabels(fields, a.values).values : {};
  const vb = b ? validateLabels(fields, b.values).values : {};
  const both = !!a && !!b;
  const disputed = both ? disputedKeys(fields, va, vb) : keyFields(fields).map((f) => f.key);
  const base = { ...vb, ...va };

  if (disputed.length === 0) {
    const ok = both && sure(a, threshold) && sure(b, threshold) && validateLabels(fields, base).ok;
    return { status: ok ? "agreed" : "review", values: base, disputed };
  }

  if (!referee) return { status: "needs_referee", values: base, disputed };

  // арбитр решает спорные поля; пустое значение допустимо только для необязательных
  const vr = validateLabels(fields, referee.values).values;
  const values = { ...base };
  for (const k of disputed) {
    if (vr[k] === undefined) delete values[k];
    else values[k] = vr[k];
  }
  const ok = sure(referee, threshold) && validateLabels(fields, values).ok;
  return { status: ok ? "refereed" : "review", values, disputed };
}
