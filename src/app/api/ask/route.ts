import { z } from "zod";
import { body, fail, pgFail, session } from "@/lib/api";
import { parseFields } from "@/lib/labeling/schema";
import { chatStream } from "@/lib/llm";
import { answerMessages, buildContext, citedNumbers, cleanFilters, isRefusal, pickTop, REFUSAL, rerank, retrieve, rewrite, type Filters, type Hit, type Source } from "@/lib/rag/ask";
import { embed } from "@/lib/rag/embed";

export const maxDuration = 120;

const Ask = z.object({
  dataset_id: z.uuid(),
  question: z.string().trim().min(2, "вопрос — от 2 символов").max(2000),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  auto: z.boolean().default(true),
});

/** Вопрос → SSE: meta (запрос, фильтры), sources, token…, done. Вопрос пишется в БД до LLM — лимит демо срабатывает сразу. */
export async function POST(req: Request) {
  const t0 = Date.now();
  const s = await session();
  if (s instanceof Response) return s;
  const input = await body(req, Ask);
  if (input instanceof Response) return input;
  const { sb } = s;

  const { data: ds } = await sb.from("datasets").select("id,active_ruleset_id,status").eq("id", input.dataset_id).maybeSingle();
  if (!ds) return fail(404, "датасет не найден");
  const { count: chunks } = await sb.from("chunks").select("id", { count: "exact", head: true }).eq("dataset_id", ds.id);
  if (!chunks) return fail(400, "датасет не проиндексирован");
  const fields = ds.active_ruleset_id ? parseFields((await sb.from("rulesets").select("fields").eq("id", ds.active_ruleset_id).single()).data?.fields ?? []) : [];
  const explicit = cleanFilters(fields, input.filters);

  const { data: q, error: qErr } = await sb.from("questions").insert({ dataset_id: ds.id, question: input.question }).select("id").single();
  if (qErr) return pgFail(qErr);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let answer = "";
      let sources: Source[] = [];
      let rewritten = input.question;
      let filters: Filters = explicit;
      let model: string | null = null;
      try {
        const rw = input.auto ? await rewrite(input.question, fields) : { query: input.question, filters: {} };
        rewritten = rw.query;
        const auto = Object.fromEntries(Object.entries(rw.filters).filter(([k]) => !(k in explicit)));
        filters = { ...auto, ...explicit };
        const e = (await embed([rewritten]))[0];
        let hits = await retrieve(sb, ds.id, rewritten, filters, 30, e);
        let dropped = false;
        if (!hits.length && Object.keys(auto).length) {
          // автофильтр ошибся — ищем без него
          filters = explicit;
          dropped = true;
          hits = await retrieve(sb, ds.id, rewritten, filters, 30, e);
        }
        send("meta", { query: rewritten, auto: dropped ? {} : auto, explicit, dropped });

        const top = pickTop(await rerank(input.question, hits));
        const { data: docs } = await sb.from("documents").select("id,filename").in("id", [...new Set(hits.slice(0, 20).map((h) => h.document_id))]);
        const name = new Map((docs ?? []).map((d) => [d.id, d.filename]));
        const toSource = (h: Hit, n: number): Source => ({ n, chunk_id: h.id, document_id: h.document_id, filename: name.get(h.document_id) ?? "?", unit_label: h.unit_label, unit_no: h.unit_no, header: h.header, snippet: h.content.slice(0, 300), score: h.rerank ?? null });

        if (!top.length) {
          // честный отказ: ближайшие документы показываем, но ответ не выдумываем
          sources = hits.slice(0, 3).map((h, i) => toSource(h, i + 1));
          send("sources", { sources, nearest: true });
          answer = REFUSAL;
          send("token", { t: answer });
        } else {
          sources = top.map((h, i) => toSource(h, i + 1));
          send("sources", { sources, nearest: false });
          const { data: near } = await sb.rpc("neighbor_chunks", { p_ids: top.map((h) => h.id) });
          const onToken = (t: string) => {
            answer += t;
            send("token", { t });
          };
          const r = await chatStream(process.env.ASK_MODEL || process.env.LLM_MODEL || "", answerMessages(input.question, buildContext(sources, top, (near ?? []) as Hit[])), onToken, { maxTokens: 1500, temperature: 0.1, timeoutMs: 90_000 });
          model = r.model;
        }
        const refused = isRefusal(answer);
        const cited = new Set(citedNumbers(answer));
        await sb
          .from("questions")
          .update({ answer, refused, model, rewritten_query: rewritten, filters, sources: sources.map((x) => ({ ...x, cited: cited.has(x.n) })), latency_ms: Date.now() - t0 })
          .eq("id", q.id);
        send("done", { id: q.id, refused, latency_ms: Date.now() - t0 });
      } catch (err) {
        await sb.from("questions").update({ answer: answer || null, rewritten_query: rewritten, filters, latency_ms: Date.now() - t0 }).eq("id", q.id);
        send("error", { message: (err as Error).message.slice(0, 300) });
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}
