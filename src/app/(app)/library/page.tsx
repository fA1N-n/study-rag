"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { btn, btnGhost, dialog, err, input, kicker, label, muted, roman } from "@/components/ui";
import { DOC_TYPES, documents as initialDocs, subjects as initialSubjects, type Doc, type DocType, type Subject } from "@/lib/mock";

const STATUS: Record<Doc["status"], [string, string]> = {
  ready: ["в фонде", "text-mute"],
  processing: ["индексация…", "text-accent"],
  failed: ["ошибка", "text-accent font-medium"],
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
  const subjectOf = (id: string) => subjects.find((s) => s.id === id);

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
    <div className="grid gap-10 md:grid-cols-[240px_1fr]">
      <aside className="h-fit">
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className={kicker}>Указатель предметов</h2>
          <button className={btnGhost} onClick={() => openSubject(emptySubject)}>+ предмет</button>
        </div>
        <button onClick={() => setSelected("")} className={`mt-3 block w-full text-left text-sm ${!selected ? "text-accent" : "hover:text-accent"}`}>
          {!selected && "— "}Весь фонд <span className="font-mono text-xs text-mute">({docs.length})</span>
        </button>
        {semesters.map((sem) => (
          <div key={sem} className="mt-5">
            <div className="mb-1 font-serif text-sm italic text-mute">{roman(sem)} семестр</div>
            {subjects.filter((s) => s.semester === sem).map((s) => (
              <div key={s.id} className="group flex items-baseline gap-2 py-0.5">
                <button onClick={() => setSelected(s.id)} className={`flex-1 text-left text-sm ${selected === s.id ? "text-accent" : "hover:text-accent"}`}>
                  {selected === s.id && "— "}{s.name}
                </button>
                <span className="flex gap-2 font-mono text-[10px] uppercase text-mute sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button aria-label={`Изменить ${s.name}`} onClick={() => openSubject(s)} className="hover:text-ink">изм</button>
                  <button aria-label={`Удалить ${s.name}`} onClick={() => deleteSubject(s)} className="hover:text-accent">удал</button>
                </span>
              </div>
            ))}
          </div>
        ))}
        {subjects.length === 0 && <p className={`${muted} mt-3`}>Предметов пока нет.</p>}
      </aside>

      <section>
        <div className="flex flex-col gap-4 border-b border-ink pb-3 sm:flex-row sm:items-end">
          <input className={input} placeholder="Поиск по названию" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по названию" />
          <select aria-label="Тип документа" className={`${input} sm:w-52`} value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">все типы</option>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <Link href="/upload" className={`${btn} shrink-0`}>Загрузить</Link>
        </div>

        {visible.length === 0 ? (
          <p className="py-12 text-center font-serif text-lg italic text-mute">Документов не найдено. Измените фильтры или загрузите документ.</p>
        ) : (
          <ul>
            {visible.map((d) => {
              const subj = subjectOf(d.subjectId);
              return (
                <li key={d.id} className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-2 border-b border-rule py-4 sm:grid-cols-[3.5rem_1fr_auto]">
                  <span className="pt-1 font-mono text-[11px] uppercase text-mute">{subj?.shortName}·{subj && roman(subj.semester)}</span>
                  <div className="min-w-0">
                    <Link href={`/library/${d.id}`} className="font-serif text-lg leading-snug hover:text-accent hover:underline">{d.title}</Link>
                    <div className={`${kicker} mt-1`}>
                      {d.docType} · {d.source} · {d.units.length} ед. · <span className={STATUS[d.status][1]}>{STATUS[d.status][0]}</span>
                    </div>
                  </div>
                  <div className="col-start-2 flex gap-4 sm:col-start-auto sm:pt-1.5">
                    <button className={btnGhost} onClick={() => openDoc(d)}>изменить</button>
                    <button className={`${btnGhost} text-accent`} onClick={() => deleteDoc(d)}>удалить</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <dialog ref={subjectDialog} className={dialog}>
        <form onSubmit={saveSubject} noValidate className="space-y-5 p-6">
          <h3 className="font-serif text-xl">{form.id ? "Карточка предмета" : "Новый предмет"}</h3>
          <div><label className={label}>Название</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={label}>Короткое имя</label><input className={`${input} font-mono`} placeholder="os" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></div>
          <div className="grid grid-cols-[5rem_1fr] gap-4">
            <div><label className={label}>Семестр</label><input type="number" min={1} max={8} className={input} value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} /></div>
            <div><label className={label}>Преподаватель</label><input className={input} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></div>
          </div>
          {formError && <p role="alert" className={err}>{formError}</p>}
          <div className="flex items-center justify-end gap-5 pt-2">
            <button type="button" className={btnGhost} onClick={() => subjectDialog.current?.close()}>отмена</button>
            <button className={btn}>Сохранить</button>
          </div>
        </form>
      </dialog>

      <dialog ref={docDialog} className={dialog}>
        {docForm && (
          <form onSubmit={saveDoc} noValidate className="space-y-5 p-6">
            <h3 className="font-serif text-xl">Карточка документа</h3>
            <div><label className={label}>Название</label><input className={input} value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></div>
            <div>
              <label className={label}>Предмет</label>
              <select className={input} value={docForm.subjectId} onChange={(e) => setDocForm({ ...docForm, subjectId: e.target.value })}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {roman(s.semester)} сем.</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Тип</label>
              <select className={input} value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value as DocType })}>
                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {formError && <p role="alert" className={err}>{formError}</p>}
            <div className="flex items-center justify-end gap-5 pt-2">
              <button type="button" className={btnGhost} onClick={() => docDialog.current?.close()}>отмена</button>
              <button className={btn}>Сохранить</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
