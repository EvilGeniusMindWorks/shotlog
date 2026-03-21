# ShotLog

An offline-first Progressive Web App for commercial blasting crews to digitize blasting logs and daily reports. Eliminates redundant data entry between forms, auto-calculates industry-standard formulas (Scaled Distance, PPV, K Factor, USBM RI8507/OSM compliance), captures seismograph printouts via camera, and syncs to a server when connectivity is available.

## Primary User
Field blaster at Baystate Blasting, Inc. (single user MVP, multi-user later)

## Platforms
Android tablet (primary), phone, PC/Mac — all via PWA. Full functionality offline; sync when connected.

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **PWA:** vite-plugin-pwa (Workbox) for service worker and offline caching
- **Local DB:** Dexie.js (IndexedDB wrapper) for offline-first storage
- **Drawing:** Leaflet + leaflet-draw for map-based site diagrams
- **Camera:** HTML5 MediaDevices API
- **Signature:** signature_pad
- **Backend:** Node.js + Express + TypeScript
- **Server DB:** PostgreSQL + Prisma ORM
- **Auth:** JWT (simple for v1)
- **Sync:** Custom REST + timestamp-based last-write-wins

## Monorepo Structure (npm workspaces)
- `apps/web/` — PWA frontend (React + Vite)
- `apps/server/` — Backend API (Express + Prisma)
- `packages/shared/` — Shared types, calculations, and validation logic

## Coding Conventions
- TypeScript strict mode everywhere
- Functional React components with hooks (no class components)
- Barrel exports (index.ts) from each module directory
- All calculations in packages/shared so they're reusable on client and server
- Dexie.js for all client-side data — write locally first, sync later
- CSS: Tailwind utility classes, no custom CSS files unless necessary
- Components: shadcn/ui as the base component library
- Testing: Vitest for unit tests, especially the calculations module

## Spec Documents (in ~/Downloads/files-20/)
- `BlastLog-Pro-Spec.md` — Main spec: data model, field mapping, architecture
- `BlastLog-Pro-Spec-Addendum.md` — Workflow behaviors, product catalog, UX flows
- `BlastLog-Pro-Spec-Addendum-2.md` — Engineering formulas, compliance checks, reference data

## Key Domain Concepts
- A **Blast Day** is the parent record (one per working day per job)
- Each Blast Day has one **Blasting Log** (technical) and one **Daily Report** (labor/operations)
- A Blasting Log has unlimited **Shots** (not capped at 2)
- Each Shot has drill params, totals, a design plan, typical column, and seismo readings
- Explosive entry is **TOP-DOWN**: blaster enters total quantity, app calculates weight via multiplier
- The **Product Catalog** has 60+ explosive products with weight multipliers from 4 manufacturers
- Jobs are long-running and carry forward customer, address, K factor, defaults
- Blasters have licenses in multiple states; app auto-selects based on job state
