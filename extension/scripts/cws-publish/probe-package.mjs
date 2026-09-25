#!/usr/bin/env node
// Read-only probe of the CWS package page: reports current draft version, warnings, and submit button state.
// Usage: node scripts/cws-publish/probe-package.mjs

import { connectPage, findPackagePage } from './cdp-helper.mjs';

const pkg = await findPackagePage();
if (!pkg) { console.error('no CWS devconsole page open'); process.exit(2); }

const cdp = await connectPage(pkg.id);

if (!pkg.url.includes('/edit/package')) {
  const parts = pkg.url.match(/\/devconsole\/([^/]+)\/([^/]+)\//);
  if (parts) {
    await cdp.send('Page.navigate', { url: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/package` });
    await new Promise(r => setTimeout(r, 5000));
  }
}

const info = await cdp.evalJs(`(()=>{
  const rows = Array.from(document.querySelectorAll('tr')).map(r => r.innerText.replace(/\\n/g,'|')).slice(0, 12);
  const body = document.body.innerText;
  const warns = body.match(/(132|過長|超出|超过|超過|錯誤|失敗|error|警告|Warning)[^\\n]{0,160}/gi);
  const submitBtn = Array.from(document.querySelectorAll('button')).find(b=>['提交審查','Submit for review'].includes(b.textContent.trim()));
  return { rows, warns: warns ? warns.slice(0,5) : [], submitBtnDisabled: submitBtn ? (submitBtn.disabled || submitBtn.getAttribute('aria-disabled')==='true') : null }
})()`);

console.log(JSON.stringify(info, null, 2));
await cdp.close();
process.exit(0);
