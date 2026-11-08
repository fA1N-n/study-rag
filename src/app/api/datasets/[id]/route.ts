import { body, fail, pgFail, session } from "@/lib/api";
import { DatasetInput } from "@/lib/schemas";

export async function GET(_: Request, ctx: RouteContext<"/api/datasets/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb.from("datasets").select("*").eq("id", id).maybeSingle();
  if (error) return pgFail(error);
  return data ? Response.json(data) : fail(404, "not found");
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/datasets/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, DatasetInput.partial());
  if (input instanceof Response) return input;
  const { data, error } = await s.sb.from("datasets").update(input).eq("id", id).select().maybeSingle();
  if (error) return pgFail(error);
  return data ? Response.json(data) : fail(404, "not found");
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/datasets/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb.from("datasets").delete().eq("id", id).select("id");
  if (error) return pgFail(error);
  return data.length ? new Response(null, { status: 204 }) : fail(404, "not found");
}
