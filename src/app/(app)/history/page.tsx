"use client";

import { useState } from "react";
import AnswerView from "@/components/AnswerView";
import { card, input, muted } from "@/components/ui";
import { history } from "@/lib/mock";

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const items = history.filter((h) => h.question.toLowerCase().includes(search.toLowerCase()) && (!onlyBad || h.feedback === -1));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">История вопросов</h1>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input className={input} placeholder="Поиск по вопросам" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> только с 👎
        </label>
      </div>

      {items.length === 0 ? (
        <div className={`${card} text-center`}><p className={muted}>Ничего не найдено.</p></div>
      ) : (
        <ul className="space-y-2">
          {items.map((h) => (
            <li key={h.id} className={card}>
              <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
                <div>
                  <div className="font-medium">{h.question}</div>
                  <div className={`${muted} text-xs`}>{h.date}{h.refused && " · ответа нет в материалах"}</div>
                </div>
                <span>{h.feedback === 1 ? "👍" : h.feedback === -1 ? "👎" : ""}</span>
              </button>
              {open === h.id && <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"><AnswerView text={h.answer} sources={h.sources} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
