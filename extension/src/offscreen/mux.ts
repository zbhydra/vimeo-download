/**
 * Vimeo DASH/HLS 片段 remux 与区间裁剪（offscreen document 执行版）。
 *
 * 使用 Mediabunny 复制 encoded packets 到新的
 * MP4/M4A 容器，不做转码。裁剪按 packet 边界完成：视频起点前移到不晚于请求起点的关键帧
 * （否则首帧无法解码），终点取第一个不早于请求终点的 packet；音频沿用视频的时间基准，
 * 保证裁剪后不出现音画错位。
 */

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
  type EncodedPacket,
  type InputTrack,
  type VideoCodec
} from 'mediabunny'

import type { VimeoTimeRange } from '@/sites/vimeo/shared'

/** Vimeo mux 失败。 */
export class VimeoMuxError extends Error {
  /** 失败轨道。 */
  readonly trackKind?: 'video' | 'audio'

  constructor(message: string, trackKind?: 'video' | 'audio') {
    super(`[VimeoMux] ${message}, track=${trackKind ?? 'none'}`)
    this.name = 'VimeoMuxError'
    this.trackKind = trackKind
  }
}

/** packet 级裁剪窗口。 */
interface VimeoPacketWindow {
  /** 输出时间轴零点对应的输入 packet 时间。 */
  startTimestamp: number
  /** 输入 packet 时间上限；Infinity 表示直到媒体结尾。 */
  endTimestamp: number
  /** 该 track 的迭代起点，null 表示 track 没有 packet。 */
  startPacket: EncodedPacket | null
}

/**
 * 合成 video+audio fragmented MP4。
 *
 * @param videoBlob 已下载的 video fragmented MP4
 * @param audioBlob 已下载的 audio fragmented MP4；传 null 时输出纯视频文件
 * @param range 片段区间；不传表示整片
 */
export async function muxVimeoVideoToMp4(
  videoBlob: Blob,
  audioBlob: Blob | null,
  range?: VimeoTimeRange
): Promise<Blob> {
  const videoInput = new Input({
    formats: [MP4],
    source: new BlobSource(videoBlob)
  })
  const audioInput = audioBlob
    ? new Input({
        formats: [MP4],
        source: new BlobSource(audioBlob)
      })
    : null

  try {
    const videoTrack = await videoInput.getPrimaryVideoTrack()
    if (!videoTrack) {
      throw new VimeoMuxError('缺少 video track', 'video')
    }

    const videoCodec = await videoTrack.getCodec()
    if (!videoCodec) {
      throw new VimeoMuxError('缺少 video codec', 'video')
    }

    // 调用方给了 audio blob 就要求其中确实有音频轨：静默产出无声文件比直接失败更难排查。
    const audioTrack = audioInput ? await audioInput.getPrimaryAudioTrack() : null
    if (audioInput && !audioTrack) {
      throw new VimeoMuxError('缺少 audio track', 'audio')
    }

    const audioCodec = audioTrack ? await audioTrack.getCodec() : null
    if (audioTrack && !audioCodec) {
      throw new VimeoMuxError('缺少 audio codec', 'audio')
    }

    const window = range ? await resolvePacketWindow(videoTrack, range, true) : null
    const audioWindow = window && audioTrack ? await createAudioWindow(audioTrack, window) : null

    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target
    })
    const videoSource = new EncodedVideoPacketSource(videoCodec as VideoCodec)
    output.addVideoTrack(videoSource, {
      rotation: await videoTrack.getRotation()
    })

    const audioSource =
      audioTrack && audioCodec ? new EncodedAudioPacketSource(audioCodec as AudioCodec) : null
    if (audioSource) {
      output.addAudioTrack(audioSource)
    }

    await output.start()
    const tasks: Array<Promise<void>> = [addVideoPackets(videoInput, videoSource, window)]
    if (audioInput && audioSource) {
      tasks.push(addAudioPackets(audioInput, audioSource, audioWindow))
    }
    await Promise.all(tasks)
    await output.finalize()

    if (!target.buffer) {
      throw new VimeoMuxError('输出 buffer 为空')
    }
    return new Blob([target.buffer], { type: 'video/mp4' })
  } catch (error) {
    if (error instanceof VimeoMuxError) {
      throw error
    }
    console.error(error)
    throw new VimeoMuxError(error instanceof Error ? error.message : String(error))
  } finally {
    videoInput.dispose()
    audioInput?.dispose()
  }
}

