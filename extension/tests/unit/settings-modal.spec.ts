/**
 * Popup 设置弹层测试。
 *
 * 保存位置已从 VideoPanel 收纳进弹层（弹层是唯一编辑入口）：预填设置值、trim 与空值回退
 * 默认子目录、写回 settings.downloadPath；语言下拉含 Auto 与 14 locale，切换写
 * settings.language 并经 chrome.storage.onChanged 链路即时同步 I18nService。
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_DOWNLOAD_PATH } from '@/core/storage/settings'
import { I18nService } from '@/locales'
import enUS from '@/locales/en-US.json'
import SettingsModal from '@/popup/components/SettingsModal.vue'
import { settingsModalVisible } from '@/core/composables/settingsModal'
import { LANGUAGE_AUTO } from '@/core/constants/i18n'

const IconStub = defineComponent({
  template: '<span class="icon-stub" aria-hidden="true"></span>'
})

/** chrome.storage.local 的测试后备存储。 */
const storageData = new Map<string, unknown>()

/** SettingsManager 在 chrome.storage.onChanged 上注册的监听器形态。 */
type StorageChangedListener = (
  changes: Record<string, { newValue: unknown }>,
  area: string
) => void

/** 取最近注册的存储监听器；须在 clearAllMocks 抹掉调用记录之前捕获。 */
function captureStorageChangedListener(): StorageChangedListener | undefined {
  const calls = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls
  return calls.at(-1)?.[0] as StorageChangedListener | undefined
}

/** 手动派发存储事件，模拟 chrome.storage.onChanged 链路。 */
function fireStorageChanged(listener: StorageChangedListener | undefined, newValue: unknown): void {
  listener?.({ settings: { newValue } }, 'local')
}

/** 挂载弹层（visible=false 起步），再打开并等设置回读完成。 */
async function mountOpened(): Promise<VueWrapper> {
  const wrapper = mount(SettingsModal, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Icon: IconStub, teleport: true }
    }
  })

  settingsModalVisible.value = true
  await flushPromises()
  return wrapper
}

describe('SettingsModal', () => {
  let wrapper: VueWrapper | null = null
  let storageListener: StorageChangedListener | undefined

  beforeAll(async () => {
    // 等 settings.ts 模块自初始化注册完 onChanged 监听器后一次性捕获；
    // 监听器是真实闭包，后续 clearAllMocks 不影响对它的引用。
    await flushPromises()
    storageListener = captureStorageChangedListener()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    storageData.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, unknown> = {}
      const keyList = typeof keys === 'string' ? [keys] : []
      for (const key of keyList) {
        if (storageData.has(key)) {
          result[key] = storageData.get(key)
        }
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) {
        storageData.set(key, value)
      }
    })
    settingsModalVisible.value = false
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    settingsModalVisible.value = false
  })

  it('打开时回读设置：语言下拉含 Auto + 14 locale，保存位置预填', async () => {
    storageData.set('settings', { language: 'ja-JP', downloadPath: 'my-videos' })
    wrapper = await mountOpened()

    const select = wrapper.get<HTMLSelectElement>('select')
    expect(select.element.value).toBe('ja-JP')
    // Auto + 14 locale
    expect(select.findAll('option')).toHaveLength(15)
    expect(select.findAll('option')[0].element.value).toBe(LANGUAGE_AUTO)
    expect(select.findAll('option')[0].text()).toBe(enUS['settings.language.auto'])

    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('my-videos')
  })

  it('未设置语言时默认选中 Auto', async () => {
    wrapper = await mountOpened()

    expect(wrapper.get<HTMLSelectElement>('select').element.value).toBe(LANGUAGE_AUTO)
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe(DEFAULT_DOWNLOAD_PATH)
  })

  it('切换语言写入 settings.language 并同步 I18nService 当前语言', async () => {
    storageData.set('settings', { language: 'auto' })
    wrapper = await mountOpened()

    const select = wrapper.get<HTMLSelectElement>('select')
    await select.setValue('ko-KR')
    await select.trigger('change')
    await flushPromises()

    expect((storageData.get('settings') as { language: string }).language).toBe('ko-KR')

    // 语言切换的即时生效走 chrome.storage.onChanged → SettingsManager → I18nService 链路。
    fireStorageChanged(storageListener, { language: 'ko-KR' })
    await flushPromises()
    expect(I18nService.getCurrentLanguage()).toBe('ko-KR')
  })

  it('保存位置改动 trim 后写回设置，空值回退默认子目录', async () => {
    storageData.set('settings', { language: 'en-US', downloadPath: 'my-videos' })
    wrapper = await mountOpened()

    const input = wrapper.get<HTMLInputElement>('input')

    await input.setValue('  videos/2026  ')
    await input.trigger('change')
    await flushPromises()

    expect((storageData.get('settings') as { downloadPath: string }).downloadPath).toBe(
      'videos/2026'
    )
    expect(input.element.value).toBe('videos/2026')

    await input.setValue('   ')
    await input.trigger('change')
    await flushPromises()

    expect((storageData.get('settings') as { downloadPath: string }).downloadPath).toBe(
      DEFAULT_DOWNLOAD_PATH
    )
    expect(input.element.value).toBe(DEFAULT_DOWNLOAD_PATH)
  })
})
