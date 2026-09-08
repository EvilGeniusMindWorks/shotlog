async (page, lib) => {
  // Sync volume, part two (2026-09-08): the images that stay INSIDE records
  // are made small — a site-sketch snapshot capped at 1280 px / JPEG 0.7 and
  // a signature cropped to its ink and downscaled — because the shot record
  // is re-sent on every edit and a signature rides on every signed record.
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();

  const c1 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const P1 = await c1.newPage();
  await signIn(P1, 'blaster');
  await skipTours(P1);

  await R.section('the encoders: a 2000 × 1400 snapshot and a 900 × 320 signature canvas', async () => {
    const r = await P1.evaluate(async () => {
      const { encodeCanvasJpeg, compactSignature } = await import('/src/lib/imageCompress.ts');
      // a satellite-ish snapshot: gradient, noise, a few shapes
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1400;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 2000, 1400); grad.addColorStop(0, '#5b7a3a'); grad.addColorStop(1, '#8a7a55'); g.fillStyle = grad; g.fillRect(0, 0, 2000, 1400);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255},0.35)`; g.fillRect((i * 173) % 2000, (i * 311) % 1400, 6 + (i % 9), 6 + (i % 7)); }
      g.fillStyle = '#1a365d'; g.beginPath(); g.arc(1000, 700, 40, 0, Math.PI * 2); g.fill();
      const raw = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
      const small = await encodeCanvasJpeg(c);
      const bmp = await createImageBitmap(small);
      // a signature: white pad, a scribble in the middle third
      const s = document.createElement('canvas'); s.width = 900; s.height = 320;
      const sg = s.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, 900, 320);
      sg.strokeStyle = '#000'; sg.lineWidth = 3; sg.lineCap = 'round'; sg.beginPath(); sg.moveTo(250, 200);
      for (let x = 250; x < 650; x += 4) sg.lineTo(x, 200 - Math.sin(x / 18) * 40 - (x - 250) / 12); sg.stroke();
      const rawSig = await new Promise((res) => s.toBlob(res, 'image/png'));
      const sig = await compactSignature(s);
      const sbmp = await createImageBitmap(sig);
      const blank = document.createElement('canvas'); blank.width = 400; blank.height = 200; const bg = blank.getContext('2d'); bg.fillStyle = '#fff'; bg.fillRect(0, 0, 400, 200);
      const nothing = await compactSignature(blank);
      return { raw: raw.size, small: small.size, w: bmp.width, h: bmp.height, rawSig: rawSig.size, sig: sig.size, sw: sbmp.width, sh: sbmp.height, nothing };
    });
    R.ok(`snapshot: ${(r.raw / 1024).toFixed(0)} KB at 0.85 full size → ${(r.small / 1024).toFixed(0)} KB at ${r.w} × ${r.h}`, r.w === 1280 && r.h === 896 && r.small < r.raw * 0.5 && r.small < 120000);
    R.ok(`signature: ${(r.rawSig / 1024).toFixed(1)} KB full pad → ${(r.sig / 1024).toFixed(1)} KB cropped at ${r.sw} × ${r.sh}`, r.sig < 8000 && r.sig < r.rawSig && r.sw <= 600 && r.sh < r.sw);
    R.ok('an empty pad yields no signature', r.nothing === null);
  });

  await R.section('signing on the profile page stores the compact version', async () => {
    await P1.goto(`${WEB}/profile`);
    await P1.locator('main').waitFor({ timeout: 10000 });
    if (await P1.getByTitle('Clear signature').count()) {
      await P1.getByTitle('Clear signature').click();
      await sleep(800);
    }
    await P1.getByRole('button', { name: /Tap to sign/ }).click();
    const canvas = P1.locator('canvas').first();
    await canvas.waitFor({ timeout: 5000 });
    const box = await canvas.boundingBox();
    await P1.mouse.move(box.x + 60, box.y + 90);
    await P1.mouse.down();
    for (let i = 1; i <= 40; i++) await P1.mouse.move(box.x + 60 + i * 8, box.y + 90 + Math.sin(i / 3) * 30, { steps: 2 });
    await P1.mouse.up();
    await P1.getByRole('button', { name: 'Save Signature' }).click();
    await sleep(1500);
    const stored = await P1.evaluate(() => { const u = JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'); return { len: (u.signature ?? '').length, isPng: (u.signature ?? '').startsWith('data:image/png') }; });
    R.ok(`the saved signature is a compact PNG (${(stored.len * 0.75 / 1024).toFixed(1)} KB)`, stored.isPng && stored.len > 500 && stored.len < 12000);
    R.ok('the field shows the signature image', (await P1.locator('img[alt="Signature"]').count()) === 1);
  });

  await c1.close();
  return R.summary();
}
