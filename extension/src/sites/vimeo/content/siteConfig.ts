/**
 * Vimeo content 远端配置接入。
 *
 * 每个 document 只读一次远端稀疏覆盖，浅覆盖进包内默认值后再同步给 MAIN world；
 * 任一环节失败只记录日志，页面继续用扩展包默认值工作。
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { injectedClient } from '@/content/rpc/injectedClient'
import { createRemoteConfigStore } from '@/core/remoteConfig/createRemoteConfigStore'
import { logger } from '@/core/utils/logger'
import { pickVimeoConfig, vimeoConfig } from '@/sites/vimeo/runtimeConfig'

const backgroundClient = new BackgroundChannel()

/** Vimeo 配置在远端稀疏对象里的顶层分组名。 */
const vimeoConfigStore = createRemoteConfigStore({
  defaults: { vimeo: vimeoConfig },
  groups: ['vimeo'],
  pick: override => pickVimeoConfig(override),
  label: 'VimeoConfig',
  loadRemote: () => backgroundClient.getRemoteConfig()
})

/**
 * 读取远端 Vimeo 配置并把生效值同步给 MAIN world。
 *
 * 远端响应在此按已知字段过滤（与 MAIN world 同一套规则）：类型非法时只丢弃该字段并保留默认值，
 * 内存上限判定不会用到脏值。MAIN world 仍会再校验一次 applySiteConfig 的请求体，因为它经
 * EventRpc 传输、可被页面伪造。
 */
export async function synchronizeVimeoConfig(): Promise<void> {
  await vimeoConfigStore.load()

  try {
    await injectedClient.applySiteConfig(vimeoConfig)
  } catch (error) {
    logger.error('[VimeoContentConfig] 向 injected 同步 Vimeo 配置失败:', error)
  }
}
