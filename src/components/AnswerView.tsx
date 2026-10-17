import { findDoc, findSubject, type Source } from "@/lib/mock";
import { kicker, roman } from "./ui";

// Текст ответа: сноски [n] → надстрочные номера со ссылкой на источник внизу.
function withCitations(text: string) {
  return text.split(/(\[\d+\])/).map((part, i) =>
    /^\[\d+\]$/.test(part) ? (
      <sup key={i}>
        <a href={`#src-${part.slice(1, -1)}`} className="ml-0.5 font-mono text-[11px] font-medium text-accent hover:underline">
          {part.slice(1, -1)}
        </a>
      </sup>
    ) : (
      part
    ),
  );
}

export function Footnotes({ sources }: { sources: Source[] }) {
  return (
    <ol className="mt-6 space-y-4 border-t border-rule pt-4">
      {sources.map((s) => {
        const doc = findDoc(s.docId)!;
        const unit = doc.units.find((x) => x.no === s.unitNo)!;
        const subj = findSubject(doc.subjectId)!;
        return (
          <li key={s.n} id={`src-${s.n}`} className="grid grid-cols-[1.75rem_1fr] text-sm">
            <span className="font-mono text-accent">{s.n}</span>
            {/* обычная ссылка: браузер сам прокрутит к якорю слайда */}
            <a href={`/library/${doc.id}#unit-${unit.no}`} className="group">
              <span className="font-medium group-hover:text-accent group-hover:underline">{doc.title}</span>
              <span className="text-mute">, {unit.label.toLowerCase()}</span>
              <span className={`${kicker} mt-0.5 block`}>{subj.name} · {roman(subj.semester)} сем. · {doc.docType}</span>
              <span className="mt-1 line-clamp-2 block text-[13px] text-mute">{unit.text.replace(/> \[!image\]\s*/g, "Рис.: ")}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export default function AnswerView({ text, sources, typing = false }: { text: string; sources: Source[]; typing?: boolean }) {
  return (
    <div>
      <p className={`max-w-prose whitespace-pre-wrap font-serif text-[17px] leading-8 ${typing ? "caret" : ""}`}>{withCitations(text)}</p>
      {sources.length > 0 && <Footnotes sources={sources} />}
    </div>
  );
}
