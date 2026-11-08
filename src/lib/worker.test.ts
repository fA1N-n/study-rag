import { describe, expect, it } from "vitest";
import type { Field } from "./labeling/schema";
import { kappaByField } from "./worker";

const fields: Field[] = [
  { key: "subject", label: "Предмет", type: "enum", required: true, filter: true, values: ["ОС", "БД"] },
  { key: "title", label: "Название", type: "text", required: false, filter: false },
];
const v = (document_id: string, agent: string, subject: unknown) => ({ document_id, agent, values: { subject, title: agent } });

describe("kappaByField", () => {
  it("только ключевые поля, только документы с двумя голосами, регистр и пустое нормализуются", () => {
    const k = kappaByField(fields, [v("1", "A", "ОС"), v("1", "B", "ос"), v("2", "A", "БД"), v("2", "B", "БД"), v("3", "A", null), v("3", "B", ""), v("4", "A", "ОС")]);
    expect(k).toEqual({ subject: 1 });
  });
  it("нет пар — пусто", () => {
    expect(kappaByField(fields, [v("1", "A", "ОС")])).toEqual({});
  });
});
