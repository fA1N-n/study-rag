import { after } from "next/server";
import { fail, pgFail, session } from "@/lib/api";
import { indexDataset } from "@/lib/rag/indexer";
import { admin } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Индексация: чанки + эмбеддинги. Первая порция — сразу после ответа, остальное — тики pg_cron (статус indexing). */
export async function POST(_: Request, ctx: RouteContext<"/api/datasets/[id]/index">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const { data: ds } = await s.sb.from("datasets").select("id,owner_id,status").eq("id", id).maybeSingle();
  if (!ds || ds.owner_id !== s.user.id) return fail(404, "датасет не найден или не ваш");
  if (ds.status === "labeling") return fail(409, "дождитесь конца разметки");
  const { count } = await s.sb.from("documents").select("id", { count: "exact", head: true }).eq("dataset_id", id).eq("label_status", "unlabeled");
  if (count) return fail(400, `не размечено документов: ${count} — сначала разметка`);
  // переиндексировать всё: метки могли поменяться после прошлой индексации
  const reset = await s.sb.from("documents").update({ indexed_at: null }).eq("dataset_id", id);
  if (reset.error) return pgFail(reset.error);
  const up = await s.sb.from("datasets").update({ status: "indexing" }).eq("id", id);
  if (up.error) return pgFail(up.error);
  after(() => indexDataset(admin(), id).catch((e) => console.error("index", e)));
  return Response.json({ ok: true }, { status: 202 });
}
