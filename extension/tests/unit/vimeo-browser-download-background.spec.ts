/** Vimeo Chrome 原生下载 background 边界测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  BackgroundBrowserDownloadSource,
  BackgroundStartBrowserDownloadRequest
} from '@/background/types'
import { BrowserDownloadService } from '@/background/services/BrowserDownloadService'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { RpcContext } from '@/core/rpc/types'
import { encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

const mocks = vi.hoisted(() => ({
  refreshVimeoDirectResourcesFromConfigUrl: vi.fn()
}))

vi.mock('@/sites/vimeo/config', () => ({
  refreshVimeoDirectResourcesFromConfigUrl: mocks.refreshVimeoDirectResourcesFromConfigUrl
}))

const VIDEO_ID = '1196869805'
const SOURCE_ID = `vimeo:${VIDEO_ID}:video:progressive:1080p:30`
const BEST_SOURCE_ID = `vimeo:${VIDEO_ID}:video:best`
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=2100000000&signature=config`
const MEDIA_URL = 'https://vod-progressive-ak.vimeocdn.com/video/original.mp4?token=signed'
const FRESH_MEDIA_URL = 'https://vod-progressive-ak.vimeocdn.com/video/fresh.mp4?token=signed'

describe('Vimeo browser download background service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockReset()
  })

  it('校验 Vimeo 来源后把 progressive URL 交给 Chrome 下载管理器', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(41))

    const result = await new BrowserDownloadService().start(startRequest(), vimeoContext())

    expect(result).toEqual({ download_id: 41 })
    expect(chrome.downloads.download).toHaveBeenCalledWith({
      url: MEDIA_URL,
      // 保存位置默认子目录由 background 拼在文件名前，路径始终相对下载目录。
      filename: 'vimeo-video-downloader/controlled-1080p.mp4',
      conflictAction: 'uniquify',
      saveAs: false
    })
  })

  it('拒绝非 Vimeo content 调用和非 CDN URL', async () => {
    const service = new BrowserDownloadService()

    await expect(
      service.start(startRequest(), { ...vimeoContext(), origin: 'https://attacker.example' })
    ).rejects.toThrow('拒绝非 Vimeo 页面调用')
    await expect(
      service.start(
        startRequest({ url: 'https://attacker.example/video.mp4' }),
        vimeoContext()
      )
    ).rejects.toThrow('URL 不在允许的白名单')
    // 真实采样的媒体主机只落在 vimeocdn.com；akamaized.net 无证据支撑，必须被白名单拒绝。
    await expect(
      service.start(
        startRequest({ url: 'https://vod-progressive.akamaized.net/video/original.mp4' }),
        vimeoContext()
      )
    ).rejects.toThrow('URL 不在允许的白名单')
    expect(chrome.downloads.download).not.toHaveBeenCalled()
  })

  it('保存位置拼成相对子目录，绝对路径、盘符、回退段与空段逐段丢弃', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(51))
    const service = new BrowserDownloadService()

    const filenameFor = async (downloadPath: string): Promise<string> => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        settings: { language: 'en-US', downloadPath }
      } as never)
      vi.mocked(chrome.downloads.download).mockClear()
      await service.start(startRequest(), vimeoContext())
      return (vi.mocked(chrome.downloads.download).mock.calls[0][0].filename ?? '').toString()
    }

    const cases: ReadonlyArray<readonly [string, string]> = [
      ['my/videos', 'my/videos/controlled-1080p.mp4'],
      // 绝对路径的开头 `/` 与连续 `/` 都是空段，丢弃后仍落在下载目录内
      ['/etc/passwd', 'etc/passwd/controlled-1080p.mp4'],
      ['a//b/', 'a/b/controlled-1080p.mp4'],
      // 回退段（含反斜杠写法）整段丢弃，逃不出下载目录
      ['../..', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['..\\..\\windows', 'windows/controlled-1080p.mp4'],
      // 盘符段含 `:`，整段丢弃
      ['C:\\Windows\\System32', 'Windows/System32/controlled-1080p.mp4'],
      // `~` 开头的段按家目录语义处理，直接丢弃
      ['~/Documents', 'Documents/controlled-1080p.mp4'],
      // 空值回退默认子目录，Chrome 才不会收到空路径
      ['', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['   ', 'vimeo-video-downloader/controlled-1080p.mp4']
    ]

    for (const [downloadPath, expected] of cases) {
      const filename = await filenameFor(downloadPath)
      expect({ downloadPath, filename }).toEqual({ downloadPath, filename: expected })
      // 无论用户填什么，交给 Chrome 的都必须是非空相对路径且不含回退段
      expect(filename.startsWith('/')).toBe(false)
      expect(filename.includes('..')).toBe(false)
    }

    // 文件名清洗后正好是回退段时换兜底名，避免 Chrome 因 `..` 直接报错
    vi.mocked(chrome.downloads.download).mockClear()
    await service.start(startRequest({ filename: '..' }), vimeoContext())
    expect(vi.mocked(chrome.downloads.download).mock.calls[0][0].filename).toBe(
      'vimeo-video-downloader/vimeo-download'
    )
  })

  it('signed URL 中断后可先刷新 config 再创建新任务', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(42))
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([freshResource()])

    const result = await new BrowserDownloadService().start(
      { ...startRequest(), refresh_source: true },
      vimeoContext()
    )

    expect(result).toEqual({ download_id: 42 })
    expect(mocks.refreshVimeoDirectResourcesFromConfigUrl).toHaveBeenCalledWith(CONFIG_URL)
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: FRESH_MEDIA_URL })
    )
  })

  it('刷新时按稳定 Best ID 恢复最新 progressive 文件', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(43))
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([
      bestProgressiveResource(),
      freshResource()
    ])

    await new BrowserDownloadService().start(
      {
        ...startRequest({
          source_id: BEST_SOURCE_ID,
          document_id: bestProgressiveDescriptor()
        }),
        refresh_source: true
      },
      vimeoContext()
    )

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: FRESH_MEDIA_URL })
    )
  })

  it('创建任务前拒绝 MIME 与 descriptor 合同不匹配', async () => {
    await expect(
      new BrowserDownloadService().start(startRequest({ mime_type: 'text/html' }), vimeoContext())
    ).rejects.toThrow('直连来源合同不匹配')
    expect(chrome.downloads.download).not.toHaveBeenCalled()
  })

  it('返回 Chrome 下载进度，并阻断越界重定向', async () => {
    vi.spyOn(chrome.downloads, 'search')
      .mockImplementationOnce(() => Promise.resolve([downloadItem()]))
      .mockImplementationOnce(() =>
        Promise.resolve([
          downloadItem({ finalUrl: 'https://attacker.example/payload', state: 'in_progress' })
        ])
      )
    vi.spyOn(chrome.downloads, 'cancel').mockResolvedValue()
    const service = new BrowserDownloadService()

    await expect(
      service.getStatus(
        {
          download_id: 41,
          source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
        },
        vimeoContext()
      )
    ).resolves.toEqual({
      state: 'in_progress',
      bytes_received: 512,
      total_bytes: 1024
    })
    await expect(
      service.getStatus(
        {
          download_id: 41,
          source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
        },
        vimeoContext()
      )
    ).rejects.toThrow('原生下载响应越界')
    expect(chrome.downloads.cancel).toHaveBeenCalledWith(41)
  })
})

/** 构造 background 启动请求。 */
function startRequest(
  sourceOverrides: Partial<BackgroundBrowserDownloadSource> = {}
): BackgroundStartBrowserDownloadRequest {
  return {
    source: {
      source_id: SOURCE_ID,
      url: MEDIA_URL,
      type: RESOURCE_TYPES.VIDEO,
      source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
      filename: 'controlled-1080p.mp4',
      mime_type: 'video/mp4',
      document_id: descriptor(),
      ...sourceOverrides
    },
    refresh_source: false
  }
}

