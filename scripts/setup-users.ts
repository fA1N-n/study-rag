// Создаёт демо-пользователя и владельца в Supabase Auth (идемпотентно), ставит роль owner.
// Запуск: node --env-file=.env.local scripts/setup-users.ts
// OWNER_EMAIL / OWNER_PASSWORD берутся из .env.local; если их нет — генерируются и дописываются туда.
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

if (!env.OWNER_EMAIL) {
  env.OWNER_EMAIL = "owner@study-rag.local";
  env.OWNER_PASSWORD = randomBytes(12).toString("base64url");
  appendFileSync(".env.local", `\n# владелец (создан scripts/setup-users.ts)\nOWNER_EMAIL=${env.OWNER_EMAIL}\nOWNER_PASSWORD=${env.OWNER_PASSWORD}\n`);
}

async function ensure(email: string, password: string): Promise<string> {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const found = list.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password });
    return found.id;
  }
  const { data, error: e2 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (e2) throw e2;
  return data.user.id;
}

const demo = await ensure(env.DEMO_EMAIL!, env.DEMO_PASSWORD!);
const owner = await ensure(env.OWNER_EMAIL!, env.OWNER_PASSWORD!);
await admin.from("profiles").upsert([{ id: demo, role: "demo" }, { id: owner, role: "owner" }]);
console.log("ok: demo и owner готовы");
