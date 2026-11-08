import Link from "next/link";
import { Suspense } from "react";
import { GenerateButton, RulesEditor } from "@/components/RulesActions";
import { card, h4, muted, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";

type Field = { key: string; label: string; type: string; required: boolean; filter: boolean; values?: string[]; allowedBy?: { field: string } };
const STATUS = { draft: "черновик", approved: "утверждена", archived: "в архиве" } as Record<string, string>;

async function Rules({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ds, sb, mine } = await loadDataset(id);
  const { data: versions } = await sb.from("rulesets").select("id,version,status,author,created_at").eq("dataset_id", id).order("version", { ascending: false });
  const list = versions ?? [];
  const want = Number(typeof sp.v === "string" ? sp.v : NaN);
  const pick = list.find((v) => v.version === want) ?? list.find((v) => v.id === ds.active_ruleset_id) ?? list[0];

  if (!pick)
    return (
      <div className={`${card} space-y-3`}>
        <h1 className="text-xl font-semibold">Правила разметки</h1>
        <p className={muted}>Правил ещё нет. Архитектор возьмёт стратифицированную выборку из 25 документов и предложит схему полей и правила; критик проверит их на 15 других документах; архитектор поправит. Затем вы правите и утверждаете.</p>
        {mine ? (ds.stats.documents ? <GenerateButton datasetId={id} /> : <Link className="text-acc" href={`/d/${id}/upload`}>Сначала загрузите документы</Link>) : <p className={muted}>Правила создаёт владелец датасета.</p>}
      </div>
    );

  const { data: rs } = await sb.from("rulesets").select("*").eq("id", pick.id).single();
  const fields = (rs!.fields ?? []) as Field[];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Правила v{rs!.version} <span className="ml-1 align-middle rounded-full bg-sub px-2 py-px text-[11px] font-normal text-mute">{STATUS[rs!.status]}</span></h1>
            <p className={muted}>Автор: {rs!.author === "agent" ? "агент (архитектор + критик)" : "человек"} · полей {fields.length} · примеров {(rs!.examples as unknown[]).length}</p>
          </div>
        </div>
        {mine && <RulesEditor id={rs!.id} fields={rs!.fields} rules={rs!.rules} status={rs!.status} />}
        <section className="overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-mute">
                <th className="px-3 py-2 font-medium">Поле</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 font-medium">Значения</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <b>{f.label}</b>
                    <div className="font-mono text-[11px] text-mute">{f.key}{f.required ? " · обязательное" : ""}{f.filter ? " · фильтр" : ""}{f.allowedBy ? ` · зависит от ${f.allowedBy.field}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{f.type}</td>
                  <td className="px-3 py-2">
                    {f.values ? (
                      <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
                        {f.values.map((v) => <span key={v} className="rounded bg-sub px-1.5 py-px text-[11px] text-mute">{v}</span>)}
                      </div>
                    ) : <span className="text-mute">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card}>
          <h2 className={h4}>Правила для разметчиков</h2>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">{rs!.rules}</pre>
        </section>
        {rs!.critique && (
          <details className={card}>
            <summary className="cursor-pointer text-sm font-semibold">Замечания критика</summary>
            <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-mute">{rs!.critique}</pre>
          </details>
        )}
      </div>
      <aside className="space-y-4">
        <div className={card}>
          <h2 className={h4}>Версии</h2>
          <ul className="space-y-1 text-sm">
            {list.map((v) => (
              <li key={v.id}>
                <Link href={`?v=${v.version}`} className={`flex justify-between rounded-md px-2 py-1 ${v.id === pick.id ? "bg-acc-soft text-acc" : "hover:bg-sub"}`}>
                  <span>v{v.version}{v.id === ds.active_ruleset_id ? " · активная" : ""}</span>
                  <span className="text-xs text-mute">{STATUS[v.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {mine && <div className={card}><GenerateButton datasetId={id} /></div>}
      </aside>
    </div>
  );
}

export default function RulesPage({ params, searchParams }: PageProps<"/d/[id]/rules">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-96`} />}>
        <Rules params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
