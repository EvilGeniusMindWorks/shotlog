# Decision Log

Product decisions that are settled. Don't re-litigate without new
information; amend with a dated entry when one changes.

| Date | Decision | Why |
|---|---|---|
| 2026-07 | Offline-first PWA; PowerSync single `records` table; server enforces ALL permissions at the sync choke point | Field has no signal; one enforcement point beats scattered checks |
| 2026-07 | Explosive entry is TOP-DOWN (totals → weight via multiplier) | Matches how blasters actually count product |
| 2026-07 | Filed office copies are WRITE-ONCE; corrections are new versions | Regulatory record integrity; ATF story |
| 2026-07-29 | Fresh work days start with ZERO crew/equipment rows; Copy-from-previous carries them | Matthew: auto-populate created phantom labor entries |
| 2026-07-29 | Users + Crew = one People list; a login is a property of a person; ONE role, ONE deactivate | Matthew: no duplicate lists |
| 2026-07-29 | Drill plans are standalone under the JOB, drilled over multiple days by multiple drillers, imported into the blast report with coverage verification | Mark's actual workflow |
| 2026-08-16 | K factor lives on the SITE (ground truth); jobs inherit; shots can override | The ground doesn't change between jobs |
| 2026-08-16 | Customer → Site → Job hierarchy; job quick-create auto-structures; legacy fields kept as fallback | Mark's world model; zero-migration |
| 2026-08-16 | Adaptive record pages: tabs on wide, one collapsible scroll on phones, per-device override | Matthew: device-dependent preference |
| 2026-08-16 | Addresses are always full field sets (street1/2/city/state/zip) | Matthew |
| 2026-08-16 | Job numbers auto-assigned per-year (26-041), editable; customer PO is a separate field | Matthew |
| 2026-08-16 | Roles are CONFIGURABLE capability bundles; six built-ins seeded to exact legacy behavior; Admin protected by code | Matthew: stop hard-coding permissions |
| 2026-08-17 | Persona-first process: charters + audit in docs/ govern rounds; spec amended before code | Matthew: stop vibe-coding drift |
| 2026-08-17 | No list renders unbounded history; "needs me now" before archives (smart-list pattern) | Matthew: infinite scroll unacceptable |
| 2026-08-17 | Personas split one-per-file (docs/personas/); Matthew approves and amends each as real-people input arrives | Matthew's review workflow |
| 2026-08-17 | Owner = the blasting company's owner(s); full and total access | Matthew |
| 2026-08-17 | Platform Admin is a NEW, SEPARATE persona: Matthew/the vendor, app-level administration above company roles; platform roles must not live in the per-company roles engine | Matthew — future multi-tenant |
| 2026-08-17 | Blaster is a supervisory role (Mark): senior capacity, sees everything, but not always the job lead — big jobs run multiple blasters | Mark via Matthew |
| 2026-08-17 | Blaster default view = ALL crews' days (supervisory visibility confirmed) | follows from the above |
| 2026-08-17 | Driller dispatch: crews self-organize today; dispatch is a wanted PLANNING feature, optional and never blocking the daily flow | Mark via Matthew |
| 2026-08-17 | Office = Evette; compliance and ATF-audit response are her core jobs — audit-response export elevated in her charter | Matthew |
| 2026-08-17 | Record lifecycle must be a consistent, intuitive pattern; deletes are LOGICAL, preserving a full record of all activity — see deletion-pattern.md (proposal pending approval) | Matthew |
| 2026-08-17 | Blaster workflow validated (see personas/blaster.md): blasters may set up customer/site/job themselves; drill plan carries design intent with a readiness-review/adjust step after drilling; per-hole hazards must inform loading; merged completed-plan view with driller attribution; compliance flags must explain why; seismo readings are point-in-time tied to the blast moment, late attachment normal; each crew member files their OWN daily time card; multi-blaster days = log per responsible blaster (model TBD) | Mark via Matthew |
| 2026-08-17 | Per-person time cards CONFIRMED; Evette approves BOTH the day and the cards | Matthew |
| 2026-08-17 | Multi-blaster model = (a): ONE log per day, each SHOT carries a responsible blaster + their signature | Matthew |
| 2026-08-17 | No job-lead designation — per-shot responsibility covers it | Matthew |

