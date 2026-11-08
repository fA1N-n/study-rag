import Link from "next/link";
import { Suspense } from "react";
import { me } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

async function Who() {
  const user = await me();
  if (!user) return null;
  return (
    <>
      <span className="hidden max-w-48 truncate text-xs text-mute sm:inline" title={user.email}>
        {user.role === "demo" ? "проверяющий" : user.email}
      </span>
      <LogoutButton />
    </>
  );
}

export default function Nav() {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
      <Link href="/" className="font-bold tracking-tight">
        study<span className="text-acc">/</span>rag
      </Link>
      <nav className="ml-auto flex items-center gap-0.5 text-[13px]">
        <Link href="/" className="rounded-md px-2.5 py-1.5 text-mute hover:bg-sub hover:text-ink">Датасеты</Link>
        <Link href="/history" className="rounded-md px-2.5 py-1.5 text-mute hover:bg-sub hover:text-ink">История</Link>
        <ThemeToggle />
        <Suspense fallback={<span className="w-16" />}>
          <Who />
        </Suspense>
      </nav>
    </header>
  );
}
