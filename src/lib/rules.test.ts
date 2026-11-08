import { describe, expect, it } from "vitest";
import { splitSamples, stratify, type SampleDoc } from "./rules";

const doc = (id: string, top: string, units: number): SampleDoc => ({ id, filename: id, source_path: `C:\\Users\\[пользователь]\\${top}\\${id}.pdf`, units, preview: "" });

describe("stratify", () => {
  const docs = [
    ...Array.from({ length: 10 }, (_, i) => doc(`a${i}`, "telegram", 3)),
    ...Array.from({ length: 10 }, (_, i) => doc(`b${i}`, "Загрузки", 40)),
    doc("c0", "blackboard", 10),
  ];
  it("берёт из каждой страты по очереди, редкая страта не теряется", () => {
    const s = stratify(docs, 6);
    expect(s).toHaveLength(6);
    const count = (p: string) => s.filter((d) => d.id[0] === p).length;
    expect(count("c")).toBe(1);
    expect(count("a")).toBeGreaterThanOrEqual(2);
    expect(count("b")).toBeGreaterThanOrEqual(2);
  });
  it("исключённые не попадают, порядок детерминирован, n больше пула — весь пул", () => {
    const first = stratify(docs, 5);
    const second = stratify(docs, 5, new Set(first.map((d) => d.id)));
    expect(second.some((d) => first.includes(d))).toBe(false);
    expect(stratify([...docs].reverse(), 5)).toEqual(first);
    expect(stratify(docs, 100)).toHaveLength(docs.length);
    expect(stratify([], 5)).toEqual([]);
  });
});

describe("splitSamples", () => {
  it("маленький набор: критику остаются другие документы", () => {
    const docs = Array.from({ length: 8 }, (_, i) => doc(`d${i}`, "x", 3));
    const [a, b] = splitSamples(docs);
    expect(a).toHaveLength(5);
    expect(b).toHaveLength(3);
    expect(b.some((d) => a.includes(d))).toBe(false);
  });
  it("большой набор — 25 и 15; один документ — критик видит тот же", () => {
    const docs = Array.from({ length: 100 }, (_, i) => doc(`d${i}`, "x", 3));
    expect(splitSamples(docs).map((s) => s.length)).toEqual([25, 15]);
    const [a, b] = splitSamples([doc("one", "x", 1)]);
    expect(b).toEqual(a);
  });
});
