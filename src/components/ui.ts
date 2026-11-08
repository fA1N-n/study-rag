// Классы дизайна A «Консоль» (docs/design.md): плоские карточки, рамки 1 px, индиго для действий.
export const card = "rounded-[10px] border border-line bg-panel p-4";
export const input =
  "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-ink outline-none placeholder:text-mute focus:border-acc";
export const btn =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-acc px-3.5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-panel px-3 py-2 text-ink hover:bg-sub disabled:opacity-40";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-bad/40 px-3 py-2 text-bad hover:bg-bad/10 disabled:opacity-40";
export const label = "mb-1 block text-xs font-medium text-mute";
export const h4 = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute";
export const muted = "text-sm text-mute";
export const err = "text-sm text-bad";
export const mono = "font-mono";
export const skeleton = "animate-pulse rounded-[10px] bg-sub";
export const dialog = "m-auto w-[min(92vw,440px)] rounded-[10px] border border-line bg-panel p-0 text-ink backdrop:bg-black/40";

const PILL: Record<string, string> = {
  agreed: "bg-ok/15 text-ok",
  refereed: "bg-warn/15 text-warn",
  review: "bg-bad/15 text-bad",
  failed: "bg-bad/15 text-bad",
  human: "bg-acc-soft text-acc",
  unlabeled: "bg-sub text-mute",
};
export const pill = (status: string) => `rounded-full px-2 py-px text-[11px] ${PILL[status] ?? PILL.unlabeled}`;
