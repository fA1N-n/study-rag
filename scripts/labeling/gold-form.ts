// Форма ручной проверки: 20 документов из gold_candidates.csv (пропорционально причинам отбора),
// человек ставит те же 6 полей, что разметчики. Выход: data/labeling/gold_human/gold-check.html.
// Один самодостаточный файл: переносится на другой компьютер, открывается двойным кликом, без сети.
// Ответы автосохраняются в localStorage браузера; кнопка «Скачать результат» отдаёт gold_human_results.json.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT } from "./common";

const PICK: Record<string, number> = { "покрытие subject": 8, "низкая уверенность": 5, "добор по уверенности": 5, "покрытие doc_type": 2 };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const [head, ...rows] = parseCsv(readFileSync(join(OUT, "gold_candidates.csv"), "utf8").replace(/^﻿/, ""));
const col = (n: string) => head.indexOf(n);
const byReason = new Map<string, string[][]>();
for (const r of rows) if (r[0]) byReason.set(r[col("reason")], [...(byReason.get(r[col("reason")]) ?? []), r]);

const picked: string[][] = [];
for (const [reason, n] of Object.entries(PICK)) {
  const group = byReason.get(reason) ?? [];
  const step = group.length / n;
  for (let k = 0; k < n && k < group.length; k++) picked.push(group[Math.floor(k * step)]);
}

const docs = new Map<string, { filename: string; source_path: string; units: number; preview: string }>();
for (const f of readdirSync(join(OUT, "inputs")))
  for (const d of JSON.parse(readFileSync(join(OUT, "inputs", f), "utf8")).docs) docs.set(d.doc_id, d);

