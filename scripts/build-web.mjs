#!/usr/bin/env node
// Build the web app for Vercel (Round S11, Sep 13 2026).
//
//   node scripts/build-web.mjs
//
// 1. Picks ONE build id and hands it to Vite (SHOTLOG_BUILD_ID) so the app
//    reports the same id the source maps are filed under.
// 2. Runs `vite build` with hidden source maps.
// 3. Uploads dist/**/*.map to the API (SOURCEMAP_API_URL, bearer
//    SOURCEMAP_TOKEN) so crash traces decode to real files and lines in
//    Admin › Feedback › Crashes. Skipped, with a line, when either is unset.
//    NEVER fails the build: a map that does not upload only means a crash
//    trace stays minified until the next build.
// 4. Deletes the .map files from dist — they are never served.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const dist = path.join(web, 'dist');

const buildId = process.env.SHOTLOG_BUILD_ID || new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SHOTLOG_COMMIT ?? '';
console.log(`[build-web] build id "${buildId}"${commit ? ` · commit ${commit.slice(0, 7)}` : ''}`);

execSync('npm run build', {
  cwd: web,
  stdio: 'inherit',
  env: { ...process.env, SHOTLOG_BUILD_ID: buildId, SHOTLOG_COMMIT: commit },
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.map')) out.push(p);
  }
  return out;
}

const maps = walk(dist);
const api = process.env.SOURCEMAP_API_URL;
const token = process.env.SOURCEMAP_TOKEN;
if (maps.length === 0) {
  console.log('[build-web] no source maps in dist (sourcemap off?) — nothing to upload');
} else if (!api || !token) {
  console.log(`[build-web] ${maps.length} map(s) NOT uploaded: set SOURCEMAP_API_URL and SOURCEMAP_TOKEN in the build environment`);
} else {
  // A few files at a time: the API accepts 30 MB per request
  const files = maps.map((p) => ({ file: path.basename(p).replace(/\.map$/, ''), map: fs.readFileSync(p, 'utf8') }));
  let batch = [];
  let size = 0;
  let sent = 0;
  let failed = 0;
  const flush = async () => {
    if (!batch.length) return;
    const names = batch.map((b) => b.file);
    const body = JSON.stringify({ buildId, files: batch });
    batch = [];
    size = 0;
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/platform/sourcemaps`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        failed += names.length;
        console.log(`[build-web] upload of ${names.length} map(s) refused: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
        return;
      }
      sent += names.length;
    } catch (e) {
      failed += names.length;
      console.log(`[build-web] upload of ${names.length} map(s) failed: ${e.message}`);
    }
  };
  // Small batches: the API takes 30 MB of JSON per request and a map's
  // quotes grow when JSON-encoded
  for (const f of files) {
    if (size + f.map.length > 6 * 1024 * 1024) await flush();
    batch.push(f);
    size += f.map.length;
  }
  await flush();
  console.log(`[build-web] uploaded ${sent} source map(s) for build "${buildId}"${failed ? ` — ${failed} NOT uploaded (traces for those files stay minified)` : ''}`);
}
for (const p of maps) fs.rmSync(p);
console.log(`[build-web] removed ${maps.length} .map file(s) from dist`);
