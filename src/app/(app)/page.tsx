import Link from "next/link";
import { Suspense } from "react";
import DatasetDialog from "@/components/DatasetDialog";
import DeleteButton from "@/components/DeleteButton";
import { card, muted, skeleton } from "@/components/ui";
import { currentStep, STATUS_RU, STEPS } from "@/lib/pipeline";
import { db, me } from "@/lib/supabase/server";

type Ds = { id: string; name: string; description: string | null; is_demo: boolean; status: string; owner_id: string; stats: Record<string, number> };

async function List() {
  const [user, sb] = await Promise.all([me(), db()]);
  const { data, error } = await sb.from("datasets").select("id,name,description,is_demo,status,owner_id,stats").order("created_at");
  if (error) return <p className="text-bad">Не удалось загрузить датасеты: {error.message}</p>;
  const list = (data ?? []) as Ds[];
  if (list.length === 0)
    return (
      <div className={`${card} text-center`}>
        <p className="mb-3">Датасетов пока нет.</p>
        <DatasetDialog trigger="Создать первый" />
      </div>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((d) => {
        const cur = currentStep(d.status);
        const mine = d.owner_id === user?.id;
        return (
          <article key={d.id} className={`${card} flex flex-col gap-3`}>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/d/${d.id}`} className="font-semibold hover:text-acc">{d.name}</Link>
              <span className="flex shrink-0 gap-1">
                {d.is_demo && <span className="rounded-full bg-acc-soft px-2 py-px text-[11px] text-acc">демо</span>}
                <span className="rounded-full bg-sub px-2 py-px text-[11px] text-mute">{STATUS_RU[d.status] ?? d.status}</span>
              </span>
            </div>
            {d.description && <p className={muted}>{d.description}</p>}
            <ol className="flex flex-wrap gap-1 text-xs">
              {STEPS.map((s, i) => (
                <li key={s.key} className={`rounded-md px-2 py-1 ${i < cur ? "bg-ok/15 text-ok" : i === cur ? "bg-acc-soft text-acc" : "bg-sub text-mute"}`}>
                  {i < cur ? "✓ " : ""}{s.label}
                </li>
              ))}
            </ol>
            <p className="font-mono text-xs text-mute">
              {d.stats.documents ?? 0} документов · {d.stats.units ?? 0} единиц · {d.stats.chunks ?? 0} чанков
            </p>
            <div className="mt-auto flex gap-2">
              <Link href={`/d/${d.id}`} className="rounded-lg bg-acc px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Открыть</Link>
              {mine && <DatasetDialog ds={d} trigger="Переименовать" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-sub" />}
              {mine && <DeleteButton url={`/api/datasets/${d.id}`} what={`датасет «${d.name}»`} className="ml-auto rounded-lg px-3 py-2 text-sm text-bad hover:bg-bad/10" />}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Датасеты</h1>
          <p className={muted}>Загрузка → правила → разметка → индекс → чат</p>
        </div>
        <DatasetDialog trigger="Новый датасет" />
      </div>
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`${skeleton} h-44`} />
            <div className={`${skeleton} h-44`} />
          </div>
        }
      >
        <List />
      </Suspense>
    </main>
  );
}
