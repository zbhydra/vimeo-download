/**
 * 发布前真实「解析 + 下载 + 文件元数据」验收（真实网络，非 mock）。
 *
 * 运行方式：
 *   E2E_REAL_API_BASE_URL=http://localhost:7900 pnpm exec playwright test --project=parse-download-smoke
 *
 * 每条 URL 都走 UI 完整链路：输入链接 -> 解析 -> 下载解析结果第一个资源。
 * 下载文件会真实落盘到 Playwright 临时目录，并与 parse API 返回的第一个资源元数据比对：
 * - 文件大小：下载字节数必须与 parse size 接近；parse 未给 size 时只要求 > 0。
 * - 视频资源：用 ffprobe 校验 duration、width、height 与 parse 元数据一致。
 *
 * 该用例依赖 global-setup.ts 注入 E2E_ACCESS_TOKEN / E2E_DEVICE_ID。
 */
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs';

registerE2eBrowserIdentity(test);

/** 前端 localStorage 键（与 src/scripts 一致）。 */
const STORAGE_KEYS = {
  /** 网站登录态 access token。 */
  accessToken: 'homepage_access_token',
  /** 设备标识。 */
  deviceId: 'homepage_device_id_v2',
} as const;

interface SmokeCase {
  /** hydra 提供的真实待验收 URL。 */
  url: string;
}

interface CapturedParseResource {
  /** 资源 ID。 */
  sourceId: string;
  /** 服务端签发的资源 token，前端 download-pre-v2 只透传该值。 */
  resourceToken: string;
  /** 文件名。 */
  filename: string;
  /** 资源类型。 */
  type: string;
  /** MIME 类型。 */
  mimeType?: string | null;
  /** 解析返回的资源大小。 */
  size?: number | null;
  /** 视频时长，秒。 */
  duration?: number | null;
  /** 视频宽度。 */
  width?: number | null;
  /** 视频高度。 */
  height?: number | null;
  /** 下载方法。 */
  downloadMode?: string | null;
}

interface CapturedParseResponse {
  /** 原始输入 URL。 */
  inputUrl: string;
  /** 后端 canonical link。 */
  canonicalLink: string;
  /** 后端平台。 */
  platform: string;
  /** 前端会下载的第一个资源。 */
  firstDownloadableResource: CapturedParseResource;
  /** 所有可下载资源数量。 */
  downloadableCount: number;
}

interface ParseUiState {
  /** UI 解析状态。 */
  kind: 'results' | 'error';
  /** UI 展示的解析错误文本。 */
  message: string;
}

interface VideoProbeResult {
  /** 文件真实时长，秒。 */
  duration: number;
  /** 第一条视频流宽度。 */
  width: number;
  /** 第一条视频流高度。 */
  height: number;
}

interface SmokeDownloadResult {
  /** 被验收的输入 URL。 */
  url: string;
  /** 尝试次数。 */
  attempts: number;
  /** 后端平台。 */
  platform: string;
  /** 后端 canonical link。 */
  canonicalLink: string;
  /** 下载的第一个资源。 */
  resource: CapturedParseResource;
  /** 所有可下载资源数量。 */
  downloadableCount: number;
  /** Playwright 保存的文件名。 */
  suggestedFilename: string;
  /** 下载后的真实字节数。 */
  actualSize: number;
  /** ffprobe 读取到的视频元数据；非视频为空。 */
  video: VideoProbeResult | null;
}

interface SmokeFailureResult {
  /** 失败的输入 URL。 */
  url: string;
  /** 已尝试次数。 */
  attempts: number;
  /** 最后一次失败信息。 */
  errorMessage: string;
}

type SmokeCaseResult =
  | { status: 'passed'; result: SmokeDownloadResult }
  | { status: 'failed'; result: SmokeFailureResult };

interface BackendCapabilities {
  download?: boolean;
}

interface BackendMediaExtra {
  message_id?: number | string;
}

interface BackendMediaSource {
  source_id: string;
  resource_token?: string;
  downloadable?: boolean;
  filename?: string;
  type?: string;
  kind?: string;
  mime_type?: string | null;
  size?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  platform?: string;
  download_mode?: string | null;
  capabilities?: BackendCapabilities;
  extra?: BackendMediaExtra;
}

interface BackendMediaMessage {
  sources?: BackendMediaSource[];
}

