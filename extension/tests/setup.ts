/**
 * Vitest 全局测试设置
 *
 * 功能:
 * - 配置 Chrome Extension API Mock
 * - 设置全局测试工具
 */

import { vi } from 'vitest'
import { chrome } from './mocks/chrome-api'

vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
vi.stubGlobal('__DEV__', false)
vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
vi.stubGlobal('__ALI_SLS_MARK_CONFIG__', {
  enabled: true,
  endpoint: 'https://vimeo-download.ap-southeast-1.log.aliyuncs.com',
  logstore: 'vimeo-download-mark-log',
  topic: 'mark-log',
  source: 'extension'
})

// Mock Chrome API
global.chrome = chrome as any

// Mock chrome.runtime.sendMessage
chrome.runtime.sendMessage = vi.fn((_message: any, callback?: any) => {
  // 默认返回成功响应
  const response = {
    success: true,
    msg: '',
    data: {}
  }

  if (callback) {
    callback(response)
    return undefined
  }

  return Promise.resolve(response)
}) as any

// Mock chrome.tabs.sendMessage
chrome.tabs.sendMessage = vi.fn((_tabId: number, _message: any, callback?: any) => {
  const response = {
    success: true,
    msg: '',
    data: {}
  }

  if (callback) {
    callback(response)
    return undefined
  }

  return Promise.resolve(response)
}) as any

// Mock chrome.tabs.query
chrome.tabs.query = vi.fn(() => Promise.resolve([
  {
    id: 1,
    url: 'https://web.telegram.org/',
    active: true,
    currentWindow: true
  }
])) as any

// Mock chrome.storage.local
chrome.storage.local.get = vi.fn((_keys: any, callback?: any) => {
  const result = {}
  if (callback) {
    callback(result)
    return undefined
  }
  return Promise.resolve(result)
}) as any

chrome.storage.local.set = vi.fn((_data: any, callback?: any) => {
  if (callback) {
    callback()
    return undefined
  }
  return Promise.resolve()
}) as any

// Mock console 方法以减少测试输出
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}

// Mock CustomEvent (用于 content script 测试)
global.CustomEvent = class CustomEvent extends Event {
  detail: any

  constructor(type: string, options?: { detail?: any }) {
    super(type)
    this.detail = options?.detail
  }
} as any

// Mock document.dispatchEvent
const originalDispatchEvent = document.dispatchEvent
document.dispatchEvent = vi.fn((event: Event) => {
  // 对于 CustomEvent，允许正常触发
  if (event instanceof CustomEvent) {
    return originalDispatchEvent.call(document, event)
  }
  return true
}) as any

// 设置测试超时
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000
})
