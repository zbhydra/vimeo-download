#!/usr/bin/env node
// Click "提交審查" (Submit for review) on the CWS listing/distribution page and confirm the dialog.
// Exits non-zero if the button is disabled (with a hint about why from the on-page help).
//
// Usage: node scripts/cws-publish/submit-review.mjs

import { connectPage, findListingPage } from './cdp-helper.mjs';

const page = await findListingPage();
if (!page) { console.error('no CWS page open'); process.exit(2); }
const cdp = await connectPage(page.id);

const parts = page.url.match(/\/devconsole\/([^/]+)\/([^/]+)\//);
if (!parts) { console.error('cannot derive distribution URL'); process.exit(2); }
const distUrl = `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/distribution`;

await cdp.send('Page.navigate', { url: distUrl });
await new Promise(r => setTimeout(r, 5000));

async function clickAt(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

const state = await cdp.evalJs(`(()=>{
  const btns = Array.from(document.querySelectorAll('button'));
  const submit = btns.find(b => ['提交審查','Submit for review'].includes(b.textContent.trim()));
  if (!submit) return {err:'submit button not found'};
  const rect = submit.getBoundingClientRect();
  return {
    disabled: submit.disabled || submit.getAttribute('aria-disabled')==='true',
    text: submit.textContent.trim(),
    x: Math.round(rect.x + rect.width/2),
    y: Math.round(rect.y + rect.height/2),
    alreadyReview: document.body.innerText.includes('狀態： 待審查') || document.body.innerText.includes('狀態：待審查'),
  }
})()`);

if (state.err) { console.error(state.err); process.exit(1); }
if (state.alreadyReview) { console.log('item is already in review — nothing to submit.'); await cdp.close(); process.exit(0); }
if (state.disabled) {
  // read the "why can't I submit" help
  const why = await cdp.evalJs(`(()=>{
    const h = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('為何無法提交'));
    if (!h) return null;
    h.scrollIntoView({block:'center'});
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }
  })()`);
  if (why) {
    await clickAt(why.x, why.y);
    await new Promise(r => setTimeout(r, 1500));
    const popup = await cdp.evalJs(`(()=>{
      const dlg = Array.from(document.querySelectorAll('[role=alertdialog],[role=dialog]')).filter(d=>(d.innerText||'').length>0).find(d=>d.offsetParent!==null||getComputedStyle(d).display!=='none');
      return dlg ? dlg.innerText.slice(0, 1000) : 'no popup'
    })()`);
    console.error('「提交審查」is disabled. CWS reason:');
    console.error(popup);
  } else {
    console.error('「提交審查」is disabled and no help button found; open the dashboard manually to see why.');
  }
  await cdp.close();
  process.exit(1);
}

console.log(`clicking 「${state.text}」 at ${state.x},${state.y}...`);
await cdp.evalJs(`window.scrollTo(0, 0)`);
await new Promise(r => setTimeout(r, 300));
// Re-read rect after scroll
const rect2 = await cdp.evalJs(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>['提交審查','Submit for review'].includes(x.textContent.trim()));const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
await clickAt(rect2.x, rect2.y);
await new Promise(r => setTimeout(r, 2000));

// Confirm dialog: click the primary "確定" / "送出" / "Submit" button inside the dialog
const confirmed = await cdp.evalJs(`(()=>{
  const dlgs = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog]')).filter(d=>d.offsetParent!==null||getComputedStyle(d).display!=='none');
  for (const dlg of dlgs) {
    const btn = Array.from(dlg.querySelectorAll('button')).find(b => ['確定','確認送出','送出','提交','Submit','Confirm','OK'].some(t => b.textContent.trim().startsWith(t)));
    if (btn) { btn.click(); return {clicked: btn.textContent.trim()} }
  }
  return {clicked: null, dialogs: dlgs.length}
})()`);
console.log('confirm dialog:', JSON.stringify(confirmed));

await new Promise(r => setTimeout(r, 5000));
const after = await cdp.evalJs(`(()=>{const body=document.body.innerText;return {review: body.includes('待審查')||body.includes('In review'), head: body.slice(0,300).replace(/\\s+/g,' ')}})()`);
console.log('after submit:', after);

await cdp.close();
process.exit(after.review ? 0 : 1);
