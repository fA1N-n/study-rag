import { after } from "next/server";
import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";
import { makeBatches } from "@/lib/labeling/batching";
import { admin } from "@/lib/supabase/server";
import { tick } from "@/lib/worker";

export const maxDuration = 300;

const Start = z.object({ scope: z.enum(["unlabeled", "all"]).default("unlabeled") });
// ~3 символа русского текста на токен; батч — до 10 документов и ~12 тыс. токенов превью
const BATCH = { maxTokens: 12_000, maxDocs: 10 };
const DEMO_JOBS_PER_DAY = 3; // бесплатные модели — 50 запросов в день на весь проект

/** Запустить разметку по утверждённым правилам: задание + батчи, первый тик сразу после ответа. */
export async function POST(req: Request, ctx: RouteContext<"/api/datasets/[id]/jobs">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, Start);
  if (input instanceof Response) return input;

  const { data: ds } = await s.sb.from("datasets").select("id,owner_id,active_ruleset_id").eq("id", id).maybeSingle();
  if (!ds || ds.owner_id !== s.user.id) return fail(404, "датасет не найден или не ваш");
  if (!ds.active_ruleset_id) return fail(400, "сначала утвердите правила");

  if (s.user.role === "demo") {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await s.sb.from("label_jobs").select("id, datasets!inner(owner_id)", { count: "exact", head: true }).eq("datasets.owner_id", s.user.id).gte("created_at", since);
    if ((count ?? 0) >= DEMO_JOBS_PER_DAY) return fail(429, `demo limit: ${DEMO_JOBS_PER_DAY} разметки в сутки`);
  }

  let q = s.sb.from("documents").select("id,preview").eq("dataset_id", id).order("filename").limit(5000);
  q = input.scope === "all" ? q.neq("label_status", "human") : q.eq("label_status", "unlabeled");
  const { data: docs, error } = await q;
  if (error) return pgFail(error);
  if (!docs.length) return fail(400, input.scope === "all" ? "нет документов" : "все документы уже размечены — запустите «Разметить заново»");

  const groups = makeBatches(docs.map((d) => ({ id: d.id, tokens: Math.ceil(d.preview.length / 3) + 200 })), BATCH);
  const { data: job, error: jobErr } = await s.sb.from("label_jobs").insert({ dataset_id: id, ruleset_id: ds.active_ruleset_id, total_batches: groups.length }).select().single();
  if (jobErr) return jobErr.code === "23505" ? fail(409, "разметка уже идёт") : pgFail(jobErr);

  // батчи пишет только сервис (RLS); владение датасетом проверено выше
  const ins = await admin().from("batches").insert(groups.map((document_ids, i) => ({ job_id: job.id, seq: i + 1, document_ids })));
  if (ins.error) {
    await s.sb.from("label_jobs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", job.id);
    return pgFail(ins.error);
  }
  await s.sb.from("datasets").update({ status: "labeling" }).eq("id", id);
  after(() => tick().catch((e) => console.error("tick", e)));
  return Response.json(job, { status: 201 });
}
