"use client";

import { Fragment, useState } from "react";
import { btn, card, err, h4, input, label, muted } from "@/components/ui";

export type FilterField = { key: string; label: string; type: "enum" | "int" | "bool"; values: string[] };
type Source = { n: number; document_id: string; filename: string; unit_label: string; unit_no: number; header: string; snippet: string; score: number | null };
type Meta = { query: string; auto: Record<string, unknown>; explicit: Record<string, unknown>; dropped: boolean };
type Unit = { no: number; label: string; text: string; current: boolean };
type Recent = { id: string; question: string; refused: boolean; feedback: number | null };

/** Разбор SSE из fetch: «event: x\ndata: {...}\n\n». */
async function readSse(res: Response, on: (event: string, data: unknown) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const ev = /^event: (.+)$/m.exec(p)?.[1];
      const data = /^data: (.+)$/m.exec(p)?.[1];
      if (ev && data) on(ev, JSON.parse(data));
    }
  }
}

const TABS = [["filters", "Фильтры"], ["answer", "Ответ"], ["source", "Источник"]] as const;

export default function Chat({ datasetId, fields, recent }: { datasetId: string; fields: FilterField[]; recent: Recent[] }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [nearest, setNearest] = useState(false);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState<{ id: string; refused: boolean; latency_ms: number } | null>(null);
  const [feedback, setFeedback] = useState<number | null>(null);
  const [open, setOpen] = useState<Source | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("answer");
  const [history, setHistory] = useState(recent);

  const typed = (f: FilterField, v: string) => (f.type === "int" ? Number(v) : f.type === "bool" ? v === "true" : v);

  async function ask(q = question, useAuto = auto, explicit = filters) {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setError("");
    setMeta(null);
    setSources([]);
    setAnswer("");
    setDone(null);
    setFeedback(null);
    setOpen(null);
    setUnits(null);
    setAsked(q.trim());
    setTab("answer");
    const body = { dataset_id: datasetId, question: q.trim(), auto: useAuto, filters: Object.fromEntries(Object.entries(explicit).filter(([, v]) => v !== "").map(([k, v]) => [k, typed(fields.find((f) => f.key === k)!, v)])) };
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `ошибка ${res.status}`);
      await readSse(res, (ev, data) => {
        if (ev === "meta") setMeta(data as Meta);
        if (ev === "sources") {
          const d = data as { sources: Source[]; nearest: boolean };
          setSources(d.sources);
          setNearest(d.nearest);
        }
        if (ev === "token") setAnswer((a) => a + (data as { t: string }).t);
        if (ev === "done") {
          const d = data as { id: string; refused: boolean; latency_ms: number };
          setDone(d);
          setHistory((h) => [{ id: d.id, question: q.trim(), refused: d.refused, feedback: null }, ...h].slice(0, 12));
        }
        if (ev === "error") setError((data as { message: string }).message);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function show(s: Source) {
    setOpen(s);
    setUnits(null);
    setTab("source");
    const r = await fetch(`/api/documents/${s.document_id}/units?no=${s.unit_no}`);
    const j = await r.json().catch(() => ({}));
    setUnits(r.ok ? j.units : []);
  }

  async function rate(v: number) {
    if (!done) return;
    const next = feedback === v ? null : v;
    setFeedback(next);
    await fetch(`/api/questions/${done.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ feedback: next }) });
  }

  // снять автофильтр: повторить вопрос без автофильтров, явные фильтры остаются
  const dropAuto = () => {
    setAuto(false);
    ask(asked, false);
  };

  const cite = (text: string) =>
    text.split(/(\[\d{1,2}\])/g).map((part, i) => {
      const n = /^\[(\d{1,2})\]$/.exec(part)?.[1];
      const s = n ? sources.find((x) => x.n === Number(n)) : undefined;
      return s ? (
        <button key={i} type="button" onClick={() => show(s)} className="mx-0.5 rounded bg-acc-soft px-1 font-mono text-[11px] text-acc hover:underline" title={`${s.filename} · ${s.unit_label}`}>
          {n}
        </button>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      );
    });

  const col = (t: (typeof TABS)[number][0]) => (tab === t ? "block" : "hidden md:block");

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-lg border border-line bg-panel p-1 md:hidden" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-2 py-1.5 text-sm ${tab === k ? "bg-acc-soft text-acc" : "text-mute"}`}>
            {l}{k === "source" && sources.length ? ` (${sources.length})` : ""}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_400px]">
        <aside className={`${col("filters")} space-y-4`}>
          <section className={card}>
            <h2 className={h4}>Фильтры</h2>
            {fields.length === 0 && <p className={muted}>В схеме нет полей-фильтров.</p>}
            <div className="space-y-2">
              {fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`f-${f.key}`} className={label}>{f.label}</label>
                  <select id={`f-${f.key}`} className={`${input} py-2 text-sm`} value={filters[f.key] ?? ""} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}>
                    <option value="">все</option>
                    {f.values.map((v) => <option key={v} value={v}>{f.type === "bool" ? (v === "true" ? "да" : "нет") : v}</option>)}
                  </select>
                </div>
              ))}
              <label className="flex items-center gap-2 pt-1 text-sm">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> автофильтры из вопроса
              </label>
            </div>
          </section>
          <section className={card}>
            <h2 className={h4}>Мои вопросы</h2>
            {history.length === 0 ? <p className={muted}>Пока пусто.</p> : (
              <ul className="space-y-1 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="w-full truncate text-left hover:text-acc" title={h.question} onClick={() => { setQuestion(h.question); setTab("answer"); }}>
                      {h.refused ? "∅ " : ""}{h.feedback === -1 ? "👎 " : h.feedback === 1 ? "👍 " : ""}{h.question}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className={`${col("answer")} min-w-0 space-y-3`}>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <label htmlFor="q" className="sr-only">Вопрос</label>
            <input id="q" className={input} placeholder="Например: что такое третья нормальная форма?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} />
            <button type="submit" className={btn} disabled={busy || question.trim().length < 2}>{busy ? "…" : "Спросить"}</button>
          </form>
          {error && (
            <p role="alert" className={err}>
              {error} <button type="button" className="underline" onClick={() => ask(asked)}>Повторить</button>
            </p>
          )}
          {!asked && !error && <div className={`${card} text-sm text-mute`}>Задайте вопрос по материалам датасета. Ответ придёт со сносками на документ и страницу или слайд; источник откроется справа.</div>}
          {asked && (
            <article className={card}>
              <h2 className="mb-2 font-semibold">{asked}</h2>
              {meta && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-sub px-1.5 py-0.5 font-mono text-mute" title="запрос после переписывания">🔎 {meta.query}</span>
                  {Object.entries(meta.explicit).map(([k, v]) => <span key={k} className="rounded bg-sub px-1.5 py-0.5 text-mute">{fields.find((f) => f.key === k)?.label ?? k}: {String(v)}</span>)}
                  {Object.entries(meta.auto).map(([k, v]) => (
                    <button key={k} type="button" onClick={dropAuto} className="rounded bg-acc-soft px-1.5 py-0.5 text-acc" title="автофильтр — снять и спросить заново">
                      авто · {fields.find((f) => f.key === k)?.label ?? k}: {String(v)} ×
                    </button>
                  ))}
                  {meta.dropped && <span className="text-warn">автофильтр ничего не нашёл — искали без него</span>}
                </div>
              )}
              {!answer && busy && <div className="space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-sub" /><div className="h-3 w-1/2 animate-pulse rounded bg-sub" /></div>}
              <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{cite(answer)}</div>
              {done && (
                <div className="mt-3 flex items-center gap-2 text-xs text-mute">
                  <button type="button" aria-pressed={feedback === 1} onClick={() => rate(1)} className={`rounded border border-line px-2 py-1 ${feedback === 1 ? "bg-ok/15" : ""}`}>👍</button>
                  <button type="button" aria-pressed={feedback === -1} onClick={() => rate(-1)} className={`rounded border border-line px-2 py-1 ${feedback === -1 ? "bg-bad/15" : ""}`}>👎</button>
                  <span>{(done.latency_ms / 1000).toFixed(1)} с{done.refused ? " · отказ: в найденных фрагментах ответа нет" : ""}</span>
                </div>
              )}
            </article>
          )}
        </section>

        <aside className={`${col("source")} min-w-0 space-y-3 md:col-span-2 xl:col-span-1`}>
          <section className={card}>
            <h2 className={h4}>{nearest ? "Ближайшие документы" : "Источники"}</h2>
            {sources.length === 0 ? <p className={muted}>{busy ? "Ищем…" : "Появятся после вопроса."}</p> : (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.n}>
                    <button type="button" onClick={() => show(s)} className={`w-full rounded-lg border p-2 text-left text-sm ${open?.n === s.n ? "border-acc" : "border-line hover:bg-sub"}`}>
                      <div className="flex justify-between gap-2"><b className="font-mono text-acc">[{s.n}]</b><span className="font-mono text-[11px] text-mute">{s.unit_label}{s.score !== null ? ` · ${s.score}/10` : ""}</span></div>
                      <div className="truncate">{s.filename}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {open && (
            <section className={card}>
              <h2 className="mb-2 break-words text-sm font-semibold">[{open.n}] {open.filename}</h2>
              {!units ? <div className="h-24 animate-pulse rounded bg-sub" /> : units.length === 0 ? <p className={err}>Не удалось открыть документ.</p> : (
                <div className="max-h-[60vh] space-y-2 overflow-auto">
                  {units.map((u) => (
                    <div key={u.no} ref={u.current ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined} className={`rounded-md p-2 ${u.current ? "bg-hl" : "bg-sub"}`}>
                      <div className="mb-1 font-mono text-[11px] uppercase text-mute">{u.label}</div>
                      <p className="whitespace-pre-wrap break-words text-[13px]">{u.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
