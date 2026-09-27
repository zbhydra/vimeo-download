/**
 * 远端公告配置（顶层分组 `announcement`）。
 *
 * 运营通过远端稀疏覆盖下发 popup 跑马灯公告；text 为空或 enabled=false 时 popup 不展示。
 * 字段校验沿用 createRemoteConfigStore 的 pick 模式：类型非法只丢弃该字段、保留包内默认值。
 */

import type { JsonObject } from '@/core/rpc/types'

/** 公告在远端稀疏对象里的顶层分组名。 */
export const ANNOUNCEMENT_GROUP = 'announcement'

/** 公告生效配置。 */
export interface AnnouncementConfig {
  /** 公告文本；空串视为无公告。 */
  text: string
  /** 点击公告打开的页面；缺省或非法时公告不可点击。 */
  url?: string
  /** 公告开关；false 时不展示。 */
  enabled: boolean
}

/** 包内默认值：无公告，远端未配置或配置为空时保持静默。 */
export const announcementConfig: AnnouncementConfig = {
  text: '',
  enabled: false
}

/** 判断字符串是否为可跳转的 http(s) URL。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    // 仅作为 URL 合法性探测，非法即丢弃字段，不是错误路径。
    return false
  }
}

/**
 * 公告分组的字段级过滤：字段类型非法时丢弃该字段（保留默认值），合法时才允许覆盖。
 *
 * url 只接受 http(s) 绝对地址，防 javascript: 等伪协议注入跑马灯点击。
 */
export function pickAnnouncementConfig(override: JsonObject): AnnouncementConfig {
  const picked: AnnouncementConfig = { text: '', enabled: false }

  if (typeof override.text === 'string') {
    picked.text = override.text
  }
  if (typeof override.enabled === 'boolean') {
    picked.enabled = override.enabled
  }
  if (typeof override.url === 'string' && isHttpUrl(override.url)) {
    picked.url = override.url
  }

  return picked
}

/** 公告是否有可展示内容（text 非空白且开关打开）。 */
export function hasAnnouncementContent(config: AnnouncementConfig): boolean {
  return config.enabled && config.text.trim().length > 0
}
