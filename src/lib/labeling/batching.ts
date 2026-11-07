// Жадная нарезка документов на батчи по бюджету токенов и числу документов.

export function makeBatches(
  docs: { id: string; tokens: number }[],
  { maxTokens, maxDocs }: { maxTokens: number; maxDocs: number },
): string[][] {
  if (!(maxTokens > 0) || !Number.isInteger(maxDocs) || maxDocs < 1)
    throw new Error("maxTokens > 0, maxDocs — целое ≥ 1");
  const out: string[][] = [];
  let cur: string[] = [];
  let sum = 0;
  for (const d of docs) {
    if (!Number.isFinite(d.tokens) || d.tokens < 0) throw new Error(`некорректные токены у ${d.id}: ${d.tokens}`);
    if (cur.length && (sum + d.tokens > maxTokens || cur.length >= maxDocs)) {
      out.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(d.id);
    sum += d.tokens;
  }
  if (cur.length) out.push(cur);
  return out;
}
