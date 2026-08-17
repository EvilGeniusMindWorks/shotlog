async (page) => {
  // Round B verification: configurable roles. Admin › Roles editor (Admin
  // locked, built-ins editable with reset, custom roles), dynamic People
  // role options, capability-gated Admin tabs + nav + home dashboard for a
  // CUSTOM role, and SERVER enforcement: an edited built-in's revoked
  // capability discards the write; the 'admin' key can't be redefined.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    return ctx;
  };
  const login = async (p, email, pass) => {
    await p.goto('http://localhost:5199');
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await p.waitForTimeout(3500);
  };
  let A, B, C;
  try {
    const tag = Date.now() % 1000000;
    const ctxA = await mkCtx();
    A = await ctxA.newPage();
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');

    // ── (1) Roles tab: admin locked, built-ins listed ─────────────────────
    await A.goto('http://localhost:5199/admin/roles');
    await A.waitForTimeout(1500);
    const rolesBody = await A.locator('body').innerText();
    ok('roles editor lists built-ins', ['Admin', 'Supervisor', 'Blaster', 'Driller', 'Mechanic', 'Office']
      .every((n) => rolesBody.includes(n)));
    await A.getByRole('button', { name: /^Admin$/ }).first().click();
    await A.waitForTimeout(400);
    ok('admin role is protected', (await A.locator('body').innerText()).includes("can't be edited"));

    // ── (2) Create the custom Foreman role ────────────────────────────────
    await A.getByRole('button', { name: 'New role' }).click();
    await A.locator('input[placeholder*="Role name"]').fill('Foreman');
    await A.getByRole('button', { name: 'Create', exact: true }).click();
    await A.waitForTimeout(800);
    for (const cap of ['Work days & field reports', 'Approve & unlock work days', 'Submit work days', 'Manage people', 'Open the Admin area']) {
      // live-query-bound checkboxes settle asynchronously — plain click + wait
      await A.locator(`label:has-text("${cap}") input[type="checkbox"]`).first().click();
      await A.waitForTimeout(500);
    }
    await A.waitForTimeout(1200);
    const foremanSaved = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const defs = await db.roleDefinitions.toArray();
      const f = defs.find((d) => d.key === 'foreman');
      return f ? f.capabilities.sort().join(',') : 'MISSING';
    });
    ok('foreman role saved with capabilities',
      foremanSaved === 'approve_days,author_field_reports,manage_people,submit_days,view_admin_area');

    // ── (3) Foreman login via REST user create ────────────────────────────
    const email = `foreman${tag}@test.local`;
    const createStatus = await A.evaluate(async (email) => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const r = await authedFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ email, name: 'Frank Foreman', role: 'foreman', tempPassword: 'foreman-pass-123' }),
      });
      return r.status;
    }, email);
    ok('server accepts the custom role on user create', createStatus === 201);
    const badRole = await A.evaluate(async (tag) => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const r = await authedFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ email: `x${tag}@test.local`, name: 'X', role: 'never_defined', tempPassword: 'password-123' }),
      });
      return r.status;
    }, tag);
    ok('server rejects an unknown role', badRole === 400);

    // ── (4) Edit built-in blaster: revoke incident filing ─────────────────
    await A.goto('http://localhost:5199/admin/roles');
    await A.waitForTimeout(1000);
    await A.getByRole('button', { name: /^Blaster/ }).first().click();
    await A.waitForTimeout(400);
    await A.locator('label:has-text("File incidents") input[type="checkbox"]').first().click();
    await A.waitForTimeout(1500);
    ok('edited badge on built-in', /edited/i.test(await A.locator('body').innerText()));

    // ── (5) Server enforces the revocation on a blaster device ────────────
    const ctxB = await mkCtx();
    B = await ctxB.newPage();
    await login(B, 'blaster@test.local', 'blaster-pass-123');
    const incidentId = await B.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.incidents.add({
        id, type: 'other', status: 'open', date: todayISO(), time: '08:00',
        description: 'H30 capability revocation probe', location: '', peopleInvolved: [],
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    });
    await B.waitForTimeout(5000); // let it sync (and be discarded)
    const onAdmin = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.incidents.get(id)) !== undefined;
    }, incidentId);
    ok('server DISCARDS revoked-capability write', onAdmin === false);

    // blaster can still write what it kept (field reports)
    const dayId = await B.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const jobs = await db.jobs.toArray();
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.blastDays.add({
        id, jobId: jobs[0].id, date: todayISO(), status: 'draft', typeOfWork: 'drill_and_shoot',
        name: 'H30 kept-capability probe', createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    });
    await B.waitForTimeout(4000);
    const dayOnAdmin = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.blastDays.get(id)) !== undefined;
    }, dayId);
    ok('kept capabilities still write through', dayOnAdmin === true);

    // ── (6) Reset blaster to stock ────────────────────────────────────────
    await A.goto('http://localhost:5199/admin/roles');
    await A.waitForTimeout(1000);
    await A.getByRole('button', { name: /^Blaster/ }).first().click();
    await A.waitForTimeout(400);
    await A.getByRole('button', { name: 'Reset to default' }).click();
    await A.waitForTimeout(1500);
    const blasterReset = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      return (await db.roleDefinitions.toArray()).every((d) => d.key !== 'blaster');
    });
    ok('reset removes the override record', blasterReset);

    // ── (7) 'admin' key cannot be redefined even by a direct write ────────
    const adminDefId = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.roleDefinitions.add({
        id, key: 'admin', name: 'Weak Admin', capabilities: [], homeDashboard: 'field',
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    });
    await A.waitForTimeout(4000);
    const adminDefOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.roleDefinitions.get(id)) !== undefined;
    }, adminDefId);
    ok('server discards admin-key definition', adminDefOnB === false);

    // ── (8) Foreman device: nav, dashboard, tabs, People options ──────────
    const ctxC = await mkCtx();
    C = await ctxC.newPage();
    await login(C, email, 'foreman-pass-123');
    await C.waitForTimeout(2500);
    const navText = await C.locator('aside').innerText();
    ok('foreman sees Admin in nav (view_admin_area)', navText.includes('Admin'));
    const dashText = await C.locator('body').innerText();
    ok('foreman gets the FIELD dashboard', !dashText.includes("today's log") && !/shop queue/i.test(dashText));
    await C.goto('http://localhost:5199/admin');
    await C.waitForTimeout(1500);
    const adminTabs = await C.locator('body').innerText();
    ok('foreman admin tabs follow capabilities',
      adminTabs.includes('People') && adminTabs.includes('Approvals') &&
      !adminTabs.includes('Catalog') && !adminTabs.includes('Roles') && !adminTabs.includes('Company'));
    // Foreman capability split, proven at the SERVER: the work day
    // (author_field_reports) lands; the blast log (no author_blast_records)
    // is discarded. (Client `can()` can't be probed via evaluate — Vite HMR
    // serves the evaluate import as a second module instance.)
    const probe = await C.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const jobs = await db.jobs.toArray();
      const dayId = generateId();
      const logId = generateId();
      const now = nowISO();
      await db.blastDays.add({
        id: dayId, jobId: jobs[0].id, date: todayISO(), status: 'draft',
        typeOfWork: 'drill_and_shoot', name: 'H30 foreman day probe',
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.blastLogs.add({
        id: logId, blastDayId: dayId, createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { dayId, logId };
    });
    await C.waitForTimeout(5000);
    const foremanServer = await A.evaluate(async ({ dayId, logId }) => {
      const { db } = await import('/src/db/index.ts');
      return {
        day: (await db.blastDays.get(dayId)) !== undefined,
        log: (await db.blastLogs.get(logId)) !== undefined,
      };
    }, probe);
    ok('foreman work day accepted (author_field_reports)', foremanServer.day === true);
    ok('foreman blast log DISCARDED (no author_blast_records)', foremanServer.log === false);

    // People page shows the custom role option
    await C.goto('http://localhost:5199/admin/people');
    await C.waitForTimeout(1500);
    const hasForemanOption = await C.evaluate(() =>
      [...document.querySelectorAll('option')].some((o) => o.textContent?.trim() === 'Foreman'),
    );
    ok('People role dropdown includes custom role', hasForemanOption);

    // cleanup: remove the foreman role definition (keeps dev DB tidy;
    // the foreman login stays — harmless test user)
    await A.goto('http://localhost:5199/admin/roles');
    await A.waitForTimeout(1000);
    A.once('dialog', (d) => void d.accept());
    await A.getByRole('button', { name: /^Foreman/ }).first().click();
    await A.waitForTimeout(400);
    await A.locator('button:has(svg.lucide-trash-2)').first().click();
    await A.waitForTimeout(1200);

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (C) results.push(`C URL ${C.url()}`); } catch {}
    try { if (A) results.push(`A URL ${A.url()}`); } catch {}
  }
  return results.join('\n');
}
