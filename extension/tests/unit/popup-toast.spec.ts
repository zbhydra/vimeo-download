/**
 * Popup 全局 Toast 渲染回归测试。
 *
 * App 必须挂载唯一的 Toast renderer，使拦截器和组件共享的 toastService 能向用户展示错误。
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/popup/App.vue'
import toastComponentSource from '../../src/core/components/Toast.vue?raw'
import { toastService } from '../../src/core/composables/useToast'

const mocks = vi.hoisted(() => ({
  resourceInitialize: vi.fn(),
  downloadStatusInitialize: vi.fn(),
  downloadStatusDestroy: vi.fn(),
  authInitialize: vi.fn(),
  ensureSupportedTabOpen: vi.fn(),
  recordMark: vi.fn(),
  eventOn: vi.fn(),
  eventDestroy: vi.fn()
}))

vi.mock('../../src/popup/stores/resourceStore', () => ({
  useResourceStore: () => ({
    initialize: mocks.resourceInitialize,
    downloadResource: vi.fn(),
    refresh: vi.fn()
  })
}))

vi.mock('../../src/core/stores/authStore', () => ({
  useAuthStore: () => ({
    initialize: mocks.authInitialize
  })
}))

vi.mock('../../src/popup/stores/downloadStatusStore', () => ({
  useDownloadStatusStore: () => ({
    initialize: mocks.downloadStatusInitialize,
    destroy: mocks.downloadStatusDestroy
  })
}))

vi.mock('../../src/popup/utils/tabs', () => ({
  ensureSupportedTabOpen: mocks.ensureSupportedTabOpen
}))

vi.mock('../../src/core/api/mark', () => ({
  MARK_TYPE: {
    POPUP_OPEN: 'popup_open',
    DOWNLOAD_CLICK: 'download_click'
  },
  markApi: {
    record: mocks.recordMark
  }
}))

vi.mock('../../src/core/rpc/ChromeEventBus', () => ({
  ChromeEventSubscriber: class {
    on = mocks.eventOn
    destroy = mocks.eventDestroy
  }
}))

vi.mock('../../src/core/utils/logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

/**
 * 将浏览器计算后的 CSS 颜色转换为 RGB 通道。
 */
function parseCssColor(color: string): readonly [number, number, number] {
  if (color.startsWith('#') && color.length === 7) {
    return [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16)
    ]
  }

  const channels = color.match(/[\d.]+/g)
  if (!channels || channels.length < 3) {
    throw new Error(`[Popup Toast Test] 无法解析 CSS 颜色: ${color}`)
  }

  return [Number(channels[0]), Number(channels[1]), Number(channels[2])]
}

/**
 * 计算 sRGB 颜色的相对亮度。
 */
function relativeLuminance(color: string): number {
  const [red, green, blue] = parseCssColor(color)
  const linearChannels = [red, green, blue].map(channel => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2]
}

/**
 * 计算前景色与背景色的 WCAG 对比度。
 */
function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 从 Toast 组件的最终样式规则中读取文字色和背景色。
 */
function readToastColors(className: string): { foreground: string; background: string } {
  const styleBlock = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(toastComponentSource)?.[1]
  const foreground = styleBlock?.match(/(?:^|\n)\s*color:\s*(#[\da-f]{6})\s*;/i)?.[1]
  const background = styleBlock?.match(/(?:^|\n)\s*background:\s*(#[\da-f]{6})\s*;/i)?.[1]

  if (!foreground || !background) {
    throw new Error(`[Popup Toast Test] 无法读取 ${className} 的文字色或背景色`)
  }

  return { foreground, background }
}

/**
 * 挂载 Popup，并等待初始化任务结束。
 */
async function mountPopup(): Promise<VueWrapper> {
  const mounted = mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        AppHeader: true,
        AppFooter: true,
        VideoPanel: true,
        DownloadQueue: true,
        AnnouncementBar: true,
        SettingsModal: true,
        UpgradeModal: true,
        LoginModal: true,
        PremiumView: true,
        HistoryView: true
      }
    }
  })
  await flushPromises()
  return mounted
}

describe('Popup global Toast', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    toastService.hide()
    document.body.innerHTML = ''
    mocks.ensureSupportedTabOpen.mockResolvedValue({
      id: 7,
      url: 'https://www.instagram.com/'
    })
    mocks.resourceInitialize.mockResolvedValue(undefined)
    mocks.downloadStatusInitialize.mockResolvedValue(undefined)
    mocks.authInitialize.mockResolvedValue(undefined)
    mocks.recordMark.mockResolvedValue(undefined)
    mocks.eventOn.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    toastService.hide()
    document.body.innerHTML = ''
  })

  it('renders toastService errors through one assertive live region', async () => {
    wrapper = await mountPopup()

    toastService.error('官网登录页打开失败', 0)
    await nextTick()

    const alerts = document.body.querySelectorAll<HTMLElement>('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toContain('官网登录页打开失败')
    expect(alerts[0].getAttribute('aria-live')).toBe('assertive')
    expect(alerts[0].getAttribute('aria-atomic')).toBe('true')
  })

  it.each([
    ['success', 'status', '下载已开始'],
    ['error', 'alert', '下载失败']
  ] as const)('keeps %s toast text at WCAG AA contrast', async (type, role, message) => {
    wrapper = await mountPopup()

    toastService.show(message, type, 0)
    await nextTick()

    const toast = document.body.querySelector<HTMLElement>(`[role="${role}"]`)
    expect(toast).not.toBeNull()
    expect(toast?.classList.contains(`toast-${type}`)).toBe(true)

    const colors = readToastColors(`toast-${type}`)
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
  })
})
