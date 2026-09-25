/**
 * Vimeo MAIN world injected 入口。
 */

import { markInjectedReady } from '@/core/rpc/injectedReady'
import { startVimeoInjected } from '.'

try {
  startVimeoInjected()
  markInjectedReady()
} catch (error) {
  console.error(error)
  throw error
}
