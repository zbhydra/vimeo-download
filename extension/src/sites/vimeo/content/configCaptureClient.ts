/**
 * Content 侧 Vimeo 原生 config 快照获取。
 *
 * 主通道是 MAIN world 在 document_start 安装的原生捕获；只有主通道在 `captureTimeoutMs` 内没拿到
 * （返回 null 或 RPC 失败）时才按 videoId 触发一次 background 直连播放页兜底，不做无条件并发请求。
 * 两条通道返回同一种 `VimeoCapturedConfigSnapshot`，解析链仍然只有 `sites/vimeo/config.ts` 一个入口。
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { injectedClient } from '@/content/rpc/injectedClient'
import { logger } from '@/core/utils/logger'
import { vimeoConfig } from '@/sites/vimeo/runtimeConfig'
import { isVimeoVideoIdText } from '@/sites/vimeo/shared'
import type { VimeoCapturedConfigSnapshot } from '@/sites/vimeo/shared'

/** background 兜底通道客户端。 */
const backgroundClient = new BackgroundChannel()

/** 聚合页回退检测单页 videoId 上限；与 MAIN world 捕获上限及其等待上限（16）一致，伪造枚举最多浪费几次点查。 */
const MAX_FALLBACK_VIDEO_IDS = 16

/**
 * 以有界并发逐项执行异步任务（Promise 池）。
 *
 * 最多同时运行 `limit` 个任务，用共享索引推进，不引入队列或持久化状态。任务函数须自行
 * 兜底自身异常；池内若仍有任务抛错，等全部在途任务结束后再抛出第一个错误，保证不产生
 * 未处理的 rejection。
 */
export async function runWithBoundedConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0

  const runNext = async (): Promise<void> => {
    while (true) {
      const item = items[nextIndex]
      nextIndex += 1
      if (item === undefined) {
        return
      }
      await task(item)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext)
  const settled = await Promise.allSettled(workers)
  const firstRejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (firstRejected) {
    throw firstRejected.reason
  }
}

/** 已经触发过兜底的 videoId；同一页面内不为同一视频重复请求 Vimeo。 */
const fallbackVideoIds = new Set<string>()

/** 页面切换时清空兜底记录，让新页面上的同一 videoId 重新走一次兜底。 */
export function resetVimeoConfigFallback(): void {
  fallbackVideoIds.clear()
}

/** 获取指定 videoId 的原生 config 快照；主通道没拿到时走 background 直连兜底。 */
export async function requestCapturedVimeoConfig(
  videoId: string
): Promise<VimeoCapturedConfigSnapshot | null> {
  const captured = await requestMainWorldCapturedConfig(videoId)
  if (captured) {
    return captured
  }

  return requestBackgroundCapturedConfig(videoId)
}

/**
 * 枚举 MAIN world 当前已捕获视频的 videoId。
 *
 * EventRpc 是宿主页面可伪造通道，枚举结果只当待查询提示：这里只保留数字形态的 videoId 并
 * 截断到单页上限，概要里的标题/封面等业务数据不采信，一律由调用方按 videoId 走既有校验
 * 链路重新获取。
 */
export async function listCapturedVimeoVideoIds(): Promise<string[]> {
  try {
    const response = await injectedClient.listCapturedVimeoConfigs({
      timeout: vimeoConfig.captureTimeoutMs
    })

    const videoIds: string[] = []
    for (const summary of Array.isArray(response.videos) ? response.videos : []) {
      if (videoIds.length >= MAX_FALLBACK_VIDEO_IDS) {
        break
      }

      const videoId = typeof summary?.videoId === 'string' ? summary.videoId : ''
      if (isVimeoVideoIdText(videoId)) {
        videoIds.push(videoId)
      }
    }
    return videoIds
  } catch (error) {
    logger.error('[VimeoConfigClient] 枚举 MAIN world 已捕获视频失败:', error)
    return []
  }
}

/** 主通道：读取 MAIN world 原生捕获，等待上限与 content 侧 RPC 一致。 */
async function requestMainWorldCapturedConfig(
  videoId: string
): Promise<VimeoCapturedConfigSnapshot | null> {
  try {
    const response = await injectedClient.getCapturedVimeoConfig(
      { videoId },
      { timeout: vimeoConfig.captureTimeoutMs }
    )
    if (!response.snapshot) {
      logger.warn(
        `[VimeoConfigClient] MAIN world 原生 config 捕获超时: videoId=${videoId}, timeout=${vimeoConfig.captureTimeoutMs}ms, stage=capture`
      )
      return null
    }
    if (response.snapshot.videoId !== videoId) {
      logger.error(
        `[VimeoConfigClient] config 捕获响应 videoId 不匹配: expected=${videoId}, actual=${response.snapshot.videoId}, stage=capture-validate`
      )
      return null
    }

    return response.snapshot
  } catch (error) {
    logger.error('[VimeoConfigClient] MAIN world 原生 config 捕获失败:', error)
    return null
  }
}

/** 兜底通道：由 background 直连播放页取回内嵌 config；同一 videoId 只触发一次。 */
async function requestBackgroundCapturedConfig(
  videoId: string
): Promise<VimeoCapturedConfigSnapshot | null> {
  if (fallbackVideoIds.has(videoId)) {
    return null
  }

  fallbackVideoIds.add(videoId)

  try {
    const response = await backgroundClient.getVimeoPlayerConfig({ videoId })
    if (!response.snapshot) {
      logger.warn(
        `[VimeoConfigClient] background 兜底未取到原生 config: videoId=${videoId}, stage=fallback`
      )
      return null
    }
    if (response.snapshot.videoId !== videoId) {
      logger.error(
        `[VimeoConfigClient] background 兜底 config videoId 不匹配: expected=${videoId}, actual=${response.snapshot.videoId}, stage=fallback-validate`
      )
      return null
    }

    logger.info(
      `[VimeoConfigClient] background 兜底取到原生 config: videoId=${videoId}, stage=fallback`
    )
    return response.snapshot
  } catch (error) {
    logger.error('[VimeoConfigClient] background 兜底请求失败:', error)
    return null
  }
}
