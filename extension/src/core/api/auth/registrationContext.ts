/**
 * 插件首次注册归因的读取与投递。
 *
 * 设备身份由 background 初始化，popup 与 background 都只读不写；读取与校验只在
 * `core/storage/deviceIdentity` 实现一次，这里只负责把结果放进请求体或回跳地址。
 */

import {
  readStoredDeviceIdentity,
  toRegistrationDeviceIdentity
} from '../../storage/deviceIdentity'

/** 首次注册归因，字段与后端 RegistrationContext 一一对应。 */
export interface ExtensionRegistrationContext {
  /** 注册入口，插件固定为 extension_v3。 */
  registration_entry: 'extension_v3'
  /** 插件本地设备 ID；与 first_opened_at 必须成对出现。 */
  register_device_id: string | null
  /** 设备首次观测打开时间（毫秒）。 */
  first_opened_at: number | null
}

/** 回跳地址携带设备归因的参数名，与后端字段一致。 */
export const REGISTRATION_DEVICE_ID_PARAM = 'register_device_id'
export const REGISTRATION_FIRST_OPENED_AT_PARAM = 'first_opened_at'

/** 读取插件本地注册归因。 */
export async function getExtensionRegistrationContext(): Promise<ExtensionRegistrationContext> {
  const deviceIdentity = toRegistrationDeviceIdentity(await readStoredDeviceIdentity())

  return {
    registration_entry: 'extension_v3',
    register_device_id: deviceIdentity?.device_id ?? null,
    first_opened_at: deviceIdentity?.first_opened_at ?? null
  }
}

/**
 * 把设备归因写进回跳地址的查询串。
 *
 * 设备身份不完整时不携带任何归因字段，由后端按未知来源统计。
 */
export function setRegistrationContextParams(
  url: URL,
  context: ExtensionRegistrationContext
): void {
  if (context.register_device_id === null || context.first_opened_at === null) {
    return
  }

  url.searchParams.set(REGISTRATION_DEVICE_ID_PARAM, context.register_device_id)
  url.searchParams.set(REGISTRATION_FIRST_OPENED_AT_PARAM, String(context.first_opened_at))
}
