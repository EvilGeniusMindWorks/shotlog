# A day at a job — design (design week, Sep 13–14 2026)

The technical half of the design-week deliverable. The plain-language half is the plan page
"A Day at a Job" Matthew and Mark react to. Decisions Matthew made on Sep 13: Option A
amended (whoever opens the job first fills the shared card; every later arrival confirms or
updates it before their document opens), then a hub of tiles per role; build in S13 (data +
card) and S14 (hub).

How it was produced: a panel workflow (four designs from four angles — field-first,
office-first, sync-first, paper-first; three judges; one merge; ran on Sonnet) and a refutation
workflow (seven scenarios + a critic; ran on Sonnet). Review, corrections and every server
claim verified in code by Fable at extra high. Artifacts: scratchpad `day-theme-brief.md`,
`day-theme-merged.json`, `day-theme-critic.json`.

## Decisions (Matthew, Sep 14 2026, plan page df4d6790 v1+v2 and prototype page 5035558b)

- Confirm screen = **A, the fact sheet** (label/value rows with the source of each; no pills anywhere).
- Card input = **A, rows that open a chooser** (one row per fact with its value and source; tapping opens
  a full-height chooser of big buttons; the same pattern as the rig picker).
- **Weather from the NWS**: when the card opens with signal, fetch the nearest station's latest
  observation for the site's map point; fill temperature (cool < 40°F, moderate 40–70, warm > 70),
  weather (text → enum), wind (degrees → compass); **ground is suggested** from precipitation and
  freezing and labelled "suggested"; record the reading (station, time, temp, text, wind, precip)
  alongside the person's confirmed values; no signal → last-day prefill, never blocks.
- Card conflicts = **option 2: first to land sticks, later disagreements are asked**. Every card save
  carries the version it was based on; a stale save is held server-side, the device gets it back as a
  "needs your decision" item, and the person picks with both values and their authors side by side.
  Layered on field-level sending (only changed facts travel; different facts merge quietly).
- One shared **on-site time** on the card; personal in/out stay on time cards. **Joe never sees the
  blast side** on his hub. **Evette's view ships in S14**, as a sorted, filterable, searchable LIST
  (not a strip), attention rows first, any number of jobs. **Any field role may change the card** from
  the conditions bar; the yellow "updated" line tells the others.
- **Blasters are the supervisors** (Mark): the blaster's hub shows their own papers, then a crew list
  (one row per person with the state of each of their papers; tap → that person's papers; Accept a
  completed drill log; Remind for a missing card). The separate supervisor role stays in the system.
- **Big crews**: the crew list gains a summary line, a "Needs something / All" filter and search from
  ~8 people; the daily report's crew section reads the same list. Matthew: "accepting for now; will
  test for intuitiveness, simplicity and functionality."
- **Rigs**: the Rig checklists tile IS the list of today's rigs, each with its own state; "Start a
  checklist for another rig" is a row at the bottom of that list and opens the existing rig picker
  (quick picks with reasons, nothing preselected); out of service on a checklist opens a ticket; the
  drill log's rig line reads "D50, then D45 from 11:10".
- **Per-tile states** are each paper's real lifecycle (blasting log: not started → started → n of m
  shots signed → ready → filed → sent back → approved; daily report; drill log: not started → holes →
  signed complete → accepted; checklist: none → in progress → filed → repair needed → out of service;
  time card: not filed → draft → filed → approved). Tiles never invent a state.
- Nothing is coded about gas leaks or any reason: a day is a container and every paper exists only
  because someone started it.

## The model

- **Root record:** `BlastDay` stays the root (UI: "Work day"). No rename.
- **One day per job per date:** new days get a deterministic id, UUID v5 of
  `companyId:jobId:date`. Two offline phones compute the same id and write the same row.
  Before minting, `findDayByDate(jobId, date)` (the generalised `findTodaysDay`, which today
  hard-codes `todayISO()`) returns a legacy random-id day if the device has one.
  `lifecycle.mergeDays` stays for the mixed-fleet window and legacy duplicates.
