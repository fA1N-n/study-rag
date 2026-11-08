import { fail, pgFail, session } from "@/lib/api";

/** Прогресс задания: счётчики и статусы батчей. */
export async function GET(_: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const [{ data: job, error }, { data: batches }] = await Promise.all([
    s.sb.from("label_jobs").select("*").eq("id", id).maybeSingle(),
    s.sb.from("batches").select("id,seq,status,attempts,error").eq("job_id", id).order("seq"),
  ]);
  if (error) return pgFail(error);
  return job ? Response.json({ ...job, batches }) : fail(404, "not found");
}
