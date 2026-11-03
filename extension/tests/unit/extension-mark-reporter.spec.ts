/** Background 统一订阅插件行为事件并写入 SLS。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExtensionMarkReporter } from '@/background/services/ExtensionMarkReporter'
import { MARK_TYPE, type ExtensionOpenSource } from '@/core/api/mark/types'

const mocks = vi.hoisted(() => ({
  eventOn: vi.fn(),
  eventDestroy: vi.fn(),
  unsubscribe: vi.fn(),
  recordMark: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('@/core/rpc/ChromeEventBus', () => ({
  ChromeEventSubscriber: class {
    on = mocks.eventOn
    destroy = mocks.eventDestroy
  }
}))

vi.mock('@/core/api/mark', () => ({
  markApi: { record: mocks.recordMark }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: { error: mocks.loggerError }
}))

describe('ExtensionMarkReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventOn.mockReturnValue(mocks.unsubscribe)
    mocks.recordMark.mockResolvedValue({ recorded: true })
  })

  it('subscribes once and records upgrade_modal_open', async () => {
    const reporter = new ExtensionMarkReporter()
    reporter.setup()
    reporter.setup()

    expect(mocks.eventOn).toHaveBeenCalledTimes(3)
    expect(mocks.eventOn).toHaveBeenCalledWith('upgradeModalOpened', expect.any(Function))

    const handleUpgradeModalOpened = mocks.eventOn.mock.calls[0]?.[1] as () => void
    handleUpgradeModalOpened()

    await vi.waitFor(() => expect(mocks.recordMark).toHaveBeenCalledOnce())
    expect(mocks.recordMark).toHaveBeenCalledWith(MARK_TYPE.UPGRADE_MODAL_OPEN, '', {})

    const handleLoginPromptOpened = mocks.eventOn.mock.calls[1]?.[1] as () => void
    handleLoginPromptOpened()
    await vi.waitFor(() => expect(mocks.recordMark).toHaveBeenCalledTimes(2))
    expect(mocks.recordMark).toHaveBeenLastCalledWith(MARK_TYPE.LOGIN_MODAL_OPEN, '{"source":"upgrade_modal"}', {})

    reporter.destroy()
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(3)
    expect(mocks.eventDestroy).toHaveBeenCalledOnce()
  })

  it('logs SLS failures without throwing into the event handler', async () => {
    const error = new Error('controlled SLS failure')
    mocks.recordMark.mockRejectedValue(error)
    const reporter = new ExtensionMarkReporter()
    reporter.setup()

    const handleUpgradeModalOpened = mocks.eventOn.mock.calls[0]?.[1] as () => void
    expect(() => handleUpgradeModalOpened()).not.toThrow()
    await vi.waitFor(() => expect(mocks.loggerError).toHaveBeenCalled())

    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[ExtensionMarkReporter] SLS 打点失败: markType=upgrade_modal_open',
      error
    )

    reporter.destroy()
  })

  describe('每日首次打开', () => {
    let stored: Record<string, string | number>

    /** 新建 reporter（相当于 service worker 重启）并返回打开事件的入口。 */
    function startReporter(): (source: ExtensionOpenSource) => void {
      mocks.eventOn.mockClear()
      new ExtensionMarkReporter().setup()
      const call = mocks.eventOn.mock.calls.find(([event]) => event === 'extensionOpened')
      const handler = call?.[1] as (payload: { source: ExtensionOpenSource }) => void
      return source => handler({ source })
    }

    /** 等当前排队的存储读写和上报都结束。 */
    async function settle(): Promise<void> {
      for (let index = 0; index < 20; index += 1) await Promise.resolve()
    }

    function dailyMarks(): unknown[][] {
      return mocks.recordMark.mock.calls.filter(([type]) => type === MARK_TYPE.DAILY_FIRST_OPENED)
    }

    beforeEach(() => {
      stored = {}
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-03T16:00:00Z'))
      vi.mocked(chrome.storage.local.get).mockImplementation(((keys: string | string[]) => {
        const names = typeof keys === 'string' ? keys : keys
        const result: Record<string, string | number> = {}
        for (const name of [names].flat()) {
          if (name in stored) result[name] = stored[name]
        }
        return Promise.resolve(result)
      }) as never)
      vi.mocked(chrome.storage.local.set).mockImplementation(((
        items: Record<string, string | number>
      ) => {
        Object.assign(stored, items)
        return Promise.resolve()
      }) as never)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('同一业务日多个入口同时触发只上报一次，并记录先触发的入口', async () => {
      const open = startReporter()
      open('vimeo_panel')
      open('popup')
      open('vimeo_panel')
      await settle()

      expect(dailyMarks()).toEqual([
        [MARK_TYPE.DAILY_FIRST_OPENED, '{"source":"vimeo_panel"}', {}]
      ])
      expect(stored.daily_first_opened_date).toBe('2026-11-03')
    })

    it('按 America/New_York 切日，不按 UTC 或用户本地时区', async () => {
      const open = startReporter()
      open('popup')
      await settle()
      expect(dailyMarks()).toHaveLength(1)

      // 纽约 11-03 23:59：UTC 已经是 11-04，仍算同一天。
      vi.setSystemTime(new Date('2026-11-04T04:59:00Z'))
      open('popup')
      await settle()
      expect(dailyMarks()).toHaveLength(1)

      // 纽约 11-04 00:00：新的一天。
      vi.setSystemTime(new Date('2026-11-04T05:00:00Z'))
      open('popup')
      await settle()
      expect(dailyMarks()).toHaveLength(2)
      expect(stored.daily_first_opened_date).toBe('2026-11-04')
    })

    it('service worker 重启后读持久化日期，当天不重复上报', async () => {
      startReporter()('popup')
      await settle()
      expect(dailyMarks()).toHaveLength(1)

      startReporter()('vimeo_panel')
      await settle()
      expect(dailyMarks()).toHaveLength(1)
    })

    it('没发出去不记日期，下次打开再补', async () => {
      mocks.recordMark.mockResolvedValueOnce({ recorded: false })
      const open = startReporter()
      open('vimeo_panel')
      await settle()
      expect(dailyMarks()).toHaveLength(1)
      expect(stored.daily_first_opened_date).toBeUndefined()

      open('popup')
      await settle()
      expect(dailyMarks()).toHaveLength(2)
      expect(dailyMarks()[1]?.[1]).toBe('{"source":"popup"}')
      expect(stored.daily_first_opened_date).toBe('2026-11-03')
    })
  })
})
