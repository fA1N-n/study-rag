import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Открыто без входа: страница входа, демо-вход, health, воркер (у него свой секрет).
const PUBLIC = ["/login", "/api/auth/demo", "/api/health", "/api/worker/tick"];

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
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
