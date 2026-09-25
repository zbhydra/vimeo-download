#!/usr/bin/env node
// Verify the "说明" textarea content in CWS matches docs/assets/store/*.txt for each locale.
// Read-only: never modifies, never clicks save.
// Usage: node scripts/cws-publish/verify-descriptions.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectPage, findListingPage } from './cdp-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
// scripts/cws-publish → extension → 仓库根；商店文案在仓库根的 docs/ 下，不在 extension/ 内。
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const STORE = path.join(REPO_ROOT, 'docs', 'assets', 'store');

const LANGS = [
  ['英文 – en (預設)',       'en_US.txt'],
  ['中文（中國） – zh-CN',   'zh_CN.txt'],
  ['中文（台灣） – zh-TW',   'zh_TW.txt'],
  ['日文 – ja',              'ja_JP.txt'],
  ['印尼文 – id',            'id.txt'],
  ['西班牙文 – es',          'es.txt'],
  ['法文 – fr',              'fr.txt'],
  ['俄文 – ru',              'ru.txt'],
  ['泰文 – th',              'th.txt'],
  ['越南文 – vi',            'vi.txt'],
  ['義大利文 – it',          'it.txt'],
  ['德文 – de',              'de.txt'],
  ['韓文 – ko',              'ko_KR.txt'],
  ['葡萄牙文（巴西） – pt-BR', 'pt.txt'],
];

const listing = await findListingPage();
if (!listing) { console.error('no CWS listing page open'); process.exit(2); }
const cdp = await connectPage(listing.id);

async function clickAt(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function esc() {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
async function read() {
  return await cdp.evalJs(`(()=>{const cbs=Array.from(document.querySelectorAll('[role=combobox]'));const lang=cbs.find(c=>c.innerText.includes('語言'));const t=document.querySelector('textarea[maxlength="16000"]');return {combo:lang.innerText.replace(/\\n/g,'|'),len:(t?.value||'').length,head:(t?.value||'').slice(0,60).replace(/\\n/g,' ')}})()`);
}
async function switchTo(label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await esc(); await new Promise(r => setTimeout(r, 300));
    await esc(); await new Promise(r => setTimeout(r, 300));
    await cdp.evalJs('window.scrollTo(0,0)'); await new Promise(r => setTimeout(r, 400));
    const cur = await read();
    if (cur.combo.includes(label)) return;
    const c = await cdp.evalJs(`(()=>{const cbs=Array.from(document.querySelectorAll('[role=combobox]'));const lang=cbs.find(c=>c.innerText.includes('語言'));const r=lang.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    await clickAt(c.x, c.y);
    await new Promise(r => setTimeout(r, 1200));
    const ok = await cdp.evalJs(`(()=>{const lbs=Array.from(document.querySelectorAll('[role=listbox]'));for(const lb of lbs){const m=Array.from(lb.querySelectorAll('[role=option]')).find(o=>o.innerText.trim()===${JSON.stringify(label)});if(m){m.scrollIntoView({block:'center'});m.click();return true;}}return false;})()`);
    if (!ok) continue;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 400));
      const r = await read();
      if (r.combo.includes(label)) { await new Promise(r => setTimeout(r, 1500)); return; }
    }
  }
  throw new Error('switch failed: ' + label);
}

console.log('label                        | file_len | ta_len   | status | head');
let allOk = true;
for (const [label, file] of LANGS) {
  try {
    await switchTo(label);
    const s = await read();
    const expected = fs.readFileSync(path.join(STORE, file), 'utf-8');
    const expectedHead = expected.slice(0, 60).replace(/\n/g, ' ');
    const actualHead = s.head.replace(/\|/g, ' ');
    const match = s.len === expected.length && actualHead.slice(0, 50) === expectedHead.slice(0, 50);
    if (!match) allOk = false;
    console.log(`${label.padEnd(28)} | ${String(expected.length).padStart(8)} | ${String(s.len).padStart(8)} | ${match ? 'OK  ' : 'DIFF'} | ${s.head}`);
  } catch (e) {
    allOk = false;
    console.log(`${label.padEnd(28)} | ERROR: ${e.message}`);
  }
}

await cdp.close();
process.exit(allOk ? 0 : 1);
