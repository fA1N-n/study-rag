import Link from "next/link";
import { notFound } from "next/navigation";
import { card, muted } from "@/components/ui";
import { documents, findDoc, findSubject } from "@/lib/mock";

// Демо: документы известны заранее — страницы собираются статически.
export const generateStaticParams = () => documents.map((d) => ({ id: d.id }));

export default async function DocumentPage({ params }: PageProps<"/library/[id]">) {
  const { id } = await params;
  const doc = findDoc(id);
  if (!doc) notFound();
  const subj = findSubject(doc.subjectId)!;

  return (
    <article className="space-y-4">
      <Link href="/library" className={`${muted} hover:text-indigo-600`}>← Библиотека</Link>
      <header className={card}>
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <p className={muted}>{subj.name} · {subj.semester} семестр · {subj.teacher} · {doc.docType} · источник: {doc.source}</p>
      </header>

      {doc.units.length === 0 ? (
        <div className={`${card} text-center`}><p className={muted}>Документ ещё индексируется.</p></div>
      ) : (
        doc.units.map((u) => (
          <section key={u.no} id={`unit-${u.no}`} className={`${card} target:border-indigo-500 target:ring-2 target:ring-indigo-500/30`}>
            <h2 className="mb-2 text-sm font-semibold text-indigo-600">{u.label}</h2>
            {u.text.split("\n\n").map((p, i) =>
              p.startsWith("> [!image]") ? (
                <p key={i} className="mt-2 rounded-lg border-l-4 border-sky-400 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950">
                  🖼 {p.replace("> [!image]", "").trim()}
                </p>
              ) : (
                <p key={i} className="leading-relaxed">{p}</p>
              ),
            )}
          </section>
        ))
      )}
    </article>
  );
}
