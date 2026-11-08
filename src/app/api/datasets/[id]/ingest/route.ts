import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";
import { ingestFiles } from "@/lib/ingest";
import type { db } from "@/lib/supabase/server";

// Распаковка и разбор в одном запросе: наш архив (572 документа, 5,7 МБ zip) разбирается ядром за ~2 с.
// ponytail: синхронно, без очереди; очередь — если загрузки перерастут лимит функции.
export const maxDuration = 300;

const Input = z.object({
  uploads: z.array(z.object({ path: z.string().min(1).max(400), name: z.string().min(1).max(400) })).min(1).max(200),
});

const DEMO_MAX_DOCS = 30;
const DEMO_MAX_UPLOADS = 30;
const DEMO_MAX_BYTES = 30 * 1024 * 1024;

type Field = { key: string; type: string; values?: string[] };
type Db = Awaited<ReturnType<typeof db>>;

/** Преподаватели из правил датасета (enum-поле teacher) — их ФИО не маскируем. */
async function keepNamesOf(sb: Db, rulesetId: string | null): Promise<string[]> {
  if (!rulesetId) return [];
  const { data } = await sb.from("rulesets").select("fields").eq("id", rulesetId).maybeSingle();
  return ((data?.fields ?? []) as Field[]).filter((f) => /teacher|преподав/i.test(f.key) && f.values).flatMap((f) => f.values!);
}

export async function POST(req: Request, ctx: RouteContext<"/api/datasets/[id]/ingest">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, Input);
  if (input instanceof Response) return input;
  const demo = s.user.role === "demo";
  if (demo && input.uploads.length > DEMO_MAX_UPLOADS) return fail(400, `проверяющему — до ${DEMO_MAX_UPLOADS} файлов за раз`);

  const { data: ds, error: dsErr } = await s.sb.from("datasets").select("id,owner_id,stats,status,active_ruleset_id").eq("id", id).eq("owner_id", s.user.id).maybeSingle();
  if (dsErr) return pgFail(dsErr);
  if (!ds) return fail(404, "датасет не найден или не ваш");
  const prefix = `${s.user.id}/${id}/uploads/`;
  if (input.uploads.some((u) => !u.path.startsWith(prefix) || u.path.includes(".."))) return fail(400, "чужой путь загрузки");

  const storage = s.sb.storage.from("datasets");
  const prevStatus = ds.status;
  const st = await s.sb.from("datasets").update({ status: "ingesting" }).eq("id", id);
  if (st.error) return pgFail(st.error);

  try {
    const files = [];
    const skipped: { name: string; reason: string }[] = [];
    let bytes = 0;
    for (const u of input.uploads) {
      const { data, error } = await storage.download(u.path);
      if (error) {
        skipped.push({ name: u.name, reason: `не прочитан: ${error.message}` });
        continue;
      }
      bytes += data.size;
      if (demo && bytes > DEMO_MAX_BYTES) return fail(413, `проверяющему — до ${DEMO_MAX_BYTES / 1048576} МБ за загрузку`);
      files.push({ name: u.name, data: new Uint8Array(await data.arrayBuffer()) });
    }

    const { data: have, error: hErr } = await s.sb.from("documents").select("sha256").eq("dataset_id", id);
    if (hErr) return pgFail(hErr);
    const existing = new Set((have ?? []).map((d) => d.sha256 as string));
    const maxFiles = demo ? Math.max(0, DEMO_MAX_DOCS - existing.size) : Infinity;
    const keepNames = await keepNamesOf(s.sb, ds.active_ruleset_id);
    const res = await ingestFiles(files, { existing, maxFiles, keepNames });
    skipped.push(...res.skipped);

    // нормализованный .md → Storage, строки → documents (RLS + триггер лимита демо)
    let added = 0;
    for (let i = 0; i < res.docs.length; i += 16) {
      await Promise.all(
        res.docs.slice(i, i + 16).map(async (d) => {
          const path = `${s.user.id}/${id}/docs/${d.sha256}.md`;
          const up = await storage.upload(path, d.markdown, { contentType: "text/markdown; charset=utf-8", upsert: true });
          if (up.error) return skipped.push({ name: d.maskedFilename, reason: up.error.message });
          const { error } = await s.sb.from("documents").insert({
            dataset_id: id,
            filename: d.maskedFilename,
            storage_path: path,
            sha256: d.sha256,
            units: d.units.length,
            meta: { source_path: d.maskedPath },
            preview: d.preview,
            pii_flag: d.piiFlag,
          });
          if (error) {
            await storage.remove([path]); // без строки в БД файл осиротел бы
            return skipped.push({ name: d.maskedFilename, reason: error.message.includes("demo limit") ? "лимит" : error.message });
          }
          added++;
        }),
      );
    }

    const { data: rows, error: rErr } = await s.sb.from("documents").select("units").eq("dataset_id", id);
    if (rErr) return pgFail(rErr);
    const total = rows.length;
    const stats = { ...(ds.stats as object), documents: total, units: rows.reduce((a, r) => a + (r.units as number), 0) };
    const status = ["empty", "ingesting", "ingested"].includes(prevStatus) ? (total > 0 ? "ingested" : "empty") : prevStatus;
    const upd = await s.sb.from("datasets").update({ stats, status }).eq("id", id);
    if (upd.error) return pgFail(upd.error);
    return Response.json({ added, skipped, total });
  } finally {
    // сырые загрузки удаляются всегда; статус «ingesting» не остаётся висеть после ошибки
    await storage.remove(input.uploads.map((u) => u.path));
    await s.sb.from("datasets").update({ status: prevStatus }).eq("id", id).eq("status", "ingesting");
  }
}
