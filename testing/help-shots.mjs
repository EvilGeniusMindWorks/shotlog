#!/usr/bin/env node
// Screenshots for the help guide (S8 item 2). Real screens, captured from
// the dev app at phone width with the dev data, into apps/web/public/help-img.
// Re-run whenever a screen changes so the pictures never drift from the app:
//   node testing/help-shots.mjs            (all)
//   node testing/help-shots.mjs jobs pin   (just these)
import { chromium } from 'playwright';
import fs from 'node:fs';
import * as lib from './two-device/lib.mjs';

const { WEB, mkCtx, signIn, skipTours, sleep } = lib;
const OUT = new URL('../apps/web/public/help-img/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
const VIEW = { width: 390, height: 844 };
const browser = await chromium.launch();

async function shot(P, name, { selector, full = false } = {}) {
  if (!want(name)) return;
  await sleep(600);
  const file = `${OUT}${name}.png`;
  if (selector) {
    const el = P.locator(selector).first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded().catch(() => undefined);
      await el.screenshot({ path: file });
      console.log('✓', name, '(element)');
      return;
    }
  }
  await P.screenshot({ path: file, fullPage: full });
  console.log('✓', name);
}

// ── signed out: sign-in and PIN ────────────────────────────────────────
{
  const ctx = await mkCtx(browser, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const P = await ctx.newPage();
  await P.goto(WEB);
  await P.locator('input[type="email"]').waitFor({ timeout: 15000 });
  await shot(P, 'sign-in');
  await ctx.close();
  // The PIN screen shows when the app locks after inactivity. mkCtx's init
  // script re-stamps last-active on every load, so this context is bare:
  // server url + a device PIN, then a lock forced by an old last-active.
  const c2 = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5 });
  await c2.addInitScript(`localStorage.setItem('shotlog-server-url', 'http://localhost:4000'); localStorage.setItem('shotlog-tour-done', '1'); localStorage.setItem('shotlog-first-week-hidden', '1'); if (!localStorage.getItem('shotlog-pin-seeded')) { localStorage.setItem('shotlog-pin', 'x'); localStorage.setItem('shotlog-pin-seeded', '1'); localStorage.setItem('shotlog-last-active', String(Date.now())); }`);
  const P2 = await c2.newPage();
  await signIn(P2, 'blaster', { sync: false });
  // the app re-stamps activity as the page unloads — stamp "long ago" on the
  // way back in instead, before the app's own scripts run
  await c2.addInitScript(() => localStorage.setItem('shotlog-last-active', '0'));
  await P2.reload();
  await P2.getByText(/PIN/).first().waitFor({ timeout: 20000 }).catch(() => undefined);
  await shot(P2, 'pin');
  await c2.close();
}

// ── signed in as the blaster ───────────────────────────────────────────
const ctx = await mkCtx(browser, { viewport: VIEW, deviceScaleFactor: 1.5 });
const P = await ctx.newPage();
await signIn(P, 'blaster');
await skipTours(P);
const ids = await P.evaluate(async () => {
  const { db } = await import('/src/db/index.ts');
  const days = (await db.blastDays.toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const d of days) {
    const log = await db.blastLogs.where('blastDayId').equals(d.id).first();
    const shot = log ? await db.shots.where('blastLogId').equals(log.id).first() : null;
    if (shot && d.status === 'draft') return { day: d.id, shot: shot.id };
  }
  const d = days[0];
  return { day: d?.id, shot: null };
});
console.log('using day', ids.day, 'shot', ids.shot);

await P.goto(`${WEB}/`);
await P.locator('main').waitFor({ timeout: 15000 });
await shot(P, 'dashboard');
await shot(P, 'sync-chip', { selector: 'header' });
const helpBtn = P.locator('[data-help-button]').locator('visible=true').first();
if (await helpBtn.count()) {
  await helpBtn.click();
  await P.locator('[data-help-menu]').waitFor({ timeout: 3000 }).catch(() => undefined);
  await shot(P, 'help-menu');
  await P.keyboard.press('Escape');
}
if (await P.locator('[data-tour="fab"]').count()) {
  await P.locator('[data-tour="fab"]').click();
  await P.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 }).catch(() => undefined);
  await shot(P, 'start-work');
  await P.keyboard.press('Escape');
}
if (ids.day) {
  await P.goto(`${WEB}/blast-day/${ids.day}`);
  await P.locator('main').waitFor({ timeout: 15000 });
  await shot(P, 'work-day');
  if (ids.shot) {
    await P.goto(`${WEB}/blast-day/${ids.day}/design/${ids.shot}?mode=plan`);
    await P.locator('main, [data-diagram-mode]').first().waitFor({ timeout: 15000 });
    await shot(P, 'drill-plan');
    await P.goto(`${WEB}/blast-day/${ids.day}/seismo/${ids.shot}`);
    await P.locator('main').waitFor({ timeout: 15000 });
    await shot(P, 'seismo');
  }
  await P.goto(`${WEB}/blast-day/${ids.day}?view=blast-log`);
  await P.locator('main').waitFor({ timeout: 15000 });
  await shot(P, 'blast-log');
  await P.goto(`${WEB}/blast-day/${ids.day}?view=daily-report`);
  await P.locator('main').waitFor({ timeout: 15000 });
  await shot(P, 'daily-report');
  await P.goto(`${WEB}/blast-day/${ids.day}/submit`);
  await sleep(1500);
  await shot(P, 'file-day');
}
await P.goto(`${WEB}/jobs`);
await P.locator('[data-customers-list]').waitFor({ timeout: 15000 }).catch(() => undefined);
await shot(P, 'jobs');
await P.goto(`${WEB}/records`);
await P.locator('main').waitFor({ timeout: 15000 });
await sleep(1500);
await shot(P, 'records');
await P.goto(`${WEB}/profile`);
await P.locator('main').waitFor({ timeout: 15000 });
await shot(P, 'profile');
await P.goto(`${WEB}/settings`);
await P.locator('[data-settings-page]').waitFor({ timeout: 15000 });
await shot(P, 'install-card', { selector: '[data-install-card]' });
await ctx.close();
await browser.close();
console.log('done →', OUT);

