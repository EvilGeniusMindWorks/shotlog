# Record Lifecycle: Archive & Delete (APPROVED — Matthew, 2026-08-17)

Matthew, 2026-08-17: *"we have no mechanism for deleting existing records…
This absolutely needs a consistent UI/UX pattern and it should be
intuitive. The deletes should be logical — to preserve a full record of
all activity."*

## Current state (why this is needed)

- The permission matrix already defines DELETE rights per table, and sync
  tombstones + the audit trail exist — the PLUMBING is there.
- But almost nothing in the UI offers it: no way to archive a job, site,
  customer, drill log, or blast log from their screens. The one lifecycle
  mechanism (`isActive`) is inconsistent and things never leave lists.

## The pattern: two verbs, one shape

### Archive — the everyday verb (logical, reversible, everywhere)

For records that HAPPENED but are done or irrelevant: finished jobs, former
customers, retired sites, old plans.

- Sets `archivedAt` + `archivedBy` on the record. **Nothing is destroyed.**
- Archived records leave default lists and pickers; every list gets an
  "Archived" filter where they remain fully viewable.
- Restorable by anyone holding the same capability, one tap.
- Writes an audit entry (who, when).
- History stays intact everywhere: an archived job's filed PDFs, work
  days, and rollups are untouched.

### Delete — the created-in-error verb (rare, guarded, still logical)

For records that should never have existed: duplicate day, test entry,
mis-tap.

- Only while the record is UNFILED (draft, nothing submitted from it).
- Cascades to owned children (a removed day takes its log/report/entries).
- Server keeps the tombstone AND the full audit diff history — "a full
  record of all activity" survives; the record just stops existing in the app.
- Never available for filed submissions (write-once stands) or anything a
  filed document references.

## One UI shape everywhere

- **Record pages**: an overflow menu (⋯) in the RecordShell header →
  "Archive…" (and "Remove…" only when eligible).
- **List rows**: same ⋯ via the row's overflow/long-press.
- Both open a **consequence sheet** that says exactly what happens in
  plain words: *"Archive Ledgeville Quarry? It disappears from lists and
  pickers. Its 29 work days and 14 filed documents are untouched. Restore
  it anytime from Archived."* Archive confirms with a normal button;
  Remove is red and repeats the record's name.
- After archiving: an **Undo toast** (10s) before it settles.
- Every list's filter row gains `Active / Archived / All`.

## Per-entity semantics

| Entity | Archive | Delete (draft-only) | Notes |
|---|---|---|---|
| Customer | yes — hides it + its sites/jobs from pickers; children NOT auto-archived | only if no jobs ever | warn listing live children first |
| Site | yes — same | only if no jobs ever | |
| Job | yes — leaves Jobs default list; history/rollups intact | only if no work days | replaces today's bare `isActive` in the UI |
| Work day | — (days are history, not clutter) | yes, cascades children | remove = "this day never happened" |
| Blast log / daily report / drill log | — | via their day, or individually while draft | accepted/filed = never |
| Drill plan | yes (plans complete → archive) | yes if no logs against it | |
| Equipment | retired ≈ archived already — unify wording | only if no history | |
| Person | deactivate ≈ archived already — unify wording | only if no history | |
| Filed submission | never | never | write-once is the point |

## Permissions

Archive/restore rides the existing DELETE grant per table (so
`delete_field_records`, `manage_jobs`, etc. — already in the roles
engine). Remove requires the same grant AND the draft-only conditions;
consider admin-only for hierarchy records (customer/site/job).

## Resolved (Matthew, 2026-08-17)

- **Hierarchy records (customer/site/job): Delete only if NEVER used** — zero
  children/activity ever (typo'd duplicate). Anything that ever had a child
  is archive-only.
- **No extra ATF retention lock** — standard rules suffice: filed submissions
  immutable, Delete is draft-only, and even Deleted records keep their full
  audit diff history server-side forever.
- **Button wording: Archive / Delete** — Delete is the word the crew knows;
  the red consequence sheet carries the explanation.