interface BackendMediaParseEnvelope {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    canonical_link?: string;
    original_link?: string;
    platform?: string;
    resources?: BackendMediaSource[];
    messages?: BackendMediaMessage[];
  };
}

/**
 * 待验收样本。
 *
 * 后端只支持 Vimeo（`backend/src/app/provider/media/vimeo_media.py`），样本必须落在该平台，
 * 否则解析必然失败；同一支视频与 `vimeo-client-mux-real.spec.ts` 的 client_mux 真实回归共用。
 */
const SMOKE_CASES: readonly SmokeCase[] = [
  { url: 'https://vimeo.com/1196869805?fl=ip&fe=ec' },
];

/** 单个 URL 的最大尝试次数；真实平台限流较紧，只做一次重试。 */
const MAX_ATTEMPTS = 2;
/** 解析结果出现的等待上限（真实网络，放宽）。 */
const PARSE_TIMEOUT_MS = 90_000;
/** 单次下载完成等待上限。 */
const DOWNLOAD_TIMEOUT_MS = 180_000;
/** ffprobe 命令超时。 */
const FFPROBE_TIMEOUT_MS = 30_000;
/** 文件大小允许 2% 差异，兼容容器重封装和 CDN header 差异。 */
const SIZE_TOLERANCE_RATIO = 0.02;
/** 文件大小额外允许 64KiB 绝对差异。 */
const SIZE_TOLERANCE_BYTES = 64 * 1024;
/** 视频时长允许 2 秒差异，兼容不同平台小数/转封装取整差异。 */
const DURATION_TOLERANCE_SECONDS = 2;
function flattenSources(envelope: BackendMediaParseEnvelope): BackendMediaSource[] {
  const data = envelope.data;
  if (!data) {
    return [];
  }

  if (Array.isArray(data.resources) && data.resources.length > 0) {
    return data.resources;
  }

  return (data.messages || []).flatMap(message => message.sources || []);
}

function normalizeType(source: BackendMediaSource): string {
  const explicitType = source.kind || source.type;
  if (explicitType) {
    return explicitType;
  }

  const mimeType = source.mime_type?.toLowerCase() || '';
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function normalizeFirstDownloadableResource(
  envelope: BackendMediaParseEnvelope,
  inputUrl: string
): CapturedParseResponse {
  if (envelope.code !== undefined && envelope.code !== 10000) {
    throw new Error(
      `[smoke] parse API returned code=${envelope.code}, msg=${envelope.msg || envelope.message || ''}`
    );
  }

  const data = envelope.data;
  if (!data) {
    throw new Error('[smoke] parse API response missing data');
  }

  const downloadable = flattenSources(envelope).filter(
    source => source.downloadable !== false && source.capabilities?.download !== false
  );
  if (downloadable.length === 0) {
    throw new Error('[smoke] parse API returned no downloadable resources');
  }

  const first = downloadable[0];
  if (!first.source_id) {
    throw new Error('[smoke] first downloadable resource missing source_id');
  }
  if (!first.resource_token) {
    throw new Error('[smoke] first downloadable resource missing resource_token');
  }

  return {
    inputUrl,
    canonicalLink: data.canonical_link || data.original_link || inputUrl,
    platform: data.platform || first.platform || 'unknown',
    firstDownloadableResource: {
      sourceId: first.source_id,
      resourceToken: first.resource_token,
      filename: first.filename || first.source_id,
      type: normalizeType(first),
      mimeType: first.mime_type,
      size: typeof first.size === 'number' && first.size > 0 ? first.size : null,
      duration: typeof first.duration === 'number' && first.duration > 0 ? first.duration : null,
      width: typeof first.width === 'number' && first.width > 0 ? first.width : null,
      height: typeof first.height === 'number' && first.height > 0 ? first.height : null,
      downloadMode: first.download_mode,
    },
    downloadableCount: downloadable.length,
  };
}

function assertFileSizeMatches(actualSize: number, expectedSize: number | null | undefined): void {
  expect(actualSize, '下载文件大小必须大于 0').toBeGreaterThan(0);
  if (!expectedSize) {
    return;
  }

  const allowedDelta = Math.max(
    SIZE_TOLERANCE_BYTES,
    Math.ceil(expectedSize * SIZE_TOLERANCE_RATIO)
  );
  const delta = Math.abs(actualSize - expectedSize);
  expect(
    delta,
    `下载文件大小不符合 parse size：actual=${actualSize}, expected=${expectedSize}, allowedDelta=${allowedDelta}`
  ).toBeLessThanOrEqual(allowedDelta);
}

function probeVideo(filePath: string): VideoProbeResult {
  const stdout = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration:format=duration',
      '-of',
      'json',
      filePath,
    ],
    {
      encoding: 'utf-8',
      timeout: FFPROBE_TIMEOUT_MS,
    }
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; duration?: string }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const duration = Number(stream?.duration || parsed.format?.duration);

  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`[smoke] ffprobe failed to read video metadata: ${stdout}`);
  }

  return {
    width: stream.width,
    height: stream.height,
    duration,
  };
}

