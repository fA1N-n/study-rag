// Доска разметки (docs/design.md, вариант A): KPI, сетка батчей, агенты, последние решения.
// Чистые функции — здесь (тестируются), чтение из БД — в loadBoard.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dataset } from "@/lib/data";

export type DocStatus = "unlabeled" | "agreed" | "refereed" | "review" | "human";
export type CellStatus = "queued" | "running" | "done" | "refereed" | "review" | "failed";
export type BatchCell = { seq: number; status: CellStatus; docs: number; counts: Partial<Record<DocStatus, number>> };
export type Agent = { key: "A" | "B" | "referee"; name: string; models: string[]; votes: number; confidence: number | null };
export type Decision = { id: string; filename: string; field: string; a: string; b: string; status: DocStatus };
export type Kpi = { labeled: number; total: number; agreed: number; refereed: number; review: number; human: number; tokens: number; kappa: number[] };
export type Board = { kpi: Kpi; batches: BatchCell[]; offline: boolean; jobStatus: string | null; agents: Agent[]; decisions: Decision[] };

/** Батч офлайн-разметки — порциями по 20 документов в порядке имени файла (как резали для Claude Code / Codex). */
export const OFFLINE_BATCH = 20;

/** Итог батча по худшему статусу его документов: на проверку > арбитр > готов. */
export function cellStatus(statuses: DocStatus[]): CellStatus {
  if (statuses.includes("review")) return "review";
  if (statuses.includes("refereed")) return "refereed";
  if (statuses.length && statuses.every((s) => s === "unlabeled")) return "queued";
  return "done";
}

function count(statuses: DocStatus[]) {
  const out: Partial<Record<DocStatus, number>> = {};
  for (const s of statuses) out[s] = (out[s] ?? 0) + 1;
  return out;
}

/** Сетка по батчам задания: queued/running/failed берём из батча, у готовых — статус по документам. */
export function jobCells(batches: { seq: number; status: string; document_ids: string[] }[], docStatus: Map<string, DocStatus>): BatchCell[] {
  return batches.map((b) => {
    const st = b.document_ids.map((id) => docStatus.get(id) ?? "unlabeled");
    const status: CellStatus = b.status === "done" ? cellStatus(st) : b.status === "running" ? "running" : b.status === "failed" ? "failed" : "queued";
    return { seq: b.seq, status, docs: b.document_ids.length, counts: count(st) };
  });
}

/** Сетка для офлайн-разметки (заданий в БД нет): документы по имени, порциями по OFFLINE_BATCH. */
export function offlineCells(docs: { filename: string; label_status: DocStatus }[], size = OFFLINE_BATCH): BatchCell[] {
  const sorted = docs.toSorted((a, b) => a.filename.localeCompare(b.filename, "ru"));
  const out: BatchCell[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const st = sorted.slice(i, i + size).map((d) => d.label_status);
    out.push({ seq: out.length + 1, status: cellStatus(st), docs: st.length, counts: count(st) });
  }
  return out;
}

const show = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : String(v));

/** Первое ключевое поле, где A и B разошлись; если согласны — первое ключевое поле. */
export function decisionField(keys: { key: string; label: string }[], a: Record<string, unknown>, b: Record<string, unknown>) {
  const f = keys.find((k) => show(a[k.key]) !== show(b[k.key])) ?? keys[0];
  return f ? { field: f.label, a: show(a[f.key]), b: show(b[f.key]) } : { field: "—", a: "—", b: "—" };
}

type Field = { key: string; label: string; required?: boolean; filter?: boolean };
type LabelRow = { model: string | null; confidence: number | null; tokens_in: number; tokens_out: number };

const AGENTS = [
  ["A", "Разметчик A"],
  ["B", "Разметчик B"],
  ["referee", "Арбитр"],
] as const;

export async function loadBoard(sb: SupabaseClient, ds: Dataset): Promise<Board> {
  const id = ds.id;
  const [docsRes, rsRes, jobRes, ...agentRes] = await Promise.all([
    sb.from("documents").select("id,filename,label_status").eq("dataset_id", id).limit(5000),
    ds.active_ruleset_id ? sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("label_jobs").select("id,status,tokens_in,tokens_out").eq("dataset_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ...AGENTS.map(([agent]) =>
      sb.from("labels").select("model,confidence,tokens_in,tokens_out,documents!inner(dataset_id)", { count: "exact" }).eq("documents.dataset_id", id).eq("agent", agent).limit(1000),
    ),
  ]);

  const docs = (docsRes.data ?? []) as { id: string; filename: string; label_status: DocStatus }[];
  const by = count(docs.map((d) => d.label_status));
  const job = jobRes.data as { id: string; status: string; tokens_in: number; tokens_out: number } | null;

  const agents: Agent[] = AGENTS.map(([key, name], i) => {
    const rows = (agentRes[i].data ?? []) as LabelRow[];
    const conf = rows.filter((r) => r.confidence != null);
    return {
      key,
      name,
      models: [...new Set(rows.map((r) => r.model).filter((m): m is string => !!m))],
      votes: agentRes[i].count ?? rows.length,
      confidence: conf.length ? conf.reduce((s, r) => s + r.confidence!, 0) / conf.length : null,
    };
  });
  const labelTokens = agentRes.flatMap((r) => (r.data ?? []) as LabelRow[]).reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);

  let batches: BatchCell[];
  if (job) {
    const { data } = await sb.from("batches").select("seq,status,document_ids").eq("job_id", job.id).order("seq").limit(1000);
    batches = jobCells(data ?? [], new Map(docs.map((d) => [d.id, d.label_status])));
  } else batches = offlineCells(docs);

  const fields = ((rsRes.data?.fields ?? []) as Field[]).filter((f) => f.required || f.filter);
  const { data: recentA } = await sb
    .from("labels")
    .select("document_id,values,documents!inner(dataset_id,filename,label_status)")
    .eq("documents.dataset_id", id)
    .eq("agent", "A")
    .order("id", { ascending: false })
    .limit(10);
  const recent = (recentA ?? []) as unknown as { document_id: string; values: Record<string, unknown>; documents: { filename: string; label_status: DocStatus } }[];
  const { data: recentB } = recent.length
    ? await sb.from("labels").select("document_id,values").eq("agent", "B").in("document_id", recent.map((r) => r.document_id))
    : { data: [] };
  const bVotes = new Map((recentB ?? []).map((r) => [r.document_id as string, r.values as Record<string, unknown>]));
  const decisions: Decision[] = recent.map((r) => ({
    id: r.document_id,
    filename: r.documents.filename,
    status: r.documents.label_status,
    ...decisionField(fields, r.values, bVotes.get(r.document_id) ?? {}),
  }));

  const stats = (ds.stats as { labeling?: { kappa?: Record<string, number> } }).labeling;
  return {
    kpi: {
      labeled: docs.length - (by.unlabeled ?? 0),
      total: docs.length,
      agreed: by.agreed ?? 0,
      refereed: by.refereed ?? 0,
      review: by.review ?? 0,
      human: by.human ?? 0,
      tokens: job ? job.tokens_in + job.tokens_out : labelTokens,
      kappa: Object.values(stats?.kappa ?? {}).filter((v) => Number.isFinite(v)),
    },
    batches,
    offline: !job,
    jobStatus: job?.status ?? null,
    agents,
    decisions,
  };
}
