import { Suspense } from "react";
import AnswerView from "@/components/chat/AnswerView";
import AskForm from "@/components/chat/AskForm";
import ChatFilters, { type FilterField } from "@/components/chat/ChatFilters";
import ChatShell from "@/components/chat/ChatShell";
import SourceViewer, { SourceEmpty } from "@/components/chat/SourceViewer";
import { skeleton } from "@/components/ui";
import { parseSources } from "@/lib/chat";
import { loadDataset } from "@/lib/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Field = { key: string; label: string; filter?: boolean; values?: string[] };

async function Chat({ params, searchParams }: PageProps<"/d/[id]/chat">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ds, sb } = await loadDataset(id);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const [rs, hist] = await Promise.all([
    ds.active_ruleset_id ? sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("questions").select("id,question,refused").eq("dataset_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const fields: FilterField[] = ((rs.data?.fields ?? []) as Field[])
    .filter((f) => f.filter && f.values?.length)
    .map((f) => ({ key: f.key, label: f.label, values: f.values! }));
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const selected: Record<string, string> = {};
  for (const f of fields) if (f.values.includes(one(f.key))) selected[f.key] = one(f.key);

  const history = hist.data ?? [];
  const qid = UUID.test(one("q")) ? one("q") : (history[0]?.id ?? null);
  const { data: cur } = qid
    ? await sb.from("questions").select("question,answer,refused,rewritten_query,filters,sources,latency_ms").eq("id", qid).eq("dataset_id", id).maybeSingle()
    : { data: null };
  const sources = cur ? parseSources(cur.sources) : [];
  const sn = Number(one("s"));
  const active = sources.find((s) => s.n === sn) ?? sources[0] ?? null;

  const link = (extra: Record<string, string>) => `?${new URLSearchParams({ ...selected, ...extra })}`;

  return (
    <ChatShell
      sourceLabel={active ? `[${active.n}]` : undefined}
      filters={<ChatFilters fields={fields} selected={selected} history={history} activeId={cur ? qid : null} hrefFor={(q) => link({ q })} />}
      answer={
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col px-4 pt-5 md:px-8 md:pt-6">
          <div className="flex-1">
            {cur ? (
              <AnswerView
                item={{
                  question: cur.question,
                  answer: cur.answer,
                  refused: cur.refused,
                  rewritten: cur.rewritten_query,
                  filters: (cur.filters ?? {}) as Record<string, string>,
                  latencyMs: cur.latency_ms,
                }}
                sources={sources}
                active={active?.n ?? null}
                hrefFor={(n) => link({ q: qid!, s: String(n) })}
                labelOf={labelOf}
              />
            ) : (
              <div className="rounded-[10px] border border-line bg-panel p-6">
                <h1 className="mb-1 text-lg font-semibold">Спросите по материалам «{ds.name}»</h1>
                <p className="text-sm text-mute">
                  Ответ строится только по документам датасета, каждое утверждение — со сноской [1], [2] на документ и слайд или страницу. Фильтры слева сужают поиск по меткам разметки.
                </p>
              </div>
            )}
          </div>
          <AskForm datasetId={id} filters={selected} />
        </div>
      }
      source={
        active ? (
          <Suspense key={`${qid}-${active.n}`} fallback={<div className={`${skeleton} h-64`} aria-busy="true" />}>
            <SourceViewer datasetId={id} source={active} position={sources.indexOf(active) + 1} total={sources.length} />
          </Suspense>
        ) : (
          <SourceEmpty text={cur ? "У этого ответа нет источников." : "Здесь появится текст источника с подсвеченным фрагментом."} />
        )
      }
    />
  );
}

export default function ChatPage(props: PageProps<"/d/[id]/chat">) {
  return (
    <Suspense fallback={<div className={`${skeleton} m-4 h-[60vh]`} aria-busy="true" aria-label="Загрузка чата" />}>
      <Chat {...props} />
    </Suspense>
  );
}
