#!/usr/bin/env node
import { connectPage, findListingPage } from './cdp-helper.mjs';

const page = await findListingPage();
const cdp = await connectPage(page.id);
const parts = page.url.match(/\/devconsole\/([^/]+)\/([^/]+)\//);

await cdp.send('Page.navigate', { url: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/distribution` });
await new Promise(r => setTimeout(r, 5000));

// Scroll button into view and click it
const btnRect = await cdp.evalJs(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('為何無法提交'));if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
console.log('help btn rect:', btnRect);
await new Promise(r => setTimeout(r, 400));
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnRect.x, y: btnRect.y });
await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 });
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 });
await new Promise(r => setTimeout(r, 1500));

const popup = await cdp.evalJs(`(()=>{
  const ds=Array.from(document.querySelectorAll('[role=dialog],[role=tooltip],[role=alertdialog]')).filter(d=>d.offsetParent!==null||getComputedStyle(d).display!=='none');
  return ds.map(d=>({role:d.getAttribute('role'),text:(d.innerText||'').slice(0,800)}))
})()`);
console.log('\npopup:', JSON.stringify(popup, null, 2));

// Also dump any visible tooltip / alert / issue list near the submit area
const issues = await cdp.evalJs(`(()=>{
  const all = Array.from(document.querySelectorAll('[role=alert],[role=tooltip],[role=dialog],.FWWsge,[jsname]'));
  const texts = all.map(e=>({role:e.getAttribute('role')||e.tagName,text:(e.innerText||'').slice(0,300).replace(/\\s+/g,' ')})).filter(x=>x.text && x.text.length>10 && x.text.length<400);
  const body = document.body.innerText;
  const blockers = body.split('\\n').filter(l=>l.includes('必要')||l.includes('未完成')||l.includes('必填')||l.includes('請填寫')||l.includes('缺少')||l.includes('尚未')||l.includes('超出')||l.includes('超過')||l.includes('error'));
  return { texts: texts.slice(0,15), blockers: blockers.slice(0,15) }
})()`);
console.log('\nissues:', JSON.stringify(issues, null, 2));

await cdp.close();
process.exit(0);
