// Схемы для отчёта и презентации: diagrams.html → docs/screenshots/report/{arch,pipe}.png
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
mkdirSync("docs/screenshots/report", { recursive: true });
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL("scripts/report/diagrams.html").href);
for (const id of ["arch", "pipe"]) await p.locator("#" + id).screenshot({ path: `docs/screenshots/report/${id}.png` });
await b.close();
