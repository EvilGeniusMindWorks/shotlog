async (page) => {
  // Repair loop: driller files a checklist with a repair note + out of
  // service → ticket reaches the mechanic's queue, asset flips in_shop,
  // hour meter propagates monotonically → mechanic resolves → restored.
  const browser = page.context().browser();
  const results = [];
  const mk = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('harness-device', '${name}');
    `);
    const p = await ctx.newPage();
    await p.goto('http://localhost:5199');
    return p;
  };
  const login = async (p, email, pass) => {
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  };
  const waitDb = async (p, expr, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const val = await p.evaluate(async (e) => {
        try { const db = window.shotlogDb; return await eval(e); } catch { return null; }
      }, expr);
      if (val) return val;
      await p.waitForTimeout(500);
    }
    return null;
  };

  // Driller files the checklist for R1004 with a repair note + OOS
  const driller = await mk('H8-DRILLER');
  await login(driller, 'dinis@test.local', 'dinis-pass-123');
  await driller.waitForTimeout(2500);
  const rig = await waitDb(driller, `db.equipment.filter(e => e.assetNumber === 'R1004').first()`);
  const priorHours = rig.hourMeter ?? null;
  await driller.goto(`http://localhost:5199/drill-checklist/${rig.id}`);
  await driller.waitForSelector('text=Rock Drill Check List', { timeout: 10000 });
  await driller.locator('input[type="number"]').first().fill('12980');
  // Flip one daily check to "not done" (tap twice: ok → na → skip)
  const firstCheck = driller.getByRole('button', { name: /Engine Oil/ });
  await firstCheck.click();
  await firstCheck.click();
  await driller.locator('input[placeholder*="hose blew"]').fill('hose blew + compressor stopped working');
  await driller.getByText("Rig is OUT OF SERVICE", { exact: false }).click();
  await driller.getByRole('button', { name: 'File checklist' }).click();
  await driller.waitForSelector('text=repair ticket is on its way', { timeout: 10000 });
  results.push({ scenario: 'driller files checklist with repair + OOS', pass: true });

  const local = await driller.evaluate(async (rigId) => {
    const db = window.shotlogDb;
    const asset = await db.equipment.get(rigId);
    const tickets = await db.repairTickets.where('equipmentId').equals(rigId).toArray();
    const checklist = (await db.drillChecklists.where('equipmentId').equals(rigId).toArray())[0];
    return {
      status: asset?.status,
      hourMeter: asset?.hourMeter,
      openTickets: tickets.filter((t) => t.status === 'open').length,
      engineOil: checklist?.daily['Engine Oil'],
    };
  }, rig.id);
  results.push({
    scenario: 'asset in_shop, hour meter advanced (monotonic), check state saved',
    pass: local.status === 'in_shop' && local.hourMeter === 12980 && local.openTickets === 1 && local.engineOil === 'skip',
    detail: `${JSON.stringify(local)} prior=${priorHours}`,
  });

  // Mechanic sees the queue and resolves
  const mech = await mk('H8-MECH');
  await login(mech, 'mechanic@test.local', 'mech-pass-1234');
  await waitDb(mech, `db.repairTickets.filter(t => t.status === 'open' && t.description.includes('compressor')).first()`);
  await mech.goto('http://localhost:5199/admin/equipment');
  await mech.waitForSelector('text=Repair queue', { timeout: 10000 });
  const queueBody = await mech.locator('body').innerText();
  results.push({
    scenario: "mechanic's queue shows the driller's exact note + OOS badge",
    pass: queueBody.includes('hose blew + compressor stopped working') && /out of service/i.test(queueBody),
  });

  await mech.getByRole('button', { name: 'Resolve', exact: true }).first().click();
  await mech.locator('input[placeholder*="replaced"]').fill('replaced hose, rebuilt compressor clutch');
  await mech.getByRole('button', { name: 'Mark resolved' }).click();
  await mech.waitForTimeout(1500);

  // Restoration syncs everywhere
  const restored = await waitDb(driller, `db.equipment.get('${rig.id}').then(a => a && a.status === 'active' ? a : null)`);
  const ticketFinal = await driller.evaluate(async (rigId) => {
    const t = (await window.shotlogDb.repairTickets.where('equipmentId').equals(rigId).toArray())[0];
    return { status: t?.status, note: t?.resolutionNote, by: t?.resolvedByName };
  }, rig.id);
  results.push({
    scenario: 'resolution restores asset + syncs to driller with note',
    pass: !!restored && ticketFinal.status === 'resolved' && (ticketFinal.note ?? '').includes('rebuilt'),
    detail: JSON.stringify(ticketFinal),
  });

  // Monotonic guard: a LOWER reading is ignored
  await driller.evaluate(async (rigId) => {
    const m = await import('/src/hooks/useMaintenance.ts');
    await m.propagateHourMeter(rigId, 12000);
  }, rig.id);
  const guarded = await driller.evaluate(async (rigId) => (await window.shotlogDb.equipment.get(rigId)).hourMeter, rig.id);
  results.push({ scenario: 'monotonic guard ignores lower reading', pass: guarded === 12980, detail: `hourMeter=${guarded}` });

  await driller.context().close();
  await mech.context().close();
  return results;
}
