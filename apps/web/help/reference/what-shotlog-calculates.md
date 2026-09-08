---
title: What ShotLog calculates
order: 1
screens: /reference
updated: September 2026
status: draft
---

The numbers on a shot are worked out from what you enter. Here is what each one is.

## From the drill parameters

- **Holes and feet drilled** — holes × depth.
- **Cubic yards** — burden × spacing × depth × holes, in yards.

## From the explosives

- **Pounds** — quantity × the product's weight per unit (from the catalog).
- **Pounds per delay** — the most explosive that fires within any 8 ms window, from the timing. This is the charge weight the compliance checks use.
- **Powder factor** — pounds ÷ cubic yards.

## Scaled distance

Distance to the nearest structure ÷ √(pounds per delay). A larger number is a gentler shot at that structure.

## Predicted PPV

Peak particle velocity predicted from the scaled distance using the site's **K factor**: PPV = K × (scaled distance)^-1.6. K starts at the site's value (typically 160 to 180) and can be calibrated from measured seismograph readings on the job page; applying a calibrated K to the site updates every job there.

## Related

[What ShotLog checks](/help/reference/what-shotlog-checks) · [Seismo readings](/help/blaster/seismo-readings)
