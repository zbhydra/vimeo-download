/**
 * 插件设备身份的读取、校验与后端提交形态。
 *
 * `device_id` 与 `first_opened_at` 只由 background 初始化写入（见 `background/installation.ts`），
 * 其他上下文只读；「读两键 + 校验」只在这里实现一次，避免同一份身份出现两套规则。
 *
 * 两层判定并存是有意的，不是一个值两种校验：
 * - 本地可用性（`normalizeStoredDeviceIdentity`）：非空字符串 / 正整数时间戳即可沿用，
 *   旧安装的既有 device_id 不因为形态陈旧而丢失连续性。
 * - 后端可用性（`toRegistrationDeviceIdentity`）：后端 RegistrationContext 对字段形态有硬约束，
 *   只有满足它的子集才允许提交，否则整体留空（少记统计，不影响登录）。
 */

import { STORAGE_KEYS } from '../api/config'
import { storageManager } from './index'

/** 后端 RegistrationContext 要求的设备 ID 形态。 */
const REGISTRATION_DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 后端 RegistrationContext 要求的最早首次打开时间（2001-09-09，毫秒）。 */
const REGISTRATION_MIN_FIRST_OPENED_AT = 1_000_000_000_000

/** 本地存储里的设备身份字段；缺失或形态不符时为 null。 */
export interface StoredDeviceIdentity {
  /** 插件本地设备 ID。 */
  device_id: string | null
  /** 设备首次观测打开时间（毫秒）。 */
  first_opened_at: number | null
}

/** 可提交给后端的设备身份。 */
export interface RegistrationDeviceIdentity {
  /** 插件本地设备 ID。 */
  device_id: string
  /** 设备首次观测打开时间（毫秒）。 */
  first_opened_at: number
}

/** 规范化存储里的设备身份字段，形态不符按缺失处理。 */
export function normalizeStoredDeviceIdentity(
  deviceId: string | null | undefined,
  firstOpenedAt: number | null | undefined
): StoredDeviceIdentity {
  return {
    device_id: typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : null,
    first_opened_at:
      typeof firstOpenedAt === 'number' && Number.isSafeInteger(firstOpenedAt) && firstOpenedAt > 0
        ? firstOpenedAt
        : null
  }
}

/** 读取存储中的设备身份字段；读取异常由 storageManager 记录后按缺失处理。 */
export async function readStoredDeviceIdentity(): Promise<StoredDeviceIdentity> {
  const deviceId = await storageManager.get<string>(STORAGE_KEYS.DEVICE_ID)
  const firstOpenedAt = await storageManager.get<number>(STORAGE_KEYS.FIRST_OPENED_AT)
  return normalizeStoredDeviceIdentity(deviceId, firstOpenedAt)
}

/** 收敛成后端可接受的注册归因；任一字段不满足后端形态时返回 null。 */
export function toRegistrationDeviceIdentity(
  stored: StoredDeviceIdentity
): RegistrationDeviceIdentity | null {
  if (
    stored.device_id === null ||
    !REGISTRATION_DEVICE_ID_PATTERN.test(stored.device_id) ||
    stored.first_opened_at === null ||
    stored.first_opened_at < REGISTRATION_MIN_FIRST_OPENED_AT
  ) {
    return null
  }

  return { device_id: stored.device_id, first_opened_at: stored.first_opened_at }
}
