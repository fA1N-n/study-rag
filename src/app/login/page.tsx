"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { z } from "zod";
import { btn, btnGhost, card, err, input, label } from "@/components/ui";
import { browserDb } from "@/lib/supabase/client";

const Form = z.object({
  email: z.email("Введите корректный email"),
  password: z.string().min(6, "Пароль — не короче 6 символов"),
});

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"" | "pass" | "demo">("");

  const go = () => {
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Form.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError("");
    setLoading("pass");
    const { error } = await browserDb().auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading("");
      return setError("Неверный email или пароль");
    }
    go();
  }

  async function demo() {
    setError("");
    setLoading("demo");
    const r = await fetch("/api/auth/demo", { method: "POST" });
    if (!r.ok) {
      setLoading("");
      return setError("Демо-вход сейчас недоступен");
    }
    go();
  }

  return (
    <form onSubmit={submit} noValidate className={`${card} space-y-4 p-6`}>
      <div>
        <label htmlFor="email" className={label}>Email</label>
        <input id="email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password" className={label}>Пароль</label>
        <input id="password" type="password" autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p role="alert" className={err}>{error}</p>}
      <button type="submit" disabled={!!loading} className={`${btn} w-full`}>{loading === "pass" ? "Входим…" : "Войти"}</button>
      <div className="flex items-center gap-3 text-xs text-mute">
        <span className="h-px flex-1 bg-line" />или<span className="h-px flex-1 bg-line" />
      </div>
      <button type="button" onClick={demo} disabled={!!loading} className={`${btnGhost} w-full py-2.5`}>
        {loading === "demo" ? "Входим…" : "Войти как проверяющий"}
      </button>
      <p className="text-xs text-mute">Регистрации нет. Проверяющий видит демо-датасет и может загрузить свой (до 30 документов, 30 вопросов в сутки).</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl flex-1 items-center gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr]">
      <section>
        <div className="text-lg font-bold tracking-tight">study<span className="text-acc">/</span>rag</div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Разметка учебных материалов агентами и ответы со сносками</h1>
        <p className="mt-4 max-w-md text-mute">
          Загрузите набор документов — агенты предложат схему разметки, разметят корпус вдвоём с арбитром, а чат ответит со ссылкой на страницу или слайд.
        </p>
      </section>
      <Suspense fallback={<div className={`${card} h-80`} />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