function assertVideoMetadataMatches(
  filePath: string,
  expected: CapturedParseResource
): VideoProbeResult {
  const actual = probeVideo(filePath);

  if (expected.duration) {
    expect(
      Math.abs(actual.duration - expected.duration),
      `视频时长不符合 parse duration：actual=${actual.duration}, expected=${expected.duration}`
    ).toBeLessThanOrEqual(DURATION_TOLERANCE_SECONDS);
  }

  if (expected.width && expected.height) {
    expect(
      { width: actual.width, height: actual.height },
      `视频分辨率不符合 parse metadata：actual=${actual.width}x${actual.height}, expected=${expected.width}x${expected.height}`
    ).toEqual({ width: expected.width, height: expected.height });
  }

  return actual;
}

async function waitForParseUiState(page: Page): Promise<ParseUiState> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const resultCount = document.querySelectorAll('[data-download-result-card]').length;
          if (resultCount > 0) {
            return { kind: 'results', message: '' };
          }

          const errorElement = document.querySelector('[data-download-parse-error]');
          const isHidden = errorElement?.hasAttribute('hidden') ?? true;
          const message = errorElement?.textContent?.trim() || '';
          if (!isHidden && message.length > 0) {
            return { kind: 'error', message };
          }

          return null;
        }),
      {
        timeout: PARSE_TIMEOUT_MS,
        message: '解析后既没有结果卡，也没有错误提示',
      }
    )
    .not.toBeNull();

  const state = await page.evaluate(() => {
    const resultCount = document.querySelectorAll('[data-download-result-card]').length;
    if (resultCount > 0) {
      return { kind: 'results', message: '' };
    }

    const errorElement = document.querySelector('[data-download-parse-error]');
    return {
      kind: 'error',
      message: errorElement?.textContent?.trim() || '解析失败，但页面错误文本为空',
    };
  });

  return state.kind === 'results'
    ? { kind: 'results', message: '' }
    : { kind: 'error', message: state.message };
}

async function waitForDeviceTrustBootstrap(page: Page): Promise<void> {
  const brandIconResponse = page.waitForResponse(
    response =>
      response.url().includes('/assets/icons/logo.svg') &&
      response.status() >= 200 &&
      response.status() < 300,
    { timeout: PARSE_TIMEOUT_MS }
  );

  await page.goto('/');
  await brandIconResponse;
}

async function dismissCheckinModalIfVisible(page: Page): Promise<void> {
  const modal = page.locator('[data-download-checkin-modal]');
  await modal.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  if (!(await modal.isVisible().catch(() => false))) {
    return;
  }

  await page
    .locator('[data-download-checkin-modal] .download-checkin-close[data-download-checkin-close]')
    .click();
  await expect(modal).toBeHidden({ timeout: 5_000 });
}

