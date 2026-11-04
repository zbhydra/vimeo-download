/** 下载任务合同检查：使用对账及人工重试入口，不伪造或调用首次配额消费。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  settings: vi.fn(),
  mark: vi.fn(),
  notify: vi.fn(),
  history: vi.fn()
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
vi.mock('@/background/services/ExtensionMarkReporter', () => ({
  recordBackgroundMark: mocks.mark
}))
vi.mock('@/background/services/downloadNotifications', () => ({
  notifyDownloadFinished: mocks.notify
}))
vi.mock('@/background/services/downloadHistoryWriteback', () => ({
  recordDownloadTaskOutcome: mocks.history
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

/** offscreen 活跃任务清单的一项。 */
function activeTask(taskId: string, item: MediaResource) {
  return {
    taskId,
    resourceId: item.id,
    resource: item,
    progress: null,
    receivedBytes: null,
    totalBytes: null
  }
}

async function restore(taskId: string, item: MediaResource): Promise<void> {
  mocks.list.mockResolvedValue({ tasks: [activeTask(taskId, item)] })
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

/** 任务结局打点（不含入队时的 download_click），按发生顺序。 */
function outcomeMarks(): string[] {
  return mocks.mark.mock.calls
    .map(call => call[0] as string)
    .filter(markType => markType !== 'download_click')
}

function outcomeMarkMessage(markType: string): string {
  const call = mocks.mark.mock.calls.find(([type]) => type === markType)
  return call?.[1] as string
}

/** 进行中的 Chrome 下载；filename 为空表示目标路径还没确定（如另存为框未确认）。 */
function inProgress(
  bytesReceived: number,
  fields: Partial<chrome.downloads.DownloadItem> = {}
): chrome.downloads.DownloadItem {
  return {
    id: 55,
    state: 'in_progress',
    bytesReceived,
    paused: false,
    filename: '',
    ...fields
  } as chrome.downloads.DownloadItem
}

const COMPLETE_ITEM = { id: 55, state: 'complete' } as chrome.downloads.DownloadItem
const USER_CANCELED_ITEM = {
  id: 55,
  state: 'interrupted',
  error: 'USER_CANCELED'
} as chrome.downloads.DownloadItem

function stubSearch(item: () => chrome.downloads.DownloadItem): void {
  vi.mocked(chrome.downloads.search).mockImplementation(() => Promise.resolve([item()]))
}

/** 清掉前置 fail 步骤留下的打点与通知，只看后续这轮执行。 */
function clearOutcomeSpies(): void {
  mocks.mark.mockClear()
  mocks.notify.mockClear()
  mocks.history.mockClear()
}

function artifactRequest(taskId: string) {
  return {
    taskId,
    blobUrl: `blob:${taskId}`,
    filename: 'ignored-by-background.m4a',
    mimeType: 'audio/mp4'
  }
}

/** 让 offscreen 任务进入 drain 的执行轮次并交付产物，返回 taskComplete 的应答。 */
async function deliverThroughDrain(taskId: string): Promise<{ accepted: boolean }> {
  await restore(taskId, resource('audio'))
  await fail(taskId)
  clearOutcomeSpies()
  const response = new Promise<{ accepted: boolean }>(resolve => {
    mocks.start.mockImplementation(async () => {
      resolve(await orchestrator.handleTaskComplete(artifactRequest(taskId)))
      return { started: true }
    })
  })
  expect(orchestrator.retryTask(taskId)).toBe(true)
  return response
}

/** 让直连任务进入 drain 的执行轮次，并等到 Chrome 下载已创建。 */
async function startDirectThroughDrain(taskId: string): Promise<void> {
  await restore(taskId, resource('video', true))
  await fail(taskId)
  clearOutcomeSpies()
  expect(orchestrator.retryTask(taskId)).toBe(true)
  await vi.waitFor(() => expect(chrome.downloads.download).toHaveBeenCalled())
}

function expectTaskRemoved(): Promise<void> {
  return vi.waitFor(() => expect(orchestrator.getSnapshot().tasks).toHaveLength(0))
}

const STALL_LIMIT_MS = 10 * 60 * 1000

describe('下载任务合同', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  describe('落盘异步化与无进展上限', () => {
    it('落盘超过原 120s 但字节持续增长：应答不等落盘，最终正常结算', async () => {
      vi.useFakeTimers()
      let polls = 0
      stubSearch(() => {
        polls += 1
        return polls > 300 ? COMPLETE_ITEM : inProgress(polls)
      })

      await expect(deliverThroughDrain('slow')).resolves.toEqual({ accepted: true })

      // 已应答，但落盘没结束：任务仍占着队列，产物未释放，也没有结局打点。
      expect(chrome.downloads.download).toHaveBeenCalledTimes(1)
      expect(mocks.release).not.toHaveBeenCalled()
      expect(orchestrator.getSnapshot().tasks).toEqual([
        expect.objectContaining({ taskId: 'slow', status: 'downloading' })
      ])
      expect(outcomeMarks()).toEqual([])

      await vi.advanceTimersByTimeAsync(121_000)
      expect(mocks.release).not.toHaveBeenCalled()
      expect(outcomeMarks()).toEqual([])

      await vi.advanceTimersByTimeAsync(30_000)
      await expectTaskRemoved()
      expect(mocks.release).toHaveBeenCalledWith({ taskId: 'slow', blobUrl: 'blob:slow' })
      expect(outcomeMarks()).toEqual(['download_success'])
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ succeeded: true }))
      expect(chrome.downloads.cancel).not.toHaveBeenCalled()
    })

    it('串行队列等落盘结束才放行下一项：两项都经人工重试，不调用配额', async () => {
      vi.useFakeTimers()
      const { quotaApi } = await import('@/core/api/quota')
      mocks.list.mockResolvedValue({
        tasks: [activeTask('first', resource('first')), activeTask('next', resource('next'))]
      })
      await orchestrator.reconcile()
      await fail('first')
      await fail('next')

      let landed = false
      stubSearch(() => (landed ? COMPLETE_ITEM : inProgress(1)))
      mocks.start.mockImplementation(async ({ taskId }: { taskId: string }) => {
        if (taskId === 'first') {
          await orchestrator.handleTaskComplete(artifactRequest('first'))
        }
        return { started: true }
      })

      expect(orchestrator.retryTask('first')).toBe(true)
      await vi.waitFor(() => expect(chrome.downloads.download).toHaveBeenCalledTimes(1))
      expect(orchestrator.retryTask('next')).toBe(true)

      // 第一项已应答 taskComplete、还在落盘：第二项只能排队。
      await vi.advanceTimersByTimeAsync(500)
      expect(mocks.start).toHaveBeenCalledTimes(1)
      expect(orchestrator.getSnapshot().tasks.find(task => task.taskId === 'next')?.status).toBe(
        'waiting'
      )

      landed = true
      await vi.advanceTimersByTimeAsync(500)
      await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2))
      expect(mocks.start).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'next' }))
      expect(quotaApi.checkAndConsume).not.toHaveBeenCalled()
    })

    it('连续 10 分钟无字节进展：取消下载、释放产物，按 STALLED 记失败而不是取消', async () => {
      vi.useFakeTimers()
      stubSearch(() => inProgress(1024, { paused: true }))
      await deliverThroughDrain('stalled')

      await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS - 1_000)
      expect(chrome.downloads.cancel).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1_000)
      expect(chrome.downloads.cancel).toHaveBeenCalledWith(55)
      await vi.waitFor(() =>
        expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
      )
      expect(mocks.release).toHaveBeenCalledWith({ taskId: 'stalled', blobUrl: 'blob:stalled' })
      expect(outcomeMarks()).toEqual(['download_failed'])
      expect(outcomeMarkMessage('download_failed')).toContain(
        'reason=STALLED paused=true target=pending'
      )
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ succeeded: false }))
    })

    it('无进展判定的 reason 只说目标路径是否确定，不记录路径本身；取消失败只记日志', async () => {
      vi.useFakeTimers()
      vi.mocked(chrome.downloads.cancel).mockRejectedValue(new Error('[mock] already gone'))
      stubSearch(() => inProgress(1024, { filename: '/Users/someone/Downloads/secret.mp4' }))
      await deliverThroughDrain('stalled-target')

      await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS)
      await vi.waitFor(() =>
        expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
      )

      expect(outcomeMarks()).toEqual(['download_failed'])
      const message = outcomeMarkMessage('download_failed')
      expect(message).toContain('reason=STALLED paused=false target=set')
      expect(message).not.toContain('secret')
    })

    it('字节有进展就重新计时', async () => {
      vi.useFakeTimers()
      let bytes = 1
      stubSearch(() => inProgress(bytes))
      await deliverThroughDrain('progressing')

      await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS - 60_000)
      bytes = 2
      await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS - 60_000)
      expect(chrome.downloads.cancel).not.toHaveBeenCalled()

      // 新字节要到下一次轮询（500ms 后）才被读到，计时从那一刻重新开始。
      await vi.advanceTimersByTimeAsync(60_000)
      expect(chrome.downloads.cancel).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(500)
      expect(chrome.downloads.cancel).toHaveBeenCalledWith(55)
    })

    it('直连下载共用无进展上限，STALLED 不触发重签刷新', async () => {
      vi.useFakeTimers()
      stubSearch(() => inProgress(1024))
      await startDirectThroughDrain('direct-stalled')

      await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS)
      expect(chrome.downloads.cancel).toHaveBeenCalledWith(55)
      await vi.waitFor(() =>
        expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
      )

      expect(chrome.downloads.download).toHaveBeenCalledTimes(1)
      expect(outcomeMarks()).toEqual(['download_failed'])
      expect(outcomeMarkMessage('download_failed')).toContain('reason=STALLED')
    })

    it('落盘中取消：Chrome 已 complete 也不算成功，只记一条取消', async () => {
      vi.useFakeTimers()
      let cancelled = false
      vi.mocked(chrome.downloads.cancel).mockImplementation(async () => {
        cancelled = true
      })
      stubSearch(() => (cancelled ? COMPLETE_ITEM : inProgress(1)))
      await deliverThroughDrain('cancel-landing')

      await expect(orchestrator.cancelTask('cancel-landing')).resolves.toBe(true)
      expect(chrome.downloads.cancel).toHaveBeenCalledWith(55)
      await vi.advanceTimersByTimeAsync(500)
      await expectTaskRemoved()

      expect(mocks.release).toHaveBeenCalledWith({
        taskId: 'cancel-landing',
        blobUrl: 'blob:cancel-landing'
      })
      expect(outcomeMarks()).toEqual(['download_cancelled'])
      expect(mocks.notify).not.toHaveBeenCalled()
      expect(mocks.history).not.toHaveBeenCalled()
    })

    it('创建 Chrome 下载失败：仍应答已受理，由 background 释放产物并记失败', async () => {
      vi.mocked(chrome.downloads.download).mockRejectedValue(new Error('Invalid filename'))

      await expect(deliverThroughDrain('invalid-name')).resolves.toEqual({ accepted: true })
      await vi.waitFor(() =>
        expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
      )

      expect(mocks.release).toHaveBeenCalledWith({
        taskId: 'invalid-name',
        blobUrl: 'blob:invalid-name'
      })
      expect(outcomeMarks()).toEqual(['download_failed'])
      expect(outcomeMarkMessage('download_failed')).toContain('Invalid filename')
    })
  })

  describe('统一结算入口挡住迟到的结算', () => {
    it('冷启动任务：取消转发失败已本地收敛，在途落盘流程随后再次结算，只记一条取消', async () => {
      await restore('cold-race', resource('audio'))
      // 让落盘流程停在读取设置：它已持有 task 引用，但还没有 downloadId，取消只能转发 offscreen。
      let finishSettings: (() => void) | undefined
      mocks.settings.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishSettings = () =>
              resolve({ downloadPath: 'vimeoMediaDownloader', filenamePattern: '{title}' })
          })
      )
      const delivery = orchestrator.handleTaskComplete(artifactRequest('cold-race'))
      await vi.waitFor(() => expect(finishSettings).toBeDefined())

      mocks.cancel.mockRejectedValueOnce(new Error('[mock] offscreen 无响应'))
      await expect(orchestrator.cancelTask('cold-race')).resolves.toBe(true)
      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
      expect(outcomeMarks()).toEqual(['download_cancelled'])

      // 放行后 startArtifactDownload 发现已取消并抛错，landArtifact 带着旧引用再次结算。
      finishSettings?.()
      await expect(delivery).resolves.toEqual({ accepted: true })
      await vi.waitFor(() =>
        expect(mocks.release).toHaveBeenCalledWith({
          taskId: 'cold-race',
          blobUrl: 'blob:cold-race'
        })
      )
      await new Promise(resolve => setTimeout(resolve))

      expect(chrome.downloads.download).not.toHaveBeenCalled()
      expect(outcomeMarks()).toEqual(['download_cancelled'])
      expect(mocks.notify).not.toHaveBeenCalled()
      expect(mocks.history).not.toHaveBeenCalled()
    })

    it('冷启动任务同一轮事件里收到两次失败回传：守卫到终态转移之间没有缺口，只记一条', async () => {
      await restore('cold-twice', resource('audio'))

      await Promise.all([
        orchestrator.handleTaskFailed({ taskId: 'cold-twice', message: '第一次' }),
        orchestrator.handleTaskFailed({ taskId: 'cold-twice', message: '第二次' })
      ])

      expect(outcomeMarks()).toEqual(['download_failed'])
      expect(mocks.notify).toHaveBeenCalledTimes(1)
      expect(mocks.history).toHaveBeenCalledTimes(1)
    })

    it('冷启动任务已记失败：在途落盘随后完成，不改写失败终态，也不再打点', async () => {
      vi.useFakeTimers()
      let landed = false
      stubSearch(() => (landed ? COMPLETE_ITEM : inProgress(1)))
      await restore('cold-failed', resource('audio'))
      await orchestrator.handleTaskComplete(artifactRequest('cold-failed'))
      await fail('cold-failed')
      expect(outcomeMarks()).toEqual(['download_failed'])

      landed = true
      await vi.advanceTimersByTimeAsync(500)
      await vi.waitFor(() => expect(mocks.release).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(0)

      expect(outcomeMarks()).toEqual(['download_failed'])
      expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
      expect(mocks.notify).toHaveBeenCalledTimes(1)
      expect(mocks.history).toHaveBeenCalledTimes(1)
    })
  })

  describe('download_cancelled 打点', () => {
    it('offscreen 产物在 Chrome 界面或另存为框被取消：只记取消，不算失败', async () => {
      stubSearch(() => USER_CANCELED_ITEM)
      await deliverThroughDrain('ui-cancel-blob')
      await expectTaskRemoved()

      expect(outcomeMarks()).toEqual(['download_cancelled'])
      expect(mocks.notify).not.toHaveBeenCalled()
      expect(mocks.history).not.toHaveBeenCalled()
    })

    it('直连下载在 Chrome 界面被取消：只记取消，不算失败', async () => {
      stubSearch(() => USER_CANCELED_ITEM)
      await startDirectThroughDrain('ui-cancel-direct')
      await expectTaskRemoved()

      expect(outcomeMarks()).toEqual(['download_cancelled'])
      expect(mocks.notify).not.toHaveBeenCalled()
      expect(mocks.history).not.toHaveBeenCalled()
    })

    it('插件队列取消下载中的 offscreen 任务：只记一条取消', async () => {
      await restore('queue-cancel', resource('audio'))
      await fail('queue-cancel')
      clearOutcomeSpies()
      mocks.start.mockResolvedValue({ started: true })
      expect(orchestrator.retryTask('queue-cancel')).toBe(true)
      await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled())

      await orchestrator.cancelTask('queue-cancel')
      expect(mocks.cancel).toHaveBeenCalledWith({ taskId: 'queue-cancel' })
      await orchestrator.handleTaskCancelled({ taskId: 'queue-cancel' })
      await expectTaskRemoved()

      expect(outcomeMarks()).toEqual(['download_cancelled'])
    })

    it('冷启动接管的任务在 Chrome 界面被取消：只记一条取消', async () => {
      await restore('cold-ui-cancel', resource('audio'))
      stubSearch(() => USER_CANCELED_ITEM)

      await orchestrator.handleTaskComplete(artifactRequest('cold-ui-cancel'))
      await expectTaskRemoved()

      expect(outcomeMarks()).toEqual(['download_cancelled'])
      expect(mocks.notify).not.toHaveBeenCalled()
      expect(mocks.history).not.toHaveBeenCalled()
    })

    it('冷启动接管的任务由 offscreen 确认取消：重复确认不重复记', async () => {
      await restore('cold-confirm', resource('audio'))

      await expect(orchestrator.handleTaskCancelled({ taskId: 'cold-confirm' })).resolves.toEqual({
        accepted: true
      })
      await expect(orchestrator.handleTaskCancelled({ taskId: 'cold-confirm' })).resolves.toEqual({
        accepted: false
      })

      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
      expect(outcomeMarks()).toEqual(['download_cancelled'])
    })

    it('等待队列里直接移除的任务不记', async () => {
      await restore('blocker', resource('other'))
      await orchestrator.enqueueBatch([resource('audio')], null)
      const waiting = orchestrator.getSnapshot().tasks.find(task => task.status === 'waiting')

      await expect(orchestrator.cancelTask(waiting?.taskId ?? '')).resolves.toBe(true)

      expect(orchestrator.getSnapshot().tasks.map(task => task.taskId)).toEqual(['blocker'])
      expect(outcomeMarks()).toEqual([])
    })
  })
})
