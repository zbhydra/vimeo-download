#!/usr/bin/env node
import { connectPage, findListingPage } from './cdp-helper.mjs';

const page = await findListingPage();
if (!page) { console.error('no CWS page open'); process.exit(2); }
const cdp = await connectPage(page.id);

const parts = page.url.match(/\/devconsole\/([^/]+)\/([^/]+)\//);
const urls = {
  status:  `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/status`,
  listing: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/listing`,
  privacy: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/privacy`,
  package: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/package`,
  distribution: `https://chrome.google.com/webstore/devconsole/${parts[1]}/${parts[2]}/edit/distribution`,
};

for (const [name, url] of Object.entries(urls)) {
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
