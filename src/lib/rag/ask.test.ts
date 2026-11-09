import { describe, expect, it } from "vitest";
import type { Field } from "../labeling/schema";
import type { chat } from "../llm";
import { buildContext, citedNumbers, cleanFilters, ftsQuery, isRefusal, pickTop, readScores, REFUSAL, rerank, rewrite, type Hit, type Source } from "./ask";

const fields: Field[] = [
  { key: "subject", label: "Предмет", type: "enum", required: true, filter: true, values: ["Базы данных", "ОС"] },
  { key: "semester", label: "Семестр", type: "int", required: false, filter: true, min: 1, max: 8 },
  { key: "teacher", label: "Преподаватель", type: "text", required: false, filter: true },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
];
const hit = (id: number, unit_no = 1, document_id = "d"): Hit => ({ id, document_id, unit_label: `Слайд ${unit_no}`, unit_no, header: `h${id}`, content: `текст ${id}`, score: 1 / id });
const fake = (text: string | Error) => (async () => {
  if (text instanceof Error) throw text;
  return { text, usage: { tokensIn: 0, tokensOut: 0 }, model: "m" };
}) as unknown as typeof chat;

describe("cleanFilters", () => {
  it("регистр enum → канон, строковое число → число, вне границ / текстовые / чужие поля / пустые — прочь", () => {
    expect(cleanFilters(fields, { subject: "базы данных", semester: "3", teacher: "Иванов", foo: 1, title: "x" })).toEqual({ subject: "Базы данных", semester: 3 });
    expect(cleanFilters(fields, { subject: "Химия", semester: 12 })).toEqual({});
    expect(cleanFilters(fields, { subject: "", semester: null })).toEqual({});
    expect(cleanFilters(fields, "мусор")).toEqual({});
  });
});

describe("ftsQuery", () => {
  it("слова от 3 букв через or, без повторов, предлоги и знаки отброшены", () => {
    expect(ftsQuery("Что такое 3НФ в БД? Что?")).toBe("что or такое or 3нф");
    expect(ftsQuery("?!")).toBe("");
  });
});

describe("rewrite", () => {
  it("берёт запрос и чистит фильтры; ошибка или мусор → вопрос как есть", async () => {
    expect(await rewrite("вопрос", fields, fake('{"query": "нормализация 3НФ", "filters": {"subject": "БАЗЫ ДАННЫХ", "semester": 99}}'))).toEqual({ query: "нормализация 3НФ", filters: { subject: "Базы данных" } });
    expect(await rewrite("вопрос", fields, fake(new Error("429")))).toEqual({ query: "вопрос", filters: {} });
    expect(await rewrite("вопрос", fields, fake('{"query": ""}'))).toEqual({ query: "вопрос", filters: {} });
  });
});

describe("rerank и pickTop", () => {
  it("readScores: номера вне диапазона и мусор отбрасываются, оценки в 0..10", () => {
    expect([...readScores('{"scores":[{"i":1,"score":7},{"i":5,"score":3},{"i":2,"score":15},{"i":"x"}]}', 3)]).toEqual([[1, 7], [2, 10]]);
  });
  it("сортирует по оценке; порог отсекает; все ниже порога → пусто (отказ)", async () => {
    const r = await rerank("q", [hit(1), hit(2), hit(3)], fake('{"scores":[{"i":1,"score":2},{"i":2,"score":9},{"i":3,"score":5}]}'));
    expect(r.map((h) => [h.id, h.rerank])).toEqual([[2, 9], [3, 5], [1, 2]]);
    expect(pickTop(r).map((h) => h.id)).toEqual([2, 3]);
    expect(pickTop(r.map((h) => ({ ...h, rerank: 1 })))).toEqual([]);
  });
  it("rerank упал → порядок RRF без отказа", async () => {
    const r = await rerank("q", [hit(1), hit(2)], fake(new Error("down")));
    expect(r.map((h) => h.rerank)).toEqual([null, null]);
    expect(pickTop(r).map((h) => h.id)).toEqual([1, 2]);
  });
});

describe("контекст и ответ", () => {
  it("источник [n] с соседями ±1 по порядку, чужой документ не подмешивается", () => {
    const hits = [hit(10, 5)];
    const src: Source[] = [{ n: 1, chunk_id: 10, document_id: "d", filename: "f", unit_label: "Слайд 5", unit_no: 5, header: "H", snippet: "", score: 9 }];
    const ctx = buildContext(src, hits, [hit(11, 6), hit(9, 4), hit(12, 7), hit(13, 6, "other")]);
    expect(ctx).toBe("[1] H\n(Слайд 4) текст 9\n(Слайд 5) текст 10\n(Слайд 6) текст 11");
  });
  it("отказ и сноски распознаются", () => {
    expect(isRefusal(`  ${REFUSAL}`)).toBe(true);
    expect(isRefusal("Третья нормальная форма [1]")).toBe(false);
    expect(citedNumbers("a [1], b [3][1] и [12]")).toEqual([1, 3, 12]);
  });
});
