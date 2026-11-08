import { fail, pgFail, session } from "@/lib/api";
import { LlmError } from "@/lib/llm";
import { generateRules } from "@/lib/rules";

export const maxDuration = 300;

export async function GET(_: Request, ctx: RouteContext<"/api/datasets/[id]/rulesets">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb.from("rulesets").select("*").eq("dataset_id", id).order("version", { ascending: false });
  return error ? pgFail(error) : Response.json(data);
}

/** Черновик правил: архитектор + критик по выборке документов датасета. */
export async function POST(_: Request, ctx: RouteContext<"/api/datasets/[id]/rulesets">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data: ds } = await s.sb.from("datasets").select("id,status").eq("id", id).eq("owner_id", s.user.id).maybeSingle();
  if (!ds) return fail(404, "датасет не найден или не ваш");
  const { data: docs, error } = await s.sb.from("documents").select("id,filename,units,preview,meta").eq("dataset_id", id).limit(2000);
  if (error) return pgFail(error);
  if (!docs.length) return fail(400, "сначала загрузите документы");

  let draft;
  try {
    draft = await generateRules(
      docs.map((d) => ({ id: d.id, filename: d.filename, units: d.units, preview: d.preview, source_path: String(d.meta?.source_path ?? "") })),
      process.env.ARCHITECT_MODEL ?? process.env.LLM_MODEL!,
      process.env.REFEREE_MODEL ?? process.env.LLM_MODEL!,
    );
  } catch (e) {
    const status = e instanceof LlmError && e.status === 503 ? 503 : 502;
    return fail(status, `генерация не удалась: ${(e as Error).message}`);
  }
  const { data: last } = await s.sb.from("rulesets").select("version").eq("dataset_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data, error: insErr } = await s.sb
    .from("rulesets")
    .insert({ dataset_id: id, version: (last?.version ?? 0) + 1, fields: draft.fields, rules: draft.rules, examples: draft.examples, critique: draft.critique, author: "agent" })
    .select()
    .single();
  if (insErr) return pgFail(insErr);
  return Response.json({ ...data, usage: draft.usage, model: draft.model }, { status: 201 });
}
