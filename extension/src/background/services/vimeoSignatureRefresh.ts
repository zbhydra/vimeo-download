/**
 * Vimeo 签名 URL 重签与 track 一致性守卫。
 *
 * offscreen 分片拉取遇到 403/404/410 时，由 background 直连播放页取回内嵌原生 config
 * （不依赖页面注入），解析出最新资源快照，再按守卫决定：
 * - 新快照的 videoTrackId/audioTrackId 与原任务一致 → `continue`：回传新签名资源，
 *   offscreen 按分片游标续跑；
 * - 不一致（best 回落换 track）→ `restart`：整任务以新快照重跑，等同旧「刷新后沿用同
 *   delivery 最新最高选项」的行为；
 * - 找不到同 delivery 候选或播放页给不出 config → 抛错，任务失败。
 */

import {
  loadVimeoCapturedConfigFromPlayerPage,
  loadVimeoResourcesFromCapturedConfig
} from '@/sites/vimeo/config'
import { RESOURCE_SOURCE_KINDS, type ResourceSourceKind } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  parseVimeoTimeRange,
  stripVimeoClipSuffix,
  type VimeoSourceDescriptor
} from '@/sites/vimeo/shared'

/** 重签结果。 */
export interface SignatureRefreshOutcome {
  /** 续跑或整任务重跑。 */
  mode: 'continue' | 'restart'
  /** 刷新后的完整资源；id/descriptor 已按原任务身份回填。 */
  resource: MediaResource
}

/** 按下载描述符刷新任务资源，并执行 track 一致性守卫。 */
export async function refreshVimeoTaskResource(
  descriptor: VimeoSourceDescriptor
): Promise<SignatureRefreshOutcome> {
  const snapshot = await loadVimeoCapturedConfigFromPlayerPage(descriptor.videoId)
  if (!snapshot) {
    throw new Error(
      `[VimeoSignatureRefresh] 播放页给不出可用 config: videoId=${descriptor.videoId}, stage=config-refresh`
    )
  }

  const parsed = await loadVimeoResourcesFromCapturedConfig(snapshot)
  const chosen = findFreshAdaptiveResource(parsed.resources, descriptor)
  if (!chosen) {
    throw new Error(
      `[VimeoSignatureRefresh] 刷新 config 后找不到同 delivery 资源: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, delivery=${descriptor.delivery}, kind=${descriptor.kind}, stage=config-refresh`
    )
  }

  const freshDescriptor = decodeVimeoSourceDescriptor(chosen.documentId)
  if (!freshDescriptor) {
    throw new Error(
      `[VimeoSignatureRefresh] 刷新后资源缺少 descriptor: videoId=${descriptor.videoId}, resourceId=${chosen.id}, stage=config-refresh`
    )
  }

  return {
    mode: isTrackConsistent(descriptor, freshDescriptor) ? 'continue' : 'restart',
    resource: rebuildTaskResource(descriptor, chosen, freshDescriptor)
  }
}

/**
 * 刷新后恢复与原任务对应的 adaptive 资源。
 *
 * `Best` 的稳定资源 ID 可能因最新 config 的画质排序从 DASH/HLS 变化，因此优先按去掉片段
 * 后缀的同一画质定位；仅 best/best-audio 允许回退到同 delivery 的最新最高选项，指定档位
 * 找不到同 track 候选时直接失败（用户明确选择的东西不能悄悄换档）。
 */
function findFreshAdaptiveResource(
  resources: readonly MediaResource[],
  descriptor: VimeoSourceDescriptor
): MediaResource | null {
  const sourceKind = sourceKindForDescriptor(descriptor)
  const candidates = resources.filter(resource => {
    const freshDescriptor = decodeVimeoSourceDescriptor(resource.documentId)
    return (
      resource.sourceKind === sourceKind &&
      freshDescriptor?.delivery === descriptor.delivery &&
      freshDescriptor.kind === descriptor.kind
    )
  })

  // 片段 ID 带区间后缀，而新快照永远只有全片选项，因此按去掉后缀的同一个画质定位。
  const baseSourceId = stripVimeoClipSuffix(descriptor.sourceId)
  const exact = candidates.find(resource => resource.id === baseSourceId)
  if (exact) {
    return exact
  }

  if (descriptor.optionId !== 'best' && descriptor.optionId !== 'best-audio') {
    return null
  }

  const sameTracks = candidates.find(resource => {
    const freshDescriptor = decodeVimeoSourceDescriptor(resource.documentId)
    return freshDescriptor !== null && isTrackConsistent(descriptor, freshDescriptor)
  })
  return sameTracks ?? candidates[0] ?? null
}

/** 守卫：新快照与原任务的 video/audio track 完全一致才允许按游标续跑。 */
function isTrackConsistent(original: VimeoSourceDescriptor, fresh: VimeoSourceDescriptor): boolean {
  return (
    (original.videoTrackId ?? undefined) === (fresh.videoTrackId ?? undefined) &&
    (original.audioTrackId ?? undefined) === (fresh.audioTrackId ?? undefined)
  )
}

/**
 * 把刷新出的资源回填成任务身份。
 *
 * 展示词条跟用户选中档位走、片段区间是用户选择、纯音频交付是用户选择——这三者刷新不能改；
 * 资源 id 沿用原任务（进度回传与编排投影按它对账），documentId 写入合并后的新描述符。
 */
function rebuildTaskResource(
  original: VimeoSourceDescriptor,
  chosen: MediaResource,
  freshDescriptor: VimeoSourceDescriptor
): MediaResource {
  const merged: VimeoSourceDescriptor = {
    ...freshDescriptor,
    sourceId: original.sourceId,
    optionId: original.optionId,
    label: original.label,
    ...(original.labelKey ? { labelKey: original.labelKey } : {}),
    ...(original.labelParams ? { labelParams: original.labelParams } : {}),
    // 刷新只换 signed URL：片段区间是用户选择，必须原样带过去。
    ...(parseVimeoTimeRange(original) ?? {})
  }
  // 无音轨交付是用户选择，而新快照只描述全片选项；刷新不能让选中的纯视频重新带上音频。
  if (!original.audioTrackId) {
    delete merged.audioTrackId
  }

  return {
    ...chosen,
    id: original.sourceId,
    documentId: encodeVimeoSourceDescriptor(merged)
  }
}

/** 描述符对应的 MediaResource.sourceKind。 */
function sourceKindForDescriptor(descriptor: VimeoSourceDescriptor): ResourceSourceKind {
  if (descriptor.delivery === 'dash' && descriptor.kind === 'audio') {
    return RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO
  }
  if (descriptor.delivery === 'hls') {
    return RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO
  }
  return RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO
}
