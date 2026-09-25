/**
 * 远端分组配置 store 工厂。
 *
 * 每个 document 只读取一次远端稀疏覆盖，按顶层分组浅覆盖到包内默认值；读取失败保留默认值。
 * 因此配置改动在页面重新加载后生效，没有版本号、轮询或热更新，也不写 chrome.storage。
 */

import { API } from '@/core/api/config'
import type { RemoteConfig } from '@/core/api/remote-config'
import type { JsonObject, JsonValue } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'

/** 单个分组覆盖对象的类型约束。 */
type ConfigGroups = Record<string, object>

/** store 配置。 */
export interface RemoteConfigStoreOptions<TGroups extends ConfigGroups> {
  /**
   * 包内完整默认值，同时就是当前 document 的唯一生效运行态。
   *
   * 分组浅覆盖直接写在这份对象上，读取方始终读同一个引用。
   */
  defaults: TGroups
  /** 需要被远端覆盖的顶层分组名；不在列表里的分组永远保持包内默认值。 */
  groups: readonly (keyof TGroups & string)[]
  /**
   * 分组覆盖的字段级过滤；缺省时整组原样浅覆盖。
   *
   * 远端响应只保证顶层是对象，字段可能是写错的类型；需要逐字段校验的分组在这里过滤，
   * 让读到同一份生效配置的各个上下文用同一套规则。
   */
  pick?: (override: JsonObject) => object
  /** 读取远端顶层分组稀疏对象。 */
  loadRemote: () => Promise<RemoteConfig>
  /** 日志定位名称。 */
  label: string
}

/** 远端分组配置 store。 */
export interface RemoteConfigStore<TGroups extends ConfigGroups> {
  /** 每个 document 只发起一次读取；失败不抛出，返回生效值。 */
  load: () => Promise<TGroups>
  /** 同步读取当前生效值。 */
  get: () => TGroups
}

/**
 * 创建远端分组配置 store。
 *
 * 远端分组只做浅覆盖：缺项保留本地值、多余键原样保留；分组类型不符（数组、标量）时整组跳过，
 * 避免把非法形状写进生效配置；字段级校验由 `pick` 提供，不传则整组原样覆盖。
 */
export function createRemoteConfigStore<TGroups extends ConfigGroups>(
  options: RemoteConfigStoreOptions<TGroups>
): RemoteConfigStore<TGroups> {
  let loadPromise: Promise<TGroups> | null = null

  async function fetchConfig(): Promise<TGroups> {
    try {
      const remoteConfig = await options.loadRemote()
      for (const group of options.groups) {
        const override = remoteConfig[group]
        if (isJsonObject(override)) {
          Object.assign(options.defaults[group], options.pick ? options.pick(override) : override)
        }
      }
    } catch (error) {
      logger.error(
        `[${options.label}] 读取远端配置失败，使用扩展包默认值: endpoint=${API.ENDPOINTS.REMOTE_CONFIG}`,
        error
      )
    }

    return options.defaults
  }

  return {
    load(): Promise<TGroups> {
      loadPromise ??= fetchConfig()
      return loadPromise
    },
    get(): TGroups {
      return options.defaults
    }
  }
}

/** 判断远端分组是否为可浅覆盖的 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
