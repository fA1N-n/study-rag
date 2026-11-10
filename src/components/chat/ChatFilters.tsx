import Link from "next/link";
import { h4 } from "@/components/ui";

export type FilterField = { key: string; label: string; values: string[] };
export type HistoryItem = { id: string; question: string; refused: boolean };

export default function ChatFilters({
  fields,
  selected,
  history,
  activeId,
  hrefFor,
}: {
  fields: FilterField[];
  selected: Record<string, string>;
  history: HistoryItem[];
  activeId: string | null;
  hrefFor: (questionId: string) => string;
}) {
  return (
    <>
      <form className="mb-6" aria-labelledby="filters-h">
        <h2 id="filters-h" className={h4}>Фильтры из схемы</h2>
        {activeId && <input type="hidden" name="q" value={activeId} />}
        {fields.length === 0 ? (
          <p className="text-[13px] text-mute">В правилах нет полей-фильтров.</p>
        ) : (
          <div className="space-y-1.5">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] focus-within:border-acc">
                <span className="font-medium">{f.label}</span>
                <select
                  name={f.key}
                  defaultValue={selected[f.key] ?? ""}
                  className="min-w-0 max-w-[9.5rem] truncate bg-transparent text-right text-xs text-mute outline-none"
                >
                  <option value="">все</option>
                  {f.values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <div className="mt-2 flex gap-2">
            <button className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs hover:bg-sub">Применить</button>
            {Object.keys(selected).length > 0 && (
              <Link href={activeId ? `?q=${activeId}` : "?"} className="rounded-md px-2.5 py-1 text-xs text-mute hover:text-ink">Сбросить</Link>
            )}
          </div>
        )}
      </form>
      <nav aria-labelledby="history-h">
        <h2 id="history-h" className={h4}>История</h2>
        {history.length === 0 ? (
          <p className="text-[13px] text-mute">Вопросов пока нет — задайте первый.</p>
        ) : (
          <ul className="space-y-0.5">
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  href={hrefFor(h.id)}
                  aria-current={h.id === activeId ? "page" : undefined}
                  title={h.question}
                  className={`block truncate rounded-md px-2 py-1.5 text-[13px] ${h.id === activeId ? "bg-acc-soft text-acc" : "hover:bg-sub"} ${h.refused ? "text-mute" : ""}`}
                >
                  {h.question}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </>
  );
}
