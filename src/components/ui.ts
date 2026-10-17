// Общие классы Tailwind: квадратные углы, линейки вместо теней, моно для служебного текста.
export const card = "border border-rule bg-card";
export const input =
  "w-full border-0 border-b border-ink/30 bg-transparent px-0 py-2 text-[15px] outline-none placeholder:text-mute focus:border-accent";
export const btn =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap bg-ink px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";
export const btnGhost =
  "font-mono text-xs uppercase tracking-wider underline decoration-rule underline-offset-4 hover:text-accent hover:decoration-accent";
export const label = "mb-1 block font-mono text-[11px] uppercase tracking-wider text-mute";
export const kicker = "font-mono text-[11px] uppercase tracking-[0.14em] text-mute";
export const muted = "text-sm text-mute";
export const err = "font-mono text-xs text-accent";
export const dialog = "m-auto w-[min(92vw,440px)] border border-ink bg-card p-0 text-ink backdrop:bg-ink/40";

export const roman = (n: number) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n - 1] ?? String(n);
