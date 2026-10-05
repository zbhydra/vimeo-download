/** CWS 目标页选择与原生 WebSocket CDP 通信。 */

/** 连接指定本地 CDP page，返回命令、求值和事件接口。 */
export async function connectPage(pageId, { cdpHost = '127.0.0.1', cdpPort = 9222 } = {}) {
  const ws = new WebSocket(`ws://${cdpHost}:${cdpPort}/devtools/page/${pageId}`);
  let idCounter = 0;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    }
    if (msg.method) listeners.forEach(l => l(msg));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`CDP 连接失败: pageId=${pageId}，请检查浏览器调试端口后重试`)), { once: true });
  });

  function send(method, params = {}) {
    const id = ++idCounter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP 请求超时: pageId=${pageId}, method=${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
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

/** 从显式后台条目 URL 生成同一 publisher/extension 的指定页面。 */
export function getCwsPageUrl(targetUrl, section) {
  let url;
  try { url = new URL(targetUrl); } catch {
    throw new Error(`CWS 目标 URL 无效: ${targetUrl ?? '(未提供)'}，请传入目标扩展的完整后台 /edit/ 页面 URL`);
  }
  const match = /^\/webstore\/devconsole\/([A-Za-z0-9_-]+)\/([a-p]{32})\/edit\/(package|listing|privacy|distribution|status)\/?$/.exec(url.pathname);
  if (url.origin !== 'https://chrome.google.com' || !match || url.username || url.password) {
    throw new Error(`CWS 目标 URL 无效: ${targetUrl}，请使用 https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/<页面>`);
  }
  return `${url.origin}/webstore/devconsole/${match[1]}/${match[2]}/edit/${section}`;
}

/** 精确选择指定页面；未打开或有重复页时拒绝操作。 */
export function selectCwsPage(pages, expectedUrl) {
  const matches = pages.filter(page => {
    const url = new URL(page.url);
    return page.type === 'page' && `${url.origin}${url.pathname}` === expectedUrl;
  });
  if (matches.length !== 1) {
    throw new Error(`CWS 目标页匹配 ${matches.length} 个: ${expectedUrl}，请只保留一个该页面后重试`);
  }
  return matches[0];
}

/** 查询本地 CDP，并仅返回显式目标条目的指定页面。 */
export async function findCwsPage(targetUrl, section, { cdpHost = '127.0.0.1', cdpPort = 9222 } = {}) {
  const expectedUrl = getCwsPageUrl(targetUrl, section);
  const res = await fetch(`http://${cdpHost}:${cdpPort}/json`);
  const tabs = await res.json();
  return selectCwsPage(tabs, expectedUrl);
}
