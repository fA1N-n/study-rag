"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, btnGhost, err, input, label } from "@/components/ui";

/** Сгенерировать черновик (архитектор + критик). */
export function GenerateButton({ datasetId }: { datasetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/datasets/${datasetId}/rulesets`, { method: "POST" });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Не удалось сгенерировать");
    router.push(`?v=${j.version}`); // новая версия — новый адрес, страница перечитается
  }
  return (
    <div className="space-y-2">
      <button type="button" className={btn} onClick={go} disabled={busy}>
        {busy ? "Архитектор и критик работают… (1–3 мин)" : "Сгенерировать черновик правил"}
      </button>
      {error && <p role="alert" className={err}>{error}</p>}
    </div>
  );
}

/** Правка схемы и правил + утверждение. Правка утверждённой версии создаёт новую. */
export function RulesEditor({ id, fields, rules, status }: { id: string; fields: unknown; rules: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(JSON.stringify(fields, null, 2));
  const [r, setR] = useState(rules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(payload: object) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/rulesets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "Не удалось сохранить");
    setOpen(false);
    // тот же адрес (?v=N) push не перерисует — тогда только refresh
    const url = `?v=${j.version}`;
    if (location.search === url) router.refresh();
    else router.push(url);
  }

  function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(f);
    } catch {
      return setError("Схема полей — невалидный JSON");
    }
    send({ fields: parsed, rules: r });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && <button type="button" className={btn} disabled={busy} onClick={() => send({ status: "approved" })}>Утвердить версию</button>}
        <button type="button" className={btnGhost} onClick={() => setOpen((o) => !o)}>{open ? "Закрыть редактор" : status === "draft" ? "Править" : "Править (новая версия)"}</button>
      </div>
      {open && (
        <div className="space-y-3">
          <div>
            <label htmlFor="rs-fields" className={label}>Схема полей (JSON: key, label, type, required, filter, values)</label>
            <textarea id="rs-fields" rows={14} className={`${input} font-mono text-xs`} value={f} onChange={(e) => setF(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rs-rules" className={label}>Правила (markdown)</label>
            <textarea id="rs-rules" rows={14} className={`${input} text-sm`} value={r} onChange={(e) => setR(e.target.value)} />
          </div>
          <button type="button" className={btn} disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      )}
      {error && <p role="alert" className={err}>{error}</p>}
    </div>
  );
}
