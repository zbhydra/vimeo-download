/** Manifest 配置与必需资源复制合同；实际产物由 fresh build 验收。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_REGISTRATION } from '@/platforms/registry'

const mocks = vi.hoisted(() => ({
  options: null as {
    manifest: () => chrome.runtime.Manifest
    additionalInputs: string[]
  } | null,
  copyFile: vi.fn()
}))

vi.mock('vite-plugin-web-extension', () => ({
  default: (options: NonNullable<typeof mocks.options>) => {
    mocks.options = options
    return { name: 'web-extension' }
  }
}))

vi.mock('fs', async importOriginal => {
  const original = await importOriginal<typeof import('fs')>()
  const filesystem = { ...original, copyFileSync: mocks.copyFile, mkdirSync: vi.fn() }
  return { ...filesystem, default: filesystem }
})

const { default: config } = await import('../../vite.config')
const plugins = (config as { plugins: Array<{ name: string; writeBundle?: () => void }> }).plugins

describe('extension build configuration', () => {
  beforeEach(() => {
    mocks.copyFile.mockReset()
  })

  it('声明 Chrome 116、最小权限与必要上下文入口', () => {
    const manifest = mocks.options!.manifest()

    expect(manifest.minimum_chrome_version).toBe('116')
    expect(manifest.permissions).toEqual([
      'storage',
      'identity',
      'downloads',
      'offscreen',
      'notifications'
    ])
    expect(manifest.background).toEqual({ service_worker: 'src/background/index.ts' })
    expect(manifest.action?.default_popup).toBe('src/popup.html')
    expect(mocks.options!.additionalInputs).toContain('src/offscreen.html')
    expect(manifest.content_scripts).toHaveLength(3)
    expect(manifest.key).toBeUndefined()
    expect(manifest.externally_connectable).toBeUndefined()
    expect(manifest.content_security_policy).toBeUndefined()
    expect(manifest.host_permissions).toEqual([...SITE_REGISTRATION.hostPermissions])
  })

  it('必需资源复制失败时中止构建', () => {
    const error = new Error('ENOENT: 必需构建资源缺失')
    mocks.copyFile.mockImplementation(() => {
      throw error
    })

    for (const name of ['copy-content-css', 'copy-third-party-notices']) {
      const hook = plugins.find(plugin => plugin.name === name)!.writeBundle!
      expect(() => hook()).toThrow(error)
    }
  })
})
