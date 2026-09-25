/** 安装身份只写一次，启动并发、旧安装升级与读取失败不能重置身份。 */
import { beforeEach, expect, it, vi } from 'vitest'

let stored: Record<string, string | number>

beforeEach(() => {
  vi.resetModules()
  stored = {}
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ ...stored }))
  vi.mocked(chrome.storage.local.set).mockImplementation(async items => {
    Object.assign(stored, items)
  })
  vi.mocked(chrome.storage.local.set).mockClear()
})

it('并发首次打开与 worker 重启保持同一设备和首次时间', async () => {
  const { getInstallation } = await import('../../src/background/installation')
  const [first, second] = await Promise.all([getInstallation(), getInstallation()])
  expect(first).toEqual(second)
  expect(first.device_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(first.first_opened_at).toBeGreaterThan(0)
  expect(chrome.storage.local.set).toHaveBeenCalledTimes(1)
  vi.resetModules()
  const restarted = await import('../../src/background/installation')
  expect(await restarted.getInstallation()).toEqual(first)
  expect(chrome.storage.local.set).toHaveBeenCalledTimes(1)
})

it('旧安装补记时间但保留设备；读取失败不写入，之后可以重试', async () => {
  stored = { counter_device_id: 'existing-device' }
  vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('storage unavailable'))
  const { getInstallation } = await import('../../src/background/installation')
  await expect(getInstallation()).rejects.toThrow('storage unavailable')
  expect(chrome.storage.local.set).not.toHaveBeenCalled()
  const result = await getInstallation()
  expect(result.device_id).toBe('existing-device')
  expect(stored.first_opened_at).toBe(result.first_opened_at)
  expect(result.first_opened_at).toBeGreaterThan(0)
})
