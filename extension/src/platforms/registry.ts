/**
 * 插件唯一站点（Vimeo）的静态数据源（Manifest 声明 + 站点入口 URL）。
 *
 * 构建配置、Popup 站点识别与跳转、E2E 校验都只消费这里的静态数据。该模块不读取 DOM、
 * Chrome API 或环境变量，因而可以同时安全地运行在 Vite 配置、扩展页面和单元测试中。
 */

/** content script 的注入时机。 */
export type SiteContentScriptRunAt = 'document_start' | 'document_idle'

/** content script 的执行世界；未填写时使用扩展隔离世界。 */
export type SiteContentScriptWorld = 'MAIN'

/** 单个入口的静态 Manifest 配置。 */
export interface SiteContentScriptRegistration {
  /** 相对 extension 根目录的入口文件。 */
  entry: string
  /** 入口注入时机。 */
  runAt: SiteContentScriptRunAt
  /** MAIN world 入口显式声明；普通 content 入口不填写。 */
  world?: SiteContentScriptWorld
  /** 覆盖站点页面匹配；仅 iframe 等额外入口需要填写。 */
  matches?: readonly string[]
  /** 是否注入所有 frame；仅 iframe 入口需要填写。 */
  allFrames?: boolean
}

/** content CSS 的源文件和 Manifest 暴露路径。 */
export interface SiteStyleRegistration {
  /** 相对 extension 根目录的 CSS 源文件。 */
  source: string
  /** 相对 dist 根目录的 CSS 资源路径。 */
  resource: string
}

/** 唯一站点进入构建所需的全部静态数据。 */
export interface SiteRegistration {
  /** 引导跳转目标；Popup 在非站点页面上用它把用户带到站点。 */
  homeUrl: string
  /** 站点页面的 Manifest match patterns。 */
  matches: readonly string[]
  /** 站点 content/injected 入口。 */
  contentScripts: readonly SiteContentScriptRegistration[]
  /** 页面访问和媒体下载所需的 host_permissions。 */
  hostPermissions: readonly string[]
  /** 需要复制并通过 web_accessible_resources 暴露的样式。 */
  styles: readonly SiteStyleRegistration[]
}

/** Vimeo 站点的静态注册记录。 */
export const SITE_REGISTRATION = {
  // 引导跳转落在主站的 /watch 入口而不是 player.vimeo.com：后者必须带 videoId 才有意义。
  // /watch 对未登录访客直接返回 200 且不重定向，点按钮的未登录用户不会被甩到登录页。
  homeUrl: 'https://vimeo.com/watch',
  matches: ['https://vimeo.com/*', 'https://www.vimeo.com/*', 'https://player.vimeo.com/*'],
  contentScripts: [
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
  ],
  hostPermissions: [
    'https://vimeo.com/*',
    'https://www.vimeo.com/*',
    'https://player.vimeo.com/*',
    'https://*.vimeocdn.com/*'
  ],
  styles: [
    {
      source: 'src/sites/vimeo/content/styles/buttons.css',
      resource: 'sites/vimeo/content/styles/buttons.css'
    }
  ]
} as const satisfies SiteRegistration
