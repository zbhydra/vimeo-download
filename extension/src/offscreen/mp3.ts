/**
 * 音频 MP3 转码（offscreen document 执行）。
 *
 * 现有 audio mux 产物（OPFS 里的 m4a File）→ Mediabunny 解码为 PCM → lame 编码为 MP3 帧流 →
 * 裸字节写入 OPFS 新产物。Chrome WebCodecs AudioEncoder 不支持 mp3 编码（143 实测
 * `isConfigSupported: false`），编码侧只能走纯 JS 的 lame（@breezystack/lamejs，无 wasm、
 * 无 CSP 变更）；解码侧复用 Mediabunny 的 AudioSampleSink（内部即 AudioDecoder AAC）。
 *
 * MP3 是无容器的帧流，lame 输出的帧序列按顺序追加即为合法 .mp3 文件，直接走裸字节
 * OPFS 写入端，不经 Mediabunny Output。
 */

import { AudioSampleSink, BlobSource, Input, MP4 } from 'mediabunny'
import { Mp3Encoder } from '@breezystack/lamejs'

import type { AudioSample } from 'mediabunny'
import {
  openMuxArtifactByteWriter,
  removeMuxArtifact,
  type MuxByteArtifactWriter,
  type MuxOutputArtifact
} from './muxArtifactStore'

/** MP3 编码码率（CBR, kbps）。源为 AAC 透传档位，192 是透明度与体积的折中。 */
const MP3_BITRATE_KBPS = 192

/** lame 单次处理块长（MPEG-1 Layer III 每帧 1152 样本），也是累积缓冲的容量。 */
const MP3_SAMPLES_PER_FRAME = 1152

/** lame 支持的采样率全集（MPEG-1/2/2.5 Layer III）。 */
const MP3_SAMPLE_RATES: ReadonlySet<number> = new Set([
  8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000
])

/** MP3 产物 MIME；OPFS File.type 恒为空，交付时须显式携带。 */
const MP3_MIME_TYPE = 'audio/mpeg'

/** MP3 转码失败。 */
export class VimeoMp3Error extends Error {
  constructor(message: string) {
    super(`[VimeoMp3] ${message}`)
    this.name = 'VimeoMp3Error'
  }
}

/**
 * 把 audio mux 产物（m4a File）转码为 MP3 产物。
 *
 * 输入产物的临时文件由本函数收尾：成功后删除、失败后也删除（任务整体失败，调用方
 * 不再消费它）。失败时同时清理未完成的 MP3 临时文件，残留兜底由 offscreen 启动清扫承担。
 *
 * @param m4aArtifact remux 产出的 M4A 产物
 * @param taskId 任务 ID，用作 OPFS 临时文件名（全局唯一）
 */
