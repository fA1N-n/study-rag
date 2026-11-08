import Link from "next/link";
import { Suspense } from "react";
import type { FieldDef } from "@/components/LabelEditor";
import ReviewForm from "@/components/ReviewForm";
import { card, muted, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";
import { parseDocument } from "@/lib/labeling/units";

async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ds, sb, mine } = await loadDataset(id);
  const { data: queue, count } = await sb
    .from("documents")
    .select("id,filename", { count: "exact" })
    .eq("dataset_id", id)
    .eq("label_status", "review")
    .order("filename")
    .limit(500);
  const list = queue ?? [];
  if (!list.length)
    return (
      <div className={`${card} text-center`}>
        <h1 className="mb-1 text-xl font-semibold">Очередь проверки пуста</h1>
        <p className={muted}>Сюда попадают документы, где разметчики не уверены или арбитр не решил спор.</p>
      </div>
    );

  const want = typeof sp.doc === "string" ? sp.doc : "";
  const idx = Math.max(0, list.findIndex((d) => d.id === want));
  const cur = list[idx];
  const next = list[idx + 1] ?? (idx > 0 ? list[0] : null);

  const [{ data: doc }, { data: votes }, rs] = await Promise.all([
    sb.from("documents").select("*").eq("id", cur.id).single(),
    sb.from("labels").select("agent,model,values,confidence,rationale").eq("document_id", cur.id).in("agent", ["A", "B", "referee"]).order("agent"),
    ds.active_ruleset_id ? sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).single() : Promise.resolve({ data: null }),
  ]);
  const file = await sb.storage.from("datasets").download(doc!.storage_path);
  const units = file.data ? parseDocument(await file.data.text()).units.slice(0, 6) : [];
  const fields = (rs.data?.fields ?? []) as (FieldDef & { filter?: boolean })[];
  const v = votes ?? [];
  const keyF = fields.filter((f) => f.required || f.filter).map((f) => f.key);
  const a = v.find((x) => x.agent === "A")?.values ?? {};
  const b = v.find((x) => x.agent === "B")?.values ?? {};
  const disputed = keyF.filter((k) => String(a[k] ?? "") !== String(b[k] ?? ""));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0">
        <p className="font-mono text-xs text-mute">{idx + 1} / {count} в очереди</p>
        <h1 className="mt-1 break-words text-lg font-semibold">{doc!.filename}</h1>
        <p className={`${muted} mb-3`}>{doc!.units} ед. · <Link className="text-acc" href={`/d/${id}/docs/${cur.id}`}>открыть документ</Link></p>
        <div className="space-y-2">
          {units.map((u) => (
            <article key={u.label + u.no} className="rounded-lg border border-line bg-panel p-3">
              <h2 className="mb-1 font-mono text-[11px] uppercase text-mute">{u.label}</h2>
              <p className="line-clamp-[12] whitespace-pre-wrap break-words text-[13px]">{u.text}</p>
            </article>
          ))}
        </div>
      </section>
      <aside className={card}>
        {mine && fields.length ? (
          <ReviewForm
            key={cur.id}
            docId={cur.id}
            nextHref={next ? `?doc=${next.id}` : null}
            fields={fields}
            current={doc!.labels ?? {}}
            votes={v.map((x) => ({ ...x, agent: x.agent === "referee" ? "арбитр" : x.agent }))}
            disputed={disputed}
          />
        ) : (
          <p className={muted}>{fields.length ? "Решать может только владелец датасета." : "Нет правил разметки."}</p>
        )}
      </aside>
    </div>
  );
}

export default function ReviewPage({ params, searchParams }: PageProps<"/d/[id]/review">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-96`} />}>
        <Review params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
