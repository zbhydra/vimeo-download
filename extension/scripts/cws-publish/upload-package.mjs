#!/usr/bin/env node
// Upload dist.zip to the CWS package page via CDP.
// Bypasses the native OS file chooser by using Page.setInterceptFileChooserDialog + DOM.setFileInputFiles.
//
// Usage:
//   node scripts/cws-publish/upload-package.mjs
//   node scripts/cws-publish/upload-package.mjs path/to/custom.zip
//
// Requirements: same CDP setup as other scripts here. The browser must have the extension's
// devconsole /edit/package page open and signed in.
//
// Why it's trickier than `agent-browser upload`: CWS lazily creates the file input only after
// the "上傳新套件" button is clicked, and clicking normally opens a native file chooser dialog.
// The flow here:
//   1. Intercept the chooser dialog (so it never actually opens).
//   2. Trigger the button click via JS (creates the <input type=file> in the DOM).
//   3. Wait for Page.fileChooserOpened OR poll the DOM for the new input.
//   4. DOM.setFileInputFiles with the backendNodeId.
//   5. Poll the draft version cell until it reflects dist/manifest.json's version.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectPage, findPackagePage } from './cdp-helper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ZIP = path.resolve(process.argv[2] || path.join(REPO_ROOT, 'dist.zip'));
if (!fs.existsSync(ZIP)) { console.error(`zip not found: ${ZIP}`); process.exit(2); }

const MANIFEST = path.join(REPO_ROOT, 'dist', 'manifest.json');
let expectedVersion = null;
if (fs.existsSync(MANIFEST)) {
  try { expectedVersion = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')).version; } catch {}
}
console.log(`uploading ${ZIP} (expect draft version → ${expectedVersion ?? 'unknown'})`);

const pkg = await findPackagePage();
if (!pkg) { console.error('no CWS devconsole tab open'); process.exit(2); }
const cdp = await connectPage(pkg.id);

if (!pkg.url.includes('/edit/package')) {
  const parts = pkg.url.match(/\/devconsole\/([^/]+)\/([^/]+)\//);
  if (!parts) { console.error('cannot derive package URL'); process.exit(2); }
  await cdp.send('Page.navigate', { url: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/package` });
  await new Promise(r => setTimeout(r, 5000));
}

const btnState = await cdp.evalJs(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='上傳新套件');if(!b)return {exists:false};return {exists:true,disabled:b.disabled||b.getAttribute('aria-disabled')==='true'}})()`);
if (!btnState.exists) { console.error('「上傳新套件」button not found on page'); process.exit(1); }
if (btnState.disabled) {
  console.error('「上傳新套件」is disabled — the draft is likely in review. Cancel review first (in CWS dashboard) or use 復原至前一個版本.');
  process.exit(1);
}

// Prepare file chooser interception
await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
await new Promise(r => setTimeout(r, 500));

// Listen for fileChooserOpened
let fcResolved = null;
const fcPromise = new Promise((resolve) => { fcResolved = resolve; });
cdp.onEvent((msg) => {
  if (msg.method === 'Page.fileChooserOpened' && fcResolved) {
    const r = fcResolved; fcResolved = null;
    r(msg.params);
  }
});

// Install a MutationObserver that captures the input as a backup path
await cdp.evalJs(`(()=>{
  if (window.__cwsUploadInput) return 'already installed';
  window.__cwsUploadInput = null;
  const obs = new MutationObserver(() => {
    const i = document.querySelector('input[type=file][accept*=zip]');
    if (i) window.__cwsUploadInput = i;
  });
  obs.observe(document.body, { childList: true, subtree: true });
  window.__cwsUploadObserver = obs;
  return 'installed';
})()`);

// Click the button
await cdp.evalJs(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='上傳新套件');b.click();return 'clicked'})()`);
console.log('button clicked, waiting for file chooser / input...');

// Wait for either the event or the DOM observer to find the input
let backendNodeId = null;
const deadline = Date.now() + 15000;
while (Date.now() < deadline && !backendNodeId) {
  // race the event
  const raced = await Promise.race([
    fcPromise.then(p => ({ src: 'event', params: p })).catch(() => null),
    new Promise(r => setTimeout(() => r(null), 300)),
  ]);
  if (raced?.src === 'event' && raced.params?.backendNodeId) {
    backendNodeId = raced.params.backendNodeId;
    console.log(`got backendNodeId via fileChooserOpened: ${backendNodeId}`);
    break;
  }
  const r = await cdp.send('Runtime.evaluate', {
    expression: `window.__cwsUploadInput || document.querySelector('input[type=file][accept*=zip]')`,
    returnByValue: false,
  });
  if (r.result?.objectId) {
    const n = await cdp.send('DOM.requestNode', { objectId: r.result.objectId });
    const d = await cdp.send('DOM.describeNode', { nodeId: n.nodeId });
    backendNodeId = d.node.backendNodeId;
    console.log(`got backendNodeId via DOM: ${backendNodeId}`);
    await cdp.send('Runtime.releaseObject', { objectId: r.result.objectId });
    break;
  }
}

if (!backendNodeId) { console.error('no file input appeared within timeout'); process.exit(1); }

await cdp.send('DOM.setFileInputFiles', { files: [ZIP], backendNodeId });
console.log('setFileInputFiles sent, waiting for CWS to parse upload...');

// Also dispatch input/change in case React is listening
await cdp.evalJs(`(()=>{const i=window.__cwsUploadInput||document.querySelector('input[type=file][accept*=zip]');if(i){i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('input',{bubbles:true}))}})()`);

// Poll for version change (up to 60s)
const pollDeadline = Date.now() + 60000;
let lastVer = null;
while (Date.now() < pollDeadline) {
  await new Promise(r => setTimeout(r, 2000));
  const info = await cdp.evalJs(`(()=>{
    const rows = Array.from(document.querySelectorAll('tr'));
    const draftVer = rows.find(r => /草稿|Draft/.test(r.closest('table')?.previousElementSibling?.innerText || '') || rows.indexOf(r) === 0);
    const allVers = rows.filter(r => r.innerText.startsWith('版本')).map(r => r.innerText.replace(/\\s+/g,' '));
    const body = document.body.innerText;
    const errs = body.match(/(錯誤|失敗|超過|超出|error|failed)[^\\n]{0,160}/gi);
    return { vers: allVers, errs: errs ? errs.slice(0,3) : [] }
  })()`);
  lastVer = info.vers[0];
  if (expectedVersion && info.vers.some(v => v.includes(expectedVersion))) {
    console.log(`draft now shows ${expectedVersion}`);
    if (info.errs.length) console.log(`warnings: ${JSON.stringify(info.errs)}`);
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
    await cdp.close();
    process.exit(0);
  }
  if (info.errs.length) {
    console.error(`CWS error: ${JSON.stringify(info.errs)}`);
    await cdp.close();
    process.exit(1);
  }
}
console.log(`timed out; last draft version seen: ${lastVer}`);
await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
await cdp.close();
process.exit(1);
