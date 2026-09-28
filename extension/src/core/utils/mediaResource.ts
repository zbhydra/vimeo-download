/**
 * MediaResource 的 JSON 边界解析。
 *
 * background downloadBatch 与 offscreen startTask 都从 Chrome message 里接收完整资源，
 * 这里统一做严格形状校验：必填字段缺失或类型不符直接抛错，可选字段按类型回退。
 */

import {
  AUDIO_TARGET_FORMATS,
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type AudioTargetFormat,
  type ResourceSourceKind,
  type ResourceType
} from '@/core/constants/resource'
import type { JsonObject, JsonValue } from '@/core/rpc/types'
import type { DownloadMetadata, MediaResource, VideoGroupMetadata } from '@/core/types'

const RESOURCE_TYPE_VALUES: readonly string[] = Object.values(RESOURCE_TYPES)
const RESOURCE_SOURCE_KIND_VALUES: readonly string[] = Object.values(RESOURCE_SOURCE_KINDS)

/** 从 JSON 值解析完整媒体资源；结构不合法时抛可定位错误。 */
export function parseMediaResource(value: JsonValue | undefined, label: string): MediaResource {
  if (!isJsonObject(value)) {
    throw new Error(`[MediaResource] ${label} 必须是对象`)
  }

  const metadata = parseMetadata(value.metadata, label)
  const type = parseEnum(value.type, RESOURCE_TYPE_VALUES, `${label}.type`) as ResourceType
  const sourceKind = parseEnum(
    value.sourceKind,
    RESOURCE_SOURCE_KIND_VALUES,
    `${label}.sourceKind`
  ) as ResourceSourceKind

  const resource: MediaResource = {
    id: requireString(value.id, `${label}.id`),
    messageId: requireString(value.messageId, `${label}.messageId`),
    index: requireIndex(value.index, label),
    url: requireString(value.url, `${label}.url`),
    type,
    sourceKind,
    metadata
  }

  const filename = optionalString(value.filename)
  if (filename !== undefined) {
    resource.filename = filename
  }
  const title = optionalString(value.title)
  if (title !== undefined) {
    resource.title = title
  }
  const author = optionalString(value.author)
  if (author !== undefined) {
    resource.author = author
  }
  const size = optionalNumber(value.size)
  if (size !== undefined) {
    resource.size = size
  }
  const thumbnail = optionalString(value.thumbnail)
  if (thumbnail !== undefined) {
    resource.thumbnail = thumbnail
  }
  const mimeType = optionalString(value.mimeType)
  if (mimeType !== undefined) {
    resource.mimeType = mimeType
  }
  const documentId = optionalString(value.documentId)
  if (documentId !== undefined) {
    resource.documentId = documentId
  }
  // 音频导出目标格式：只认 mp3（m4a 是缺省语义，不落字段）；非法值按可选字段口径丢弃。
  const targetFormat = parseAudioTargetFormat(value.targetFormat)
  if (targetFormat !== undefined) {
    resource.targetFormat = targetFormat
  }
  const codec = optionalString(value.codec)
  if (codec !== undefined) {
    resource.codec = codec
  }
  const width = optionalNumber(value.width)
  if (width !== undefined) {
    resource.width = width
  }
  const height = optionalNumber(value.height)
  if (height !== undefined) {
    resource.height = height
  }
  const duration = optionalNumber(value.duration)
  if (duration !== undefined) {
    resource.duration = duration
  }
  const chatId = optionalString(value.chatId)
  if (chatId !== undefined) {
    resource.chatId = chatId
  }
  const groupMetadata = parseGroupMetadata(value.groupMetadata, label)
  if (groupMetadata !== undefined) {
    resource.groupMetadata = groupMetadata
  }

  return resource
}

/** 解析下载元数据。 */
function parseMetadata(value: JsonValue | undefined, label: string): DownloadMetadata {
  if (!isJsonObject(value) || typeof value.messageId !== 'string' || value.messageId.length === 0) {
    throw new Error(`[MediaResource] ${label}.metadata.messageId 必须是非空字符串`)
  }

  return { messageId: value.messageId }
}

/** 解析视频组展示元数据；整体不合法时丢弃该字段。 */
function parseGroupMetadata(
  value: JsonValue | undefined,
  label: string
): VideoGroupMetadata | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isJsonObject(value) || typeof value.title !== 'string') {
    throw new Error(`[MediaResource] ${label}.groupMetadata.title 必须是字符串`)
  }

  const metadata: VideoGroupMetadata = { title: value.title }
  const author = optionalString(value.author)
  if (author !== undefined) {
    metadata.author = author
  }
  const durationSeconds = optionalNumber(value.durationSeconds)
  if (durationSeconds !== undefined) {
    metadata.durationSeconds = durationSeconds
  }
  const thumbnailUrl = optionalString(value.thumbnailUrl)
  if (thumbnailUrl !== undefined) {
    metadata.thumbnailUrl = thumbnailUrl
  }
  return metadata
}

/** 解析资源在消息中的 0-based 索引。 */
function requireIndex(value: JsonValue | undefined, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  throw new Error(`[MediaResource] ${label}.index 必须是非负整数`)
}

/** 要求非空字符串字段。 */
function requireString(value: JsonValue | undefined, label: string): string {
  const parsed = optionalString(value)
  if (parsed === undefined) {
    throw new Error(`[MediaResource] ${label} 必须是非空字符串`)
  }
  return parsed
}

/** 可选字符串字段。 */
function optionalString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** 可选有限数字字段。 */
function optionalNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 解析受限枚举字符串。 */
function parseEnum(
  value: JsonValue | undefined,
  allowed: readonly string[],
  label: string
): string {
  if (typeof value === 'string' && allowed.includes(value)) {
    return value
  }

  throw new Error(`[MediaResource] ${label} 不在允许取值内: ${String(value)}`)
}

/** 解析音频导出目标格式；目前只接受 mp3 非缺省值，其余丢弃。 */
function parseAudioTargetFormat(value: JsonValue | undefined): AudioTargetFormat | undefined {
  return value === AUDIO_TARGET_FORMATS.MP3 ? AUDIO_TARGET_FORMATS.MP3 : undefined
}

/** 判断值是否为 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
