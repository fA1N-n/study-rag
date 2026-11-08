import { z } from "zod";
import { db, me } from "@/lib/supabase/server";

/** Ответ-ошибка в одном формате. */
export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Разобрать JSON-тело по схеме zod; при ошибке — 400 с первым сообщением. */
export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | Response> {
  const raw = await req.json().catch(() => null);
  const r = schema.safeParse(raw);
  return r.success ? r.data : fail(400, r.error.issues[0]?.message ?? "bad request");
}

/** Пользователь + клиент под RLS; без сессии — 401. */
export async function session() {
  const user = await me();
  if (!user) return fail(401, "unauthorized");
  return { user, sb: await db() };
}

/** Ошибка Postgres → понятный ответ (лимиты демо, уникальность, CHECK). */
export function pgFail(e: { code?: string; message: string }) {
  if (e.message.includes("demo limit")) return fail(429, e.message);
  if (e.code === "23505") return fail(409, "уже существует");
  if (e.code === "23514" || e.code === "22P02") return fail(400, "недопустимое значение");
  if (e.code === "42501" || e.message.includes("row-level security")) return fail(403, "нет доступа");
  return fail(500, e.message);
}
