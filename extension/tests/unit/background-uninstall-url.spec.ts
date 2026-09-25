import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uninstallUrl =
  'https://docs.google.com/forms/d/e/1FAIpQLSeCZwJtiwoFdME8MHzmpBn98HUIi4V-DIutGCz3toBu7Qyezg/viewform?usp=publish-editor'

type InstalledListener = (details: chrome.runtime.InstalledDetails) => void
type SuspendListener = () => void

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  },
  storageManager: {
    get: vi.fn(),
    set: vi.fn()
  },
  setupListener: vi.fn(),
  destroy: vi.fn(),
  setUninstallURL: vi.fn(),
  createTab: vi.fn(),
  addMessageListener: vi.fn(),
  removeMessageListener: vi.fn(),
  addInstalledListener: vi.fn(),
  addStartupListener: vi.fn(),
  addSuspendListener: vi.fn(),
  initializeRuntimeLogger: vi.fn()
}))

let installedListener: InstalledListener | null = null
let suspendListener: SuspendListener | null = null

vi.mock('@/core/utils/logger', () => ({
  logger: mocks.logger
}))

vi.mock('../../src/background/installation', () => ({
  getInstallation: () => Promise.resolve({ device_id: 'existing-device-id', first_opened_at: 1789000000000 })
}))

vi.mock('@/core/storage', () => ({
  storageManager: mocks.storageManager
}))

vi.mock('../../src/background/services/BackgroundMessageRouter', () => ({
  BackgroundMessageRouter: vi.fn().mockImplementation(() => ({
    setupListener: mocks.setupListener,
    destroy: mocks.destroy
  }))
}))

vi.mock('../../src/background/runtimeConfig', () => ({
  initializeRuntimeLogger: mocks.initializeRuntimeLogger
}))

describe('background uninstall url', () => {
  beforeEach(() => {
    vi.resetModules()

    vi.stubGlobal('__DEV__', false)
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
    mocks.storageManager.get.mockReset().mockResolvedValue('existing-device-id')
    mocks.storageManager.set.mockReset().mockResolvedValue(undefined)
    mocks.initializeRuntimeLogger.mockReset().mockResolvedValue(undefined)
    mocks.setupListener.mockReset()
    mocks.destroy.mockReset()
    mocks.setUninstallURL.mockReset().mockResolvedValue(undefined)
    mocks.createTab.mockReset()
    mocks.addMessageListener.mockReset()
    mocks.removeMessageListener.mockReset()
    mocks.addInstalledListener.mockReset().mockImplementation((listener: InstalledListener) => {
      installedListener = listener
    })
    mocks.addStartupListener.mockReset()
    mocks.addSuspendListener.mockReset().mockImplementation((listener: SuspendListener) => {
      suspendListener = listener
    })
    installedListener = null
    suspendListener = null

    vi.stubGlobal('chrome', {
      runtime: {
        OnInstalledReason: {
          INSTALL: 'install',
          UPDATE: 'update',
          CHROME_UPDATE: 'chrome_update',
          SHARED_MODULE_UPDATE: 'shared_module_update'
        },
        setUninstallURL: mocks.setUninstallURL,
        onMessage: {
          addListener: mocks.addMessageListener,
          removeListener: mocks.removeMessageListener
        },
        onInstalled: {
          addListener: mocks.addInstalledListener
        },
        onStartup: {
          addListener: mocks.addStartupListener
        },
        onSuspend: {
          addListener: mocks.addSuspendListener
        }
      },
      tabs: {
        create: mocks.createTab
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers the uninstall survey URL when the background worker starts', async () => {
    await import('../../src/background/index')

    expect(mocks.setUninstallURL).toHaveBeenCalledWith(uninstallUrl)
  })

  it('initializes the device ID without opening a tab on first install', async () => {
    await import('../../src/background/index')
    if (!installedListener) {
      throw new Error('[background-uninstall-url.spec] onInstalled listener 未注册')
    }
    installedListener({ reason: 'install' })

    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('does not open any site page on extension update', async () => {
    await import('../../src/background/index')
    if (!installedListener) {
      throw new Error('[background-uninstall-url.spec] onInstalled listener 未注册')
    }

    installedListener({ reason: 'update', previousVersion: '1.0.0' })

    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('registers and releases the shared mark event subscriber', async () => {
    await import('../../src/background/index')

    expect(mocks.addMessageListener).toHaveBeenCalledOnce()
    if (!suspendListener) {
      throw new Error('[background-uninstall-url.spec] onSuspend listener 未注册')
    }

    suspendListener()

    expect(mocks.removeMessageListener).toHaveBeenCalledOnce()
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })
})
