import { fail, session } from "@/lib/api";
import { parseDocument } from "@/lib/labeling/units";

/** Единицы документа вокруг ?no= (порядковый номер, как chunks.unit_no): no-1 … no+1 — для панели источника. */
export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/units">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const no = Number(new URL(req.url).searchParams.get("no") ?? 1);
  const { data: doc } = await s.sb.from("documents").select("filename,storage_path").eq("id", id).maybeSingle();
  if (!doc) return fail(404, "not found");
  const file = await s.sb.storage.from("datasets").download(doc.storage_path);
  if (file.error) return fail(502, file.error.message);
  const units = parseDocument(await file.data.text()).units;
  const around = [no - 1, no, no + 1].filter((n) => n >= 1 && n <= units.length).map((n) => ({ no: n, label: units[n - 1].label, text: units[n - 1].text, current: n === no }));
  return Response.json({ filename: doc.filename, total: units.length, units: around });
}
