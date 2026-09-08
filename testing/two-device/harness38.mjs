async (page) => {
  // Round S3 — Feedback & diagnostics (2026-09-06): ? menu → composer with
  // screenshot lands on the server with build/route/role stamps; offline
  // sends queue with a truthful toast and drain exactly once on reconnect;
  // async errors → error log + one toast with Report; a render crash hits
  // the root boundary (never a white screen) and its report lands as
  // `crash`; the PLATFORM admin (dev: mark = ADMIN_EMAIL) sees Admin ›
  // Feedback and triages; a company admin who is not the platform admin
  // has no tab and gets 403; Settings has the Help card; email hook records
  // `email-off` while Resend is unconfigured.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);

  const mkCtx = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, ...opts });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-pin', 'x');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(1500);
    // A brand-new account sees the one-time welcome — step past it
    const go = P.getByRole('button', { name: /Let.s go/ });
    if (await go.count()) {
      await go.click();
      await P.waitForTimeout(1500);
    }
  };
  // The MCP vm has no global fetch — Playwright's request context does the job
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const listMine = async (tok) => ((await api('/feedback', {}, tok)).body?.feedback ?? []).filter((f) => f.message.includes(stamp));
  let adminTok;
  let newAdminId;
  try {
    // ── 0. server truth ─────────────────────────────────────────────────
    const health = await api('/health');
    ok('/health ok (email off in dev)', health.body?.ok === true && health.body.email === false);
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    ok('bootstrap admin is the platform admin (ADMIN_EMAIL fallback)', login.body.user.platformAdmin === true);
    const bl = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'blaster@test.local', password: 'blaster-pass-123' }) });
    ok('blaster is not a platform admin', bl.body.user.platformAdmin === false);
    const denied = await api('/feedback', {}, bl.body.accessToken);
    ok('GET /feedback refuses a field role (403)', denied.status === 403);

    // ── 1. online send from the ? menu, with screenshot ─────────────────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    await P1.waitForTimeout(3000);
    await P1.locator('header [data-help-button]').click();
    const menu = await P1.locator('[data-help-menu]').innerText();
    ok('? menu offers Walkthrough + Send feedback', /Walkthrough/.test(menu) && /Send feedback/.test(menu));
    await P1.locator('[data-help-feedback]').click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 20000 });
    const shotBox = P1.locator('[data-feedback-screenshot]');
    ok('screenshot captured and included by default (Q3)', (await shotBox.count()) === 1 && (await shotBox.isChecked()));
    await P1.locator('[data-feedback-kind="idea"]').click();
    await P1.locator('[data-feedback-message]').fill(`S3 harness online ${stamp}`);
    await P1.locator('[data-feedback-send]').click();
    await P1.getByText(/Sent — thanks/).waitFor({ timeout: 15000 });
    ok('online send → truthful "Sent" toast', true);
    await P1.waitForTimeout(500);
    let rows = await listMine(adminTok);
    const online1 = rows.find((r) => r.message === `S3 harness online ${stamp}`);
    ok('row landed with role/kind/route/build stamps', Boolean(online1) && online1.role === 'blaster' && online1.kind === 'idea' && online1.route === '/' && online1.buildId.length > 3 && online1.online === true);
    ok('row says email-off (Resend unconfigured — truthful)', online1?.notified === 'email-off');
    ok('row carries a screenshot', online1?.hasScreenshot === true);
    const det = await api(`/feedback/${online1.id}`, {}, adminTok);
    ok('detail returns a JPEG data URL + diagnostics arrays', typeof det.body?.feedback?.screenshot === 'string' && det.body.feedback.screenshot.startsWith('data:image/jpeg') && Array.isArray(det.body.feedback.syncLogTail));

    // ── 2. offline: two reports queue, truthful toast, drain exactly once ─
    await c1.setOffline(true);
    // Client-side navigation only — a goto() would need the network
    await P1.locator('[data-tour="nav"] a[href="/settings"]').click();
    await P1.locator('[data-help-card]').waitFor({ timeout: 10000 });
    ok('Settings has the Help & feedback card', true);
    await P1.locator('[data-settings-feedback]').click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 20000 });
    const sendLabel = await P1.locator('[data-feedback-send]').innerText();
    ok('offline composer says "Save — send when online"', /send when online/i.test(sendLabel));
    await P1.locator('[data-feedback-message]').fill(`S3 harness offline A ${stamp}`);
    await P1.locator('[data-feedback-send]').click();
    await P1.getByText(/Saved — it sends itself/).waitFor({ timeout: 15000 });
    ok('offline send → truthful "Saved" toast', true);
    await P1.locator('[data-settings-feedback]').click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 20000 });
    await P1.locator('[data-feedback-message]').fill(`S3 harness offline B ${stamp}`);
    await P1.locator('[data-feedback-send]').click();
    await P1.waitForTimeout(800);
    const queuedNote = await P1.locator('[data-feedback-queued]').innerText().catch(() => '');
    ok('Settings shows 2 reports waiting for signal', /2 reports waiting/.test(queuedNote));
    rows = await listMine(adminTok);
    ok('nothing reached the server while offline', rows.filter((r) => /offline [AB]/.test(r.message)).length === 0);
    await c1.setOffline(false);
    // Reconnect races: the online event, the timer and a foreground kick can
    // all fire together — the drain must post each report exactly once
    await P1.evaluate(async () => {
      const m = await import('/src/lib/feedback.ts');
      window.dispatchEvent(new Event('online'));
      await Promise.all([m.drainFeedbackOutbox(), m.drainFeedbackOutbox(), m.drainFeedbackOutbox()]);
    });
    await P1.waitForTimeout(1500);
    rows = await listMine(adminTok);
    const a = rows.filter((r) => r.message === `S3 harness offline A ${stamp}`);
    const b = rows.filter((r) => r.message === `S3 harness offline B ${stamp}`);
    ok('both queued reports landed exactly once (no dupes under concurrent drain)', a.length === 1 && b.length === 1);
    ok('queued rows are stamped online=false (filed offline)', a[0]?.online === false && b[0]?.online === false);
    ok('queue indicator cleared', (await P1.locator('[data-feedback-queued]').count()) === 0);

    // ── 3. async error → error log + one toast with Report ──────────────
    await P1.evaluate(() => {
      setTimeout(() => {
        throw new Error(`S3 harness async error`);
      }, 0);
    });
    await P1.getByText(/Something went wrong on this screen/).waitFor({ timeout: 8000 });
    const errLog = await P1.evaluate(() => localStorage.getItem('shotlog-error-log') ?? '');
    ok('uncaught error captured into the device error log', /S3 harness async error/.test(errLog));
    await P1.getByRole('button', { name: 'Report' }).click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 20000 });
    const prefill = await P1.locator('[data-feedback-message]').inputValue();
    ok('Report opens the composer prefilled with the error', /S3 harness async error/.test(prefill));
    await P1.getByRole('button', { name: 'Cancel' }).click();
    // Throttle: a second error within the minute logs but does not re-toast
    await P1.evaluate(() => {
      setTimeout(() => {
        throw new Error('S3 harness second error');
      }, 0);
    });
    await P1.waitForTimeout(600);
    const errLog2 = await P1.evaluate(() => localStorage.getItem('shotlog-error-log') ?? '');
    ok('second error is logged; toasts are throttled to one per minute', /second error/.test(errLog2) && (await P1.getByText(/Something went wrong/).count()) <= 1);

    // ── 4. render crash → boundary → crash report lands ─────────────────
    await P1.evaluate(() => window.shotlogCrash());
    await P1.locator('[data-error-boundary]').waitFor({ timeout: 8000 });
    const crashText = await P1.locator('[data-error-boundary]').innerText();
    ok('render crash shows "Something broke" (no white screen)', /Something broke/.test(crashText) && /Harness-triggered render crash/.test(crashText) && /Reload/.test(crashText));
    await P1.locator('[data-error-report]').click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 10000 });
    const crashPrefill = await P1.locator('[data-feedback-message]').inputValue();
    ok('crash report prefilled with route + error', /Crash on/.test(crashPrefill) && /Harness-triggered/.test(crashPrefill));
    await P1.locator('[data-feedback-message]').fill(`${crashPrefill} S3 harness crash ${stamp}`);
    await P1.locator('[data-feedback-send]').click();
    await P1.waitForTimeout(2500);
    rows = await listMine(adminTok);
    const crash = rows.find((r) => r.kind === 'crash');
    ok('crash report landed as kind=crash', Boolean(crash));
    const crashDet = await api(`/feedback/${crash?.id}`, {}, adminTok);
    ok('crash row carries the render error in its error log', JSON.stringify(crashDet.body?.feedback?.errorLog ?? []).includes('Harness-triggered render crash'));
    await P1.reload();
    await P1.waitForTimeout(2500);
    ok('Reload recovers the app', /Dashboard|Settings/.test(await P1.locator('body').innerText()) && (await P1.locator('[data-error-boundary]').count()) === 0);
    await c1.close();

    // ── 5. platform admin triage (desktop) ──────────────────────────────
    const c2 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P2 = await c2.newPage();
    await signIn(P2, 'mark@baystateblasting.com', 'dev-password-123');
    // the sidebar row opens the guide (2026-09-08) with Send feedback on the page
    await P2.locator('aside [data-help-button]').click();
    await P2.locator('[data-help-submenu]').waitFor({ timeout: 3000 });
    ok('sidebar Help & feedback expands an inline sub-menu with Send feedback', (await P2.locator('[data-help-feedback]').count()) === 1);
    await P2.keyboard.press('Escape');
    await P2.goto(`${WEB}/admin`);
    await P2.waitForTimeout(2000);
    ok('platform admin sees the Feedback tab', (await P2.locator('a[href="/admin/feedback"]').count()) === 1);
    await P2.locator('a[href="/admin/feedback"]').click();
    await P2.locator('[data-admin-feedback]').waitFor({ timeout: 10000 });
    await P2.getByText(`S3 harness online ${stamp}`).waitFor({ timeout: 10000 });
    ok('feedback list shows the harness reports', (await P2.locator('[data-feedback-row]').count()) >= 4);
    await P2.getByText(`S3 harness online ${stamp}`).click();
    await P2.locator('[data-feedback-detail]').waitFor({ timeout: 10000 });
    await P2.locator('[data-feedback-screenshot-img]').waitFor({ timeout: 10000 });
    ok('row detail shows the screenshot', true);
    await P2.locator('[data-feedback-reply]').fill(`Looked at it — ${stamp}`);
    await P2.locator('[data-feedback-reply]').blur();
    await P2.waitForTimeout(600);
    await P2.locator(`[data-feedback-row="${online1.id}"] [data-feedback-done]`).click();
    await P2.waitForTimeout(800);
    const after = await api(`/feedback/${online1.id}`, {}, adminTok);
    ok('Mark done + reply note persist server-side', after.body?.feedback?.status === 'done' && after.body.feedback.replyNote === `Looked at it — ${stamp}`);
    const openTab = await P2.locator('[data-admin-feedback]').innerText();
    ok('done row leaves the Open filter', !new RegExp(`S3 harness online ${stamp}`).test(openTab));
    await c2.close();

    // ── 6. a company admin who is NOT the platform admin ────────────────
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: `S3 Admin ${stamp}`, email: `s3-admin-${stamp}@test.local`, role: 'admin' }) }, adminTok);
    const token = inv.body.link.split('/enroll/')[1];
    const enrolled = await api(`/enroll/${token}`, { method: 'POST', body: JSON.stringify({ password: 'harness-pw-1' }) });
    newAdminId = enrolled.body?.user?.id;
    ok('second company admin is not a platform admin', enrolled.status === 201 && enrolled.body.user.role === 'admin' && enrolled.body.user.platformAdmin === false);
    const denied2 = await api('/feedback', {}, enrolled.body.accessToken);
    ok('company admin gets 403 on GET /feedback', denied2.status === 403);
    const c3 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P3 = await c3.newPage();
    await signIn(P3, `s3-admin-${stamp}@test.local`, 'harness-pw-1');
    await P3.goto(`${WEB}/admin`);
    await P3.waitForTimeout(2000);
    ok('company admin has NO Feedback tab', (await P3.locator('a[href="/admin/feedback"]').count()) === 0 && (await P3.locator('a[href="/admin/people"]').count()) === 1);
    await P3.goto(`${WEB}/admin/feedback`);
    await P3.waitForTimeout(2500);
    ok('direct URL shows the platform-only notice, no rows', /Only the ShotLog platform admin/.test(await P3.locator('body').innerText()));
    // …but that admin can still SEND feedback like anyone else
    const sent = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: `s3-${stamp}-direct-00000001`, kind: 'question', message: `S3 harness direct ${stamp}`, route: '/x', buildId: 'harness' }) }, enrolled.body.accessToken);
    const again = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: `s3-${stamp}-direct-00000001`, kind: 'question', message: `S3 harness direct ${stamp}`, route: '/x', buildId: 'harness' }) }, enrolled.body.accessToken);
    ok('POST /feedback open to every role; re-POST of the same id is idempotent', sent.status === 201 && again.status === 200 && again.body.duplicate === true);
    await c3.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      if (adminTok) {
        for (const r of await listMine(adminTok)) await api(`/feedback/${r.id}`, { method: 'DELETE' }, adminTok);
        if (newAdminId) await api(`/users/${newAdminId}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminTok);
      }
    } catch {}
  }
  return results.join('\n');
}
