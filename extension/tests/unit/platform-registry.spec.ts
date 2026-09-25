/**
 * 站点注册表契约测试。
 *
 * 这里固定当前构建范围的 Manifest 静态数据，具体构建展开由 api-domain-config 与 E2E
 * Manifest 校验覆盖。
 */

import { describe, expect, it } from 'vitest'

import { SITE_REGISTRATION, type SiteContentScriptRegistration } from '@/platforms/registry'

describe('site registration', () => {
  it('只声明 Vimeo 页面与媒体 CDN', () => {
    expect(SITE_REGISTRATION.matches).toEqual([
      'https://vimeo.com/*',
      'https://www.vimeo.com/*',
      'https://player.vimeo.com/*'
    ])
    expect(SITE_REGISTRATION.hostPermissions).toEqual([
      'https://vimeo.com/*',
      'https://www.vimeo.com/*',
      'https://player.vimeo.com/*',
      'https://*.vimeocdn.com/*'
    ])
    // 真实采样的媒体主机全部落在 vimeocdn.com，akamaized.net 无证据支撑，不得重新引入。
    expect(SITE_REGISTRATION.hostPermissions).not.toContain('https://*.akamaized.net/*')
  })

  it('跳转目标本身就是站点页面，落过去不会仍是未连接态', () => {
    const homeUrl = new URL(SITE_REGISTRATION.homeUrl)

    expect(SITE_REGISTRATION.matches).toContain(`https://${homeUrl.hostname}/*`)
  })

  it('声明 MAIN 捕获、业务 content 与 player frame 三个入口', () => {
    expect(SITE_REGISTRATION.contentScripts).toEqual([
      {
        entry: 'src/sites/vimeo/injected/entry.ts',
        runAt: 'document_start',
        world: 'MAIN'
      },
      {
        entry: 'src/sites/vimeo/content/entry.ts',
        runAt: 'document_idle'
      },
      {
        entry: 'src/sites/vimeo/content/frame.ts',
        runAt: 'document_idle',
        matches: ['https://player.vimeo.com/*'],
        allFrames: true
      }
    ])
  })

  it('只保留 MAIN document_start 与业务 document_idle 入口', () => {
    const contentScripts: readonly SiteContentScriptRegistration[] = SITE_REGISTRATION.contentScripts
    const documentStartScripts = contentScripts.filter(
      contentScript => contentScript.runAt === 'document_start'
    )

    expect(documentStartScripts).toHaveLength(1)
    expect(documentStartScripts[0].world).toBe('MAIN')
    expect(
      contentScripts.some(
        contentScript => contentScript.runAt === 'document_idle' && !contentScript.world
      )
    ).toBe(true)
  })

  it('只暴露页面级按钮样式', () => {
    expect(SITE_REGISTRATION.styles).toEqual([
      {
        source: 'src/sites/vimeo/content/styles/buttons.css',
        resource: 'sites/vimeo/content/styles/buttons.css'
      }
    ])
  })
})
