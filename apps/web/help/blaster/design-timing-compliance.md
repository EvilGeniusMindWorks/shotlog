---
title: Design, timing and compliance
order: 8
screens: /blast-day/:id/design/:shotId?mode=timing
updated: September 2026
status: draft
---

The design is the wiring diagram: which holes fire when. The compliance badges tell you how the shot measures against the limits before you fire it.

## The wiring diagram

Open the shot's **Design** (or **Continue › Confirm design & build timing** after drilling). The holes are on the grid as drilled. Tap holes in firing order, or use the delay tools to assign delays by row. The pounds per delay follow from the explosives and the delays.

A position the plan marked **⌀ No hole** is drawn hollow and cannot be wired, the same as a hole the drillers left out. To take one hole out of the timing, tap it, then **Clear hole N** (the Clear button names it while a hole is selected): every wire into or out of it goes and the rest stays. **Undo** brings it back. With nothing selected the button is **Clear all**.

**Pattern check (30 CFR 816.67).** Charges that fire within 8 ms of each other count as one delay. The line under the diagram says whether every hole is at least 8 ms from the next; if not, it turns red, names the holes, and rings them on the grid. Fix the increment or the wiring until it is green, or accept the pounds per delay it implies.

## Finding the shot on the map

The site map opens where it last was for this shot; for a new shot, on the site's saved spot, else on the job's address, else on western Massachusetts — a line under the map says which. To move it:

- **Type anything** in the location bar: an address, a place name, or coordinates ("42.4412, -72.6321", degrees-minutes-seconds, or "N 42.44 W 72.63" as a phone's map app copies them). An address shows up to five matches with their town — pick the right one. Coordinates go straight to the map, no signal needed.
- **Job's address** searches the job's address in one tap. **Center on me** brings the map to where you stand — the blue dot with its accuracy circle.
- **Drag the blast pin** to the exact spot — the pin is what the record keeps, and the compliance distances measure from it.
- **Save as the site's spot** keeps the pin for the next shot at this site.

Search needs a signal; the bar says so when there is none. Satellite imagery is the default once a site has a saved spot.

## The badges

Each shot shows badges for **scaled distance** and **PPV** (peak particle velocity) against USBM RI 8507 and OSM. Green is inside the limit, amber is close, red is over.

- The distance is to the nearest structure on the site record.
- The charge weight per delay comes from the explosives and the timing.
- A red badge is not a stop, but it is worth a note in the shot before filing, because the office will ask. The **Reference** page explains each check.

## Where you stand, and the ring

Allow location once and a blue dot follows you on the map while it is open, with a circle for how sure the phone is. **Center on me** brings the map back to you. Standing on the shot, **Pin the blast here** drops the blast pin under your feet; at a house, **Pin a structure here** does the same for a structure. The dot is never saved or printed.

A ring sits around the blast pin — 250 ft unless you change it with the slider or the box beside it. It is saved with the shot and printed on the log's map. Structures inside it turn red and are listed under the map, nearest first, with their distances; the rest are greyed below.

## Naming structures and the closest one

Dropping a structure pin asks for a name ("Stevens residence"); skip keeps "Structure 3". Tap a pin to rename it. Names print on the log. Whenever the closest structure changes — a pin added or moved, the blast pin moved — the map offers its distance for the plan: **Use 180 ft for compliance**. It never fills the plan by itself. Using it also redoes the scaled distance and the predicted vibration, so the badge, the plan and the seismo page agree.

## Related

[Seismo readings](/help/blaster/seismo-readings) · [What ShotLog checks](/help/reference/what-shotlog-checks)
