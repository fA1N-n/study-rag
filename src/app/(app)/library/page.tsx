"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { btn, btnGhost, card, err, input, label, muted } from "@/components/ui";
import { DOC_TYPES, documents as initialDocs, subjects as initialSubjects, type Doc, type DocType, type Subject } from "@/lib/mock";

const STATUS: Record<Doc["status"], [string, string]> = {
  ready: ["готов", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"],
  processing: ["индексация", "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"],
  failed: ["ошибка", "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"],
};

const emptySubject: Subject = { id: "", name: "", shortName: "", semester: 1, teacher: "" };

function validateSubject(s: Subject, all: Subject[]) {
  if (s.name.trim().length < 2) return "Название — минимум 2 символа";
  if (!/^[a-z0-9_-]{2,40}$/.test(s.shortName)) return "Короткое имя: латиница, цифры, - и _, 2–40 символов";
  if (all.some((x) => x.id !== s.id && x.shortName === s.shortName)) return "Такое короткое имя уже есть";
  if (s.semester < 1 || s.semester > 8) return "Семестр от 1 до 8";
  return "";
}

export default function LibraryPage() {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [docs, setDocs] = useState(initialDocs);
  const [selected, setSelected] = useState<string>("");
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [form, setForm] = useState<Subject>(emptySubject);
  const [docForm, setDocForm] = useState<Doc | null>(null);
  const [formError, setFormError] = useState("");
  const subjectDialog = useRef<HTMLDialogElement>(null);
  const docDialog = useRef<HTMLDialogElement>(null);

  const visible = docs.filter(
    (d) => (!selected || d.subjectId === selected) && (!docType || d.docType === docType) && d.title.toLowerCase().includes(search.toLowerCase()),
  );
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "—";

  function openSubject(s: Subject) {
    setForm(s);
    setFormError("");
    subjectDialog.current?.showModal();
  }
  function saveSubject(e: React.FormEvent) {
    e.preventDefault();
    const error = validateSubject(form, subjects);
    if (error) return setFormError(error);
    setSubjects((all) => (form.id ? all.map((s) => (s.id === form.id ? form : s)) : [...all, { ...form, id: crypto.randomUUID() }]));
    subjectDialog.current?.close();
  }
  function deleteSubject(s: Subject) {
    const n = docs.filter((d) => d.subjectId === s.id).length;
    if (!confirm(`Удалить предмет «${s.name}»${n ? ` и ${n} документ(ов)` : ""}?`)) return;
    setSubjects((all) => all.filter((x) => x.id !== s.id));
    setDocs((all) => all.filter((d) => d.subjectId !== s.id));
    if (selected === s.id) setSelected("");
  }

  function openDoc(d: Doc) {
    setDocForm(d);
    setFormError("");
    docDialog.current?.showModal();
  }
  function saveDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm) return;
    if (!docForm.title.trim()) return setFormError("Введите название");
    setDocs((all) => all.map((d) => (d.id === docForm.id ? docForm : d)));
    docDialog.current?.close();
  }
  function deleteDoc(d: Doc) {
    if (confirm(`Удалить документ «${d.title}» вместе с чанками?`)) setDocs((all) => all.filter((x) => x.id !== d.id));
  }

  const semesters = [...new Set(subjects.map((s) => s.semester))].sort();

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <aside className={`${card} h-fit space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Предметы</h2>
          <button className={`${btnGhost} px-2 py-1 text-xs`} onClick={() => openSubject(emptySubject)}>+ Добавить</button>
        </div>
        <button onClick={() => setSelected("")} className={`block w-full rounded-lg px-2 py-1 text-left text-sm ${!selected ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : ""}`}>
          Все документы ({docs.length})
        </button>
        {semesters.map((sem) => (
          <div key={sem}>
            <div className={`${muted} mb-1 text-xs uppercase`}>{sem} семестр</div>
            {subjects.filter((s) => s.semester === sem).map((s) => (
              <div key={s.id} className={`group flex items-center rounded-lg ${selected === s.id ? "bg-indigo-50 dark:bg-indigo-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                <button onClick={() => setSelected(s.id)} className="flex-1 px-2 py-1 text-left text-sm">{s.name}</button>
                <button aria-label={`Изменить ${s.name}`} onClick={() => openSubject(s)} className="px-1 text-xs text-slate-400 hover:text-indigo-600">✎</button>
                <button aria-label={`Удалить ${s.name}`} onClick={() => deleteSubject(s)} className="px-1 pr-2 text-xs text-slate-400 hover:text-red-600">✕</button>
              </div>
            ))}
          </div>
        ))}
        {subjects.length === 0 && <p className={muted}>Предметов пока нет.</p>}
      </aside>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={input} placeholder="Поиск по названию" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Тип документа" className={`${input} sm:w-56`} value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">Все типы</option>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <Link href="/upload" className={btn}>Загрузить</Link>
        </div>

        {visible.length === 0 ? (
          <div className={`${card} text-center`}><p className={muted}>Документов не найдено. Измените фильтры или загрузите документ.</p></div>
        ) : (
          <ul className="space-y-2">
            {visible.map((d) => (
              <li key={d.id} className={`${card} flex flex-col gap-2 sm:flex-row sm:items-center`}>
                <div className="min-w-0 flex-1">
                  <Link href={`/library/${d.id}`} className="font-medium hover:text-indigo-600">{d.title}</Link>
                  <div className={`${muted} text-xs`}>
                    {subjectName(d.subjectId)} · {d.docType} · {d.source} · {d.units.length} ед.
                  </div>
                </div>
                <span className={`w-fit rounded-full px-2 py-0.5 text-xs ${STATUS[d.status][1]}`}>{STATUS[d.status][0]}</span>
                <div className="flex gap-1">
                  <button className={`${btnGhost} px-2 py-1 text-xs`} onClick={() => openDoc(d)}>Изменить</button>
                  <button className={`${btnGhost} px-2 py-1 text-xs text-red-600`} onClick={() => deleteDoc(d)}>Удалить</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dialog ref={subjectDialog} className={`${card} m-auto w-[min(92vw,420px)] p-0 text-inherit backdrop:bg-black/40`}>
        <form onSubmit={saveSubject} noValidate className="space-y-3 p-5">
          <h3 className="font-semibold">{form.id ? "Изменить предмет" : "Новый предмет"}</h3>
          <div><label className={label}>Название</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={label}>Короткое имя</label><input className={input} placeholder="os" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Семестр</label><input type="number" min={1} max={8} className={input} value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} /></div>
            <div><label className={label}>Преподаватель</label><input className={input} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></div>
          </div>
          {formError && <p role="alert" className={err}>{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => subjectDialog.current?.close()}>Отмена</button>
            <button className={btn}>Сохранить</button>
          </div>
        </form>
      </dialog>

      <dialog ref={docDialog} className={`${card} m-auto w-[min(92vw,420px)] p-0 text-inherit backdrop:bg-black/40`}>
        {docForm && (
          <form onSubmit={saveDoc} noValidate className="space-y-3 p-5">
            <h3 className="font-semibold">Метаданные документа</h3>
            <div><label className={label}>Название</label><input className={input} value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></div>
            <div>
              <label className={label}>Предмет</label>
              <select className={input} value={docForm.subjectId} onChange={(e) => setDocForm({ ...docForm, subjectId: e.target.value })}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.semester} сем)</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Тип</label>
              <select className={input} value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value as DocType })}>
                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {formError && <p role="alert" className={err}>{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => docDialog.current?.close()}>Отмена</button>
              <button className={btn}>Сохранить</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
