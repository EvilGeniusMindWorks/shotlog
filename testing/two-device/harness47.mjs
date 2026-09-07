async (page) => {
  // Admin › People — Add person in one shot (Matthew, 2026-09-07): First ·
  // Last · Role · Email · Access. The button says what it does; a typed email
  // defaults to Invite; roster-only works offline; duplicates are caught;
  // the list reads and sorts "Last, First"; Paste list takes emails and
  // invites in bulk. The ⋯ row keeps Invite / Login for existing people.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(`
    localStorage.setItem('shotlog-server-url', '${API}');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    localStorage.setItem('shotlog-pin', 'x');
    localStorage.setItem('shotlog-tour-done', '1');
    localStorage.setItem('shotlog-first-week-hidden', '1');
  `);
  const P = await ctx.newPage();
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
    adminTok = (await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) })).body.accessToken;
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await P.locator('input[type="password"]').fill('dev-password-123');
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(2500);
    await P.goto(`${WEB}/admin/people`);
    await P.locator('[data-tour="people-add"]').waitFor({ timeout: 10000 });
    await P.locator('[data-tour="people-add"]').click();
    const panel = P.locator('[data-add-person]');
    await panel.waitFor({ timeout: 5000 });

    // ── 1. invite in one shot ───────────────────────────────────────────
    ok('panel opens on roster-only with "Add person"', (await P.locator('[data-add-access]').getAttribute('data-add-access')) === 'none' && /^Add person$/.test((await P.locator('[data-add-submit]').innerText()).trim()));
    await P.locator('[data-add-first]').fill('Zed');
    await P.locator('[data-add-last]').fill(`Harness${stamp}`);
    await P.locator('[data-add-email]').fill(`zed-${stamp}@test.local`);
    await P.waitForTimeout(200);
    ok('typing an email flips Access to Invite and the button to "Add & send invite"', (await P.locator('[data-add-access]').getAttribute('data-add-access')) === 'invite' && /Add & send invite/.test(await P.locator('[data-add-submit]').innerText()));
    ok('a login needs a role — the button waits for one', await P.locator('[data-add-submit]').isDisabled());
    await panel.getByRole('button', { name: 'Driller', exact: true }).click();
    ok('picking a role enables it', !(await P.locator('[data-add-submit]').isDisabled()));
    await P.locator('[data-add-submit]').click();
    await P.locator('[data-add-result="invite"]').waitFor({ timeout: 10000 });
    const r1 = await P.locator('[data-add-result="invite"]').innerText();
    ok('one tap: person added AND invite created, link shown', /Zed Harness/.test(r1) && (await P.locator('[data-add-link]').count()) === 1 && /enroll\//.test(await P.locator('[data-add-link]').inputValue()));
    ok('truthful about email (dev has none)', /Email is not set up/.test(r1) || /invite emailed/.test(r1));
    await P.waitForTimeout(1200);
    await P.getByPlaceholder(/Search by name/).fill(`Harness${stamp}`);
    await P.waitForTimeout(500);
    const row1 = P.locator(`[data-person-row]`).filter({ hasText: `Harness${stamp}, Zed` });
    ok('the row reads "Last, First" and shows invited', (await row1.count()) === 1 && /invited/.test(await row1.innerText()));

    // ── 2. duplicate guard ──────────────────────────────────────────────
    await P.locator('[data-add-another]').click();
    await P.locator('[data-add-first]').fill('Zed');
    await P.locator('[data-add-last]').fill(`Harness${stamp}`);
    await P.waitForTimeout(200);
    ok('the same name again is caught, not added twice', (await P.locator('[data-add-dup]').count()) === 1 && (await P.locator('[data-add-submit]').isDisabled()));

    // ── 3. roster only + sort by last name ──────────────────────────────
    await P.locator('[data-add-first]').fill('Aaa');
    await P.locator('[data-add-last]').fill(`Aaaa${stamp}`);
    await P.waitForTimeout(200);
    ok('no email → roster only, "Add person"', (await P.locator('[data-add-access]').getAttribute('data-add-access')) === 'none' && /^Add person$/.test((await P.locator('[data-add-submit]').innerText()).trim()));
    await P.locator('[data-add-submit]').click();
    await P.locator('[data-add-result="none"]').waitFor({ timeout: 5000 });
    await P.waitForTimeout(800);
    await P.getByPlaceholder(/Search by name/).fill('');
    await P.waitForTimeout(500);
    const firstName = await P.locator('[data-person-row] [data-person-name]').first().innerText();
    ok(`the list sorts by last name ("${firstName.trim()}" first)`, firstName.startsWith(`Aaaa${stamp}, Aaa`));

    // ── 4. create login in one shot ─────────────────────────────────────
    await P.locator('[data-add-another]').click();
    await P.locator('[data-add-first]').fill('Bee');
    await P.locator('[data-add-last]').fill(`Login${stamp}`);
    await P.locator('[data-add-email]').fill(`bee-${stamp}@test.local`);
    await panel.getByRole('button', { name: 'Blaster', exact: true }).click();
    await P.locator('[data-add-option="login"] input').click();
    await P.waitForTimeout(200);
    ok('choosing "create the login now" asks for a temp password and relabels', (await P.locator('[data-add-temp]').count()) === 1 && /Add & create login/.test(await P.locator('[data-add-submit]').innerText()));
    await P.locator('[data-add-temp]').fill('harness-pw-12');
    await P.locator('[data-add-submit]').click();
    await P.locator('[data-add-result="login"]').waitFor({ timeout: 10000 });
    await P.waitForTimeout(2500);
    await P.getByPlaceholder(/Search by name/).fill(`Login${stamp}`);
    await P.waitForTimeout(500);
    const row4 = P.locator(`[data-person-row]`).filter({ hasText: `Login${stamp}, Bee` });
    ok('login created in the same tap — row shows login', (await row4.count()) === 1 && /\blogin\b/.test(await row4.innerText()) && !/no login/.test(await row4.innerText()));
    const users = (await api('/users', {}, adminTok)).body.users;
    ok('…and the account exists on the server with the role', users.some((u) => u.email === `bee-${stamp}@test.local` && u.role === 'blaster'));

    // ── 5. offline: roster add still works, login options say why not ───
    await P.locator('[data-add-another]').click();
    await ctx.setOffline(true);
    await P.waitForTimeout(800);
    await P.locator('[data-add-first]').fill('Off');
    await P.locator('[data-add-last]').fill(`Line${stamp}`);
    await P.locator('[data-add-email]').fill(`off-${stamp}@test.local`);
    await P.waitForTimeout(300);
    const inviteOpt = await P.locator('[data-add-option="invite"]').innerText();
    ok('offline: invite/login options are off with the reason; access stays roster-only', (await P.locator('[data-add-access]').getAttribute('data-add-access')) === 'none' && /No signal/.test(inviteOpt));
    await P.locator('[data-add-submit]').click();
    await P.locator('[data-add-result="none"]').waitFor({ timeout: 5000 });
    ok('offline add still lands on the roster', /Off Line/.test(await P.locator('[data-add-result="none"]').innerText()));
    await ctx.setOffline(false);
    await P.waitForTimeout(1500);
    await P.getByRole('button', { name: 'Done' }).click();

    // ── 6. paste list with emails → invites in bulk ─────────────────────
    await P.locator('[data-bulk-open]').click();
    await P.locator('[data-bulk-text]').fill(`Paste${stamp}, One, one-${stamp}@test.local\nTwo Paste${stamp} <two-${stamp}@test.local>\nThree Paste${stamp}`);
    await P.locator('[data-bulk-run]').click();
    await P.locator('[data-bulk-result]').waitFor({ timeout: 15000 });
    const br = await P.locator('[data-bulk-result]').innerText();
    ok(`bulk: three added, two invited (${br})`, /Added 3/.test(br) && /invited 2/.test(br));
    ok('bulk: links shown for the two (email off in dev)', (await P.locator('[data-bulk-links] p').count()) === 3);
    await P.waitForTimeout(1000);
    const invites = (await api('/admin/invites', {}, adminTok)).body.invites;
    ok('bulk invites exist on the server, names in First Last order', invites.some((i) => i.name === `One Paste${stamp}`) && invites.some((i) => i.name === `Two Paste${stamp}`));
    // the ⋯ path is still there for existing people
    await P.getByPlaceholder(/Search by name/).fill(`Paste${stamp}`);
    await P.waitForTimeout(500);
    const row3 = P.locator('[data-person-row]').filter({ hasText: `Paste${stamp}, Three` });
    await row3.locator('[data-person-more]').click();
    await P.waitForTimeout(300);
    ok('an existing roster person still gets Invite / Login from the ⋯ row', (await row3.getByRole('button', { name: /Invite/ }).count()) === 1 && (await row3.getByRole('button', { name: /Login/ }).count()) === 1);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      // cleanup: deactivate the created user, remove the harness roster rows
      if (adminTok) {
        const users = (await api('/users', {}, adminTok)).body?.users ?? [];
        for (const u of users.filter((x) => x.email.endsWith(`-${stamp}@test.local`)))
          await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminTok);
      }
      const removed = await P.evaluate(async (stamp) => {
        const { db, deleteWithTombstone } = await import('/src/db/index.ts');
        const rows = await db.crewMembers.filter((m) => m.name.includes(stamp)).toArray();
        for (const r of rows) await deleteWithTombstone('crewMembers', r.id);
        return rows.length;
      }, stamp);
      await P.waitForTimeout(2500);
      results.push(`PASS cleanup removed ${removed} harness people`);
    } catch (e) {
      results.push(`FAIL cleanup ${e.message}`);
    }
    await ctx.close();
  }
  return results.join('\n');
}
