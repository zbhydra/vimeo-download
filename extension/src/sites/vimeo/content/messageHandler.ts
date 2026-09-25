/**
 * Vimeo content RPC handler。
 *
 * Popup 查询缓存并按资源 ID 发起下载。
 */

import { MessageHandler } from '@/content/MessageHandler'
import { vimeoResourceBuffer } from './resourceBuffer'

/** Vimeo content RPC handler。 */
class VimeoMessageHandler extends MessageHandler {
  /** 站点名。 */
  protected readonly siteName = 'vimeo'

  /** Vimeo 资源缓存。 */
  protected readonly resourceBuffer = vimeoResourceBuffer
}

/** Vimeo content RPC handler 单例。 */
export const vimeoMessageHandler = new VimeoMessageHandler()
