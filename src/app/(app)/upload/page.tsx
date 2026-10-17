"use client";

import Link from "next/link";
import { useState } from "react";
import { btn, card, err, input, label, muted } from "@/components/ui";
import { DOC_TYPES, subjects, type DocType } from "@/lib/mock";

const MAX_SIZE = 5 * 1024 * 1024;

// Простой разбор frontmatter `key: "value"` — в части 3 заменится полноценным парсером.
function parseFrontmatter(text: string) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta: Record<string, string> = {};
  m?.[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  });
  return meta;
}

type Phase = "idle" | "uploading" | "done";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [docType, setDocType] = useState<DocType>("лекция");
  const [units, setUnits] = useState(0);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  async function pick(f: File | undefined) {
    setError("");
    setPhase("idle");
    if (!f) return setFile(null);
    if (!f.name.endsWith(".md")) return setError("Нужен файл .md в формате сбора данных");
    if (f.size > MAX_SIZE) return setError("Файл больше 5 МБ");
    const text = await f.text();
    const meta = parseFrontmatter(text);
    setFile(f);
    setTitle(meta.title ?? f.name.replace(/\.md$/, ""));
    setSubjectId(subjects.find((s) => s.name === meta.subject)?.id ?? "");
    if (DOC_TYPES.includes(meta.doc_type as DocType)) setDocType(meta.doc_type as DocType);
    setUnits((text.match(/^## (Слайд|Страница|Раздел)/gm) ?? []).length);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Выберите файл");
    if (!title.trim()) return setError("Введите название");
    if (!subjectId) return setError("Выберите предмет");
    if (units === 0) return setError("В файле нет разделов «## Слайд N» / «## Страница N»");
    setError("");
    setPhase("uploading");
    // Демо: имитация загрузки в Storage и индексации.
    let p = 0;
    const timer = setInterval(() => {
      p += 10;
      setProgress(p);
      if (p >= 100) { clearInterval(timer); setPhase("done"); }
    }, 150);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Загрузка документа</h1>
        <p className={muted}>
          Markdown в формате сбора данных: frontmatter и разделы «## Слайд N» / «## Страница N». <a href="/sample.md" download className="text-indigo-600 underline">Пример файла</a>
        </p>
      </div>

      <form onSubmit={submit} noValidate className={`${card} space-y-4`}>
        <div>
          <label htmlFor="file" className={label}>Файл (.md, до 5 МБ)</label>
          <input id="file" type="file" accept=".md,text/markdown" onChange={(e) => pick(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300" />
          {file && <p className={`${muted} mt-1 text-xs`}>{file.name} · {(file.size / 1024).toFixed(1)} КБ · найдено единиц: {units}</p>}
        </div>
        <div>
          <label htmlFor="title" className={label}>Название</label>
          <input id="title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="subject" className={label}>Предмет</label>
            <select id="subject" className={input} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Выберите…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.semester} сем)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="type" className={label}>Тип</label>
            <select id="type" className={input} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {error && <p role="alert" className={err}>{error}</p>}

        {phase !== "idle" && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className={`${muted} mt-1 text-xs`}>
              {phase === "uploading" ? (progress < 50 ? "Загрузка файла…" : "Разбиение на чанки и эмбеддинги…") : `Готово: ${units} чанков проиндексировано.`}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className={btn} disabled={phase === "uploading"}>{phase === "uploading" ? "Загружаем…" : "Загрузить"}</button>
          {phase === "done" && <Link href="/library" className="text-sm text-indigo-600">Открыть библиотеку →</Link>}
        </div>
      </form>
    </div>
  );
}
