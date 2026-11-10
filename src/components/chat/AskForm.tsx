"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, err, input } from "@/components/ui";

export default function AskForm({ datasetId, filters }: { datasetId: string; filters: Record<string, string> }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/datasets/${datasetId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, filters }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `ошибка ${res.status}`);
      setQuestion("");
      router.push(`?${new URLSearchParams({ ...filters, q: data.id })}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sticky bottom-0 bg-bg py-3">
      <div className="flex gap-2">
        <label htmlFor="ask" className="sr-only">Вопрос по материалам</label>
        <input
          id="ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Спросите по материалам…"
          maxLength={2000}
          autoComplete="off"
          className={input}
        />
        <button className={btn} disabled={busy || question.trim().length < 2}>{busy ? "Ищу…" : "Спросить"}</button>
      </div>
      {error && <p role="alert" className={`${err} mt-2`}>{error}</p>}
    </form>
  );
}
