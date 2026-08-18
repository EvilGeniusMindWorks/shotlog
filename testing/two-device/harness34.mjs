async (page) => {
  // Round 4 — Shop experience verification: trio (Down · Tickets · Due
  // soon) over ONE merged worklist with shop-editable order, PM on flagged
  // assumptions (advisory), where's-my-equipment locator (passive
  // derivation, geocoded pins, at-the-yard gesture), fleet-now card.
  // A = admin (mark), M = mechanic.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
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
  const SYNC = 4500;
  let A, M, ctxA, ctxM;
  try {
    ctxA = await mkCtx();
    A = await ctxA.newPage();
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');

    await A.evaluate(async () => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const { users } = await (await authedFetch('/users')).json();
      const m = users.find((u) => u.email.includes('mechanic@'));
      await authedFetch(`/users/${m.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ tempPassword: 'mech-pass-123' }),
      });
    });

    // Seed: rig R34 (1,000 h; engine service 240 h ago → due soon 240/250),
    // asset E34 with an OOS ticket (down), an older open ticket on R34,
    // and a geocoded site + job + today's checklist placing R34 there.
    const setup = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const now = nowISO();
      const mk = () => generateId();
      const rigId = mk();
      const e34Id = mk();
      await db.equipment.add({
        id: rigId, assetNumber: 'R-34', description: 'Harness rig 34', category: 'rock_drill',
        isActive: true, status: 'active', hourMeter: 1000,
        services: [{ id: mk(), type: 'engine', atHours: 760, date: '2026-07-20', byName: 'Ray' }],
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.equipment.add({
        id: e34Id, assetNumber: 'E-34', description: 'Harness excavator', category: 'excavator',
        isActive: true, status: 'active', createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.hourCorrections.add({
        id: mk(), equipmentId: rigId, observedHours: 1000, previousHours: null,
        correctedByUserId: me.id, correctedByName: me.name,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      const twoAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const fiveAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
      const downTicketId = mk();
      await db.repairTickets.add({
        id: downTicketId, equipmentId: e34Id, sourceType: 'manual',
        description: 'H34 hydraulic burst', outOfService: true, status: 'open',
        openedByName: 'Mark S.', createdAt: twoAgo, updatedAt: now, syncStatus: 'local',
      });
      const oldTicketId = mk();
      await db.repairTickets.add({
        id: oldTicketId, equipmentId: rigId, sourceType: 'manual',
        description: 'H34 slow leak, left rear', outOfService: false, status: 'open',
        openedByName: 'Mark S.', createdAt: fiveAgo, updatedAt: now, syncStatus: 'local',
      });
      // hierarchy with a geocoded site
      const customerId = mk();
      const siteId = mk();
      const jobId = mk();
      await db.customers.add({
        id: customerId, name: 'H34 Customer', isActive: true,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.sites.add({
        id: siteId, customerId, name: 'H34 South Pit', address: '1 Pit Rd', city: 'Whately',
        state: 'MA', kFactor: 180, kFactorHistory: [], isActive: true,
        geo: { lat: 42.44, lng: -72.63 },
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.jobs.add({
        id: jobId, name: 'H34 Pit Job', customerId, siteId, operation: 'quarry',
        typeOfRock: '', typeOfTerrain: '', defaultHazards: '', defaultPrecautions: '',
        isActive: true, customer: 'H34 Customer', address: '1 Pit Rd', city: 'Whately',
        state: 'MA', kFactor: 180, kFactorHistory: [],
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.drillChecklists.add({
        id: mk(), equipmentId: rigId, jobId, date: todayISO(), startingHours: 1000,
        daily: {}, weeklyDone: false, weekly: {}, repairsNote: '', outOfService: false,
        drillerUserId: me.id, drillerName: 'Dinis M.', signatureImage: null,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { rigId, e34Id, downTicketId, oldTicketId, customerId, siteId, jobId };
    });
    await A.waitForTimeout(SYNC);

    ctxM = await mkCtx();
    M = await ctxM.newPage();
    await login(M, 'mechanic@test.local', 'mech-pass-123');
    await M.waitForTimeout(2500);

    // ── (1) Trio + merged worklist in default order ─────────────────────
    const home1 = await M.locator('body').innerText();
    ok('trio tiles: Down · Tickets · Due soon', /Down/.test(home1) && /Tickets/.test(home1) && /Due soon/i.test(home1));
    ok('worklist is the shop’s (header + reset)', /Worklist · your order/i.test(home1) && /reset to default/i.test(home1));
    const i1 = home1.indexOf('H34 hydraulic burst');
    const i2 = home1.indexOf('H34 slow leak');
    const i3 = home1.indexOf('Engine service');
    ok('default order: down first, then oldest, service last', i1 >= 0 && i2 > i1 && i3 > i2);
    ok('PM row shows since/interval', /240\/250/.test(home1));
    ok('fleet-now card with checklists-today', /Fleet now/i.test(home1) && /Checklists filed today/i.test(home1));

    // ── (2) Shop-owned order: saved order honored, reset restores ───────
    await M.evaluate(({ downTicketId, oldTicketId }) => {
      localStorage.setItem(
        'shotlog-shop-order',
        JSON.stringify([`ticket:${oldTicketId}`, `ticket:${downTicketId}`]),
      );
    }, setup);
    await M.reload();
    await M.waitForTimeout(2500);
    const home2 = await M.locator('body').innerText();
    ok('saved order honored (leak before burst)',
      home2.indexOf('H34 slow leak') < home2.indexOf('H34 hydraulic burst'));
    await M.getByRole('button', { name: /reset to default/i }).click();
    await M.waitForTimeout(800);
    const home3 = await M.locator('body').innerText();
    ok('reset to default restores downs-first',
      home3.indexOf('H34 hydraulic burst') < home3.indexOf('H34 slow leak'));

    // ── (3) PM card: assumption band + log-a-service restarts the clock ─
    await M.goto(`http://localhost:5199/equipment/${setup.rigId}`);
    await M.waitForTimeout(2000);
    const asset1 = await M.locator('body').innerText();
    ok('assumption band is loud', /ASSUMED intervals/i.test(asset1) && /placeholders until the shop crew/i.test(asset1));
    ok('due-soon row on the asset', /240\/250/.test(asset1) && /due soon/i.test(asset1));
    await M.getByRole('button', { name: 'Log a service done' }).click();
    await M.locator('select').last().selectOption('engine');
    await M.locator('input[placeholder="1000"]').fill('1000');
    await M.getByRole('button', { name: 'Save', exact: true }).click();
    await M.waitForTimeout(1500);
    const asset2 = await M.locator('body').innerText();
    ok('service logged — clock restarts (0/250 ok)', /0\/250/.test(asset2) && !/due soon/i.test(asset2.split('Service schedule')[1]?.split('History')[0] ?? asset2));

    // ── (4) Locator: passive site placement + at-the-yard gesture ───────
    await M.goto('http://localhost:5199/equipment-locator');
    await M.waitForTimeout(3000);
    const loc1 = await M.locator('body').innerText();
    ok('R-34 located at the site from today’s checklist',
      /H34 South Pit/.test(loc1) && /checklist/i.test(loc1) && /today/i.test(loc1));
    const pinCount = await M.locator('.leaflet-marker-icon').count();
    ok('map renders pins from site geo', pinCount >= 1);
    await M.getByText('H34 South Pit').first().click();
    await M.waitForTimeout(500);
    await M.getByRole('button', { name: 'Mark at the yard' }).click();
    await M.waitForTimeout(1500);
    const yardSet = await M.evaluate(async (rigId) => {
      const { db } = await import('/src/db/index.ts');
      const e = await db.equipment.get(rigId);
      return Boolean(e?.atYardAt);
    }, setup.rigId);
    ok('at-the-yard gesture stamps the asset', yardSet);
    const loc2 = await M.locator('body').innerText();
    ok('row now reads The yard / set by shop', /The yard/.test(loc2) && /set by shop/i.test(loc2));

    // ── (5) Mechanic writes survive the server (atYard + services) ──────
    await M.waitForTimeout(SYNC);
    const onA = await A.evaluate(async (rigId) => {
      const { db } = await import('/src/db/index.ts');
      const e = await db.equipment.get(rigId);
      return { yard: Boolean(e?.atYardAt), services: (e?.services ?? []).length };
    }, setup.rigId);
    ok('shop writes sync through (mechanic PATCH)', onA.yard && onA.services === 2);

    // cleanup
    await A.evaluate(async ({ rigId, e34Id, downTicketId, oldTicketId, customerId, siteId, jobId }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      await deleteWithTombstone('repairTickets', downTicketId);
      await deleteWithTombstone('repairTickets', oldTicketId);
      for (const c of await db.drillChecklists.filter((x) => x.equipmentId === rigId).toArray())
        await deleteWithTombstone('drillChecklists', c.id);
      for (const c of await db.hourCorrections.filter((x) => x.equipmentId === rigId).toArray())
        await deleteWithTombstone('hourCorrections', c.id);
      await deleteWithTombstone('equipment', rigId);
      await deleteWithTombstone('equipment', e34Id);
      await deleteWithTombstone('jobs', jobId);
      await deleteWithTombstone('sites', siteId);
      await deleteWithTombstone('customers', customerId);
    }, setup);
    await A.waitForTimeout(3000);

    await ctxA.close();
    await ctxM.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (M) results.push(`M URL ${M.url()}`); } catch {}
  }
  return results.join('\n');
}
