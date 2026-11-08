import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";
import { parseFields, validateLabels } from "@/lib/labeling/schema";

export async function GET(_: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) return pgFail(error);
  return data ? Response.json(data) : fail(404, "not found");
}

const Patch = z.object({ labels: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) });

/** Правка меток человеком: итог → documents.labels (status human) + запись в labels (agent human). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, Patch);
  if (input instanceof Response) return input;
  const { data: doc } = await s.sb.from("documents").select("id,dataset_id,labels").eq("id", id).maybeSingle();
  if (!doc) return fail(404, "not found");
  const { data: ds } = await s.sb.from("datasets").select("active_ruleset_id").eq("id", doc.dataset_id).single();
  let labels: Record<string, unknown> = input.labels;
  if (ds?.active_ruleset_id) {
    const { data: rs } = await s.sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).single();
    const v = validateLabels(parseFields(rs!.fields), input.labels);
    if (!v.ok) return fail(400, v.errors.map((e) => `${e.key}: ${e.message}`).join("; "));
    labels = v.values;
  }
  const { error } = await s.sb.from("documents").update({ labels, label_status: "human" }).eq("id", id);
  if (error) return pgFail(error);
  const ins = await s.sb.from("labels").insert({ document_id: id, agent: "human", values: labels, confidence: 1 });
  if (ins.error) return pgFail(ins.error);
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb.from("documents").delete().eq("id", id).select("storage_path,dataset_id");
  if (error) return pgFail(error);
  if (!data.length) return fail(404, "not found");
  await s.sb.storage.from("datasets").remove([data[0].storage_path]);
  const { count } = await s.sb.from("documents").select("id", { count: "exact", head: true }).eq("dataset_id", data[0].dataset_id);
  const { data: ds } = await s.sb.from("datasets").select("stats").eq("id", data[0].dataset_id).single();
  await s.sb.from("datasets").update({ stats: { ...(ds?.stats ?? {}), documents: count ?? 0 } }).eq("id", data[0].dataset_id);
  return new Response(null, { status: 204 });
}
