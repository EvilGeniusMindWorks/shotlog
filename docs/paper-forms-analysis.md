# Baystate paper forms — field inventory & integration analysis

Source: scans provided by Matthew (Jul 26, 2026). This is the design
reference for the next workflow rounds. Nothing here is built yet.

## 1. Equipment Safety Inspection & Repair Report (per-shift, any equipment)

Header: company, date, location, shift, job # + name, equipment # + type,
hour meter, mileage.
Checklist: N/A / OK / RR (requires repair) per item, in four sections —
Outside (lights, steps/hand rails, tires/tracks, exhaust, fenders, bucket,
cutting edge/teeth, lifting mechanism, hoses, fittings greased,
hitch/coupler, wipers), Engine Compartment (battery cable, fan belt, hoses,
air filter, guards), Inside Cab (brakes service/parking, backup alarm, fire
extinguisher, gauges, horn, hydraulic controls, glass, mirror, rollover
protection, seat belt/seat, steering), Fluids (visible leaks, oil
level/pressure, coolant [cold only], hydraulic oil, transmission, fuel).
Footer: explanation of defects; "repairs needed" vs "not needed for safe
operation"; operator signature; "repairs COMPLETED by" + mechanic
signature + date.

**Integration:** `equipmentInspections` record — child of Equipment +
Job + date/shift + operator (User). Defect (any RR) opens a repair loop:
mechanic queue → mechanic completes + signs → closed. The trigger for the
mechanic role's real workflow.

## 2. Driver's Vehicle Inspection Report — DVIR (DOT/FMCSA-mandated)

Carrier + address preprinted. Date/time, truck #, odometer; ~45 defect
checkboxes (air compressor→windshield wipers incl. lights subtree, safety
equipment subtree); trailer section (brakes, coupling, king pin, doors,
hitch, landing gear, lights, reflective tape, roof, suspension, tarpaulin,
tires, wheels); remarks; either "condition satisfactory" + driver
signature, or defects → mechanic signature ("corrected" / "need not be
corrected") + driver RE-signature + dates.

**Integration:** `vehicleInspections` — child of Equipment (road fleet) +
driver (User) + date. Same repair loop as #1 plus the driver
countersignature step. DOT retention rules apply (90-day minimum) —
needs print/export like blast logs.

## 3. Rock Drill Check List (daily, per drill)

Asset #, starting hours, date, job location. Daily checks (engine oil,
compressor oil, hydraulic oil, anti-freeze, fuel, oil leaks, hoses while
drilling, roller hoses, grease machine, blow out coolers, gauges, horn,
lubricator, backup alarm, emergency stop). Every-50-hours-or-weekly
section (blow out engine/compressor/dust-collector air filters, fire
extinguishers, grease rollers). Repairs freeform (example: "hose blew +
compressor stopped working"). Driller signature + printed name.

**Integration:** `drillChecklists` — child of Equipment (rock_drill) +
Job + date + driller (User). Starting-hours feeds the registry hour
meter. Repairs text feeds the same mechanic loop.

## 4. Drill Log (per blast pattern — THE Driller→Blaster handoff)

Header: site name, blast #, location, GPS, diameter/burden/spacing, drill
rig #, face height, authorized signature, driller name + signature, date
completed. Per-hole rows: date, hole #/station, angle, actual depth,
subdrill, conditions at 5-ft depth bands (0–65 ft) using legend V=void,
SR=soft rock, O=overburden, W=water, comments. Totals row.

**Integration:** `drillLogs` + hole rows — created by driller against a
job/planned blast; consumed by the blaster when loading (water → WR
product, voids → deck loading decisions). This is the core Driller↔Blaster
workflow object. Links: job, drill rig (equipment), driller (user),
eventual blastLog/shot.

## 5. Example Blasting Log + Blast Design Plan (filled)

Matches the shipped BlastDay/BlastLog/Shot/DesignPlan/Seismo model.
Notable confirmations: dealer # printed in header (now from
companySettings); 2-shot columns on paper but app already supports N
shots; seismo per-shot graphs with operator + location.

## 6. Baystate Blasting Jobsite Contact Sheet (per job)

Project name, location, owner, general contractor. Contacts w/ name +
number: onsite contact, fire chief (blasting), detail required
(dispatch + hours), detail scheduling (call 24h ahead), police, fire,
hospital, urgent care ("directions on back"). BBi office routing:
change in job scope→Tony, equipment moves→Tony, equipment/vehicle
issues→Bob, incident→Evette, injury→Evette (phones). Freeform additional
info (fire-detail billing, scheduling guidance).