/** 重封装 audio fragmented MP4 为 M4A。 */
export async function remuxVimeoAudioToM4a(audioBlob: Blob, range?: VimeoTimeRange): Promise<Blob> {
  const audioInput = new Input({
    formats: [MP4],
    source: new BlobSource(audioBlob)
  })

  try {
    const audioTrack = await audioInput.getPrimaryAudioTrack()
    if (!audioTrack) {
      throw new VimeoMuxError('缺少 audio track', 'audio')
    }

    const audioCodec = await audioTrack.getCodec()
    if (!audioCodec) {
      throw new VimeoMuxError('缺少 audio codec', 'audio')
    }

    // 纯音频没有关键帧概念，窗口起点取覆盖请求起点的 packet。
    const window = range ? await resolvePacketWindow(audioTrack, range, false) : null

    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target
    })
    const audioSource = new EncodedAudioPacketSource(audioCodec as AudioCodec)
    output.addAudioTrack(audioSource)
    await output.start()
    await addAudioPackets(audioInput, audioSource, window)
    await output.finalize()

    if (!target.buffer) {
      throw new VimeoMuxError('audio 输出 buffer 为空', 'audio')
    }
    return new Blob([target.buffer], { type: 'audio/mp4' })
  } catch (error) {
    if (error instanceof VimeoMuxError) {
      throw error
    }
    console.error(error)
    throw new VimeoMuxError(error instanceof Error ? error.message : String(error), 'audio')
  } finally {
    audioInput.dispose()
  }
}

/** 重封装单条 muxed fMP4 HLS 为 MP4；要求至少包含 video track，audio 可选。 */
export async function remuxVimeoMuxedMp4ToMp4(
  inputBlob: Blob,
  range?: VimeoTimeRange
): Promise<Blob> {
  const videoInput = new Input({
    formats: [MP4],
    source: new BlobSource(inputBlob)
  })
  const audioInput = new Input({
    formats: [MP4],
    source: new BlobSource(inputBlob)
  })

  try {
    const videoTrack = await videoInput.getPrimaryVideoTrack()
    if (!videoTrack) {
      throw new VimeoMuxError('HLS fMP4 缺少 video track', 'video')
    }

    const audioTrack = await audioInput.getPrimaryAudioTrack()
    const videoCodec = await videoTrack.getCodec()
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null
    if (!videoCodec) {
      throw new VimeoMuxError('HLS fMP4 缺少 video codec', 'video')
    }

    const window = range ? await resolvePacketWindow(videoTrack, range, true) : null
    const audioWindow = window && audioTrack ? await createAudioWindow(audioTrack, window) : null

    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target
    })
    const videoSource = new EncodedVideoPacketSource(videoCodec as VideoCodec)
    const audioSource =
      audioTrack && audioCodec ? new EncodedAudioPacketSource(audioCodec as AudioCodec) : null
    output.addVideoTrack(videoSource, {
      rotation: await videoTrack.getRotation()
    })
    if (audioSource) {
      output.addAudioTrack(audioSource)
    }

    await output.start()
    const tasks: Array<Promise<void>> = [addVideoPackets(videoInput, videoSource, window)]
    if (audioSource) {
      tasks.push(addAudioPackets(audioInput, audioSource, audioWindow))
    }
    await Promise.all(tasks)
    await output.finalize()

    if (!target.buffer) {
      throw new VimeoMuxError('HLS fMP4 输出 buffer 为空')
    }
    return new Blob([target.buffer], { type: 'video/mp4' })
  } catch (error) {
    if (error instanceof VimeoMuxError) {
      throw error
    }
    console.error(error)
    throw new VimeoMuxError(error instanceof Error ? error.message : String(error))
  } finally {
    videoInput.dispose()
    audioInput.dispose()
  }
}

/**
 * 把秒级裁剪区间解析成 packet 窗口。
 *
 * @param track 目标 track
 * @param range 相对媒体起点的秒级区间
 * @param alignToKeyPacket 视频必须为 true：从关键帧开始才能解码；音频没有关键帧概念
 */