export async function transcodeMuxArtifactToMp3(
  m4aArtifact: MuxOutputArtifact,
  taskId: string
): Promise<MuxOutputArtifact> {
  try {
    const mp3Artifact = await encodeMp3(m4aArtifact.file, taskId)
    await removeMuxArtifact(m4aArtifact.tempFileName)
    return mp3Artifact
  } catch (error) {
    await removeMuxArtifact(m4aArtifact.tempFileName)
    if (error instanceof VimeoMp3Error) {
      throw error
    }
    console.error(error)
    throw new VimeoMp3Error(
      `MP3 转码失败: taskId=${taskId}, source=${m4aArtifact.tempFileName}, reason=${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/** 解码 + 编码主链；只负责 MP3 产物自身，输入产物的收尾在调用方。 */
async function encodeMp3(m4aFile: File, taskId: string): Promise<MuxOutputArtifact> {
  const input = new Input({ formats: [MP4], source: new BlobSource(m4aFile) })
  let writer: MuxByteArtifactWriter | null = null
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) {
      throw new VimeoMp3Error(`缺少 audio track: taskId=${taskId}`)
    }

    const sampleRate = track.sampleRate
    if (!MP3_SAMPLE_RATES.has(sampleRate)) {
      throw new VimeoMp3Error(`采样率不被 MP3 支持: taskId=${taskId}, sampleRate=${sampleRate}`)
    }
    // Vimeo 音频为单声道或立体声；多于两声道时取前两声道，降轨混音不在交付合同内。
    const channels = Math.min(2, Math.max(1, track.numberOfChannels))

    const encoder = new Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS)
    writer = await openMuxArtifactByteWriter(taskId, 'mp3')

    // 按声道攒满一个 1152 帧块再编码：这是 lame 的原生处理块，不依赖它对任意块长的内部缓冲。
    const frameBuffers: Int16Array[] = Array.from(
      { length: channels },
      () => new Int16Array(MP3_SAMPLES_PER_FRAME)
    )
    let filled = 0

    const sink = new AudioSampleSink(track)
    for await (const sample of sink.samples()) {
      filled = await encodeSample(encoder, writer, frameBuffers, channels, sample, filled)
    }
    if (filled > 0) {
      // 尾块零填充到整帧：补零样本编码后是静音，不影响可听内容。
      for (const buffer of frameBuffers) {
        buffer.fill(0, filled)
      }
      await encodeFrameBuffers(encoder, writer, frameBuffers, channels)
    }
    await writeEncoded(writer, encoder.flush())

    const file = await writer.finalize()
    return { file, mimeType: MP3_MIME_TYPE, tempFileName: writer.fileName }
  } catch (error) {
    await writer?.dispose()
    throw error
  } finally {
    input.dispose()
  }
}

/** 把一个解码样本按声道填入帧缓冲，攒满即编码；返回新的填充量。 */
async function encodeSample(
  encoder: Mp3Encoder,
  writer: MuxByteArtifactWriter,
  frameBuffers: Int16Array[],
  channels: number,
  sample: AudioSample,
  filled: number
): Promise<number> {
  const frames = sample.numberOfFrames
  const planes: Int16Array[] = []
  for (let plane = 0; plane < channels; plane += 1) {
    planes.push(copyPlaneToInt16(sample, plane, frames))
  }
  sample.close()

  let offset = 0
  let pending = filled
  while (offset < frames) {
    const take = Math.min(MP3_SAMPLES_PER_FRAME - pending, frames - offset)
    for (let plane = 0; plane < channels; plane += 1) {
      frameBuffers[plane].set(planes[plane].subarray(offset, offset + take), pending)
    }
    pending += take
    offset += take
    if (pending === MP3_SAMPLES_PER_FRAME) {
      await encodeFrameBuffers(encoder, writer, frameBuffers, channels)
      pending = 0
    }
  }
  return pending
}

/** 编码当前帧缓冲内容并写入产物。 */
async function encodeFrameBuffers(
  encoder: Mp3Encoder,
  writer: MuxByteArtifactWriter,
  frameBuffers: Int16Array[],
  channels: number
): Promise<void> {
  await writeEncoded(
    writer,
    channels > 1
      ? encoder.encodeBuffer(frameBuffers[0], frameBuffers[1])
      : encoder.encodeBuffer(frameBuffers[0])
  )
}

/** 复制 AudioSample 的一个声道平面为 Int16；统一按 f32-planar 读取后量化。 */
function copyPlaneToInt16(sample: AudioSample, planeIndex: number, frames: number): Int16Array {
  const source = new Float32Array(frames)
  sample.copyTo(source, { planeIndex, frameCount: frames, format: 'f32-planar' })
  const output = new Int16Array(frames)
  for (let index = 0; index < frames; index += 1) {
    output[index] = floatToInt16(source[index])
  }
  return output
}

/** f32 [-1, 1] 量化到 s16，钳制防削波溢出。 */
function floatToInt16(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const scaled = value * 0x8000
  return scaled > 0x7fff ? 0x7fff : scaled < -0x8000 ? -0x8000 : Math.round(scaled)
}

/** 写入一段编码输出；lame 可能返回空块，跳过。 */
async function writeEncoded(writer: MuxByteArtifactWriter, encoded: Uint8Array): Promise<void> {
  if (encoded.length > 0) {
    await writer.write(encoded)
  }
}
