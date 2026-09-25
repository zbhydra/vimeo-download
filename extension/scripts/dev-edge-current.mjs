/**
 * 使用当前正在运行的 Microsoft Edge 调试插件。
 *
 * 这个脚本不启动新浏览器、不创建新 profile：Vite 只负责 watch 构建 dist，
 * 构建产物变化后通过当前 Edge 暴露的 CDP 端口重新 load unpacked extension。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const extensionRoot = resolve(scriptDir, '..')
const distDir = join(extensionRoot, 'dist')
const reloadScript = join(scriptDir, 'reload-edge-current-extension.mjs')
const devToolsPortFile = join(
  process.env.HOME || '',
  'Library/Application Support/Microsoft Edge/DevToolsActivePort'
)
const reloadDebounceMs = 800

let reloadTimer = undefined
let reloadRunning = false
let reloadPending = false
let stdoutTail = ''

function fail(message) {
  console.error(`[extension dev] ${message}`)
  process.exit(1)
}

async function assertCurrentEdgeDebuggable() {
  if (!existsSync(devToolsPortFile)) {
    fail(
      [
        '当前 Edge 没有可用的 DevToolsActivePort。',
        '要直接用正在运行的 Edge，必须先让 Edge 以 --remote-debugging-port=9222 运行。'
      ].join('\n')
    )
  }

  const [port, browserPath] = readFileSync(devToolsPortFile, 'utf8').trim().split(/\r?\n/)
  if (!port || !browserPath) {
    throw new Error(`Edge DevToolsActivePort 内容无效: ${devToolsPortFile}`)
  }
}

function runReload() {
  if (reloadRunning) {
    reloadPending = true
    return
  }

  reloadRunning = true
  const child = spawn(process.execPath, [reloadScript], {
    cwd: extensionRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      EXTENSION_DIST_DIR: distDir
    }
  })

  child.on('exit', () => {
    reloadRunning = false
    if (reloadPending) {
      reloadPending = false
      queueReload()
    }
  })
}

function queueReload() {
  if (reloadTimer) {
    clearTimeout(reloadTimer)
  }

  reloadTimer = setTimeout(runReload, reloadDebounceMs)
}

try {
  await assertCurrentEdgeDebuggable()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

console.info('[extension dev] 使用当前 Microsoft Edge，构建完成后自动 reload 本地扩展。')

const vite = spawn('vite', ['build', '--watch', '--mode', 'development'], {
  cwd: extensionRoot,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'development',
    EXTENSION_DEV_BROWSER: 'edge-current'
  }
})

vite.stdout.on('data', chunk => {
  const text = chunk.toString()
  process.stdout.write(text)
  stdoutTail = `${stdoutTail}${text}`.slice(-200)

  if (stdoutTail.includes('All steps completed')) {
    stdoutTail = ''
    queueReload()
  }
})

vite.stderr.on('data', chunk => {
  process.stderr.write(chunk)
})

vite.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
