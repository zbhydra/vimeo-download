/** Content 唯一 injected client 的模块边界测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  constructor: vi.fn()
}))

vi.mock('@/content/rpc/injected.rpc', () => ({
  InjectedChannel: mocks.constructor
}))

describe('injectedClient', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.constructor.mockClear()
  })

  it('模块加载时只创建一个不带固定超时的 InjectedChannel', async () => {
    const client = { downloadMedia: vi.fn() }
    mocks.constructor.mockReturnValue(client)

    const first = await import('@/content/rpc/injectedClient')
    const second = await import('@/content/rpc/injectedClient')

    expect(mocks.constructor).toHaveBeenCalledTimes(1)
    expect(mocks.constructor).toHaveBeenCalledWith()
    expect(first.injectedClient).toBe(client)
    expect(second.injectedClient).toBe(client)
  })
})
