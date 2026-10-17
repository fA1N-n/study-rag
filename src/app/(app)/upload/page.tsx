"use client";

import Link from "next/link";
import { useState } from "react";
import { btn, err, input, kicker, label, roman } from "@/components/ui";
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
  const [drag, setDrag] = useState(false);

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
    <div className="mx-auto max-w-2xl">
      <p className={kicker}>Поступления</p>
      <h1 className="mt-2 font-serif text-4xl">Новый документ в фонд</h1>
      <p className="mt-3 text-sm text-mute">
        Markdown в формате сбора данных: frontmatter и разделы «## Слайд N» / «## Страница N».{" "}
        <a href="/sample.md" download className="text-ink underline decoration-accent underline-offset-4 hover:text-accent">Образец файла</a>
      </p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-6">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`block cursor-pointer border border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-accent bg-mark/40" : "border-ink/40 hover:border-ink"}`}>
          <input type="file" accept=".md,text/markdown" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <span className="font-serif text-lg">{file.name}</span>
              <span className={`${kicker} mt-2 block`}>{(file.size / 1024).toFixed(1)} КБ · единиц: {units} · заменить</span>
            </>
          ) : (
            <>
              <span className="font-serif text-lg">Перетащите .md сюда или <span className="underline decoration-accent underline-offset-4">выберите файл</span></span>
              <span className={`${kicker} mt-2 block`}>до 5 МБ</span>
            </>
          )}
        </label>

        <div>
          <label htmlFor="title" className={label}>Название</label>
          <input id="title" className={`${input} font-serif text-lg`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="subject" className={label}>Предмет</label>
            <select id="subject" className={input} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">выберите…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {roman(s.semester)} сем.</option>)}
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
            <div className="h-0.5 bg-rule"><div className="h-full bg-ink transition-all" style={{ width: `${progress}%` }} /></div>
            <p className={`${kicker} mt-2 flex justify-between`}>
              <span>{phase === "uploading" ? (progress < 50 ? "загрузка файла" : "разбиение на чанки и эмбеддинги") : `в фонде: ${units} чанков проиндексировано`}</span>
              <span>{progress}%</span>
            </p>
          </div>
        )}

        <div className="flex items-center gap-6 border-t border-ink pt-5">
          <button className={btn} disabled={phase === "uploading"}>{phase === "uploading" ? "Загружаем…" : "Принять в фонд"}</button>
          {phase === "done" && <Link href="/library" className="text-sm underline decoration-accent underline-offset-4 hover:text-accent">Открыть указатель →</Link>}
        </div>
      </form>
    </div>
  );
}
