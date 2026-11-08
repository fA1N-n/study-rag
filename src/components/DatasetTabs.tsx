"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const TABS = [
  ["", "Обзор"],
  ["upload", "Загрузка"],
  ["rules", "Правила"],
  ["labeling", "Разметка"],
  ["review", "Проверка"],
  ["docs", "Документы"],
  ["chat", "Чат"],
] as const;

export default function DatasetTabs() {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const root = `/d/${id}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-4 text-[13px]">
      {TABS.map(([seg, label]) => {
        const href = seg ? `${root}/${seg}` : root;
        const on = seg ? path.startsWith(href) : path === root;
        return (
          <Link key={seg} href={href} className={`whitespace-nowrap border-b-2 px-2.5 py-2.5 ${on ? "border-acc text-ink" : "border-transparent text-mute hover:text-ink"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
