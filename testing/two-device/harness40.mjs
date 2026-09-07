async (page) => {
  // Round S4 — Clutter sweep (2026-09-06): office home is Evette's queue (a
  // real day submitted → appears oldest-first → Review deep-links → sent back
  // → shows under "Sent back, waiting"); admin home costing windowed;
  // People one-line rows + ⋯ tools + windowing; jobs rows (no ⓘ, silent
  // active chip, long-press peek, sort); customers windowed; daily-report
  // empty sections collapse to one row and hide on a locked day; catalog
  // windowed; driller strip capped; records manager facets · preview ·
  // multi-select · CSV/ZIP; phone preview sheet.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';

  const mkCtx = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, acceptDownloads: true, ...opts });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-first-week-hidden', '1');
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
    const go = P.getByRole('button', { name: /Let.s go/ });
    if (await go.count()) {
      await go.click();
      await P.waitForTimeout(1500);
    }
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const screens = async (P) => P.evaluate(() => {
    const el = document.querySelector('main') ?? document.documentElement;
    return el.scrollHeight / window.innerHeight;
  });
  let adminTok;
  let dayId;
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;

    // ── 1. blaster: daily-report collapse + create the day the office will see ──
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    await P1.waitForTimeout(4000);
    dayId = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      return createBlastDay(jobs[0].id);
    });
    await P1.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await P1.waitForTimeout(2500);
    const emptyRows = await P1.locator('[data-empty-add]').count();
    const drScreens = await screens(P1);
    ok('daily report: 4 empty sections collapse to single "+ Add" rows', emptyRows === 4);
    ok(`daily report tab @430 ≤ 3 screens (was ~4.1) — ${drScreens.toFixed(1)}`, drScreens <= 3);
    await P1.locator('[data-empty-add="Work Force"]').click();
    await P1.waitForTimeout(600);
    ok('tapping the row adds the first line and opens the section', (await P1.locator('[data-empty-add="Work Force"]').count()) === 0 && (await P1.getByText('Work Force').count()) > 0);
    // submit the day (blaster may draft→submitted) → locked: empty sections vanish
    await P1.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.blastDays.update(id, { status: 'submitted', updatedAt: nowISO() });
    }, dayId);
    await P1.reload();
    await P1.waitForTimeout(2500);
    ok('locked day: empty sections are gone (no "+ Add" rows, no empty cards)', (await P1.locator('[data-empty-add]').count()) === 0 && (await P1.getByText('None added').count()) === 0 && (await P1.getByText('No equipment added').count()) === 0);

    // jobs rows @430
    await P1.goto(`${WEB}/jobs`);
    await P1.waitForTimeout(2500);
    const rows = P1.locator('[data-jobs-list] [data-list-row]');
    ok('jobs list windowed to 15 with Show all', (await rows.count()) <= 15 && (await P1.locator('[data-jobs-more]').count()) === 1);
    ok('no ⓘ buttons on job rows', (await P1.locator('[data-jobs-list] svg.lucide-info').count()) === 0);
    const listText = await P1.locator('[data-jobs-list]').innerText();
    ok('"active" chip is silent under the Active filter', !/\bactive\b/.test(listText));
    ok('rows show last worked + day count', /Today|Yesterday|d ago|days?|no days/.test(listText));
    // long-press → peek sheet
    const first = rows.first();
    const box = await first.boundingBox();
    await P1.mouse.move(box.x + 40, box.y + 20);
    await P1.mouse.down();
    await P1.waitForTimeout(700);
    await P1.mouse.up();
    await P1.waitForTimeout(400);
    ok('long-press opens the peek sheet (Last worked fact)', (await P1.getByText('Last worked').count()) > 0);
    await P1.keyboard.press('Escape');
    await P1.mouse.click(5, 5);
    await P1.waitForTimeout(300);
    await P1.locator('[data-jobs-sort]').selectOption('name');
    await P1.waitForTimeout(400);
    const t0 = (await rows.nth(0).innerText()).split('\n')[0];
    const t1 = (await rows.nth(1).innerText()).split('\n')[0];
    ok('Sort: Name orders rows alphabetically', t0.localeCompare(t1) <= 0);
    await P1.locator('[data-jobs-sort]').selectOption('scheduled');
    await P1.waitForTimeout(300);
    ok('Scheduled sort option exists', true);
    await P1.goto(`${WEB}/jobs?lens=customers`);
    await P1.waitForTimeout(2000);
    ok('customers lens: same row, windowed to 15', (await P1.locator('[data-customers-list] [data-list-row]').count()) <= 15 && (await P1.locator('[data-customers-more]').count()) === 1);
    // phone records: My records → tap → preview sheet
    await P1.goto(`${WEB}/records`);
    await P1.waitForTimeout(3000);
    ok('My records uses the manager', (await P1.locator('[data-records-manager]').count()) === 1);
    const myRows = P1.locator('[data-records-row]');
    if ((await myRows.count()) > 0) {
      await myRows.first().click();
      await P1.locator('[data-records-sheet]').waitFor({ timeout: 8000 });
      ok('phone: tapping a row opens the preview sheet', true);
      await P1.locator('[data-records-sheet] button[aria-label="Close preview"]').click();
    } else {
      ok('phone: preview sheet (no rows for this blaster — skipped)', true);
    }
    await P1.waitForTimeout(3000); // let the submitted day reach the server
    await c1.close();

    // ── 2. driller strip cap ──
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    await P2.waitForTimeout(3000);
    const unsigned = await P2.getByText('unsigned', { exact: true }).count();
    ok(`driller "Yesterday needs you" capped at 5 rows (${unsigned})`, unsigned <= 5);
    await c2.close();

    // ── 3. office: the queue ──
    const c3 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P3 = await c3.newPage();
    await signIn(P3, 'office@test.local', 'office-pass-123');
    await P3.waitForTimeout(4000);
    ok('office home is the queue (not the costing table)', (await P3.locator('[data-office-home]').count()) === 1 && (await P3.locator('main table').count()) === 0);
    ok('five live counters', (await P3.locator('[data-office-counter]').count()) === 5);
    const homeScreens = await screens(P3);
    ok(`office home ≤ 3 screens (was 4.3) — ${homeScreens.toFixed(1)}`, homeScreens <= 3);
    ok('office rail has People', (await P3.locator('aside a[href="/admin/people"]').count()) === 1);
    const approvals = P3.locator('[data-office-section="queue-approvals"]');
    await P3.getByText(/blaster@test.local|Blaster/).first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const approvalsText = await approvals.innerText();
    ok('the submitted day is in Approvals with attached facts', /today|day/.test(approvalsText) && /Review/.test(approvalsText));
    await approvals.getByRole('button', { name: 'Review' }).first().click();
    await P3.waitForTimeout(1500);
    ok('Review deep-links to Approvals with the day highlighted', /\/admin\/approvals\?day=/.test(P3.url()) && (await P3.locator('[data-approval-row].ring-2').count()) === 1);
    // send back with a note (office lacks approve_days; do it as admin via API)
    const sb = await api(`/admin/blast-days/${dayId}/status`, { method: 'POST', body: JSON.stringify({ to: 'draft', note: 'S4 harness: seismo missing' }) }, adminTok);
    ok('admin send-back accepted', sb.status === 200);
    await P3.goto(WEB);
    await P3.waitForTimeout(4000);
    const sentBack = await P3.locator('[data-office-section="queue-sent-back"]').innerText();
    ok('sent-back day surfaces in the office queue with the note', /S4 harness: seismo missing/.test(sentBack));
    ok('Sent-back counter ≥ 1', Number((await P3.locator('[data-office-counter="queue-sent-back"]').innerText()).match(/\d+/)?.[0]) >= 1);
    await c3.close();

    // ── 4. admin: costing windowed · People rows · catalog · records manager ──
    const c4 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P4 = await c4.newPage();
    await signIn(P4, 'mark@baystateblasting.com', 'dev-password-123');
    await P4.waitForTimeout(3500);
    ok('admin keeps the Company home', (await P4.getByText('Job costing').count()) > 0);
    const costRows = await P4.locator('table tbody tr').count();
    ok('costing table windowed to 10 + Show all', costRows <= 10 && (await P4.locator('[data-costing-more]').count()) === 1);
    const adminScreens = await screens(P4);
    ok(`admin home ≤ 3 screens (was 4.3) — ${adminScreens.toFixed(1)}`, adminScreens <= 3);
    await P4.locator('[data-costing-more]').click();
    await P4.waitForTimeout(300);
    ok('Show all reveals the rest', (await P4.locator('table tbody tr').count()) > 10);

    await P4.goto(`${WEB}/admin/people`);
    await P4.waitForTimeout(2500);
    const pRows = P4.locator('[data-person-row]');
    ok('People windowed to 15 + Show all', (await pRows.count()) <= 15 && (await P4.locator('[data-people-more]').count()) === 1);
    const h = (await pRows.first().boundingBox()).height;
    ok(`People rows are one line (${h.toFixed(0)}px)`, h < 60);
    const peopleScreens = await screens(P4);
    ok(`People ≤ 3 screens (was 4.4) — ${peopleScreens.toFixed(1)}`, peopleScreens <= 3);
    await pRows.first().locator('[data-person-more]').click();
    await P4.waitForTimeout(300);
    ok('⋯ opens the row tools with the role select', (await P4.locator('[data-person-tools] select').count()) === 1);
    await P4.locator('[data-people-more]').click();
    await P4.waitForTimeout(300);
    ok('Show all reveals everyone', (await pRows.count()) > 15);

    await P4.goto(`${WEB}/admin/catalog`);
    await P4.waitForTimeout(2000);
    const moreCat = await P4.locator('[data-catalog-more]').count();
    const catRows = await P4.locator('.divide-y > div').count();
    ok(`catalog tab windowed (${catRows} rows shown${moreCat ? ', Show all present' : ''})`, moreCat ? catRows <= 15 : true);

    // File a real office copy from THIS device (dev has no R2, so only a PDF
    // filed here is reachable for the inline preview — the truthful fallback
    // is exercised by the other rows)
    const subId = await P4.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { fileSubmission } = await import('/src/lib/archive.ts');
      const day = await db.blastDays.get(id);
      const pdf = new Blob(
        ['%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>'],
        { type: 'application/pdf' },
      );
      return fileSubmission({ type: 'daily_report', sourceId: `s4-${id}`, blastDayId: id, jobId: day.jobId, title: 'S4 harness filed copy', date: day.date, pdf });
    }, dayId);
    await P4.goto(`${WEB}/records`);
    await P4.waitForTimeout(3500);
    ok('records manager with facets + Audit lens', (await P4.locator('[data-records-manager]').count()) === 1 && (await P4.locator('[data-records-facets]').count()) >= 1 && (await P4.locator('[data-records-lens="audit"]').count()) === 1);
    const kindCountText = await P4.locator('[data-records-facets] [data-facet-kind="blast_log"]').first().innerText();
    ok('kind facet shows a live count', /\d+/.test(kindCountText));
    await P4.locator('[data-records-facets] [data-facet-status="filed"]').first().click();
    await P4.waitForTimeout(800);
    const filedRows = P4.locator('[data-records-row]');
    const nFiled = await filedRows.count();
    ok(`Filed facet narrows the list (${nFiled} rows)`, nFiled > 0);
    // a filed copy from another device: truthful "not reachable" fallback
    const other = filedRows.filter({ hasNotText: 'S4 harness filed copy' }).first();
    await other.click();
    await P4.locator('[data-records-preview]').waitFor({ timeout: 8000 });
    await P4.waitForTimeout(1500);
    const otherText = await P4.locator('[data-records-preview]').innerText();
    ok('preview is truthful when the PDF is on another device', /not reachable from this device/.test(otherText) || (await P4.locator('[data-records-pdf]').count()) === 1);
    ok('preview shows filed-by, versions and integrity', /Filed by/.test(otherText) && /Versions/.test(otherText) && /Integrity/.test(otherText));
    // the copy filed here renders inline
    await P4.locator('[data-records-manager] input[placeholder^="Search"]').fill('S4 harness filed copy');
    await P4.waitForTimeout(600);
    await P4.locator('[data-records-row]').first().click();
    const pdfShown = await P4.locator('[data-records-pdf]').waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
    ok('preview pane renders the filed PDF inline', pdfShown);
    const mineText = await P4.locator('[data-records-preview]').innerText();
    ok('integrity line shows the SHA-256 and where the PDF lives', /sha256/.test(mineText) && /filing device|R2/.test(mineText));
    await P4.locator('[data-records-manager] input[placeholder^="Search"]').fill('');
    await P4.waitForTimeout(600);
    await filedRows.nth(0).locator('input[type="checkbox"]').click();
    if (nFiled > 1) await filedRows.nth(1).locator('input[type="checkbox"]').click();
    await P4.waitForTimeout(300);
    ok('selecting rows shows the bulk bar', (await P4.locator('[data-records-bulk]').count()) === 1);
    const [csv] = await Promise.all([P4.waitForEvent('download', { timeout: 10000 }), P4.locator('[data-bulk-csv]').click()]);
    ok('CSV index downloads', /\.csv$/.test(csv.suggestedFilename()));
    const [zip] = await Promise.all([P4.waitForEvent('download', { timeout: 60000 }), P4.locator('[data-bulk-zip]').click()]);
    ok('ZIP of selected PDFs downloads', /\.zip$/.test(zip.suggestedFilename()));
    await P4.locator('[data-group-by="job"]').click();
    await P4.waitForTimeout(400);
    ok('group by job regroups the list', (await P4.locator('[data-records-group]').count()) >= 1);
    // cleanup: the filed copy first (a day with filings is archive-only),
    // then the harness day (a draft again after the send-back)
    await P4.goto(WEB);
    await P4.waitForTimeout(2000);
    await P4.evaluate(async (sid) => {
      const { db } = await import('/src/db/index.ts');
      await db.submissions.delete(sid);
    }, subId);
    await P4.waitForTimeout(3000);
    const removed = await P4.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const day = await db.blastDays.get(id);
      if (!day) return false;
      await deleteDayCascade(day);
      return true;
    }, dayId);
    await P4.waitForTimeout(3000);
    ok('harness day cleaned up', removed);
    await c4.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  }
  return results.join('\n');
}
