# Ground-vibration compliance in ShotLog — engineer review packet

Prepared 2026-09-06 for Round S5 (launch gates). **Status: awaiting a
blasting engineer's review and signature (bottom of this page).**

ShotLog shows a compliance badge (green / amber / red) on every seismograph
reading, on the shot designer, and on the filed blast report. Before real
blasters see those badges on real shots, someone who is qualified to say so
should confirm that the limits behind them are the right ones for
Baystate's work. This page is everything they need to do that in twenty
minutes: what the app computes, where it comes from, what it does *not*
do, and the questions we need answered.

## 1. What the app computes

For each reading the blaster enters (or the app reads off the seismograph
printout): **PPV** (peak particle velocity, in/s), **frequency** (Hz, the
zero-crossing frequency the unit reports), and the **distance** from the
shot to the closest structure (ft, from the shot's design plan).

Two limits are computed and the reading is compared to both. The badge is
the worse of the two.

### 1a. USBM RI 8507 frequency-dependent limit (the "Z-curve")

Source: Siskind, Stagg, Kopp & Dowding, *Structure Response and Damage
Produced by Ground Vibration From Surface Mine Blasting*, USBM RI 8507
(1980), Figure B-1.

Implementation (`packages/shared/src/calculations.ts`,
`usbmRI8507Limit`): the limit is the minimum of three bounds —

| Band | Limit | Basis |
|---|---|---|
| low frequency | PPV = 2π · f · 0.030 in | 0.030-in displacement line |
| mid band | 0.75 in/s (drywall) · 0.50 in/s (plaster) | plateau |
| rising | PPV = 2π · f · 0.008 in | 0.008-in displacement line |
| high frequency | 2.00 in/s | cap |

Which gives, for **drywall** (the default):

| f (Hz) | 1 | 2 | 4 | 5–14 | 15 | 20 | 25 | 30 | 35 | 40 | 50+ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| limit (in/s) | 0.19 | 0.38 | 0.75 | 0.75 | 0.75 | 1.01 | 1.26 | 1.51 | 1.76 | 2.00 | 2.00 |

and for **plaster**: 0.50 in/s from ~2.7 Hz to ~10 Hz, then the same
0.008-in line (0.60 at 12 Hz, 1.01 at 20 Hz, 1.51 at 30 Hz), 2.00 at 40 Hz.

The 0.008-in line reaches 2.0 in/s at 39.8 Hz, so the cap starts at **40 Hz**.

### 1b. OSMRE distance-based limit

Source: 30 CFR 816.67(d)(2)(i), Table.

| Distance to structure | Max PPV |
|---|---|
| 0–300 ft | 1.25 in/s |
| 301–5,000 ft | 1.00 in/s |
| > 5,000 ft | 0.75 in/s |

The app also computes the OSMRE scaled-distance thresholds (Ds = 50, 55,
65 ft/lb^½ for the same three bands) and the resulting max pounds per
delay, shown on the shot designer as guidance.

### 1c. The badge

`compliant` when PPV ≤ 80% of the limit · `warning` between 80% and 100%
· `violation` above the limit — for each of the two limits; the badge shows
the worse. **The 80% warning band is the app's choice, not a standard.**

## 2. What the app does NOT do (please read)

1. **Structure type is not chosen per shot.** The plaster curve exists in
   code but the seismo screen always evaluates as *drywall*. A shot near an
   older plaster-and-lath house is therefore checked against 0.75 in/s in
   the mid band, not 0.50. (Fix is small: a structure-type field on the
   design plan's closest structure; we want the engineer's view on whether
   it is required before launch.)
2. **State and local limits are planning-side only, and thin.** The shot
   *designer* (predicted PPV) stacks: the USBM limit at an assumed 15 Hz,
   the OSMRE distance limit, a flat **2.0 in/s for Massachusetts jobs**
   (labelled "MA 527 CMR 13" in the code since S10 — 540 CMR was the motor
   vehicle code; the exact section and the 2.0 in/s value still need your
   confirmation), and any per-job local limit an admin typed on the job. The
   *seismo badge* on actual readings applies the federal curve and
   distance table only — no state or local limit. New Hampshire and other
   states have nothing. The Reference page was corrected in S5 to say
   this plainly.
3. **Frequency is whatever the seismograph reports.** The app does not
   compute a frequency from the waveform; it uses the zero-crossing
   frequency read from the printout (or typed in). If a unit reports a
   different frequency measure, the curve lookup shifts.
4. **Air overpressure is recorded but not checked** against 30 CFR
   816.67(b) (133 dB / 129 dB by instrument response).

## 3. The 30 Hz vs 40 Hz question (why this packet exists)

RI 8507 Figure B-1 reaches 2.0 in/s at **40 Hz**. OSMRE's *alternative
blasting-level criteria* figure (30 CFR 816.67(d)(4)(ii), Figure 1) is the
same shape but reaches 2.0 in/s at **30 Hz**, with the ramp leaving the
plateau earlier. An earlier version of ShotLog allowed 2.0 in/s at 30 Hz;
it was corrected to the RI 8507 curve (40 Hz) in July 2026 and the unit
tests pin that (`calculations.test.ts`, "usbmRI8507Limit"). Between 30 and
40 Hz the two curves differ by up to 0.5 in/s — a reading of 1.8 in/s at
32 Hz is a **violation** under the app's curve and **compliant** under
OSMRE's figure.

We labelled the badge "USBM RI 8507" and enforce the 40 Hz curve because it
is the more conservative of the two. Whether that is the right call for
Baystate's permits is the engineer's question, not ours.

## 4. Questions for the engineer

1. For Baystate's jobs (Massachusetts primarily; list other states), which
   curve governs: RI 8507 Figure B-1 (40 Hz) or OSMRE Figure 1 (30 Hz), or
   a state/permit table? Should the app apply the more conservative of
   several, or exactly one?
2. Is the drywall default acceptable, or must structure type be recorded
   per shot before launch (see §2.1)?
3. Is an 80% warning band useful, or should the badge be pass/fail only?
4. Is the seismograph's reported zero-crossing frequency the correct input
   for the curve for the units Baystate runs (list models)?
5. Should air overpressure be checked, and against which limit?
6. Anything on the shot designer's scaled-distance guidance (Ds 50/55/65)
   that should change?
7. Massachusetts: what is the correct citation and limit for ground
   vibration (the designer currently uses a flat 2.0 in/s labelled
   "540 CMR")? Should the same limit apply to the seismo badge on actual
   readings, and should the designer's 15 Hz assumption stand?

## 5. Evidence

- Unit tests: `packages/shared/src/calculations.test.ts` — curve
  continuity at 4, 15 and 40 Hz; plaster never more permissive than
  drywall; monotonic; OSM bands.
- The Reference screen in the app (Reference → Compliance) shows the same
  bands as this page.
- Formula and constants: `packages/shared/src/calculations.ts` lines
  60–141.

## 6. Sign-off

| | |
|---|---|
| Reviewed by | |
| Qualification / license | |
| Curve to enforce (§4.1) | |
| Structure type required before launch? (§4.2) | yes / no |
| Warning band (§4.3) | keep 80% / pass-fail only / other: |
| Other changes required before launch | |
| Signature · date | |

Until this is signed, the launch runbook (docs/soft-launch-runbook.md)
treats amber/red badges as "look at the printout", and Matthew decides
whether the badges should carry an explicit "advisory" label in the app.
