import { afterEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { RpcContext, RpcServeHandlers } from '@/core/rpc/types'
import type { MediaResource, VideoGroupMetadata } from '@/core/types'
import type { ContentGetResourcesResponse } from '@/content/types'

const mocks = vi.hoisted(() => ({
  enqueueMany: vi.fn(),
  getDownloadQueue: vi.fn(() => ({ scopeId: 'vimeo-scope', revision: 2, tasks: [] })),
  cancelDownloadTask: vi.fn(() => true),
  retryDownloadTask: vi.fn(() => true),
  loggerError: vi.fn(),
  servedHandlers: {
    value: null as RpcServeHandlers | null
  }
}))

vi.mock('@/core/content/download', () => ({
  enqueueMany: mocks.enqueueMany,
  downloadManager: {
    getSnapshot: mocks.getDownloadQueue,
    cancel: mocks.cancelDownloadTask,
    retry: mocks.retryDownloadTask
  }
}))

vi.mock('@/core/rpc/serve', () => ({
  serve: vi.fn((_channel, handlers: RpcServeHandlers) => {
    mocks.servedHandlers.value = handlers
    return { stop: vi.fn() }
  })
}))

/** Popup Chrome RPC 上下文。 */
const POPUP_CONTEXT: RpcContext = {
  transport: 'chrome',
  caller: 'popup',
  tabId: 1
}

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: vi.fn(() => ({
    updateBadge: vi.fn(() => Promise.resolve({ success: true }))
  }))
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError
  }
}))

function resourceFixture(
  id: string,
  groupMetadata?: VideoGroupMetadata,
  messageId = '1196869805'
): MediaResource {
  return {
    id,
    messageId,
    index: 0,
    url: `https://vod-adaptive-ak.vimeocdn.com/${id}/playlist.json`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    chatId: `vimeo:${messageId}`,
    ...(groupMetadata ? { groupMetadata } : {}),
    metadata: { messageId: id }
  }
}

describe('MessageHandler downloadBatch', () => {
  afterEach(() => {
    mocks.servedHandlers.value = null
    mocks.enqueueMany.mockClear()
    mocks.getDownloadQueue.mockClear()
    mocks.cancelDownloadTask.mockClear()
    mocks.retryDownloadTask.mockClear()
    mocks.loggerError.mockClear()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('按 resourceIds 顺序回查并在入队后立即返回，不等待任务 completion', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    const [{ vimeoMessageHandler }, { vimeoResourceBuffer }] = await Promise.all([
      import('@/sites/vimeo/content/messageHandler'),
      import('@/sites/vimeo/content/resourceBuffer')
    ])
    const first = resourceFixture('first')
    const second = resourceFixture('second')
    vimeoResourceBuffer.mergeVideoResources('1196869805', [first, second])
    vimeoMessageHandler.start()

    const result = await mocks.servedHandlers.value?.downloadBatch?.(
      {
        resourceIds: [second.id, 'missing', first.id],
        url: 'https://legacy.example/video.mp4',
        type: RESOURCE_TYPES.VIDEO
      },
      POPUP_CONTEXT
    )

    expect(result).toEqual({ accepted: true, count: 2 })
    expect(mocks.enqueueMany).toHaveBeenCalledWith([second, first])
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[MessageHandler:vimeo] downloadBatch 找不到资源: resourceId=missing'
    )
    expect(await mocks.servedHandlers.value?.getDownloadQueue?.(undefined, POPUP_CONTEXT)).toEqual({
      scopeId: 'vimeo-scope',
      revision: 2,
      tasks: []
    })
    vimeoResourceBuffer.clear()
    vimeoMessageHandler.stop()
  })

  it('所有资源都缺失时正常返回未启动', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    const { vimeoMessageHandler } = await import('@/sites/vimeo/content/messageHandler')
    vimeoMessageHandler.start()

    const result = await mocks.servedHandlers.value?.downloadBatch?.(
      { resourceIds: ['missing'] },
      POPUP_CONTEXT
    )

    expect(result).toEqual({ accepted: false, count: 0 })
    expect(mocks.enqueueMany).toHaveBeenCalledWith([])
    vimeoMessageHandler.stop()
  })

  it('getResources 响应携带按组序排列的 videoGroups', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    const [{ vimeoMessageHandler }, { vimeoResourceBuffer }] = await Promise.all([
      import('@/sites/vimeo/content/messageHandler'),
      import('@/sites/vimeo/content/resourceBuffer')
    ])
    const metaFirst: VideoGroupMetadata = {
      title: 'First Video',
      author: 'Author A',
      durationSeconds: 30,
      thumbnailUrl: 'https://i.vimeocdn.com/video/cover-first'
    }
    const metaSecond: VideoGroupMetadata = { title: 'Second Video' }
    vimeoResourceBuffer.mergeVideoResources('1196869805', [resourceFixture('first', metaFirst)])
    vimeoResourceBuffer.mergeVideoResources('222', [
      resourceFixture('second', metaSecond, '222')
    ])
    vimeoMessageHandler.start()

    const result = (await mocks.servedHandlers.value?.getResources?.(
      undefined,
      POPUP_CONTEXT
    )) as ContentGetResourcesResponse | undefined

    // 组序沿用 buffer 写入顺序（= 捕获顺序），popup 不重排。
    expect(result?.videoGroups).toEqual([
      { videoId: '1196869805', ...metaFirst },
      { videoId: '222', ...metaSecond }
    ])
    expect(result?.count).toBe(2)

    vimeoResourceBuffer.clear()
    vimeoMessageHandler.stop()
  })

  it('按 taskId 调用唯一下载管理器取消或重试任务', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    const { vimeoMessageHandler } = await import('@/sites/vimeo/content/messageHandler')
    vimeoMessageHandler.start()

    expect(
      await mocks.servedHandlers.value?.cancelDownloadTask?.(
        { taskId: 'vimeo-scope:7' },
        POPUP_CONTEXT
      )
    ).toEqual({ accepted: true })
    expect(mocks.cancelDownloadTask).toHaveBeenCalledWith('vimeo-scope:7')
    expect(
      await mocks.servedHandlers.value?.retryDownloadTask?.(
        { taskId: 'vimeo-scope:8' },
        POPUP_CONTEXT
      )
    ).toEqual({ accepted: true })
    expect(mocks.retryDownloadTask).toHaveBeenCalledWith('vimeo-scope:8')
    vimeoMessageHandler.stop()
  })
})
