/** Chrome/DOM 单向事件总线的发布、订阅、异常隔离与清理测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventDefinition } from '@/core/events/types'
import { ChromeEventEmitter, ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { DomEventEmitter, DomEventSubscriber } from '@/core/rpc/DomEventBus'

interface TestEvents extends EventDefinition {
  changed: { value: number }
  empty: void
}

type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0]

describe('ChromeEventBus', () => {
  beforeEach(() => {
    vi.mocked(chrome.runtime.sendMessage).mockClear()
    vi.mocked(chrome.tabs.sendMessage).mockClear()
    vi.mocked(chrome.tabs.query).mockReset()
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear()
    vi.mocked(chrome.runtime.onMessage.removeListener).mockClear()
    vi.mocked(console.error).mockClear()
  })

  it('发布到 runtime、指定 tab 和所有有效 tab', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(() =>
      Promise.resolve([{ id: 7 }, { id: 0 }, { url: 'https://example.com/no-id' }] as chrome.tabs.Tab[])
    )
    const emitter = new ChromeEventEmitter<TestEvents>()

    emitter.emit('changed', { value: 1 })
    emitter.emitToTab(5, 'changed', { value: 2 })
    await emitter.broadcast('changed', { value: 3 })

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      __event__: true,
      event: 'changed',
      data: { value: 1 }
    })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, {
      __event__: true,
      event: 'changed',
      data: { value: 2 }
    })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      __event__: true,
      event: 'changed',
      data: { value: 3 }
    })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('只分发合法事件，隔离 handler 异常，并支持取消和销毁', () => {
    const subscriber = new ChromeEventSubscriber<TestEvents>()
    const listener = getLatestRuntimeListener()
    const handler = vi.fn()
    const failingHandler = vi.fn(() => {
      throw new Error('controlled handler failure')
    })
    const unsubscribe = subscriber.on('changed', handler)
    subscriber.on('changed', failingHandler)

    dispatchRuntimeMessage(listener, { ignored: true })
    dispatchRuntimeMessage(listener, { __event__: true, event: 'missing', data: null })
    dispatchRuntimeMessage(listener, { __event__: true, event: 'changed', data: { value: 4 } })

    expect(handler).toHaveBeenCalledWith({ value: 4 })
    expect(failingHandler).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalled()

    unsubscribe()
    dispatchRuntimeMessage(listener, { __event__: true, event: 'changed', data: { value: 5 } })
    expect(handler).toHaveBeenCalledTimes(1)

    subscriber.destroy()
    subscriber.destroy()
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener)
  })
})

describe('DomEventBus', () => {
  beforeEach(() => {
    vi.mocked(console.error).mockClear()
  })

  it('发布普通/后缀事件，支持取消订阅和 handler 异常隔离', () => {
    const emitter = new DomEventEmitter<TestEvents>('test_')
    const subscriber = new DomEventSubscriber<TestEvents>('test_')
    const handler = vi.fn()
    const suffixHandler = vi.fn()
    const unsubscribe = subscriber.on('changed', handler)
    subscriber.onWithSuffix('changed', 'resource-1', suffixHandler)
    subscriber.on('empty', () => {
      throw new Error('controlled DOM handler failure')
    })

    emitter.emit('changed', { value: 1 })
    emitter.emitWithSuffix('changed', 'resource-1', { value: 2 })
    emitter.emit('empty', undefined)

    expect(handler).toHaveBeenCalledWith({ value: 1 })
    expect(suffixHandler).toHaveBeenCalledWith({ value: 2 })
    expect(console.error).toHaveBeenCalled()

    unsubscribe()
    emitter.emit('changed', { value: 3 })
    expect(handler).toHaveBeenCalledTimes(1)

    subscriber.destroy()
    emitter.emitWithSuffix('changed', 'resource-1', { value: 4 })
    expect(suffixHandler).toHaveBeenCalledTimes(1)
  })
})

function getLatestRuntimeListener(): RuntimeListener {
  const call = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)
  if (!call) {
    throw new Error('[event-buses.spec] runtime listener 未注册')
  }
  return call[0]
}

function dispatchRuntimeMessage(listener: RuntimeListener, message: object): void {
  listener(message, {}, vi.fn())
}
