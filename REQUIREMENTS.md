# ShotLog — Product Requirements

> Generated from the v6 prototype on 2026-04-14.  
> Edit freely — mark items `[ ]` incomplete, `[x]` complete, or `[~]` changed.  
> This document describes what the prototype *currently shows*, not what has been built in code.

---

## 1. Product Overview

ShotLog is an **offline-first Progressive Web App** for commercial blasting crews to digitize blasting logs and daily reports. It targets Android tablets as the primary device, with full support on phones and PC/Mac browsers.

### 1.1 Core Goals

- Eliminate redundant data entry between the Blasting Log and Daily Report forms
- Auto-calculate industry-standard formulas (Scaled Distance, PPV, K Factor, Powder Factor)
- Capture seismograph printouts via device camera (OCR for PPV extraction)
- Store all data locally; sync to a server when connectivity is available
- Export print-ready documents that match existing Baystate Blasting paper forms

### 1.2 Primary User

Mark Swihart — Field Blaster, Baystate Blasting, Inc.  
Single-user MVP; multi-user planned for a later version.

### 1.3 Platform Requirements

| Platform | Support Level |
|---|---|
| Android tablet | Primary — full offline functionality |
| Android phone | Full support |
| PC / Mac browser | Full support |
| iOS | Not required for MVP |

---

## 2. Navigation & Shell

### 2.1 App Shell

- Sticky header with ShotLog wordmark (`SHOT` light / `LOG` bold-orange), logo mark, and online/offline status badge
- Header actions: `?` Tour launcher button, dark/light mode toggle button
- Bottom tab bar (mobile) with 4 destinations: Dashboard, Jobs, Reference, Settings
- Sidebar navigation (tablet/desktop) with the same 4 destinations plus theme toggle and user identity at the bottom

### 2.2 Bottom Navigation Tabs

| Tab | Icon | Destination |
|---|---|---|
| Dashboard | Squares Four | Dashboard screen |
| Jobs | Briefcase | Jobs list screen |
| Reference | Book Open | Formulas / reference screen |
| Settings | Gear | Settings screen |

### 2.3 Light / Dark Mode

- Toggle available in the app header (always visible) and in the sidebar footer
- Full CSS variable theming — all surfaces, text, borders, and icons respond
- Designed for both bright jobsite conditions and dim truck-cab environments

### 2.4 Guided Tour

- `?` button in the header launches a step-by-step overlay tour
- Tour traverses all major screens: Dashboard → Blast Day → Design Plan → Seismo → Print → Jobs → Job Detail → Settings → Reference
- Each step highlights a specific element, shows a title and body, and has Prev/Next/End controls
- Tour can be re-launched at any time from the header

---

## 3. Dashboard Screen

### 3.1 KPI Stats Bar

Four stat boxes displayed in a row at the top of the Dashboard:

| Stat | Description |
|---|---|
| Active Jobs | Count of jobs with in-progress blast days |
| Shots / Month | Total shots fired in the current calendar month |
| YTD Total (lbs) | Year-to-date pounds of explosives used |
| Compliance | Percentage of shots that passed all compliance checks |

### 3.2 Blast Day Cards (Default View)

- Cards displayed in a scrollable vertical list
- Each card has a **hero image area** (procedurally generated SVG site map with terrain, structures, trees, road, water, and a shot hole mini-grid overlay)
- Hero overlays: status pill (Complete / In Progress / Draft), date badge (day + weekday)
- Below the hero: job title, address subtitle
- 4 metric mini-cards: Shots, Holes, Total Lbs, Powder Factor
- Card tap → navigates to that Blast Day screen
- Cards support light/dark-mode-aware hero SVG rendering

### 3.3 Blast Day Table View ("View All")

- "View All" button in the Blast Days section header toggles between card grid and full data table
- Table controls:
  - Full-text search across job name and address
  - Filter buttons: All / In Progress / Complete / Draft
  - Sortable columns (click header to toggle asc/desc, visual sort icon)
- Table columns: Date, Job, Address/State, Status badge, Shots, Holes, Total Lbs, Powder Factor
- Table rows are clickable — navigate to that Blast Day
- ~18 historical records shown in demo data

### 3.4 New Blast Day FAB

- Floating action button (+) in the bottom-right corner
- Opens the New Blast Day modal

---

## 4. Blast Day Screen

### 4.1 Header

- Back arrow → Dashboard
- Title: Job name; subtitle: date and address
- Copy icon → Copy from Previous modal
- Print icon → Print screen

