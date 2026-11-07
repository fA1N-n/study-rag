// Каппа Коэна. Критерии K1–K5.
import { describe, expect, it } from "vitest";
import { cohenKappa } from "./kappa";

const rep = (pairs: [string, string, number][]) => {
  const a: string[] = [], b: string[] = [];
  for (const [x, y, n] of pairs) for (let i = 0; i < n; i++) { a.push(x); b.push(y); }
  return [a, b] as const;
};

describe("cohenKappa", () => {
  it("K1: полное совпадение при ≥2 категориях → 1", () => {
    expect(cohenKappa(["а", "б", "а"], ["а", "б", "а"])).toBe(1);
  });

  it("K2: пример из учебника (20/5/10/15) → 0.4", () => {
    const [a, b] = rep([["y", "y", 20], ["y", "n", 5], ["n", "y", 10], ["n", "n", 15]]);
    expect(cohenKappa(a, b)).toBeCloseTo(0.4, 10);
  });

  it("K2: согласие на уровне случайности → 0, хуже случайного → < 0", () => {
    const [a, b] = rep([["y", "y", 25], ["y", "n", 25], ["n", "y", 25], ["n", "n", 25]]);
    expect(cohenKappa(a, b)).toBeCloseTo(0, 10);
    expect(cohenKappa(["y", "n"], ["n", "y"])).toBeLessThan(0);
  });

  it("K3: одна категория у обоих (pe = 1) → 1, без NaN", () => {
    expect(cohenKappa(["а", "а"], ["а", "а"])).toBe(1);
  });

  it("K4: разная длина или пусто → исключение", () => {
    expect(() => cohenKappa(["а"], ["а", "б"])).toThrow();
    expect(() => cohenKappa([], [])).toThrow();
  });

  it("K5: симметрична и учитывает 3+ категории", () => {
    const a = ["л", "з", "м", "л", "л", "з", "м", "м"];
    const b = ["л", "з", "л", "л", "з", "з", "м", "м"];
    expect(cohenKappa(a, b)).toBeCloseTo(cohenKappa(b, a), 12);
    // po = 6/8, pe = (3·3 + 2·3 + 3·2)/64 = 21/64 → κ = (0.75 − 21/64)/(1 − 21/64)
    expect(cohenKappa(a, b)).toBeCloseTo((0.75 - 21 / 64) / (1 - 21 / 64), 12);
  });
});
