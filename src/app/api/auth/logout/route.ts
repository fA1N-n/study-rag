import { db } from "@/lib/supabase/server";

export async function POST() {
  await (await db()).auth.signOut();
  return Response.json({ ok: true });
}
