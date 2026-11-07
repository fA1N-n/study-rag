import { connection } from "next/server";

// Для Docker HEALTHCHECK и smoke-теста: отвечает на каждом запросе, не пререндерится.
export async function GET() {
  await connection();
  return Response.json({ ok: true, time: new Date().toISOString() });
}