### 4.2 Conditions Bar

- Sticky sub-bar below header showing current conditions as chips
- Fields: Temperature (Low/Mod/High), Weather (Sunny/Cloudy/Rain etc.), Wind direction, Ground condition, Fire Detail (yes/no)
- "NWS" badge indicating data source (National Weather Service auto-fill)
- "Edit" link opens the Conditions modal for manual override

### 4.3 Blast Log / Daily Report Tabs

Two tabs within the Blast Day screen:

- **Blast Log** — technical shot data
- **Daily Report** — crew, equipment, materials, notes

### 4.4 Blast Log Tab — Summary Stats

Four stat boxes at the top of the Blast Log tab:

| Stat | Description |
|---|---|
| Shots | Number of shots in this blast day |
| Holes | Total holes across all shots |
| Total Lbs | Total explosives + boosters |
| PF (lbs/yd³) | Powder Factor — auto-calculated, live update |

A formula hint row below the stats shows the PF calculation with context ("Typical for quarry: 1.0–2.0").

### 4.5 Blast Information Section

Collapsible section card with completion status indicator.

| Field | Type | Options |
|---|---|---|
| Operation | Chip select | Construction, Quarry, Trench, Open |
| Rock Type | Dropdown | Granite, Trap Rock, Limestone |
| Terrain | Dropdown | Flat, Hilly, Slope |
| Hazards | Multi-chip | Overhead Lines, Gas Line, Water Main, Residential, Highway |
| Precautions | Multi-chip | Blast Mats, Road Guards, Siren, Flagging |

### 4.6 Shots

- Unlimited shots per blast day (not capped)
- Each shot is a collapsible card with a header showing: Shot number, time, hole count, and pound subtotal
- Shots can be deleted (trash icon on header)
- "Add Shot" button at the bottom of the shot list

#### 4.6.1 Drill Parameters (per shot)

| Field | Type |
|---|---|
| Shot Time | Time picker |
| Blast Mats | Yes / No chip |
| Hole Diameter (in) | Number input |
| Burden (ft) | Number input |
| Spacing (ft) | Number input |
| Stemming (ft) | Number input |

#### 4.6.2 Totals (per shot)

Auto-calculated display grid (read-only unless overridden):

| Field | Calculation |
|---|---|
| # Holes | Direct entry |
| Sq Ft | Burden × Spacing × # Holes |
| Avg Depth | Direct entry / average |
| Drill Footage | Avg Depth × # Holes |
| Pay Yards | Calculated cubic yards |
| Yards Shot | Same as Pay Yards unless overridden |

#### 4.6.3 Explosives (per shot) — Auto-distributed

- Marked with "Auto" badge
- Quantities are proportionally distributed from the Explosive Totals sidebar based on hole count ratio (e.g., 18/34 = 53%)
- Shows product name, quantity, and pounds
- Per-shot subtotal displayed
- Individual line items can be overridden by tapping

#### 4.6.4 Design Plan (per shot)

- Tapping opens the Design Plan screen (full-screen 4-panel layout)
- Summary line: "Site • Shot • Column • Compliance"

#### 4.6.5 Seismo Readings (per shot)

- Tapping opens the Seismo screen
- Summary line: e.g., "3 graphs • Compliant"

### 4.7 Explosive Totals Sidebar (Blast Log)

Separate sidebar/column alongside the shot list (desktop) or below shots (mobile).

Three collapsible sections:

**Explosives (Blasting Agents)**
- Enter total quantity for the entire blast day
- Per-shot breakdown auto-calculated from this total
- Each line: product name, lbs/unit, quantity, total lbs
- Edit and delete per line item
- "+ Add Product" → Product Picker modal

**Boosters**
- Same pattern: product, quantity, lbs
- "+ Add Booster"

