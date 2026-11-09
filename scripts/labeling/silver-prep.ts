// Серебряный набор: 80 документов из gold_candidates.csv → входы для 8 разметчиков-Opus по ПОЛНОМУ тексту.
// Текст берём из Storage (уже замаскированный при загрузке), а не из data/raw — ПДн не уходят в LLM.
// Запуск: node --env-file=.env.local --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/silver-prep.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MAX = 30_000; // символов на документ: длинные учебники обрезаются (в отчёте — ограничение)
const PARTS = 8;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const ids = readFileSync("data/labeling/gold_candidates.csv", "utf8").replace(/^﻿/, "").trim().split("\n").slice(1).map((l) => l.split(",")[0]);
const { data: ds } = await sb.from("datasets").select("id").eq("name", "Материалы КИ (5 семестров)").single();
const { data: docs, error } = await sb.from("documents").select("id,filename,units,storage_path,meta").eq("dataset_id", ds!.id).in("meta->>source_sha256", ids);
if (error) throw error;
const bySrc = new Map(docs.map((d) => [d.meta.source_sha256 as string, d]));
const missing = ids.filter((i) => !bySrc.has(i));
if (missing.length) throw new Error(`нет в БД: ${missing.length}`);

const items = [];
let cut = 0;
for (const id of ids) {
  const d = bySrc.get(id)!;
  const f = await sb.storage.from("datasets").download(d.storage_path);
  if (f.error) throw f.error;
  const text = await f.data.text();
  if (text.length > MAX) cut++;
  items.push({ doc_id: id, filename: d.filename, source_path: d.meta.source_path, units: d.units, chars: text.length, text: text.slice(0, MAX) });
}
mkdirSync("data/labeling/silver/in", { recursive: true });
mkdirSync("data/labeling/silver/out", { recursive: true });
const size = Math.ceil(items.length / PARTS);
for (let p = 0; p < PARTS; p++) writeFileSync(`data/labeling/silver/in/silver-${p + 1}.json`, JSON.stringify(items.slice(p * size, (p + 1) * size), null, 1));
console.log(`документов ${items.length}, обрезано до ${MAX} символов: ${cut}, частей ${PARTS}`);
