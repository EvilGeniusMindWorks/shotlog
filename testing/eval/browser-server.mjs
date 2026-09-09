// Persona-evaluation browser daemon (2026-09-08).
//
// One long-lived Chromium with one isolated context ("device") per named
// session. Persona agents drive it through the tiny CLI in b.mjs — open,
// snapshot (accessibility tree), click, fill, press, upload, screenshot —
// the way a person taps a screen, never through scripts or selectors they
// could not see. Every command is logged per session so tap counts and
// wrong turns can be measured rather than self-reported.
//
//   node testing/eval/browser-server.mjs            (port 4790)
//   EVAL_PORT=4791 node testing/eval/browser-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.EVAL_PORT ?? 4790);
const API = process.env.EVAL_API ?? 'http://localhost:4000';
const OUT = process.env.EVAL_OUT ?? path.resolve('testing/eval/out');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  // scale factor 1 so a screenshot pixel is a CSS pixel — `tap x y` reads straight off the picture
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  wide: { viewport: { width: 1280, height: 800 } },
};

const browser = await chromium.launch({ headless: process.env.EVAL_HEADED !== '1' });
/** @type {Map<string, {ctx: import('playwright').BrowserContext, page: import('playwright').Page, device: string, log: string, taps: number}>} */
const sessions = new Map();

