// Скриншоты прода для отчёта: node scripts/report/shots.mjs [только_имена,через,запятую]
// Edge из системы (channel msedge), вход кнопкой «Войти как проверяющий».
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_URL ?? "https://study-rag-livid.vercel.app";
const OUT = "docs/screenshots/v2/";
const only = process.argv[2]?.split(",");
const want = (n) => !only || only.includes(n);

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "ru-RU" });
const page = await ctx.newPage();
page.setDefaultTimeout(60_000);

async function shot(name, path, opts = {}) {
  if (!want(name)) return;
  if (path) await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(opts.wait ?? 1500);
  await page.screenshot({ path: OUT + name + ".jpg", type: "jpeg", quality: 85, fullPage: opts.full ?? false });
  console.log("ok", name, page.url());
}

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await shot("login");
await page.getByRole("button", { name: "Войти как проверяющий" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));
await page.waitForLoadState("networkidle");
await shot("datasets");

await page.waitForSelector('a[href^="/d/"]');
// основной датасет — не «Тест: 8 документов КИ»
const links = await page.$$eval('a[href^="/d/"]', (as) => as.map((a) => [a.getAttribute("href").split("/")[2], a.textContent.trim()]));
const main = process.env.MAIN_ID ?? links.find(([, t]) => t && t !== "Открыть" && !/Тест/.test(t))?.[0];
console.log("main", main);

await shot("overview", `/d/${main}`);
await shot("docs", `/d/${main}/docs`);
if (want("document")) {
  await page.goto(`${BASE}/d/${main}/docs`, { waitUntil: "networkidle" });
  const href = await page.$eval(`a[href^="/d/${main}/docs/"]`, (a) => a.getAttribute("href"));
  await shot("document", href);
}
await shot("rules", `/d/${main}/rules`);
await shot("labeling", `/d/${main}/labeling`);
await shot("review", `/d/${main}/review`);
await shot("upload", `/d/${main}/upload`);
await shot("history", "/history");

if (want("chat")) {
  await page.goto(`${BASE}/d/${main}/chat`, { waitUntil: "networkidle" });
  await page.fill("#q", process.env.SHOT_Q ?? "Что такое третья нормальная форма?");
  await page.getByRole("button", { name: "Спросить" }).click();
  // ответ бесплатной моделью идёт 30–100 с; ждём, пока кнопка «…» снова станет «Спросить»
  await page.getByRole("button", { name: "…" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Спросить" }).waitFor({ timeout: 280_000 });
  await shot("chat", null, { wait: 2000 });
  const cite = page.getByText("[2]", { exact: true }).last();
  if (await cite.count()) { await cite.click(); await shot("chat-source", null, { wait: 3000 }); }
}

if (want("mobile")) {
  const m = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "dark", storageState: await ctx.storageState() });
  const p2 = await m.newPage();
  await p2.goto(`${BASE}/d/${main}/chat`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: OUT + "chat-mobile-dark.jpg", type: "jpeg", quality: 85 });
  await p2.goto(`${BASE}/d/${main}`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: OUT + "overview-mobile-dark.jpg", type: "jpeg", quality: 85 });
  console.log("ok mobile");
}
await browser.close();
