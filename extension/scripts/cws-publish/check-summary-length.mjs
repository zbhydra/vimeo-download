#!/usr/bin/env node
// Preflight: verify every `public/_locales/<lang>/messages.json` has `extensionDescription.message` ≤ 132 chars.
// CWS rejects a zip upload (rather than surfacing the error inline) if any locale's description is over 132 chars.
// Run this before `pnpm build` to catch the problem earlier.
// Exit code 0 = all good, 1 = one or more locales over limit, 2 = structural issue.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCALES = path.join(REPO_ROOT, 'public', '_locales');
const LIMIT = 132;

if (!fs.existsSync(LOCALES)) {
  console.error(`missing directory: ${LOCALES}`);
  process.exit(2);
}

const dirs = fs.readdirSync(LOCALES).filter(name => fs.statSync(path.join(LOCALES, name)).isDirectory());
if (dirs.length === 0) {
  console.error('no locale directories found');
  process.exit(2);
}

const rows = [];
let failed = 0;
for (const locale of dirs.sort()) {
  const file = path.join(LOCALES, locale, 'messages.json');
  if (!fs.existsSync(file)) { rows.push({ locale, status: 'MISSING', len: null }); failed++; continue; }
  let msg;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    msg = data?.extensionDescription?.message;
  } catch (e) {
    rows.push({ locale, status: `PARSE_ERR: ${e.message}`, len: null }); failed++; continue;
  }
  if (typeof msg !== 'string') { rows.push({ locale, status: 'NO_extensionDescription', len: null }); failed++; continue; }
  const len = msg.length;
  const ok = len <= LIMIT;
  if (!ok) failed++;
  rows.push({ locale, status: ok ? 'OK' : `OVER_LIMIT (+${len - LIMIT})`, len });
}

console.log(`limit = ${LIMIT}`);
console.log('locale  | len | status');
for (const r of rows) console.log(`${r.locale.padEnd(7)} | ${String(r.len ?? '').padStart(3)} | ${r.status}`);

if (failed) {
  console.error(`\n${failed} locale(s) fail preflight`);
  process.exit(1);
}
console.log('\nall locales within limit');
process.exit(0);
