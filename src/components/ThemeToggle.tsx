"use client";

// Тема: системная по умолчанию, выбор пользователя — data-theme на <html> + localStorage.
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const cur = root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-label="Сменить тему" className="rounded-md px-2.5 py-1.5 text-mute hover:bg-sub hover:text-ink">
      ◐
    </button>
  );
}
