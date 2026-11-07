# Офлайн-разметка основного датасета

Данные и результаты — только в `data/labeling/` (в .gitignore). Node 24 запускает .ts сам; хук `ts-resolve.mjs` добавляет `.ts` к импортам без расширения (ядро `src/lib/labeling/` не меняется).

```
node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/<скрипт>.ts [аргументы]
```

| скрипт | что делает |
|---|---|
| `prepare.ts` | 572 документа → `inputs/batch-NNN.json` (makeBatches: ≤20 документов, ≤20 тыс. токенов ≈ 60 тыс. символов), `teachers.json`, служебный `docs_index.json`. Превью 3000 символов после maskPii + доп. маскирования (ФИО с отчеством, КАПС, номера ≥ 9 цифр) |
| `sample.ts` | стратифицированные выборки: архитектор 30, критик 20 (не пересекаются) |
| `build-ruleset.ts 1` | `ruleset_v1.json` = fields из subjects.csv + `rules_v1.md` + `examples_v1.json` + `critique_v1.md`; проверка parseFields и примеров validateLabels |
| `validate.ts A [NNN]` | проверка выхода разметчика: формат батча (код 1 — переразметить) + validateLabels; без NNN — строка в `progress.md` |
| `finalize.ts A` | `labels_A.jsonl`, `summary_A.md`, `gold_candidates.csv` (80) |

Разметчику (A — субагент Claude Code, B — Codex) даётся `labeler-prompt.md` с подстановкой `{LABELER}`, `{NNN}`. Разметчик видит только `ruleset_v1.json` и свой батч; метки сборщика (frontmatter, папки `output/<семестр>/<предмет>/`) — нет.
