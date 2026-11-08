import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh, CancelJob, StartJob } from "@/components/LabelingActions";
import { card, h4, muted, pill, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";

const BATCH_CLS: Record<string, string> = { queued: "bg-sub text-mute", running: "bg-acc-soft text-acc animate-pulse", done: "bg-ok/20 text-ok", failed: "bg-bad/20 text-bad" };
const JOB_RU: Record<string, string> = { queued: "в очереди", running: "идёт", done: "готово", failed: "ошибка", canceled: "остановлена" };
const AGENT_RU: Record<string, string> = { A: "Разметчик A", B: "Разметчик B", referee: "Арбитр", human: "Человек" };
const STATUSES = ["agreed", "refereed", "review", "human", "unlabeled"] as const;

type Labeling = { kappa?: Record<string, number>; agents?: Record<string, string>; offline?: boolean; seconds?: number | null };

async function Board({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, sb, mine } = await loadDataset(id);
  const [{ data: docs }, { data: jobs }, rules] = await Promise.all([
    sb.from("documents").select("label_status").eq("dataset_id", id).limit(5000),
    sb.from("label_jobs").select("*").eq("dataset_id", id).order("created_at", { ascending: false }).limit(1),
    ds.active_ruleset_id ? sb.from("rulesets").select("version,status").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const job = jobs?.[0] ?? null;
  const active = job && ["queued", "running"].includes(job.status);
  const [{ data: batches }, { data: votes }, { data: recent }] = job
    ? await Promise.all([
        sb.from("batches").select("id,seq,status,attempts,error,document_ids").eq("job_id", job.id).order("seq"),
        sb.from("labels").select("agent,model,confidence").eq("job_id", job.id).limit(5000),
        sb.from("labels").select("id,agent,created_at,documents(id,filename,label_status)").eq("job_id", job.id).eq("agent", "A").order("id", { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const list = docs ?? [];
  const count = (s: string) => list.filter((d) => d.label_status === s).length;
  const labeled = list.length - count("unlabeled");
  const stats = (ds.stats.labeling ?? {}) as unknown as Labeling;
  const approved = rules.data?.status === "approved";
  const kappa = Object.entries(stats.kappa ?? {});
  const lanes = (["A", "B", "referee"] as const).map((a) => {
    const v = (votes ?? []).filter((x) => x.agent === a);
    const conf = v.length ? v.reduce((s, x) => s + (x.confidence ?? 0), 0) / v.length : null;
    return { a, n: v.length, conf, model: [...new Set(v.map((x) => x.model))].join(", ") || stats.agents?.[a] || "—" };
  });

  return (
    <>
      {(active || ds.status === "labeling") && <AutoRefresh />}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Разметка</h1>
          <p className={muted}>
            {job ? `Последний запуск: ${JOB_RU[job.status] ?? job.status} · батчей ${job.done_batches}/${job.total_batches}` : stats.offline ? "Размечено офлайн агентами Claude/Codex по правилам v1, импортировано в БД" : "Разметка ещё не запускалась"}
            {rules.data && ` · правила v${rules.data.version}${approved ? "" : " (черновик)"}`}
          </p>
        </div>
        {mine && (active ? <CancelJob jobId={job!.id} /> : approved ? <StartJob datasetId={id} hasLabeled={labeled > 0} /> : <Link className="text-sm text-acc" href={`/d/${id}/rules`}>Сначала утвердите правила →</Link>)}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Размечено", `${labeled} / ${list.length}`],
          ["Авто (agreed)", list.length ? `${Math.round((count("agreed") / list.length) * 100)} %` : "—"],
          ["Человеку (review)", count("review")],
          ["Токены вход / выход", job ? `${Number(job.tokens_in).toLocaleString("ru")} / ${Number(job.tokens_out).toLocaleString("ru")}` : "—"],
        ].map(([l, v]) => (
          <div key={l as string} className={card}>
            <div className="text-xs text-mute">{l}</div>
            <div className="text-xl font-bold tracking-tight">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className={card}>
            <h2 className={h4}>Батчи {job ? `· стоимость $${Number(job.cost_usd).toFixed(2)} (бесплатные модели)` : ""}</h2>
            {batches?.length ? (
              <>
                <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-sub">
                  <div className="bg-ok" style={{ width: `${(job!.done_batches / Math.max(1, job!.total_batches)) * 100}%` }} />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
                  {batches.map((b) => (
                    <div key={b.id} title={b.error ?? undefined} className={`rounded-md px-2 py-1.5 font-mono text-[11px] ${BATCH_CLS[b.status]}`}>
                      #{b.seq}
                      <div className="opacity-80">{b.document_ids.length} д.{b.attempts > 1 ? ` ×${b.attempts}` : ""}</div>
                    </div>
                  ))}
                </div>
                {batches.some((b) => b.error) && <p className="mt-2 text-xs text-bad">Ошибка: {batches.find((b) => b.error)!.error}</p>}
              </>
            ) : (
              <p className={muted}>{stats.offline ? "Офлайн-разметка шла батчами вне приложения (29 батчей по 20 документов)." : "Нет батчей."}</p>
            )}
          </section>

          <section className={card}>
            <h2 className={h4}>Последние решения</h2>
            {recent?.length ? (
              <ul className="divide-y divide-line text-sm">
                {recent.map((r) => {
                  const d = r.documents as unknown as { id: string; filename: string; label_status: string } | null;
                  return d ? (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link href={`/d/${id}/docs/${d.id}`} className="min-w-0 truncate hover:text-acc">{d.filename}</Link>
                      <span className={pill(d.label_status)}>{d.label_status}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className={muted}>Пока пусто.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className={card}>
            <h2 className={h4}>Агенты</h2>
            <ul className="space-y-3 text-sm">
              {lanes.map((l) => (
                <li key={l.a}>
                  <div className="flex justify-between"><b>{AGENT_RU[l.a]}</b><span className="font-mono text-xs text-mute">{l.n ? `${l.n} гол.${l.conf !== null ? ` · ${l.conf.toFixed(2)}` : ""}` : ""}</span></div>
                  <div className="break-words font-mono text-[11px] text-mute">{active && !l.n ? "думает…" : l.model}</div>
                </li>
              ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className={h4}>Итог по документам</h2>
            <ul className="space-y-1 text-sm">
              {STATUSES.map((s) => (
                <li key={s} className="flex items-center justify-between"><span className={pill(s)}>{s}</span><span className="font-mono">{count(s)}</span></li>
              ))}
            </ul>
            {count("review") > 0 && <Link className="mt-2 inline-block text-sm text-acc" href={`/d/${id}/review`}>Открыть очередь проверки →</Link>}
          </section>
          {kappa.length > 0 && (
            <section className={card}>
              <h2 className={h4}>Согласие A/B (каппа Коэна)</h2>
              <ul className="space-y-1 text-sm">
                {kappa.map(([k, v]) => <li key={k} className="flex justify-between"><span className="font-mono text-xs">{k}</span><span className="font-mono">{v.toFixed(3)}</span></li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

export default function LabelingPage({ params }: PageProps<"/d/[id]/labeling">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-96`} />}>
        <Board params={params} />
      </Suspense>
    </main>
  );
}
