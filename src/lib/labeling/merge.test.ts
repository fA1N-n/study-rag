// Слияние разметчиков A/B и арбитра. Критерии M1–M7.
import { describe, expect, it } from "vitest";
import { disputedKeys, mergeLabels } from "./merge";
import { parseFields } from "./schema";

const fields = parseFields([
  { key: "subject", label: "Предмет", type: "enum", values: ["ОС", "Физика"], required: true, filter: true },
  { key: "doc_type", label: "Тип", type: "enum", values: ["лекция", "задание"], required: false, filter: true },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
]);
const T = 0.7;
const v = (values: Record<string, unknown>, confidence = 0.9) => ({ values, confidence });

describe("mergeLabels", () => {
  it("M1: ключевые поля совпали, уверенность ≥ порога → agreed, некл. поля от A, при отсутствии — от B", () => {
    const r = mergeLabels(fields, v({ subject: "ОС", doc_type: "лекция" }), v({ subject: "ОС", doc_type: "лекция", title: "Л1" }), null, T);
    expect(r).toEqual({ status: "agreed", values: { subject: "ОС", doc_type: "лекция", title: "Л1" }, disputed: [] });
  });

  it("M2: совпали, но уверенность одного ниже порога → review", () => {
    const r = mergeLabels(fields, v({ subject: "ОС" }, 0.5), v({ subject: "ОС" }), null, T);
    expect(r.status).toBe("review");
  });

  it("M3: расходятся без арбитра → needs_referee со списком спорных полей", () => {
    const r = mergeLabels(fields, v({ subject: "ОС", doc_type: "лекция" }), v({ subject: "Физика", doc_type: "лекция" }), null, T);
    expect(r).toMatchObject({ status: "needs_referee", disputed: ["subject"] });
  });

  it("M4: арбитр уверен → refereed, спорное от арбитра, согласованное сохранено", () => {
    const r = mergeLabels(
      fields,
      v({ subject: "ОС", doc_type: "лекция" }),
      v({ subject: "Физика", doc_type: "лекция" }),
      v({ subject: "ОС", doc_type: "задание" }, 0.8),
      T,
    );
    expect(r).toEqual({ status: "refereed", values: { subject: "ОС", doc_type: "лекция" }, disputed: ["subject"] });
  });

  it("M4: арбитр не уверен → review", () => {
    const r = mergeLabels(fields, v({ subject: "ОС" }), v({ subject: "Физика" }), v({ subject: "ОС" }, 0.4), T);
    expect(r.status).toBe("review");
    expect(r.disputed).toEqual(["subject"]);
  });

  it("M4: арбитр выдал недопустимое значение → review", () => {
    const r = mergeLabels(fields, v({ subject: "ОС" }), v({ subject: "Физика" }), v({ subject: "Химия" }, 0.95), T);
    expect(r.status).toBe("review");
  });

  it("M5: одного разметчика нет → все ключевые поля спорные", () => {
    const r = mergeLabels(fields, v({ subject: "ОС", doc_type: "лекция" }), null, null, T);
    expect(r).toMatchObject({ status: "needs_referee", disputed: ["subject", "doc_type"] });
  });

  it("M6: текстовые ключевые поля сравниваются без регистра и пробелов по краям", () => {
    const f = parseFields([{ key: "topic", label: "Тема", type: "text", required: true, filter: true }]);
    expect(disputedKeys(f, { topic: " Семафоры" }, { topic: "семафоры " })).toEqual([]);
  });

  it("M7: недопустимое значение у A считается отсутствием → спор с B", () => {
    const r = mergeLabels(fields, v({ subject: "Химия" }), v({ subject: "ОС" }), null, T);
    expect(r).toMatchObject({ status: "needs_referee", disputed: ["subject"] });
  });

  it("M7: поле отсутствует у обоих → не спор", () => {
    expect(disputedKeys(fields, { subject: "ОС" }, { subject: "ОС" })).toEqual([]);
  });

  it("M1: результат agreed проходит валидатор (обязательные поля на месте)", () => {
    const r = mergeLabels(fields, v({ doc_type: "лекция" }), v({ doc_type: "лекция" }), null, T);
    expect(r.status).toBe("review"); // subject обязателен, у обоих нет
  });
});
