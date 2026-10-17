"use client";

import { useEffect, useRef, useState } from "react";
import AnswerView from "@/components/AnswerView";
import { btn, input, kicker, roman } from "@/components/ui";
import { DOC_TYPES, examples, findAnswer, findDoc, findSubject, subjects, type Answer } from "@/lib/mock";

type Filters = { subjectId: string; semester: string; docType: string };
type Turn = { q: string; answer: Answer | null; shown: number; phase: "search" | "stream" | "done"; feedback: -1 | 0 | 1 };

const REFUSAL = "В материалах ответа на этот вопрос нет. Попробуйте переформулировать или снять фильтры.";

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
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  const select = (key: keyof Filters, options: [string, string][], placeholder: string) => (
    <select aria-label={placeholder} className={`${input} py-1 text-sm`} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <span className={`${kicker} pb-1.5`}>Искать в</span>
        {select("subjectId", subjects.map((s) => [s.id, `${s.name} · ${roman(s.semester)}`]), "все предметы")}
        {select("semester", [1, 2, 3, 4, 5].map((n) => [String(n), `${roman(n)} семестр`]), "все семестры")}
        {select("docType", DOC_TYPES.map((t) => [t, t]), "все типы документов")}
      </div>

      {turns.length === 0 && (
        <section className="py-6">
          <p className={kicker}>Справочная по материалам пяти семестров</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.15] sm:text-5xl">
            Спросите — ответим по лекциям и методичкам, <em className="text-accent">со ссылкой на слайд</em>.
          </h1>
          <p className={`${kicker} mt-10 mb-2`}>Например</p>
          <ul className="divide-y divide-rule border-y border-rule">
            {examples.map((e) => (
              <li key={e}>
                <button onClick={() => ask(e)} className="group flex w-full items-baseline justify-between gap-4 py-3 text-left font-serif text-lg hover:text-accent">
                  {e}
                  <span className="font-mono text-sm text-mute transition-transform group-hover:translate-x-1 group-hover:text-accent">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {turns.map((t, i) => {
        const text = (t.answer?.text ?? REFUSAL).slice(0, t.shown);
        return (
          <article key={i} className="border-t border-ink pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={kicker}>Вопрос № {i + 1}</p>
              {t.answer && t.phase !== "search" && <p className={kicker}>искал в: <span className="text-ink">{t.answer.autoFilter}</span></p>}
            </div>
            <h2 className="mt-1 mb-4 font-serif text-2xl leading-snug">{t.q}</h2>
            {t.phase === "search" ? (
              <p className={`${kicker} caret`}>ищу в материалах</p>
            ) : !t.answer ? (
              <p className={`max-w-prose border-l-2 border-accent pl-4 font-serif text-[17px] italic leading-8 ${t.phase === "stream" ? "caret" : ""}`}>{text}</p>
            ) : (
              <AnswerView text={text} sources={t.phase === "done" ? t.answer.sources : []} typing={t.phase === "stream"} />
            )}
            {t.phase === "done" && t.answer && (
              <div className="mt-5 flex items-center gap-5">
                <span className={kicker}>Ответ</span>
                {([[1, "полезен"], [-1, "не то"]] as const).map(([v, l]) => (
                  <button key={v} aria-pressed={t.feedback === v} onClick={() => update(i, { feedback: t.feedback === v ? 0 : v })}
                    className={`font-mono text-xs uppercase tracking-wider underline underline-offset-4 ${
                      t.feedback === v ? "text-accent decoration-accent decoration-2" : "text-mute decoration-rule hover:text-ink"
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </article>
        );
      })}
      <div ref={bottom} />

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-0 -mx-4 flex items-end gap-3 border-t border-ink bg-paper px-4 pt-3 pb-5">
        <input className={`${input} font-serif text-lg`} placeholder="Ваш вопрос по учёбе…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} aria-label="Вопрос" />
        <button className={btn} disabled={busy || !q.trim()}>Спросить ↵</button>
      </form>
    </div>
  );
}
