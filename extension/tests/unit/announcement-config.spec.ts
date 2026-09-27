/**
 * 远端公告分组配置的校验规则测试。
 *
 * pickAnnouncementConfig 是 popup 跑马灯的唯一字段过滤：类型非法只丢弃该字段、保留包内默认
 * 值；url 只接受 http(s) 绝对地址，防伪协议注入跑马灯点击。
 */

import { describe, expect, it } from 'vitest'

import {
  ANNOUNCEMENT_GROUP,
  announcementConfig,
  hasAnnouncementContent,
  pickAnnouncementConfig
} from '@/core/api/remote-config/announcement'
import type { JsonObject } from '@/core/rpc/types'

/** 收窄辅助：测试输入按 JsonObject 构造。 */
function asObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject
}

describe('远端公告配置校验', () => {
  it('分组名为 announcement，包内默认无公告', () => {
    expect(ANNOUNCEMENT_GROUP).toBe('announcement')
    expect(announcementConfig).toEqual({ text: '', enabled: false })
    expect(hasAnnouncementContent(announcementConfig)).toBe(false)
  })

  it('合法覆盖逐字段生效，url 缺省时公告不可点击', () => {
    const picked = pickAnnouncementConfig(asObject({ text: '新品上线', enabled: true }))

    expect(picked).toEqual({ text: '新品上线', enabled: true })
    expect(hasAnnouncementContent(picked)).toBe(true)
  })

  it('字段类型非法时只丢弃该字段并保留默认值', () => {
    const picked = pickAnnouncementConfig(
      asObject({ text: 42, enabled: 'yes', url: 'https://example.com/a' })
    )

    // text/enabled 非字符串与布尔，落回默认；合法 url 也因开关关闭而不生效。
    expect(picked).toEqual({ text: '', enabled: false, url: 'https://example.com/a' })
    expect(hasAnnouncementContent(picked)).toBe(false)
  })

  it('url 只接受 http(s) 绝对地址，伪协议与相对路径被丢弃', () => {
    const picked = pickAnnouncementConfig(
      asObject({
        text: 'a',
        enabled: true,
        url: 'javascript:alert(1)'
      })
    )
    expect(picked.url).toBeUndefined()

    const relative = pickAnnouncementConfig(asObject({ text: 'a', enabled: true, url: '/x' }))
    expect(relative.url).toBeUndefined()

    const https = pickAnnouncementConfig(
      asObject({ text: 'a', enabled: true, url: 'https://example.com/promo' })
    )
    expect(https.url).toBe('https://example.com/promo')
  })

  it('text 空白或 enabled=false 都视为无内容', () => {
    expect(hasAnnouncementContent({ text: '   ', enabled: true })).toBe(false)
    expect(hasAnnouncementContent({ text: 'a', enabled: false })).toBe(false)
    expect(hasAnnouncementContent({ text: 'a', enabled: true })).toBe(true)
  })
})
