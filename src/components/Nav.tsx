"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { kicker } from "./ui";

const links = [
  { href: "/", label: "Вопрос" },
  { href: "/library", label: "Указатель" },
  { href: "/upload", label: "Поступления" },
  { href: "/history", label: "Журнал" },
];

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-double border-ink bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-4 pt-4">
        <Link href="/" className="leading-none">
          <span className="font-serif text-2xl italic">Study RAG</span>
          <span className={`${kicker} mt-1 hidden sm:block`}>читальный зал · группа КИ</span>
        </Link>
        <div className="mb-1 flex items-center gap-4">
          <span title="Демо-версия: данные условные, изменения не сохраняются"
            className="-rotate-3 whitespace-nowrap border border-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            демо-данные
          </span>
          <Link href="/login" className="font-mono text-xs uppercase tracking-wider text-mute hover:text-accent">Выйти</Link>
        </div>
      </div>
      <nav className="mx-auto mt-3 flex max-w-5xl gap-6 overflow-x-auto px-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className={`whitespace-nowrap border-b-2 pb-2 font-mono text-xs uppercase tracking-wider ${
              active(l.href) ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
            }`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
