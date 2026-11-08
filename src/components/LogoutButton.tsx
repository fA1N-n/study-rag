"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function out() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button type="button" onClick={out} className="rounded-md px-2.5 py-1.5 text-[13px] text-mute hover:bg-sub hover:text-ink">
      Выйти
    </button>
  );
}
