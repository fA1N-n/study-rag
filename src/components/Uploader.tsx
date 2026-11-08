"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { btn, card, err, h4 } from "@/components/ui";
import { browserDb } from "@/lib/supabase/client";

const ACCEPT = ".zip,.md,.txt,.pdf,.docx";
const MAX_FILE = 50 * 1024 * 1024; // лимит Supabase Free на файл

type Result = { added: number; total: number; skipped: { name: string; reason: string }[] };

/** Файлы → Storage напрямую из браузера (обходит лимит тела Vercel 4,5 МБ) → /ingest. */
export default function Uploader({ datasetId, userId, demo }: { datasetId: string; userId: string; demo: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"" | "upload" | "ingest">("");
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function pick(list: FileList | null) {
    const arr = [...(list ?? [])];
    const bad = arr.find((f) => !new RegExp(`\\.(${ACCEPT.replaceAll(".", "").replaceAll(",", "|")})$`, "i").test(f.name));
    const big = arr.find((f) => f.size > MAX_FILE);
    setError(bad ? `«${bad.name}»: формат не поддерживается` : big ? `«${big.name}» больше 50 МБ` : "");
    setFiles(bad || big ? [] : arr);
    setResult(null);
  }

  async function run() {
    setError("");
    setPhase("upload");
    setDone(0);
    const storage = browserDb().storage.from("datasets");
    const uploads: { path: string; name: string }[] = [];
    const stamp = Date.now();
    for (const [i, f] of files.entries()) {
      // ключ Storage — только ASCII; исходное имя уходит в ingest отдельно
      const ext = /\.[a-z0-9]+$/i.exec(f.name)?.[0].toLowerCase() ?? "";
      const path = `${userId}/${datasetId}/uploads/${stamp}-${i}${ext}`;
      const { error } = await storage.upload(path, f, { upsert: true });
      if (error) {
        setPhase("");
        return setError(`Не удалось загрузить «${f.name}»: ${error.message}`);
      }
      uploads.push({ path, name: f.webkitRelativePath || f.name });
      setDone(i + 1);
    }
    setPhase("ingest");
    const r = await fetch(`/api/datasets/${datasetId}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploads }),
    });
    setPhase("");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Разбор не удался");
    setResult(j);
    setFiles([]);
    router.refresh();
  }

  const busy = phase !== "";
  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-4 py-10 text-center ${drag ? "border-acc bg-acc-soft" : "border-line bg-panel"}`}
      >
        <span className="font-semibold">Перетащите zip или файлы сюда</span>
        <span className="text-sm text-mute">или нажмите, чтобы выбрать · .zip .md .txt .pdf .docx · до 50 МБ на файл{demo ? " · проверяющему — до 30 документов" : ""}</span>
        <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files)} disabled={busy} />
      </label>
      {files.length > 0 && (
        <div className={card}>
          <h2 className={h4}>Выбрано: {files.length}</h2>
          <ul className="mb-3 max-h-40 overflow-auto font-mono text-xs text-mute">
            {files.map((f) => <li key={f.name}>{f.name} · {(f.size / 1024).toFixed(0)} КБ</li>)}
          </ul>
          <button type="button" className={btn} onClick={run} disabled={busy}>
            {phase === "upload" ? `Загружаем ${done} / ${files.length}…` : phase === "ingest" ? "Разбираем документы…" : "Загрузить и разобрать"}
          </button>
          {busy && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sub">
              <div className={`h-full bg-acc ${phase === "ingest" ? "w-full animate-pulse" : ""}`} style={phase === "upload" ? { width: `${(done / files.length) * 100}%` } : undefined} />
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className={`${err} rounded-lg border border-bad/40 bg-bad/10 p-3`}>{error}</p>}
      {result && (
        <div className={card} role="status">
          <h2 className={h4}>Итог</h2>
          <p className="mb-2">Новых: <b>{result.added}</b> · пропущено: <b>{result.skipped.length}</b> · всего в датасете: <b>{result.total}</b></p>
          {result.skipped.length > 0 && (
            <ul className="max-h-60 overflow-auto text-sm">
              {result.skipped.map((s) => (
                <li key={s.name} className="flex justify-between gap-3 border-t border-line py-1">
                  <span className="truncate font-mono text-xs">{s.name}</span>
                  <span className={s.reason === "дубль" ? "text-mute" : "text-warn"}>{s.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
