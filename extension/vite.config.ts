import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import webExtension, { type PluginOptions } from 'vite-plugin-web-extension'
import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { SITE_REGISTRATION, type SiteRegistration } from './src/platforms/registry'
import { PROD_HOST } from './src/core/constants/deployment'

type ExtensionDevWebExtensionConfig = Partial<Pick<PluginOptions, 'disableAutoLaunch'>>

/** `scripts/dev-edge-current.mjs` 注入的开发浏览器模式标识。 */
const EDGE_CURRENT_DEV_BROWSER = 'edge-current'

const DEFAULT_DEV_API_BASE_URL = 'http://localhost:7900'
const DEFAULT_DEV_WEBSITE_BASE_URL = 'http://localhost:7910'
// 生产 API / 官网 origin 从 src/core/constants/deployment.ts 的生产域名派生。
const DEFAULT_PROD_API_BASE_URL = `https://api.${PROD_HOST}`
const DEFAULT_PROD_WEBSITE_BASE_URL = `https://${PROD_HOST}`
// 生产打点的 SLS project / logstore 与阿里云侧资源同名；上报失败不阻塞下载主链路。
const DEFAULT_PROD_ALI_SLS_PROJECT = 'vimeo-download-logs'
const DEFAULT_PROD_ALI_SLS_HOST = 'ap-northeast-1.log.aliyuncs.com'
const DEFAULT_PROD_ALI_SLS_LOGSTORE = 'vimeo-download-mark-logs'
const DEFAULT_ALI_SLS_TOPIC = 'mark-log'
const DEFAULT_ALI_SLS_SOURCE = 'extension'

interface ExtensionBuildProcessEnv {
  NODE_ENV?: string
  EXTENSION_API_BASE_URL?: string
  EXTENSION_WEBSITE_BASE_URL?: string
  EXTENSION_ALI_SLS_PROJECT?: string
  EXTENSION_ALI_SLS_HOST?: string
  EXTENSION_ALI_SLS_ENDPOINT?: string
  EXTENSION_ALI_SLS_LOGSTORE?: string
  EXTENSION_ALI_SLS_TOPIC?: string
  EXTENSION_ALI_SLS_SOURCE?: string
  EXTENSION_ALI_SLS_ENABLED?: string
  PUBLIC_ALI_SLS_PROJECT?: string
  PUBLIC_ALI_SLS_HOST?: string
  PUBLIC_ALI_SLS_ENDPOINT?: string
  PUBLIC_ALI_SLS_LOGSTORE?: string
  PUBLIC_ALI_SLS_TOPIC?: string
  PUBLIC_ALI_SLS_SOURCE?: string
  PUBLIC_ALI_SLS_ENABLED?: string
}

export interface ExtensionBuildEnvConfig {
  /** 当前构建是否使用生产环境默认域名和压缩策略。 */
  isProductionBuild: boolean
  /** 插件运行时请求的后端 API base URL。 */
  apiBaseUrl: string
  /** 插件统一登录桥接使用的官网 base URL。 */
  websiteBaseUrl: string
  /** 插件 SLS WebTracking 配置。 */
  aliSlsMark: ExtensionAliSlsMarkConfig
  /** 站点业务 content / injected 统一入口的 matches。 */
  contentScriptMatches: readonly string[]
  /** Manifest host_permissions 白名单。 */
  hostPermissions: readonly string[]
  /** Manifest web_accessible_resources 中站点样式资源。 */
  webAccessibleResources: readonly string[]
}

export interface ExtensionAliSlsMarkConfig {
  /** 是否启用插件端 SLS mark-log 上报。 */
  enabled: boolean
  /** SLS WebTracking endpoint，不含末尾斜杠。 */
  endpoint: string
  /** SLS Logstore 名称。 */
  logstore: string
  /** SLS topic。 */
  topic: string
  /** SLS source。 */
  source: string
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveBaseUrl(value: string | undefined, fallback: string): string {
  const trimmedValue = value?.trim()
  return normalizeBaseUrl(trimmedValue && trimmedValue.length > 0 ? trimmedValue : fallback)
}

function readEnvValue(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmedValue = value?.trim()
    if (trimmedValue) {
      return trimmedValue
    }
  }

  return ''
}

function normalizeSlsHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function normalizeSlsEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '')
}

function isExplicitlyDisabled(value: string): boolean {
  return value.toLowerCase() === 'false'
}

