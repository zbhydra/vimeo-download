#!/usr/bin/env node
/** 在显式目标条目的各后台页读取按钮状态。 */
import { connectPage, findCwsPage, getCwsPageUrl } from './cdp-helper.mjs';

const targetUrl = process.argv[2];
const page = await findCwsPage(targetUrl, 'listing');
const cdp = await connectPage(page.id);

for (const name of ['status', 'listing', 'privacy', 'package', 'distribution']) {
  const url = getCwsPageUrl(targetUrl, name);
  await cdp.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 6000));
  const info = await cdp.evalJs(`(()=>{
    const btns = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim().slice(0,60),
      disabled: b.disabled || b.getAttribute('aria-disabled')==='true',
    })).filter(b=>b.text.length>0 && b.text.length<50);
    return { btns: btns.slice(0,20) }
  })()`);
  console.log('\n=== ' + name + ' ===');
  console.log(JSON.stringify(info, null, 2));
}

await cdp.close();
process.exit(0);
