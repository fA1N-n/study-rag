// Каппа Коэна для двух разметчиков по одному полю.

export function cohenKappa(a: readonly string[], b: readonly string[]): number {
  if (a.length !== b.length) throw new Error("длины разметок не совпадают");
  if (a.length === 0) throw new Error("пустая разметка");
  const n = a.length;
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    ca.set(a[i], (ca.get(a[i]) ?? 0) + 1);
    cb.set(b[i], (cb.get(b[i]) ?? 0) + 1);
  }
  const po = agree / n;
  let pe = 0;
  for (const [k, x] of ca) pe += (x / n) * ((cb.get(k) ?? 0) / n);
  if (pe === 1) return 1; // обе разметки — одна и та же единственная категория
  return (po - pe) / (1 - pe);
}
