import { Suspense } from "react";
import AgentLanes from "@/components/board/AgentLanes";
import BatchGrid from "@/components/board/BatchGrid";
import DecisionsTable from "@/components/board/DecisionsTable";
import Kpis from "@/components/board/Kpis";
import { muted, skeleton } from "@/components/ui";
import { loadBoard } from "@/lib/board";
import { loadDataset } from "@/lib/data";

const JOB_RU: Record<string, string> = { queued: "в очереди", running: "идёт", done: "завершено", failed: "ошибка", canceled: "отменено" };

async function BoardView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, sb } = await loadDataset(id);
  const [board, rs] = await Promise.all([
    loadBoard(sb, ds),
    ds.active_ruleset_id ? sb.from("rulesets").select("version,status").eq("id", ds.active_ruleset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ruleset = rs.data ? `правила v${rs.data.version}${rs.data.status === "approved" ? "" : " (черновик)"}` : "правил нет";

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Разметка · {ds.name}</h1>
        <p className={muted}>
          {board.offline ? "Офлайн-разметка импортирована из Claude Code и Codex" : `Задание: ${JOB_RU[board.jobStatus ?? ""] ?? board.jobStatus}`} · два разметчика + арбитр, спорное — человеку
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <Kpis kpi={board.kpi} offline={board.offline} reviewHref={`/d/${id}/review`} />
        <BatchGrid batches={board.batches} offline={board.offline} ruleset={ruleset} />
        <AgentLanes agents={board.agents} />
        <DecisionsTable decisions={board.decisions} datasetId={id} />
      </div>
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4" aria-busy="true" aria-label="Загрузка доски">
      {[0, 1, 2, 3].map((i) => <div key={i} className={`${skeleton} h-24`} />)}
      <div className={`${skeleton} col-span-2 h-40 md:col-span-4`} />
      <div className={`${skeleton} col-span-2 h-56`} />
      <div className={`${skeleton} col-span-2 h-56`} />
    </div>
  );
}

export default function LabelingPage({ params }: PageProps<"/d/[id]/labeling">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6">
      <Suspense fallback={<BoardSkeleton />}>
        <BoardView params={params} />
      </Suspense>
    </main>
  );
}
