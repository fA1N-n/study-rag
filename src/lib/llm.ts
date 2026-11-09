// LLM через fetch, без SDK: бесплатные модели OpenRouter (:free), запасной провайдер — Cloudflare Workers AI (@cf/…).
// Ответ-JSON разбираем сами: бесплатные модели не всегда держат response_format.

export type Usage = { tokensIn: number; tokensOut: number };
export type Msg = { role: "system" | "user" | "assistant"; content: string };
type Opts = { json?: boolean; maxTokens?: number; temperature?: number; signal?: AbortSignal; timeoutMs?: number };

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

export class LlmError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status; // без parameter property: скрипты запускаются node без сборки (strip-only)
  }
}

/** «модель1,модель2» → запасные модели: OpenRouter перейдёт к следующей, если первая перегружена (до 3). */
export const routing = (model: string) => {
  const list = model.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3);
  return list.length > 1 ? { models: list } : { model: list[0] };
};

/** Список моделей → шаги: сначала все модели OpenRouter одним запросом (models), потом каждая @cf/ отдельно. */
export function steps(model: string): { provider: "openrouter" | "cloudflare"; model: string }[] {
  const list = model.split(",").map((m) => m.trim()).filter(Boolean);
  const or = list.filter((m) => !m.startsWith("@cf/"));
  return [
    ...(or.length ? [{ provider: "openrouter" as const, model: or.join(",") }] : []),
    ...list.filter((m) => m.startsWith("@cf/")).map((m) => ({ provider: "cloudflare" as const, model: m })),
  ];
}

async function send(step: ReturnType<typeof steps>[number], messages: Msg[], o: Opts, stream: boolean): Promise<Response> {
  const common = { messages, temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 4000, stream };
  const signal = o.signal ?? AbortSignal.timeout(o.timeoutMs ?? 150_000); // зависшая бесплатная модель → ошибка и запасной шаг, а не вечное ожидание
  if (step.provider === "cloudflare") {
    const { CLOUDFLARE_ACCOUNT_ID: acc, CLOUDFLARE_API_TOKEN: tok } = process.env;
    if (!acc || !tok) throw new LlmError("Cloudflare не настроен", 503);
    return fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/v1/chat/completions`, {
      method: "POST", signal, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({ model: step.model, ...common }),
    });
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.endsWith("xxx")) throw new LlmError("OPENROUTER_API_KEY не задан", 503);
  return fetch(OPENROUTER, {
    method: "POST", signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Study RAG" },
    body: JSON.stringify({ ...routing(step.model), ...common, reasoning: { effort: "low" }, ...(o.json ? { response_format: { type: "json_object" } } : {}) }),
  });
}

async function failOf(r: Response) {
  const body = await r.json().catch(() => ({}));
  const e = body.error ?? body.errors?.[0];
  const why = e?.metadata?.raw ? `: ${String(e.metadata.raw).slice(0, 200)}` : "";
  return new LlmError(`${e?.message ?? `LLM ${r.status}`}${why}`, r.status);
}

/** Пройти шаги по очереди: ошибка шага (лимит, перегрузка, пустой ответ, тайм-аут) → следующий. */
async function each<T>(model: string, fn: (step: ReturnType<typeof steps>[number]) => Promise<T>): Promise<T> {
  let last: unknown = new LlmError("не задана модель", 503);
  for (const step of steps(model)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(step);
      } catch (e) {
        last = e;
        const st = e instanceof LlmError ? e.status : 0;
        // 429/5xx — одна пауза и повтор на том же шаге; иначе сразу следующий
        if (!(st === 429 || st >= 500) || attempt === 1) break;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    }
  }
  throw last;
}

export async function chat(model: string, messages: Msg[], o: Opts = {}) {
  return each(model, async (step) => {
    const r = await send(step, messages, o, false);
    if (!r.ok) throw await failOf(r);
    const body = await r.json();
    if (body.error) throw new LlmError(body.error.message ?? "LLM error", 502);
    const text: string = body.choices?.[0]?.message?.content ?? "";
    // рассуждающая модель может потратить весь лимит на рассуждение и вернуть пустой ответ
    if (!text.trim()) throw new LlmError(`пустой ответ модели (${body.choices?.[0]?.finish_reason ?? "?"})`, 502);
    const usage: Usage = { tokensIn: body.usage?.prompt_tokens ?? 0, tokensOut: body.usage?.completion_tokens ?? 0 };
    return { text: text.trim(), usage, model: (body.model as string) ?? step.model.split(",")[0] };
  });
}

/** Потоковый ответ: onToken на каждый кусок текста. Запасной шаг — только пока не пришёл первый кусок. */
export async function chatStream(model: string, messages: Msg[], onToken: (t: string) => void, o: Opts = {}) {
  return each(model, async (step) => {
    const r = await send(step, messages, o, true);
    if (!r.ok || !r.body) throw await failOf(r);
    let used = step.model.split(",")[0];
    let got = false;
    let buf = "";
    const dec = new TextDecoder();
    for await (const part of r.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(part, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const j = JSON.parse(data);
        if (j.error) throw new LlmError(j.error.message ?? "stream error", got ? 400 : 502);
        if (j.model) used = j.model;
        const t: string = j.choices?.[0]?.delta?.content ?? "";
        if (t) {
          if (!got && !t.trim()) continue; // ведущие переводы строк
          got = true;
          onToken(t);
        }
      }
    }
    if (!got) throw new LlmError("пустой ответ модели", 502);
    return { model: used };
  });
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
