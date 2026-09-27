import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** extension 包根目录。 */
const extensionRoot = path.resolve(__dirname, '../..')
/** 构建产物 manifest 路径。 */
const distManifestPath = path.join(extensionRoot, 'dist', 'manifest.json')
/** vite build 单次约 1 分钟，远超全局 testTimeout。 */
const BUILD_TIMEOUT_MS = 120_000

/** 构建产物 manifest 的最小类型。 */
interface BuiltManifest {
  /** 本地加载时由浏览器分配 ID，构建产物省略此字段。 */
  key?: string
  /** 声明的 Chrome API 权限；identity 只用于 background 发起 Google 授权。 */
  permissions?: string[]
  /** 站点业务 content scripts。 */
  content_scripts?: Array<{ matches?: string[] }>
  /** 平台域 host 权限。 */
  host_permissions?: string[]
  /** 官网外部消息来源白名单；v3 起已整体移除。 */
  externally_connectable?: { matches?: string[] }
  /** 站点业务入口与 content script。 */
  /** 扩展页面 CSP；主扩展应省略并使用 Chrome MV3 默认策略。 */
  content_security_policy?: { extension_pages?: string }
}

describe('manifest build artifacts', () => {
  it(
    'declares only storage, identity, downloads and offscreen, and never grants the website domain host access',
    () => {
      // 测试自身触发生产构建，不依赖残留 dist/，确保断言的是当前 vite.config 组装结果。
      execFileSync('pnpm', ['build'], {
        cwd: extensionRoot,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      })

      const manifest = JSON.parse(readFileSync(distManifestPath, 'utf8')) as BuiltManifest

      expect(manifest.key).toBeUndefined()
      // Google 登录由 background 用 launchWebAuthFlow 发起，因此保留 identity；
      // offscreen 由 background 用 createDocument 承载 DASH/HLS 下载执行；
      // notifications 由 background 用 create 发送下载终态系统通知。
      expect(manifest.permissions).toEqual([
        'storage',
        'identity',
        'downloads',
        'offscreen',
        'notifications'
      ])
      // v3 browser identity 回调取代了 externally_connectable 旧接收端。
      expect(manifest.externally_connectable).toBeUndefined()
      // content_scripts 不得注入官网域。
      const allContentScriptMatches =
        manifest.content_scripts?.flatMap(script => script.matches ?? []) ?? []
      expect(
        allContentScriptMatches.some(match => match.includes('vimeo-video-downloader.example'))
      ).toBe(false)
      // 官网域不进 host_permissions（不产生 host access 警告）。
      expect(
        manifest.host_permissions?.some(host => host.includes('vimeo-video-downloader.example'))
      ).toBe(false)
      expect(manifest.content_security_policy).toBeUndefined()
    },
    BUILD_TIMEOUT_MS
  )
})
