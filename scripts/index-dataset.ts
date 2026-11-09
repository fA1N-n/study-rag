// Индексация датасета тем же ядром, что и /api/datasets/[id]/index (для большого датасета — дольше лимита функции).
// Запуск: node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/index-dataset.ts "<имя датасета>"
import { createClient } from "@supabase/supabase-js";
import { indexSome } from "../src/lib/rag/indexer";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: ds, error } = await sb.from("datasets").select("id,stats").eq("name", process.argv[2] ?? "Материалы КИ (5 семестров)").single();
if (error) throw error;
const t0 = Date.now();
let total = 0;
for (;;) {
  const r = await indexSome(sb, ds.id, 10);
  total += r.chunks;
  process.stdout.write(`\rчанков ${total}, осталось документов ${r.left}, ${Math.round((Date.now() - t0) / 1000)} с   `);
  if (!r.left) break;
  if (!r.done) await new Promise((ok) => setTimeout(ok, 30_000)); // остальное в аренде (упавший процесс) — ждём её конца
}
const { count } = await sb.from("chunks").select("id", { count: "exact", head: true }).eq("dataset_id", ds.id);
await sb.from("datasets").update({ status: "ready", stats: { ...(ds.stats as object), chunks: count ?? 0 } }).eq("id", ds.id);
console.log(`\nготово: ${count} чанков`);