| 2026-08-17 | Days are NOUNS, never verbs: no "start/resume a day" anywhere — verbs act on work and jobs ("Continue — loading Shot 2", "Start work at another job"); the day record assembles itself and appears only with a date on it. Structure unchanged | Matthew |

| 2026-08-17 | Blaster screen study APPROVED (artifact 9bfdcfb9): phase spine confirmed; KPIs dropped from home (specific KPIs may return later); blaster MAY enter a no-login person's time card but ideally shouldn't have to — push toward self-service logins | Matthew |

| 2026-08-17 | Driller workflow validated (see personas/driller.md): grid split stays fluid (no assignment); rig checklist is a STANDALONE daily artifact per rig (paper form Rev.2 mirrored; 50-hr due-state to be computed from hours), drill log only selects the rig; plan general notes suffice; batch hole entry + plan deviations are STANDARD operation (app records the collars physically placed); drill-from-plan is THE model, no-plan path retires; driller daily trio = hours + log + checklist | Mark via Matthew |

| 2026-08-17 | Driller can submit a daily report WITHOUT a blaster when necessary — drill-only days never require blast-side involvement | Matthew |

| 2026-08-17 | Driller screen study APPROVED (artifact cab6eae6): trio home, grid-select batch logging, 50-hour clock advisory-only | Matthew |

| 2026-08-17 | Shop validated: DEDICATED shop; hours become a sourced LEDGER (field entries + shop CORRECTION override — append-only, both values kept, audited); Where's-my-equipment screen derived from filed paperwork (last record → job → site) + manual "at the yard" gesture, no GPS; PM designed on FLAGGED ASSUMPTIONS pending shop-crew verification | Matthew |

| 2026-08-17 | Shop screens revised per Matthew: shop TRIO tiles (Down/Tickets/Due) over one merged worklist; queue order = editable by shop (default downs-first-oldest; drag to reorder — downtime cost / job criticality are shop knowledge); where's-my-equipment gets a MAP (site coords, one-time geocode, offline after; list+map on wide, toggle on phone); shop form factor = landscape tablet/computer first; ledger + PM sections approved as designed | Matthew |

| 2026-08-17 | Deletion pattern APPROVED: verbs = Archive / Delete; hierarchy records deletable only if NEVER used (else archive-only); no extra ATF lock (immutable filings + draft-only delete + permanent server-side audit history suffice) | Matthew |

| 2026-08-17 | Round 1 shipped (0fb2d10, harness31 21/21). Implementation calls made in-round: time-card approval rides `approve_days` (one grant approves the day AND its cards); a FILED card freezes like a filed day — the owner pulls it back (filed→draft) to fix, approved cards freeze entirely, delete is draft-only; NON-approvers may enter cards only for NO-LOGIN roster people (server-enforced — "discouraged" is a hard rule below supervisor); hour corrections are append-only (`correct_hours`: mechanic+supervisor) and stamp equipment.hourMeter as the cached current value; the per-shot guard protects signing AS someone else — any blaster may still claim responsibility for an unsigned shot | follows from approved designs; recorded for future rounds |

| 2026-08-17 | Round 2 shipped (64d6618, harness32 20/20). In-round calls: office send-back now carries a REASON (`blastDay.sendBackNote`, stamped by the status route, cleared on any forward transition/resubmit — the needs-attention strip shows it inline and ranks sent-back above everything); readiness review stored ON the blast log (`readinessReview` object, no new table) and its max-lbs/delay seeds shots that haven't overridden; seismo phase chip is "later ok" — late attach stays policy, not warning; hub is a view of the existing day page (?view= deep-links), not a new route | follows from approved study; recorded for future rounds |

## Open (waiting on Mark / Matthew)

- Permits-on-site placement + job status names (quoted/active/on_hold/complete) — provisional
- Owner: quote structure; who may see dollars (`view_financials`); does Owner write or only read
- Shop-crew verification (held for later): real PM intervals + shop paper artifacts, parts capture, bench-vs-truck
- Persona charters: blaster + driller + shop APPROVED (shop pending crew verification); office/owner/admin/platform-admin awaiting
