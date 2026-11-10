import { card, h4 } from "@/components/ui";
import type { Agent } from "@/lib/board";

const ROLE: Record<Agent["key"], string> = {
  A: "размечает каждый документ",
  B: "независимо, другой моделью",
  referee: "решает поля, где A ≠ B",
};

export default function AgentLanes({ agents }: { agents: Agent[] }) {
  const max = Math.max(1, ...agents.map((a) => a.votes));
  return (
    <section className={`${card} col-span-2`} aria-labelledby="agents-h">
      <h2 id="agents-h" className={h4}>Агенты</h2>
      <ul className="divide-y divide-line">
        {agents.map((a) => (
          <li key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="font-semibold">{a.name}</div>
              <div className="text-[11px] text-mute">{ROLE[a.key]}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[15px] font-medium">{a.votes.toLocaleString("ru-RU")}</div>
              <div className="text-[11px] text-mute">голосов</div>
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-1">
              {a.models.length ? (
                a.models.map((m) => (
                  <span key={m} className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px]">{m}</span>
                ))
              ) : (
                <span className="text-xs text-mute">модель не назначена</span>
              )}
              {a.confidence != null && (
                <span className="ml-auto font-mono text-[11px] text-mute">ср. уверенность {a.confidence.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
              )}
            </div>
            <div className="col-span-2 h-1 overflow-hidden rounded-full bg-sub" aria-hidden>
              <div className={`h-full rounded-full ${a.key === "referee" ? "bg-warn" : "bg-acc"}`} style={{ width: `${(a.votes / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
