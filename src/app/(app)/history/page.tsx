"use client";

import { useState } from "react";
import AnswerView from "@/components/AnswerView";
import { input, kicker } from "@/components/ui";
import { history } from "@/lib/mock";

const FEEDBACK = { 1: "полезен", 0: "", [-1]: "не то" } as const;

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const items = history.filter((h) => h.question.toLowerCase().includes(search.toLowerCase()) && (!onlyBad || h.feedback === -1));

  return (
    <div>
      <p className={kicker}>Журнал</p>
      <h1 className="mt-2 font-serif text-4xl">Ваши вопросы</h1>
      <div className="mt-6 flex flex-col gap-4 border-b border-ink pb-3 sm:flex-row sm:items-end">
        <input className={input} placeholder="Поиск по вопросам" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по вопросам" />
        <label className={`${kicker} flex shrink-0 cursor-pointer items-center gap-2 pb-2`}>
          <input type="checkbox" className="accent-[var(--accent)]" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> только «не то»
        </label>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center font-serif text-lg italic text-mute">Ничего не найдено.</p>
      ) : (
        <ul>
          {items.map((h) => (
            <li key={h.id} className="border-b border-rule">
              <button className="flex w-full flex-col gap-1 py-4 text-left sm:grid sm:grid-cols-[8.5rem_1fr_auto] sm:gap-x-4"
                onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
                <span className="font-mono text-xs text-mute sm:pt-1.5">{h.date}<span className={`ml-3 sm:hidden ${h.feedback === -1 ? "text-accent" : ""}`}>{FEEDBACK[h.feedback]}</span></span>
                <span className="font-serif text-lg leading-snug hover:text-accent">
                  {h.question}
                  {h.refused && <span className={`${kicker} ml-2 text-accent`}>нет в фонде</span>}
                </span>
                <span className={`${kicker} hidden sm:block sm:pt-1.5 ${h.feedback === -1 ? "text-accent" : ""}`}>{FEEDBACK[h.feedback]}</span>
              </button>
              {open === h.id && <div className="pb-6 sm:pl-[9.5rem]"><AnswerView text={h.answer} sources={h.sources} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