async function runOnce(
  page: Page,
  url: string,
  attempts: number
): Promise<SmokeDownloadResult> {
  await waitForDeviceTrustBootstrap(page);
  await dismissCheckinModalIfVisible(page);

  await page.fill('[data-download-parse-input]', url);
  const [parseResponse] = await Promise.all([
    page.waitForResponse(
      response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/client/media/parse-v2',
      { timeout: PARSE_TIMEOUT_MS }
    ),
    page.click('[data-download-parse-submit]'),
  ]);
  const envelope: BackendMediaParseEnvelope = await parseResponse.json();
  const parse = normalizeFirstDownloadableResource(envelope, url);

  const uiState = await waitForParseUiState(page);
  if (uiState.kind === 'error') {
    throw new Error(
      `[smoke] 解析 UI 报错：url=${url}, message="${uiState.message}"`
    );
  }

  const firstDownloadButton = page.locator('[data-download-resource-button]').first();
  await expect(firstDownloadButton).toBeVisible({ timeout: PARSE_TIMEOUT_MS });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
    firstDownloadButton.click(),
  ]);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error('[smoke] Playwright download path is empty');
  }

  const actualSize = statSync(downloadPath).size;
  const resource = parse.firstDownloadableResource;
  assertFileSizeMatches(actualSize, resource.size);

  const isVideo =
    resource.type === 'video' || resource.mimeType?.toLowerCase().startsWith('video/') === true;
  let video: VideoProbeResult | null = null;
  if (isVideo) {
    video = assertVideoMetadataMatches(downloadPath, resource);
  }

  return {
    url,
    attempts,
    platform: parse.platform,
    canonicalLink: parse.canonicalLink,
    resource,
    downloadableCount: parse.downloadableCount,
    suggestedFilename: download.suggestedFilename(),
    actualSize,
    video,
  };
}

async function runWithRetries(
  page: Page,
  url: string
): Promise<SmokeCaseResult> {
  let lastErrorMessage = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await runOnce(page, url, attempt);
      console.log(formatPassedResult(result));
      return { status: 'passed', result };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[smoke] ${url} 第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败：${lastErrorMessage}`);
    }
  }

  return {
    status: 'failed',
    result: {
      url,
      attempts: MAX_ATTEMPTS,
      errorMessage: lastErrorMessage || '没有捕获到错误信息',
    },
  };
}

function formatBytes(size: number): string {
  return `${size} B`;
}

function formatVideoResult(video: VideoProbeResult | null): string {
  if (!video) {
    return 'video=-';
  }
  return `video=${video.width}x${video.height}/${video.duration.toFixed(2)}s`;
}

function formatPassedResult(result: SmokeDownloadResult): string {
  const resource = result.resource;
  return (
    `[smoke] OK url=${result.url} platform=${result.platform} source=${resource.sourceId} ` +
    `mode=${resource.downloadMode} downloadable=${result.downloadableCount} ` +
    `file=${result.suggestedFilename} size=${formatBytes(result.actualSize)} ${formatVideoResult(result.video)}`
  );
}

function buildFinalSummary(results: SmokeCaseResult[]): string {
  const lines = ['[smoke] 发布前真实解析+下载验收汇总'];
  for (const item of results) {
    if (item.status === 'passed') {
      lines.push(`PASS ${formatPassedResult(item.result)}`);
    } else {
      lines.push(
        `FAIL url=${item.result.url} attempts=${item.result.attempts} error=${item.result.errorMessage}`
      );
    }
  }
  return lines.join('\n');
}

const token = process.env.E2E_ACCESS_TOKEN;
const deviceId = process.env.E2E_DEVICE_ID;

test.describe('发布前真实解析+下载验收', () => {
  test('逐条解析、下载第一个资源并校验文件', async ({ page }) => {
    test.setTimeout((PARSE_TIMEOUT_MS + DOWNLOAD_TIMEOUT_MS) * MAX_ATTEMPTS * SMOKE_CASES.length);

    expect(token, '请用 pnpm test:e2e:parse-smoke 创建真实登录态').toBeTruthy();
    expect(deviceId, '真实登录态缺少 device_id').toBeTruthy();
    const apiBase = new URL(process.env.E2E_REAL_API_BASE_URL || '');
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(apiBase.hostname);
    await page.route('**/api/**', async route => {
      if (new URL(route.request().url()).origin !== apiBase.origin) {
        console.error('[smoke] API 请求未指向本地业务服务器：', route.request().url());
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.addInitScript(
      ({ token, deviceId, keys }) => {
        localStorage.setItem(keys.accessToken, token);
        localStorage.setItem(keys.deviceId, deviceId);
      },
      { token: token as string, deviceId: deviceId as string, keys: STORAGE_KEYS }
    );

    const results: SmokeCaseResult[] = [];
    for (const smokeCase of SMOKE_CASES) {
      results.push(await runWithRetries(page, smokeCase.url));
    }

    const summary = buildFinalSummary(results);
    console.log(summary);

    const failures = results.filter(item => item.status === 'failed');
    if (failures.length > 0) {
      throw new Error(summary);
    }
  });
});
