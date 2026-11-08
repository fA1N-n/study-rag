import { describe, expect, it } from "vitest";
import { parseJson } from "./llm";

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
