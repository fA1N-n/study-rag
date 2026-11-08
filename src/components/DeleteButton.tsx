"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { btnDanger, btnGhost, dialog, err } from "@/components/ui";

/** Удаление с подтверждением. after — куда уйти после удаления (иначе refresh). */
export default function DeleteButton({ url, what, after, className }: { url: string; what: string; after?: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function del() {
    setBusy(true);
    const r = await fetch(url, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Не удалось удалить");
    ref.current?.close();
    if (after) router.replace(after);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={className ?? btnDanger} onClick={() => { setError(""); ref.current?.showModal(); }}>Удалить</button>
      <dialog ref={ref} className={dialog}>
        <div className="space-y-4 p-5">
          <h2 className="text-base font-semibold">Удалить {what}?</h2>
          <p className="text-sm text-mute">Действие не отменить.</p>
          {error && <p role="alert" className={err}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => ref.current?.close()}>Отмена</button>
            <button type="button" className={btnDanger} onClick={del} disabled={busy}>{busy ? "Удаляем…" : "Удалить"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
