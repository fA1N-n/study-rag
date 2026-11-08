"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, btnGhost, err, input, label } from "@/components/ui";
import type { FieldDef } from "./LabelEditor";

type Vote = { agent: string; model: string | null; values: Record<string, unknown>; confidence: number | null; rationale: string | null };

/** Решение человека по документу из очереди: принять итог как есть, взять голос агента или поправить поле. */
export default function ReviewForm({ docId, nextHref, fields, current, votes, disputed }: { docId: string; nextHref: string | null; fields: FieldDef[]; current: Record<string, unknown>; votes: Vote[]; disputed: string[] }) {
  const router = useRouter();
  const [vals, setVals] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(values = vals) {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/documents/${docId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ labels: values }) });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Не удалось сохранить");
    router.push(nextHref ?? "?");
    router.refresh();
  }

  // горячие клавиши: Enter — сохранить, 1/2/3 — взять голос A/B/арбитра, → — пропустить
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const v = votes[Number(e.key) - 1];
      if (v) setVals({ ...vals, ...v.values });
      else if (e.key === "Enter") save();
      else if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const show = (v: unknown) => (v === undefined || v === null || v === "" ? "∅" : String(v));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-mute">
              <th className="px-2 py-1.5 font-medium">Поле</th>
              {votes.map((v, i) => (
                <th key={i} className="px-2 py-1.5 font-medium">
                  <button type="button" className="text-acc hover:underline" onClick={() => setVals({ ...vals, ...v.values })} title="Взять все значения этого агента">
                    {i + 1}. {v.agent}
                  </button>
                  <div className="font-normal">{v.confidence?.toFixed(2)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className={`border-t border-line ${disputed.includes(f.key) ? "bg-warn/10" : ""}`}>
                <td className="px-2 py-1.5 text-mute">{f.label}</td>
                {votes.map((v, i) => (
                  <td key={i} className="px-2 py-1.5">
                    <button type="button" className="text-left hover:text-acc" onClick={() => setVals({ ...vals, [f.key]: v.values[f.key] ?? null })}>{show(v.values[f.key])}</button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {votes.filter((v) => v.rationale).map((v, i) => (
        <p key={i} className="text-xs"><b>{v.agent}:</b> <span className="italic text-mute">{v.rationale}</span></p>
      ))}
      <div className="space-y-2">
        {fields.map((f) => {
          const id = `rv-${f.key}`;
          const v = vals[f.key];
          return (
            <div key={f.key}>
              <label htmlFor={id} className={label}>{f.label}{disputed.includes(f.key) ? " · спорное" : ""}</label>
              {f.type === "enum" ? (
                <select id={id} className={input} value={v == null ? "" : String(v)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value || null })}>
                  <option value="">—</option>
                  {f.values!.map((x) => <option key={x}>{x}</option>)}
                </select>
              ) : f.type === "bool" ? (
                <select id={id} className={input} value={v == null ? "" : String(v)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value === "" ? null : e.target.value === "true" })}>
                  <option value="">—</option><option value="true">да</option><option value="false">нет</option>
                </select>
              ) : (
                <input id={id} className={input} type={f.type === "int" ? "number" : "text"} value={v == null ? "" : String(v)}
                  onChange={(e) => setVals({ ...vals, [f.key]: f.type === "int" ? (e.target.value ? Number(e.target.value) : null) : e.target.value })} />
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className={err}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy} onClick={() => save()}>{busy ? "Сохраняем…" : "Сохранить решение ⏎"}</button>
        {nextHref && <button type="button" className={btnGhost} onClick={() => router.push(nextHref)}>Пропустить →</button>}
      </div>
      <p className="text-[11px] text-mute">Клавиши: 1/2/3 — взять голос агента, Enter — сохранить, → — пропустить.</p>
    </div>
  );
}
