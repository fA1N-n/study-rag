// Импорт материалов КИ в демо-датасет владельца тем же ядром, что и загрузка из UI (src/lib/ingest).
// Запуск: node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/import-dataset.ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ingestFiles } from "../src/lib/ingest/index";

const NAME = "Материалы КИ (5 семестров)";
const ROOT = "data/raw_2026-11-07/output";
const env = process.env;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
const owner = users.users.find((u) => u.email === env.OWNER_EMAIL);
if (!owner) throw new Error("нет владельца: запустите scripts/setup-users.ts");

let { data: ds } = await sb.from("datasets").select("id,stats").eq("owner_id", owner.id).eq("name", NAME).maybeSingle();
if (!ds) {
  const r = await sb
    .from("datasets")
    .insert({ owner_id: owner.id, name: NAME, is_demo: true, description: "Лекции, методички, задания и отчёты группы КИ за I–V семестры. ФИО студентов замаскированы." })
    .select("id,stats")
    .single();
  if (r.error) throw r.error;
  ds = r.data;
}

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".md") ? [join(d, e.name)] : []));
const files = walk(ROOT).map((p) => ({ name: relative(ROOT, p).replaceAll("\\", "/"), data: new Uint8Array(readFileSync(p)) }));
const keepNames = (JSON.parse(readFileSync("data/labeling/teachers.json", "utf8")).teachers as string[]) ?? [];

const { data: have } = await sb.from("documents").select("sha256").eq("dataset_id", ds.id);
const t0 = Date.now();
const { docs, skipped } = await ingestFiles(files, { existing: new Set((have ?? []).map((d) => d.sha256)), keepNames });
console.log(`разбор: ${docs.length} новых, ${skipped.length} пропущено, ${((Date.now() - t0) / 1000).toFixed(1)} с`);

const storage = sb.storage.from("datasets");
for (let i = 0; i < docs.length; i += 20) {
  const part = docs.slice(i, i + 20);
  await Promise.all(
    part.map(async (d) => {
      const r = await storage.upload(`${owner.id}/${ds.id}/docs/${d.sha256}.md`, d.markdown, { contentType: "text/markdown; charset=utf-8", upsert: true });
      if (r.error) throw new Error(`${d.maskedFilename}: ${r.error.message}`);
    }),
  );
  const { error } = await sb.from("documents").insert(
    part.map((d) => ({
      dataset_id: ds.id,
      filename: d.maskedFilename,
      storage_path: `${owner.id}/${ds.id}/docs/${d.sha256}.md`,
      sha256: d.sha256,
      units: d.units.length,
      // source_sha256 — id документа в офлайн-разметке (data/labeling/labels_*.jsonl)
      meta: { source_path: d.maskedPath, source_sha256: d.meta.sha256 ?? null },
      preview: d.preview,
      pii_flag: d.piiFlag,
    })),
  );
  if (error) throw error;
  process.stdout.write(`\r${Math.min(i + 20, docs.length)} / ${docs.length}`);
}

const { data: all } = await sb.from("documents").select("units").eq("dataset_id", ds.id);
const stats = { ...(ds.stats as object), documents: all!.length, units: all!.reduce((a, r) => a + r.units, 0) };
await sb.from("datasets").update({ stats, status: "ingested" }).eq("id", ds.id);
console.log(`\nготово: ${stats.documents} документов, ${stats.units} единиц; пропуски:`, skipped.slice(0, 10));
