/**
 * 合成 fMP4 测试夹具。
 *
 * Vimeo 的 DASH/HLS 交付是 fragmented MP4，本地测试没有真实样本，因此用 Mediabunny 自己的
 * muxer 造出可被同一条 remux 链路回读的最小 MP4：packet 数据是占位字节，但轨道结构、
 * 时间戳与关键帧标记都是真实的，足够验证裁剪窗口与单轨/双轨输出。
 */

import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output
} from 'mediabunny'

/** 占位 AVC/AAC 解码配置：Mediabunny 写入 avcC/esds 需要它们，字节内容不参与断言。 */
const VIDEO_DECODER_CONFIG = {
  codec: 'avc1.64001f',
  codedWidth: 64,
  codedHeight: 64,
  description: new Uint8Array([
    1, 100, 0, 31, 255, 225, 0, 4, 103, 100, 0, 31, 1, 0, 4, 104, 100, 0, 31
  ])
}
/** AAC-LC 48kHz 立体声 AudioSpecificConfig。 */
const AUDIO_DECODER_CONFIG = {
  codec: 'mp4a.40.2',
  sampleRate: 48000,
  numberOfChannels: 2,
  description: new Uint8Array([0x11, 0x90])
}

/**
 * AVC packet 占位数据。
 *
 * Mediabunny 的关键帧校验会真的解析 NAL 单元，所以这里给出长度前缀合法的单 NAL：
 * IDR（nal_unit_type=5）才算关键帧，非 IDR slice（type=1）会被识别为 delta。
 */
function createAvcPacketData(isKeyPacket: boolean): Uint8Array {
  return new Uint8Array([0, 0, 0, 2, isKeyPacket ? 0x65 : 0x41, 0x88])
}

/** 合成参数。 */
export interface Mp4FixtureOptions {
  /** 视频 packet 数；0 表示不写视频轨。 */
  readonly videoPackets?: number
  /** 音频 packet 数；0 表示不写音频轨。 */
  readonly audioPackets?: number
  /** 每个 packet 的时长（秒）。 */
  readonly packetDuration?: number
  /** 视频关键帧间隔（packet 数）。 */
  readonly keyFrameInterval?: number
}

/** 合成 MP4；packet 时长恒定，视频第 0 个 packet 与每隔 keyFrameInterval 个为关键帧。 */
export async function createMp4Fixture(options: Mp4FixtureOptions = {}): Promise<Blob> {
  const videoPackets = options.videoPackets ?? 8
  const audioPackets = options.audioPackets ?? 0
  const packetDuration = options.packetDuration ?? 0.5
  const keyFrameInterval = options.keyFrameInterval ?? 4

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const sources: Array<Promise<void>> = []
  const videoSource = videoPackets > 0 ? new EncodedVideoPacketSource('avc') : null
  const audioSource = audioPackets > 0 ? new EncodedAudioPacketSource('aac') : null

  if (videoSource) {
    output.addVideoTrack(videoSource)
  }
  if (audioSource) {
    output.addAudioTrack(audioSource)
  }
  await output.start()

  if (videoSource) {
    sources.push(
      (async () => {
        for (let index = 0; index < videoPackets; index += 1) {
          const isKeyPacket = index % keyFrameInterval === 0
          const packet = new EncodedPacket(
            createAvcPacketData(isKeyPacket),
            isKeyPacket ? 'key' : 'delta',
            index * packetDuration,
            packetDuration,
            index
          )
          await videoSource.add(packet, { decoderConfig: VIDEO_DECODER_CONFIG })
        }
        videoSource.close()
      })()
    )
  }

  if (audioSource) {
    sources.push(
      (async () => {
        for (let index = 0; index < audioPackets; index += 1) {
          const packet = new EncodedPacket(
            new Uint8Array(32).fill(index + 1),
            'key',
            index * packetDuration,
            packetDuration,
            index
          )
          await audioSource.add(packet, { decoderConfig: AUDIO_DECODER_CONFIG })
        }
        audioSource.close()
      })()
    )
  }

  await Promise.all(sources)
  await output.finalize()

  return new Blob([target.buffer as ArrayBuffer], { type: 'video/mp4' })
}

/** 已读出的一条轨道时间线。 */
export interface Mp4TrackTimeline {
  /** 首个 packet 的呈现时间（秒）。 */
  firstTimestamp: number
  /** 最后一个 packet 的呈现时间（秒）。 */
  lastTimestamp: number
  /** 按解码顺序排列的 packet 时间戳。 */
  timestamps: number[]
  /** 关键帧时间戳。 */
  keyTimestamps: number[]
}

/** 回读 MP4 的轨道时间线。 */
export async function readMp4TrackTimeline(
  blob: Blob,
  kind: 'video' | 'audio'
): Promise<Mp4TrackTimeline> {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  try {
    const track =
      kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack()
    if (!track) {
      throw new Error(`[Mp4Fixture] 输出缺少 ${kind} track`)
    }

    const sink = new EncodedPacketSink(track)
    const timestamps: number[] = []
    const keyTimestamps: number[] = []
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      timestamps.push(packet.timestamp)
      if (packet.type === 'key') {
        keyTimestamps.push(packet.timestamp)
      }
    }

    return {
      firstTimestamp: await track.getFirstTimestamp(),
      lastTimestamp: (await track.computeDuration()) + (await track.getFirstTimestamp()),
      timestamps,
      keyTimestamps
    }
  } finally {
    input.dispose()
  }
}
