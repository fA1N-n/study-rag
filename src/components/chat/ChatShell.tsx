"use client";

import { useState } from "react";

const TABS = [
  ["filters", "Фильтры"],
  ["answer", "Ответ"],
  ["source", "Источник"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Три колонки 240px | 1fr | 400px; до 768 px — вкладки «Фильтры / Ответ / Источник» (docs/design.md). */
export default function ChatShell({ filters, answer, source, sourceLabel }: { filters: React.ReactNode; answer: React.ReactNode; source: React.ReactNode; sourceLabel?: string }) {
  const [tab, setTab] = useState<Tab>("answer");
  const hide = (t: Tab) => (tab === t ? "" : "max-md:hidden");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Разделы чата" className="sticky top-12 z-10 flex border-b border-line bg-panel md:hidden">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2.5 text-[13px] ${tab === t ? "border-acc text-ink" : "border-transparent text-mute"}`}
          >
            {t === "source" && sourceLabel ? `${label} ${sourceLabel}` : label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 md:h-[calc(100dvh-88px)] md:grid-cols-[220px_minmax(0,1fr)_340px] lg:grid-cols-[240px_minmax(0,1fr)_400px]">
        <aside id="panel-filters" aria-labelledby="tab-filters" className={`overflow-y-auto border-line bg-panel p-4 md:border-r ${hide("filters")}`}>
          {filters}
        </aside>
        <section id="panel-answer" aria-labelledby="tab-answer" className={`min-w-0 overflow-y-auto ${hide("answer")}`}>
          {answer}
        </section>
        <aside id="panel-source" aria-labelledby="tab-source" className={`overflow-y-auto border-line bg-panel px-5 py-4 md:border-l ${hide("source")}`}>
          {source}
        </aside>
      </div>
    </div>
  );
}
