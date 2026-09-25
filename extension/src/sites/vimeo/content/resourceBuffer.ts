/**
 * Vimeo 资源缓存。
 *
 * 复用 core 通用缓存，站点层提供 pageKey、sourceRank 与片段 ID 的还原规则。
 */

import { ResourceBuffer } from '@/core/content/services/ResourceBuffer'
import type { MediaResource } from '@/core/types'
import { applyVimeoTimeRange, getVimeoSourceRank } from '@/sites/vimeo/media'
import { getVimeoPageKey, parseVimeoClipIdRange, stripVimeoClipSuffix } from '@/sites/vimeo/shared'

/** Vimeo 资源缓存。 */
class VimeoResourceBuffer extends ResourceBuffer {
  /** 站点日志名。 */
  protected readonly siteName = 'vimeo'

  /** 当前 Vimeo 页面键。 */
  protected getPageKey(): string {
    return getVimeoPageKey(window.location)
  }

  /** Vimeo 来源排序。 */
  protected getSourceRank(resource: MediaResource): number {
    return getVimeoSourceRank(resource)
  }

  /**
   * 按 ID 取资源；片段 ID 由全片档位按区间派生。
   *
   * 片段只在用户点下载的那一刻存在，不预先写进缓存——每个区间都会生成一份新资源，缓存下来
   * 只会堆积用户试过的所有区间。`:clip:{start}-{end}` 是资源身份的一部分（见
   * `docs/feat/002.下载功能/tech-扩展端Vimeo本地下载.md` §11），因此这里去掉后缀找回全片
   * 档位，再用同一份 `applyVimeoTimeRange` 还原区间：Popup 选中的片段与下载队列拿到的资源
   * 是同一个身份。裁剪不被交付方式支持时该函数抛错，由下载请求整体失败。
   */
  getResource(resourceId: string): MediaResource | undefined {
    const cached = super.getResource(resourceId)
    if (cached) {
      return cached
    }

    const range = parseVimeoClipIdRange(resourceId)
    const base = range ? super.getResource(stripVimeoClipSuffix(resourceId)) : undefined
    return base && range ? applyVimeoTimeRange(base, range) : undefined
  }
}

/** Vimeo 资源缓存单例。 */
export const vimeoResourceBuffer = new VimeoResourceBuffer()
