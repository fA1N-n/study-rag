"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, btnDanger, btnGhost, err } from "@/components/ui";

/** Пока разметка идёт — перечитывать доску раз в 4 с. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(url: string, payload?: object) {
    setBusy(true);
    setError("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Не получилось");
    router.refresh();
  }
  return { busy, error, run };
}

export function StartJob({ datasetId, hasLabeled }: { datasetId: string; hasLabeled: boolean }) {
  const { busy, error, run } = useAction();
  const url = `/api/datasets/${datasetId}/jobs`;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {hasLabeled && (
          <button type="button" className={btnGhost} disabled={busy} onClick={() => confirm("Разметить заново все документы, кроме решённых человеком?") && run(url, { scope: "all" })}>
            Разметить заново
          </button>
        )}
        <button type="button" className={btn} disabled={busy} onClick={() => run(url, { scope: "unlabeled" })}>
          {busy ? "Запускаем…" : hasLabeled ? "Разметить новые" : "Запустить разметку"}
        </button>
      </div>
      {error && <p role="alert" className={err}>{error}</p>}
    </div>
  );
}

export function CancelJob({ jobId }: { jobId: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className={btnDanger} disabled={busy} onClick={() => run(`/api/jobs/${jobId}/cancel`)}>
        {busy ? "Останавливаем…" : "Остановить"}
      </button>
      {error && <p role="alert" className={err}>{error}</p>}
    </div>
  );
}
