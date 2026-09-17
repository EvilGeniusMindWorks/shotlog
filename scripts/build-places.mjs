#!/usr/bin/env node
// S22 (Matthew, Sep 16 2026): "nearest 3 hospitals, nearest 3 urgent care" —
// the hospitals come from the federal list, bundled with the app: CMS's
// Hospital General Information (every Medicare-certified hospital, with its
// address, phone and whether it has an emergency department), placed at its
// ZIP's centre point from the Census gazetteer. Public-domain data, refreshed
// a few times a year by running this script:
//
//   node scripts/build-places.mjs            # downloads both sources
//   node scripts/build-places.mjs --from DIR # uses cms-hospitals.csv + 2023_Gaz_zcta_national.txt in DIR
//
// Writes apps/server/data/hospitals-ne.json — New England plus New York.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATES = new Set(['MA', 'NH', 'VT', 'CT', 'RI', 'ME', 'NY']);
const CMS_URL = 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0/download?format=csv';
const GAZ_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip';
const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../apps/server/data/hospitals-ne.json');

const argv = process.argv.slice(2);
const fromDir = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : null;

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/** A small CSV reader: quoted fields, commas inside quotes, CRLF */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const cmsCsv = fromDir ? fs.readFileSync(path.join(fromDir, 'cms-hospitals.csv'), 'utf8') : await text(CMS_URL);
let gaz;
if (fromDir) gaz = fs.readFileSync(path.join(fromDir, '2023_Gaz_zcta_national.txt'), 'utf8');
else {
  // the gazetteer ships zipped; unzip needs a tool — ask for --from when the zip is downloaded by hand
  throw new Error('Download the gazetteer zip, unzip it next to cms-hospitals.csv, and run with --from DIR: ' + GAZ_URL);
}

const zip = new Map();
for (const line of gaz.split('\n').slice(1)) {
  const [geoid, , , , , lat, lng] = line.split('\t').map((s) => s.trim());
  if (geoid && lat && lng) zip.set(geoid, { lat: Number(lat), lng: Number(lng) });
}

const rows = parseCsv(cmsCsv);
const header = rows[0].map((h) => h.replace(/^"|"$/g, '').trim());
const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const iName = col('Facility Name'), iAddr = col('Address'), iCity = col('City/Town'), iState = col('State'), iZip = col('ZIP Code'), iPhone = col('Telephone Number'), iType = col('Hospital Type'), iEr = col('Emergency Services');
if ([iName, iAddr, iCity, iState, iZip, iPhone, iType, iEr].some((i) => i < 0)) throw new Error('CMS columns changed: ' + header.join(' | '));

const out = [];
let unplaced = 0;
for (const r of rows.slice(1)) {
  const state = (r[iState] || '').trim().toUpperCase();
  if (!STATES.has(state)) continue;
  const z = (r[iZip] || '').trim().slice(0, 5);
  const p = zip.get(z);
  if (!p) { unplaced++; continue; }
  const title = (s) => (s || '').trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and');
  out.push({
    name: title(r[iName]),
    address: title(r[iAddr]),
    city: title(r[iCity]),
    state,
    zip: z,
    phone: (r[iPhone] || '').trim(),
    type: (r[iType] || '').trim(),
    er: /^y/i.test((r[iEr] || '').trim()),
    lat: p.lat,
    lng: p.lng,
  });
}
out.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), source: 'CMS Hospital General Information (data.cms.gov, dataset xubh-q36u) placed at the Census 2023 ZCTA centre point', states: [...STATES], rows: out }, null, 0) + '\n');
const er = out.filter((h) => h.er).length;
console.log(`hospitals-ne.json: ${out.length} hospitals in ${[...STATES].join(' ')} (${er} with an emergency department, ${unplaced} without a ZIP point skipped) → ${path.relative(process.cwd(), outFile)}`);
