import { findDoc, findSubject, type Source } from "@/lib/mock";
import { card, muted } from "./ui";

// Текст ответа со сносками [n] → ссылки на источник.
function withCitations(text: string) {
  return text.split(/(\[\d+\])/).map((part, i) =>
    /^\[\d+\]$/.test(part) ? (
      <a key={i} href={`#src-${part.slice(1, -1)}`} className="mx-0.5 align-super text-xs font-semibold text-indigo-600">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function SourceCards({ sources }: { sources: Source[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {sources.map((s) => {
        const doc = findDoc(s.docId)!;
        const unit = doc.units.find((x) => x.no === s.unitNo)!;
        const subj = findSubject(doc.subjectId)!;
        return (
          <li key={s.n} id={`src-${s.n}`}>
            {/* обычная ссылка: браузер сам прокрутит к якорю слайда */}
            <a href={`/library/${doc.id}#unit-${unit.no}`} className={`${card} block p-3 hover:border-indigo-400`}>
              <div className="text-xs text-indigo-600">[{s.n}] {subj.name} · {subj.semester} сем</div>
              <div className="text-sm font-medium">{doc.title} — {unit.label}</div>
              <p className={`${muted} mt-1 line-clamp-2 text-xs`}>{unit.text.replace(/> \[!image\]\s*/g, "🖼 ")}</p>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export default function AnswerView({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <div className="space-y-3">
      <p className="leading-relaxed whitespace-pre-wrap">{withCitations(text)}</p>
      {sources.length > 0 && <SourceCards sources={sources} />}
    </div>
  );
}
