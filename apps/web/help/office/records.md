---
title: Records: the tree, the columns, the preview
order: 2
screens: /records
updated: September 2026
status: draft
---

Records is the company's record book: every filed day, drill log, checklist, time card and incident, with its PDF and its attachments, searchable in seconds. The page uses the whole window; only the list scrolls.

## Finding things

**The tree on the left** is the navigator: All records › customer › site › job › day. Tap a node and the list shows what is under it; the counts respect the Kind and Status chips above the list, so "Status: awaiting approval" shows at a glance which jobs have papers waiting. **Hide the tree** gives the plain list; the choice is remembered.

**Kind and Status chips** sit above the list, with the search box (a job number, a town, a name, a date) and the dates. **Group by** date, job or kind; sort by any column.

## Reading the list

Two lines per row: the paper and the job on the first, the particulars in grey on the second — "Shots 1–2 · 597.8 lbs · 88 holes", "R1021 · 1,400.0 → 1,407.5 · 7.5 h", "7:00 am – 3:30 pm · 8.5 h", "crew 4 · 2 rigs · 📎 3". The paper-clip is the attachment count.

**Columns** adds Customer, Shots, Lbs, Holes, Rig and Approved by; **Density: Compact** drops the second line. Both are remembered on this device.

![Records](records-office.png)

## The preview

Tap a row: the preview slides over the right half — the filed PDF, who filed it, the **version chain** when a paper was refiled, and the file's integrity (SHA-256, size, where the copy lives). **Close** or the back gesture closes it; **Open in a window** puts the preview in its own browser window for a second monitor. A paper with no filed copy yet opens as a summary with **Open live record**.

## Attachments

Under the PDF, the filmstrip lists every attachment on the copy with its context as the heading — "Shot 1 › Seismo reading 2 · pump house · PPV 0.18 in/s · 31 Hz", "Explosives usage › Delivery · BOL 88-4471" — who took it and when. The kind chips (Seismo · Mats · Video · Bills · Other) and the search narrow it. Tap one: the lightbox shows the photo full size with **Hangs on**, **Taken by** and **File**, and Prev / Next / Download. A video stays a clip; the full video is on the device that shot it.

## Getting records out

Select rows — or **Select all in group** — then **Download ZIP** (a folder per job and date, with an index.csv), **CSV index**, or **Print** (six at a time). **Export binder** takes the node you are on — a customer's whole year, one job, one day — and adds an index per paper listing each attachment with its context, plus one attachments-index.csv.

> **"Not reachable from this device"** means the PDF copy is on the server and this device is offline. It downloads when you have signal.

## Related

[Approvals](/help/office/approvals) · [Your records (blaster)](/help/blaster/your-records)
