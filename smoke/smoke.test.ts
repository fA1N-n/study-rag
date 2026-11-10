// Smoke по живому серверу (локально или прод): SMOKE_URL=https://… npx vitest run smoke
// Без SMOKE_URL пропускается (в CI нет сервера).
import { describe, expect, it } from "vitest";

const URL = process.env.SMOKE_URL?.replace(/\/$/, "");
const get = (path: string, init?: RequestInit) => fetch(`${URL}${path}`, { redirect: "manual", ...init });

describe.skipIf(!URL)(`smoke ${URL}`, { timeout: 30_000 }, () => {
  it("health → 200", async () => {
    const r = await get("/api/health");
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it("без входа: страница → редирект на /login, API → 401, тик без секрета → 401", async () => {
    const page = await get("/");
    expect([302, 303, 307, 308]).toContain(page.status);
    expect(page.headers.get("location")).toMatch(/\/login/);
    expect((await get("/api/datasets")).status).toBe(401);
    expect((await get("/api/worker/tick", { method: "POST", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("демо-вход → сессия → видит демо-датасет", async () => {
    const r = await get("/api/auth/demo", { method: "POST" });
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toMatch(/sb-/);
    const list = await get("/api/datasets", { headers: { cookie } });
    expect(list.status).toBe(200);
    const ds = (await list.json()) as { is_demo: boolean }[];
    expect(ds.some((d) => d.is_demo)).toBe(true);
  });
});
