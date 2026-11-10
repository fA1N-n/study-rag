import Link from "next/link";
import { card } from "@/components/ui";
import type { Kpi } from "@/lib/board";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const num = (n: number) => n.toLocaleString("ru-RU");
const dec = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

function tokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} M`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} K`;
  return num(n);
}

function Tile({ label, value, note, tone }: { label: string; value: React.ReactNode; note: React.ReactNode; tone?: "ok" | "mute" }) {
  return (
    <div className={card}>
      <div className="text-xs text-mute">{label}</div>
      <div className="text-[26px] font-bold leading-tight tracking-tight">{value}</div>
      <div className={`text-xs ${tone === "ok" ? "text-ok" : "text-mute"}`}>{note}</div>
    </div>
  );
}

export default function Kpis({ kpi, offline, reviewHref }: { kpi: Kpi; offline: boolean; reviewHref: string }) {
  const done = kpi.total > 0 && kpi.labeled === kpi.total;
  const kappa = kpi.kappa.length ? `κ A/B ${dec(Math.min(...kpi.kappa))}–${dec(Math.max(...kpi.kappa))}` : "κ A/B ещё не посчитана";
  return (
    <>
      <Tile
        label="Размечено"
        value={<span className="font-mono">{num(kpi.labeled)} / {num(kpi.total)}</span>}
        note={done ? `готово · ${kappa}` : kappa}
        tone={done ? "ok" : "mute"}
      />
      <Tile
        label="Авто (A и B согласны)"
        value={`${pct(kpi.agreed, kpi.total)} %`}
        note={`арбитр ${pct(kpi.refereed, kpi.total)} % · человеку ${pct(kpi.review + kpi.human, kpi.total)} %`}
      />
      <Tile
        label="На проверку"
        value={<span className="font-mono">{num(kpi.review)}</span>}
        note={kpi.review ? <Link href={reviewHref} className="text-acc hover:underline">открыть очередь →</Link> : "очередь пуста"}
      />
      <Tile
        label="Токены"
        value={kpi.tokens ? <span className="font-mono">{tokens(kpi.tokens)}</span> : "—"}
        note={kpi.tokens ? "вход + выход, бесплатные модели" : offline ? "офлайн-разметка, токены не учитывались" : "задание ещё не начато"}
      />
    </>
  );
}
