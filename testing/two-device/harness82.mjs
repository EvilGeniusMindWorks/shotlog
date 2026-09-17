async (page, lib) => {
  // Round S21 — Records that fill the window, attachments under the PDF, and the approval process (2026-09-17)
  // Push 1: the office's Records — the tree, the two-line rows and the Columns menu, the drawer preview
  // with Open in a window, the filmstrip with each attachment's context, and Export binder on a node.
  const { mkCtx, signIn, skipTours, sleep, WEB, API, browserErrors, waitForUpload, daysAgo } = lib;
  const waitFor = async (fn, timeout = 20000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const today = daysAgo(0);
  let dayId, blastLogId, attId, subId, jobA, bins;

  // the blaster files the papers; the office reads them
  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  const picked = await PB.evaluate(async (today) => {
    const { db } = await import('/src/db/index.ts');
    const open = new Set((await db.blastDays.filter((d) => (d.status === 'draft' && !d.closed) || d.date === today).toArray()).map((d) => d.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && j.siteId && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return free.slice(0, 1).map((j) => ({ id: j.id, name: j.name, jobNumber: j.jobNumber, siteId: j.siteId, customerId: j.customerId }));
  }, today);
  if (picked.length < 1) throw new Error('need a job with a site and no open day');
  [jobA] = picked;
  R.note(`job: ${jobA.name}`);
  const sigBlob = `(async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 40); g.lineTo(190, 40); g.stroke(); return await new Promise((r) => c.toBlob(r, 'image/png')); })()`;
  const cors = { 'access-control-allow-origin': 'http://localhost:5199', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, PUT, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-company-id' };

  // ── the fixture: a filed blasting log with a seismo printout that reached storage ──
  const made = await PB.evaluate(
    async ({ jobId, stamp, sigBlob }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { addAttachmentFiles } = await import('/src/lib/attachments.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      const dayId = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s21 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, { totals: { ...shot.totals, numHoles: 12 }, updatedAt: now });
      const readingId = generateId();
      await db.seismoReadings.add({ id: readingId, shotId: shot.id, graphNumber: 2, seismographId: 'BE-1234', ppvTran: 0.12, ppvVert: 0.15, ppvLong: 0.1, peakVectorSum: 0.18, frequency: 31, airOverpressure: 120, maxAccelTran: 0, maxAccelVert: 0, maxAccelLong: 0, maxDisplacementTran: 0, maxDisplacementVert: 0, maxDisplacementLong: 0, operator: 'Barry', location: 'Route 3 pump house', notes: '', complianceStatus: 'compliant', createdAt: now, updatedAt: now, syncStatus: 'local' });
      const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#000'; g.font = '20px sans-serif'; g.fillText('seismo 2', 20, 40);
      const jpeg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      const [attId] = await addAttachmentFiles(readingId, 'seismo_reading', [new File([jpeg], 'IMG_3911.jpeg', { type: 'image/jpeg' })], 'seismo_printout');
      await db.attachments.update(attId, { storageStatus: 'stored', storageKey: `c/test/a/${attId}/IMG_3911.jpeg`, updatedAt: nowISO() });
      const sig = await eval(sigBlob);
      await db.blastLogs.update(log.id, { signatureImage: sig, signedAt: nowISO(), updatedAt: nowISO() });
      return { dayId, blastLogId: log.id, attId };
    },
    { jobId: jobA.id, stamp, sigBlob },
  );
  ({ dayId, blastLogId, attId } = made);
  await waitForUpload(PB, 30000);
  await lib.finishPapers(PB, dayId);
  await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
  await PB.locator('[data-preflight-file]').waitFor({ timeout: 20000 });
  await PB.locator('[data-preflight-file]').click();
  await PB.locator('[data-preflight-file]').click();
  await PB.waitForURL(new RegExp(`/blast-day/${dayId}$`), { timeout: 60000 });
  const sub = await waitFor(() => PB.evaluate(async (dayId) => {
    const { db } = await import('/src/db/index.ts');
    const s = await db.submissions.filter((x) => x.blastDayId === dayId && x.type === 'blast_log').first();
    return s ? { id: s.id, assets: s.assets.length } : null;
  }, dayId), 30000);
  subId = sub?.id;
  if (!subId) throw new Error('the blasting log did not file');
  // storage is not configured locally: stand in for it on the filing device so the copy reads "stored"
  await PB.route('**/files/presign-upload', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url: `${API}/__s21_put`, key: `c/test/a/${body.attachmentId}/${body.fileName}` }) });
  });
  await PB.route('**/__s21_put', (route) => route.fulfill({ status: 200, headers: cors, body: '' }));
  const stored = await waitFor(() => PB.evaluate(async (subId) => {
    const { runFileUploader } = await import('/src/lib/fileUploader.ts');
    await runFileUploader();
    const { db } = await import('/src/db/index.ts');
    const s = await db.submissions.get(subId);
    return s?.storageStatus === 'stored' ? { pdfKey: s.pdfKey, assetKeys: s.assetKeys ?? {} } : null;
  }, subId), 30000, 700);
  await PB.unroute('**/files/presign-upload');
  await PB.unroute('**/__s21_put');
  if (!stored) throw new Error('the copy never read stored');
  // the bytes the office will fetch "from storage"
  bins = await PB.evaluate(async ({ subId, attId }) => {
    const { getLocalMedia } = await import('/src/lib/localMedia.ts');
    const { subPdfKey, subAssetKey } = await import('/src/lib/archive.ts');
    const b64 = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
    const pdf = await getLocalMedia(subPdfKey(subId));
    const jpeg = (await getLocalMedia(subAssetKey(subId, attId))) ?? (await getLocalMedia(attId));
    return { pdf: pdf ? await b64(pdf) : null, jpeg: jpeg ? await b64(jpeg) : null };
  }, { subId, attId });
  await waitForUpload(PB, 30000);
  R.note(`filed copy ${subId.slice(0, 8)} · pdf ${bins.pdf ? Math.round(bins.pdf.length * 0.75 / 1000) + ' KB' : 'missing'} · photo ${bins.jpeg ? 'ok' : 'missing'}`);

  // ── the office ──
  const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PO = await cO.newPage();
  const mockStorage = async (P) => {
    await P.route('**/files/presign-download', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url: `${API}/__s21/${encodeURIComponent(body.key)}` }) });
    });
    await P.route('**/__s21/**', async (route) => {
      const key = decodeURIComponent(route.request().url().split('/__s21/')[1] || '');
      const isPdf = key.includes('sub-pdf');
      const b64 = isPdf ? bins.pdf : bins.jpeg;
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': isPdf ? 'application/pdf' : 'image/jpeg' }, body: Buffer.from(b64 || '', 'base64') });
    });
  };
  await mockStorage(PO);
  await signIn(PO, 'office');
  await skipTours(PO);
  const rowSel = `[data-records-row="bl-${blastLogId}"]`;

  await R.section('Records fills the window: two-line rows, the Columns menu and density', async () => {
    await PO.evaluate(() => localStorage.removeItem('shotlog-records-view'));
    await PO.goto(`${WEB}/records`);
    await PO.locator(rowSel).waitFor({ timeout: 40000 });
    const layout = await PO.evaluate(() => {
      const page = document.querySelector('[data-records-page]');
      const list = document.querySelector('[data-records-list]');
      return {
        pageScroll: document.documentElement.scrollHeight - window.innerHeight,
        pageH: page ? Math.round(page.getBoundingClientRect().height) : 0,
        listOverflow: list ? getComputedStyle(list).overflowY : '',
        width: document.querySelector('[data-records-manager]')?.getBoundingClientRect().width ?? 0,
      };
    });
    R.ok(`the page does not scroll (${layout.pageScroll} px over) and the list does (overflow ${layout.listOverflow})`, layout.pageScroll <= 4 && layout.listOverflow === 'auto');
    R.ok(`the manager uses the window (${Math.round(layout.width)} px wide, ${layout.pageH} px tall)`, layout.width > 1000 && layout.pageH > 600);
    const particulars = (await PO.locator(`${rowSel} [data-records-particulars]`).innerText()).replace(/\s+/g, ' ');
    R.ok(`the blasting log row's second line reads the particulars ("${particulars.trim()}")`, /Shot 1/.test(particulars) && /12 holes/.test(particulars));
    R.ok('the row carries the paper-clip count', (await PO.locator(`${rowSel} [data-records-clips]`).getAttribute('data-records-clips')) === '1');
    R.ok('the Job cell names the job', new RegExp(jobA.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await PO.locator(rowSel).innerText()));
    const before = await PO.locator('[data-records-list] [data-sort]').count();
    await PO.locator('[data-records-columns]').click();
    await PO.locator('[data-records-columns-menu]').waitFor({ timeout: 5000 });
    await PO.locator('[data-column-toggle="shots"]').check();
    await PO.locator('[data-column-toggle="approvedBy"]').check();
    await sleep(300);
    const after = await PO.locator('[data-records-list] [data-sort]').count();
    R.ok(`Columns adds Shots and Approved by (${before} → ${after} headers)`, after === before + 2 && (await PO.locator('[data-sort="shots"]').count()) === 1);
    await PO.locator('[data-density="compact"]').check();
    await sleep(300);
    R.ok('Density: Compact drops the second line', (await PO.locator('[data-records-particulars]').count()) === 0 && (await PO.locator('[data-records-manager]').getAttribute('data-records-density')) === 'compact');
    await PO.keyboard.press('Escape');
    await PO.reload();
    await PO.locator(rowSel).waitFor({ timeout: 40000 });
    R.ok('both are remembered after a reload', (await PO.locator('[data-records-manager]').getAttribute('data-records-density')) === 'compact' && (await PO.locator('[data-sort="shots"]').count()) === 1);
    await PO.locator('[data-records-columns]').click();
    await PO.locator('[data-density="comfortable"]').check();
    await PO.locator('[data-column-toggle="shots"]').uncheck();
    await PO.locator('[data-column-toggle="approvedBy"]').uncheck();
    await PO.mouse.click(600, 60);
    await sleep(300);
    R.ok('Comfortable brings the particulars back', (await PO.locator(`${rowSel} [data-records-particulars]`).count()) === 1);
  });

  await R.section('The tree navigator customer › site › job › day beside the columns', async () => {
    await PO.locator('[data-records-tree]').waitFor({ timeout: 10000 });
    const jobNode = PO.locator(`[data-tree-node="j:${jobA.id}"]`);
    R.ok('the tree lists the job under its customer and site', (await jobNode.count()) === 1 && (await PO.locator(`[data-tree-node="c:${jobA.customerId}"]`).count()) === 1 && (await PO.locator(`[data-tree-node="s:${jobA.siteId}"]`).count()) === 1);
    const jobCount = Number(await jobNode.getAttribute('data-tree-count'));
    R.ok(`the job node counts its papers (${jobCount})`, jobCount >= 2);
    await jobNode.click();
    await sleep(400);
    const rowsUnderJob = await PO.locator('[data-records-row]').count();
    const summary = await PO.locator('[data-records-summary]').innerText();
    const ofN = Number((summary.match(/of (\d+)/) || [])[1]);
    // the list windows 25 at a time; the summary's "of N" is the node's whole count
    R.ok(`tapping the job shows what is under it (${rowsUnderJob} rows · "${summary.trim()}")`, ofN === jobCount && rowsUnderJob === Math.min(25, jobCount) && new RegExp(jobA.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(summary));
    const dayNode = PO.locator(`[data-tree-node="d:${jobA.id}:${today}"]`);
    const dayCount = Number(await dayNode.getAttribute('data-tree-count'));
    await dayNode.click();
    await sleep(400);
    R.ok(`tapping the day narrows to that day's papers (${dayCount})`, dayCount >= 2 && (await PO.locator('[data-records-row]').count()) === dayCount);
    await PO.locator('[data-facet-status="filed"]').click();
    await sleep(400);
    const filedCount = Number(await dayNode.getAttribute('data-tree-count'));
    R.ok(`the tree's counts respect the Status chip (${dayCount} → ${filedCount} filed)`, filedCount >= 1 && filedCount <= dayCount && (await PO.locator('[data-records-row]').count()) === filedCount);
    await PO.locator('[data-facet-status="filed"]').click();
    await PO.locator('[data-records-tree-toggle="hide"]').click();
    await sleep(300);
    R.ok('Hide the tree gives the plain list', (await PO.locator('[data-records-tree-pane]').count()) === 0 && (await PO.locator('[data-records-manager]').getAttribute('data-records-tree-on')) === 'no');
    await PO.locator('[data-records-tree-toggle="show"]').click();
    await PO.locator('[data-records-tree-pane]').waitFor({ timeout: 5000 });
    await PO.locator('[data-records-clear]').click();
    await sleep(300);
    R.ok('Clear returns to everything', /^Everything/.test((await PO.locator('[data-records-summary]').innerText()).trim()));
  });

  await R.section('The drawer preview sticks, Open in a window, paper-clip counts', async () => {
    await PO.locator(rowSel).click();
    await PO.locator('[data-records-drawer]').waitFor({ timeout: 8000 });
    R.ok('a tap opens the preview as a drawer over the right half', (await PO.locator(`[data-records-drawer] [data-records-preview-for="bl-${blastLogId}"]`).count()) === 1 && /open=bl-/.test(PO.url()));
    const box = await PO.locator('[data-records-drawer]').boundingBox();
    R.ok(`the drawer lays over the list's right half, the tree and the toolbar stay clear (${Math.round(box?.width ?? 0)} px wide from x ${Math.round(box?.x ?? 0)})`, Boolean(box) && box.width > 520 && box.width < 800 && box.x > 560 && box.y > 100);
    const pdf = await PO.locator('[data-records-drawer] [data-records-pdf]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    R.ok('the filed PDF renders in the drawer (fetched from storage)', pdf);
    await PO.locator('[data-records-close]').click();
    await sleep(300);
    R.ok('Close closes it and the address forgets it', (await PO.locator('[data-records-drawer]').count()) === 0 && !/open=/.test(PO.url()));
    await PO.locator(rowSel).click();
    await PO.locator('[data-records-drawer]').waitFor({ timeout: 8000 });
    await PO.goBack();
    await sleep(500);
    R.ok('the back gesture closes the drawer and stays on Records', (await PO.locator('[data-records-drawer]').count()) === 0 && /\/records$/.test(new URL(PO.url()).pathname));
    await PO.locator(rowSel).click();
    await PO.locator('[data-records-drawer]').waitFor({ timeout: 8000 });
    const [popup] = await Promise.all([cO.waitForEvent('page', { timeout: 15000 }), PO.locator('[data-records-open-window]').click()]);
    await mockStorage(popup);
    await popup.waitForLoadState('domcontentloaded');
    const shown = await popup.locator('[data-records-window] [data-records-preview]').waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
    R.ok(`Open in a window puts the preview in its own window (${new URL(popup.url()).pathname})`, shown && new RegExp(`/records/preview/${subId}`).test(popup.url()));
    R.ok('the window carries the filmstrip too', shown && (await popup.locator('[data-records-strip]').count()) === 1);
    await popup.close();
  });

  await R.section('The filmstrip: attachments under the PDF with their context, kind chips, search and the lightbox', async () => {
    const strip = PO.locator('[data-records-drawer] [data-records-strip]');
    await strip.waitFor({ timeout: 10000 });
    await waitFor(async () => ((await strip.getAttribute('data-strip-count')) === '1' ? 1 : null), 15000);
    R.ok('the copy lists its one attachment', (await strip.getAttribute('data-strip-count')) === '1');
    const hangs = await PO.locator(`[data-strip-item="${attId}"] [data-strip-hangs-on]`).innerText();
    R.ok(`the heading is the context, not the file name ("${hangs.trim()}")`, /Shot 1 › Seismo reading 2/.test(hangs) && /pump house/.test(hangs) && /PPV 0.18/.test(hangs));
    R.ok('the kind chip reads Seismo 1', /Seismo\s*1/.test(await PO.locator('[data-strip-chip="seismo"]').innerText()));
    const thumb = await PO.locator(`[data-strip-item="${attId}"] img`).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    R.ok('the thumbnail loads from storage', thumb);
    await PO.locator(`[data-strip-item="${attId}"]`).click();
    await PO.locator('[data-records-lightbox]').waitFor({ timeout: 5000 });
    const facts = await PO.locator('[data-lightbox-facts]').innerText();
    R.ok(`the lightbox shows the photo with Hangs on, Taken by and File ("${facts.replace(/\s+/g, ' ').trim().slice(0, 110)}")`, (await PO.locator('[data-lightbox-image]').count()) === 1 && /Seismo reading 2/.test(facts) && /IMG_3911/.test(facts) && /Taken by/.test(facts));
    R.ok('Prev is off on the first, Next off on the last (one photo)', (await PO.locator('[data-lightbox-prev]').isDisabled()) && (await PO.locator('[data-lightbox-next]').isDisabled()));
    await PO.locator('[data-lightbox-close]').click();
    await sleep(200);
    R.ok('Close leaves the drawer open', (await PO.locator('[data-records-lightbox]').count()) === 0 && (await PO.locator('[data-records-drawer]').count()) === 1);
    await PO.locator('[data-records-close]').click();
    await sleep(300);
  });

  await R.section('Export binder carries the index', async () => {
    await PO.locator(`[data-tree-node="d:${jobA.id}:${today}"]`).click();
    await sleep(400);
    const title = (await PO.locator('[data-binder-export]').getAttribute('title')) || '';
    R.ok(`Export binder takes the node you are on ("${title}")`, new RegExp(jobA.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(title));
    await PO.locator('[data-binder-export]').click();
    await PO.locator('[data-binder-scope]').waitFor({ timeout: 5000 });
    const [dl] = await Promise.all([PO.waitForEvent('download', { timeout: 90000 }), PO.getByRole('button', { name: 'Build binder' }).click()]);
    const zipPath = await dl.path();
    const fs = await import('node:fs');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const names = Object.keys(zip.files);
    const indexName = names.find((n) => /^index\/blast_log-.*\.txt$/.test(n));
    const indexText = indexName ? await zip.file(indexName).async('string') : '';
    R.ok(`the binder holds the day's PDFs and an index per paper (${names.filter((n) => n.startsWith('pdfs/')).length} PDFs, ${names.filter((n) => n.startsWith('index/')).length} index)`, names.some((n) => /^pdfs\/blast_log-/.test(n)) && Boolean(indexName));
    R.ok('the index lists the attachment with its context', /IMG_3911/.test(indexText) && /Seismo reading 2/.test(indexText));
    const csv = names.includes('attachments-index.csv') ? await zip.file('attachments-index.csv').async('string') : '';
    R.ok('and attachments-index.csv rolls them up', csv.split('\n').length >= 2 && /pump house/.test(csv));
    await PO.keyboard.press('Escape');
    await PO.mouse.click(20, 400);
  });

  // ── push 2: the approval process ──
  let cardId, blasterOverrideExisted;
  await R.section('Admin › Company › Approvals: the matrix, office approves everything', async () => {
    // a filed time card on the day, for the review screen
    cardId = await PB.evaluate(async ({ dayId, jobId, today }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const now = nowISO();
      const id = generateId();
      await db.timeCards.add({ id, date: today, jobId, blastDayId: dayId, personName: 'Lisa Vital', timeIn: '07:00', timeOut: '15:30', straightTime: 8, overtime: 0.5, notes: '', signatureImage: null, status: 'filed', filedAt: now, enteredByUserId: me?.id ?? '', enteredByName: me?.name ?? '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, { dayId, jobId: jobA.id, today });
    await waitForUpload(PB, 30000);
    await PO.goto(WEB + '/admin/company');
    await PO.locator('[data-approvals-matrix]').waitFor({ timeout: 20000 });
    const cell = (k) => PO.locator('[data-matrix-cell="' + k + '"]');
    const officeTicked = (await cell('time_card:office').isChecked()) && (await cell('blast_log:office').isChecked()) && (await cell('drill_log:office').isChecked());
    const adminLocked = (await cell('blast_log:admin').isChecked()) && (await cell('blast_log:admin').isDisabled());
    const blasterOff = !(await cell('time_card:blaster').isChecked());
    R.ok('the matrix ships with the office ticked on every paper, admin locked, the blaster in charge off', officeTicked && adminLocked && blasterOff);
    R.ok('a day is approved as one by default', (await PO.locator('[data-approvals-matrix] [data-approvals-day-as-one]').getAttribute('data-approvals-day-as-one')) === 'yes');
    R.ok('the office reads the grid; only an admin changes it', await cell('time_card:office').isDisabled());
    // the admin ticks Blaster in charge × Time cards, then unticks it
    const cA = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    await skipTours(PA);
    blasterOverrideExisted = await PA.evaluate(async () => { const { db } = await import('/src/db/index.ts'); return Boolean((await db.roleDefinitions.toArray()).find((r) => r.key === 'blaster')); });
    await PA.goto(WEB + '/admin/company');
    await PA.locator('[data-matrix-cell="time_card:blaster"]').waitFor({ timeout: 20000 });
    await PA.locator('[data-matrix-cell="time_card:blaster"]').click();
    const granted = await waitFor(() => PA.evaluate(async () => { const { db } = await import('/src/db/index.ts'); const r = (await db.roleDefinitions.toArray()).find((x) => x.key === 'blaster'); return r?.capabilities.includes('approve_time_cards') ? 1 : null; }), 10000);
    R.ok("a tick grants the role the paper's capability (Blaster in charge × Time cards → approve_time_cards)", granted === 1);
    await PA.locator('[data-matrix-cell="time_card:blaster"]').click();
    await waitFor(() => PA.evaluate(async () => { const { db } = await import('/src/db/index.ts'); const r = (await db.roleDefinitions.toArray()).find((x) => x.key === 'blaster'); return r && !r.capabilities.includes('approve_time_cards') ? 1 : null; }), 10000);
    await waitForUpload(PA, 20000).catch(() => undefined);
    await cA.close();
  });

  await R.section('The review screen: papers left, PDF and attachments right, Approve and Send back with a note', async () => {
    await PO.goto(WEB + '/admin/approvals');
    const row = PO.locator('[data-approval-row="' + dayId + '"]');
    await row.waitFor({ timeout: 30000 });
    await waitFor(async () => (Number(await row.locator('[data-approval-papers]').getAttribute('data-approval-papers')) >= 3 ? 1 : null), 20000);
    const papersText = (await row.locator('[data-approval-papers]').innerText()).replace(/\s+/g, ' ');
    R.ok('the queue row has real columns: job, date, filed by, papers ("' + papersText + '"), waiting', Number(await row.locator('[data-approval-papers]').getAttribute('data-approval-papers')) >= 3 && /waiting|filed/.test(papersText) && (await row.locator('[data-approval-waiting]').count()) === 1);
    R.ok('Mine / All sits on the queue', (await PO.locator('[data-approvals-mine="on"]').count()) === 1 && (await PO.locator('[data-approvals-mine="off"]').count()) === 1);
    await row.locator('[data-approval-review]').click();
    await PO.waitForURL(new RegExp('/admin/approvals/' + dayId + '$'), { timeout: 10000 });
    await PO.locator('[data-review-papers]').waitFor({ timeout: 20000 });
    const cardSel = '[data-review-paper="time_card:' + cardId + '"]';
    await PO.locator(cardSel).waitFor({ timeout: 20000 });
    R.ok('the papers are down the left: blasting log, daily report, the time card — each waiting', (await PO.locator('[data-review-paper="blast_log"][data-review-state="waiting"]').count()) === 1 && (await PO.locator('[data-review-paper="daily_report"][data-review-state="waiting"]').count()) === 1 && (await PO.locator(cardSel + '[data-review-state="waiting"]').count()) === 1);
    const pdf = await PO.locator('[data-review-preview] [data-records-pdf]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    R.ok("the selected paper's PDF and its attachments are on the right", pdf && (await PO.locator('[data-review-preview] [data-records-strip]').count()) === 1);
    const header = (await PO.textContent('[data-screen-header]')) || '';
    R.ok('the header names who filed it', /filed by/.test(header));
    await PO.locator('[data-review-send-back="time_card:' + cardId + '"]').click();
    await PO.locator('[data-ask-sheet]').waitFor({ timeout: 5000 });
    await PO.locator('[data-ask-text]').fill('IN at 7:00 but the crew list has you arriving at 8:15 — which is it?');
    await PO.locator('[data-ask-confirm]').click();
    await waitFor(async () => ((await PO.locator(cardSel + '[data-review-state="sent_back"]').count()) === 1 ? 1 : null), 15000);
    const st = (await PO.locator(cardSel + ' [data-review-paper-state]').innerText()).replace(/\s+/g, ' ');
    R.ok('Send back records the note on the paper ("' + st.slice(0, 70) + '")', /sent back by/.test(st) && /8:15/.test(st));
    R.ok('Approve the day waits while a paper is sent back', await PO.locator('[data-review-approve-day]').isDisabled());
  });

  await R.section("The filer's home shows the note and Approved by; only an approver sends back; the queue's columns, Mine and Print pack", async () => {
    const card = await waitFor(() => PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const c = await db.timeCards.get(id); return c?.status === 'draft' && c.sendBackNote ? { note: c.sendBackNote, by: c.sendBackBy } : null; }, cardId), 30000);
    R.ok("the time card went back to a draft with the office's note" + (card ? ' (by ' + card.by + ')' : ''), Boolean(card) && /8:15/.test(card?.note ?? ''));
    await PB.goto(WEB + '/');
    const homeRow = PB.locator('[data-attention-row="pb-' + dayId + '-time_card:' + cardId + '"]');
    const onHome = await homeRow.waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    R.ok("the note lands on the blaster's home" + (onHome ? ' ("' + (await homeRow.innerText()).replace(/\s+/g, ' ').slice(0, 80) + '")' : ' (missing)'), onHome && /Time card/i.test(await homeRow.innerText()));
    await PB.goto(WEB + '/blast-day/' + dayId);
    const fileNote = await PB.locator('[data-file-sent-back-papers]').waitFor({ timeout: 20000 }).then(() => PB.locator('[data-file-sent-back-papers]').innerText()).catch(() => '');
    R.ok("the day's File row reads \"" + fileNote.replace(/\s+/g, ' ').trim() + '"', /1 paper sent back/.test(fileNote) && /Time card/i.test(fileNote));
    await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.timeCards.update(id, { status: 'filed', filedAt: nowISO(), updatedAt: nowISO() }); }, cardId);
    await waitForUpload(PB, 30000);
    const cardSel = '[data-review-paper="time_card:' + cardId + '"]';
    await waitFor(async () => (/refiled/.test(await PO.locator(cardSel + ' [data-review-paper-state]').innerText()) ? 1 : null), 30000);
    R.ok('once refiled, the review screen reads "refiled · waiting"', /refiled/.test(await PO.locator(cardSel + ' [data-review-paper-state]').innerText()));
    await PO.locator('[data-review-approve="time_card:' + cardId + '"]').click();
    await waitFor(async () => ((await PO.locator(cardSel + '[data-review-state="approved"]').count()) === 1 ? 1 : null), 15000);
    R.ok('Approve stamps the time card', (await PO.locator(cardSel + '[data-review-state="approved"]').count()) === 1);
    await waitFor(async () => ((await PO.locator('[data-review-approve-day]').isDisabled()) ? null : 1), 10000);
    await PO.locator('[data-review-approve-day]').click();
    await PO.locator('[data-review-approved]').waitFor({ timeout: 15000 });
    const approvedLine = (await PO.locator('[data-review-approved]').innerText()).replace(/\s+/g, ' ');
    R.ok('Approve the day: "' + approvedLine.slice(0, 60) + '"', /Approved .* by /.test(approvedLine));
    const banner = await PB.locator('[data-approved-banner]').waitFor({ timeout: 30000 }).then(() => PB.locator('[data-approved-banner]').innerText()).catch(() => '');
    R.ok("the blaster's day reads \"" + banner.replace(/\s+/g, ' ').trim() + '"', /Approved .* by /.test(banner));
    const approver = (approvedLine.match(/by ([^·]+)/) || [])[1]?.trim() ?? '';
    await PO.goto(WEB + '/records');
    await PO.locator(rowSel).waitFor({ timeout: 30000 });
    await PO.locator('[data-records-columns]').click();
    await PO.locator('[data-column-toggle="approvedBy"]').check();
    await PO.mouse.click(600, 60);
    await waitFor(async () => ((await PO.locator(rowSel).innerText()).includes(approver) ? 1 : null), 20000);
    R.ok('Records shows Approved by (' + approver + ')', Boolean(approver) && (await PO.locator(rowSel).innerText()).includes(approver));
    await PO.locator('[data-records-columns]').click();
    await PO.locator('[data-column-toggle="approvedBy"]').uncheck();
    await PO.mouse.click(600, 60);
    const { token, api } = await lib.apiLogin(PB, 'blaster');
    const refused = await api('/admin/blast-days/' + dayId + '/papers', { method: 'POST', body: JSON.stringify({ paper: 'time_card', recordId: cardId, to: 'sent_back', note: 'nope', label: 'Time card' }) }, token);
    R.ok('only an approver sends back (the blaster gets ' + refused.status + ')', refused.status === 403);
    await PO.goto(WEB + '/admin/approvals/' + dayId + '/print-pack');
    await PO.locator('[data-print-pack]').waitFor({ timeout: 20000 });
    await waitFor(async () => ((await PO.locator('[data-print-pack-photos]').getAttribute('data-print-pack-photos')) === '1' ? 1 : null), 20000);
    R.ok('Print pack lists the papers and the photos, captioned', (await PO.locator('[data-print-pack-paper]').count()) >= 3 && (await PO.locator('[data-print-pack-photo]').count()) === 1 && /Seismo reading 2/.test(await PO.locator('[data-print-pack-photo]').innerText()));
    await PO.goto(WEB + '/admin/approvals');
    await PO.locator('[data-approved-row="' + dayId + '"]').waitFor({ timeout: 20000 });
    R.ok('Recently approved names who approved it', /approved .* by /.test(await PO.locator('[data-approved-row="' + dayId + '"]').innerText()));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const cA2 = await mkCtx(browser);
    const PA2 = await cA2.newPage();
    await signIn(PA2, 'mark');
    await PA2.evaluate(async ({ cardId, dropBlaster }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      if (cardId && (await db.timeCards.get(cardId))) await deleteWithTombstone('timeCards', cardId);
      if (dropBlaster) for (const r of (await db.roleDefinitions.toArray()).filter((x) => x.key === 'blaster')) await deleteWithTombstone('roleDefinitions', r.id);
    }, { cardId, dropBlaster: blasterOverrideExisted === false }).catch(() => undefined);
    await waitForUpload(PA2, 20000).catch(() => undefined);
    const { token: adminToken, api: adminApi } = await lib.apiLogin(PA2, 'mark');
    for (const to of ['submitted', 'draft']) await adminApi('/admin/blast-days/' + dayId + '/status', { method: 'POST', body: JSON.stringify({ to, note: to === 'draft' ? 'harness cleanup' : undefined }) }, adminToken).catch(() => undefined);
    await cA2.close();
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cO.close();
  await cB.close();
  return R.summary();
}
