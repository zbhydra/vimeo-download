/**
 * 邮箱后台 owner、消费续签与额度投影的本地真实后端检查。
 * Chrome API 使用现有测试实现；API 请求全部到 127.0.0.1:7900，验证码直接准备在真实 Redis。
 * 复用 e2e_seed_user 的固定 Unlimited 账号，不发送邮件、不付款。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageValue } from '@/core/storage'
import type { JsonValue, RpcResponse } from '@/core/rpc/types'

const baseUrl = 'http://127.0.0.1:7900'
const backendDir = resolve(process.cwd(), '../backend/src')
const runFile = promisify(execFile)
const storage = new Map<string, StorageValue>()

/** 复用后端现有 seed，并写一次性验证码；凭据只保留在测试进程中。 */
async function prepareRealLogin(): Promise<{
  email: string
  code: string
  expired_access: string
  user_id: number
}> {
  const { stdout } = await runFile(
    '../.venv/bin/python',
    [
      '-c',
      `
import asyncio, json, secrets, sys
from datetime import timedelta
sys.path.insert(0, '../scripts')
from e2e_seed_user import _seed, SeedScenario
from app.core.database import close_engine
from app.core.redis import redis_client
from app.services.email_verification_service import email_verification_service
from app.utils.jwt import JwtData, JwtUnit
async def main():
    seeded = await _seed(SeedScenario.PARSE_DOWNLOAD)
    code = ''.join(secrets.choice('0123456789') for _ in range(6))
    await email_verification_service.clear_verify_data(seeded['email'])
    redis = await redis_client.get_client()
    await redis.set(email_verification_service._build_key(seeded['email']), code, ex=300)
    expired, _ = JwtUnit.create_access_token(JwtData(user_id=seeded['user_id'], email=seeded['email']), expires_delta=timedelta(seconds=-1))
    print(json.dumps(dict(email=seeded['email'], code=code, expired_access=expired, user_id=seeded['user_id'])))
    await close_engine()
asyncio.run(main())
`
    ],
    { cwd: backendDir, env: { ...process.env, PYTHONPYCACHEPREFIX: '../.cache/pycache' } }
  )
  return JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}')
}

describe('真实邮箱后台 owner 与额度', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', baseUrl)
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
    // Happy DOM 跨源 fetch 会移除 Authorization；同源环境保留真实认证请求头。
    window.location.href = baseUrl
    setActivePinia(createPinia())
    storage.clear()
    storage.set('counter_device_id', crypto.randomUUID())
    storage.set('first_opened_at', 1_700_000_000_000)
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => Object.fromEntries(storage))
    vi.mocked(chrome.storage.local.set).mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) storage.set(key, value as StorageValue)
    })
    vi.mocked(chrome.storage.local.remove).mockImplementation(async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key)
    })
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear()
  })

  it('后台保存正确验证码结果，过期账号续签消费，刷新不丢通知，退出读游客', async () => {
    const seeded = await prepareRealLogin()
    const { BackgroundMessageRouter } =
      await import('@/background/services/BackgroundMessageRouter')
    const router = new BackgroundMessageRouter()
    router.setupListener()
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0]
    if (!listener) throw new Error('后台 RPC listener 未注册')
    const call = (email: string, code: string) =>
      new Promise<RpcResponse<JsonValue>>(resolve => {
        listener(
          {
            protocolVersion: 2,
            id: crypto.randomUUID(),
            channel: 'background',
            method: 'loginWithEmailCode',
            params: { email, code }
          },
          { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
          resolve
        )
      })
    try {
      const { STORAGE_KEYS } = await import('@/core/api/config')
      const failed = await call(seeded.email, seeded.code === '000000' ? '111111' : '000000')
      expect(failed.success).toBe(false)
      expect(storage.has(STORAGE_KEYS.ACCESS_TOKEN)).toBe(false)
      const completed = await call(seeded.email, seeded.code)
      expect(completed).toMatchObject({ success: true, data: null })
      expect(storage.get(STORAGE_KEYS.USER_INFO)).toMatchObject({ user_id: seeded.user_id })
      expect(typeof storage.get(STORAGE_KEYS.REFRESH_TOKEN)).toBe('string')

      const headers = {
        'Content-Type': 'application/json',
        'X-Client-Product': 'extension',
        'X-Device-Id': String(storage.get(STORAGE_KEYS.DEVICE_ID))
      }
      const anonymous = await fetch(`${baseUrl}/api/client/quota/check`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ count: 1 })
      })
      expect(anonymous.status).toBe(200)
      expect(await anonymous.json()).toMatchObject({ code: 10000, data: { status: 1 } })
      const expired = await fetch(`${baseUrl}/api/client/quota/check`, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${seeded.expired_access}` },
        body: JSON.stringify({ count: 1 })
      })
      expect(expired.status).toBe(401)

      storage.set(STORAGE_KEYS.ACCESS_TOKEN, seeded.expired_access)
      const { quotaApi } = await import('@/core/api/quota')
      expect(await quotaApi.checkAndConsume({ count: 1 })).toMatchObject({
        status: 1,
        remaining: -1
      })
      expect(storage.get(STORAGE_KEYS.ACCESS_TOKEN)).not.toBe(seeded.expired_access)
      const { useAuthStore } = await import('@/core/stores/authStore')
      const { useQuotaStore } = await import('@/core/stores/quotaStore')
      const auth = useAuthStore()
      await auth.initialize()
      expect(auth.user?.user_id).toBe(seeded.user_id)
      const quota = useQuotaStore()
      expect(quota.hasActiveSubscription).toBe(true)

      const nativeFetch = globalThis.fetch
      let reads = 0
      let activeReads = 0
      let maxReads = 0
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, options?: RequestInit) => {
        const isStatus = String(input).endsWith('/api/client/subscription/status')
        if (isStatus) {
          reads++
          activeReads++
          maxReads = Math.max(maxReads, activeReads)
        }
        try {
          return await nativeFetch(input, options)
        } finally {
          if (isStatus) activeReads--
        }
      })
      const { ChromeEventSubscriber } = await import('@/core/rpc/ChromeEventBus')
      const subscriber = new ChromeEventSubscriber<import('@/core/events/types').ExtensionEvents>()
      let consumedRead: Promise<void> = Promise.resolve()
      subscriber.on('quotaConsumed', () => {
        consumedRead = quota.refreshQuota()
      })
      const firstRead = quota.refreshQuota()
      const quotaListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0]
      if (!quotaListener) throw new Error('消费通知 listener 未注册')
      quotaListener({ __event__: true, event: 'quotaConsumed' }, {}, () => undefined)
      await Promise.all([firstRead, consumedRead])
      subscriber.destroy()
      expect(reads).toBe(2)
      expect(maxReads).toBe(1)
      await auth.logout()
      expect(auth.isAuthenticated).toBe(false)
      expect(quota.quotaStatus?.period).toBe('free')
      expect(quota.quotaStatus).not.toBeNull()
      expect(quota.hasActiveSubscription).toBe(false)
    } finally {
      router.destroy()
      vi.unstubAllGlobals()
    }
  }, 30000)
})
