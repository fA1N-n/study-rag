import Link from "next/link";
import { Suspense } from "react";
import { card, h4, muted, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";
import { currentStep, STATUS_RU, STEPS } from "@/lib/pipeline";

type Field = { key: string; label: string; filter?: boolean };

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, sb } = await loadDataset(id);
  const [{ data: docs }, { data: rules }] = await Promise.all([
    sb.from("documents").select("label_status,pii_flag,labels").eq("dataset_id", id).limit(5000),
    ds.active_ruleset_id ? sb.from("rulesets").select("version,status,fields").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const list = docs ?? [];
  const byStatus = Object.groupBy(list, (d) => d.label_status as string);
  const fields = ((rules?.fields ?? []) as Field[]).filter((f) => f.filter).slice(0, 4);
  const cur = currentStep(ds.status);
  const next = STEPS[cur];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{ds.name}</h1>
          <p className={muted}>{ds.description || "Без описания"} · статус: {STATUS_RU[ds.status] ?? ds.status}</p>
        </div>
        <Link href={`/d/${id}/${next.href}`} className="rounded-lg bg-acc px-3.5 py-2.5 font-semibold text-white hover:opacity-90">
          Дальше: {next.label}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Документов", list.length],
          ["Единиц (стр./слайдов)", ds.stats.units ?? 0],
          ["С ПДн (замаскированы)", list.filter((d) => d.pii_flag).length],
          ["Правила", rules ? `v${rules.version} · ${rules.status === "approved" ? "утверждены" : "черновик"}` : "нет"],
        ].map(([l, v]) => (
          <div key={l as string} className={card}>
            <div className="text-xs text-mute">{l}</div>
            <div className="text-2xl font-bold tracking-tight">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className={h4}>Статус разметки</h2>
          {list.length === 0 ? (
            <p className={muted}>Документов нет. <Link className="text-acc" href={`/d/${id}/upload`}>Загрузить</Link></p>
          ) : (
            <ul className="space-y-1 text-sm">
              {["unlabeled", "agreed", "refereed", "review", "human"].map((s) => (
                <li key={s} className="flex justify-between"><span>{s}</span><span className="font-mono">{byStatus[s]?.length ?? 0}</span></li>
              ))}
            </ul>
          )}
        </section>
        {fields.map((f) => {
          const counts = Object.entries(Object.groupBy(list.filter((d) => d.labels?.[f.key] != null), (d) => String(d.labels[f.key])))
            .map(([k, v]) => [k, v?.length ?? 0] as const)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
          const max = counts[0]?.[1] ?? 1;
          return (
            <section key={f.key} className={card}>
              <h2 className={h4}>{f.label}</h2>
              {counts.length === 0 ? <p className={muted}>Ещё не размечено</p> : (
                <ul className="space-y-1.5 text-sm">
                  {counts.map(([k, n]) => (
                    <li key={k}>
                      <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono text-mute">{n}</span></div>
                      <div className="h-1.5 rounded-full bg-sub"><div className="h-full rounded-full bg-acc" style={{ width: `${(n / max) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export default function DatasetPage({ params }: PageProps<"/d/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-64`} />}>
        <Overview params={params} />
      </Suspense>
    </main>
  );
}