function resolveAliSlsMarkConfig(
  env: ExtensionBuildProcessEnv,
  isProductionBuild: boolean
): ExtensionAliSlsMarkConfig {
  const endpointFromEnv = normalizeSlsEndpoint(
    readEnvValue(env.EXTENSION_ALI_SLS_ENDPOINT, env.PUBLIC_ALI_SLS_ENDPOINT)
  )
  const project =
    readEnvValue(env.EXTENSION_ALI_SLS_PROJECT, env.PUBLIC_ALI_SLS_PROJECT) ||
    (isProductionBuild ? DEFAULT_PROD_ALI_SLS_PROJECT : '')
  const host =
    normalizeSlsHost(readEnvValue(env.EXTENSION_ALI_SLS_HOST, env.PUBLIC_ALI_SLS_HOST)) ||
    (isProductionBuild ? DEFAULT_PROD_ALI_SLS_HOST : '')
  const endpoint = endpointFromEnv || (project && host ? `https://${project}.${host}` : '')
  const logstore =
    readEnvValue(env.EXTENSION_ALI_SLS_LOGSTORE, env.PUBLIC_ALI_SLS_LOGSTORE) ||
    (isProductionBuild ? DEFAULT_PROD_ALI_SLS_LOGSTORE : '')
  const enabledValue = readEnvValue(env.EXTENSION_ALI_SLS_ENABLED, env.PUBLIC_ALI_SLS_ENABLED)

  return {
    enabled: !isExplicitlyDisabled(enabledValue) && Boolean(endpoint && logstore),
    endpoint,
    logstore,
    topic:
      readEnvValue(env.EXTENSION_ALI_SLS_TOPIC, env.PUBLIC_ALI_SLS_TOPIC) || DEFAULT_ALI_SLS_TOPIC,
    source:
      readEnvValue(env.EXTENSION_ALI_SLS_SOURCE, env.PUBLIC_ALI_SLS_SOURCE) ||
      DEFAULT_ALI_SLS_SOURCE
  }
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export function createExtensionBuildEnv(env: ExtensionBuildProcessEnv): ExtensionBuildEnvConfig {
  const isProductionBuild = env.NODE_ENV === 'production'
  const apiBaseUrl = resolveBaseUrl(
    env.EXTENSION_API_BASE_URL,
    isProductionBuild ? DEFAULT_PROD_API_BASE_URL : DEFAULT_DEV_API_BASE_URL
  )
  const websiteBaseUrl = resolveBaseUrl(
    env.EXTENSION_WEBSITE_BASE_URL,
    isProductionBuild ? DEFAULT_PROD_WEBSITE_BASE_URL : DEFAULT_DEV_WEBSITE_BASE_URL
  )
  const aliSlsMark = resolveAliSlsMarkConfig(env, isProductionBuild)
  const contentScriptMatches = uniqueValues(SITE_REGISTRATION.matches)
  const webAccessibleResources = uniqueValues(SITE_REGISTRATION.styles.map(style => style.resource))
  // API/SLS/Google 登录域走标准 CORS，都不申请 host_permissions；
  // 这里只保留站点页面与媒体 CDN 权限。
  const hostPermissions = uniqueValues(SITE_REGISTRATION.hostPermissions)

  return {
    isProductionBuild,
    apiBaseUrl,
    websiteBaseUrl,
    aliSlsMark,
    contentScriptMatches,
    hostPermissions,
    webAccessibleResources
  }
}

const extensionBuildEnv = createExtensionBuildEnv({
  NODE_ENV: process.env.NODE_ENV,
  EXTENSION_API_BASE_URL: process.env.EXTENSION_API_BASE_URL,
  EXTENSION_WEBSITE_BASE_URL: process.env.EXTENSION_WEBSITE_BASE_URL,
  EXTENSION_ALI_SLS_PROJECT: process.env.EXTENSION_ALI_SLS_PROJECT,
  EXTENSION_ALI_SLS_HOST: process.env.EXTENSION_ALI_SLS_HOST,
  EXTENSION_ALI_SLS_ENDPOINT: process.env.EXTENSION_ALI_SLS_ENDPOINT,
  EXTENSION_ALI_SLS_LOGSTORE: process.env.EXTENSION_ALI_SLS_LOGSTORE,
  EXTENSION_ALI_SLS_TOPIC: process.env.EXTENSION_ALI_SLS_TOPIC,
  EXTENSION_ALI_SLS_SOURCE: process.env.EXTENSION_ALI_SLS_SOURCE,
  EXTENSION_ALI_SLS_ENABLED: process.env.EXTENSION_ALI_SLS_ENABLED,
  PUBLIC_ALI_SLS_PROJECT: process.env.PUBLIC_ALI_SLS_PROJECT,
  PUBLIC_ALI_SLS_HOST: process.env.PUBLIC_ALI_SLS_HOST,
  PUBLIC_ALI_SLS_ENDPOINT: process.env.PUBLIC_ALI_SLS_ENDPOINT,
  PUBLIC_ALI_SLS_LOGSTORE: process.env.PUBLIC_ALI_SLS_LOGSTORE,
  PUBLIC_ALI_SLS_TOPIC: process.env.PUBLIC_ALI_SLS_TOPIC,
  PUBLIC_ALI_SLS_SOURCE: process.env.PUBLIC_ALI_SLS_SOURCE,
  PUBLIC_ALI_SLS_ENABLED: process.env.PUBLIC_ALI_SLS_ENABLED
})

function createDevWebExtensionConfig(): ExtensionDevWebExtensionConfig {
  if (process.env.EXTENSION_DEV_BROWSER !== EDGE_CURRENT_DEV_BROWSER) {
    return {}
  }

  return {
    disableAutoLaunch: true
  }
}

const devWebExtensionConfig = createDevWebExtensionConfig()

function createSiteContentScripts(site: SiteRegistration) {
  return site.contentScripts.map(contentScript => ({
    matches: [...(contentScript.matches ?? site.matches)],
    js: [contentScript.entry],
    run_at: contentScript.runAt,
    ...(contentScript.world ? { world: contentScript.world } : {}),
    ...(contentScript.allFrames ? { all_frames: true } : {})
  }))
}

function createWebAccessibleResources(site: SiteRegistration) {
  const resources = site.styles.map(style => style.resource)
  return resources.length > 0
    ? [
        {
          resources,
          matches: [...site.matches]
        }
      ]
    : []
}

function copySiteStyles(site: SiteRegistration): void {
  for (const asset of site.styles) {
    const sourcePath = resolve(__dirname, asset.source)
    const destinationPath = resolve(__dirname, 'dist', asset.resource)
    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath)
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 定义全局常量，避免在 Service Worker 中使用 import.meta.env
  define: {
    __API_BASE_URL__: JSON.stringify(extensionBuildEnv.apiBaseUrl),
    __DEV__: JSON.stringify(!extensionBuildEnv.isProductionBuild),
    __WEBSITE_BASE_URL__: JSON.stringify(extensionBuildEnv.websiteBaseUrl),
    __ALI_SLS_MARK_CONFIG__: JSON.stringify(extensionBuildEnv.aliSlsMark)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  plugins: [
    vue(),
    VueI18n({
      include: [resolve(__dirname, './src/locales/**/*.json')],
      runtimeOnly: false
    }),
    webExtension({
      ...devWebExtensionConfig,
      skipManifestValidation: true, // 禁用schema验证 ,不然会卡主很多
      // offscreen document 不在 manifest 里声明，由 background 在首个下载任务时惰性创建；
      // 这里只需把入口 HTML 纳入构建。路径与 src/core/rpc/constants.ts 的 OFFSCREEN_ENTRY_PATH 同步。
      additionalInputs: ['src/offscreen.html', 'ext-pricing.html'],
      manifest: () => ({
        manifest_version: 3,
        minimum_chrome_version: '116',
        name: '__MSG_extensionName__',
        version: '1.0.1',
        default_locale: 'en',
        description: '__MSG_extensionDescription__',
        // identity 只用于 Google 授权：background 用 launchWebAuthFlow 打开 Google 授权页。
        // offscreen 用于 DASH/HLS 下载的 offscreen document（chrome.offscreen.createDocument）。
        // notifications 用于下载任务终态（完成/失败）的系统通知（chrome.notifications.create）。
        permissions: ['storage', 'identity', 'downloads', 'offscreen', 'notifications'],
        host_permissions: [...extensionBuildEnv.hostPermissions],
        action: {
          default_popup: 'src/popup.html',
          default_title: '__MSG_actionTitle__',
          default_icon: {
            '16': 'icons/16.png',
            '24': 'icons/24.png',
            '32': 'icons/32.png',
            '48': 'icons/48.png',
            '64': 'icons/64.png',
            '128': 'icons/128.png'
          }
        },
        icons: {
          '16': 'icons/16.png',
          '24': 'icons/24.png',
          '32': 'icons/32.png',
          '48': 'icons/48.png',
          '64': 'icons/64.png',
          '128': 'icons/128.png'
        },
        background: {
          service_worker: 'src/background/index.ts'
        },
        content_scripts: [...createSiteContentScripts(SITE_REGISTRATION)],
        web_accessible_resources: createWebAccessibleResources(SITE_REGISTRATION)
      })
    }),
    {
      name: 'copy-content-css',
      writeBundle() {
        copySiteStyles(SITE_REGISTRATION)
      }
    },
    {
      // 第三方许可声明随 dist / dist.zip 分发（商店上传包内自带 LGPL 等义务文本）。
      name: 'copy-third-party-notices',
      writeBundle() {
        copyFileSync(
          resolve(__dirname, 'THIRD-PARTY-NOTICES.md'),
          resolve(__dirname, 'dist', 'THIRD-PARTY-NOTICES.md')
        )
      }
    }
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 为 Service Worker 禁用某些优化，避免 document 引用问题
    rollupOptions: {
      output: {
        // 确保每个 chunk 是独立的
        inlineDynamicImports: false
      }
    },
    // 开发模式：禁用压缩以便调试
    minify: extensionBuildEnv.isProductionBuild ? 'esbuild' : false,
    // 生成 source map 以便调试
    sourcemap: !extensionBuildEnv.isProductionBuild ? true : false
  }
})
