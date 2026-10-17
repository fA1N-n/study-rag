"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, card, err, input, label, muted } from "@/components/ui";

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
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form onSubmit={submit} noValidate className={`${card} w-full max-w-sm space-y-4 p-6`}>
        <div>
          <h1 className="text-xl font-semibold">Study RAG</h1>
          <p className={muted}>Учебный ассистент группы КИ. Вход только для участников.</p>
        </div>
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={label}>Пароль</label>
          <input id="password" type="password" autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className={err}>{error}</p>}
        <button type="submit" disabled={loading} className={`${btn} w-full`}>
          {loading ? "Входим…" : "Войти"}
        </button>
        <p className={`${muted} text-center text-xs`}>Регистрации нет — аккаунт выдаёт администратор.</p>
      </form>
    </main>
  );
}
