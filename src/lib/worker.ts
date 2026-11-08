// Воркер разметки: забирает батчи из очереди (claim_batches), гоняет A/B/арбитра (runBatch), пишет голоса и итог.
// Вызывается из /api/worker/tick (pg_cron раз в минуту) и через after() сразу после запуска разметки.
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBatch, type AgentVote, type BatchDoc } from "./labeler";
import { cohenKappa } from "./labeling/kappa";
import { parseFields, type Field } from "./labeling/schema";
import { admin } from "./supabase/server";

type Batch = { id: number; job_id: string; document_ids: string[] };

export const labelModels = () => {
  const env = process.env;
  const base = env.LLM_MODEL ?? "";
  return { A: env.LABELER_A_MODEL || base, B: env.LABELER_B_MODEL || base, referee: env.REFEREE_MODEL || base };
};

/** Батч отменённого задания: итог не пишем, батч снимаем сразу (не ждём claim_batches). */
const drop = (sb: SupabaseClient, b: Batch) => sb.from("batches").update({ status: "failed", error: "canceled", locked_until: null }).eq("id", b.id);

const jobStatus = async (sb: SupabaseClient, id: string) => (await sb.from("label_jobs").select("status").eq("id", id).single()).data?.status as string | undefined;

/** Один батч: разметка → голоса в labels, итог в documents → finish_batch. Ошибка → повтор (до 3 попыток). */
export async function processBatch(sb: SupabaseClient, b: Batch, run = runBatch) {
  const { data: job } = await sb.from("label_jobs").select("id,dataset_id,ruleset_id,status").eq("id", b.job_id).single();
  if (!job || job.status !== "running") return void (await drop(sb, b));
  let usage = { tokensIn: 0, tokensOut: 0 };
  try {
    const [{ data: rs }, { data: docs }] = await Promise.all([
      sb.from("rulesets").select("fields,rules").eq("id", job.ruleset_id).single(),
      sb.from("documents").select("id,filename,units,preview,meta").in("id", b.document_ids),
    ]);
    if (!rs || !docs?.length) throw new Error("нет правил или документов батча");
    const batchDocs: BatchDoc[] = docs.map((d) => ({ id: d.id, filename: d.filename, units: d.units, preview: d.preview, source_path: String(d.meta?.source_path ?? "") }));
    const r = await run({ fields: parseFields(rs.fields), rules: rs.rules }, batchDocs, labelModels());
    usage = r.usage;
    if ((await jobStatus(sb, job.id)) !== "running") return void (await drop(sb, b)); // отменили, пока агенты думали

    const vote = (agent: "A" | "B" | "referee", model: string | undefined, v: AgentVote | undefined) =>
      v ? [{ document_id: v.doc_id, job_id: job.id, agent, model: model ?? null, values: v.values, confidence: v.confidence, rationale: v.rationale }] : [];
    const rows = r.results.flatMap((x) => [...vote("A", r.models.A, x.a), ...vote("B", r.models.B, x.b), ...vote("referee", r.models.referee, x.referee)]);
    if (rows.length) {
      const ins = await sb.from("labels").insert(rows);
      if (ins.error) throw ins.error;
    }
    for (const x of r.results) {
      const up = await sb.from("documents").update({ labels: x.merged.values, label_status: x.merged.status }).eq("id", x.doc_id).neq("label_status", "human");
      if (up.error) throw up.error;
    }
    await finish(sb, b, job.dataset_id, true, null, usage);
  } catch (e) {
    await finish(sb, b, job.dataset_id, false, (e as Error).message, usage);
  }
}

async function finish(sb: SupabaseClient, b: Batch, datasetId: string, ok: boolean, error: string | null, u: { tokensIn: number; tokensOut: number }) {
  const { data, error: e } = await sb.rpc("finish_batch", { p_batch: b.id, p_ok: ok, p_error: error, p_in: u.tokensIn, p_out: u.tokensOut });
  if (e) throw e;
  if (data === "finished") await summarize(sb, datasetId, b.job_id);
}

/** Каппа A/B по ключевым полям (required или filter) на документах, где есть оба голоса. */
export function kappaByField(fields: Field[], votes: { document_id: string; agent: string; values: Record<string, unknown> }[]) {
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "∅" : String(v).trim().toLowerCase());
  const A = new Map(votes.filter((v) => v.agent === "A").map((v) => [v.document_id, v.values]));
  const B = new Map(votes.filter((v) => v.agent === "B").map((v) => [v.document_id, v.values]));
  const both = [...A.keys()].filter((id) => B.has(id));
  if (!both.length) return {};
  return Object.fromEntries(
    fields.filter((f) => f.required || f.filter).map((f) => [f.key, Number(cohenKappa(both.map((id) => norm(A.get(id)![f.key])), both.map((id) => norm(B.get(id)![f.key]))).toFixed(3))]),
  );
}

/** Задание закрыто → сводка в datasets.stats.labeling (доли статусов, каппа, модели), статус датасета. */
export async function summarize(sb: SupabaseClient, datasetId: string, jobId: string) {
  const [{ data: ds }, { data: docs }, { data: job }] = await Promise.all([
    sb.from("datasets").select("stats,active_ruleset_id").eq("id", datasetId).single(),
    sb.from("documents").select("label_status").eq("dataset_id", datasetId).limit(5000),
    sb.from("label_jobs").select("ruleset_id,status,tokens_in,tokens_out,started_at,finished_at").eq("id", jobId).single(),
  ]);
  if (!ds || !docs || !job) return;
  const counts: Record<string, number> = {};
  for (const d of docs) counts[d.label_status] = (counts[d.label_status] ?? 0) + 1;
  const [{ data: rs }, { data: votes }] = await Promise.all([
    sb.from("rulesets").select("fields").eq("id", job.ruleset_id).single(),
    sb.from("labels").select("document_id,agent,values,model").eq("job_id", jobId).in("agent", ["A", "B"]),
  ]);
  const agents = Object.fromEntries(["A", "B"].map((a) => [a, [...new Set((votes ?? []).filter((v) => v.agent === a).map((v) => v.model))].join(", ")]));
  const kappa = rs ? kappaByField(parseFields(rs.fields), votes ?? []) : {};
  const seconds = job.started_at && job.finished_at ? Math.round((Date.parse(job.finished_at) - Date.parse(job.started_at)) / 1000) : null;
  const labeling = { ...counts, total: docs.length, kappa, agents, offline: false, job: jobId, tokens_in: job.tokens_in, tokens_out: job.tokens_out, seconds };
  const labeled = docs.some((d) => d.label_status !== "unlabeled");
  await sb.from("datasets").update({ stats: { ...(ds.stats as object), labeling }, status: labeled ? "labeled" : "rules" }).eq("id", datasetId);
}

/** Тик: забирать батчи по parallel штук, пока не кончатся или не выйдет время на новые (батч бесплатной моделью — до 2–3 мин). */
export async function tick({ budgetMs = 150_000, parallel = 2 } = {}) {
  const sb = admin();
  const t0 = Date.now();
  let processed = 0;
  while (Date.now() - t0 < budgetMs) {
    const { data, error } = await sb.rpc("claim_batches", { n: parallel, lease: "10 minutes" });
    if (error) throw error;
    if (!data?.length) break;
    await Promise.all((data as Batch[]).map((b) => processBatch(sb, b)));
    processed += data.length;
  }
  return { processed };
}
