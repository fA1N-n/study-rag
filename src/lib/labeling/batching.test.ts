// Батчинг по бюджету токенов. Критерии B1–B5.
import { describe, expect, it } from "vitest";
import { makeBatches } from "./batching";

const docs = (tokens: number[]) => tokens.map((t, i) => ({ id: `d${i}`, tokens: t }));

describe("makeBatches", () => {
  it("B1: пусто → []", () => {
    expect(makeBatches([], { maxTokens: 100, maxDocs: 5 })).toEqual([]);
  });

  it("B2: ни один батч не превышает maxDocs и maxTokens", () => {
    const input = docs([30, 40, 50, 10, 10, 10, 10, 90, 5, 5, 5, 5, 5]);
    const out = makeBatches(input, { maxTokens: 100, maxDocs: 4 });
    const tok = new Map(input.map((d) => [d.id, d.tokens]));
    for (const b of out) {
      expect(b.length).toBeLessThanOrEqual(4);
      expect(b.reduce((s, id) => s + tok.get(id)!, 0)).toBeLessThanOrEqual(100);
    }
    expect(out).toEqual([["d0", "d1"], ["d2", "d3", "d4", "d5"], ["d6", "d7"], ["d8", "d9", "d10", "d11"], ["d12"]]);
  });

  it("B3: документ больше бюджета — отдельный батч, не теряется", () => {
    expect(makeBatches(docs([10, 500, 10]), { maxTokens: 100, maxDocs: 5 })).toEqual([["d0"], ["d1"], ["d2"]]);
  });

  it("B4: порядок сохранён, каждый id ровно один раз (большой вход)", () => {
    const input = docs(Array.from({ length: 1000 }, (_, i) => (i * 37) % 900));
    const flat = makeBatches(input, { maxTokens: 2000, maxDocs: 20 }).flat();
    expect(flat).toEqual(input.map((d) => d.id));
  });

  it("B5: неверные параметры → ошибка", () => {
    expect(() => makeBatches(docs([1]), { maxTokens: 0, maxDocs: 5 })).toThrow();
    expect(() => makeBatches(docs([1]), { maxTokens: 10, maxDocs: 0 })).toThrow();
    expect(() => makeBatches(docs([-1]), { maxTokens: 10, maxDocs: 5 })).toThrow();
  });
});
