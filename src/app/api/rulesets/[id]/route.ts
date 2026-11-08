import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";
import { fieldsSchema } from "@/lib/labeling/schema";

const Patch = z.object({
  fields: z.unknown().optional(),
  rules: z.string().min(10, "правила — от 10 символов").max(60000).optional(),
  status: z.literal("approved").optional(),
});

/**
 * Правка и утверждение правил. Черновик правится на месте; правка утверждённой версии создаёт новый черновик
 * (утверждённая остаётся неизменной — по ней размечены документы). Утверждение архивирует прежнюю утверждённую.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/rulesets/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, Patch);
  if (input instanceof Response) return input;
  const { data: rs } = await s.sb.from("rulesets").select("*").eq("id", id).maybeSingle();
  if (!rs) return fail(404, "not found");

  let fields = rs.fields;
  if (input.fields !== undefined) {
    const p = fieldsSchema.safeParse(input.fields);
    if (!p.success) return fail(400, `схема полей: ${p.error.issues[0]?.message}`);
    fields = p.data;
  }
  const edits = input.fields !== undefined || input.rules !== undefined;

  if (edits && rs.status !== "draft") {
    const { data: last } = await s.sb.from("rulesets").select("version").eq("dataset_id", rs.dataset_id).order("version", { ascending: false }).limit(1).single();
    const { data, error } = await s.sb
      .from("rulesets")
      .insert({ dataset_id: rs.dataset_id, version: last!.version + 1, fields, rules: input.rules ?? rs.rules, examples: rs.examples, critique: rs.critique, author: "user" })
      .select()
      .single();
    return error ? pgFail(error) : Response.json(data, { status: 201 });
  }

  if (edits) {
    const { error } = await s.sb.from("rulesets").update({ fields, rules: input.rules ?? rs.rules, author: "user" }).eq("id", id);
    if (error) return pgFail(error);
  }
  if (input.status === "approved") {
    const arch = await s.sb.from("rulesets").update({ status: "archived" }).eq("dataset_id", rs.dataset_id).eq("status", "approved").neq("id", id);
    if (arch.error) return pgFail(arch.error);
    const ok = await s.sb.from("rulesets").update({ status: "approved" }).eq("id", id);
    if (ok.error) return pgFail(ok.error);
    const { data: ds } = await s.sb.from("datasets").select("status").eq("id", rs.dataset_id).single();
    const status = ds && ["ingested", "rules"].includes(ds.status) ? "rules" : ds?.status;
    const upd = await s.sb.from("datasets").update({ active_ruleset_id: id, status }).eq("id", rs.dataset_id);
    if (upd.error) return pgFail(upd.error);
  }
  const { data } = await s.sb.from("rulesets").select("*").eq("id", id).single();
  return Response.json(data);
}
