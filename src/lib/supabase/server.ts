import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Клиент от имени пользователя (RLS). В Server Components set cookie не нужен — сессию обновляет proxy. */
export async function db() {
  const jar = await cookies();
  return createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // вызов из Server Component: cookie пишет proxy
        }
      },
    },
  });
}

/** Сервисный клиент (обходит RLS): воркер, индексация. Только на сервере. */
export function admin() {
  return createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export type Me = { id: string; email: string; role: "owner" | "demo" };

/** Текущий пользователь или null. */
export async function me(): Promise<Me | null> {
  const sb = await db();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  const { data: p } = await sb.from("profiles").select("role").eq("id", c.sub).maybeSingle();
  return { id: c.sub, email: String(c.email ?? ""), role: p?.role === "owner" ? "owner" : "demo" };
}
