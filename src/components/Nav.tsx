"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Чат" },
  { href: "/library", label: "Библиотека" },
  { href: "/upload", label: "Загрузка" },
  { href: "/history", label: "История" },
];

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Link href="/" className="mr-2 font-semibold text-indigo-600">Study&nbsp;RAG</Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                active(l.href)
                  ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">Выйти</Link>
      </div>
    </header>
  );
}
