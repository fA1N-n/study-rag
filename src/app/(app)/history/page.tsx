import Link from "next/link";
import { Suspense } from "react";
import { card, input, muted, skeleton } from "@/components/ui";
import { db, me } from "@/lib/supabase/server";

type Row = { id: string; dataset_id: string; question: string; answer: string | null; refused: boolean; feedback: number | null; created_at: string; latency_ms: number | null; datasets: { name: string } | null };

async function History({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const bad = sp.bad === "1";
  const [user, sb] = await Promise.all([me(), db()]);
  let query = sb.from("questions").select("id,dataset_id,question,answer,refused,feedback,created_at,latency_ms,datasets(name)").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("question", `%${q.replace(/[%_]/g, "")}%`);
  if (bad) query = query.eq("feedback", -1);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/history">
        <label htmlFor="hq" className="sr-only">Поиск по вопросам</label>
        <input id="hq" name="q" defaultValue={q} placeholder="Поиск по вопросам" className={`${input} max-w-sm py-2`} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="bad" value="1" defaultChecked={bad} /> только 👎</label>
        <button type="submit" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:bg-sub">Найти</button>
      </form>
      {error && <p className="text-sm text-bad">Не удалось загрузить историю: {error.message}</p>}
      {!error && rows.length === 0 && (
        <div className={`${card} text-center`}>
          <p className={muted}>{q || bad ? "Ничего не найдено." : "Вы ещё не задавали вопросов."}</p>
          {!q && !bad && <Link href="/" className="text-sm text-acc">Выбрать датасет →</Link>}
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={card}>
            <details>
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="min-w-0 break-words">{r.feedback === 1 ? "👍 " : r.feedback === -1 ? "👎 " : ""}{r.question}</b>
                  <span className="font-mono text-[11px] text-mute">{new Date(r.created_at).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}{r.latency_ms ? ` · ${(r.latency_ms / 1000).toFixed(1)} с` : ""}</span>
                </div>
                <div className="text-xs text-mute">
                  <Link href={`/d/${r.dataset_id}/chat`} className="hover:text-acc">{r.datasets?.name ?? "датасет"}</Link>
                  {r.refused ? " · отказ" : ""}{r.answer === null ? " · без ответа (ошибка)" : ""}
                </div>
              </summary>
              {r.answer && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.answer}</p>}
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">История вопросов</h1>
      <Suspense fallback={<div className={`${skeleton} h-64`} />}>
        <History searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
