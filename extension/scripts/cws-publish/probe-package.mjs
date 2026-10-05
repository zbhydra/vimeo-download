#!/usr/bin/env node
// Read-only probe of the CWS package page: reports current draft version, warnings, and submit button state.
// 用法：node scripts/cws-publish/probe-package.mjs <目标后台URL>

import { connectPage, findCwsPage } from './cdp-helper.mjs';

const pkg = await findCwsPage(process.argv[2], 'package');

const cdp = await connectPage(pkg.id);

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
