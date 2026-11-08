import Link from "next/link";
import { Suspense } from "react";
import { card, input, muted, pill, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";

const PAGE = 50;
type Field = { key: string; label: string; filter?: boolean; values?: string[] };

async function Docs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ds, sb } = await loadDataset(id);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = one("q").slice(0, 100);
  const status = one("status");
  const page = Math.max(1, Number(one("page")) || 1);

  const { data: rs } = ds.active_ruleset_id
    ? await sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).maybeSingle()
    : { data: null };
  const fields = ((rs?.fields ?? []) as Field[]).filter((f) => f.filter);
  const filter: Record<string, string> = {};
  for (const f of fields) if (one(f.key)) filter[f.key] = one(f.key);

  let query = sb.from("documents").select("id,filename,units,label_status,labels,pii_flag", { count: "exact" }).eq("dataset_id", id);
  if (q) query = query.ilike("filename", `%${q.replace(/[%_]/g, "\\$&")}%`);
  if (status) query = query.eq("label_status", status);
  if (Object.keys(filter).length) query = query.contains("labels", filter);
  const { data, count, error } = await query.order("filename").range((page - 1) * PAGE, page * PAGE - 1);
  if (error) return <p className="text-bad">Ошибка: {error.message}</p>;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>, page: String(p) })}`;
  const show = fields.slice(0, 3);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Документы · {ds.name}</h1>
          <p className={muted}>{count ?? 0} найдено</p>
        </div>
      </div>
      <form className="mb-4 flex flex-wrap gap-2 [&>*]:min-w-36 [&>input]:flex-[2_1_14rem] [&>select]:w-auto [&>select]:flex-1">
        <input name="q" defaultValue={q} placeholder="Поиск по имени файла" aria-label="Поиск по имени файла" className={input} />
        <select name="status" defaultValue={status} aria-label="Статус разметки" className={input}>
          <option value="">все статусы</option>
          {["unlabeled", "agreed", "refereed", "review", "human"].map((s) => <option key={s}>{s}</option>)}
        </select>
        {fields.filter((f) => f.values).slice(0, 3).map((f) => (
          <select key={f.key} name={f.key} defaultValue={one(f.key)} aria-label={f.label} className={input}>
            <option value="">{f.label}: все</option>
            {f.values!.map((v) => <option key={v}>{v}</option>)}
          </select>
        ))}
        <button className="rounded-lg border border-line bg-panel px-3 py-2 hover:bg-sub">Найти</button>
      </form>
      {(data ?? []).length === 0 ? (
        <div className={`${card} text-center`}>
          {count === 0 && !q && !status ? <>Документов нет. <Link href={`/d/${id}/upload`} className="text-acc">Загрузить</Link></> : "Ничего не найдено — измените фильтры."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-mute">
                <th className="px-3 py-2 font-medium">Документ</th>
                {show.map((f) => <th key={f.key} className="hidden px-3 py-2 font-medium md:table-cell">{f.label}</th>)}
                <th className="px-3 py-2 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((d) => (
                <tr key={d.id} className="border-t border-line hover:bg-sub/50">
                  <td className="max-w-0 px-3 py-2">
                    <Link href={`/d/${id}/docs/${d.id}`} className="block truncate hover:text-acc" title={d.filename}>{d.filename}</Link>
                    <span className="font-mono text-[11px] text-mute">{d.units} ед.{d.pii_flag ? " · ПДн скрыты" : ""}</span>
                  </td>
                  {show.map((f) => <td key={f.key} className="hidden px-3 py-2 text-mute md:table-cell">{String(d.labels?.[f.key] ?? "—")}</td>)}
                  <td className="px-3 py-2"><span className={pill(d.label_status)}>{d.label_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={link(page - 1)} className="text-acc">← назад</Link>}
          <span className="font-mono text-mute">{page} / {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="text-acc">дальше →</Link>}
        </nav>
      )}
    </>
  );
}

export default function DocsPage({ params, searchParams }: PageProps<"/d/[id]/docs">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-96`} />}>
        <Docs params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
