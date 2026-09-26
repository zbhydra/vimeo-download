/**
 * Content MessageHandler 合同测试。
 *
 * 下载发起/取消/队列已统一改道 background 编排器，content 只保留资源查询。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { RpcContext, RpcServeHandlers } from '@/core/rpc/types'
import type { MediaResource, VideoGroupMetadata } from '@/core/types'
import type { ContentGetResourcesResponse } from '@/content/types'

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  servedHandlers: {
    value: null as RpcServeHandlers | null
  }
}))

vi.mock('@/core/rpc/serve', () => ({
  serve: vi.fn((_channel, handlers: RpcServeHandlers) => {
    mocks.servedHandlers.value = handlers
    return { stop: vi.fn() }
  })
}))

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

/** Popup Chrome RPC 上下文。 */
const POPUP_CONTEXT: RpcContext = {
  transport: 'chrome',
  caller: 'popup',
  tabId: 1
}

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

describe('MessageHandler getResources', () => {
  afterEach(() => {
    mocks.servedHandlers.value = null
    mocks.loggerError.mockClear()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('content 只注册资源查询能力', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    const { vimeoMessageHandler } = await import('@/sites/vimeo/content/messageHandler')
    vimeoMessageHandler.start()

    expect(Object.keys(mocks.servedHandlers.value ?? {})).toEqual(['getResources'])

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
})
