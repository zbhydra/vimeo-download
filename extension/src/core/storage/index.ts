import { logger } from '../utils/logger'

type StoragePrimitive = string | number | boolean | null
export type StorageValue = StoragePrimitive | StorageValue[] | { [key: string]: StorageValue }

// 统一存储管理接口
export interface StorageManager {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  setMany(items: Record<string, StorageValue>): Promise<void>
  remove(key: string): Promise<void>
  getAll(): Promise<Record<string, StorageValue>>
  onChanged<T>(key: string, callback: (newValue: T, oldValue: T | undefined) => void): () => void
}

// Chrome 扩展存储实现
export class ChromeStorageManager implements StorageManager {
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await chrome.storage.local.get(key)
      const value = result[key] as T | undefined
      return value ?? null
    } catch (error) {
      logger.error(`Failed to get ${key} from storage:`, error)
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value })
    } catch (error) {
      logger.error(`Failed to set ${key} in storage:`, error)
      throw error
    }
  }

  async setMany(items: Record<string, StorageValue>): Promise<void> {
    try {
      await chrome.storage.local.set(items)
    } catch (error) {
      logger.error('Failed to set multiple keys in storage:', error)
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key)
    } catch (error) {
      logger.error(`Failed to remove ${key} from storage:`, error)
      throw error
    }
  }

  async getAll(): Promise<Record<string, StorageValue>> {
    try {
      return await chrome.storage.local.get<Record<string, StorageValue>>(null)
    } catch (error) {
      logger.error('Failed to get all from storage:', error)
      return {}
    }
  }

  onChanged<T>(key: string, callback: (newValue: T, oldValue: T | undefined) => void): () => void {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[key]) {
        callback(changes[key].newValue as T, changes[key].oldValue as T | undefined)
      }
    }

    chrome.storage.onChanged.addListener(listener)

    // 返回移除监听器的函数
    return () => chrome.storage.onChanged.removeListener(listener)
  }
}

// 全局存储管理器实例
export const storageManager = new ChromeStorageManager()
