import Link from "next/link";
import { Suspense } from "react";
import DeleteButton from "@/components/DeleteButton";
import LabelEditor, { type FieldDef } from "@/components/LabelEditor";
import { card, h4, muted, pill, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";
import { parseDocument } from "@/lib/labeling/units";

async function Doc({ params, searchParams }: { params: Promise<{ id: string; docId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id, docId }, sp] = await Promise.all([params, searchParams]);
  const { ds, sb, mine } = await loadDataset(id);
  const { data: doc } = await sb.from("documents").select("*").eq("id", docId).eq("dataset_id", id).maybeSingle();
  if (!doc) return <div className={card}>Документ не найден. <Link href={`/d/${id}/docs`} className="text-acc">К списку</Link></div>;

  const [file, rs, votes] = await Promise.all([
    sb.storage.from("datasets").download(doc.storage_path),
    ds.active_ruleset_id ? sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("labels").select("agent,model,values,confidence,rationale,created_at").eq("document_id", docId).order("created_at"),
  ]);
  const units = file.data ? parseDocument(await file.data.text()).units : [];
  const focus = Number(typeof sp.unit === "string" ? sp.unit : NaN);
  const fields = (rs.data?.fields ?? []) as FieldDef[];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <Link href={`/d/${id}/docs`} className="text-sm text-mute hover:text-acc">← Документы</Link>
        <h1 className="mt-1 break-words text-lg font-semibold">{doc.filename}</h1>
        <p className={`${muted} mb-4`}>
          {doc.units} ед. · <span className={pill(doc.label_status)}>{doc.label_status}</span>
          {doc.pii_flag && " · персональные данные замаскированы"}
        </p>
        {file.error && <p className="text-bad">Не удалось открыть файл: {file.error.message}</p>}
        <div className="space-y-2.5">
          {units.map((u) => (
            <article key={u.label + u.no} id={`u${u.no}`} className={`rounded-lg border p-4 ${u.no === focus ? "border-acc bg-acc-soft/40" : "border-line bg-panel"}`}>
              <h2 className="mb-2 font-mono text-[11px] uppercase text-mute">{u.label}</h2>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{u.text || <span className="text-mute">(пусто)</span>}</p>
            </article>
          ))}
        </div>
      </section>
      <aside className="space-y-4">
        <div className={card}>
          <h2 className={h4}>Метки</h2>
          {fields.length === 0 ? <p className={muted}>Правила ещё не утверждены.</p> : mine ? (
            <LabelEditor docId={docId} fields={fields} labels={doc.labels ?? {}} />
          ) : (
            <dl className="space-y-1 text-sm">
              {fields.map((f) => <div key={f.key} className="flex justify-between gap-2"><dt className="text-mute">{f.label}</dt><dd className="text-right">{String(doc.labels?.[f.key] ?? "—")}</dd></div>)}
            </dl>
          )}
        </div>
        {(votes.data ?? []).length > 0 && (
          <div className={card}>
            <h2 className={h4}>Решения агентов</h2>
            <ul className="space-y-3 text-xs">
              {votes.data!.map((v, i) => (
                <li key={i}>
                  <b>{v.agent}</b> <span className="text-mute">{v.model} · {v.confidence?.toFixed(2)}</span>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-mute">{JSON.stringify(v.values)}</pre>
                  {v.rationale && <p className="mt-1 italic">«{v.rationale}»</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {mine && <DeleteButton url={`/api/documents/${docId}`} what="документ" after={`/d/${id}/docs`} />}
      </aside>
    </div>
  );
}

export default function DocPage({ params, searchParams }: PageProps<"/d/[id]/docs/[docId]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-96`} />}>
        <Doc params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
