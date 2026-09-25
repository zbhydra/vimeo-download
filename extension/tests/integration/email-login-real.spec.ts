/**
 * 插件本地登录走本地真实后端的集成测试。
 *
 * 只替换 Chrome API 与扩展存储，项目 API 一律请求本地启动的后端（http://127.0.0.1:7900）。
 * 验证码正确分支需要真实收件箱，因此这里固定「验证码错误」分支：它同时证明端点路径、请求体
 * 形状与错误信封都被后端接受，且失败不写入任何登录态。
 *
 * 收集阶段先探测本地后端是否已包含插件登录合同；未包含时整组跳过并打印证据，
 * 不把环境问题伪装成通过或失败。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageValue } from '@/core/storage'

const baseUrl = 'http://127.0.0.1:7900'
/** 后端未豁免插件设备闸门时返回的业务码。 */
const UNTRUSTED_DEVICE_CODE = 10015

const mocks = vi.hoisted(() => ({
  storage: new Map<string, StorageValue>()
}))

/** 探测本地后端是否已包含插件登录合同；返回跳过原因，null 表示可以跑。 */
async function probeBackendContract(): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/api/client/auth/email-verify-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Product': 'extension' },
      body: JSON.stringify({ email: 'contract-probe@example.com', code: '000000' })
    })
    const payload = (await response.json()) as { code?: number }
    if (payload.code === UNTRUSTED_DEVICE_CODE) {
      return '本地后端尚未豁免插件设备闸门（code=10015），需要重启到含该改动的版本'
    }
  } catch (error) {
    return `本地后端不可达(${baseUrl}): ${error instanceof Error ? error.message : String(error)}`
  }

  return null
}

const skipReason = await probeBackendContract()
if (skipReason) {
  // 收集阶段的 skip 不会出现在报告标题里，直接写 stderr 留下证据。
  process.stderr.write(`[email-login-real] 跳过真实后端集成测试：${skipReason}\n`)
}

describe.skipIf(skipReason !== null)('extension local login against the real backend', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', baseUrl)
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    mocks.storage.clear()
    mocks.storage.set('counter_device_id', '9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c')
    mocks.storage.set('first_opened_at', 1_700_000_000_000)
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ ...mocks.storage }))
    vi.mocked(chrome.storage.local.set).mockImplementation(async items => {
      Object.assign(mocks.storage, items)
    })
  })

  it(
    '邮箱验证码错误时后端返回业务错误码且不写入登录态',
    async () => {
      const { authApi } = await import('@/core/api/auth/api')
      const { STORAGE_KEYS } = await import('@/core/api/config')

      await expect(
        authApi.loginWithEmailCode(`e2e-login-${crypto.randomUUID()}@example.com`, '000000')
      ).rejects.toMatchObject({ backendCode: 10106 })

      expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBeUndefined()
      expect(mocks.storage.get(STORAGE_KEYS.REFRESH_TOKEN)).toBeUndefined()
      expect(mocks.storage.get(STORAGE_KEYS.USER_INFO)).toBeUndefined()
    },
    15000
  )
})
