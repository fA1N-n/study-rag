// Цикл батча на подставной LLM (без сети): слияние, арбитр только по спорным, отбрасывание мусора.
import { describe, expect, it } from "vitest";
import type { Field } from "./labeling/schema";
import { readVotes, runBatch, type BatchDoc } from "./labeler";
import type { chat } from "./llm";

const fields: Field[] = [
  { key: "subject", label: "Предмет", type: "enum", required: true, filter: true, values: ["ОС", "БД"] },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
];
const rs = { fields, rules: "правила" };
const docs: BatchDoc[] = ["d1", "d2", "d3"].map((id) => ({ id, filename: `${id}.pdf`, source_path: "", units: 1, preview: "текст" }));
const reply = (labels: unknown) => JSON.stringify({ labels });

function fakeLlm(byModel: Record<string, unknown>) {
  const calls: string[] = [];
  const fn = (async (model: string) => {
    calls.push(model);
    return { text: reply(byModel[model]), usage: { tokensIn: 10, tokensOut: 5 }, model };
  }) as unknown as typeof chat;
  return { fn, calls };
}

describe("runBatch", () => {
  it("совпали → agreed; разошлись → арбитр; арбитр не уверен или промолчал → review", async () => {
    const A = [
      { doc_id: "d1", values: { subject: "ОС" }, confidence: 0.9 },
      { doc_id: "d2", values: { subject: "ОС" }, confidence: 0.9 },
      { doc_id: "d3", values: { subject: "БД" }, confidence: 0.9 },
    ];
    const B = [
      { doc_id: "d1", values: { subject: "ос" }, confidence: 0.8 }, // регистр приводится валидатором
      { doc_id: "d2", values: { subject: "БД" }, confidence: 0.8 },
      { doc_id: "d3", values: { subject: "ОС" }, confidence: 0.8 },
    ];
    const R = [{ doc_id: "d2", values: { subject: "БД" }, confidence: 0.9 }]; // по d3 арбитр промолчал
    const { fn, calls } = fakeLlm({ a: A, b: B, r: R });
    const out = await runBatch(rs, docs, { A: "a", B: "b", referee: "r" }, 0.7, fn);
    const st = Object.fromEntries(out.results.map((x) => [x.doc_id, [x.merged.status, x.merged.values.subject]]));
    expect(st).toEqual({ d1: ["agreed", "ОС"], d2: ["refereed", "БД"], d3: ["review", "БД"] });
    expect(calls.sort()).toEqual(["a", "b", "r"]);
    expect(out.usage).toEqual({ tokensIn: 30, tokensOut: 15 });
  });

  it("все согласны → арбитра не зовут", async () => {
    const v = docs.map((d) => ({ doc_id: d.id, values: { subject: "ОС" }, confidence: 0.95 }));
    const { fn, calls } = fakeLlm({ a: v, b: v });
    const out = await runBatch(rs, docs, { A: "a", B: "b", referee: "r" }, 0.7, fn);
    expect(calls).not.toContain("r");
    expect(out.results.every((x) => x.merged.status === "agreed")).toBe(true);
  });

  it("документ, пропущенный разметчиком, уходит человеку", async () => {
    const v = docs.slice(0, 2).map((d) => ({ doc_id: d.id, values: { subject: "ОС" }, confidence: 0.95 }));
    const { fn } = fakeLlm({ a: v, b: [...v, { doc_id: "d3", values: { subject: "ОС" }, confidence: 1 }], r: [] });
    const out = await runBatch(rs, docs, { A: "a", B: "b", referee: "r" }, 0.7, fn);
    expect(out.results.find((x) => x.doc_id === "d3")!.merged.status).toBe("review");
  });
});

describe("readVotes", () => {
  it("чужие и повторные doc_id отбрасываются, уверенность зажимается в 0..1, недопустимое значение выброшено", () => {
    const text = "```json\n" + reply([
      { doc_id: "d1", values: { subject: "Химия" }, confidence: 7 },
      { doc_id: "d1", values: { subject: "ОС" }, confidence: 0.5 },
      { doc_id: "zzz", values: { subject: "ОС" }, confidence: 0.5 },
      { doc_id: "d2", values: { subject: "БД" }, confidence: "abc" },
    ]) + "\n```";
    expect(readVotes(text, docs, fields)).toEqual([
      { doc_id: "d1", values: {}, confidence: 1, rationale: "" },
      { doc_id: "d2", values: { subject: "БД" }, confidence: 0, rationale: "" },
    ]);
    expect(readVotes("[]", docs, fields)).toEqual([]);
  });
});