const items = picked.map((r) => {
  const d = docs.get(r[col("doc_id")]);
  if (!d) throw new Error(`нет входа для ${r[col("doc_id")]}`);
  return { doc_id: r[col("doc_id")], reason: r[col("reason")], ...d };
});
const ruleset = JSON.parse(readFileSync(join(OUT, "ruleset_v1.json"), "utf8"));
const data = { fields: ruleset.fields, rules: ruleset.rules, items };

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Проверка разметки</title>
<style>
:root{--bg:#f7f7f8;--panel:#fff;--ink:#18181b;--mute:#71717a;--line:#e4e4e7;--acc:#4f46e5;--ok:#16a34a}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0d;--panel:#131316;--ink:#ececf1;--mute:#8b8b95;--line:#27272c;--acc:#818cf8;--ok:#4ade80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;display:flex;gap:12px;align-items:center;padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line)}
header b{font-size:15px}.bar{flex:1;height:6px;background:var(--line);border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ok)}
main{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;padding:16px;max-width:1300px;margin:auto}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
.meta{color:var(--mute);font-size:12px;word-break:break-all;margin-bottom:10px}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.55 ui-monospace,Consolas,monospace;margin:0;max-height:70vh;overflow:auto}
label{display:block;font-size:12px;color:var(--mute);margin:12px 0 4px}
select,input,textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}
.hint{font-size:12px;color:var(--acc);margin-top:4px}
.row{display:flex;gap:8px;margin-top:16px}button{flex:1;padding:10px;border:0;border-radius:8px;font:600 14px system-ui;cursor:pointer;background:var(--line);color:var(--ink)}
button.p{background:var(--acc);color:#fff}details{margin:0 16px}summary{cursor:pointer;color:var(--acc);padding:8px 0}
.dots{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px}.dots span{width:22px;height:22px;border-radius:5px;background:var(--line);font-size:11px;display:grid;place-items:center;cursor:pointer}
.dots span.d{background:var(--ok);color:#fff}.dots span.c{outline:2px solid var(--acc)}
@media (max-width:800px){main{grid-template-columns:1fr}pre{max-height:45vh}}
</style></head><body>
<header><b>Проверка разметки</b><span id="cnt"></span><div class="bar"><i id="bar"></i></div></header>
<details><summary>Правила разметки v1 (открыть при сомнении)</summary><div class="card"><pre id="rules"></pre></div></details>
<main><section class="card"><div class="meta" id="meta"></div><pre id="text"></pre></section>
<section class="card"><div id="form"></div><label>Комментарий (необязательно)</label><input id="comment">
<div class="row"><button id="prev">← Назад</button><button class="p" id="next">Сохранить и дальше →</button></div>
<div class="dots" id="dots"></div><div class="row"><button class="p" id="dl">Скачать результат</button><button id="copy">Скопировать JSON</button></div></section></main>
<script>
const DATA=${JSON.stringify(data).replace(/</g, "\\u003c")};
const KEY="gold-human-v1";let S={};try{S=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
let i=Math.max(0,DATA.items.findIndex(x=>!S[x.doc_id]));if(i<0)i=0;
document.getElementById("rules").textContent=DATA.rules;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch{}};
function field(f,v){
  if(f.type==="enum")return '<select data-k="'+f.key+'"><option value="">— выберите —</option>'+f.values.map(x=>'<option'+(x===v?' selected':'')+'>'+x+'</option>').join("")+'</select>';
  if(f.type==="bool")return '<select data-k="'+f.key+'"><option value="">— выберите —</option><option value="true"'+(v===true?' selected':'')+'>да</option><option value="false"'+(v===false?' selected':'')+'>нет</option></select>';
  if(f.type==="int")return '<select data-k="'+f.key+'"><option value="">не понять / пусто</option>'+Array.from({length:(f.max||8)-(f.min||1)+1},(_,k)=>k+(f.min||1)).map(n=>'<option'+(n===v?' selected':'')+'>'+n+'</option>').join("")+'</select><div class="hint" id="semhint"></div>';
  return '<input data-k="'+f.key+'" value="'+(v??"").replace(/"/g,"&quot;")+'">';
}
function hint(){const s=document.querySelector('[data-k=subject]'),h=document.getElementById("semhint");const f=DATA.fields.find(x=>x.allowedBy);
  if(!s||!h||!f)return;const a=f.allowedBy.map[s.value];h.textContent=a?"для этого предмета: "+a.join(", "):"";}
function show(){
  const it=DATA.items[i],v=(S[it.doc_id]||{}).values||{};
  document.getElementById("meta").textContent=(i+1)+"/"+DATA.items.length+" · "+it.filename+" · "+it.source_path+" · единиц: "+it.units+" · отбор: "+it.reason;
  document.getElementById("text").textContent=it.preview;
  document.getElementById("form").innerHTML=DATA.fields.map(f=>'<label>'+f.label+(f.required?' *':'')+'</label>'+field(f,v[f.key])).join("");
  document.getElementById("comment").value=(S[it.doc_id]||{}).comment||"";
  document.querySelector('[data-k=subject]')?.addEventListener("change",hint);hint();
  const done=Object.keys(S).length;document.getElementById("cnt").textContent="готово "+done+" из "+DATA.items.length;
  document.getElementById("bar").style.width=(100*done/DATA.items.length)+"%";
  document.getElementById("dots").innerHTML=DATA.items.map((x,k)=>'<span class="'+(S[x.doc_id]?"d ":"")+(k===i?"c":"")+'" data-i="'+k+'">'+(k+1)+'</span>').join("");
  window.scrollTo(0,0);
}
function collect(){
  const it=DATA.items[i],values={};let missing=[];
  for(const f of DATA.fields){const el=document.querySelector('[data-k="'+f.key+'"]');const raw=el.value.trim();
    if(raw===""){if(f.required)missing.push(f.label);continue}
    values[f.key]=f.type==="int"?Number(raw):f.type==="bool"?raw==="true":raw;}
  if(missing.length){alert("Заполните: "+missing.join(", "));return false}
  S[it.doc_id]={values,comment:document.getElementById("comment").value.trim(),at:new Date().toISOString()};save();return true;
}
document.getElementById("next").onclick=()=>{if(collect()){if(i<DATA.items.length-1)i++;show();if(Object.keys(S).length===DATA.items.length)alert("Все 20 готовы. Нажмите «Скачать результат» и перенесите файл gold_human_results.json на основной компьютер.")}};
document.getElementById("prev").onclick=()=>{if(i>0)i--;show()};
document.getElementById("dots").onclick=e=>{const k=e.target.dataset.i;if(k!==undefined){i=Number(k);show()}};
document.getElementById("dl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:"application/json"}));a.download="gold_human_results.json";a.click();};
document.getElementById("copy").onclick=()=>navigator.clipboard.writeText(JSON.stringify(S,null,1)).then(()=>alert("Скопировано"));
show();
</script></body></html>`;

mkdirSync(join(OUT, "gold_human"), { recursive: true });
writeFileSync(join(OUT, "gold_human", "gold-check.html"), html);
console.log(`gold_human/gold-check.html: ${items.length} документов`, Object.fromEntries(Object.keys(PICK).map((r) => [r, items.filter((x) => x.reason === r).length])));
