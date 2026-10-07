/** 下载任务合同检查：使用对账及人工重试入口，不伪造或调用首次配额消费。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIO_TARGET_FORMATS,
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES
} from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import { encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'
import type { DownloadOrchestrator } from '@/background/services/DownloadOrchestrator'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  release: vi.fn(),
  save: vi.fn(),
  ensure: vi.fn(),
  settings: vi.fn()
}))

vi.mock('@/background/rpc/offscreen.rpc', () => ({
  OffscreenChannel: class {
    startTask = mocks.start
    cancelTask = mocks.cancel
    listActiveTasks = mocks.list
    releaseTaskArtifact = mocks.release
    saveTaskArtifact = mocks.save
  }
}))
vi.mock('@/background/services/offscreenDocument', () => ({
  ensureOffscreenDocument: mocks.ensure,
  hasOffscreenDocument: async () => true
}))
vi.mock('@/core/storage/settings', () => ({
  SettingsManager: { getSettings: mocks.settings },
  DEFAULT_DOWNLOAD_PATH: 'vimeoMediaDownloader'
}))
vi.mock('@/core/api/quota', () => ({
  quotaApi: {
    checkAndConsume: vi.fn(async () => ({
      allowed: true,
      count: 1,
      used: 0,
      remaining: 1,
      status: 1 as const
    }))
  }
}))

let orchestrator: InstanceType<typeof DownloadOrchestrator>

function resource(id: string, direct = false): MediaResource {
  return {
    id,
    messageId: '1196869805',
    index: 0,
    url: 'https://vod-adaptive-ak.vimeocdn.com/video.mp4',
    type: direct ? RESOURCE_TYPES.VIDEO : RESOURCE_TYPES.AUDIO,
    sourceKind: direct
      ? RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
      : RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO,
    mimeType: direct ? 'video/mp4' : 'audio/mp4',
    title: id,
    documentId: encodeVimeoSourceDescriptor({
      version: 2,
      videoId: '1196869805',
      sourceId: id,
      optionId: 'best',
      label: 'Best',
      delivery: direct ? 'progressive' : 'dash',
      kind: direct ? 'video' : 'audio',
      configUrl: 'https://player.vimeo.com/video/1196869805/config',
      audioTrackId: direct ? undefined : 'a1'
    }),
    metadata: { messageId: '1196869805' }
  }
}

async function restore(taskId: string, item: MediaResource): Promise<void> {
  mocks.list.mockResolvedValue({
    tasks: [
      {
        taskId,
        resourceId: item.id,
        resource: item,
        progress: null,
        receivedBytes: null,
        totalBytes: null
      }
    ]
  })
  await orchestrator.reconcile()
}

async function fail(taskId: string): Promise<void> {
  await orchestrator.handleTaskFailed({ taskId, message: '外部媒体请求中断' })
  await vi.waitFor(() =>
    expect(orchestrator.getSnapshot().tasks.find(task => task.taskId === taskId)?.status).toBe(
      'failed'
    )
  )
}

describe('下载任务合同', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('__ALI_SLS_MARK_CONFIG__', { enabled: false })
    mocks.settings.mockResolvedValue({
      downloadPath: 'vimeoMediaDownloader',
      filenamePattern: '{title}'
    })
    mocks.ensure.mockResolvedValue(undefined)
    mocks.start.mockResolvedValue({ started: true })
    mocks.cancel.mockResolvedValue({ accepted: true })
    mocks.release.mockResolvedValue({ released: true })
    mocks.save.mockResolvedValue({ started: true })
    mocks.list.mockResolvedValue({ tasks: [] })
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(55))
    vi.spyOn(chrome.downloads, 'search').mockImplementation(() =>
      Promise.resolve([{ id: 55, state: 'complete' } as chrome.downloads.DownloadItem])
    )
    vi.spyOn(chrome.downloads, 'cancel').mockResolvedValue(undefined)
    ;({ downloadOrchestrator: orchestrator } =
      await import('@/background/services/DownloadOrchestrator'))
  })

  it('并发同输出只入队一次，M4A/MP3 分开', async () => {
    await restore('blocker', resource('other'))
    await Promise.all([
      orchestrator.enqueueBatch([resource('audio')], null),
      orchestrator.enqueueBatch([resource('audio')], null)
    ])
    await orchestrator.enqueueBatch(
      [resource('audio'), { ...resource('audio'), targetFormat: AUDIO_TARGET_FORMATS.MP3 }],
      null
    )
    expect(
      orchestrator.getSnapshot().tasks.filter(task => task.resourceId === 'audio')
    ).toHaveLength(2)
    expect(
      orchestrator
        .getSnapshot()
        .tasks.filter(task => task.status === 'waiting')
        .map(task => task.filename)
    ).toEqual(['audio.m4a', 'audio.mp3'])
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('首次接管失败可重试；早终态后的 ACK 窗口重复对账不复活已完成任务', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offscreen 尚未响应'))
    await expect(orchestrator.reconcile()).rejects.toThrow('offscreen 尚未响应')
    await restore('early', resource('audio'))
    await fail('early')
    let acknowledgeStart: (() => void) | undefined
    mocks.start.mockImplementation(async () => {
      await orchestrator.handleTaskComplete({
        taskId: 'early',
        blobUrl: 'blob:ready',
        filename: 'audio.m4a',
        mimeType: 'audio/mp4'
      })
      await new Promise<void>(resolve => {
        acknowledgeStart = resolve
      })
      return { started: true }
    })
    expect(orchestrator.retryTask('early')).toBe(true)
    await vi.waitFor(() => expect(orchestrator.getSnapshot().tasks).toHaveLength(0))
    expect(chrome.downloads.search).toHaveBeenCalledWith({ id: 55 })
    expect(mocks.release).toHaveBeenCalledWith({ taskId: 'early', blobUrl: 'blob:ready' })
    await vi.waitFor(() => expect(acknowledgeStart).toBeDefined())
    // offscreen 尚未收到 ACK，首次接管得到的清单仍含 early；本轮不得再接管这个旧清单。
    await orchestrator.reconcile()
    await orchestrator.enqueueBatch([], null)
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    expect(mocks.list).toHaveBeenCalledTimes(2)
    acknowledgeStart?.()
  })

  it('offscreen 创建期间取消不会派发任务', async () => {
    await restore('preparing', resource('audio'))
    await fail('preparing')
    let finishCreating: (() => void) | undefined
    const creation = new Promise<void>(resolve => {
      finishCreating = resolve
    })
    mocks.ensure.mockReturnValue(creation)
    orchestrator.retryTask('preparing')
    await vi.waitFor(() => expect(mocks.ensure).toHaveBeenCalled())
    const cancellation = orchestrator.cancelTask('preparing')
    finishCreating?.()
    await cancellation
    await vi.waitFor(() => expect(orchestrator.getSnapshot().tasks).toHaveLength(0))
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('下载 URL 映射在 blob 单项与 HTTP FIFO 中只消费一次', async () => {
    const addListener = chrome.downloads.onDeterminingFilename.addListener as ReturnType<typeof vi.fn>
    const listener = (): (
      item: { url: string; finalUrl?: string },
      suggest: (result: { filename: string; conflictAction: 'uniquify' }) => void
    ) => void => addListener.mock.calls.at(-1)?.[0]

    await restore('blob-name', resource('audio'))
    await fail('blob-name')
    mocks.start.mockImplementation(async () => {
      await orchestrator.handleTaskComplete({
        taskId: 'blob-name',
        blobUrl: 'blob:filename-contract',
        filename: 'ignored-by-background.m4a',
        mimeType: 'audio/mp4'
      })
      return { started: true }
    })
    expect(orchestrator.retryTask('blob-name')).toBe(true)
    await vi.waitFor(() => expect(chrome.downloads.download).toHaveBeenCalled())
    const suggestions: Array<{ filename: string; conflictAction: 'uniquify' }> = []
    listener()(
      { url: 'blob:filename-contract' },
      value => suggestions.push(value)
    )
    listener()(
      { url: 'blob:filename-contract' },
      value => suggestions.push(value)
    )
    expect(suggestions).toEqual([
      { filename: 'vimeoMediaDownloader/audio.m4a', conflictAction: 'uniquify' }
    ])

    await orchestrator.enqueueBatch(
      [resource('video-a', true), resource('video-b', true)],
      null
    )
    await vi.waitFor(() => expect(chrome.downloads.download).toHaveBeenCalledTimes(3))
    const httpSuggestions: Array<{ filename: string; conflictAction: 'uniquify' }> = []
    listener()(
      { url: 'https://vod-adaptive-ak.vimeocdn.com/video.mp4' },
      value => httpSuggestions.push(value)
    )
    listener()(
      { url: 'https://vod-adaptive-ak.vimeocdn.com/video.mp4' },
      value => httpSuggestions.push(value)
    )
    expect(httpSuggestions).toEqual([
      { filename: 'vimeoMediaDownloader/video-a.mp4', conflictAction: 'uniquify' },
      { filename: 'vimeoMediaDownloader/video-b.mp4', conflictAction: 'uniquify' }
    ])
  })

  it('备用 blob 交付走 offscreen anchor，并等待 background 落盘回执后释放产物', async () => {
    mocks.settings.mockResolvedValue({
      downloadPath: 'vimeoMediaDownloader',
      filenamePattern: '{title}',
      useBackgroundBlobDownload: true
    })
    await restore('offscreen-blob', resource('audio'))
    await fail('offscreen-blob')
    mocks.start.mockImplementation(async () => {
      await orchestrator.handleTaskComplete({
        taskId: 'offscreen-blob',
        blobUrl: 'blob:offscreen-contract',
        filename: 'ignored-by-background.m4a',
        mimeType: 'audio/mp4'
      })
      return { started: true }
    })
    mocks.save.mockImplementation(async ({ blobUrl }: { blobUrl: string }) => {
      const addListener = chrome.downloads.onCreated.addListener as ReturnType<typeof vi.fn>
      addListener.mock.calls.at(-1)?.[0]({ id: 55, url: blobUrl })
      return { started: true }
    })

    expect(orchestrator.retryTask('offscreen-blob')).toBe(true)
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
      taskId: 'offscreen-blob',
      blobUrl: 'blob:offscreen-contract',
      filename: 'vimeoMediaDownloader/audio.m4a'
    }))
    await vi.waitFor(() => expect(orchestrator.getSnapshot().tasks).toHaveLength(0))
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(chrome.downloads.search).toHaveBeenCalledWith({ id: 55 })
    expect(mocks.release).toHaveBeenCalledWith({
      taskId: 'offscreen-blob',
      blobUrl: 'blob:offscreen-contract'
    })
  })

  it('直连 downloadId 返回时取消，不能把已 complete 的结果记成功', async () => {
    await restore('direct', resource('video', true))
    await fail('direct')
    let returnId: ((id: number) => void) | undefined
    vi.mocked(chrome.downloads.download).mockImplementation(
      () =>
        new Promise<number>(resolve => {
          returnId = resolve
        })
    )
    orchestrator.retryTask('direct')
    await vi.waitFor(() => expect(returnId).toBeDefined())
    await orchestrator.cancelTask('direct')
    returnId?.(55)
    await vi.waitFor(() => expect(orchestrator.getSnapshot().tasks).toHaveLength(0))
    expect(chrome.downloads.cancel).toHaveBeenCalledWith(55)
  })
})