**Detonators & Lead**
- Products by delay series (e.g., QR-12 — 9MS, QR-12 — 17MS)
- Lead wire (e.g., Lead In Line — 500')
- "+ Add Detonator / Lead"

**Total Pounds Shot** — prominent dark banner showing sum of all explosives + boosters

### 4.8 Attachments

Collapsible section card in the sidebar column.

- Grid of attachment thumbnails (photo, PDF)
- Each shows file type icon and filename
- "+" tile opens Add Attachment modal
- Supports photos, documents, videos

### 4.9 Sign-off & Delivery

Collapsible section card in the sidebar column.

| Field | Behavior |
|---|---|
| Blaster | Dropdown (from crew roster) |
| License # | Auto-selected based on job state — read-only with "Auto" badge |
| State | Auto-populated from job address |
| Onsite Delivery | Yes / No chip |
| Signature | Tap-to-sign canvas (signature_pad) |

### 4.10 Daily Report Tab

Auto-populated banner: "Auto-populated from Blast Log where possible."

Two-column layout (desktop) / single column (mobile):

**Work Force section**
- Crew roster from defaults, each with start/end time inputs
- "+ Add from Crew List" button

**Equipment section**
- Equipment list from defaults, each with hours/time range
- "+ Add from Equipment List" button

**Materials / Fuel section**
- Line items: vendor, product type, quantity, cost
- "+ Add Item"

**Notes section**
- Free-text textarea
- Label: "Auto from Blast Log"

---

## 5. Design Plan Screen

Full-screen overlay (back arrow returns to Blast Day). 2×2 grid layout on tablet, stacked on mobile.

### 5.1 Compliance Badge Bar

Below the header, a row of compliance badge chips showing real-time pass/fail status:

- USBM RI8507
- OSM
- Scaled Distance value
- Predicted PPV value

### 5.2 Site Diagram

Leaflet-based map with drawing tools (leaflet-draw).

- Blast zone boundary polygon
- Nearest structure marker with distance annotation
- Additional feature annotations (roads, water, structures)
- Scale and orientation

### 5.3 Shot Diagram (Hole Grid + Delay Timing + Wire/Tie-in)

Interactive hole grid — default 10×5 (50 holes), configurable.

#### Delay Timing Mode
- Toolbar shows delay number buttons (1–8+) and an eraser
- Click a delay number, then click holes to paint that delay
- Each delay number has a distinct color
- Painted holes show delay number inside the hole circle
- **Undo** button reverses the last paint action (full undo stack)

#### Wire / Tie-in Mode
- Activated by the link icon toggle button on the toolbar
- Toolbar background changes to navy-tinted to indicate wire mode
- Toolbar hides delay buttons, shows instruction text: "Click source hole, then destination"
- Click a source hole (highlighted with navy ring)
- Adjacent and diagonally-adjacent valid target holes are indicated
- Click a valid target → draws a directional arrow between the two holes
- Clicking the same pair again → removes the wire (toggle)
- **Undo** button reverses the last wire or unwire action
- **Clear Wires** button removes all wires (also undoable as a single action)
- SVG overlay with arrowhead markers renders all wires; arrows positioned correctly relative to hole centers

### 5.4 Structure & Compliance

| Field | Behavior |
|---|---|
| Distance to Nearest Structure (ft) | Manual entry |
| Max Charge Weight per Delay (lbs) | Manual entry |
| K Factor | Carried from job defaults, editable |
| Scaled Distance | Auto-calculated: D / √W |
| Predicted PPV | Auto-calculated: K × (D/√W)^-1.6 |
| USBM RI8507 Limit | Lookup from frequency table |
| OSM Limit | Lookup from OSM table |

Compliance result rows showing PASS/FAIL for each standard.

Four regulation rows shown:
- USBM RI8507 — pass/fail
- OSMRE — pass/fail
- MA 540 CMR (state) — pass/fail
- Whately Local Bylaw (local, most restrictive) — pass/fail
- "Most restrictive: X in/s — Y% of limit" summary line

### 5.5 Typical Column Builder

- **Multiple columns**: tabs allow creating and switching between multiple typical column configurations
- Tabs: one per column + "+" button to add a new column
- Each column is independently configurable
- Column tab can be renamed

**Column Builder Interface**
- Add Layer dropdown (Stemming, Explosive, Booster, Air Deck, Sub Drill) + Add button
- Each layer displayed as a row with:
  - Layer type icon and label
  - Color-coded background
  - Depth input (editable inline, in feet)
  - Delete (×) button
- Layers can be reordered (future: drag-and-drop)

**Live Column Visual**
- Real-time proportional borehole diagram updates as layers are added/edited
- Renders: hole collar at top, each layer as a color-coded band with depth label, total depth shown at bottom
- Visual is proportional to actual depths entered

---

## 6. Seismo Readings Screen

### 6.1 Camera Capture

- "Capture Seismograph" button triggers HTML5 `MediaDevices.getUserMedia` camera
- Supports capture of physical seismograph printout
- OCR extracts PPV readings automatically (or manual entry fallback)

### 6.2 Readings Display

- List of captured seismograph readings per shot
- Each reading shows: PPV value, frequency, waveform thumbnail
- Compliance indicator per reading (pass/fail against applicable limit)
- Summary: "X graphs • Compliant / Non-compliant"

---

## 7. Print / Export Screen

### 7.1 Blasting Log PDF

- Print-ready export matching Baystate Blasting's existing paper Blasting Log form
- "Print Blasting Log" button

### 7.2 Daily Report PDF

- Print-ready export matching Baystate Blasting's existing paper Daily Report form
- "Print Daily Report" button

### 7.3 Visual Blast Report

- "Generate Blast Report" button (orange) → opens `example-blast-report.html`
- 3-page designed report combining all data with app visuals:
  - **Page 1**: Cover/summary — logo, job info, KPI stats (shots, holes, total lbs, PF), conditions, SVG site diagram
  - **Page 2**: Shot details side-by-side, delay dot grids, typical column visuals, explosives table
  - **Page 3**: Compliance table (regulation-by-regulation), seismograph readings, crew/equipment, sign-off block
- Print-ready `@page letter`, `page-break-after`, `print-color-adjust: exact`

---

## 8. Jobs Screen

### 8.1 Job List

- Scrollable list of all jobs (active and archived)
- Each job card shows: job name, customer, address, K Factor, rock type, blast day count

### 8.2 New Job FAB

- "+" FAB opens New Job modal

### 8.3 Job Detail Screen

- Tap a job card → Job Detail screen
- Header: back arrow, job name, address
- Stats bar: Blast Days, Total Shots, K Factor, Avg Powder Factor
- Full blast day history for this job (list)
- Job configuration: name, customer, address, rock type, K Factor, closest structure

---

## 9. Reference Screen

Three tabs:

### 9.1 Formulas Tab

Formula cards for each calculation with:
- Formula name and description
- Formula notation (e.g., SD = D / √W)
- Variable definitions
- Typical value ranges for context

Formulas covered:
- Scaled Distance (SD)
- Peak Particle Velocity (PPV)
- K Factor
- Powder Factor (PF)
- Rock Volume
- Loading Density

### 9.2 Glossary Tab

Alphabetical industry term definitions:

| Term | Definition |
|---|---|
| Burden | Distance from borehole to free face |
| Spacing | Distance between holes in a row |
| Stemming | Inert material loaded above explosive column |
| Sub Drill | Drill depth below grade line |
| Air Deck | Gap within the explosive column |
| PPV | Peak Particle Velocity — seismograph measurement |
| ZC Frequency | Zero-crossing frequency from seismograph |
| MS Delay | Millisecond-delay detonator series |

### 9.3 Compliance Standards Tab

Three sections:

**Federal Standards**
- USBM RI8507 frequency-dependent PPV threshold table (Hz → in/s limit)
- OSMRE limits table
- Peak overpressure / airblast thresholds

**State Regulations**
- Grid of state cards: active states (MA — active job marker), inactive states (CT, NH with auto-activate messaging)
- Auto-mapping message: "This regulation would auto-activate when a job is created in [state]"

**Regulation Stack Explainer**
- Visual diagram showing: Federal (always active) → State (auto-mapped by address) → Local/Municipal (most restrictive wins)
- Explains override hierarchy

---

## 10. Settings Screen

### 10.1 Blasting Licenses

- List of licenses by state — license number and expiration date
- Expiration warning indicator (e.g., < 90 days)
- "Add License" button → Add License modal
- License auto-selection: when a job is in a given state, the matching license is automatically applied to sign-off

### 10.2 Crew Roster

- "Crew Members" settings item → Crew modal
- List of crew members with name, role, avatar initials
- Edit and delete per member
- "+ Add Crew Member" button
- This roster auto-populates Work Force on every new Daily Report

### 10.3 Equipment

- "Equipment" settings item → Equipment modal
- Categorized: Vehicles, Drills, Seismographs
- Each item: name, serial/ID
- Edit and delete per item
- "+ Add Equipment" button
- This list auto-populates Equipment on every new Daily Report

### 10.4 Product Catalog

- "Product Catalog" settings item → Product Picker modal (view/manage mode)
- 60+ products from 4 manufacturers: Austin Powder, Dyno Nobel, Orica, Independent
- Product fields: name, type (blasting agent / high explosive / booster), weight multiplier (lbs/unit)
- Categories: Blasting Agents, High Explosives, Boosters
- Search by product name
- Filter by manufacturer

### 10.5 Regulations

- "Regulations" settings item → Regulations modal
- Multi-tab modal: Federal, State, Local
  - **Federal tab**: USBM RI8507 threshold grid, OSMRE limits, always-active indicator
  - **State tab**: MA (active — linked to current job), CT/NH (inactive with auto-activate note)
  - **Local tab**: Whately Bylaw with custom override values (1.0 in/s PPV limit), most-restrictive-wins badge
- Info callout at bottom explaining auto-mapping by job address

### 10.6 Appearance

- Theme toggle (light/dark) visible in sidebar footer
- Also accessible via header button at all times

---

## 11. Modals

| Modal | Trigger | Key Fields |
|---|---|---|
| New Blast Day | FAB on Dashboard | Job, Date, Type of Work (Drill Only / Drill to Blast / Blasting / Crushing), Copy from previous option |
| Copy from Previous | New Blast Day modal | Select previous blast day, checkboxes for: Blast Info, Drill Params, Design Plan, Explosives, Crew & Equipment |
| Add Shot | "+ Add Shot" button | Shot time, Copy from existing shot or blank, Number of holes |
| Conditions | "Edit" on conditions bar | Temperature, Weather, Wind direction, Ground condition, Fire Detail |
| Product Picker | "+ Add Product" | Search, manufacturer filter chips, products grouped by category, weight multiplier shown |
| Crew Members | Settings → Crew | Add/edit/delete crew with name and role |
| Equipment & Vehicles | Settings → Equipment | Add/edit/delete items, categorized (Vehicles, Drills, Seismo) |
| Add License | Settings → + Add License | State, License number, Expiration date |
| Regulations | Settings → Regulations | 3-tab (Federal/State/Local) regulation management |
| New Job | Jobs → FAB | Job name, Address, City, State, Customer, Rock Type, K Factor, Closest Structure |
| Add Attachment | Attachments "+ " | File picker for photos, documents, videos |

---

## 12. Data Model (Logical)

### 12.1 Job

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | string | e.g., "Stevens Quarry" |
| customer | string | |
| address | string | Full street address |
| city | string | |
| state | string | 2-letter state code |
| rockType | enum | Granite, Trap Rock, Limestone |
| kFactor | number | Default K factor for compliance calcs |
| closestStructure | string | Description + distance |
| status | enum | Active, Completed, Archived |

### 12.2 Blast Day

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| jobId | FK → Job | |
| date | date | |
| typeOfWork | enum | Drill Only, Drill to Blast, Blasting, Crushing |
| status | enum | Draft, In Progress, Complete |
| conditions | object | temp, weather, wind, ground, fireDetail |
| attachments | array | File refs |
| signoff | object | blasterId, licenseNum, state, deliveryOnsite, signatureDataUrl |

### 12.3 Blast Log (1:1 with Blast Day)

| Field | Type | Notes |
|---|---|---|
| blastDayId | FK | |
| operation | enum | Construction, Quarry, Trench, Open |
| rockType | enum | |
| terrain | enum | Flat, Hilly, Slope |
| hazards | string[] | Multi-select |
| precautions | string[] | Multi-select |
| shots | array | Shot[] |
| explosiveTotals | array | ExplosiveLine[] |
| boosters | array | ExplosiveLine[] |
| detonators | array | DetonatorLine[] |

### 12.4 Shot

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| blastLogId | FK | |
| shotNumber | number | Sequential per blast day |
| time | time | |
| blastMats | boolean | |
| holeDiameter | number | inches |
| burden | number | feet |
| spacing | number | feet |
| stemming | number | feet |
| numHoles | number | |
| avgDepth | number | feet |
| designPlan | DesignPlan | |
| seismoReadings | SeismoReading[] | |

### 12.5 Design Plan (1:1 with Shot)

| Field | Type | Notes |
|---|---|---|
| shotId | FK | |
| holeGrid | HoleGrid | Delay assignments + wire connections |
| typicalColumns | TypicalColumn[] | Multiple named columns |
| structureDistance | number | feet |
| maxChargeWeight | number | lbs |
| kFactor | number | Overrides job default if set |

### 12.6 Explosive Line (Totals)

| Field | Type |
|---|---|
| productId | FK → Product Catalog |
| quantity | number |
| weightPerUnit | number (lbs) |
| totalLbs | computed |

### 12.7 Seismo Reading

| Field | Type |
|---|---|
| capturedAt | datetime |
| imageUrl | string |
| ppv | number (in/s) |
| frequency | number (Hz) |
| compliant | boolean |

### 12.8 Product (Catalog)

| Field | Type |
|---|---|
| id | UUID |
| name | string |
| manufacturer | enum |
| category | enum (Blasting Agent, High Explosive, Booster) |
| weightMultiplier | number (lbs/unit) |
| form | string (Prilled, Pumpable, Cast, etc.) |

---

## 13. Calculations (Shared Library)

All formulas must live in `packages/shared/` so they run identically on client and server.

| Calculation | Formula | Notes |
|---|---|---|
| Scaled Distance | SD = D / √W | D = distance to structure (ft), W = max charge weight per delay (lbs) |
| Predicted PPV | PPV = K × (D/√W)^-1.6 | K from job record |
| USBM RI8507 Limit | Lookup by ZC frequency | Frequency-dependent table |
| OSM Limit | Lookup by distance zone | Distance-dependent table |
| Powder Factor | PF = Total Lbs / Total Yd³ | Per shot and per blast day |
| Rock Volume | V = (Burden × Spacing × Depth) × # Holes / 27 | Cubic yards |
| Drill Footage | DF = Avg Depth × # Holes | Linear feet |
| Loading Density | LD = Total Lbs / Drill Footage | Lbs/ft |
| Per-Shot Explosive Distribution | Per-shot qty = Total qty × (shot holes / total holes) | Auto-distributed, overridable |

---

## 14. Offline / Sync Architecture

### 14.1 Offline-First Storage

- All data written to IndexedDB via Dexie.js on every save
- App fully functional without network — zero dependency on server for core workflows
- Service worker (Workbox via vite-plugin-pwa) caches all app assets

### 14.2 Sync Strategy

- Custom REST endpoints on Node.js/Express server
- Timestamp-based last-write-wins conflict resolution
- Sync triggered when connectivity is restored
- Online status badge in header reflects current state

### 14.3 Server Database

- PostgreSQL + Prisma ORM
- Schema mirrors the logical data model above

---

## 15. Auto-Population Rules

These rules reduce redundant data entry:

| Target Field | Source | Trigger |
|---|---|---|
| Blast Log rock type, operation | Job defaults | New blast day created |
| K Factor | Job defaults | New blast day created |
| Blaster license | License record matching job state | Sign-off section |
| Daily Report crew list | Settings → Crew Roster | New blast day created |
| Daily Report equipment list | Settings → Equipment | New blast day created |
| Conditions (weather) | NWS API by job address | New blast day created |
| Per-shot explosive quantities | Explosive Totals sidebar | Any totals change |
| Powder Factor | Total lbs + Total yd³ | Any quantity or dimension change |
| Compliance badges | Structure distance + charge weight | Any relevant field change |

---

## 16. Regulation Compliance System

### 16.1 Regulation Stack

Three tiers evaluated per shot, most restrictive wins:

1. **Federal** (always active): USBM RI8507, OSMRE
2. **State** (auto-mapped by job address): e.g., MA 540 CMR 7.00
3. **Local/Municipal** (manually configured per job): e.g., Whately Bylaw 1.0 in/s

### 16.2 Per-Shot Evaluation (Design Plan)

- Each applicable regulation evaluated and displayed as a row
- Shows: regulation name, limit, calculated PPV, PASS/FAIL
- Summary line: "Most restrictive: X in/s — Y% of limit"

### 16.3 Compliance Badge Bar

- Summary chips displayed on Design Plan screen and on Blast Day seismo summary
- Updates live as inputs change

---

## 17. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Offline | Full CRUD on blast days, shots, design plans without network |
| Performance | App loads in < 3 seconds on Android tablet on LTE |
| Data integrity | No data loss on page close / device sleep |
| Camera | Access device camera for seismograph capture |
| Print | PDF-quality output for Blasting Log and Daily Report |
| Security | JWT auth; all sync over HTTPS |
| TypeScript | Strict mode throughout — no `any` |
| Testing | Vitest unit tests for all calculations in `packages/shared/` |

---

## 18. Out of Scope (MVP)

- Multi-user / team features
- iOS native app
- Real-time NWS weather API integration (shown as mock in prototype)
- Real OCR for seismograph printouts (shown as mock)
- Customer portal / report delivery
- Billing / invoicing
- Map-based site diagram drawing (Leaflet placeholder shown; full feature post-MVP)
