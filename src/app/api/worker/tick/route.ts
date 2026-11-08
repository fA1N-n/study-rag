import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { fail } from "@/lib/api";
import { tick } from "@/lib/worker";

export const maxDuration = 300;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Тик очереди (pg_cron раз в минуту, Bearer WORKER_SECRET). Отвечает сразу: pg_net ждёт ответ ~5 с, работа идёт в after(). */
export async function POST(req: Request) {
  const secret = process.env.WORKER_SECRET;
  if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return fail(401, "unauthorized");
  after(() => tick().catch((e) => console.error("tick", e)));
  return Response.json({ ok: true }, { status: 202 });
}
