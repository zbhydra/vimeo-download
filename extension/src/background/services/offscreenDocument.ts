/**
 * offscreen document 惰性生命周期管理。
 *
 * 官方模式（Chrome 116+）：创建前用 runtime.getContexts 预检，模块级 creating promise
 * 串行化并发创建；不做 matchAll 回退。文档创建后常驻、不自动关闭——交付中的 blob URL
 * 依赖文档存活，重复冷启动也有可观成本；无任务时的内存占用是已知限制。
 */

import { logger } from '@/core/utils/logger'

let creatingPromise: Promise<void> | null = null

/** 确保 offscreen document 存在；并发调用共享同一次创建。 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return
  }

  if (creatingPromise) {
    return creatingPromise
  }

  creatingPromise = createOffscreenDocument().finally(() => {
    creatingPromise = null
  })
  return creatingPromise
}

/** 判断 offscreen document 是否已存在；不触发创建。 */
export async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  return contexts.length > 0
}

/** 创建 offscreen document。 */
async function createOffscreenDocument(): Promise<void> {
  try {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen.html',
      reasons: ['BLOBS'],
      justification: '执行 Vimeo DASH/HLS 分片下载与 remux，使下载脱离 Vimeo 页面生命周期'
    })
    logger.info('[OffscreenDocument] offscreen document 已创建')
  } catch (error) {
    // 预检与创建之间的竞态（多上下文同时触发）会以「已存在」失败；文档已在即视为成功。
    if (await hasOffscreenDocument()) {
      logger.info('[OffscreenDocument] offscreen document 已由并发调用创建')
      return
    }
    logger.error('[OffscreenDocument] offscreen document 创建失败', error)
    throw error
  }
}
