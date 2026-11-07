// Дополнения по критику тестов: pii (P1–P8).
import { describe, expect, it } from "vitest";
import { maskPii } from "./pii";

describe("maskPii — дополнения критика", () => {
  it("P1: почта с +, - и поддоменом", () => {
    expect(maskPii("x: ivan.p+lab-3@mail.kai.ru.").text).toBe("x: [почта].");
  });
  it("P2: «8 (917) 111-22-33» и «8-917-111-22-33»", () => {
    expect(maskPii("8 (917) 111-22-33 и 8-917-111-22-33").text).toBe("[телефон] и [телефон]");
  });
  it("P4: «Выполнил:» и имя через пустую строку; не больше трёх слов", () => {
    expect(maskPii("Выполнил:\n\nИванов Иван Иванович").text).toBe("Выполнил:\n\n[ФИО]");
    expect(maskPii("Студента группы 4107 Петров Иван Сергеевич Казань").text).toBe("Студента группы 4107 [ФИО] Казань");
  });
  it("P6: флаг ставится и за почту, и за телефон", () => {
    expect(maskPii("a@b.ru").piiFlag).toBe(true);
    expect(maskPii("+79161234567").piiFlag).toBe(true);
  });
  it("P7: первый проход действительно маскирует, второй ничего не меняет", () => {
    const once = maskPii("Выполнил: Петрова К.С., тел. +7 917 111-22-33, a@b.ru").text;
    expect(once).toBe("Выполнил: [ФИО], тел. [телефон], [почта]");
    expect(maskPii(once)).toMatchObject({ text: once, piiFlag: false });
  });
  it("P8: вредные для регулярок входы по ~400 тыс. символов — быстро и без изменений", () => {
    for (const s of ["1 ".repeat(200_000), "А. Б ".repeat(80_000), "Студент ".repeat(50_000)]) {
      const t0 = performance.now();
      expect(maskPii(s).text).toBe(s);
      expect(performance.now() - t0).toBeLessThan(2000);
    }
    const big = "Лекция про семафоры. ".repeat(20_000);
    expect(maskPii(big + "Петрова К.С.").text).toBe(big + "[ФИО]");
  });
});
