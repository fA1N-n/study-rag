// Чтение данных для страниц (под RLS текущего пользователя).
import { notFound } from "next/navigation";
import { db, me } from "@/lib/supabase/server";

export type Dataset = {
  id: string;
  name: string;
  description: string | null;
  is_demo: boolean;
  status: string;
  owner_id: string;
  active_ruleset_id: string | null;
  stats: Record<string, number>;
};

/** Датасет + пользователь + клиент; нет доступа → 404. */
export async function loadDataset(id: string) {
  const [user, sb] = await Promise.all([me(), db()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data } = await sb.from("datasets").select("*").eq("id", id).maybeSingle();
  if (!data || !user) notFound();
  return { ds: data as Dataset, user, sb, mine: data.owner_id === user.id };
}
