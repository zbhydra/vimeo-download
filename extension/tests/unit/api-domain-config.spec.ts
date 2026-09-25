import { afterEach, describe, expect, it, vi } from 'vitest'

const BUILD_CONFIG_TIMEOUT_MS = 30_000

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('API domain configuration', () => {
  it('uses the production API and website hosts in extension runtime config', async () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
    vi.stubGlobal('__ALI_SLS_MARK_CONFIG__', {
      enabled: true,
      endpoint: 'https://vimeo-download.ap-southeast-1.log.aliyuncs.com',
      logstore: 'vimeo-download-mark-log',
      topic: 'mark-log',
      source: 'extension'
    })

    const configModule = await import('../../src/core/api/config')
    const { API, WEBSITE, ALI_SLS_MARK } = configModule

    expect(API.BASE_URL).toBe('https://api.vimeo-video-downloader.example')
    expect(API.ENDPOINTS.REMOTE_CONFIG).toBe('/api/client/remote-config/config')
    expect(API.ENDPOINTS.AUTH_EMAIL_VERIFY_LOGIN).toBe('/api/client/auth/email-verify-login')
    expect(API.ENDPOINTS.AUTH_GOOGLE_OAUTH_AUTHORIZE).toBe(
      '/api/client/auth/google/oauth/authorize'
    )
    expect(API.ENDPOINTS.AUTH_GOOGLE_EXCHANGE).toBe('/api/client/auth/google/exchange')
    expect(WEBSITE.BASE_URL).toBe('https://vimeo-video-downloader.example')
    // 插件不再跳官网登录，只保留条款、隐私与订阅页三个外链路径。
    expect('EXTENSION_LOGIN_PATH' in WEBSITE).toBe(false)
    expect(WEBSITE.PRICING_PATH).toBe('/ext-pricing/')
    // Google 不再走 GIS：插件侧不持有 client_id，也不加载远程脚本。
    expect('GOOGLE_AUTH' in configModule).toBe(false)
    expect(ALI_SLS_MARK).toEqual({
      enabled: true,
      endpoint: 'https://vimeo-download.ap-southeast-1.log.aliyuncs.com',
      logstore: 'vimeo-download-mark-log',
      topic: 'mark-log',
      source: 'extension'
    })
  })

  it('uses local website host in development runtime config', async () => {
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://localhost:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')

    const { API, WEBSITE } = await import('../../src/core/api/config')

    expect(API.BASE_URL).toBe('http://localhost:7900')
    expect(WEBSITE.BASE_URL).toBe('http://localhost:7910')
    expect(API.ENDPOINTS.REMOTE_CONFIG).toBe('/api/client/remote-config/config')
  })

  it(
    'builds production permissions without localhost hosts',
    async () => {
      const { createExtensionBuildEnv } = await import('../../vite.config')
      const config = createExtensionBuildEnv({ NODE_ENV: 'production' })

      expect(config.apiBaseUrl).toBe('https://api.vimeo-video-downloader.example')
      expect(config.websiteBaseUrl).toBe('https://vimeo-video-downloader.example')
      expect(config.hostPermissions).toEqual([
        'https://vimeo.com/*',
        'https://www.vimeo.com/*',
        'https://player.vimeo.com/*',
        'https://*.vimeocdn.com/*'
      ])
      // 真实采样的媒体主机全部落在 vimeocdn.com，akamaized.net 无证据支撑，不得重新引入。
      expect(config.hostPermissions).not.toContain('https://*.akamaized.net/*')
      expect(config.contentScriptMatches).toContain('https://vimeo.com/*')
      expect(config.contentScriptMatches).toContain('https://player.vimeo.com/*')
      expect(config.webAccessibleResources).toEqual([
        'sites/vimeo/content/styles/buttons.css'
      ])
      expect(config.contentScriptMatches).not.toContain('https://vimeo-video-downloader.example/*')
      expect(config.contentScriptMatches).not.toContain('https://www.vimeo-video-downloader.example/*')
      expect(config.hostPermissions).not.toContain('http://localhost:7900/*')
      expect(config.hostPermissions).not.toContain('http://localhost:7910/*')
      expect(config.hostPermissions).not.toContain(
        'https://vimeo-download.ap-southeast-1.log.aliyuncs.com/*'
      )
      // API 域依赖后端通配 CORS，不申请 host_permissions 豁免
      expect(config.hostPermissions).not.toContain(
        'https://api.vimeo-video-downloader.example/*'
      )
      expect(config.hostPermissions).not.toContain('https://vimeo-video-downloader.example/*')
      expect(config.hostPermissions).not.toContain('https://www.vimeo-video-downloader.example/*')
    },
    BUILD_CONFIG_TIMEOUT_MS
  )

  it('builds development permissions with localhost hosts', async () => {
    const { createExtensionBuildEnv } = await import('../../vite.config')
    const config = createExtensionBuildEnv({ NODE_ENV: 'development' })

    expect(config.apiBaseUrl).toBe('http://localhost:7900')
    expect(config.websiteBaseUrl).toBe('http://localhost:7910')
    // 本地后端同样返回通配 CORS，dev 构建的 API 域也不申请 host_permissions
    expect(config.hostPermissions).not.toContain('http://localhost:7900/*')
    // 官网域只在 popup 里以新标签打开，不需要 host_permissions
    expect(config.hostPermissions).not.toContain('http://localhost:7910/*')
    expect(config.hostPermissions).not.toContain(
      'https://vimeo-download.ap-southeast-1.log.aliyuncs.com/*'
    )
    expect(config.hostPermissions).not.toContain('https://api.vimeo-video-downloader.example/*')
    expect(config.hostPermissions).not.toContain('https://vimeo-video-downloader.example/*')
    expect(config.hostPermissions).not.toContain('https://www.vimeo-video-downloader.example/*')
    expect(config.contentScriptMatches).not.toContain('http://localhost:7910/*')
  })

  it('removes every non-site platform from generated Manifest profiles', async () => {
    const { createExtensionBuildEnv } = await import('../../vite.config')
    const config = createExtensionBuildEnv({ NODE_ENV: 'production' })

    expect(config.contentScriptMatches).not.toContain('https://web.telegram.org/*')
    expect(config.contentScriptMatches).not.toContain('https://x.com/*')
    expect(config.contentScriptMatches).not.toContain('https://threads.com/*')
    expect(config.contentScriptMatches).not.toContain('https://www.instagram.com/*')
    expect(config.webAccessibleResources).not.toContain(
      'sites/telegram/content/styles/buttons.css'
    )
    expect(config.webAccessibleResources).not.toContain('sites/x/content/styles/buttons.css')
    expect(config.hostPermissions).not.toContain('https://web.telegram.org/*')
    expect(config.hostPermissions).not.toContain('https://x.com/*')
    expect(config.hostPermissions).not.toContain('https://www.instagram.com/*')
  })
})
