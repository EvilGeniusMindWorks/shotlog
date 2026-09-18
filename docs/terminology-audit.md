# Terminology audit — ambiguous-out-of-context vocabulary

Read-only inventory. **Nothing in this document has been changed in the code.**
Produced 2026-09-16 against `main` @ `8af4d83`.

## Why this exists

ShotLog's domain vocabulary — shot, charge, magazine, detonator, primer,
firing time, powder factor — is the correct, regulated language of commercial
blasting. Much of it is also the language of firearms, munitions and offensive
security. That overlap has two costs: automated systems misread the work, and a
new engineer reading `totalPoundsShot` or `withShot` has to guess which of two
domains a given line is in. This inventory separates the terms that are
genuinely imprecise (worth renaming on readability grounds alone) from the ones
that are exactly right and should stay.

## How this was produced

- 623 text files scanned (whole repo minus `node_modules`, `.git`, build output,
  `.playwright-mcp`, and `testing/eval/out` run logs).
- A ~150-term candidate list swept case-insensitively on word boundaries,
  covering blasting/munitions overlap and offensive-security overlap.
- Declaration-level extraction of 141 distinct identifiers containing a
  collision term, plus a separate comment/docstring pass and a file/directory
  name pass.
- Targeted reads of `packages/shared/src/*`, `apps/web/src/db/schema.ts`,
  the timing and diagram modules, the shipped help corpus, fixtures and harnesses.

### Exposure tiers (primary sort)

| Tier | Meaning |
|---|---|
| **Ambient** | `CLAUDE.md`, skill frontmatter. Present in every request regardless of the task. |
| **Surface** | URL routes, sync table names and labels, `@shotlog/shared` barrel exports, shipped help markdown, printed/filed PDF labels. Read by people and systems that never open the source. |
| **Internal** | Implementation inside `apps/web/src`, `apps/server/src`. |
| **Tests** | `testing/`, `*.test.ts`, fixtures and mock data. |

### Collision strength (secondary sort)

- **Strong** — the term's dominant public meaning is the weapons/security one.
- **Moderate** — genuinely bivalent; context usually but not always saves it.
- **Weak** — noticeable only in a list like this one.

### Counts

| | |
|---|---|
| `shot` / `shots` (all forms, whole repo) | 2,926 hits / 209 files |
| `blastDay` / `BlastDay` (source + harnesses) | 1,417 hits / 152 files |
| `blast` (all forms, whole repo) | 2,350 hits / 226 files |
| Distinct identifiers carrying a collision term | 141 |
| Findings below | 34 |
| Terms examined and recommended **unchanged** | 17 (§5) |
| Subject-matter flags (§6) | 6 |

---

# 1. Ambient context

These load on every request. Highest leverage in the audit — fixing §1 costs
four edits to one file.

## A1 — "unlimited **Shots** (not capped at 2)"

