"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { btn, btnGhost, dialog, err, input, label } from "@/components/ui";
import { DatasetInput } from "@/lib/schemas";

type Ds = { id: string; name: string; description: string | null };

/** Создать или переименовать датасет (одна форма). */
export default function DatasetDialog({ ds, trigger, className }: { ds?: Ds; trigger: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [name, setName] = useState(ds?.name ?? "");
  const [description, setDescription] = useState(ds?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = ds?.id ?? "new";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = DatasetInput.safeParse({ name, description });
    if (!p.success) return setError(p.error.issues[0].message);
    setBusy(true);
    const r = await fetch(ds ? `/api/datasets/${ds.id}` : "/api/datasets", {
      method: ds ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p.data),
    });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Не удалось сохранить");
    ref.current?.close();
    if (!ds) {
      setName("");
      setDescription("");
    }
    router.refresh();
  }

  return (
    <>
      <button type="button" className={className ?? btn} onClick={() => { setError(""); ref.current?.showModal(); }}>{trigger}</button>
      <dialog ref={ref} className={dialog}>
        <form onSubmit={save} noValidate className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{ds ? "Переименовать датасет" : "Новый датасет"}</h2>
          <div>
            <label htmlFor={`n-${id}`} className={label}>Название</label>
            <input id={`n-${id}`} className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`d-${id}`} className={label}>Описание (необязательно)</label>
            <textarea id={`d-${id}`} rows={3} className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p role="alert" className={err}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => ref.current?.close()}>Отмена</button>
            <button type="submit" className={btn} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
