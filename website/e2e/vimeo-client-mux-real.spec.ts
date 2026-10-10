/** 真实网站授权、跨出口 CDN 下载与 OPFS 合并验收；不替换项目 API。 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { statSync, writeFileSync } from 'node:fs';
import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs';

registerE2eBrowserIdentity(test);

interface StorageEvidence {
  created: string[];
  removed: string[];
  active: string[];
  maxActive: number;
  writes: number;
  maxWriteBytes: number;
}
declare global {
  interface Window { muxStorageEvidence: StorageEvidence }
}
test.afterEach(async ({ page }, testInfo) => {
  if (page.isClosed()) return;
  const storage = await page.evaluate(() => window.muxStorageEvidence).catch(() => null);
  if (storage) writeFileSync(testInfo.outputPath('final-storage-evidence.json'), JSON.stringify(storage, null, 2));
});
interface ParseSource {
  source_id: string;
  resource_token: string;
  download_mode: string;
  size: number | null;
  width?: number;
  height?: number;
  duration?: number;
}
interface MaterialTrack {
  delivery: string;
  size: number | null;
  init_segment?: string;
  segments?: { url: string }[];
}

test('真实网站下载与 OPFS 生命周期', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(90_000);
  const targetUrl = process.env.E2E_MEDIA_URL ?? 'https://vimeo.com/1196869805';
  const failCdn = process.env.E2E_FAIL_CDN === '1';
  // 网页下载固定走匿名授权：每次运行使用全新设备，不依赖登录态。
  const deviceId = randomUUID();
  const apiBase = new URL(process.env.E2E_REAL_API_BASE_URL ?? '');
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(apiBase.hostname);
  const apiEvents: { path: string; status: number; code?: number }[] = [];
  const materials: { mode: string; videoDelivery?: string; audioDelivery?: string; videoSegments?: number; audioSegments?: number; hasInit?: boolean }[] = [];
  const cdnHosts = new Set<string>();
  let cdnResponses = 0;
  let finishedCdn = 0;
  let blockedCdn = 0;
  let startedCdn = 0;
  const cdnOrdinals = new WeakMap<object, number>();
  const cdnFailures: { host: string; segmentOrdinal?: number; status?: number; error?: string }[] = [];
  const pendingResponses: Promise<void>[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('.vimeocdn.com') && request.resourceType() === 'fetch') {
      cdnOrdinals.set(request, ++startedCdn);
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/client/media/')) {
      console.log(JSON.stringify({ phase: 'api_network_failure', path: url.pathname, error: request.failure()?.errorText }));
    }
    if (url.hostname.endsWith('.vimeocdn.com') && request.resourceType() === 'fetch') {
      cdnFailures.push({ host: url.hostname, segmentOrdinal: cdnOrdinals.get(request), error: request.failure()?.errorText });
      writeFileSync(testInfo.outputPath('cdn-failures.json'), JSON.stringify(cdnFailures, null, 2));
      console.log(JSON.stringify({ phase: 'cdn_failure', ...cdnFailures.at(-1) }));
    }
  });
  page.on('requestfinished', request => {
    if (new URL(request.url()).hostname.endsWith('.vimeocdn.com') && request.resourceType() === 'fetch') finishedCdn++;
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/client/media/')) {
      const event: { path: string; status: number; code?: number } = { path: url.pathname, status: response.status() };
      apiEvents.push(event);
      pendingResponses.push(response.json().then((body: { code?: number; data?: { material?: { download_mode?: string; video_track?: MaterialTrack; audio_track?: MaterialTrack } } }) => {
        event.code = body.code;
        console.log(JSON.stringify({ phase: 'api', ...event }));
        writeFileSync(testInfo.outputPath('api-evidence.json'), JSON.stringify({ targetUrl, apiEvents }, null, 2));
        if (url.pathname.endsWith('/download-anonymous-pre-v2') && body.data?.material?.download_mode) {
          const materialData = body.data.material;
          const material = { mode: materialData.download_mode!, videoDelivery: materialData.video_track?.delivery, audioDelivery: materialData.audio_track?.delivery,
            videoSegments: materialData.video_track?.segments?.length, audioSegments: materialData.audio_track?.segments?.length,
            hasInit: Boolean(materialData.video_track?.init_segment && materialData.audio_track?.init_segment) };
          materials.push(material);
          console.log(JSON.stringify({ phase: 'materials', ...material }));
        }
      }).catch(() => {}));
    }
    if (url.hostname.endsWith('.vimeocdn.com') && response.request().resourceType() === 'fetch') {
      cdnHosts.add(url.hostname);
      if (response.ok()) cdnResponses++;
      else {
        cdnFailures.push({ host: url.hostname, segmentOrdinal: cdnOrdinals.get(response.request()), status: response.status() });
        writeFileSync(testInfo.outputPath('cdn-failures.json'), JSON.stringify(cdnFailures, null, 2));
        console.log(JSON.stringify({ phase: 'cdn_failure', ...cdnFailures.at(-1) }));
      }
    }
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') && url.origin !== apiBase.origin) {
      throw new Error(`API 未指向本地后端：${url.origin}`);
    }
    if (failCdn && finishedCdn > 0 && url.hostname.endsWith('.vimeocdn.com') && route.request().resourceType() === 'fetch') {
      blockedCdn++;
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });
  await context.addInitScript(({ deviceId }) => {
    localStorage.setItem('homepage_device_id_v2', deviceId);
    const evidence: StorageEvidence = { created: [], removed: [], active: [], maxActive: 0, writes: 0, maxWriteBytes: 0 };
    window.muxStorageEvidence = evidence;
    const getFileHandle = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (name, options) {
      const handle = await getFileHandle.call(this, name, options);
      if (options?.create && name.startsWith('download_temp_')) {
        evidence.created.push(name);
        evidence.active.push(name);
        evidence.maxActive = Math.max(evidence.maxActive, evidence.active.length);
      }
      return handle;
    };
    const removeEntry = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function (name, options) {
      await removeEntry.call(this, name, options);
      if (name.startsWith('download_temp_')) {
        evidence.removed.push(name);
        evidence.active = evidence.active.filter(entry => entry !== name);
      }
    };
    const write = FileSystemWritableFileStream.prototype.write;
    FileSystemWritableFileStream.prototype.write = async function (data) {
      const value = typeof data === 'object' && data !== null && 'data' in data ? data.data : data;
      const size = value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : value instanceof Blob ? value.size : 0;
      evidence.writes++;
      evidence.maxWriteBytes = Math.max(evidence.maxWriteBytes, size);
      await write.call(this, data);
    };
  }, { deviceId });

  let exits: { parser: string; browser: string } | undefined;
  if (process.env.E2E_CDN_PROXY) {
    const directTrace = execFileSync('curl', ['--noproxy', '*', '--connect-timeout', '10', '--max-time', '20', '-fsS', 'https://www.cloudflare.com/cdn-cgi/trace'], { encoding: 'utf8' });
    const directIp = /^ip=(.+)$/m.exec(directTrace)?.[1];
    await page.goto('https://www.cloudflare.com/cdn-cgi/trace', { waitUntil: 'domcontentloaded' });
    const browserIp = /^ip=(.+)$/m.exec(await page.locator('body').innerText())?.[1];
    expect(directIp).toBeTruthy();
    expect(browserIp).toBeTruthy();
    expect(browserIp).not.toBe(directIp);
    const fingerprint = (ip: string) => createHash('sha256').update(ip).digest('hex').slice(0, 12);
    exits = { parser: fingerprint(directIp!), browser: fingerprint(browserIp!) };
    console.log(JSON.stringify({ phase: 'distinct_public_ips', ...exits }));
  }
  const logo = page.waitForResponse(response => response.url().includes('/assets/icons/logo.svg') && response.ok());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await logo;
  await page.fill('[data-download-parse-input]', targetUrl);
  const parseResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/client/media/parse-v2', { timeout: 90_000 });
  await page.click('[data-download-parse-submit]');
  const parsed: { code: number; data: { resources?: ParseSource[]; messages?: { sources: ParseSource[] }[] } } = await (await parseResponse).json();
  expect(parsed.code).toBe(10000);
  const source = parsed.data.resources?.[0] ?? parsed.data.messages?.[0]?.sources[0];
  expect(source?.resource_token).toBeTruthy();
  if (!source) throw new Error('parse-v2 缺少资源');
  if (targetUrl.includes('vimeo.com')) expect(source.download_mode).toBe('client_mux');
  console.log(JSON.stringify({ phase: 'parsed', targetUrl, mode: source.download_mode, size: source.size }));
  const button = page.locator('[data-download-resource-button]').first();
  await expect(button).toBeVisible({ timeout: 90_000 });
  const downloadTimeout = (source.size ?? 0) > 50 * 1024 * 1024 ? 25 * 60_000 : 180_000;
  const downloadEvent = failCdn ? undefined : Promise.race([
    page.waitForEvent('download', { timeout: downloadTimeout }),
    page.locator('[data-download-parse-error]').waitFor({ state: 'visible', timeout: downloadTimeout }).then(async () => {
      throw new Error(`网站下载错误：${await page.locator('[data-download-parse-error]').innerText()}`);
    }),
  ]);
  await button.click();
  const monitor = setInterval(() => {
    void page.evaluate(() => {
      const storage = window.muxStorageEvidence;
      return { label: document.querySelector('[data-download-resource-button]')?.textContent?.trim(), storage };
    }).then(snapshot => {
      writeFileSync(testInfo.outputPath('progress-evidence.json'), JSON.stringify(snapshot, null, 2));
      console.log(JSON.stringify({ phase: 'progress', label: snapshot.label, activeFiles: snapshot.storage.active.length,
        removedFiles: snapshot.storage.removed.length, writes: snapshot.storage.writes, maxWriteBytes: snapshot.storage.maxWriteBytes }));
    }).catch(() => {});
  }, 30_000);
  page.once('close', () => clearInterval(monitor));
  if (failCdn) {
    await expect.poll(() => blockedCdn, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
    expect(finishedCdn).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-download-parse-error]')).toBeVisible({ timeout: 180_000 });
    await expect.poll(() => page.evaluate(() => window.muxStorageEvidence.active.length), { timeout: 120_000 }).toBe(0);
  } else {
    const download = await downloadEvent!;
    const filePath = testInfo.outputPath('download.mp4');
    await download.saveAs(filePath);
    const size = statSync(filePath).size;
    expect(size).toBeGreaterThan(0);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration,size', '-of', 'json', filePath], { encoding: 'utf8' })) as {
      streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
      format: { duration: string; size: string };
    };
    expect(probe.streams.some(stream => stream.codec_type === 'video')).toBe(true);
    if (source.download_mode === 'client_mux') {
      expect(probe.streams.some(stream => stream.codec_type === 'audio')).toBe(true);
      const beforeCleanup = await page.evaluate(() => window.muxStorageEvidence);
      expect(beforeCleanup.created).toHaveLength(3);
      expect(beforeCleanup.maxActive).toBe(3);
      expect(beforeCleanup.removed).toHaveLength(2);
      expect(beforeCleanup.active).toHaveLength(1);
      expect(beforeCleanup.maxWriteBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
      await expect.poll(() => page.evaluate(() => window.muxStorageEvidence.active.length), { timeout: 75_000 }).toBe(0);
    }
    if (source.duration) expect(Math.abs(Number(probe.format.duration) - source.duration)).toBeLessThan(2);
    const video = probe.streams.find(stream => stream.codec_type === 'video');
    if (source.width) expect(video?.width).toBe(source.width);
    if (source.height) expect(video?.height).toBe(source.height);
    if (source.size) expect(Math.abs(size - source.size)).toBeLessThan(Math.max(65536, source.size * 0.02));
    console.log(JSON.stringify({ phase: 'saved', size, probe }));
  }
  await Promise.all(pendingResponses);
  const storage = await page.evaluate(() => window.muxStorageEvidence);
  const evidence = { targetUrl, exits, failCdn, blockedCdn, finishedCdn, apiEvents, materials, cdnHosts: [...cdnHosts], cdnResponses, cdnFailures, storage, pageErrors };
  writeFileSync(testInfo.outputPath('evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ phase: 'complete', ...evidence }));
  expect(apiEvents.some(event => event.path.endsWith('/download-anonymous-pre-v2') && event.code === 10000)).toBe(true);
  expect(apiEvents.some(event => event.path.endsWith('/download-pre-v2') && !event.path.endsWith('/download-anonymous-pre-v2'))).toBe(false);
  expect(apiEvents.some(event => event.path.endsWith('/download-v2'))).toBe(false);
  if (!failCdn && targetUrl.includes('vimeo.com')) expect(cdnResponses).toBeGreaterThan(0);
  if (targetUrl.includes('vimeo.com')) expect(materials[0]).toMatchObject({ mode: 'client_mux', videoDelivery: 'segments', audioDelivery: 'segments', hasInit: true });
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('complete.png'), fullPage: true });
});
