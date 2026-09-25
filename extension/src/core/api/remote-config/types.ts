/**
 * 远端配置公共 API 类型。
 *
 * 后端只存「顶层分组稀疏覆盖」，客户端按分组名合并到包内默认值；不认识的分组与字段原样忽略。
 */

import type { JsonValue } from '@/core/rpc/types'

/** 远端配置的顶层分组稀疏覆盖对象。 */
export interface RemoteConfig {
  /** 分组名由消费该分组的客户端定义，未配置的分组不下发。 */
  readonly [group: string]: JsonValue | undefined
}
