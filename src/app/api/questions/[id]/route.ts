import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";

const Patch = z.object({ feedback: z.union([z.literal(1), z.literal(-1), z.null()]) });

/** Оценка ответа 👍/👎 (RLS: только свои вопросы). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/questions/[id]">) {
  const s = await session();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const input = await body(req, Patch);
  if (input instanceof Response) return input;
  const { data, error } = await s.sb.from("questions").update({ feedback: input.feedback }).eq("id", id).select("id");
  if (error) return pgFail(error);
  return data.length ? Response.json({ ok: true }) : fail(404, "not found");
}
