// OpenRouter (бесплатные модели :free) через fetch, без SDK. Ответ-JSON разбираем сами: free-модели не всегда держат response_format.

export type Usage = { tokensIn: number; tokensOut: number };
export type Msg = { role: "system" | "user" | "assistant"; content: string };

const URL = "https://openrouter.ai/api/v1/chat/completions";

export class LlmError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

export async function chat(model: string, messages: Msg[], { json = false, maxTokens = 4000, temperature = 0.2, signal }: { json?: boolean; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.endsWith("xxx")) throw new LlmError("OPENROUTER_API_KEY не задан", 503);
  // ponytail: до 2 повторов на 429/5xx с паузой; очередь и бюджет запросов — если упрёмся в 50 запросов/день
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(URL, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Study RAG" },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...(json ? { response_format: { type: "json_object" } } : {}) }),
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 2) {
      await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
      continue;
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) throw new LlmError(body.error?.message ?? `OpenRouter ${r.status}`, r.status);
    const text: string = body.choices?.[0]?.message?.content ?? "";
    const usage: Usage = { tokensIn: body.usage?.prompt_tokens ?? 0, tokensOut: body.usage?.completion_tokens ?? 0 };
    return { text, usage, model: (body.model as string) ?? model };
  }
}

/** Первый JSON-объект в ответе модели (снимает ```json-обёртку и текст вокруг). */
export function parseJson<T = unknown>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const start = fenced.search(/[{[]/);
  if (start < 0) throw new LlmError("в ответе модели нет JSON");
  const open = fenced[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  for (let i = start; i < fenced.length; i++) {
    const c = fenced[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(fenced.slice(start, i + 1)) as T;
  }
  throw new LlmError("JSON в ответе модели оборван");
}
