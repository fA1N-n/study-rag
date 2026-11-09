// Эмбеддинги Cloudflare Workers AI @cf/baai/bge-m3 (1024 измерения, бесплатно 10 000 нейронов в день ≈ 9 млн токенов).

const MAX_CHARS = 6000; // ~2 тыс. токенов: чанк ~2000 символов + заголовок с запасом

export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const { CLOUDFLARE_ACCOUNT_ID: acc, CLOUDFLARE_API_TOKEN: tok, EMBEDDING_MODEL: model = "@cf/baai/bge-m3" } = process.env;
  if (!acc || !tok) throw new Error("Cloudflare не настроен (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const part = texts.slice(i, i + 50).map((t) => t.slice(0, MAX_CHARS));
    let r: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(60_000),
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ text: part }),
      });
      if (r.status !== 429 && r.status < 500) break;
      await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
    }
    const b = await r!.json().catch(() => ({}));
    if (!r!.ok || !b.success) throw new Error(`эмбеддинги: ${b.errors?.[0]?.message ?? r!.status}`);
    out.push(...(b.result.data as number[][]));
  }
  return out;
}

/** Вектор → литерал pgvector/halfvec. */
export const vec = (v: number[]) => `[${v.map((x) => x.toFixed(5)).join(",")}]`;
