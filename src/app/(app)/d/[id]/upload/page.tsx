import { Suspense } from "react";
import Uploader from "@/components/Uploader";
import { card, muted, skeleton } from "@/components/ui";
import { loadDataset } from "@/lib/data";

async function Upload({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, user, mine } = await loadDataset(id);
  return (
    <>
      <h1 className="text-xl font-semibold">Загрузка · {ds.name}</h1>
      <p className={`${muted} mb-4`}>Файлы уходят прямо в хранилище, затем сервер разбирает их на страницы, слайды и разделы, считает sha256 (дубли пропускаются) и маскирует ФИО, телефоны и почты.</p>
      {mine ? (
        <Uploader datasetId={id} userId={user.id} demo={user.role === "demo"} />
      ) : (
        <div className={card}>Загружать можно только в свой датасет. Создайте датасет на главной.</div>
      )}
    </>
  );
}

export default function UploadPage({ params }: PageProps<"/d/[id]/upload">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Suspense fallback={<div className={`${skeleton} h-48`} />}>
        <Upload params={params} />
      </Suspense>
    </main>
  );
}
