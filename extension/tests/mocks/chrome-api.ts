/**
 * Chrome Extension API Mock
 *
 * 用于单元测试和集成测试
 * 提供完整的 Chrome Extension API 模拟
 */

// ============================================================================
// 基础类型定义
// ============================================================================

interface Tab {
  id?: number
  url?: string
  active?: boolean
  currentWindow?: boolean
}

// ============================================================================
// chrome.action API
// ============================================================================

const action = {
  getBadgeText: vi.fn((_details: any, callback?: any) => {
    const result = ''
    if (callback) {
      callback(result)
      return
    }
    return Promise.resolve(result)
  }),

  getBadgeBackgroundColor: vi.fn((_details: any, callback?: any) => {
    const result = [74, 144, 226, 1] // #4A90E2
    if (callback) {
      callback(result)
      return
    }
    return Promise.resolve(result)
  }),

  setBadgeText: vi.fn(),
  setBadgeBackgroundColor: vi.fn(),
  setIcon: vi.fn(),
  setTitle: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn()
}

// ============================================================================
// chrome.runtime API
// ============================================================================

const runtime = {
  id: 'test-extension-id',

  sendMessage: vi.fn((_message: any, callback?: any) => {
    const response = {
      success: true,
      msg: '',
      data: {}
    }

    if (callback) {
      callback(response)
      return
    }

    return Promise.resolve(response)
  }),

  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  },

  getURL: vi.fn((path: string) => {
    return `chrome-extension://test-extension-id/${path}`
  }),

  getManifest: vi.fn(() => ({
    manifest_version: 3,
    name: 'Test Extension',
    version: '1.0.0'
  })),

  // offscreen document 预检；默认视为不存在，测试可覆写返回值。
  getContexts: vi.fn(async (_filter: chrome.runtime.ContextFilter) => {
    return [] as chrome.runtime.ExtensionContext[]
  })
}

// ============================================================================
// chrome.offscreen API
// ============================================================================

const offscreen = {
  createDocument: vi.fn(async (_parameters: chrome.offscreen.CreateParameters) => undefined),
  closeDocument: vi.fn(async () => undefined),
  hasDocument: vi.fn(async () => false)
}

// ============================================================================
// chrome.tabs API
// ============================================================================

const tabs = {
  sendMessage: vi.fn((_tabId: number, _message: any, callback?: any) => {
    const response = {
      success: true,
      msg: '',
      data: {}
    }

    if (callback) {
      callback(response)
      return
    }

    return Promise.resolve(response)
  }),

  query: vi.fn((_queryInfo: any) => {
    return Promise.resolve([
      {
        id: 1,
        url: 'https://web.telegram.org/',
        active: true,
        currentWindow: true
      }
    ] as Tab[])
  }),

  get: vi.fn((tabId: number) => {
    return Promise.resolve({
      id: tabId,
      url: 'https://web.telegram.org/',
      active: true
    } as Tab)
  }),

  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}

// ============================================================================
// chrome.storage API
// ============================================================================

const storageData: Record<string, any> = {}

const storage = {
  local: {
    get: vi.fn((keys: any, callback?: any) => {
      let result: any = {}

      if (keys === null) {
        result = { ...storageData }
      } else if (typeof keys === 'string') {
        result = { [keys]: storageData[keys] }
      } else if (Array.isArray(keys)) {
        for (const key of keys) {
          if (key in storageData) {
            result[key] = storageData[key]
          }
        }
      } else if (typeof keys === 'object') {
        for (const key in keys) {
          if (key in storageData) {
            result[key] = storageData[key]
          } else {
            result[key] = keys[key]
          }
        }
      }

      if (callback) {
        callback(result)
        return
      }

      return Promise.resolve(result)
    }),

    set: vi.fn((items: any, callback?: any) => {
      Object.assign(storageData, items)

      if (callback) {
        callback()
        return
      }

      return Promise.resolve()
    }),

    remove: vi.fn((keys: string | string[], callback?: any) => {
      const keysArray = Array.isArray(keys) ? keys : [keys]
      for (const key of keysArray) {
        delete storageData[key]
      }

      if (callback) {
        callback()
        return
      }

      return Promise.resolve()
    }),

    clear: vi.fn((callback?: any) => {
      for (const key in storageData) {
        delete storageData[key]
      }

      if (callback) {
        callback()
        return
      }

      return Promise.resolve()
    })
  },

  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn()
  },

  session: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn()
  },

  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  }
}

// ============================================================================
// chrome.downloads API
// ============================================================================

const downloads = {
  download: vi.fn(
    async (_options: chrome.downloads.DownloadOptions): Promise<number> => 1
  ),
  search: vi.fn(
    async (_query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]> => []
  ),
  cancel: vi.fn(async (_downloadId: number): Promise<void> => undefined),
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  },
  onDeterminingFilename: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  },
  onCreated: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  }
}

// ============================================================================
// chrome.identity API
// ============================================================================

/** 测试用扩展 ID：32 位 a-p 小写字母。 */
const TEST_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'

const identity = {
  getRedirectURL: vi.fn((path = '') => {
    return `https://${TEST_EXTENSION_ID}.chromiumapp.org/${path}`
  }),

  launchWebAuthFlow: vi.fn(async (_details: chrome.identity.WebAuthFlowDetails) => {
    return `https://${TEST_EXTENSION_ID}.chromiumapp.org/google-login?google_login_code=test-code`
  })
}

// ============================================================================
// chrome.notifications API
// ============================================================================

const notifications = {
  create: vi.fn(
    async (_options: chrome.notifications.NotificationCreateOptions): Promise<string> =>
      'notification-1'
  ),
  onClicked: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  },
  onClosed: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn()
  }
}

// ============================================================================
// chrome.i18n API
// ============================================================================

const i18n = {
  getAcceptLanguages: vi.fn(async (): Promise<string[]> => ['en-US', 'en']),
  getMessage: vi.fn((messageName: string) => messageName)
}

// ============================================================================
// 导出 Chrome API
// ============================================================================

export const chrome = {
  action,
  runtime,
  tabs,
  storage,
  downloads,
  identity,
  offscreen,
  notifications,
  i18n
}

// 添加类型导出
export type Chrome = typeof chrome
