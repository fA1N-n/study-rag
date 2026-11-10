import { z } from "zod";
import { body, fail, session } from "@/lib/api";

const schema = z.object({
  question: z.string().trim().min(2, "вопрос слишком короткий").max(2000),
  filters: z.record(z.string(), z.string().max(200)).default({}),
});

// Контракт чата: { question, filters } → { id } сохранённого вопроса (questions.answer + sources).
// Поиск по чанкам и генерация ответа — этап 6 (индексация, гибридный поиск, rerank); до него честно отвечаем 501.
export async function POST(req: Request, ctx: RouteContext<"/api/datasets/[id]/ask">) {
  const s = await session();
  if (s instanceof Response) return s;
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const { id } = await ctx.params;

  const { data: ds } = await s.sb.from("datasets").select("id").eq("id", id).maybeSingle();
  if (!ds) return fail(404, "датасет не найден");
  const { count } = await s.sb.from("chunks").select("id", { count: "exact", head: true }).eq("dataset_id", id);
  if (!count) return fail(501, "Корпус ещё не проиндексирован: поиск по материалам появится после этапа 6 (индексация).");
  return fail(501, "Генерация ответа ещё не подключена (этап 6).");
}
