import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function resolveWs() {
  try { return require('ws'); } catch {}
  const candidates = [
    '/Users/hydra/.nvm/versions/node/v24.13.0/lib/node_modules/agent-browser/node_modules/ws',
  ];
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  throw new Error('ws module not found; install via `pnpm add -D ws` or ensure agent-browser is installed globally');
}
const WebSocket = resolveWs();

export async function connectPage(pageId, { cdpHost = '127.0.0.1', cdpPort = 9222 } = {}) {
  const ws = new WebSocket(`ws://${cdpHost}:${cdpPort}/devtools/page/${pageId}`);
  let idCounter = 0;
  const pending = new Map();
  const listeners = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    }
    if (msg.method) listeners.forEach(l => l(msg));
  });

  await new Promise(r => ws.once('open', r));

  function send(method, params = {}) {
    const id = ++idCounter;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`cdp timeout: ${method}`)); } }, 30000);
    });
  }

  async function evalJs(expression, returnByValue = true) {
    const r = await send('Runtime.evaluate', {
      expression: `(()=>{try{return ${expression}}catch(e){return {__err:e.message}}})()`,
      returnByValue,
      awaitPromise: true,
    });
    return r.result.value;
  }

  function onEvent(fn) { listeners.push(fn); }
  async function close() { ws.close(); }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  return { send, evalJs, onEvent, close };
}

export async function listCwsPages({ cdpHost = '127.0.0.1', cdpPort = 9222 } = {}) {
  const res = await fetch(`http://${cdpHost}:${cdpPort}/json`);
  const tabs = await res.json();
  return tabs.filter(t => t.type === 'page' && t.url.includes('chrome.google.com/webstore/devconsole'));
}

export async function findPackagePage(opts) {
  const pages = await listCwsPages(opts);
  return pages.find(p => p.url.includes('/edit/package')) || pages.find(p => p.url.includes('/edit')) || pages[0];
}

export async function findListingPage(opts) {
  const pages = await listCwsPages(opts);
  return pages.find(p => p.url.includes('/edit/listing')) || pages.find(p => p.url.includes('/edit')) || pages[0];
}
