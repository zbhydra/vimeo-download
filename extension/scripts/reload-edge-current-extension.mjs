/**
 * 通过当前 Microsoft Edge 的 CDP 端口重新加载本地 unpacked extension。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const distDir = process.env.EXTENSION_DIST_DIR || resolve('dist')
const devToolsPortFile =
  process.env.EXTENSION_EDGE_DEVTOOLS_PORT_FILE ||
  join(homedir(), 'Library/Application Support/Microsoft Edge/DevToolsActivePort')
const reloadTimeoutMs = 15_000

function readBrowserWebSocketUrl() {
  if (!existsSync(devToolsPortFile)) {
    throw new Error(`找不到 Edge DevToolsActivePort: ${devToolsPortFile}`)
  }

  const [port, browserPath] = readFileSync(devToolsPortFile, 'utf8').trim().split(/\r?\n/)
  if (!port || !browserPath) {
    throw new Error(`Edge DevToolsActivePort 内容无效: ${devToolsPortFile}`)
  }

  return `ws://127.0.0.1:${port}${browserPath}`
}

function sendCdpCommand(socket, id, method, params) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      rejectPromise(new Error(`${method} 超时 ${reloadTimeoutMs}ms`))
    }, reloadTimeoutMs)

    function onMessage(event) {
      const message = JSON.parse(event.data)
      if (message.id !== id) {
        return
      }

      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)

      if (message.error) {
        rejectPromise(new Error(`${method}: ${message.error.message}`))
        return
      }

      resolvePromise(message.result)
    }

    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function reloadExtension() {
  if (!existsSync(join(distDir, 'manifest.json'))) {
    throw new Error(`dist 中找不到 manifest.json: ${distDir}`)
  }

  const socket = new WebSocket(readBrowserWebSocketUrl())

  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`连接当前 Edge CDP 超时 ${reloadTimeoutMs}ms`))
    }, reloadTimeoutMs)

    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolvePromise(undefined)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      rejectPromise(new Error('连接当前 Edge CDP 失败'))
    })
  })

  try {
    const result = await sendCdpCommand(socket, 1, 'Extensions.loadUnpacked', {
      path: distDir
    })
    console.info(`[extension dev] 已 reload 当前 Edge 本地扩展: ${result.id}`)
  } finally {
    socket.close()
  }
}

try {
  await reloadExtension()
} catch (error) {
  console.error(`[extension dev] reload 当前 Edge 本地扩展失败: ${error}`)
  process.exit(1)
}
