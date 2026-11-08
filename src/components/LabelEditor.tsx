"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, err, input, label } from "@/components/ui";

export type FieldDef = { key: string; label: string; type: "enum" | "text" | "int" | "bool"; values?: string[]; required: boolean };

/** Правка меток человеком по схеме правил (сервер валидирует тем же zod-валидатором). */
export default function LabelEditor({ docId, fields, labels }: { docId: string; fields: FieldDef[]; labels: Record<string, unknown> }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, unknown>>(labels);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => {
    setSaved(false);
    setVals((x) => ({ ...x, [k]: v === "" ? null : v }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch(`/api/documents/${docId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ labels: vals }) });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Не удалось сохранить");
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {fields.map((f) => {
        const v = vals[f.key];
        const id = `f-${f.key}`;
        return (
          <div key={f.key}>
            <label htmlFor={id} className={label}>{f.label}{f.required ? " *" : ""}</label>
            {f.type === "enum" ? (
              <select id={id} className={input} value={v == null ? "" : String(v)} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {f.values!.map((x) => <option key={x}>{x}</option>)}
              </select>
            ) : f.type === "bool" ? (
              <select id={id} className={input} value={v == null ? "" : String(v)} onChange={(e) => set(f.key, e.target.value === "" ? "" : e.target.value === "true")}>
                <option value="">—</option><option value="true">да</option><option value="false">нет</option>
              </select>
            ) : (
              <input id={id} className={input} type={f.type === "int" ? "number" : "text"} value={v == null ? "" : String(v)}
                onChange={(e) => set(f.key, f.type === "int" && e.target.value ? Number(e.target.value) : e.target.value)} />
            )}
          </div>
        );
      })}
      {error && <p role="alert" className={err}>{error}</p>}
      <button className={`${btn} w-full`} disabled={busy}>{busy ? "Сохраняем…" : saved ? "Сохранено ✓" : "Сохранить как «человек»"}</button>
    </form>
  );
}
