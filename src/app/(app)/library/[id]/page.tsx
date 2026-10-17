import Link from "next/link";
import { notFound } from "next/navigation";
import { kicker, roman } from "@/components/ui";
import { documents, findDoc, findSubject } from "@/lib/mock";

// Демо: документы известны заранее — страницы собираются статически.
export const generateStaticParams = () => documents.map((d) => ({ id: d.id }));

export default async function DocumentPage({ params }: PageProps<"/library/[id]">) {
  const { id } = await params;
  const doc = findDoc(id);
  if (!doc) notFound();
  const subj = findSubject(doc.subjectId)!;

  return (
    <article>
      <Link href="/library" className={`${kicker} hover:text-accent`}>← Указатель</Link>
      <header className="mt-4 border-b-[3px] border-double border-ink pb-5">
        <p className={kicker}>{subj.name} · {roman(subj.semester)} семестр · {doc.docType}</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 font-mono text-xs text-mute">{subj.teacher} · источник: {doc.source} · {doc.units.length} ед.</p>
      </header>

      {doc.units.length === 0 ? (
        <p className="py-12 text-center font-serif text-lg italic text-mute">Документ ещё индексируется.</p>
      ) : (
        doc.units.map((u) => (
          <section key={u.no} id={`unit-${u.no}`}
            className="group grid grid-cols-[3.5rem_1fr] gap-4 border-b border-rule py-5 transition-colors target:bg-mark/70 sm:grid-cols-[5rem_1fr]">
            <div className="text-right">
              <div className="font-mono text-2xl leading-none text-mute group-target:text-accent">{String(u.no).padStart(2, "0")}</div>
              <div className={`${kicker} mt-1 text-[10px]`}>{u.label.split(" ")[0]}</div>
            </div>
            <div className="max-w-prose space-y-3 pr-2">
              {u.text.split("\n\n").map((p, i) =>
                p.startsWith("> [!image]") ? (
                  <figure key={i} className="border-l-2 border-ink/40 pl-3 text-sm text-mute">
                    <span className={`${kicker} mr-2 text-ink`}>Рис.</span>{p.replace("> [!image]", "").trim()}
                  </figure>
                ) : (
                  <p key={i} className="font-serif text-[17px] leading-8">{p}</p>
                ),
              )}
            </div>
          </section>
        ))
      )}
    </article>
  );
}
