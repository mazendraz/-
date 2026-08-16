import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.INSPECT_BASE_URL ?? 'http://localhost:5174';
// مخرجات محلية — متجاهَلة في .gitignore (scratchpad/). للتغيير: INSPECT_OUT_DIR=... node inspect.mjs
const outDir = process.env.INSPECT_OUT_DIR ?? path.join(import.meta.dirname, 'scratchpad');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function run(name, deviceName, url, opts = {}) {
  const ctx = await browser.newContext({
    ...(deviceName ? devices[deviceName] : {}),
    locale: opts.locale ?? 'ar-EG',
  });
  const page = await ctx.newPage();
  const errors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleMsgs.push('CONSOLE ERROR: ' + msg.text());
  });
  page.on('requestfailed', (req) => consoleMsgs.push('REQ FAILED: ' + req.url() + ' ' + (req.failure()?.errorText ?? '')));
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    consoleMsgs.push('NAV ERROR: ' + e.message);
  }
  await page.waitForTimeout(1500);
  const shotPath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  const htmlDir = await page.evaluate(() => document.documentElement.dir);
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  console.log(`=== ${name} (${url}) ===`);
  console.log('dir:', htmlDir, 'lang:', htmlLang);
  console.log('Errors:', errors.length ? errors.join('\n') : 'none');
  console.log('Console/Req issues:', consoleMsgs.length ? consoleMsgs.join('\n') : 'none');
  console.log('Body text (first 2000 chars):\n', bodyText);
  console.log('Screenshot:', shotPath);
  console.log('');
  await ctx.close();
}

await run('home-ar-desktop', null, `${BASE}/`);
await run('home-ar-mobile', 'iPhone 13', `${BASE}/`);
await run('request-form-ar-mobile', 'iPhone 13', `${BASE}/request`);
await run('request-form-ar-desktop', null, `${BASE}/request`);

await browser.close();
