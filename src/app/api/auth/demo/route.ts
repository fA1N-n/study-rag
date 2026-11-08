import { db } from "@/lib/supabase/server";

// «Войти как проверяющий»: пароль демо-пользователя живёт только на сервере.
export async function POST() {
  const sb = await db();
  const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) return Response.json({ error: "Демо-вход недоступен" }, { status: 503 });
  return Response.json({ ok: true });
}