- **The shared card** = `BlastDay` scalars: `typeOfWork`, `conditions` (temperatureRange,
  weather, windDirection, groundConditions, weatherNotes), `name`, plus new `onsiteTime`
  (HH:mm) and `setup { by, byName, at }`. Prefilled from the last day at the job and the
  clock; prefills count without a re-tap (the never-auto-pick rule is about picking a job, not
  remembering yesterday's weather).
- **Not on the card:** crew (presence = `workDayConfirmations` rows + time cards; the daily
  report's Work Force stays the time cards per S7d), equipment (the checklist's rig picker,
  nothing preselected, one per rig per day), hours (own time card), licence/signature, rock/
  terrain/hazards (from the job). Lists of people and machines are exactly what two phones
  would fight over; they live as per-person / per-rig rows.
- **`workDayConfirmations`** (new synced records table, NOT a Prisma migration — the server
  stores generic `records` payloads): `id = hash(blastDayId:userId)`, `blastDayId`,
  `userId`, `userName`, `confirmedAt`, `didEdit`. One row per person per day; nobody else
  writes it. Register in `TABLE_PERMISSIONS` as `uniform(REPORT_FAMILY)` (unknown tables are
  denied), add to the sync rules bucket, Dexie store, `PARENT_CHAIN`.
- **Lazy documents:** `createBlastDay` writes the day only. The blasting log (+ blank shot +
  explosive usage) is created by the Blasting log tile's Start via `addBlastLogToDay`; the
  daily report by a new `createDailyReport(dayId)`; drill logs, checklists and time cards
  already stand alone. Null-guard audit: SubmitDayPage preflight, the day page's blasting-log
  section, the Add Blasting Log strip, `ensureBlastingDay`, `useDayPhases`.
- **Setup gate** (day page mount): `setup` undefined AND no documents on the day → the setup
  form (first opener). Legacy days (documents exist, no `setup`) → treated as set up; nobody is
  asked. `setup` present and no confirmation row for me → the confirm card. Confirmation
  present and the day's **server** `updated_at` (already projected by the sync rules; read it
  from the PowerSync row, not the payload's client-stamped `updatedAt`) is newer than my
  `confirmedAt` → the yellow "Shared details were updated — tap to reconfirm" banner. The
  per-device memory key includes the user id (shared tablets).
- **Confirm card (the fact sheet):** "Today at <job>" / "<name> set this up at <time>" / one
  label-value row per fact with its source (NWS 6:28 · confirmed by Joe) / "On site: Joe (6:30),
  Mark (7:10)" from confirmations / **Looks right, continue** (writes only my confirmation row) /
  **Something's wrong — edit** (opens the card form; Save sends a delta with the base version).
- **Where the confirm appears:** blaster/supervisor — opening the day from Today, +, or the
  job page. Driller — the trio stays direct; the confirm appears the first time a job is known
  for them that day (opening the drill log for a plan, or a time card for the job). A checklist
  with no job never waits.
- **Field-level merge + version check for the card (server, blastDays only):** the card form
  sends only the changed leaf paths (dotted keys through the facade's keypath support) plus
  `cardVersion`, the version the edit was based on; the server applies the paths with
  `jsonb_set` and bumps `cardVersion` when the base matches. When the base is STALE for a
  path someone else changed since, that path is not applied: the op comes back to the device
  as `held` with the current value and its author, and the app shows a "Needs your decision"
  item on the home (both values, who set each, one tap; the choice re-sends with the current
  base). Confirmations never conflict (own row). Different facts merge quietly; the same fact
  changed twice is asked, never silently lost. Other tables keep today's whole-record
  semantics (blast radius limited to the card). The "updated — tap to reconfirm" banner stays
  for people who confirmed an older card.
- **NWS weather (verified Sep 14 against api.weather.gov, CORS `*`, needs a User-Agent):**
  `/points/{lat},{lng}` → `properties.observationStations` → pick the NEAREST station by
  distance from the returned station coordinates (the list is not reliably sorted) →
  `/stations/{id}/observations/latest` → `temperature.value` (°C), `textDescription`,
  `windDirection.value` (degrees), `windSpeed`, `precipitationLastHour` (often null);
  24-hour precipitation from `/stations/{id}/observations?start=…` summed, only when online
  and cheap. Store `nws {station, name, observedAt, tempF, text, windDeg, precipIn24h}` on
  the day beside the confirmed values.
- **Type of work guard (server):** a `blastDays` PATCH that changes `typeOfWork` from a
  blasting type to a non-blasting one is discarded when a blast log exists for the day
  (`isBlastingWork` from packages/shared). The hub renders the Blasting log tile whenever a
  log exists, with an amber "type of work mismatch" note if the day says otherwise; File this
  day stays gated on a blasting type.
- **Two live bugs to fix in S13** (`apps/server/src/powersync.ts`): (1) the orphan guard's
  condition `ONE_PER_PARENT[link.parentTable] !== undefined` is false for children of
  `blastDays`, so a drill log whose day was deleted lands as an orphan — simplify to
  `op.op === 'PUT' && !stored && link` + parent lookup, discard and tell the device; (2) the
  ONE_PER_PARENT guard fires only for PUT, so a PATCH onto a hard-deleted (merged-away) blast
  log resurrects it — apply the guard to `PUT || PATCH` when `stored` is null.
- **Honest discard messages:** the upload response gains `raceDiscardedIds`; the client says
  "Someone else started the <document> first while you were offline — their version was kept;
  yours was not saved" instead of the role-denial toast.
- **Filing:** unchanged. File this day when a blasting log exists and every shot is signed; a
  missing daily report is an amber note ("no daily report"), like "no crew". Time cards file
  and approve on their own. A day with nothing started is not "never submitted" for the
  office; Records labels it "Time cards only · <type>" when cards exist.
- **Multi-blaster:** a second blaster opens Mark's blasting log from the tile and adds shots
  signed by them (model a). Driller hub never shows the blast side (Matthew to confirm).

## As built (S13, Sep 14 2026) — where the build departed from the model above

- **PUT of an existing day** (the same name-based id from a second phone): kept quietly, not
  turned into held edits for every differing fact — the conditions in a PUT are the defaults,
  never a person's word. Only the dialog's two choices (type of work, label) become held edits
  when they differ. Anything a person actually set on the card form travels as an edit row.
- **Edits, not jsonb_set on the day PATCH:** a card change is a `dayCardEdits` row per fact
  (path, value, baseVersion, force). The server applies it when nobody else set that fact since
  (a person's own later edit supersedes their earlier one), else holds it with the current value
  and author. A day PATCH never touches the card: the card paths, `cardSets`, `setup` and
  `nws` are restored from the stored row (setup and NWS first-wins). Held rows are the person's
  to close ("use theirs") or re-send with force ("use mine").
- **The reconfirm line reads `cardSets` stamps, not the row clock** — my own writes move the
  row's `updated_at`, so the clock would nag me about my own change.
- **Legacy** = created before the S13 cutover (2026-09-14T04:00Z) with documents → nobody asked.
  A NEW day someone started papers on without the card (a driller's first log) still asks its
  next opener.
- **PATCH onto a missing record is refused for every table**, not only `ONE_PER_PARENT`: a
  PATCH op carries no table name, so once the stored row is gone the op can only be refused —
  before S13 it fell through as "role denied".
- **Honest messages:** the upload answer carries `notices {id, kind: race | refused | child,
  text}`; the client toasts race/refused texts and counts only the rest as role denials.
- **Where the gate is entered:** the day page, the drill-log page (a driller's first log on a
  day), and the driller's Hours sheet (a card for a job whose day exists). Filed days never ask.
- **Temperature bands** on the card are now Low < 40°F / Moderate 40–70 / High > 70 everywhere
  (the day page's chip labels said 50/80).

## The hub (S14)

`/blast-day/:id` = conditions bar (tappable, as today) + tiles; the three tabs and the
phase spine move inside the Blasting log. Tiles per role — blaster: Blasting log (when the
type is blasting OR a log exists), Daily report, My time card; driller: Rig checklist (opens
the rig picker first; the checklist exists after a rig is picked), Drill log, My time card;
supervisor: all + Time cards (N of M) + Approve; office: read-only. States: Not started
(Start button — no extra sheet; the label is the consent), Started by <name> at <time>
(Open), N of M (2 of 3 shots signed, 14 holes), Ready to file, Filed <time>, Approved. The
first unfinished tile in role order carries "Up next" (Continue still knows the next step).
Office home gains a "Today's jobs" strip: per job with a day today — code badge (DB/DO/DE/
C/H), confirmations count, coverage dots (blast log, daily report, drill log or checklist,
time cards: grey/amber/green/teal); tap → the day's hub read-only.

## Residual risks (accepted, told to Matthew)

- The same card fact changed by two offline phones: last arrival wins, the other sees the
  banner (no per-field merge of one field changed twice).
- Two blasters starting the day's blasting log offline: the second copy is discarded and the
  person is told; what they typed in those minutes is lost. Rare.
- A deleted deterministic-id day can be recreated on the same date; offline children of the
  old one would rejoin the new one. Operator rule until the post-Beta `deleted day ids`
  check: do not delete and restart the same job on the same date.
- Mixed-fleet window: an old build can still make a duplicate day → merge strip, as today.
  Ask everyone to update before S13 goes live.
- Time cards filed before a day exists keep `blastDayId` empty; a backfill in
  `createBlastDay` (draft cards for job+date) is a post-S14 cleanup.

## Harness scenarios S13 must prove (two phones)

1. Both offline, different card values, A syncs first then B: one day; B's values stand on
   both; A shows the banner (server clock); A's blasting log tile still visible.
2. Whole-payload clobber: A edits online, B offline edits one field later; B's delta merges;
   A's field survives.
3. Type-of-work downgrade with a blast log → discarded server-side; tile stays.
4. Two offline Starts on the blasting log → first wins, second told honestly.
5. Gas-leak day: two cards filed, no log, no report, day draft, office strip dots right, no
   File this day, not in "never submitted".
6. Delete with an offline child → child refused and the device told.
7. PATCH resurrection after merge → refused; exactly one blast log.
8. Legacy day opened by the new build → no setup card, tiles show existing documents.
9. Shared tablet: second user still sees the confirm once.

## Sizes

S13 four days (data, card, confirm, presence, merge + guards on the server, the two bug
fixes, honest messages, lazy documents, harness). S14 four days (hub, tiles, up next, file
gate, driller trio unchanged, office strip, records/queues for time-cards-only days,
mismatch tile). Later: equipment on the card if the checklist proves not enough, Connecteam
crew prefill, "closed, nothing to file" for abandoned days, the deleted-day-ids check before
Production.
