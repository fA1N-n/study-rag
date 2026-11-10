import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Открыто без входа: страница входа, демо-вход, health, воркер (у него свой секрет).
const PUBLIC = ["/login", "/api/auth/demo", "/api/health", "/api/worker/tick"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Sensitive-переменные Vercel не попадают в окружение Development — объясняем, а не падаем.
function missingEnv(path: string) {
  const msg =
    "Supabase не настроен: NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY недоступны в этом окружении. " +
    "Добавьте их для Development (не как Sensitive) в Settings → Vars.";
  if (path.startsWith("/api/")) return NextResponse.json({ error: "supabase_not_configured", message: msg }, { status: 503 });
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Study RAG — нужна настройка</title></head>
<body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#fafafa;color:#18181b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">
<main style="max-width:520px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;padding:24px">
<p style="margin:0 0 8px;font:12px ui-monospace,monospace;color:#4f46e5">503 · supabase_not_configured</p>
<h1 style="margin:0 0 12px;font-size:18px">Нужна настройка окружения</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#52525b">${msg}</p></main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function proxy(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return missingEnv(req.nextUrl.pathname);
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  // getClaims проверяет JWT и при необходимости обновляет сессию (новые cookie → res)
  const { data } = await sb.auth.getClaims();
  const path = req.nextUrl.pathname;
  if (data?.claims || PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) return res;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|svg|jpg|ico|txt)$).*)"],
};
