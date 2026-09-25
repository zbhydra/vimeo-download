/**
 * Vimeo player frame helper。
 *
 * 只在 player.vimeo.com frame 内发布 videoId 给顶层 Vimeo content 作为身份兜底。
 * 不启动 ResourceBuffer、MessageHandler 或下载入口，避免把所有站点入口改成 all_frames。
 */

import {
  createVimeoFrameIdentityMessage,
  extractVimeoIdentityFromDocument,
  isVimeoPlayerHostname
} from '@/sites/vimeo/shared'

const FRAME_SCAN_RETRY_MS = 500
const FRAME_SCAN_MAX_ATTEMPTS = 20

let lastVideoId: string | null = null
let attempts = 0

/** 发布当前 frame identity。 */
function postFrameIdentity(): void {
  if (!isVimeoPlayerHostname(window.location.hostname) || window.parent === window) {
    return
  }

  const identity = extractVimeoIdentityFromDocument(document, window.location.href)
  if (!identity || identity.videoId === lastVideoId) {
    return
  }

  lastVideoId = identity.videoId
  window.parent.postMessage(createVimeoFrameIdentityMessage(identity, window.location.href), '*')
}

/** Vimeo player DOM/meta 可能晚于 document_idle，短重试即可。 */
function scanWithRetry(): void {
  attempts += 1
  postFrameIdentity()

  if (lastVideoId || attempts >= FRAME_SCAN_MAX_ATTEMPTS) {
    return
  }

  window.setTimeout(scanWithRetry, FRAME_SCAN_RETRY_MS)
}

scanWithRetry()

const observer = new MutationObserver(() => {
  postFrameIdentity()
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
})
