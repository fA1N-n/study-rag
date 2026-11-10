import Link from "next/link";
import { splitAnswer, type Source } from "@/lib/chat";

export type Answered = {
  question: string;
  answer: string | null;
  refused: boolean;
  rewritten: string | null;
  filters: Record<string, string>;
  latencyMs: number | null;
};

export default function AnswerView({
  item,
  sources,
  active,
  hrefFor,
  labelOf,
}: {
  item: Answered;
  sources: Source[];
  active: number | null;
  hrefFor: (n: number) => string;
  labelOf: (key: string) => string;
}) {
  const paragraphs = item.answer ? splitAnswer(item.answer, new Set(sources.map((s) => s.n))) : [];
  const meta = [
    item.rewritten && `запрос → «${item.rewritten}»`,
    sources.length && `${sources.length} ${sources.length === 1 ? "источник" : "источника"}`,
    item.latencyMs != null && `${(item.latencyMs / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`,
  ].filter(Boolean);

  return (
    <article>
      <h1 className="mb-2.5 text-lg font-semibold text-balance">{item.question}</h1>
      {Object.keys(item.filters).length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Фильтры ответа">
          {Object.entries(item.filters).map(([k, v]) => (
            <li key={k} className="rounded-full border border-acc px-2.5 py-0.5 text-xs text-acc">{labelOf(k)}: {v}</li>
          ))}
        </ul>
      )}
      {meta.length > 0 && <p className="mb-4 font-mono text-xs text-mute">{meta.join(" · ")}</p>}

      {item.refused || paragraphs.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel p-4 text-[15px] text-mute">
          В материалах нет ответа на этот вопрос. Попробуйте переформулировать или снять фильтры.
        </p>
      ) : (
        <div className="space-y-3 text-[15px] leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>
              {p.map((piece, j) =>
                "ref" in piece ? (
                  <sup key={j}>
                    <Link
                      href={hrefFor(piece.ref)}
                      scroll={false}
                      aria-label={`Источник ${piece.ref}`}
                      aria-current={piece.ref === active ? "true" : undefined}
                      className={`ml-0.5 inline-block min-w-[18px] rounded px-1 text-center font-mono text-[11px] font-medium leading-4 no-underline ${piece.ref === active ? "bg-acc text-white" : "bg-acc-soft text-acc hover:bg-acc hover:text-white"}`}
                    >
                      {piece.ref}
                    </Link>
                  </sup>
                ) : (
                  <span key={j}>{piece.text}</span>
                ),
              )}
            </p>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <ol className="mt-5 grid gap-1.5" aria-label="Источники">
          {sources.map((s) => (
            <li key={s.n}>
              <Link
                href={hrefFor(s.n)}
                scroll={false}
                aria-current={s.n === active ? "true" : undefined}
                className={`flex items-center gap-2.5 rounded-lg border bg-panel px-3 py-2 text-[13px] hover:border-acc ${s.n === active ? "border-acc" : "border-line"}`}
              >
                <span className="font-mono text-acc">[{s.n}]</span>
                <span className="min-w-0 truncate">{s.filename}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-mute">{s.unit_label.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
