import { card, h4 } from "@/components/ui";
import type { BatchCell, CellStatus } from "@/lib/board";

const CELL: Record<CellStatus, { cls: string; label: string }> = {
  done: { cls: "bg-ok", label: "готов, A и B согласны" },
  refereed: { cls: "bg-warn", label: "решал арбитр" },
  review: { cls: "bg-bad", label: "есть документы на проверку" },
  running: { cls: "animate-pulse bg-acc", label: "в работе" },
  failed: { cls: "bg-bad/40 ring-1 ring-inset ring-bad", label: "ошибка, повтор" },
  queued: { cls: "bg-sub", label: "в очереди" },
};
const ORDER: CellStatus[] = ["done", "refereed", "review", "running", "failed", "queued"];

function tip(b: BatchCell) {
  const parts = Object.entries(b.counts).map(([k, v]) => `${k} ${v}`);
  return `Батч #${b.seq} · ${b.docs} док. · ${CELL[b.status].label}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

export default function BatchGrid({ batches, offline, ruleset }: { batches: BatchCell[]; offline: boolean; ruleset: string }) {
  const by = Object.groupBy(batches, (b) => b.status);
  const finished = batches.filter((b) => !["queued", "running", "failed"].includes(b.status)).length;
  const used = ORDER.filter((s) => by[s]?.length);
  return (
    <section className={`${card} col-span-2 md:col-span-4`} aria-labelledby="batches-h">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="batches-h" className={`${h4} mb-0`}>Батчи · {ruleset}</h2>
        <div className="flex h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-sub" aria-hidden>
          {ORDER.filter((s) => s !== "queued").map((s) =>
            by[s]?.length ? <i key={s} className={`block h-full ${CELL[s].cls.replace("animate-pulse ", "")}`} style={{ width: `${(by[s]!.length / batches.length) * 100}%` }} /> : null,
          )}
        </div>
        <span className="font-mono text-xs text-mute">{finished} / {batches.length}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-mute">
        {(used.length ? used : ORDER).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${CELL[s].cls.replace("animate-pulse ", "")}`} aria-hidden />
            {CELL[s].label} {by[s]?.length ? <span className="font-mono">{by[s]!.length}</span> : null}
          </li>
        ))}
      </ul>
      {batches.length === 0 ? (
        <p className="mt-3 text-sm text-mute">Батчей нет — запустите разметку после утверждения правил.</p>
      ) : (
        <ol className="mt-3 grid grid-cols-[repeat(auto-fill,26px)] gap-1" aria-label="Сетка батчей">
          {batches.map((b) => (
            <li key={b.seq} title={tip(b)} className={`aspect-square rounded-[3px] ${CELL[b.status].cls}`}>
              <span className="sr-only">{tip(b)}</span>
            </li>
          ))}
        </ol>
      )}
      {offline && batches.length > 0 && (
        <p className="mt-3 text-xs text-mute">
          Офлайн-разметка в Claude Code и Codex: заданий в БД нет, батчи — по 20 документов в порядке имени файла, цвет — по худшему статусу документа в батче.
        </p>
      )}
    </section>
  );
}
