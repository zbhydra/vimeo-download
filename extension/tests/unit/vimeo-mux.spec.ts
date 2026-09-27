/**
 * Vimeo mux 真实行为测试。
 *
 * 不 mock Mediabunny：用合成 fMP4 夹具走完整 remux 链路，覆盖单轨输出、区间裁剪窗口与
 * 区间越界。夹具的 packet 数据是占位 NAL，但关键帧标记真实，因此关键帧对齐行为可验证。
 *
 * 产物经 StreamTarget 落 OPFS（happy-dom 无实现）：安装 tests/mocks/opfs 的内存 OPFS，
 * 定位写语义与 FileSystemWritableFileStream 对齐；另用同 fastStart 配置的旧 BufferTarget
 * 参照路径断言单轨产物字节级一致（音视频混流因 mdat 交错顺序受调度影响，不做字节断言，
 * 仍以时间线回读覆盖）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  type AudioCodec,
  type VideoCodec
} from 'mediabunny'

import { createMp4Fixture, readMp4TrackTimeline } from '../mocks/mp4-fixtures'
import { installOpfsMock, restoreOpfsMock } from '../mocks/opfs'
import {
  muxVimeoVideoToMp4,
  remuxVimeoAudioToM4a,
  remuxVimeoMuxedMp4ToMp4
} from '@/offscreen/mux'

describe('Vimeo mux 单轨与区间裁剪', () => {
  beforeEach(() => {
    installOpfsMock()
  })

  afterEach(() => {
    restoreOpfsMock()
  })

  it('没有音轨时输出纯视频 MP4，时间线与输入一致', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })

    const artifact = await muxVimeoVideoToMp4(video, null, undefined, 'mux-test-video-only')
    expect(artifact.tempFileName).toBe('mux-test-video-only.mp4')
    expect(artifact.mimeType).toBe('video/mp4')
    const timeline = await readMp4TrackTimeline(artifact.file, 'video')

    expect(timeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(timeline.lastTimestamp).toBe(4)
    await expect(readMp4TrackTimeline(artifact.file, 'audio')).rejects.toThrow('缺少 audio track')
  })

  it('传入没有音频轨的 blob 时明确失败，不静默产出无声文件', async () => {
    const video = await createMp4Fixture({ videoPackets: 4 })

    await expect(
      muxVimeoVideoToMp4(video, video, undefined, 'mux-test-no-audio')
    ).rejects.toThrow('缺少 audio track')
  })

  it('区间裁剪从关键帧开始，并把零点移到裁剪起点', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })

    // 起点 1s 落在关键帧 0 与 2 之间：视频只能从 0s 的关键帧开始解码，因此带 1s 前滚。
    const midClip = await muxVimeoVideoToMp4(
      video,
      null,
      { startSeconds: 1, endSeconds: 3 },
      'mux-test-mid-clip'
    )
    const midTimeline = await readMp4TrackTimeline(midClip.file, 'video')
    expect(midTimeline.firstTimestamp).toBe(0)
    expect(midTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2, 2.5])
    expect(midTimeline.lastTimestamp).toBe(3)

    // 起点 2.5s 落在关键帧 2s 之后：从 2s 关键帧开始，终点仍取请求的 4s。
    const keyClip = await muxVimeoVideoToMp4(
      video,
      null,
      { startSeconds: 2.5, endSeconds: 4 },
      'mux-test-key-clip'
    )
    const keyTimeline = await readMp4TrackTimeline(keyClip.file, 'video')
    expect(keyTimeline.keyTimestamps).toEqual([0])
    expect(keyTimeline.timestamps).toEqual([0, 0.5, 1, 1.5])
    expect(keyTimeline.lastTimestamp).toBe(2)
  })

  it('请求终点超出媒体长度时输出到媒体结尾为止', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })

    const tail = await muxVimeoVideoToMp4(
      video,
      null,
      { startSeconds: 3, endSeconds: 99 },
      'mux-test-tail'
    )
    const timeline = await readMp4TrackTimeline(tail.file, 'video')

    expect(timeline.lastTimestamp).toBe(2)
    expect(timeline.timestamps).toEqual([0, 0.5, 1, 1.5])
  })

  it('请求起点超出媒体长度时拒绝裁剪', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })

    await expect(
      muxVimeoVideoToMp4(
        video,
        null,
        { startSeconds: 10, endSeconds: 12 },
        'mux-test-out-of-range'
      )
    ).rejects.toThrow('裁剪区间起点超出媒体长度')
  })

  it('整片输出与既有行为一致：不带区间时时间线不变', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })
    const audio = await createMp4Fixture({ videoPackets: 0, audioPackets: 10 })

    const muxed = await muxVimeoVideoToMp4(video, audio, undefined, 'mux-test-full')
    const videoTimeline = await readMp4TrackTimeline(muxed.file, 'video')
    const audioTimeline = await readMp4TrackTimeline(muxed.file, 'audio')

    expect(videoTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(audioTimeline.timestamps).toHaveLength(10)
  })

  it('音视频共用同一裁剪零点，输出不出现音画错位', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })
    const audio = await createMp4Fixture({ videoPackets: 0, audioPackets: 10 })

    const muxed = await muxVimeoVideoToMp4(
      video,
      audio,
      { startSeconds: 1, endSeconds: 2.5 },
      'mux-test-av-zero'
    )

    const videoTimeline = await readMp4TrackTimeline(muxed.file, 'video')
    const audioTimeline = await readMp4TrackTimeline(muxed.file, 'audio')
    expect(videoTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2])
    expect(audioTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2])
    expect(videoTimeline.lastTimestamp).toBe(2.5)
    expect(audioTimeline.lastTimestamp).toBe(2.5)
  })

  it('零点落在非零关键帧时，音视频仍共用同一零点', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })
    const audio = await createMp4Fixture({ videoPackets: 0, audioPackets: 10 })

    // 关键帧在 0s 与 2s：请求起点 2.5s 只能前滚到 2s 关键帧，零点因此落在 2s 而不是媒体起点。
    const muxed = await muxVimeoVideoToMp4(
      video,
      audio,
      { startSeconds: 2.5, endSeconds: 4 },
      'mux-test-key-zero'
    )

    const videoTimeline = await readMp4TrackTimeline(muxed.file, 'video')
    const audioTimeline = await readMp4TrackTimeline(muxed.file, 'audio')
    // 音频若按请求起点而不是视频关键帧取零点，会整体前移 0.5s 而不再是这组时间戳。
    expect(videoTimeline.timestamps).toEqual([0, 0.5, 1, 1.5])
    expect(audioTimeline.timestamps).toEqual([0, 0.5, 1, 1.5])
    expect(videoTimeline.lastTimestamp).toBe(2)
    expect(audioTimeline.lastTimestamp).toBe(2)
  })

  it('audio-only 裁剪取覆盖起点的 packet，并可直接播放到请求终点', async () => {
    const audio = await createMp4Fixture({ videoPackets: 0, audioPackets: 10 })

    const full = await remuxVimeoAudioToM4a(audio, undefined, 'mux-test-audio-full')
    expect(full.tempFileName).toBe('mux-test-audio-full.m4a')
    expect(full.mimeType).toBe('audio/mp4')
    expect((await readMp4TrackTimeline(full.file, 'audio')).lastTimestamp).toBe(5)

    // 起点 1.2s 由 1.0s 起始的 packet 覆盖，因此前滚 0.2s。
    const clip = await remuxVimeoAudioToM4a(
      audio,
      { startSeconds: 1.2, endSeconds: 3 },
      'mux-test-audio-clip'
    )
    const timeline = await readMp4TrackTimeline(clip.file, 'audio')
    expect(timeline.firstTimestamp).toBe(0)
    expect(timeline.timestamps).toEqual([0, 0.5, 1, 1.5])
    expect(timeline.lastTimestamp).toBe(2)
  })

  it('HLS muxed fMP4 走同一条 remux 链路并支持区间裁剪', async () => {
    const muxed = await createMp4Fixture({
      videoPackets: 8,
      audioPackets: 10,
      keyFrameInterval: 4
    })

    const full = await remuxVimeoMuxedMp4ToMp4(muxed, undefined, 'mux-test-hls-full')
    expect((await readMp4TrackTimeline(full.file, 'video')).timestamps).toHaveLength(8)

    const clip = await remuxVimeoMuxedMp4ToMp4(
      muxed,
      { startSeconds: 1, endSeconds: 2.5 },
      'mux-test-hls-clip'
    )
    const videoTimeline = await readMp4TrackTimeline(clip.file, 'video')
    const audioTimeline = await readMp4TrackTimeline(clip.file, 'audio')
    expect(videoTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2])
    expect(audioTimeline.timestamps).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('StreamTarget 落盘产物与旧 BufferTarget 路径字节级一致（纯视频）', async () => {
    const video = await createMp4Fixture({ videoPackets: 8, keyFrameInterval: 4 })

    const artifact = await muxVimeoVideoToMp4(video, null, undefined, 'mux-test-bytes-video')
    const streamed = new Uint8Array(await artifact.file.arrayBuffer())
    const buffered = await remuxWithBufferTarget(video, null)

    expect(streamed).toEqual(buffered)
  })

  it('StreamTarget 落盘产物与旧 BufferTarget 路径字节级一致（纯音频）', async () => {
    const audio = await createMp4Fixture({ videoPackets: 0, audioPackets: 10 })

    const artifact = await remuxVimeoAudioToM4a(audio, undefined, 'mux-test-bytes-audio')
    const streamed = new Uint8Array(await artifact.file.arrayBuffer())
    const buffered = await remuxWithBufferTarget(null, audio)

    expect(streamed).toEqual(buffered)
  })
})

/**
 * 参照实现：旧 BufferTarget 全内存路径。
 *
 * fastStart 与现路径一致（false），仅把目标换回内存 buffer；单轨输入无 mdat 交错问题，
 * 输出字节确定，用作 StreamTarget 落盘产物的字节级对照。
 */
