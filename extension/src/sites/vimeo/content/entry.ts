/**
 * Vimeo document_idle content 入口。
 */

import { startVimeoContent } from '.'

function start(): void {
  startVimeoContent()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
