// Критерии I18–I20 — docs/ingest-core.md. ФИО и номера синтетические, по шаблонам из данных.
import { describe, expect, it } from "vitest";
import { maskFilename, maskPath, maskPii } from "./pii";

const keep = { keepNames: ["Бикмуллина Ильсияр Ильдаровна", "Сидоров Сергей Сергеевич"] };

describe("maskPii: ФИО с отчеством, КАПС, длинные номера (I18)", () => {
  it.each([
    ["ПАСПОРТ РФ 1234567890 ПЕТРОВА АННА ИВАНОВНА", "ПАСПОРТ РФ [номер] [ФИО]"],
    ["Пользователь 4107 Иван Петрович Сидоренко", "Пользователь 4107 [ФИО]"],
    ["Петрова Анна Ивановна1, студент", "[ФИО]1, студент"],
    ["билет 123456789012 до Казани", "билет [номер] до Казани"],
    ["Иванов<br>Иван Иванович", "[ФИО]"],
    ["Козлова Мария Сергеевна", "[ФИО]"],
    ["Ахметова Алия Ильдаровна, студентка", "[ФИО], студентка"],
    ["КУЗНЕЦОВ ИЛЬЯ ИЛЬИЧ", "[ФИО]"],
  ])("«%s» → «%s»", (src, want) => {
    expect(maskPii(src, keep).text).toBe(want);
  });

  it.each([
    "ORCID: 0009-0003-2501-6316, ISBN 5-93629-031-X",
    "группа 4307, 12.03.2024, вариант 11",
    "Бикмуллина Ильсияр Ильдаровна, доцент",
    "Ильсияр Ильдаровна Бикмуллина, доцент",
    "у Бикмуллиной Ильсияр Ильдаровны",
    "СИДОРОВ СЕРГЕЙ СЕРГЕЕВИЧ, преподаватель",
    "Лекция 5. Синхронизация процессов",
  ])("не трогает «%s»", (src) => {
    expect(maskPii(src, keep).text).toBe(src);
  });

  it("флаг ставится от доп. правил тоже", () => {
    expect(maskPii("паспорт 1234567890", keep).piiFlag).toBe(true); // голое число больше не ПДн (финальный критик, D4)
    expect(maskPii("Синхронизация процессов", keep).piiFlag).toBe(false);
  });
});

describe("maskFilename (I19)", () => {
  it.each([
    ["лаб3Иванов.docx", "лаб3[ФИО].docx"],
    ["Отчет_Петровой_ЛР2.pdf", "Отчет_[ФИО]_ЛР2.pdf"],
    ["ЛР1 Смирнова А.А..docx", "ЛР1 [ФИО].docx"],
    ["Курсовая Ковальчук.docx", "Курсовая [ФИО].docx"],
    ["Шевченко_отчёт.txt", "[ФИО]_отчёт.txt"],
    ["ЛР2 Галиуллин.docx", "ЛР2 [ФИО].docx"],
    ["Отчет Ковалевский.pdf", "Отчет [ФИО].pdf"],
    ["ДЗ Сергеев.md", "ДЗ [ФИО].md"],
  ])("«%s» → «%s»", (src, want) => {
    expect(maskFilename(src, keep).text).toBe(want);
    expect(maskFilename(src, keep).masked).toBe(true);
  });

  it.each(["Лекция 5. Синхронизация процессов.pdf", "Методичка к ЛР.docx", "Методичка Бикмуллиной.pdf", "Билеты.docx", "Основы программирования.md"])(
    "не трогает «%s»",
    (src) => {
      expect(maskFilename(src, keep)).toEqual({ text: src, masked: false });
    },
  );
});

describe("maskPath (I20)", () => {
  it("домашние папки и фамилии в частях пути", () => {
    expect(maskPath("C:\\Users\\vasya\\Downloads\\Лекция 1.pdf", keep)).toEqual({ text: "C:\\Users\\[пользователь]\\Downloads\\Лекция 1.pdf", masked: false });
    expect(maskPath("C:/Users/Вася Пупкин/Desktop/a.md", keep).text).toBe("C:/Users/[пользователь]/Desktop/a.md");
    expect(maskPath("/home/petrov/ОС/лаб3Петров.docx", keep).text).toBe("/home/[пользователь]/ОС/лаб3[ФИО].docx");
    expect(maskPath("ОС/Иванов/лаб3.docx", keep)).toEqual({ text: "ОС/[ФИО]/лаб3.docx", masked: true });
    expect(maskPath("telegram/ОС/Лекции/Лекция 2.pdf", keep)).toEqual({ text: "telegram/ОС/Лекции/Лекция 2.pdf", masked: false });
  });
});