async function remuxWithBufferTarget(videoBlob: Blob | null, audioBlob: Blob | null): Promise<Uint8Array> {
  const videoInput = videoBlob ? new Input({ formats: [MP4], source: new BlobSource(videoBlob) }) : null
  const audioInput = audioBlob ? new Input({ formats: [MP4], source: new BlobSource(audioBlob) }) : null
  try {
    const videoTrack = videoInput ? await videoInput.getPrimaryVideoTrack() : null
    const audioTrack = audioInput ? await audioInput.getPrimaryAudioTrack() : null
    if (!videoTrack && !audioTrack) {
      throw new Error('[vimeo-mux.spec] 参照路径需要至少一条轨道')
    }

    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const videoSource =
      videoTrack ? new EncodedVideoPacketSource((await videoTrack.getCodec()) as VideoCodec) : null
    const audioSource =
      audioTrack ? new EncodedAudioPacketSource((await audioTrack.getCodec()) as AudioCodec) : null
    if (videoSource) {
      output.addVideoTrack(videoSource)
    }
    if (audioSource) {
      output.addAudioTrack(audioSource)
    }
    await output.start()

    const tasks: Array<Promise<void>> = []
    if (videoTrack && videoSource) {
      const decoderConfig = await videoTrack.getDecoderConfig()
      const sink = new EncodedPacketSink(videoTrack)
      tasks.push((async () => {
        for await (const packet of sink.packets(undefined, undefined, { verifyKeyPackets: true })) {
          await videoSource.add(packet, { decoderConfig: decoderConfig ?? undefined })
        }
        videoSource.close()
      })())
    }
    if (audioTrack && audioSource) {
      const decoderConfig = await audioTrack.getDecoderConfig()
      const sink = new EncodedPacketSink(audioTrack)
      tasks.push((async () => {
        for await (const packet of sink.packets()) {
          await audioSource.add(packet, { decoderConfig: decoderConfig ?? undefined })
        }
        audioSource.close()
      })())
    }
    await Promise.all(tasks)
    await output.finalize()

    if (!target.buffer) {
      throw new Error('[vimeo-mux.spec] 参照路径输出 buffer 为空')
    }
    return new Uint8Array(target.buffer)
  } finally {
    videoInput?.dispose()
    audioInput?.dispose()
  }
}
