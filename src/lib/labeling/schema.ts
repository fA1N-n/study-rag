// Схема разметки датасета (rulesets.fields) и валидатор меток агентов на zod.
import { z } from "zod";

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z_][a-z0-9_]*$/, "ключ — snake_case латиницей"),
  label: z.string().min(1),
  type: z.enum(["enum", "text", "int", "bool"]),
  required: z.boolean(),
  filter: z.boolean(),
  values: z.array(z.string().min(1)).optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  allowedBy: z.object({ field: z.string(), map: z.record(z.string(), z.array(z.union([z.string(), z.number()]))) }).optional(),
});

export type Field = z.infer<typeof fieldSchema>;

export const fieldsSchema = z
  .array(fieldSchema)
  .min(1, "в схеме нет полей")
  .superRefine((fields, ctx) => {
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) ctx.addIssue({ code: "custom", message: `повтор ключа ${f.key}` });
      keys.add(f.key);
      const bad = (message: string) => ctx.addIssue({ code: "custom", message: `${f.key}: ${message}` });
      if (f.type === "enum" && !f.values?.length) bad("enum без значений");
      if (f.type !== "enum" && f.values) bad("values только у enum");
      if (f.values && new Set(f.values.map((x) => x.trim().toLowerCase())).size !== f.values.length) bad("повтор значений");
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) bad("min > max");
    }
    for (const f of fields)
      if (f.allowedBy && (!keys.has(f.allowedBy.field) || f.allowedBy.field === f.key))
        ctx.addIssue({ code: "custom", message: `${f.key}: зависимость от поля ${f.allowedBy.field} невозможна` });
  });

/** Проверяет схему полей; бросает ZodError на некорректной. */
export function parseFields(raw: unknown): Field[] {
  return fieldsSchema.parse(raw);
}

function valueSchema(f: Field): z.ZodType {
  switch (f.type) {
    case "enum": {
      // LLM путает регистр и пробелы — приводим к значению из словаря
      const canon = new Map(f.values!.map((x) => [x.trim().toLowerCase(), x]));
      return z.preprocess(
        (v) => (typeof v === "string" ? (canon.get(v.trim().toLowerCase()) ?? v) : v),
        z.enum(f.values as [string, ...string[]]),
      );
    }
    case "text":
      return z.string().transform((s) => s.trim());
    case "int": {
      let n = z.number().int();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      return z.preprocess((v) => (typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v), n);
    }
    case "bool":
      return z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
  }
}

export type Validation = {
  ok: boolean;
  values: Record<string, unknown>;
  errors: { key: string; message: string }[];
  dropped: string[];
};

/** Валидирует ответ агента: недопустимые значения выбрасываются и попадают в errors. */
export function validateLabels(fields: Field[], input: unknown): Validation {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { ok: false, values: {}, errors: [{ key: "*", message: "метки должны быть объектом" }], dropped: [] };
  const raw = input as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  const errors: Validation["errors"] = [];
  const known = new Set(fields.map((f) => f.key));

  for (const f of fields) {
    const v = Object.hasOwn(raw, f.key) ? raw[f.key] : undefined;
    const r = v === undefined || v === null ? null : valueSchema(f).safeParse(v);
    if (r && !r.success) {
      errors.push({ key: f.key, message: r.error.issues[0]?.message ?? "недопустимое значение" });
      continue;
    }
    if (!r || r.data === "") {
      if (f.required) errors.push({ key: f.key, message: "обязательное поле не заполнено" });
      continue;
    }
    values[f.key] = r.data;
  }

  for (const f of fields) {
    if (!f.allowedBy || values[f.key] === undefined) continue;
    const parent = values[f.allowedBy.field];
    const map = f.allowedBy.map;
    const allowed = parent !== undefined && Object.hasOwn(map, String(parent)) ? map[String(parent)] : undefined;
    if (allowed && !allowed.some((a) => String(a) === String(values[f.key]))) {
      errors.push({ key: f.key, message: `значение ${values[f.key]} не подходит к ${f.allowedBy.field}=${parent}` });
      delete values[f.key];
    }
  }

  const dropped = Object.keys(raw).filter((k) => !known.has(k));
  return { ok: errors.length === 0, values, errors, dropped };
}
