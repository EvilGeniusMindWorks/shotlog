async (page) => {
  // Round S1 — Onboarding & access (2026-09-06): enroll lands signed in →
  // Set PIN → one-time Welcome; forgot-password round trip via the dev
  // debug link; admin temp reset forces a change; profile nag + signing
  // hard stop; install card on iOS; truthful email status; dead form gone.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);
  const NEW_EMAIL = `s1-${stamp}@test.local`;
  const NEW_NAME = `S1 Harness ${stamp}`;

  const mkCtx = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, ...opts });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
    `);
    return ctx;
  };
  const withPin = async (ctx) => ctx.addInitScript(`localStorage.setItem('shotlog-pin', 'x');`);
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(1500);
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
  let adminTok;
  try {
    // ── 0. server truth ─────────────────────────────────────────────────
    const health = await api('/health');
    ok('/health reports email status (off in dev)', health.body && health.body.email === false);
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    ok('login payload carries mustChangePassword + onboardedAt', 'mustChangePassword' in login.body.user && 'onboardedAt' in login.body.user);

    // ── 1. invite → enroll lands SIGNED IN → Set PIN → Welcome ──────────
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: NEW_NAME, email: NEW_EMAIL, role: 'blaster' }) }, adminTok);
    ok('invite created; emailConfigured=false is stated', inv.status === 201 && inv.body.emailConfigured === false && !inv.body.emailed);
    const token = inv.body.link.split('/enroll/')[1];
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await P1.goto(`${WEB}/enroll/${token}`);
    await P1.getByText(/Welcome, S1 Harness/).waitFor({ timeout: 10000 });
    await P1.locator('input[type="password"]').nth(0).fill('harness-pw-1');
    await P1.locator('input[type="password"]').nth(1).fill('harness-pw-1');
    await P1.getByRole('button', { name: 'Create my account' }).click();
    await P1.waitForTimeout(2500);
    const body1 = await P1.locator('body').innerText();
    ok('enroll → straight to Set PIN (no second sign-in)', /Set a 6-digit PIN/.test(body1) && !/Sign in/.test(body1));
    for (const d of '123456123456') await P1.getByRole('button', { name: d, exact: true }).click();
    await P1.waitForTimeout(800);
    const body2 = await P1.locator('body').innerText();
    ok('welcome shows once, role-aware (field copy)', /Welcome, S1/.test(body2) && /Tap \+ to start work/.test(body2));
    await P1.getByRole('button', { name: /Let.s go/ }).click();
    await P1.waitForTimeout(2500);
    const body3 = await P1.locator('body').innerText();
    ok('lands on the dashboard', /Dashboard/.test(body3));
    // innerText applies text-transform (uppercase eyebrow) — case-insensitive
    ok('profile nag on home: license + signature', /finish setting up/i.test(body3) && /license/i.test(body3) && /Sign once/.test(body3));
    // welcome is per ACCOUNT: reload does not repeat it
    await P1.reload();
    await P1.waitForTimeout(2000);
    const body4 = await P1.locator('body').innerText();
    ok('welcome does not repeat on reload', !/Let.s go/.test(body4));
    const me = await P1.evaluate(async () => {
      const { authedFetch } = await import('/src/lib/session.ts');
      return (await (await authedFetch('/auth/me')).json()).user;
    });
    ok('onboardedAt recorded on the account', Boolean(me.onboardedAt));
    await c1.close();

    // ── 2. signing hard stop for a blaster with no license ──────────────
    const c2 = await mkCtx();
    await withPin(c2);
    const P2 = await c2.newPage();
    await signIn(P2, NEW_EMAIL, 'harness-pw-1');
    await P2.waitForTimeout(5000); // first sync
    const dayId = await P2.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      return createBlastDay(jobs[0].id);
    });
    // The Sign-off section opens by default while incomplete — do NOT click
    // its header (that collapses it and hides the stop)
    await P2.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await P2.waitForTimeout(2500);
    const hasStop = (await P2.locator('[data-signing-blocked]').count()) > 0;
    const hasPad = (await P2.getByText(/Tap to sign/).count()) > 0;
    ok('blast-log signature replaced by the license stop', hasStop && !hasPad);
    // add a license → stop lifts and the signature pad is back
    await P2.evaluate(async () => {
      const { updateMyLicenses } = await import('/src/lib/session.ts');
      await updateMyLicenses([{ state: 'MA', licenseNumber: 'H-S1-TEST', expirationDate: '2028-01-01' }]);
    });
    await P2.reload();
    await P2.waitForTimeout(2500);
    const hasStop2 = (await P2.locator('[data-signing-blocked]').count()) > 0;
    const hasPad2 = (await P2.getByText(/Tap to sign/).count()) > 0;
    ok('license on file lifts the stop (pad back)', !hasStop2 && hasPad2);
    await P2.waitForTimeout(3000); // let the day reach the server before the admin deletes it
    await c2.close();

    // ── 3. forgot password → reset link → signed in ─────────────────────
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await P3.goto(WEB);
    await P3.getByRole('button', { name: 'Forgot password?' }).click();
    await P3.locator('input[type="email"]').fill(NEW_EMAIL);
    await P3.getByRole('button', { name: 'Send reset link' }).click();
    await P3.locator('[data-forgot-result]').waitFor({ timeout: 10000 });
    const fr = await P3.locator('[data-forgot-result]').innerText();
    ok('forgot screen says email is not set up (truthful)', /Email isn't set up/.test(fr));
    const debugHref = await P3.locator('[data-forgot-result] a').getAttribute('href');
    ok('dev debug link present when email is off', Boolean(debugHref && debugHref.includes('/reset/')));
    const resetToken = debugHref.split('/reset/')[1];
    await P3.goto(`${WEB}/reset/${resetToken}`);
    await P3.getByText(/Choose a new password/).waitFor({ timeout: 10000 });
    await P3.locator('input[type="password"]').nth(0).fill('harness-pw-2');
    await P3.locator('input[type="password"]').nth(1).fill('harness-pw-2');
    await P3.getByRole('button', { name: 'Save and sign in' }).click();
    await P3.waitForTimeout(2500);
    const b3 = await P3.locator('body').innerText();
    ok('reset lands signed in (Set PIN, not Sign in)', /Set a 6-digit PIN/.test(b3));
    const reused = await api(`/auth/reset/${resetToken}`);
    ok('reset link is single-use', reused.status === 410);
    const oldPw = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: NEW_EMAIL, password: 'harness-pw-1' }) });
    const newPw = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: NEW_EMAIL, password: 'harness-pw-2' }) });
    ok('old password rejected, new accepted', oldPw.status === 401 && newPw.status === 200);
    const unknown = await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email: `nobody-${stamp}@test.local` }) });
    ok('forgot never enumerates (200 for unknown email, no link)', unknown.status === 200 && !unknown.body.debugLink);
    await c3.close();

    // ── 4. admin temp reset → forced change on next sign-in ─────────────
    const users = (await api('/users', {}, adminTok)).body.users;
    const u = users.find((x) => x.email === NEW_EMAIL);
    await api(`/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ tempPassword: 'temp-pw-12345' }) }, adminTok);
    const c4 = await mkCtx();
    await withPin(c4);
    const P4 = await c4.newPage();
    await signIn(P4, NEW_EMAIL, 'temp-pw-12345');
    ok('temp password forces a change screen', (await P4.locator('[data-change-password]').count()) > 0);
    await P4.locator('input[type="password"]').nth(0).fill('harness-pw-3');
    await P4.locator('input[type="password"]').nth(1).fill('harness-pw-3');
    await P4.getByRole('button', { name: 'Save password' }).click();
    await P4.waitForTimeout(2500);
    const b4 = await P4.locator('body').innerText();
    ok('after the change the app opens', /Dashboard/.test(b4) && !/Choose your own password/.test(b4));
    const flag = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: NEW_EMAIL, password: 'harness-pw-3' }) });
    ok('mustChangePassword cleared server-side', flag.status === 200 && flag.body.user.mustChangePassword === false);
    await c4.close();

    // ── 5. install card on iOS; dead form gone ──────────────────────────
    const c5 = await mkCtx({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await withPin(c5);
    const P5 = await c5.newPage();
    await signIn(P5, NEW_EMAIL, 'harness-pw-3');
    await P5.goto(`${WEB}/settings`);
    await P5.waitForTimeout(1500);
    const s5 = await P5.locator('body').innerText();
    ok('iOS: install card shows Share → Add to Home Screen', (await P5.locator('[data-install-card]').count()) > 0 && /Add to Home Screen/.test(s5));
    ok('Settings no longer renders a login form', (await P5.locator('#server-url').count()) === 0 && !/Log in/.test(s5));
    await c5.close();

    // ── 6. People page: truthful email note ─────────────────────────────
    const c6 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    await withPin(c6);
    const P6 = await c6.newPage();
    await signIn(P6, 'mark@baystateblasting.com', 'dev-password-123');
    await P6.goto(`${WEB}/admin/people`);
    await P6.waitForTimeout(2500);
    // Use an existing no-login roster person (Adam Routier in the dev seed)
    await P6.getByPlaceholder(/Search by name/).fill('Adam');
    await P6.waitForTimeout(800);
    await P6.getByRole('button', { name: /re-?invite$/i }).first().click();
    await P6.waitForTimeout(400);
    await P6.locator('input[type="email"]').last().fill(`s1-invitee-${stamp}@test.local`);
    await P6.getByRole('button', { name: 'Create invite' }).click();
    await P6.waitForTimeout(2500);
    const p6 = await P6.locator('body').innerText();
    ok('People: invite link panel stays open with a truthful email note',
      /share this link/i.test(p6) && /Email is not set up on the server yet/.test(p6));
    // cleanup the harness day as ADMIN (blasters may not delete days server-side)
    const removed = await P6.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const day = await db.blastDays.get(id);
      if (!day) return false;
      await deleteDayCascade(day);
      return true;
    }, dayId);
    await P6.waitForTimeout(3000);
    ok('harness day cleaned up by admin', removed);
    await c6.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    // cleanup: deactivate the harness user (accounts are never hard-deleted)
    try {
      if (adminTok) {
        const users = (await api('/users', {}, adminTok)).body.users;
        for (const u of users.filter((x) => x.email.startsWith(`s1-${stamp}`) || x.email.startsWith(`s1-invitee-${stamp}`)))
          await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminTok);
      }
    } catch {}
  }
  return results.join('\n');
}
