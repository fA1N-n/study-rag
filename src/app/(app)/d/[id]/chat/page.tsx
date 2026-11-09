import Link from "next/link";
import { Suspense } from "react";
import Chat, { type FilterField } from "@/components/Chat";
import { card, muted, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";
import { parseFields } from "@/lib/labeling/schema";
import { filterFields } from "@/lib/rag/ask";

async function ChatScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, sb, user } = await loadDataset(id);
  const [{ count: chunks }, rules, { data: recent }] = await Promise.all([
    sb.from("chunks").select("id", { count: "exact", head: true }).eq("dataset_id", id),
    ds.active_ruleset_id ? sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("questions").select("id,question,refused,feedback").eq("dataset_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
  ]);
  if (!chunks)
    return (
      <div className={`${card} space-y-2 text-center`}>
        <h1 className="text-xl font-semibold">Чат появится после индексации</h1>
        <p className={muted}>Документы нужно разметить и проиндексировать (чанки + эмбеддинги).</p>
        <Link className="text-acc" href={`/d/${id}/labeling`}>К разметке и индексации →</Link>
      </div>
    );

  // значения фильтров: enum — из схемы, числа и да/нет — какие реально встречаются в метках
  const fields = rules.data ? filterFields(parseFields(rules.data.fields)) : [];
  const { data: docs } = await sb.from("documents").select("labels").eq("dataset_id", id).limit(5000);
  const options: FilterField[] = fields.map((f) => {
    const seen = [...new Set((docs ?? []).map((d) => d.labels?.[f.key]).filter((v) => v !== null && v !== undefined && v !== ""))];
    const values = f.type === "enum" ? f.values!.filter((v) => seen.includes(v)) : seen.sort((a, b) => Number(a) - Number(b)).map(String);
    return { key: f.key, label: f.label, type: f.type as FilterField["type"], values };
  });
  return <Chat datasetId={id} fields={options.filter((f) => f.values.length > 1)} recent={recent ?? []} />;
}

export default function ChatPage({ params }: PageProps<"/d/[id]/chat">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-4">
      <Suspense fallback={<div className={`${skeleton} h-[70vh]`} />}>
        <ChatScreen params={params} />
      </Suspense>
    </main>
  );
}