**Integration:** per-Job contact directory (`jobContacts` or fields on
Job) — office-maintained, FIELD-CRITICAL OFFLINE (crews need these
numbers with no signal). Office routing contacts are company-level
(companySettings), not per-job.

## 7. Example Daily Report — TWO variants

Blasting-day variant = the shipped DailyReport (work force IN/OUT/ST/OT/
TRK/TRVL, vehicles w/ odometer start/end, equip/drills w/ hour start/end,
mats/seismo asset list, materials/onsite repairs/fuel w/ vendor, subs/
rentals/fire detail, drill holes/vertical ft/pattern, notes).
**Non-Blasting Timesheet variant**: inspector instead of customer, same
weather/ground, work force, vehicles + equip hours, # drill holes, total
vertical ft drilled, pattern (draw on back), MISC/crushing totals, onsite
repairs/fuel, rentals, notes; office-use footer: job/hrs/type with codes
Drill to Blast (DB), Drill Only (DO), Drill to Excavate (DE), Crushing
(C), Hauling (H); "Certified" checkbox.

**Integration:** the app's root record today is Blast Day — but drill-only
/ crushing / hauling days have daily reports with NO blast. Open
architecture question: generalize the root to a per-job Work Day (blast
log optional, work-type coded) vs a separate non-blasting report chain.
Work-type codes (DB/DO/DE/C/H) matter for office job costing.

## 8. Blasting Incident Form (damage claim)

Date/time of incident, jobsite, structure type + address, property owner
(name/phone/address), pre-blast survey done?, description of alleged
damage. Blaster info: first notice of complaint + by whom, blaster name,
license #, seismograph #, event #, date/time of blast, PPV, dB, pre-blast
survey completed/refused dates, detailed description, pictures?, seismo
locations graph1/graph2, "attach copy of blast report & seismograph event
report". Office use: date received, blast reports reviewed, claim
denied/accepted, internal response sent, claim amount, submitted to
insurance + date. Page 2: grid sketch + notes.

**Integration:** `incidents` (type=blasting) — links job, blastDay/shot,
seismoReading(s), attachments (photos, survey docs). Two-phase workflow:
field/office intake → office claim processing (first real OFFICE-role
write workflow).

## 9. Incident Report — Utility / Asset (company-standard forms)

Utility: provider, date/time, project/job, address of hit, foreman/
laborer/operator/asset #, type circle (underground wire, overhead wire,
pipe, other), digsafe # + safe-on date, marked/mismarked, how far off,
depth, pictures, regulations, description, observations, reported to,
utility called, crew times/size/vehicles, repair description, utility
supervisor comments/signature, homeowner section, required pictures
(before/of/crews/after), office footer (bill received/amount, insurance,
date submitted).
Asset: date/time/address, employee/driver, asset #, foreman, project/job,
type circle (equipment accident, auto accident, theft, vandalism, other),
first notification, witnesses, pictures, police called + station,
injuries, other vehicle (driver/owner, make/model/year, plate, insurer),
description, damage detail, stolen list, accident diagram.

**Integration:** same `incidents` family with per-type payload sections;
links job + equipment + people. Note both reference a **foreman** role
concept the app doesn't have (probably = supervisor?).

## Cross-cutting observations

1. **Inspection family** (1/2/3) shares one lifecycle: operator fills →
   defects flagged → mechanic repairs + signs → (DVIR: operator
   countersigns). One `inspections` design with per-type checklists
   likely beats three bespoke models.
2. **Repair loop = the mechanic workflow.** RR items should surface as a
   mechanic queue; equipment status (in_shop) and the registry hour
   meters should feed from these forms.
3. **Drill Log = the Driller→Blaster handoff.** Hole conditions (water/
   voids) directly drive the blaster's load decisions.
4. **Root-record question:** Blast Day as root doesn't fit drill-only/
   crushing/hauling days (the non-blasting timesheet). Biggest schema
   decision of the next round.
5. **Jobsite contacts** are the Job's missing operational half — and must
   work offline.
6. **Incidents** introduce office-role write workflows (claims,
   insurance) with links INTO blast records and seismo events.
7. Checklist forms all carry signatures — signature_pad flow already
   exists in the app.
