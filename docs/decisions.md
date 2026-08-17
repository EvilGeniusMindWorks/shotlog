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

## Open (waiting on Mark / Matthew)

- Permits-on-site placement + job status names (quoted/active/on_hold/complete) — provisional
- Owner: quote structure; who may see dollars (`view_financials`); does Owner write or only read
- Blaster "job lead" designation on multi-blaster jobs — needed?
- Deletion pattern approval + its open questions (Remove vs archive-only for hierarchy; ATF retention lock; button wording)
- Persona charters: all seven awaiting Matthew's approval pass