function logLine(s, entry) {
  fs.appendFileSync(s.log, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
}

async function openSession(name, device = 'phone') {
  if (sessions.has(name)) return sessions.get(name);
  const d = DEVICES[device] ?? DEVICES.phone;
  const ctx = await browser.newContext({ ...d, locale: 'en-US', timezoneId: 'America/New_York', acceptDownloads: true });
  // The dev web app needs to know where the API is — configuration, not a shortcut
  await ctx.addInitScript(`localStorage.setItem('shotlog-server-url', '${API}');`);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const s = { ctx, page, device, log: path.join(OUT, `${name}.log.jsonl`), taps: 0, dialogs: [], downloads: [] };
  page.on('dialog', async (dlg) => { s.dialogs.push({ type: dlg.type(), message: dlg.message() }); await dlg.accept().catch(() => undefined); });
  page.on('download', async (dl) => {
    const file = path.join(OUT, `${name}-${Date.now()}-${dl.suggestedFilename()}`);
    await dl.saveAs(file).catch(() => undefined);
    s.downloads.push(file);
  });
  ctx.on('page', (p) => { p.on('download', async (dl) => { const file = path.join(OUT, `${name}-${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(file).catch(() => undefined); s.downloads.push(file); }); });
  sessions.set(name, s);
  logLine(s, { op: 'session', device });
  return s;
}

/** Resolve a target description to a locator. Personas describe what they
 *  see: a role + name, a label, placeholder, or visible text. */
function target(page, a) {
  const exact = a.exact === true;
  if (a.role) return page.getByRole(a.role, { name: a.name ? (exact ? a.name : new RegExp(escapeRe(a.name), 'i')) : undefined, exact: exact || undefined });
  if (a.label) return page.getByLabel(exact ? a.label : new RegExp(escapeRe(a.label), 'i'));
  if (a.placeholder) return page.getByPlaceholder(exact ? a.placeholder : new RegExp(escapeRe(a.placeholder), 'i'));
  if (a.text) return page.getByText(exact ? a.text : new RegExp(escapeRe(a.text), 'i'));
  if (a.selector) return page.locator(a.selector);
  throw new Error('say what to act on: role+name, label, placeholder, text');
}
// What a person typed vs what the screen renders: straight and curly quotes,
// hyphen / en / em dashes, and runs of whitespace are the same word to them
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  .replace(/['’]/g, "['’]")
  .replace(/[-–—]/g, '[-–—]')
  .replace(/["“”]/g, '["“”]')
  .replace(/\s+/g, '\\s+');

async function pickOne(loc, a) {
  const n = await loc.count();
  if (n === 0) throw new Error(`nothing on the screen matches ${describe(a)}`);
  if (a.nth != null) return loc.nth(a.nth);
  if (n > 1) {
    // prefer the first VISIBLE match; report ambiguity so the agent knows
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) return loc.nth(i);
    return loc.first();
  }
  return loc.first();
}
const describe = (a) => Object.entries(a).filter(([k]) => ['role', 'name', 'label', 'placeholder', 'text', 'selector', 'nth'].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');

async function snapshot(page, opts = {}) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(opts.settle ?? 400);
  const tree = await page.locator('body').ariaSnapshot().catch(() => '(no accessibility tree — is the page open?)');
  const max = opts.max ?? 14000;
  const body = tree.length > max ? tree.slice(0, max) + `\n… (${tree.length - max} more characters — scroll or ask for a part: snapshot {"max": 30000})` : tree;
  return `url: ${page.url()}\ntitle: ${await page.title().catch(() => '')}\n---\n${body}`;
}

async function run(s, a) {
  const { page } = s;
  const op = a.op;
  switch (op) {
    case 'open': {
      await page.goto(a.url, { waitUntil: 'domcontentloaded' });
      return snapshot(page, { settle: 900 });
    }
    case 'snapshot': return snapshot(page, a);
    case 'click': {
      const loc = await pickOne(target(page, a), a);
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      await loc.click({ timeout: a.timeout ?? 6000, force: a.force === true });
      s.taps++;
      return snapshot(page, { settle: a.settle ?? 700 });
    }
    case 'fill': {
      const loc = await pickOne(target(page, a), a);
      await loc.fill(String(a.value ?? ''));
      s.taps++;
      return `filled ${describe(a)} with ${JSON.stringify(String(a.value ?? ''))}`;
    }
    case 'type': {
      await page.keyboard.type(String(a.text ?? ''), { delay: 20 });
      s.taps++;
      return `typed ${JSON.stringify(a.text)}`;
    }
    case 'press': {
      await page.keyboard.press(a.key);
      s.taps++;
      return snapshot(page, { settle: 500 });
    }
    case 'select': {
      const loc = await pickOne(target(page, a), a);
      const r = await loc.selectOption(a.value != null ? { value: String(a.value) } : { label: String(a.option) }).catch(async () => loc.selectOption({ label: String(a.value ?? a.option) }));
      s.taps++;
      return `selected ${JSON.stringify(r)}`;
    }
    case 'check': {
      const loc = await pickOne(target(page, a), a);
      await loc.setChecked(a.value !== false);
      s.taps++;
      return `set ${describe(a)} ${a.value !== false ? 'checked' : 'unchecked'}`;
    }
    case 'upload': {
      const files = (Array.isArray(a.files) ? a.files : [a.files]).map((f) => path.resolve(f));
      for (const f of files) if (!fs.existsSync(f)) throw new Error(`no such file ${f}`);
      let loc;
      if (a.role || a.label || a.text || a.selector || a.placeholder) loc = await pickOne(target(page, a), a);
      else {
        // the camera/file input behind the button the persona sees
        const inputs = page.locator('input[type="file"]');
        const n = await inputs.count();
        if (!n) throw new Error('no file input on this screen — open the place that takes a photo or a file first');
        loc = inputs.nth(a.nth ?? n - 1);
        if (a.accept) {
          for (let i = 0; i < n; i++) if (((await inputs.nth(i).getAttribute('accept')) ?? '').includes(a.accept)) { loc = inputs.nth(i); break; }
        }
      }
      await loc.setInputFiles(files);
      s.taps++;
      return snapshot(page, { settle: 1500 });
    }
    case 'scroll': {
      await page.mouse.wheel(0, Number(a.dy ?? 600));
      s.taps++;
      return snapshot(page, { settle: 400 });
    }
    case 'wait': {
      if (a.text) await page.getByText(new RegExp(escapeRe(a.text), 'i')).first().waitFor({ timeout: a.timeout ?? 15000 });
      else if (a.url) await page.waitForURL(new RegExp(escapeRe(a.url)), { timeout: a.timeout ?? 15000 });
      else await page.waitForTimeout(Number(a.ms ?? 1000));
      return snapshot(page, { settle: 200 });
    }
    case 'tap': {
      // a finger on a spot of the screen — for drawings and grids that have
      // no words (coordinates come from a screenshot, in CSS pixels)
      const x = Number(a.x), y = Number(a.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('tap needs x and y');
      await page.mouse.click(x, y);
      s.taps++;
      return snapshot(page, { settle: a.settle ?? 600 });
    }
    case 'sign': {
      // draw a signature on the visible pad, the way a finger would
      const canvases = page.locator('canvas');
      const n = await canvases.count();
      let box = null;
      for (let i = 0; i < n; i++) { const b = await canvases.nth(i).boundingBox().catch(() => null); if (b && b.width > 80 && b.height > 40) { box = b; break; } }
      if (!box) throw new Error('no signature pad is open on this screen');
      const x0 = box.x + box.width * 0.15, y0 = box.y + box.height * 0.55;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      const w = box.width * 0.7;
      for (let i = 1; i <= 36; i++) await page.mouse.move(x0 + (w * i) / 36, y0 + Math.sin(i / 2.5) * box.height * 0.18 - (i / 36) * box.height * 0.1, { steps: 2 });
      await page.mouse.up();
      s.taps++;
      return snapshot(page, { settle: 400 });
    }
    case 'back': { await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined); s.taps++; return snapshot(page, { settle: 600 }); }
    case 'screenshot': {
      const file = a.path ? path.resolve(a.path) : path.join(OUT, `${a.session}-${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: a.full === true });
      return `screenshot saved: ${file}`;
    }
    case 'dialogs': return JSON.stringify(s.dialogs.splice(0), null, 1);
    case 'downloads': return JSON.stringify(s.downloads, null, 1);
    case 'taps': return String(s.taps);
    case 'close': {
      await s.ctx.close().catch(() => undefined);
      sessions.delete(a.session);
      return 'closed';
    }
    default: throw new Error(`unknown op ${op}`);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ ok: true, sessions: [...sessions.keys()] })); return; }
  let body = '';
  for await (const chunk of req) body += chunk;
  let a;
  try { a = JSON.parse(body || '{}'); } catch { res.statusCode = 400; res.end('bad json'); return; }
  const name = a.session;
  if (!name) { res.statusCode = 400; res.end('session required'); return; }
  const s = await openSession(name, a.device);
  const started = Date.now();
  try {
    const out = await run(s, a);
    logLine(s, { op: a.op, args: { ...a, session: undefined, op: undefined }, ms: Date.now() - started, ok: true });
    res.end(typeof out === 'string' ? out : JSON.stringify(out));
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 400);
    logLine(s, { op: a.op, args: { ...a, session: undefined, op: undefined }, ms: Date.now() - started, ok: false, error: msg });
    res.statusCode = 422;
    // Nothing happened; give the agent the current screen so it can re-plan
    const snap = await snapshot(s.page, { settle: 100 }).catch(() => '');
    res.end(`ERROR: ${msg}\n\n${snap}`);
  }
});
server.listen(PORT, () => console.log(`eval browser daemon on :${PORT} (out ${OUT}, api ${API})`));
process.on('SIGINT', async () => { await browser.close(); process.exit(0); });