async function resolvePacketWindow(
  track: InputTrack,
  range: VimeoTimeRange,
  alignToKeyPacket: boolean
): Promise<VimeoPacketWindow> {
  const trackKind = alignToKeyPacket ? 'video' : 'audio'
  const firstTimestamp = await track.getFirstTimestamp()
  // getKeyPacket/getPacket 只会返回不晚于给定时间的最后一个 packet，起点越界时必须自己拦下，
  // 否则用户会拿到一段与请求无关的片尾。
  const mediaSeconds = (await track.computeDuration()) - firstTimestamp
  if (range.startSeconds >= mediaSeconds) {
    throw new VimeoMuxError(
      `裁剪区间起点超出媒体长度: startSeconds=${range.startSeconds}, endSeconds=${range.endSeconds}, mediaSeconds=${mediaSeconds}`,
      trackKind
    )
  }

  const sink = new EncodedPacketSink(track)
  const startTimestamp = firstTimestamp + range.startSeconds
  const startPacket = alignToKeyPacket
    ? await sink.getKeyPacket(startTimestamp, { verifyKeyPackets: true })
    : await sink.getPacket(startTimestamp)
  if (!startPacket) {
    throw new VimeoMuxError(
      `裁剪区间找不到可解码起点: startSeconds=${range.startSeconds}, endSeconds=${range.endSeconds}`,
      trackKind
    )
  }

  return {
    startTimestamp: startPacket.timestamp,
    endTimestamp: firstTimestamp + range.endSeconds,
    startPacket
  }
}

/**
 * 把视频窗口转成同一时间基准上的音频窗口。
 *
 * 音频起点取覆盖窗口起点的 packet，时间基准沿用视频窗口：两条轨道减同一个零点，
 * 裁剪结果才不会音画错位。
 */
async function createAudioWindow(
  track: InputTrack,
  videoWindow: VimeoPacketWindow
): Promise<VimeoPacketWindow> {
  const sink = new EncodedPacketSink(track)
  return {
    ...videoWindow,
    startPacket: await sink.getPacket(videoWindow.startTimestamp)
  }
}

/** 添加 video packets；传 window 时只输出区间内的 packets 并把零点移到区间起点。 */
async function addVideoPackets(
  input: Input<BlobSource>,
  source: EncodedVideoPacketSource,
  window?: VimeoPacketWindow | null
): Promise<void> {
  const track = await input.getPrimaryVideoTrack()
  if (!track) {
    throw new VimeoMuxError('读取 video track 失败', 'video')
  }

  const decoderConfig = await track.getDecoderConfig()
  const sink = new EncodedPacketSink(track)
  const startPacket = window ? window.startPacket : await sink.getFirstPacket()
  const baseTimestamp = window ? window.startTimestamp : await track.getFirstTimestamp()
  const endTimestamp = window?.endTimestamp ?? Infinity

  for await (const packet of sink.packets(startPacket ?? undefined, undefined, {
    verifyKeyPackets: true
  })) {
    if (packet.timestamp >= endTimestamp) {
      break
    }
    const timestamp = Math.max(0, packet.timestamp - baseTimestamp)
    await source.add(packet.clone({ timestamp }), {
      decoderConfig: decoderConfig ?? undefined
    })
  }
  source.close()
}

/** 添加 audio packets；传 window 时只输出区间内的 packets 并把零点移到区间起点。 */
async function addAudioPackets(
  input: Input<BlobSource>,
  source: EncodedAudioPacketSource,
  window?: VimeoPacketWindow | null
): Promise<void> {
  const track = await input.getPrimaryAudioTrack()
  if (!track) {
    throw new VimeoMuxError('读取 audio track 失败', 'audio')
  }

  const decoderConfig = await track.getDecoderConfig()
  const sink = new EncodedPacketSink(track)
  const startPacket = window ? window.startPacket : await sink.getFirstPacket()
  const baseTimestamp = window ? window.startTimestamp : await track.getFirstTimestamp()
  const endTimestamp = window?.endTimestamp ?? Infinity

  for await (const packet of sink.packets(startPacket ?? undefined)) {
    if (packet.timestamp >= endTimestamp) {
      break
    }
    const timestamp = Math.max(0, packet.timestamp - baseTimestamp)
    await source.add(packet.clone({ timestamp }), {
      decoderConfig: decoderConfig ?? undefined
    })
  }
  source.close()
}
