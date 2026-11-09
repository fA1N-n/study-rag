import { pgFail, session } from "@/lib/api";

/** История своих вопросов: ?dataset=&q=&bad=1 */
export async function GET(req: Request) {
  const s = await session();
  if (s instanceof Response) return s;
  const p = new URL(req.url).searchParams;
  let q = s.sb.from("questions").select("id,dataset_id,question,answer,refused,feedback,created_at,latency_ms").eq("user_id", s.user.id).order("created_at", { ascending: false }).limit(100);
  if (p.get("dataset")) q = q.eq("dataset_id", p.get("dataset")!);
  if (p.get("q")) q = q.ilike("question", `%${p.get("q")!.replace(/[%_]/g, "")}%`);
  if (p.get("bad")) q = q.eq("feedback", -1);
  const { data, error } = await q;
  return error ? pgFail(error) : Response.json(data);
}
