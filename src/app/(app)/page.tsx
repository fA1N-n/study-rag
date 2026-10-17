"use client";

import { useEffect, useRef, useState } from "react";
import AnswerView from "@/components/AnswerView";
import { btn, btnGhost, card, input, muted } from "@/components/ui";
import { DOC_TYPES, examples, findAnswer, findDoc, findSubject, subjects, type Answer } from "@/lib/mock";

type Filters = { subjectId: string; semester: string; docType: string };
type Turn = { q: string; answer: Answer | null; shown: number; phase: "search" | "stream" | "done"; feedback: -1 | 0 | 1 };

const REFUSAL = "В материалах не нашёл ответа на этот вопрос. Попробуйте переформулировать или снять фильтры.";

// Подходит ли найденный ответ под фильтры из UI.
function matches(a: Answer, f: Filters) {
  return a.sources.some((s) => {
    const doc = findDoc(s.docId)!;
    const subj = findSubject(doc.subjectId)!;
    return (!f.subjectId || subj.id === f.subjectId) && (!f.semester || String(subj.semester) === f.semester) && (!f.docType || doc.docType === f.docType);
  });
}

export default function ChatPage() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>({ subjectId: "", semester: "", docType: "" });
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.phase !== "done");

  const update = (i: number, patch: Partial<Turn>) => setTurns((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  function ask(question: string) {
    if (!question.trim() || busy) return;
    const found = findAnswer(question);
    const answer = found && matches(found, filters) ? found : null;
    const i = turns.length;
    setTurns((ts) => [...ts, { q: question.trim(), answer, shown: 0, phase: "search", feedback: 0 }]);
    setQ("");
    // Демо-стрим: имитируем поиск, затем печатаем ответ по кусочкам.
    setTimeout(() => {
      const full = answer?.text ?? REFUSAL;
      update(i, { phase: "stream" });
      let n = 0;
      const timer = setInterval(() => {
        n = Math.min(full.length, n + 6);
        update(i, { shown: n, ...(n === full.length && { phase: "done" }) });
        if (n === full.length) clearInterval(timer);
      }, 25);
    }, 900);
  }

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  const select = (key: keyof Filters, options: [string, string][], placeholder: string) => (
    <select aria-label={placeholder} className={input} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <details className={card} open>
        <summary className="cursor-pointer text-sm font-medium">
          Фильтры{activeFilters > 0 && <span className="ml-2 rounded-full bg-indigo-100 px-2 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">{activeFilters}</span>}
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {select("subjectId", subjects.map((s) => [s.id, `${s.name} (${s.semester} сем)`]), "Все предметы")}
          {select("semester", [1, 2, 3, 4, 5].map((n) => [String(n), `${n} семестр`]), "Все семестры")}
          {select("docType", DOC_TYPES.map((t) => [t, t]), "Все типы")}
        </div>
      </details>

      {turns.length === 0 && (
        <div className={`${card} text-center`}>
          <h1 className="text-lg font-semibold">Спросите что-нибудь по учёбе</h1>
          <p className={`${muted} mb-4`}>Ответ строится только по материалам группы, со ссылкой на документ и слайд.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map((e) => <button key={e} className={btnGhost} onClick={() => ask(e)}>{e}</button>)}
          </div>
        </div>
      )}

      {turns.map((t, i) => {
        const text = (t.answer?.text ?? REFUSAL).slice(0, t.shown);
        return (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-white">{t.q}</div>
            <div className={card}>
              {t.answer && t.phase !== "search" && (
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">искал в: {t.answer.autoFilter}</span>
                </div>
              )}
              {t.phase === "search" ? (
                <p className={`${muted} animate-pulse`}>Ищу в материалах…</p>
              ) : !t.answer ? (
                <p className="text-amber-700 dark:text-amber-300">{text}</p>
              ) : (
                <AnswerView text={text} sources={t.phase === "done" ? t.answer.sources : []} />
              )}
              {t.phase === "done" && t.answer && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={muted}>Ответ полезен?</span>
                  {([1, -1] as const).map((v) => (
                    <button key={v} aria-label={v === 1 ? "Полезно" : "Бесполезно"} onClick={() => update(i, { feedback: t.feedback === v ? 0 : v })}
                      className={`rounded-lg border px-2 py-1 ${t.feedback === v ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-slate-300 dark:border-slate-700"}`}>
                      {v === 1 ? "👍" : "👎"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottom} />

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-4 flex gap-2 rounded-xl bg-[var(--background)] p-1">
        <input className={input} placeholder="Например: чем мьютекс отличается от семафора?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} />
        <button className={btn} disabled={busy || !q.trim()}>{busy ? "…" : "Спросить"}</button>
      </form>
    </div>
  );
}
