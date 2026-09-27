#!/usr/bin/env node
// Print the brochure's four Letter pages (/brochure/print) to a PDF the public
// page links to. Run against the local dev web server (or --web <url>):
//   node scripts/brochure-pdf.mjs [--web http://localhost:5199]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WEB = arg('--web', 'http://localhost:5199');
const root = new URL('..', import.meta.url).pathname;
const out = path.join(root, 'apps/web/public/brochure/ShotLog-Brochure.pdf');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
await page.goto(`${WEB}/brochure/print`, { waitUntil: 'load' });
await page.locator('[data-print-page="back"]').waitFor({ timeout: 30000 });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
});
await page.waitForTimeout(800);
await page.emulateMedia({ media: 'print' });
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true });
const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${pages} pages)`);
await browser.close();
