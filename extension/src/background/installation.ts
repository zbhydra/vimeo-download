/** Background 持有安装身份；并发启动、打点与登录共用一次初始化。 */
import { STORAGE_KEYS } from '@/core/api/config'
import { storageManager } from '@/core/storage'
import {
  normalizeStoredDeviceIdentity,
  type RegistrationDeviceIdentity
} from '@/core/storage/deviceIdentity'

interface Installation extends RegistrationDeviceIdentity {
  /** 首次观测到 background 启动的毫秒时间；旧安装补记时不代表安装时间。 */
  first_opened_at: number
}

let installationPromise: Promise<Installation> | null = null

/** 返回持久化安装身份，初始化失败时允许下一次操作重试。 */
export function getInstallation(): Promise<Installation> {
  installationPromise ??= initializeInstallation().catch(error => {
    installationPromise = null
    throw error
  })
  return installationPromise
}

async function initializeInstallation(): Promise<Installation> {
  // 读取失败必须中止，不能把读取异常当成首次安装而覆盖原身份；
  // 这里刻意不用 storageManager.get，它会把读取异常吞成 null。
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.DEVICE_ID,
    STORAGE_KEYS.FIRST_OPENED_AT
  ])
  const identity = normalizeStoredDeviceIdentity(
    stored[STORAGE_KEYS.DEVICE_ID] as string | null | undefined,
    stored[STORAGE_KEYS.FIRST_OPENED_AT] as number | null | undefined
  )
  const device_id = identity.device_id ?? crypto.randomUUID()
  const first_opened_at = identity.first_opened_at ?? Date.now()
  if (
    stored[STORAGE_KEYS.DEVICE_ID] !== device_id ||
    stored[STORAGE_KEYS.FIRST_OPENED_AT] !== first_opened_at
  ) {
    await storageManager.setMany({
      [STORAGE_KEYS.DEVICE_ID]: device_id,
      [STORAGE_KEYS.FIRST_OPENED_AT]: first_opened_at
    })
  }
  return { device_id, first_opened_at }
}
