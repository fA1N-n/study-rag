"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, err, input, kicker, label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Введите корректный email");
    if (password.length < 6) return setError("Пароль — не короче 6 символов");
    setError("");
    setLoading(true);
    // Демо: вход без проверки. В части 2 — Supabase Auth.
    setTimeout(() => router.push("/"), 600);
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-12 md:grid-cols-[1.2fr_1fr]">
      <section>
        <p className={kicker}>Группа КИ · материалы I–V семестров</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.05] sm:text-6xl">
          Читальный <em className="text-accent">зал</em>
        </h1>
        <p className="mt-6 max-w-md font-serif text-lg leading-8 text-mute">
          Лекции, методички и презентации в одном месте. Задайте вопрос — ответ придёт со сноской на документ и слайд.
        </p>
      </section>

      <form onSubmit={submit} noValidate className="space-y-6 border-t-[3px] border-double border-ink pt-6">
        <p className={kicker}>Вход для читателей</p>
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={label}>Пароль</label>
          <input id="password" type="password" autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className={err}>{error}</p>}
        <button type="submit" disabled={loading} className={`${btn} w-full`}>{loading ? "Входим…" : "Войти"}</button>
        <p className="text-xs text-mute">Регистрации нет: читательский билет выдаёт администратор.</p>
      </form>
    </main>
  );
}
