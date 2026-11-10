import Link from "next/link";
import { h4 } from "@/components/ui";
import { highlight, type Source } from "@/lib/chat";
import { parseDocument } from "@/lib/labeling/units";
import { db } from "@/lib/supabase/server";

export function SourceEmpty({ text }: { text: string }) {
  return (
    <>
      <h2 className={h4}>Источник</h2>
      <p className="text-[13px] text-mute">{text}</p>
    </>
  );
}

/** Документ источника: единица со сноской подсвечена, соседние ±1 — приглушены. */
export default async function SourceViewer({ datasetId, source, position, total }: { datasetId: string; source: Source; position: number; total: number }) {
  const sb = await db();
  const { data: doc } = await sb
    .from("documents")
    .select("id,filename,storage_path,labels,label_status")
    .eq("id", source.document_id)
    .eq("dataset_id", datasetId)
    .maybeSingle();
  if (!doc) return <SourceEmpty text="Документ источника удалён или недоступен." />;

  const file = await sb.storage.from("datasets").download(doc.storage_path);
  const units = file.data ? parseDocument(await file.data.text()).units : [];
  const at = units.findIndex((u) => u.no === source.unit_no || u.label === source.unit_label);
  const around = at < 0 ? [] : units.slice(Math.max(0, at - 1), at + 2);
  const tags = Object.values((doc.labels ?? {}) as Record<string, unknown>)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .slice(0, 5)
    .map(String);

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 break-words text-sm font-semibold">{doc.filename}</h2>
        <span className="shrink-0 font-mono text-xs text-mute">{position} / {total}</span>
      </div>
      <ul className="mb-3.5 mt-2 flex flex-wrap gap-1" aria-label="Метки документа">
        {[...tags, doc.label_status].map((t, i) => (
          <li key={i} className="rounded bg-sub px-1.5 py-px text-[11px] text-mute">{t}</li>
        ))}
      </ul>
      {around.length === 0 ? (
        <p className="text-[13px] text-mute">{file.error ? "Не удалось загрузить текст документа." : `«${source.unit_label}» не найдена в документе.`}</p>
      ) : (
        <div className="space-y-2.5">
          {around.map((u) => {
            const cur = u === units[at];
            const [before, mark, after] = cur ? highlight(u.text, source.quote) : ["", "", u.text];
            return (
              <section key={u.label + u.no} className={`rounded-lg border bg-bg px-4 py-3.5 ${cur ? "border-line" : "border-line opacity-55"}`} aria-current={cur ? "true" : undefined}>
                <h3 className="mb-2 font-mono text-[11px] font-medium uppercase text-mute">
                  {u.label}{cur && ` · источник [${source.n}]`}
                </h3>
                <p className={`whitespace-pre-wrap break-words text-[13px] ${cur ? "" : "line-clamp-4"}`}>
                  {before}
                  {mark && <mark className="rounded-sm bg-hl px-0.5 text-ink">{mark}</mark>}
                  {after}
                </p>
              </section>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex justify-end text-xs">
        <Link href={`/d/${datasetId}/docs/${doc.id}${source.unit_no != null ? `#u${source.unit_no}` : ""}`} className="text-acc hover:underline">
          открыть документ →
        </Link>
      </div>
    </>
  );
}
