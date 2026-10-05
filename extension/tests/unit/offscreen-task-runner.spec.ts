/**
 * OffscreenTaskRunner 交付闭环单元测试。
 *
 * F1 回归防护：mock 的 BackgroundChannel.taskComplete 在应答前调用 runner.releaseTaskArtifact，
 * 精确复现 background「应答前先发起释放」的时序——修复前登记未就位恒返回 false（blob 永不
 * revoke），修复后必须穿透到 deliveredArtifacts 返回 true 并 revoke。另覆盖交付失败路径的
 * 登记撤销与 blob/OPFS 临时文件自回收。
 *
 * mux 产物走 OPFS（MuxOutputArtifact）：muxArtifactStore 整体 mock，断言 release 与交付失败
 * 两个回收点都会按 tempFileName 删除 OPFS 临时文件。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskProgress: vi.fn(),
  taskComplete: vi.fn(),
  taskFailed: vi.fn(),
  taskCancelled: vi.fn(),
  refreshSignatureRequest: vi.fn(),
  keepAlive: vi.fn(),
  remuxAudio: vi.fn(),
  transcodeMp3: vi.fn(),
  removeMuxArtifact: vi.fn(),
  sweepMuxArtifacts: vi.fn()
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
  ...(await importOriginal<typeof import('@/offscreen/mux')>()),
  remuxVimeoAudioToM4a: mocks.remuxAudio
}))

vi.mock('@/offscreen/mp3', () => ({ transcodeMuxArtifactToMp3: mocks.transcodeMp3 }))

vi.mock('@/offscreen/muxArtifactStore', () => ({
  sweepMuxArtifacts: mocks.sweepMuxArtifacts,
  removeMuxArtifact: mocks.removeMuxArtifact
}))

import {
  AUDIO_TARGET_FORMATS,
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES
} from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import {
  encodeVimeoSourceDescriptor,
  type VimeoSourceDescriptor
} from '@/sites/vimeo/shared'
import { offscreenTaskRunner } from '@/offscreen/OffscreenTaskRunner'

const PLAYLIST_URL = 'https://playlist.vimeocdn.com/p/playlist.json?sig=1'
const SEGMENT_URLS = ['https://seg.vimeocdn.com/seg-1.m4s', 'https://seg.vimeocdn.com/seg-2.m4s']
const TEMP_FILE_NAME = 'mock-task.m4a'

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
const originalRevokeObjectURL = URL.revokeObjectURL

describe('OffscreenTaskRunner 交付闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.remuxAudio.mockImplementation(
      async (blob: Blob, _range: undefined, _taskId: string) => ({
        file: new File([blob], TEMP_FILE_NAME, { type: 'audio/mp4' }),
        mimeType: 'audio/mp4',
        tempFileName: TEMP_FILE_NAME
      })
    )
    mocks.transcodeMp3.mockImplementation(async () => ({
      file: new File(['mp3'], 'audio.mp3', { type: 'audio/mpeg' }),
      mimeType: 'audio/mpeg',
      tempFileName: 'audio.mp3'
    }))
    mocks.taskProgress.mockResolvedValue({ recorded: true })
    mocks.taskFailed.mockResolvedValue({ accepted: true })
    mocks.taskCancelled.mockResolvedValue({ accepted: true })
    mocks.keepAlive.mockResolvedValue({ alive: true })
    mocks.removeMuxArtifact.mockResolvedValue(undefined)
    mocks.sweepMuxArtifacts.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectUrlMock
    URL.revokeObjectURL = revokeObjectUrlMock
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectURL
    vi.unstubAllGlobals()
  })

  it('taskComplete 应答前的释放请求命中已登记产物：release 返回 true，revoke 并删除 OPFS 临时文件', async () => {
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
    expect(mocks.removeMuxArtifact).toHaveBeenCalledWith(TEMP_FILE_NAME)
    // 登记已随释放移除：重复释放与未知产物都拒绝，且不会二次删除
    expect(offscreenTaskRunner.releaseTaskArtifact('t1', delivered.blobUrl)).toBe(false)
    expect(offscreenTaskRunner.releaseTaskArtifact('t-unknown', delivered.blobUrl)).toBe(false)
    expect(mocks.removeMuxArtifact).toHaveBeenCalledTimes(1)
    expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0)
  })

  it('taskComplete RPC 失败时撤销登记并自行回收 blob 与 OPFS 临时文件，任务转失败回传', async () => {
    mocks.taskComplete.mockRejectedValue(new Error('[mock] rpc down'))

    expect(offscreenTaskRunner.startTask('t2', audioResourceFixture('vimeo:1196869805:audio:a2'))).toBe(
      true
    )
    await vi.waitFor(() => {
      expect(mocks.taskFailed).toHaveBeenCalledTimes(1)
    })

    const attempted = mocks.taskComplete.mock.calls[0][0] as { taskId: string; blobUrl: string }
    expect(revokeObjectUrlMock).toHaveBeenCalledWith(attempted.blobUrl)
    expect(mocks.removeMuxArtifact).toHaveBeenCalledWith(TEMP_FILE_NAME)
    // 登记已撤销：迟到的释放请求不再命中，也不会二次删除
    expect(offscreenTaskRunner.releaseTaskArtifact('t2', attempted.blobUrl)).toBe(false)
    expect(mocks.removeMuxArtifact).toHaveBeenCalledTimes(1)
    expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0)
  })

  it('交付 ACK 前保留活跃任务，重签 continue/restart 均保留 MP3 输出', async () => {
    for (const mode of ['continue', 'restart'] as const) {
      const taskId = `refresh-${mode}`
      const resource = {
        ...audioResourceFixture('vimeo:1196869805:audio:a1'),
        targetFormat: AUDIO_TARGET_FORMATS.MP3
      }
      const refreshed = audioResourceFixture(resource.id)
      mocks.refreshSignatureRequest.mockResolvedValue({ mode, resource: refreshed })
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        url: PLAYLIST_URL,
        headers: { get: (): string => 'application/json' },
        json: async () => playlistPayload
      })
      let acknowledge: (() => void) | undefined
      mocks.taskComplete.mockImplementation(
        () =>
          new Promise<{ accepted: boolean }>(resolve => {
            acknowledge = () => resolve({ accepted: true })
          })
      )
      offscreenTaskRunner.startTask(taskId, resource)
      await vi.waitFor(() => expect(acknowledge).toBeDefined())
      expect(offscreenTaskRunner.listActiveTasks()).toEqual([
        expect.objectContaining({
          taskId,
          resource: expect.objectContaining({ targetFormat: 'mp3' })
        })
      ])
      expect(mocks.taskComplete).toHaveBeenLastCalledWith(
        expect.objectContaining({ mimeType: 'audio/mpeg' }),
        { timeout: 120_000 }
      )
      const artifact = mocks.taskComplete.mock.calls.at(-1)?.[0] as { blobUrl: string }
      offscreenTaskRunner.releaseTaskArtifact(taskId, artifact.blobUrl)
      acknowledge?.()
      await vi.waitFor(() => expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0))
    }
    expect(mocks.transcodeMp3).toHaveBeenCalledTimes(2)
  })

  it('playlist 使用任务 AbortSignal，取消中止尚未返回的 playlist 请求', async () => {
    fetchMock.mockImplementationOnce(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError'))
          )
        })
    )
    offscreenTaskRunner.startTask(
      'abort-playlist',
      audioResourceFixture('vimeo:1196869805:audio:a1')
    )
    expect(fetchMock).toHaveBeenLastCalledWith(
      PLAYLIST_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    offscreenTaskRunner.cancelTask('abort-playlist')
    await vi.waitFor(() =>
      expect(mocks.taskCancelled).toHaveBeenCalledWith({ taskId: 'abort-playlist' })
    )
    expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0)
  })
})
