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

## Open (waiting on Mark / Matthew)

- Permits-on-site placement + job status names (quoted/active/on_hold/complete) — provisional
- Blaster default view: own days vs all crews' days
- Driller assignment/dispatch: needed or not?
- Owner: who is it; quote structure; who may see dollars (`view_financials`)
- Office: who plays the role at Baystate today
