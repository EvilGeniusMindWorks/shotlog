async (page) => {
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

  // Admin bulk-imports a sample of the Baystate list
  const admin = await mk('B1-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  await admin.goto('http://localhost:5199/admin/equipment');
  await admin.waitForTimeout(1500);
  await admin.getByRole('button', { name: 'Bulk Import' }).click();
  await admin.locator('textarea').fill(
`P002\tGMC 2016 Sierra 1500 Pickup
P474\tChevy 2015 3500HD Service 4x4 Truck
R1004\tFurukawa 9ES 2002 Rock Drill
R1006\tKomatsu 550 2002 Rock Crusher
E542\t2015 Komatsu PC360LC-11 Excavator
C1714\t2017 Allmand 185CFM Compressor
C1012\t15ft Conveyor/Jumper Conveyor
T124\tKenworth 2016 W900B Tractor
T332\t2016 Kruz Dump Trailer
FT1\tFuel Trailer
XSEISMO\tSeismographs (Per Seismograph)`);
  await admin.getByRole('button', { name: 'Import', exact: true }).click();
  await admin.waitForTimeout(2000);
  const cats = await admin.evaluate(async () => {
    const items = await window.shotlogDb.equipment.toArray();
    const byCode = {};
    for (const i of items) byCode[i.assetNumber] = { cat: i.category, make: i.make, year: i.year };
    return byCode;
  });
  const expect = {
    P002: 'pickup', P474: 'service_truck', R1004: 'rock_drill', R1006: 'crusher',
    E542: 'excavator', C1714: 'compressor', C1012: 'conveyor', T124: 'tractor',
    T332: 'trailer', FT1: 'fuel_trailer', XSEISMO: 'seismograph',
  };
  const wrong = Object.entries(expect).filter(([code, cat]) => cats[code]?.cat !== cat);
  results.push({
    scenario: 'bulk import infers all 11 categories correctly',
    pass: wrong.length === 0,
    detail: wrong.length ? JSON.stringify(wrong.map(([c]) => `${c}:${cats[c]?.cat}`)) : `P002 make=${cats.P002?.make} year=${cats.P002?.year}`,
  });

  // Mechanic: /admin shows ONLY the Equipment tab and lands there
  const mech = await mk('B1-MECH');
  await login(mech, 'mechanic@test.local', 'mech-pass-1234');
  await mech.goto('http://localhost:5199/admin');
  await mech.waitForTimeout(1500);
  const body = await mech.locator('body').innerText();
  const landsOnEquipment = mech.url().includes('/admin/equipment');
  const tabsVisible = ['Users', 'Approvals', 'Catalog', 'Company'].filter((t) =>
    new RegExp(`\\b${t}\\b`).test(body.split('Admin')[1]?.slice(0, 120) ?? ''),
  );
  results.push({
    scenario: 'mechanic lands on Equipment tab, sees no other admin tabs',
    pass: landsOnEquipment && tabsVisible.length === 0,
    detail: `url=${mech.url().split('5199')[1]} otherTabs=${JSON.stringify(tabsVisible)}`,
  });

  // Mechanic can edit an asset (matrix allows); it syncs to admin
  await mech.waitForTimeout(2000);
  await mech.evaluate(async () => {
    const item = (await window.shotlogDb.equipment.toArray()).find((e) => e.assetNumber === 'R1004');
    await window.shotlogDb.equipment.update(item.id, { status: 'in_shop', hourMeter: 12450, updatedAt: new Date().toISOString() });
  });
  let synced = false;
  for (let i = 0; i < 20 && !synced; i++) {
    synced = await admin.evaluate(async () => {
      const item = (await window.shotlogDb.equipment.toArray()).find((e) => e.assetNumber === 'R1004');
      return item?.status === 'in_shop' && item?.hourMeter === 12450;
    });
    if (!synced) await admin.waitForTimeout(500);
  }
  results.push({ scenario: 'mechanic edit (in_shop + hour meter) syncs to admin', pass: synced });

  await admin.context().close();
  await mech.context().close();
  return results;
}