// ── batch two: driller, shop, supervisor ────────────────────────────────
{
  const b2 = await chromium.launch();
  const cd = await mkCtx(b2, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const D = await cd.newPage();
  await signIn(D, 'dinis');
  await skipTours(D);
  // A real pattern for the drill-log shot: the blaster lays a 3 × 4 plan and
  // sends it to Dinis; Dinis logs the first row, then it is cleaned up
  const cb = await mkCtx(b2, { viewport: VIEW });
  const B = await cb.newPage();
  await signIn(B, 'blaster');
  await skipTours(B);
  const made = await B.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
    const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
    const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
    const { nowISO } = await import('/src/lib/utils.ts');
    const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: 'Help guide screenshot day' });
    const log = await db.blastLogs.where('blastDayId').equals(id).first();
    const shot = await db.shots.where('blastLogId').equals(log.id).first();
    const d = { ...emptyDiagram(3, 4), plan: { defaultDepth: 20, overrides: { 5: { depth: 0 } } } };
    await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
    const fresh = await db.shots.get(shot.id);
    const crew = await db.crewMembers.filter((c) => c.isActive && c.userId).toArray();
    const dinis = crew.find((c) => /dinis/i.test(c.name)) ?? crew[0];
    const logId = await createDrillLog(fresh, id, jobs[0].id, { userId: dinis.userId, name: dinis.name });
    return { day: id, logId };
  });
  await lib.waitForUpload(B);
  await cb.close();
  await D.goto(`${WEB}/blast-day/${made.day}/drill-log/${made.logId}`);
  await D.locator('[data-pattern-grid="log"]').waitFor({ timeout: 20000 });
  await D.locator('[data-pattern-row="0"]').click();
  await sleep(200);
  await D.getByRole('button', { name: /Log 4 as planned/ }).click();
  await sleep(1200);
  await D.evaluate(() => window.scrollTo(0, 0));
  await shot(D, 'drill-log');
  await D.goto(`${WEB}/`);
  await D.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(D, 'driller-home');
  await D.goto(`${WEB}/drilling`);
  await D.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(D, 'drilling');
  await lib.cleanupAsAdmin(b2, { days: [made.day], drillLogs: [made.logId] }).catch((e) => console.log('cleanup', e.message));
  const rig = await D.evaluate(async () => { const { db } = await import('/src/db/index.ts'); const r = (await db.equipment.toArray()).find((e) => e.category === 'rock_drill' && e.isActive); return r?.id ?? null; });
  if (rig) {
    await D.goto(`${WEB}/drill-checklist/${rig}`);
    await D.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    await shot(D, 'checklist');
  }
  await cd.close();

  const cm = await mkCtx(b2, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const M = await cm.newPage();
  await signIn(M, 'mechanic');
  await skipTours(M);
  await M.goto(`${WEB}/`);
  await M.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(M, 'shop');
  await M.goto(`${WEB}/admin/equipment`);
  await M.locator('[data-equip-tabs]').waitFor({ timeout: 15000 });
  await shot(M, 'fleet');
  if (rig) {
    await M.goto(`${WEB}/equipment/${rig}`);
    await M.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    await shot(M, 'machine');
  }
  await M.goto(`${WEB}/equipment-locator`);
  await M.locator('main').waitFor({ timeout: 15000 });
  await sleep(1500);
  await shot(M, 'locator');
  await cm.close();

  const cs = await mkCtx(b2, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const S = await cs.newPage();
  await signIn(S, 'supervisor');
  await skipTours(S);
  await S.goto(`${WEB}/admin/approvals`);
  await S.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(S, 'approvals');
  await cs.close();
  await b2.close();
  console.log('batch two shots done');
}

// ── batch three: office, admin ──────────────────────────────────────────
{
  const b3 = await chromium.launch();
  const co = await mkCtx(b3, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const O = await co.newPage();
  await signIn(O, 'office');
  await skipTours(O);
  await O.goto(`${WEB}/`);
  await O.locator('main').waitFor({ timeout: 15000 });
  await sleep(1200);
  await shot(O, 'office-home');
  await O.goto(`${WEB}/records`);
  await O.locator('[data-records-manager]').waitFor({ timeout: 15000 }).catch(() => undefined);
  await sleep(1500);
  await shot(O, 'records-office');
  await O.goto(`${WEB}/admin/people`);
  await O.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(O, 'people');
  await co.close();
  const ca = await mkCtx(b3, { viewport: VIEW, deviceScaleFactor: 1.5 });
  const A = await ca.newPage();
  await signIn(A, 'mark');
  await skipTours(A);
  await A.goto(`${WEB}/admin/catalog`);
  await A.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(A, 'catalog');
  await A.goto(`${WEB}/admin/roles`);
  await A.locator('main').waitFor({ timeout: 15000 });
  await sleep(800);
  await shot(A, 'roles');
  await ca.close();
  await b3.close();
  console.log('batch three shots done');
}