/** 构造合法 Vimeo content RPC 上下文。 */
function vimeoContext(): RpcContext {
  return {
    transport: 'chrome',
    caller: 'content',
    tabId: 8,
    frameId: 0,
    origin: `https://vimeo.com/${VIDEO_ID}`
  }
}

/** 构造 progressive descriptor。 */
function descriptor(): string {
  return encodeVimeoSourceDescriptor({
    version: 2,
    videoId: VIDEO_ID,
    sourceId: SOURCE_ID,
    optionId: 'progressive:1080p:30',
    kind: 'video',
    delivery: 'progressive',
    label: '1080p MP4',
    configUrl: CONFIG_URL,
    refreshConfigUrl: CONFIG_URL
  })
}

/** 构造点击时由 progressive 实现的 Best descriptor。 */
function bestProgressiveDescriptor(): string {
  return encodeVimeoSourceDescriptor({
    version: 2,
    videoId: VIDEO_ID,
    sourceId: BEST_SOURCE_ID,
    optionId: 'best',
    kind: 'video',
    delivery: 'progressive',
    label: 'Best',
    configUrl: CONFIG_URL,
    refreshConfigUrl: CONFIG_URL
  })
}

/** 构造刷新 config 后的直连资源。 */
function freshResource() {
  return {
    id: SOURCE_ID,
    messageId: VIDEO_ID,
    index: 0,
    url: FRESH_MEDIA_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
    filename: 'fresh.mp4',
    mimeType: 'video/mp4',
    documentId: descriptor(),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 构造只基于最新 progressive 列表恢复的 Best 资源。 */
function bestProgressiveResource() {
  return {
    id: BEST_SOURCE_ID,
    messageId: VIDEO_ID,
    index: 0,
    url: FRESH_MEDIA_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
    filename: 'best.mp4',
    mimeType: 'video/mp4',
    documentId: encodeVimeoSourceDescriptor({
      version: 2,
      videoId: VIDEO_ID,
      sourceId: BEST_SOURCE_ID,
      optionId: 'best',
      kind: 'video',
      delivery: 'progressive',
      label: 'Best',
      configUrl: CONFIG_URL
    }),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 构造 Chrome 下载项。 */
function downloadItem(
  overrides: Partial<chrome.downloads.DownloadItem> = {}
): chrome.downloads.DownloadItem {
  return {
    id: 41,
    url: MEDIA_URL,
    finalUrl: MEDIA_URL,
    filename: '/tmp/controlled-1080p.mp4',
    danger: 'safe',
    mime: 'video/mp4',
    startTime: new Date(0).toISOString(),
    state: 'in_progress',
    paused: false,
    canResume: false,
    bytesReceived: 512,
    totalBytes: 1024,
    fileSize: -1,
    exists: true,
    incognito: false,
    referrer: '',
    byExtensionId: chrome.runtime.id,
    ...overrides
  }
}
