async (page) => {
  // People merge round: one list (roster ∪ logins), backfill heals ghost
  // users, create-login links the exact roster row, ONE role and ONE
  // deactivate switch act on both sides, supervisor gets add-people only,
  // Settings is personal-only, /admin/users redirects.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let admin, sup;
  try {
    const mk = async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
      `);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5199');
      return p;
    };
    const login = async (p, email, pass) => {
      await p.locator('input[type="email"]').fill(email);
      await p.locator('input[type="password"]').fill(pass);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
      await p.waitForTimeout(3500);
    };
    const waitFor = async (p, fn, arg, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        try { if (await p.evaluate(fn, arg)) return true; } catch { /* nav race */ }
        await p.waitForTimeout(800);
      }
      return false;
    };
    const tag = `H24-${Date.now() % 1000000}`;

    admin = await mk();
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');

    // ── (a) People page: backfill heals ghosts, every login listed ────────
    await admin.goto('http://localhost:5199/admin/people');
    await admin.waitForTimeout(4000);
    const backcheck = await admin.evaluate(async () => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const users = ((await res.json()).users ?? []).filter((u) => u.isActive);
      const crew = await window.shotlogDb.crewMembers.toArray();
      const linked = new Set(crew.map((c) => c.userId).filter(Boolean));
      return { total: users.length, missing: users.filter((u) => !linked.has(u.id)).map((u) => u.email) };
    });
    ok(`backfill: all ${backcheck.total} logins have roster entries`, backcheck.missing.length === 0);
    if (backcheck.missing.length) results.push('MISSING ' + backcheck.missing.join(','));

    // ── (b) add a person (no login) via the page UI ───────────────────────
    await admin.getByRole('button', { name: 'Add person' }).click();
    await admin.locator('div.rounded-xl input').first().fill(`${tag} Laborer`);
    await admin.getByRole('button', { name: 'Add', exact: true }).click();
    await admin.waitForTimeout(1000);
    const person = await admin.evaluate(async (t) =>
      (await window.shotlogDb.crewMembers.toArray()).find((c) => c.name === `${t} Laborer`), tag);
    ok('add person creates a roster row (no login)', Boolean(person) && !person.userId);

    // ── (c) create a login on that row → server links THAT roster row ─────
    const email = `${tag.toLowerCase()}@test.local`;
    const created = await admin.evaluate(async ({ id, email }) => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `LINKED VIA ${id}`, email, role: 'driller', tempPassword: 'temppass99', crewMemberId: id }),
      });
      return res.ok ? (await res.json()).user : null;
    }, { id: person.id, email });
    ok('POST /users with crewMemberId succeeds', Boolean(created));
    ok('links to the EXACT roster row (userId lands via sync)', await waitFor(admin, async ({ crewId, userId }) => {
      const c = await window.shotlogDb.crewMembers.get(crewId);
      return c?.userId === userId;
    }, { crewId: person.id, userId: created?.id }));

    // ── (d) ONE role: PATCH user role → roster tag follows ────────────────
    await admin.evaluate(async (userId) => {
      const token = localStorage.getItem('shotlog-access-token');
      await fetch(`http://localhost:4000/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: 'mechanic' }),
      });
    }, created.id);
    ok('role change lands on the roster tag too', await waitFor(admin, async (crewId) => {
      const c = await window.shotlogDb.crewMembers.get(crewId);
      return c?.role === 'mechanic';
    }, person.id));

    // ── (e) ONE deactivate: login dies AND roster row goes inactive ───────
    await admin.evaluate(async (userId) => {
      const token = localStorage.getItem('shotlog-access-token');
      await fetch(`http://localhost:4000/users/${userId}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: false }),
      });
    }, created.id);
    ok('deactivate flips the roster row inactive', await waitFor(admin, async (crewId) => {
      const c = await window.shotlogDb.crewMembers.get(crewId);
      return c?.isActive === false;
    }, person.id));
    const loginDead = await admin.evaluate(async (email) => {
      const res = await fetch('http://localhost:4000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'temppass99' }),
      });
      return !res.ok;
    }, email);
    ok('deactivated person cannot log in', loginDead);

    // ── (f) supervisor: People tab visible, add allowed, login mgmt hidden ─
    sup = await mk();
    await login(sup, 'supervisor@test.local', 'super-pass-123');
    await sup.goto('http://localhost:5199/admin/people');
    await sup.waitForTimeout(3000);
    const supTxt = await sup.locator('body').innerText();
    ok('supervisor sees the People page with Add person', supTxt.includes('Add person'));
    ok('supervisor sees no invite/reset controls',
      !supTxt.includes('Re-invite') && !/\bInvite\b/.test(supTxt) && !supTxt.includes('Reset password'));

    // ── (g) Settings is personal-only; /admin/users redirects ─────────────
    await admin.goto('http://localhost:5199/settings');
    await admin.waitForTimeout(2000);
    const setTxt = await admin.locator('body').innerText();
    ok('Settings has no crew/equipment cards',
      !setTxt.includes('Crew Members') && !setTxt.includes('Equipment') && setTxt.includes('Admin'));
    await admin.goto('http://localhost:5199/admin/users');
    await admin.waitForTimeout(2000);
    ok('/admin/users redirects to People', admin.url().includes('/admin/people'));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (admin ?? sup).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}
