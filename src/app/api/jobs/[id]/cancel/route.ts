import { fail, pgFail, session } from "@/lib/api";

/** Остановить разметку: батчи в очереди снимет воркер, идущие доработают без записи итога. */
export async function POST(_: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data, error } = await s.sb
    .from("label_jobs")
    .update({ status: "canceled", finished_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select("dataset_id");
  if (error) return pgFail(error);
  if (!data.length) return fail(409, "разметка не идёт или не ваша");
  const { count } = await s.sb.from("documents").select("id", { count: "exact", head: true }).eq("dataset_id", data[0].dataset_id).neq("label_status", "unlabeled");
  await s.sb.from("datasets").update({ status: count ? "labeled" : "rules" }).eq("id", data[0].dataset_id);
  return Response.json({ ok: true });
}