1. **File/line** — [CLAUDE.md:52](CLAUDE.md#L52)
2. **As written** — `A Blasting Log has unlimited **Shots** (not capped at 2)`
3. **Our meaning** — a *shot* is one blast event: one pattern of loaded
   boreholes initiated as a unit. The clause records a data-model decision (the
   paper form has two pre-printed slots; the app removes that ceiling).
4. **Out of context** — "unlimited shots, not capped" is the single most
   weapons-adjacent sentence in the repository. The nouns around it (`log`,
   `capped`) do nothing to anchor it to rock.
5. **Alternative** — `A Blasting Log holds any number of **Shots** (blast
   events); the paper form's two-slot limit does not apply.` Naming the referent
   once — "blast events" — costs two words and resolves the whole line.
6. **Exposure** — **Ambient** · Collision: **Strong**

## A2 — Key Domain Concepts has no regulatory anchor

1. **File/line** — [CLAUDE.md:49-57](CLAUDE.md#L49-L57)
2. **As written** — the nine-bullet glossary: Blast Day, Blasting Log, Shots,
   design plan, typical column, Explosive entry, Product Catalog, K factor.
3. **Our meaning** — the app's data model, stated as a quick reference.
4. **Out of context** — read as a block, these nine lines are a dense
   explosives vocabulary with no sentence saying what the software is *for*.
   The framing that does that work sits at line 6 and is not repeated here.
5. **Alternative** — one preface line before the bullets: *"These are the
   fields of the Massachusetts/ATF blasting log and daily report — the legal
   records this app produces."* No bullet needs to change.
6. **Exposure** — **Ambient** · Collision: **Moderate** (cumulative, not per-line)

## A3 — The opening sentence omits the regulatory frame

1. **File/line** — [CLAUDE.md:3](CLAUDE.md#L3)
2. **As written** — `An offline-first Progressive Web App for commercial
   blasting crews to digitize blasting logs and daily reports. … auto-calculates
   industry-standard formulas (Scaled Distance, PPV, K Factor, USBM RI8507/OSM
   compliance), captures seismograph printouts via camera…`
3. **Our meaning** — the product summary.
4. **Out of context** — this line is accurate but describes the *tooling*, not
   the *obligation*. Line 6 ("licensed commercial blasting operations
   application… ATF explosives records, OSHA/MSHA safety, DOT transport…
   legal records") is by far the strongest disambiguator in the repository, and
   it is the second paragraph. Any reader or system that takes only the first
   sentence gets the version without the anchor.
5. **Alternative** — not a rename. Fold one clause of line 6 into line 3:
   *"…for licensed commercial blasting crews to keep the regulatory records
   their operations require — blasting logs and daily reports…"*. Leave line 6
   in place; it is doing its job.
6. **Exposure** — **Ambient** · Collision: **Moderate**

## A4 — "TOP-DOWN" explosive entry, unglossed

1. **File/line** — [CLAUDE.md:54](CLAUDE.md#L54)
2. **As written** — `Explosive entry is **TOP-DOWN**: blaster enters total
   quantity, app calculates weight via multiplier`
3. **Our meaning** — a data-entry direction: the blaster types the count of
   units purchased/used, and the app derives pounds from the catalog's per-unit
   weight. It is an inventory-reconciliation convention.
4. **Out of context** — "top-down explosive entry" reads as a physical loading
   procedure (loading a hole from the collar down) rather than a UI convention.
5. **Alternative** — `Explosive quantities are entered as COUNTS, not weights:
   the blaster types units used and the app derives pounds from the catalog
   multiplier (inventory reconciliation, ATF §555.127).` More precise about what
   the code does, and removes the false procedural reading.
6. **Exposure** — **Ambient** · Collision: **Moderate**

## A5 — Skill descriptions: no action

`.claude/skills/{deploy,harness-new,release-notes,round,verify}/SKILL.md`
frontmatter `description:` fields are also ambient. All five were read. They
contain no domain vocabulary at all ("commit, push, wait until live", "scaffold
the next Playwright harness", "plain-English What's new page"). **Leave them
alone.** Recorded here so the tier is known to be complete.

---

# 2. Surface — routes, sync labels, shared exports, shipped help

## B1 — `BlastDay` names a record that is usually not a blast

1. **File/line** — [apps/web/src/db/schema.ts:306](apps/web/src/db/schema.ts#L306)
   (declaration), [:303](apps/web/src/db/schema.ts#L303) (the standing comment),
   [apps/web/src/App.tsx:137-141](apps/web/src/App.tsx#L137-L141) (URL surface),
   plus 1,417 occurrences across 152 files.
2. **As written** — `BlastDay`, `blastDayId`, `blastDays`, `/blast-day/:id`,
   `useBlastDay.ts`, `BlastDayPage.tsx`, `NewBlastDayDialog.tsx`.
3. **Our meaning** — the per-job **work day**: the parent record for one crew's
   one day at one job. Drill-only, crushing and hauling days all have one; only
   `isBlastingWork()` days additionally carry a blasting log.
4. **Out of context** — "blast day" marks every routine work record —
   a truck's hour meter, a mechanic's repair ticket, a time card — as part of a
   blast. It overstates what most of these records are.
5. **Alternative** — `WorkDay` / `workDayId` / `/work-day/:id`. This is **not
   primarily a collision fix — it is a correctness fix**, and the codebase
   already agrees with itself on the right word in three places: the schema
   comment at :303 says *"the per-job WORK DAY"*, `powersync.ts:87` maps
   `blastDays → 'work day'` for user-facing notices, and the UI, help pages and
   route table all say "Work day". Only the identifiers and the URL still say
   blast.
   **Caveat, and it is a real one:** the comment at :303 says renaming the table
   "would force a data migration for zero benefit." That judgement was made
   before this audit; it is still the expensive option. A middle path that gets
   most of the readability win: rename the *TypeScript* interface and the
   *route* (`WorkDay`, `/work-day/:id`, with a redirect) while leaving the
   PowerSync table id `blastDays` alone, since the sync table name is not read
   by humans and already has a correct label beside it.
6. **Exposure** — **Surface** (URL + sync labels) · Collision: **Strong**

## B2 — `totalPoundsShot`

1. **File/line** — [packages/shared/src/calculations.ts:255](packages/shared/src/calculations.ts#L255);
   exported at [packages/shared/src/index.ts:24](packages/shared/src/index.ts#L24);
   stored at [schema.ts:601](apps/web/src/db/schema.ts#L601)
2. **As written** — `export function totalPoundsShot(products: { quantity: number; weightPerUnit: number }[]): number`
3. **Our meaning** — total pounds of explosive product accounted for on the log:
   `Σ quantity × weightPerUnit`. It is a sum over catalog line items. It is the
   ATF/inventory figure and the denominator input for powder factor.
4. **Out of context** — the grammar invites the wrong parse. "Pounds shot" reads
   as a past participle — pounds *that were shot* — and in a file alongside
   `chargeWeight` and `maxChargeWeight` it lands squarely in munitions register.
5. **Alternative** — `totalExplosiveLbs`. Strictly more accurate about what the
   function does (it sums a product list; nothing in it knows whether anything
   was fired) and it matches the field's own comment, `// auto-sum`.
   A good rename on readability grounds alone.
6. **Exposure** — **Surface** (shared barrel export) · Collision: **Strong**

## B3 — `totalYardsShot`

1. **File/line** — [packages/shared/src/calculations.ts:164](packages/shared/src/calculations.ts#L164);
   exported at [index.ts:15](packages/shared/src/index.ts#L15);
   stored at [schema.ts:496](apps/web/src/db/schema.ts#L496)
2. **As written** — `totalYardsShot(burdenFt, spacingFt, totalDrillFootage)`
3. **Our meaning** — cubic yards of **rock** broken by the shot.
4. **Out of context** — "yards shot" has the same past-participle problem as B2,
   and the word "rock" — the thing actually being measured — appears nowhere in
   the identifier. Its sibling `totalPayYards` (the same rock, down to grade) is
   the clearer of the pair.
5. **Alternative** — `totalRockYards`. Names the material, parallels
   `totalPayYards`, and matches the docstring already on the line above
   (*"Total yards of rock for a shot"*).
6. **Exposure** — **Surface** (shared barrel export) · Collision: **Moderate**

## B4 — `computeFiringTimes` / `firing time`

1. **File/line** — [packages/shared/src/timing.ts:34](packages/shared/src/timing.ts#L34);
   exported at [index.ts:38](packages/shared/src/index.ts#L38);
   re-exported [apps/web/src/lib/shotDiagram.ts:16](apps/web/src/lib/shotDiagram.ts#L16);
   comments at [timing.ts:1-7](packages/shared/src/timing.ts#L1-L7),
   [:31](packages/shared/src/timing.ts#L31), [:52](packages/shared/src/timing.ts#L52),
   [:91](packages/shared/src/timing.ts#L91)
2. **As written** — `computeFiringTimes`, "Firing time of a hole = …",
   "Holes that fire within 8 ms of another hole"
3. **Our meaning** — the millisecond offset at which each hole initiates,
   walked from the start hole through the delay graph. Its only consumer is the
   8 ms window grouping that produces the pounds-per-delay compliance figure
   (30 CFR 816.67), cited in the file.
4. **Out of context** — "firing times" is the most gun-adjacent phrasing
   available for this quantity; the surrounding vocabulary (`wires`, `leadMs`,
   `start`) does not pull it back.
5. **Alternative** — `computeInitiationTimes`, and "initiation time" in the
   prose. *Initiation* is the standard, more precise term of art in blast
   design — a hole initiates, and the delay is measured from initiation — and
   the module header at :1 already calls the whole subject "Initiation timing".
   This makes the file internally consistent, which "firing" currently does not.
6. **Exposure** — **Surface** (shared barrel export) · Collision: **Strong**

## B5 — `TimingWire` / `wires` / `unwire`

1. **File/line** — [packages/shared/src/timing.ts:9](packages/shared/src/timing.ts#L9),
   [:16-22](packages/shared/src/timing.ts#L16-L22); type exported at
   [index.ts:44](packages/shared/src/index.ts#L44);
   [apps/web/src/lib/shotDiagram.ts:18](apps/web/src/lib/shotDiagram.ts#L18);
   [ShotDiagramEditor.tsx:24-25](apps/web/src/components/design/ShotDiagramEditor.tsx#L24-L25),
   [:501](apps/web/src/components/design/ShotDiagramEditor.tsx#L501) ("Lead Wire" button)
2. **As written** — `interface TimingWire { from: number; to: number; leadMs?: number }`,
   `wires: Wire[]`, `{ type: 'unwire'; wire: Wire }`
3. **Our meaning** — one edge in the delay graph. `from`/`to` are grid indices
   and `leadMs` is a delay in milliseconds. It mirrors what the blaster does
   physically (running surface delay lines hole to hole) and what the paper
   form's diagram shows.
4. **Out of context** — "wiring" a numbered grid, with leads and a start point,
   reads as circuit assembly. `unwire` in particular has no software meaning.
5. **Alternative** — `TimingLink` / `links` / `unlink`, or `DelayEdge` / `edges`.
   This is **genuinely more precise about the code**: the structure is a
   directed edge with a weight in a graph that `computeFiringTimes` walks
   breadth-first (`timing.ts:38-47`). It models no physical wire — there is no
   length, gauge, product or downline anywhere in the type. Keep the word
   "wire" in the *user-facing* labels if Mark says it that way; the type name
   does not have to match the button.
6. **Exposure** — **Surface** (shared barrel export) · Collision: **Moderate**

## B6 — "before you fire it" / "firing order" in shipped help

1. **File/line** — [apps/web/help/blaster/design-timing-compliance.md:9](apps/web/help/blaster/design-timing-compliance.md#L9),
   [:13](apps/web/help/blaster/design-timing-compliance.md#L13),
   [:17](apps/web/help/blaster/design-timing-compliance.md#L17)
2. **As written** — *"The design is the wiring diagram: which holes fire when…
   before you fire it."* · *"Tap holes in firing order"* · *"the most charge
   firing within any 8 ms of itself"*
3. **Our meaning** — the initiation sequence of a blast pattern and the
   30 CFR 816.67 pattern check, written for a licensed blaster.
4. **Out of context** — a shipped, indexed HTML page whose opening line is
   "which holes fire when… before you fire it". This is the highest-visibility
   prose in the audit: it renders in the app, it is in the repo as markdown, and
   it has no regulatory framing until line 17.
5. **Alternative** — the page's own §17 already cites *30 CFR 816.67*; move
   that citation up. Opening line: *"The design is the initiation timing plan:
   which holes initiate when, and in what order. The compliance badges measure
   the shot against the USBM and OSM limits before it goes."* Then "initiation
   order" for "firing order". Same information, precise, and it puts the
   regulation in the first paragraph where it belongs.
6. **Exposure** — **Surface** (shipped user-facing doc) · Collision: **Strong**

## B7 — "caps, feet of cord"

1. **File/line** — [apps/web/help/blaster/explosives.md:15](apps/web/help/blaster/explosives.md#L15)
2. **As written** — `Type the **quantity** — cases, boosters, caps, feet of cord.`
3. **Our meaning** — *caps* = detonators (blasting caps); *cord* = detonating
   cord. Both are the crew's everyday shorthand and both are ATF-regulated
   article classes.
4. **Out of context** — bare "caps" is a percussion-cap / ammunition word and
   the only place in the shipped docs where the abbreviation appears without its
   full term nearby.
5. **Alternative** — `cases, boosters, detonators, feet of detonating cord`.
   The app's own field label is already **Detonators**
   ([ExplosiveUsageForm.tsx:263](apps/web/src/components/forms/ExplosiveUsageForm.tsx#L263)),
   so this also makes the help match the screen it describes — a readability
   fix independent of anything else.
6. **Exposure** — **Surface** (shipped user-facing doc) · Collision: **Strong**

## B8 — `cartridgesToClearWater` / `cartridgeLengthInches`

1. **File/line** — [packages/shared/src/calculations.ts:242-248](packages/shared/src/calculations.ts#L242-L248);
   exported at [index.ts:23](packages/shared/src/index.ts#L23)
2. **As written** — `cartridgesToClearWater(finalWaterHeightFt, cartridgeLengthInches)`
3. **Our meaning** — how many packaged sticks of explosive must go into a wet
   borehole before the product column rises above the standing water. *Cartridge*
   is the manufacturers' and ATF's word for a packaged unit of explosive.
4. **Out of context** — "cartridge" is overwhelmingly an ammunition word, and it
   sits next to `chargeWeight` and `poundsPerFoot` in the same file.
5. **Alternative** — **Keep `cartridge`** — see §5.4; it is the regulated term
   and every other candidate ("stick", "unit") is vaguer. The improvable half is
   the *function* name: `cartridgesToClearWater` does not say it returns a
   count. `cartridgeCountAboveWater` is more precise about the return value.
   Low priority.
6. **Exposure** — **Surface** (shared barrel export) · Collision: **Moderate**

## B9 — `ProductCategory` enum values

1. **File/line** — [apps/web/src/db/schema.ts:863-871](apps/web/src/db/schema.ts#L863-L871);
   duplicated at [packages/shared/src/productCatalogSeed.ts:15-23](packages/shared/src/productCatalogSeed.ts#L15-L23)
2. **As written** — `'bulk' | 'anfo' | 'anfo_wr' | 'gel_dynamite' | 'emulsion' | 'booster' | 'booster_electronic' | 'cartridge'`
3. **Our meaning** — the manufacturers' own catalog categories, used to filter
   the product picker and to split the daily report's explosives/boosters
   subtotals.
4. **Out of context** — a typed enumeration of explosive classes.
5. **Alternative** — **none. Leave every value as written.** These are the
   printed catalog's categories; changing them would break the seed's
   deterministic ids (`seed-<slug>`, productCatalogSeed.ts:126) and make the app
   disagree with the invoices it reconciles against. Listed here only so the
   reviewer knows it was considered and rejected. The one improvement available
   is *placement*: the enum is declared twice, and only the copy in
   `productCatalogSeed.ts` carries the provenance comment (:1-13) explaining that
   these are purchased-goods categories. Give `schema.ts:863` a one-line
   cross-reference.
6. **Exposure** — **Surface** (sync payload shape) · Collision: **Moderate**

## B10 — `chargeLbs` on the compliance sheet

1. **File/line** — [apps/web/src/components/records/ComplianceSheet.tsx:24](apps/web/src/components/records/ComplianceSheet.tsx#L24),
   and the four call sites that fill it
   ([ReadinessView.tsx:228](apps/web/src/components/day/ReadinessView.tsx#L228),
   [DesignPlanPage.tsx:355](apps/web/src/pages/DesignPlanPage.tsx#L355),
   [SeismoPage.tsx:249](apps/web/src/pages/SeismoPage.tsx#L249))
2. **As written** — `chargeLbs: number; // max lbs/delay`
3. **Our meaning** — maximum pounds per delay, `W` in the scaled-distance
   formula — every call site passes `designPlan.maxPoundsPerDelay`.
4. **Out of context** — `chargeLbs` reads as the size of an explosive charge.
5. **Alternative** — `maxLbsPerDelay`. This is the clearest case in the audit of
   a rename that is better on pure readability: the field already carries a
   comment correcting its own name, and all four callers assign the correctly
   named `maxPoundsPerDelay` into the wrongly named `chargeLbs`. Delete the
   comment by fixing the name.
6. **Exposure** — **Surface** (feeds the printed/filed compliance record) · Collision: **Moderate**

---

# 3. Internal implementation

## C1 — The `Bomb` icon on the Blast Day tile

1. **File/line** — [apps/web/src/components/dashboard/StartGrid.tsx:13](apps/web/src/components/dashboard/StartGrid.tsx#L13)
   (import), [:41](apps/web/src/components/dashboard/StartGrid.tsx#L41) (use)
2. **As written** — `import { Bomb } from 'lucide-react'` …
   `icon: <IconChip tint="orange"><Bomb className="h-4 w-4" /></IconChip>`
3. **Our meaning** — the launcher tile that starts a work day's blast log and
   daily report.
4. **Out of context** — lucide's `Bomb` glyph is a cartoon spherical bomb with a
   lit fuse. This is not a naming collision that context can rescue: the
   *rendered pixels* in the primary launcher of a regulated-records application
   depict an improvised explosive device. It is also, separately, just a poor
   icon — nothing in a blast day resembles it.
5. **Alternative** — the file already imports `Drill`, `ClipboardList`,
   `ClipboardCheck` and `AlertTriangle` for its sibling tiles. `Mountain`,
   `Layers` (rock benches), `CalendarDays` (it is a *day*) or `Zap` all fit the
   set better. My pick: `CalendarDays`, since the tile creates a day record and
   its sibling tiles are already named for what they produce.
   **Only two lines to change; nothing else in the repo imports `Bomb`.**
6. **Exposure** — **Internal** (renders to every user) · Collision: **Strong**

## C2 — `shot` meaning *screenshot* — an in-repo homograph

1. **File/line** —
   [apps/server/src/feedback.ts:297](apps/server/src/feedback.ts#L297) `withShot`,
   [:301](apps/server/src/feedback.ts#L301) `shotIds`;
   [apps/web/src/lib/feedback.ts:66](apps/web/src/lib/feedback.ts#L66)
   `shotKey = (id) => \`feedback-shot-${id}\``, and :135, :179, :193;
   [apps/web/src/pages/admin/AdminFeedbackPage.tsx:84](apps/web/src/pages/admin/AdminFeedbackPage.tsx#L84)
   `downloadShot`, used at :406 and :429;
   [FeedbackComposer.tsx:121](apps/web/src/components/feedback/FeedbackComposer.tsx#L121)
   `includeShot`;
   [testing/help-shots.mjs:19](testing/help-shots.mjs#L19) `async function shot(P, name, …)`;
   [testing/two-device/harness38.mjs:76](testing/two-device/harness38.mjs#L76) `shotBox`
3. **Our meaning** — **screenshot.** Every one of these is about a PNG of the
   user's screen attached to a feedback report. None of them is about a blast.
4. **Out of context** — worse than a cross-domain collision: this one is
   *internal*. In a repo where `Shot` is a first-class record type with 1,289
   source occurrences, `withShot`, `shotIds` and `downloadShot` read as blast
   records. `shotIds` in particular is the exact name used for real shot ids at
   [PrintBlastLogPage.tsx:53](apps/web/src/pages/PrintBlastLogPage.tsx#L53) and
   [pdfdocs/blastLog.tsx:788](apps/web/src/pdfdocs/blastLog.tsx#L788) — the same
   identifier means two unrelated things in one codebase.
5. **Alternative** — spell it out everywhere: `withScreenshot`,
   `screenshotIds`, `screenshotKey`, `downloadScreenshot`, `includeScreenshot`,
   `captureScreenshot` (already correct at
   [lib/feedback.ts:94](apps/web/src/lib/feedback.ts#L94)), and rename
   `testing/help-shots.mjs` → `testing/help-screenshots.mjs` with its inner
   `shot()` → `capture()`. The codebase already uses the unambiguous spelling in
   the adjacent fields — `hasScreenshot`, `screenshot`, `SCREENSHOT_MAX_WIDTH`
   ([lib/feedback.ts:16](apps/web/src/lib/feedback.ts#L16),
   [:57](apps/web/src/lib/feedback.ts#L57)) — so this is a consistency fix, not
   a new convention. **This is the highest-value internal rename in the audit:
   it is unambiguously a readability win and the collision disappears as a
   side effect.**
6. **Exposure** — **Internal** + **Tests** · Collision: **Strong**

## C3 — "where to park the magazine truck"

1. **File/line** — [apps/web/src/db/schema.ts:159](apps/web/src/db/schema.ts#L159)
2. **As written** — `/** Gate codes, haul road, where to park the magazine truck… */`
   on `Site.accessNotes`
3. **Our meaning** — a *magazine* is an ATF-licensed explosives storage
   structure (27 CFR 555 subpart K); a magazine truck is the day-box vehicle
   that brings product to site. The comment is giving examples of site access
   notes.
4. **Out of context** — the only occurrence of "magazine" in the entire
   repository, with no explosives word anywhere in the sentence. "Where to park
   the magazine truck" is unrecoverable on its own.
5. **Alternative** — `where to park the explosives magazine truck` — three
   characters of context. Or, more precise about the field: the comment is
   documenting *free-text site access notes*, so
   `/** Free-text site access: gate codes, haul road, explosives magazine
   truck parking… */` says what the field holds as well as what goes in it.
6. **Exposure** — **Internal** (comment) · Collision: **Strong**

## C4 — `fireDetail`

1. **File/line** — [apps/web/src/db/schema.ts:329](apps/web/src/db/schema.ts#L329);
   set at [useBlastDay.ts:157](apps/web/src/hooks/useBlastDay.ts#L157);
   fixtures at [harness31.mjs:63](testing/two-device/harness31.mjs#L63), :335 and
   [printfix14.mjs:46](testing/two-device/printfix14.mjs#L46)
2. **As written** — `fireDetail: boolean;` — no comment
3. **Our meaning** — whether a paid **fire-department detail** was on site that
   day (a uniformed FD presence many Massachusetts municipalities require for a
   blasting permit). It is a labor/permit line on the daily report. The related
   `JobContactRole` values at [schema.ts:232-240](apps/web/src/db/schema.ts#L232-L240)
   — `'fire_chief'`, `'detail_dispatch'` — are the giveaway, 170 lines away.
4. **Out of context** — a boolean named `fireDetail` on a record called
   `BlastDay` parses as details about firing. It is the only uncommented field
   in its neighbourhood and there is nothing within 100 lines to correct it.
5. **Alternative** — `fireDepartmentDetail`, or `fdDetailOnSite`. **This is a
   genuine precision fix with or without the collision:** as written, a new
   engineer cannot tell what the boolean means, which is exactly the problem
   this audit is about. Alternatively, keep the name and add
   `/** A paid fire-department detail was on site (town permit condition) */`.
   The comment is the cheaper fix; the rename is the better one.
6. **Exposure** — **Internal** · Collision: **Strong**

## C5 — `detCount` / `dets`

1. **File/line** — [apps/web/src/components/forms/ExplosiveUsageForm.tsx:79](apps/web/src/components/forms/ExplosiveUsageForm.tsx#L79)
   `detCount`, used at :151 and :153;
   [:237](apps/web/src/components/forms/ExplosiveUsageForm.tsx#L237) `const dets = explosiveUsage.detonators`
2. **As written** — `const detCount = explosiveUsage.detonators.reduce(…)`,
   `const dets = …`
3. **Our meaning** — count of detonators on the log; the list of detonator rows.
4. **Out of context** — `det` is not a word. It is read as an abbreviation for
   *detonation* or *detonator* and, standing alone, carries the ambiguity
   without carrying any of the regulatory context that the full word does.
5. **Alternative** — `detonatorCount` and `detonators`. The file's own sibling
   code already spells it out — `DetonatorsCard` (:226), `addDetonator` (:247),
   `title="Detonators & Lead"` (:263) — and
   [PrintDailyReportPage.tsx:109](apps/web/src/pages/PrintDailyReportPage.tsx#L109)
   already has `detonatorCount` for the identical quantity. This is a
   consistency fix; the abbreviation is the outlier.
6. **Exposure** — **Internal** · Collision: **Moderate**

## C6 — `distribution.ts` / "TOP-DOWN EXPLOSIVE DISTRIBUTION"

1. **File/line** — [packages/shared/src/distribution.ts:1-12](packages/shared/src/distribution.ts#L1-L12)
   (header), `distributeByHoles` exported at
   [index.ts:33](packages/shared/src/index.ts#L33); the file name itself
2. **As written** — module header `TOP-DOWN EXPLOSIVE DISTRIBUTION`;
   `distribution.ts`; `DistributionResult`; `distributeByHoles`
3. **Our meaning** — apportioning one product total across the day's shots in
   proportion to each shot's hole count, so the log shows per-shot quantities.
   Pure arithmetic (largest-remainder method, :28-30).
4. **Out of context** — "explosive distribution" is the phrase for *supplying*
   explosives. A module named `distribution.ts` whose header is "TOP-DOWN
   EXPLOSIVE DISTRIBUTION" reads as logistics, not as a rounding algorithm.
5. **Alternative** — `explosiveAllocation.ts`, `AllocationResult`,
   `allocateByHoles`, header `PER-SHOT EXPLOSIVE QUANTITY ALLOCATION`. The
   result type's own field is *already* called `allocations`
   ([:21](packages/shared/src/distribution.ts#L21)) — the module is named for a
   concept it does not use internally. Renaming to match the field is more
   precise about what the code does.
6. **Exposure** — **Internal** (+ shared export) · Collision: **Moderate**

## C7 — `ShotHazardRail`

1. **File/line** — [apps/web/src/components/forms/ShotHazardRail.tsx:8](apps/web/src/components/forms/ShotHazardRail.tsx#L8),
   file name, and the header comment at
   [:1-2](apps/web/src/components/forms/ShotHazardRail.tsx#L1-L2)
2. **As written** — `export function ShotHazardRail({ shot }: { shot: Shot })`;
   *"The hazard rail … while loading, the drill's findings stay one glance away"*
3. **Our meaning** — a strip of chips showing the ground conditions the drillers
   logged (water, voids, seams) for each hole in this shot, so the blaster can
   see them while making loading decisions.
4. **Out of context** — `ShotHazardRail` stacks three collision-prone words and
   the component's docstring pairs "hazard" with "while loading". "Rail" adds
   nothing — it is a layout metaphor that does not describe the content.
5. **Alternative** — `DrillFindingsStrip` or `HoleConditionsStrip`. Genuinely
   more precise: the component renders `HoleCondition[]` ([schema.ts:915](apps/web/src/db/schema.ts#L915)),
   which is exactly "what the drillers found in each hole" — the word *hazard*
   is the app's interpretation layered on top, and *shot* is just the scope. The
   rename says what it shows.
6. **Exposure** — **Internal** · Collision: **Moderate**

## C8 — `lastFire`

1. **File/line** — [apps/web/src/components/design/ShotDiagramEditor.tsx:100](apps/web/src/components/design/ShotDiagramEditor.tsx#L100)
2. **As written** — `const lastFire = Math.max(0, ...times.values());`
3. **Our meaning** — the largest initiation offset in the pattern, in
   milliseconds — i.e. how long the whole shot takes from first to last hole.
4. **Out of context** — a variable literally named `lastFire`.
5. **Alternative** — `lastInitiationMs` or `totalDurationMs`. Also fixes a real
   readability gap: the name does not say it is milliseconds, and the value is
   a *duration*, which `lastFire` does not convey. See B4 — same treatment.
6. **Exposure** — **Internal** · Collision: **Moderate**

## C9 — `leadLine: number`

1. **File/line** — [apps/web/src/db/schema.ts:603](apps/web/src/db/schema.ts#L603)
2. **As written** — `leadLine: number; // LF`
3. **Our meaning** — linear feet of lead-in line (the firing line from the
   blasting machine to the pattern) used that day — a consumable quantity on the
   ATF usage record.
4. **Out of context** — `leadLine` with a bare number reads as almost anything;
   the unit is only in a two-letter comment. Combined with the neighbouring
   `detonators` array it reads as initiation-system assembly.
5. **Alternative** — `leadInLineFt`. Puts the unit in the name (the comment `// LF`
   is doing work a name should do) and matches the app's own UI label,
   "**Lead In Line**" ([help/blaster/explosives.md:23](apps/web/help/blaster/explosives.md#L23)).
6. **Exposure** — **Internal** · Collision: **Weak** · Readability: **Moderate**

## C10 — `Powder truck` fixture description

1. **File/line** — [apps/server/src/rehearsalFixture.ts:156](apps/server/src/rehearsalFixture.ts#L156)
2. **As written** — `description: 'Powder truck', category: 'pickup'`
3. **Our meaning** — the crew's name for the vehicle that carries explosives to
   the shot. Standard yard vocabulary.
4. **Out of context** — "powder truck" in a fixture, with no other explosives
   word in the object.
5. **Alternative** — `'Explosives truck'` or `'Magazine truck'`. Low stakes —
   it is one demo row — but it costs nothing and the demo data is what a new
   engineer sees first when they boot the rehearsal company.
6. **Exposure** — **Internal** (seeded demo data) · Collision: **Moderate**

## C11 — `errorSpy` / "the error spy"

1. **File/line** — [testing/two-device/lib.mjs:92](testing/two-device/lib.mjs#L92)
   `attachErrorSpy`, [:102](testing/two-device/lib.mjs#L102), [:126](testing/two-device/lib.mjs#L126);
   section titles in harnesses 78, 79, 80 (e.g.
   [harness80.mjs:242](testing/two-device/harness80.mjs#L242));
   [testing/README.md:115](testing/README.md#L115)
2. **As written** — `function attachErrorSpy(p)`, *"the error spy saw nothing
   during this run"*
3. **Our meaning** — a console listener that collects browser errors so a
   harness can assert none occurred.
4. **Out of context** — "spy" is standard test-double vocabulary (sinon,
   jest.spyOn), so this is defensible. In a repo already dense with
   security-adjacent words it adds to the pile without earning much.
5. **Alternative** — `attachErrorCollector` / "the error collector saw nothing".
   Marginally more precise — it *collects*, it does not intercept or stub, which
   is what a spy usually implies in test vocabulary. Low priority; reasonable to
   leave.
6. **Exposure** — **Tests** · Collision: **Weak**

---

# 4. Tests, fixtures and mock data

## D1 — `testing/eval/assets/shot.webm` and `face.jpg`

1. **File/line** — `testing/eval/assets/shot.webm`, `testing/eval/assets/face.jpg`;
   referenced at [testing/eval/setup.mjs:133](testing/eval/setup.mjs#L133)
2. **As written** — `for (const [k, file] of [['face', 'face.jpg'], ['printout', 'printout.jpg'], ['video', 'shot.webm']])`
3. **Our meaning** — a two-second video of a blast, and a photo of the rock
   **face** (the exposed vertical rock wall the shot breaks to). Both are
   attachment fixtures for the persona evaluation.
4. **Out of context** — a directory containing `face.jpg` and `shot.webm` side
   by side is the worst filename pairing in the repository. Neither name carries
   any domain signal, and `face.jpg` in a test-assets folder reads as a
   photograph of a person. The word *face* is doing real domain work here
   (cf. `faceHeight`, [schema.ts:939](apps/web/src/db/schema.ts#L939)) and
   nothing in the filename says so.
5. **Alternative** — `rock-face.jpg`, `blast-video.webm`, `seismograph-printout.jpg`.
   Better names on their own merits: `printout.jpg` is equally uninformative
   about which of the app's several printouts it is. One-line change at
   setup.mjs:133 plus three `git mv`s.
6. **Exposure** — **Tests** · Collision: **Strong**

## D2 — `testing/help-shots.mjs`

Covered under **C2** — the file name and its inner `shot()` function both mean
*screenshot*. Rename to `testing/help-screenshots.mjs`; the script is referenced
only by its own header comment (:5-6) and is not wired into `testing/run.mjs` or
the pre-push hook, so the rename is free.

Exposure: **Tests** · Collision: **Strong**

## D3 — `ARMS` / `runArm` / `armRule`

1. **File/line** — [testing/eval/run.mjs:22](testing/eval/run.mjs#L22) `ARMS`,
   [:113](testing/eval/run.mjs#L113) `runArm`;
   [testing/eval/briefs.mjs:21](testing/eval/briefs.mjs#L21) `armRule`;
   [testing/eval/setup.mjs:23](testing/eval/setup.mjs#L23)
2. **As written** — `const ARMS = String(args.arms ?? 'A,B').split(',')`;
   `` `**Your arm: A — with the guide.**` ``
3. **Our meaning** — the two conditions of the A/B persona evaluation (with and
   without the help guide). Standard experimental-design vocabulary.
4. **Out of context** — "arm" / "arming" is device-activation vocabulary, and
   `ARMS` in all-caps is the plural noun. In `testing/eval/` — surrounded by
   `shot.webm` (D1) — it reads worse than it is.
5. **Alternative** — `GROUPS` / `runGroup` / `groupRule`, or `CONDITIONS` /
   `runCondition`. *Condition* is the more precise research term for what these
   are (the guide is the manipulated variable), so this is a small genuine win.
   Low priority — the surrounding prose ("Your arm: A — with the guide") makes
   the meaning plain at every occurrence.
6. **Exposure** — **Tests** · Collision: **Weak**

## D4 — `load-test.yml` / `loadtest.mjs`

1. **File/line** — `.github/workflows/load-test.yml`, `testing/load/loadtest.mjs`
   (header at [:1-16](testing/load/loadtest.mjs#L1-L16)), directory `testing/load/`
2. **As written** — "ShotLog load / soak test", `Load test <stamp>` as the
   throwaway company name
3. **Our meaning** — a sync throughput and latency test.
4. **Out of context** — "load" is universal software vocabulary *and* the
   domain's verb for putting explosives in a hole (`ShotHazardRail`'s "while
   loading", `powderFactorAssessment`'s "verify loading design",
   `hazardQuestion`'s "load through it or adjust?"). Within this repo the word
   genuinely carries two meanings.
5. **Alternative** — `sync-load-test.mjs` / `testing/sync-load/`. Disambiguates
   *inside the repo*, which is the readability half of the problem; the software
   sense of "load test" is too established to abandon entirely. Low priority.
6. **Exposure** — **Tests** · Collision: **Weak**

## D5 — `testing/probe/probe.mjs`, `uptime-probe.yml`, `CrashProbe`

1. **File/line** — `testing/probe/probe.mjs` ([:16](testing/probe/probe.mjs#L16) `PROBE`),
   `.github/workflows/uptime-probe.yml`,
   [apps/web/src/components/layout/AppShell.tsx:47](apps/web/src/components/layout/AppShell.tsx#L47) `CrashProbe`,
   [apps/web/src/db/powersync/client.ts:342](apps/web/src/db/powersync/client.ts#L342) `shotlog-opfs-probe`
2. **Our meaning** — uptime and capability checks.
3. **Out of context** — "probe" is reconnaissance vocabulary, but it is also
   completely standard SRE/monitoring vocabulary (Kubernetes liveness probes,
   feature probes).
4. **Alternative** — **none. Leave as written.** `uptime-probe` and
   `CrashProbe` are the clearest available names for what they do; "healthcheck"
   would be less accurate for the multi-step sign-in-and-sync check that
   `probe.mjs` actually performs (its header, :1-5, lists six steps). Recorded
   as considered-and-rejected.
5. **Exposure** — **Tests** / **Internal** · Collision: **Weak**

## D6 — Fixture detonator names

1. **File/line** — [apps/server/src/rehearsalFixture.ts:286](apps/server/src/rehearsalFixture.ts#L286)
   `'Electronic detonator', unitLength: '40 ft'`;
   [testing/two-device/harness23.mjs:65](testing/two-device/harness23.mjs#L65)
   `'NONEL MS', unitLength: '16ft'`
2. **Our meaning** — realistic demo rows for the detonator table. "NONEL" is a
   Dyno Nobel trademark for shock-tube initiation systems; "MS" is millisecond.
3. **Out of context** — a hardcoded product name for an initiation system in a
   test fixture.
4. **Alternative** — none needed for `'Electronic detonator'`, which is a
   generic class name. For `'NONEL MS'`, the generic `'Shock tube MS'` or
   `'Detonator MS-16'` would be marginally better and avoids embedding a
   trademark in test data — a minor licensing tidiness win, consistent with the
   provenance note already in `productCatalogSeed.ts:1-13`.
5. **Exposure** — **Tests** · Collision: **Weak**

---

# 5. Terms examined and recommended UNCHANGED

These came up in the sweep and are the clearest available description of what
they name. Renaming any of them would make the code **less** accurate. Listed so
the decision is on the record and nobody re-audits them.

| Term | Where | Why it stays |
|---|---|---|
| **1. `Shot` / `shots`** (the record type) | [schema.ts:517](apps/web/src/db/schema.ts#L517), ~1,289 source occurrences | The industry's word, the crew's word, and the word printed on the Massachusetts blasting log. Any substitute ("blast event", "round") would be a private dialect that matches neither the paper nor Mark. Fix the *screenshot* misuse (C2) instead — that is what makes `shot` ambiguous in this repo. |
| **2. `chargeWeight`, `maxChargeWeight`, `maxPoundsPerDelay`** | [calculations.ts:52](packages/shared/src/calculations.ts#L52), [:215](packages/shared/src/calculations.ts#L215), [schema.ts:511](apps/web/src/db/schema.ts#L511) | "Charge weight per delay" is the literal regulatory quantity named in USBM RI 8507 and 30 CFR 816.67. The formulas reference it by that name. Renaming would break the correspondence with the standards the app certifies against. |
| **3. `powderFactor` / `powderFactorAssessment`** | [calculations.ts:180](packages/shared/src/calculations.ts#L180), [:186](packages/shared/src/calculations.ts#L186) | Powder factor (lb/yd³) is *the* standard blast-design efficiency metric, printed on the log and on every industry reference. "Explosive-to-rock ratio" would be a neologism. Keep. |
| **4. `cartridge`, `stick`, `bag`, `each`** (unit types) | [schema.ts:584](apps/web/src/db/schema.ts#L584), [:1117](apps/web/src/db/schema.ts#L1117), catalog seed | These are the purchase units on the manufacturers' invoices and the ATF usage record. The app reconciles against those documents; the words must match them. |
| **5. `detonator` / `detonators`** | [schema.ts:590](apps/web/src/db/schema.ts#L590), [:602](apps/web/src/db/schema.ts#L602) | The precise regulated term (27 CFR 555.11). "Initiator" is vaguer and "cap" is the ambiguous one. Keep the full word; kill the `det` abbreviation (C5). |
| **6. `booster`, `stemming`, `air_deck`, `subdrill`** (`ColumnLayer.layerType`) | [schema.ts:616](apps/web/src/db/schema.ts#L616) | The five labelled bands on the paper blasting log's Typical Column field. These are form-field values, not invented names. |
| **7. `burden`, `spacing`, `subDrill`, `stemming`, `faceHeight`, `collar`, `toe`, `kick`** | [schema.ts:478-487](apps/web/src/db/schema.ts#L478-L487), [drillGeometry.ts](packages/shared/src/drillGeometry.ts) | Pattern geometry. Unambiguous inside the domain, well-glossed in `ReferencePage.tsx:54-62`, and each has a single precise meaning. `kick` is nicely documented at drillGeometry.ts:1-6. |
| **8. `triggerTimestamp`, `Trigger Level`, `Trigger Source`** | [schema.ts:561](apps/web/src/db/schema.ts#L561), [instantel.ts:6-8](packages/shared/src/instantel.ts#L6-L8) | These are **Instantel's own field names**, parsed verbatim off the seismograph printout. Renaming would decouple the parser from the document it parses. |
| **9. `DELAY_WINDOW_MS`, `delayWindowGroups`, `crowdedHoles`, `maxHolesPerWindow`** | [timing.ts:28](packages/shared/src/timing.ts#L28), [:76](packages/shared/src/timing.ts#L76), [:92](packages/shared/src/timing.ts#L92), [:99](packages/shared/src/timing.ts#L99) | Precise, self-explanatory, and each carries its 30 CFR 816.67 citation in the adjacent docstring. `crowdedHoles` in particular is a better name than anything the standard offers. |
| **10. `blastPin`, `ringFt`, `clampRing`** | [siteDiagram.ts:18-23](apps/web/src/lib/siteDiagram.ts#L18-L23) | Map geometry; the comment at :21-23 already states it is not a regulatory number. Clear. |
| **11. `payload`** (~443 hits) | server + sync layer throughout | Means HTTP/sync body. Universal web vocabulary with no domain meaning here at all. No action. |
| **12. `target`** in `targetSD`, `targetDate` | [calculations.ts:52](packages/shared/src/calculations.ts#L52), [schema.ts:194](apps/web/src/db/schema.ts#L194) | "Target scaled distance" = the SD you design to. Standard and unambiguous in context. |
| **13. `isBlastingWork`, `WorkType`, `blast_mats`, `blastMatCount`** | [schema.ts:287-298](apps/web/src/db/schema.ts#L287-L298), [:486](apps/web/src/db/schema.ts#L486) | Blast mats are the physical rubber-and-cable mats laid over a shot to stop flyrock — a *safety* control. Precise as named. |
| **14. Capability keys** (`author_blast_records`, `accept_drill_patterns`, `file_office_copies`, …) | [capabilities.ts:278-311](packages/shared/src/capabilities.ts#L278-L311) | Verb-first, action-precise, no collisions. A model for the rest of the codebase. |
| **15. Server routes** (`/records`, `/catalog`, `/manufacturers`, `/presign-upload`, …) | `apps/server/src/*.ts` | Entirely clean — no domain vocabulary on the HTTP surface at all. |
| **16. `incident`, `IncidentType: 'blasting' \| 'utility' \| 'asset'`, `utility strike`, `digsafeNumber`** | [schema.ts:1041-1044](apps/web/src/db/schema.ts#L1041-L1044) | Damage-claim and Dig Safe vocabulary; "strike" here means a utility strike, the regulated term. Clear. |
| **17. `Archivable`, `Tombstone`, `Submission`, `write-once`** | [schema.ts:51](apps/web/src/db/schema.ts#L51), [:855](apps/web/src/db/schema.ts#L855), [:1192](apps/web/src/db/schema.ts#L1192) | Records-lifecycle vocabulary. Precise and already well documented. |

---

# 6. SEPARATE CATEGORY — subject matter, not naming

Code whose *content* is about energetic materials or the physical conduct of a
blast, rather than about software and business logic around a regulated
operation. Renaming does not change how these read; they are listed so you can
decide about them on their own terms.

**Headline finding first, because it bounds the whole category:** a targeted
search for energetic-materials chemistry across all source, help and docs —
`ammonium nitrate`, `nitroglycerin`, `nitromethane`, `oxidizer`, `fuel oil`,
`sensitiz*`, `cap-sensitive`, `detonation velocity`, `VOD`, `brisance`,
`relative effectiveness`, `deflagrat*`, `formulat*`, `prill`, `water gel` —
returned **exactly one hit in the entire repository**, and it is not in code:
`REQUIREMENTS.md:652`, a product-catalog field describing purchased goods
(`form | string (Prilled, Pumpable, Cast, etc.)`), which was never implemented
(the shipped `ProductCatalogItem`, schema.ts:1109-1122, has no `form` field).

**There is no formulation chemistry, no composition data, no energetic
properties, no device construction and no initiation-system assembly anywhere in
this repository.** The six items below are the closest it comes, and each is
either a field on a regulated form or an input to a compliance calculation. That
is a strong finding and worth stating plainly in any conversation about how this
code reads.

### S1 — `productCatalogSeed.ts` — 59 named commercial explosive products

[packages/shared/src/productCatalogSeed.ts:33-100](packages/shared/src/productCatalogSeed.ts#L33-L100)

A hardcoded table of branded products from four manufacturers — dynamite, ANFO,
emulsions, cast boosters — with diameters, lengths and per-unit weights.

**What it is:** an inventory conversion table. The only numeric column is
`weightMultiplier` (pounds per stick/bag/each), used to turn "19 sticks" into
"49.9985 lb" for the ATF usage record. It carries no density, no detonation
velocity, no energy, no composition — nothing that describes the material,
only what a unit of it weighs. Provenance is already documented at :1-13
(typed from the manufacturers' printed catalogs; flagged for legal review).

**Assessment:** a procurement/inventory reference. Nothing to change. If you
ever want the framing tighter, the header comment could open with *"Unit-weight
conversion table for inventory reconciliation"* rather than "Product catalog
seed" — it is the most accurate one-line description of the file.

### S2 — `timing.ts` + `shotDiagram.ts` — the initiation timing model

[packages/shared/src/timing.ts:1-101](packages/shared/src/timing.ts#L1-L101),
[apps/web/src/lib/shotDiagram.ts:1-16](apps/web/src/lib/shotDiagram.ts#L1-L16),
[ShotDiagramEditor.tsx:64-66](apps/web/src/components/design/ShotDiagramEditor.tsx#L64-L66)

Models a blast pattern's initiation sequence as a tree — a start hole with a
lead delay, then edges hole to hole, each adding a delay — and walks it to get
per-hole times.

**What it is:** the input to one compliance number. The *only* consumers of
`computeFiringTimes` are `delayWindowSizes`, `delayWindowGroups`, `crowdedHoles`
and `maxHolesPerWindow`, which group holes into 8 ms windows to compute
pounds-per-delay under 30 CFR 816.67 — cited in the code at timing.ts:26-28 and
:74. The regulation is what makes the model necessary.

**Assessment:** this is the item in the repository whose subject matter is
closest to "how a blast is put together", and it is unavoidable — you cannot
compute the regulated quantity without modelling the delay sequence. Two things
already mitigate it and one is missing:
- ✅ the CFR citation is in the file (:74) and in the help page (:17);
- ✅ `DELAY_SERIES = [9, 17, 24, 42, 65]` (shotDiagram.ts:60) are catalog delay
  periods, not designed intervals;
- ❌ the module header at timing.ts:1-7 explains the *mechanism* before it
  explains the *purpose*. Leading with "This module computes the maximum charge
  weight initiating within any 8 ms window, the quantity 30 CFR 816.67 limits"
  and putting the tree walk second would put the regulatory frame first without
  changing a line of logic. **Recommended.**

### S3 — `TypicalColumnBuilder.tsx` — the loaded-column layout editor

[apps/web/src/components/design/TypicalColumnBuilder.tsx:12-42](apps/web/src/components/design/TypicalColumnBuilder.tsx#L12-L42),
[:233](apps/web/src/components/design/TypicalColumnBuilder.tsx#L233),
[:251](apps/web/src/components/design/TypicalColumnBuilder.tsx#L251)

A UI for stacking layers in a borehole — booster, explosive, stemming, air deck,
sub drill — bottom-up from the toe, with a `NEXT_LAYER` map that suggests the
conventional order.

**What it is:** a **form field**. "Typical Column" is a pre-printed box on the
Baystate blasting log (`example-blasting-log.html`) and on the state form; the
blaster draws the same diagram on paper today. The app draws it instead. Nothing
is computed from it, nothing is validated, no quantity is derived — it is
recorded and printed.

**Assessment:** the strongest-reading component in the repo for this category,
and also one of the best-justified. The `NEXT_LAYER` suggestion map (:39-42) is
the only part that goes beyond transcription, and it exists because Matthew
asked for bottom-up entry (S18, noted at :28-30). Worth knowing about; nothing
to change. If you want the provenance visible where the code is, add one line to
the header: *"Transcribes the Typical Column box on the paper blasting log —
recorded and printed, never computed from."*

### S4 — `hazardQuestion()` — adverse-ground loading prompts

[apps/web/src/components/day/ReadinessView.tsx:22-32](apps/web/src/components/day/ReadinessView.tsx#L22-L32)

Turns each logged hole condition into a question: `wet-hole product below N ft?`,
`deck through the void?`, `seams N–M ft — stemming plan?`, `load through it or
adjust?`.

**What it is:** prompts, deliberately not answers. The file header at :2-3 states
the design rule: *"hazards phrased as QUESTIONS (the decision logic stays in the
blaster's head)"*. The app never recommends a loading approach.

**Assessment:** correct as designed, and the header comment is doing exactly the
right work. No change.

### S5 — Wet-hole loading math

[packages/shared/src/calculations.ts:223-248](packages/shared/src/calculations.ts#L223-L248)
(`finalWaterHeight`, `cartridgesToClearWater`),
[:194-221](packages/shared/src/calculations.ts#L194-L221) (`poundsPerFoot`,
`kilogramsPerMeter`, `chargeWeight`)

Displacement geometry for loading a wet hole, and linear loading density.

**What it is:** published handbook formulas, attributed in the section headers
to *DynoNobel pages 9-10 / 11 / 13* — an openly distributed field reference.
`poundsPerFoot` is a cylinder-volume-times-density calculation; the "explosive"
part is only which density you supply.

**Assessment:** reference-book arithmetic with its source cited in the code. No
change. Note that the attributions (":195", ":224", ":283") are the reason this
reads correctly — keep them if these functions ever move.

### S6 — `PreBlastCard` default checklist

[apps/web/src/components/day/PreBlastCard.tsx:8-14](apps/web/src/components/day/PreBlastCard.tsx#L8-L14)

`Notifications made (FD / abutters per site rules)` · `Pre-blast surveys current
for structures in range` · `Blast area guarded · access controlled` ·
`Warning signals sounded`

**What it is:** the four mandated pre-blast safety steps (527 CMR 13 / 30 CFR
816.66). The header at :1-3 says it is a display-only placeholder — nothing is
recorded or enforced.

**Assessment:** safety-compliance content, which is the opposite of the concern.
No change. Arguably it should eventually *be* recorded, but that is a product
question for Matthew, not a terminology one.

---

# 7. Not a terminology finding — placement

Four large HTML files sit at the repository root and are git-tracked:
`prototype.html` (228 KB), `example-blast-report.html` (66 KB),
`example-blasting-log.html` (31 KB), `example-daily-report.html` (23 KB).

They are the original design prototype and replicas of the paper forms, still
referenced as the visual source of truth by `PrintBlastLogPage.tsx`,
`print-blast-log.css` and `PrintDailyReportPage.tsx`. Their content is
appropriate — blank form templates. But they are the first four files a reader
sees in a root listing, ahead of `apps/` and `packages/`, and nothing at that
level says they are reference documents rather than the application.

Suggestion (not a rename): move them to `docs/reference-forms/` with a short
`README.md` stating that they are replicas of the regulated paper forms this app
reproduces, kept for print-layout fidelity. Update the three source references.
Purely organisational.

---

# 8. Suggested order of work

Not a plan — a ranking, for when you decide what (if anything) to move.

**Highest value for the least change**

1. **A1–A4** — four edits to `CLAUDE.md`. Ambient tier, present in every request.
2. **C1** — the `Bomb` icon. Two lines, and it is the one finding where the
   problem is visible to every user rather than only to readers of the source.
3. **C3** — three words in one comment (`magazine truck`).
4. **C2** — the `shot`-means-screenshot rename. Larger (≈12 identifiers across
   6 files) but it is a pure readability win and the repo already uses the
   correct spelling in the adjacent fields.

**Worth doing, more surface area**

5. **B6, B7** — two shipped help pages; move the CFR citation up, spell out
   "caps".
6. **C4, C5, C10** — `fireDetail`, `detCount`/`dets`, `Powder truck`.
7. **B2, B3, B10** — `totalPoundsShot` → `totalExplosiveLbs`,
   `totalYardsShot` → `totalRockYards`, `chargeLbs` → `maxLbsPerDelay`. Shared
   exports, so each touches both apps.
8. **D1, D2** — fixture and script renames.

**Bigger decisions, yours to make**

9. **B4, B5, C6** — `computeFiringTimes` → `computeInitiationTimes`,
   `TimingWire` → `TimingLink`, `distribution.ts` → `explosiveAllocation.ts`.
   All three are genuine precision improvements; all three touch the shared
   package's public barrel.
10. **B1** — `BlastDay` → `WorkDay`. The largest (1,417 occurrences, 152 files)
    and the one with a standing counter-argument in the code at
    `schema.ts:303`. Correctness argument is strong; migration cost is real.
    The interface-and-route-only variant described in B1 is the cheap 80%.
11. **S2** — reordering the `timing.ts` header to lead with the regulation.
    One comment block; the highest-value item in §6.

---

*End of inventory. No code was modified.*
