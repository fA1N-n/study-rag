import { describe, expect, it } from "vitest";
import { parseJson, routing } from "./llm";

describe("parseJson", () => {
  it("снимает ```json и текст вокруг", () => {
    expect(parseJson('Вот ответ:\n```json\n{"a": 1, "b": "x}"}\n```\nГотово')).toEqual({ a: 1, b: "x}" });
  });
  it("первый объект, скобки внутри строк не мешают", () => {
    expect(parseJson('{"s": "{[}]", "n": {"m": [1, 2]}} хвост {"x":2}')).toEqual({ s: "{[}]", n: { m: [1, 2] } });
  });
  it("экранированная кавычка", () => {
    expect(parseJson('{"q": "он сказал \\"да\\""}')).toEqual({ q: 'он сказал "да"' });
  });
  it("нет JSON или оборван → ошибка", () => {
    expect(() => parseJson("нет")).toThrow(/нет JSON/);
    expect(() => parseJson('{"a": [1, 2')).toThrow(/оборван/);
  });
});

describe("routing", () => {
  it("одна модель — model, список через запятую — models (до 3)", () => {
    expect(routing("a:free")).toEqual({ model: "a:free" });
    expect(routing("a:free, b:free,c,d")).toEqual({ models: ["a:free", "b:free", "c"] });
  });
});

describe("steps", () => {
  it("модели OpenRouter — одним шагом, @cf/ — каждая отдельно после них", async () => {
    const { steps } = await import("./llm");
    expect(steps("a:free, @cf/q, b:free")).toEqual([
      { provider: "openrouter", model: "a:free,b:free" },
      { provider: "cloudflare", model: "@cf/q" },
    ]);
    expect(steps("@cf/q")).toEqual([{ provider: "cloudflare", model: "@cf/q" }]);
  });
});
