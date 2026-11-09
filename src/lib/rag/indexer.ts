// Индексация: документ → чанки (единица, длинная — частями) с заголовком из меток → эмбеддинги → таблица chunks.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFields } from "../labeling/schema";
import { parseDocument } from "../labeling/units";
import { chunkDocument } from "./chunk";
import { embed, vec } from "./embed";

/** Проиндексировать до limit документов датасета без indexed_at. Возвращает, сколько сделано и сколько осталось. */
export async function indexSome(sb: SupabaseClient, datasetId: string, limit = 20) {
  const { data: ds } = await sb.from("datasets").select("active_ruleset_id").eq("id", datasetId).single();
  const fields = ds?.active_ruleset_id ? parseFields((await sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).single()).data?.fields ?? []) : [];
  const { data: docs, error } = await sb.rpc("claim_index", { p_dataset: datasetId, n: limit });
  if (error) throw error;
  let chunks = 0;
  for (const d of (docs ?? []) as { id: string; filename: string; storage_path: string; labels: Record<string, unknown> }[]) {
    const file = await sb.storage.from("datasets").download(d.storage_path);
    if (file.error) throw new Error(`${d.filename}: ${file.error.message}`);
    const parts = chunkDocument(parseDocument(await file.data.text()).units, d.labels ?? {}, fields, d.filename);
    const vectors = parts.length ? await embed(parts.map((c) => `${c.header}\n${c.content}`)) : [];
    const del = await sb.from("chunks").delete().eq("document_id", d.id);
    if (del.error) throw del.error;
    for (let i = 0; i < parts.length; i += 100) {
      const ins = await sb.from("chunks").insert(parts.slice(i, i + 100).map((c, k) => ({ ...c, document_id: d.id, dataset_id: datasetId, embedding: vec(vectors[i + k]) })));
      if (ins.error) throw ins.error;
    }
    const up = await sb.from("documents").update({ indexed_at: new Date().toISOString() }).eq("id", d.id);
    if (up.error) throw up.error;
    chunks += parts.length;
  }
  const { count } = await sb.from("documents").select("id", { count: "exact", head: true }).eq("dataset_id", datasetId).is("indexed_at", null);
  return { done: docs?.length ?? 0, chunks, left: count ?? 0 };
}

/** Индексировать, пока есть время; всё готово → статус ready и число чанков в stats. */
export async function indexDataset(sb: SupabaseClient, datasetId: string, budgetMs = 200_000) {
  const t0 = Date.now();
  let left = 1;
  while (left > 0 && Date.now() - t0 < budgetMs) {
    const r = await indexSome(sb, datasetId);
    left = r.left;
    if (!r.done) break; // остальное в аренде у другого тика
  }
  if (left === 0) {
    const [{ count }, { data: ds }] = await Promise.all([
      sb.from("chunks").select("id", { count: "exact", head: true }).eq("dataset_id", datasetId),
      sb.from("datasets").select("stats").eq("id", datasetId).single(),
    ]);
    await sb.from("datasets").update({ status: "ready", stats: { ...(ds?.stats ?? {}), chunks: count ?? 0 } }).eq("id", datasetId);
  }
  return { left };
}
