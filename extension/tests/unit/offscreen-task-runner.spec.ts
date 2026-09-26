/**
 * OffscreenTaskRunner 交付闭环单元测试。
 *
 * F1 回归防护：mock 的 BackgroundChannel.taskComplete 在应答前调用 runner.releaseTaskArtifact，
 * 精确复现 background「应答前先发起释放」的时序——修复前登记未就位恒返回 false（blob 永不
 * revoke），修复后必须穿透到 deliveredArtifacts 返回 true 并 revoke。另覆盖交付失败路径的
 * 登记撤销与 blob 自回收。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskProgress: vi.fn(),
  taskComplete: vi.fn(),
  taskFailed: vi.fn(),
  taskCancelled: vi.fn(),
  refreshSignatureRequest: vi.fn(),
  keepAlive: vi.fn(),
  remuxAudio: vi.fn()
}))

vi.mock('@/offscreen/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    taskProgress = mocks.taskProgress
    taskComplete = mocks.taskComplete
    taskFailed = mocks.taskFailed
    taskCancelled = mocks.taskCancelled
    refreshSignatureRequest = mocks.refreshSignatureRequest
    keepAlive = mocks.keepAlive
  }
}))

vi.mock('@/offscreen/mux', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  remuxVimeoAudioToM4a: mocks.remuxAudio
}))

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import {
  encodeVimeoSourceDescriptor,
  type VimeoSourceDescriptor
} from '@/sites/vimeo/shared'
import { offscreenTaskRunner } from '@/offscreen/OffscreenTaskRunner'

const PLAYLIST_URL = 'https://playlist.vimeocdn.com/p/playlist.json?sig=1'
const SEGMENT_URLS = ['https://seg.vimeocdn.com/seg-1.m4s', 'https://seg.vimeocdn.com/seg-2.m4s']

/** 构造 DASH 纯音频资源；descriptor 经真实编码器生成，保证 assertSourceDescriptorMatch 通过。 */
function audioResourceFixture(resourceId: string): MediaResource {
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: '1196869805',
    sourceId: resourceId,
    optionId: '195kbps',
    kind: 'audio',
    delivery: 'dash',
    label: '195 kbps',
    configUrl: 'https://player.vimeo.com/video/1196869805/config?expires=1&signature=x',
    dashPlaylistUrl: PLAYLIST_URL,
    audioTrackId: 'a1'
  }

  return {
    id: resourceId,
    messageId: '1196869805',
    index: 0,
    url: PLAYLIST_URL,
    type: RESOURCE_TYPES.AUDIO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO,
    mimeType: 'audio/mp4',
    filename: 'audio.m4a',
    size: 12,
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: '1196869805' }
  }
}

/** playlist JSON：全部 URL 落在 vimeocdn，字段名与 readDashTracks/readDashSegments 对齐。 */
const playlistPayload = {
  base_url: '',
  audio: [
    {
      id: 'a1',
      base_url: '',
      mime_type: 'audio/mp4',
      codecs: 'mp4a.40.2',
      init_segment: btoa('init'),
      segments: SEGMENT_URLS.map(url => ({ url, size: 4 }))
    }
  ],
  video: []
}

/** 按投入 URL 分发的 fetch 桩；body 置空走 arrayBuffer 回退读取路径。 */
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = input.toString()
  if (url === PLAYLIST_URL) {
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: (): string => 'application/json' },
      json: async () => playlistPayload
    }
  }
  if (SEGMENT_URLS.includes(url)) {
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: (): string => 'audio/mp4' },
      body: null,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    }
  }
  throw new Error(`[offscreen-task-runner.spec] unexpected fetch: ${url}`)
})

/** happy-dom 不保证实现 blob URL 静态方法：显式接管并记录调用。 */
const createObjectUrlMock = vi.fn((blob: Blob) => `blob:mock-${(blob as Blob).size}`)
const revokeObjectUrlMock = vi.fn()
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

describe('OffscreenTaskRunner 交付闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.remuxAudio.mockImplementation(async (blob: Blob) => blob)
    mocks.taskProgress.mockResolvedValue({ recorded: true })
    mocks.taskFailed.mockResolvedValue({ accepted: true })
    mocks.keepAlive.mockResolvedValue({ alive: true })
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectUrlMock
    URL.revokeObjectURL = revokeObjectUrlMock
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    vi.unstubAllGlobals()
  })

  it('taskComplete 应答前的释放请求命中已登记产物：release 返回 true 并 revoke', async () => {
    let releasedDuringComplete: boolean | null = null
    mocks.taskComplete.mockImplementation(async (params: { taskId: string; blobUrl: string }) => {
      // 复现 background handleTaskComplete：应答前先发起 releaseTaskArtifact
      releasedDuringComplete = offscreenTaskRunner.releaseTaskArtifact(
        params.taskId,
        params.blobUrl
      )
      return { accepted: true }
    })

    expect(offscreenTaskRunner.startTask('t1', audioResourceFixture('vimeo:1196869805:audio:a1'))).toBe(
      true
    )
    await vi.waitFor(() => {
      expect(mocks.taskComplete).toHaveBeenCalledTimes(1)
    })

    const delivered = mocks.taskComplete.mock.calls[0][0] as { taskId: string; blobUrl: string }
    expect(releasedDuringComplete).toBe(true)
    expect(revokeObjectUrlMock).toHaveBeenCalledWith(delivered.blobUrl)
    // 登记已随释放移除：重复释放与未知产物都拒绝
    expect(offscreenTaskRunner.releaseTaskArtifact('t1', delivered.blobUrl)).toBe(false)
    expect(offscreenTaskRunner.releaseTaskArtifact('t-unknown', delivered.blobUrl)).toBe(false)
    expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0)
  })

  it('taskComplete RPC 失败时撤销登记并自行回收 blob，任务转失败回传', async () => {
    mocks.taskComplete.mockRejectedValue(new Error('[mock] rpc down'))

    expect(offscreenTaskRunner.startTask('t2', audioResourceFixture('vimeo:1196869805:audio:a2'))).toBe(
      true
    )
    await vi.waitFor(() => {
      expect(mocks.taskFailed).toHaveBeenCalledTimes(1)
    })

    const attempted = mocks.taskComplete.mock.calls[0][0] as { taskId: string; blobUrl: string }
    expect(revokeObjectUrlMock).toHaveBeenCalledWith(attempted.blobUrl)
    // 登记已撤销：迟到的释放请求不再命中
    expect(offscreenTaskRunner.releaseTaskArtifact('t2', attempted.blobUrl)).toBe(false)
    expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0)
  })
})
