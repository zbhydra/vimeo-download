/**
 * Playwright 浏览器身份基建。
 *
 * 目标不是承诺绕过第三方风控，而是消除测试运行时主动暴露的 Playwright/Headless
 * 标识，并保证 UA、Client Hints、平台字段来自同一套真实 Chrome 身份：
 * 1. 网页默认 E2E 使用本机稳定版 Google Chrome，避免 Playwright headless shell 身份。
 * 2. Extension Pro controlled 与 website identity 使用支持扩展的新 headless 完整 Chromium。
 * 3. 两类浏览器都移除 `--enable-automation` 并关闭 AutomationControlled 标记。
 * 4. 从实际稳定 Chrome 版本生成网页 UA，避免 device descriptor 与 Client Hints 漂移。
 * 5. 在文档脚本执行前修正 webdriver 与移动端 navigator.platform。
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Chrome 可执行文件显式覆盖环境变量。 */
const chromeExecutableOverride = process.env.E2E_CHROME_EXECUTABLE_PATH?.trim()

/** 返回当前系统上 Google Chrome 稳定版的候选路径。 */
function chromeExecutableCandidates() {
  if (chromeExecutableOverride) {
    return [path.resolve(chromeExecutableOverride)]
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(
        process.env.HOME ?? '',
        'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      )
    ]
  }

  if (process.platform === 'win32') {
    return [
      path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')
    ]
  }

  return [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/google-chrome',
    '/opt/google/chrome/chrome'
  ]
}

/** 定位稳定版 Chrome；缺失时直接失败，禁止静默退回会暴露 HeadlessChrome 的浏览器。 */
function resolveChromeExecutablePath() {
  const candidates = chromeExecutableCandidates().filter(Boolean)
  const executablePath = candidates.find(candidate => existsSync(candidate))
  if (executablePath) {
    return executablePath
  }

  throw new Error(
    `[E2E_CHROME_MISSING] 未找到 Google Chrome 稳定版；` +
      `checked=${candidates.join(',')} ` +
      `可通过 E2E_CHROME_EXECUTABLE_PATH 指定可执行文件`
  )
}

/** 从稳定版 Chrome 的 `--version` 输出解析完整版本。 */
function resolveChromeVersion(executablePath) {
  let output
  try {
    output = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8'
    }).trim()
  } catch (error) {
    console.error(error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_CHROME_VERSION_FAILED] 无法读取 Chrome 版本；executable=${executablePath} reason=${reason}`
    )
  }

  const match = output.match(/(\d+)\.\d+\.\d+\.\d+/)
  if (!match) {
    throw new Error(
      `[E2E_CHROME_VERSION_INVALID] Chrome 版本格式无法识别；executable=${executablePath} output=${output}`
    )
  }
  return match[1]
}

/** 延迟解析后的稳定 Chrome 身份；extension Chromium 不依赖系统 Chrome。 */
let stableChromeIdentity

/** 返回稳定 Chrome 可执行文件和主版本，并在同一进程内复用解析结果。 */
function getStableChromeIdentity() {
  if (!stableChromeIdentity) {
    const executablePath = resolveChromeExecutablePath()
    stableChromeIdentity = {
      executablePath,
      majorVersion: resolveChromeVersion(executablePath)
    }
  }
  return stableChromeIdentity
}

/** 按当前操作系统生成 UA 平台片段。 */
function desktopUserAgentPlatform() {
  if (process.platform === 'darwin') {
    return 'Macintosh; Intel Mac OS X 10_15_7'
  }
  if (process.platform === 'win32') {
    return 'Windows NT 10.0; Win64; x64'
  }
  return 'X11; Linux x86_64'
}

/**
 * 生成与本机稳定版 Chrome 主版本一致的 UA。
 *
 * @param {{ mobile?: boolean }} options UA 模式。
 * @returns {string} 桌面或 Android Chrome UA。
 */
export function createChromeUserAgent({ mobile = false } = {}) {
  const { majorVersion } = getStableChromeIdentity()
  const platform = mobile ? 'Linux; Android 11; Pixel 5' : desktopUserAgentPlatform()
  const mobileToken = mobile ? ' Mobile' : ''
  return (
    `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${majorVersion}.0.0.0${mobileToken} Safari/537.36`
  )
}

/**
 * 创建稳定版 Google Chrome 启动选项。
 *
 * @param {string[]} additionalArgs 调用方所需的扩展参数。
 * @returns {{ executablePath: string, ignoreDefaultArgs: string[], args: string[] }} Playwright 启动选项。
 */
export function createChromeLaunchOptions(additionalArgs = []) {
  const { executablePath } = getStableChromeIdentity()
  return {
    executablePath,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      ...additionalArgs
    ]
  }
}

/**
 * 创建支持 unpacked extension 的完整 Chromium headed 启动选项。
 *
 * 新版稳定 Google Chrome 会拒绝命令行 `--load-extension`，而 headless Chromium 又会暴露
 * HeadlessChrome 且不会可靠启动 MV3 service worker，因此插件 E2E 必须使用该 headed 模式。
 *
 * @param {string[]} additionalArgs Extension 加载参数。
 * @returns {{ channel: string, headless: boolean, ignoreDefaultArgs: string[], args: string[] }}
 *   Playwright 持久化 context 启动选项。
 */
export function createExtensionChromiumLaunchOptions(additionalArgs = []) {
  return {
    channel: 'chromium',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      ...additionalArgs
    ]
  }
}

/**
 * 创建完整 Chromium 新 headless 启动选项。
 *
 * `channel: chromium` 强制 Playwright 使用完整 Chromium，而不是不支持 unpacked extension
 * 的 headless shell；浏览器保留标准 HeadlessChrome 身份，不覆盖原生 UA。
 *
 * @param {string[]} additionalArgs 调用方所需的扩展参数。
 * @returns {{ channel: string, headless: boolean, ignoreDefaultArgs: string[], args: string[] }}
 *   Playwright 启动选项。
 */
export function createHeadlessChromiumLaunchOptions(additionalArgs = []) {
  return {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      ...additionalArgs
    ]
  }
}

/**
 * 创建使用原生桌面 UA 的完整 Chromium 新 headless project 配置。
 *
 * @param {Record<string, object | string | number | boolean>} device Playwright device descriptor。
 * @returns {Record<string, object | string | number | boolean>} project `use` 配置。
 */
export function createHeadlessChromiumProjectUse(device) {
  const options = { ...device }
  delete options.userAgent
  return {
    ...options,
    locale: 'en-US',
    launchOptions: createHeadlessChromiumLaunchOptions()
  }
}

/**
 * 把 Playwright Chromium device descriptor 收敛到真实稳定版 Chrome 身份。
 *
 * @param {Record<string, object | string | number | boolean>} device Playwright device descriptor。
 * @param {{ mobile?: boolean }} options 是否保留 Android 移动端身份。
 * @returns {Record<string, object | string | number | boolean>} project `use` 配置。
 */
export function createChromiumProjectUse(device, { mobile = false } = {}) {
  return {
    ...device,
    userAgent: createChromeUserAgent({ mobile }),
    locale: 'en-US',
    launchOptions: createChromeLaunchOptions()
  }
}

/**
 * Firefox/WebKit 使用运行中浏览器自己的 UA，避免 Playwright descriptor 的 Windows UA
 * 与实际 macOS/Linux navigator.platform 互相矛盾。
 *
 * @param {Record<string, object | string | number | boolean>} device Playwright device descriptor。
 * @returns {Record<string, object | string | number | boolean>} project `use` 配置。
 */
export function createNativeBrowserProjectUse(device) {
  const options = { ...device }
  delete options.userAgent
  return { ...options, locale: 'en-US' }
}

/**
 * 在第三方页面脚本之前修正浏览器可见的自动化字段。
 *
 * getter 使用原生 getter 的 Proxy，保留属性存在性、descriptor 与 native code 外观；直接
 * 删除 webdriver 反而会偏离现代浏览器的正常形态。
 *
 * @param {object} context Playwright BrowserContext。
 * @param {{ mobile?: boolean }} options 是否模拟 Android Chrome。
 * @returns {Promise<void>} init script 安装完成。
 */
export async function installE2eBrowserIdentity(context, { mobile = false } = {}) {
  await context.addInitScript(
    ({ navigatorPlatform }) => {
      const replaceNativeGetter = (target, property, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(target, property)
        if (!descriptor?.configurable || typeof descriptor.get !== 'function') {
          return
        }
        Object.defineProperty(target, property, {
          ...descriptor,
          get: new Proxy(descriptor.get, {
            apply: () => value
          })
        })
      }

      const navigatorPrototype = Object.getPrototypeOf(navigator)
      replaceNativeGetter(navigatorPrototype, 'webdriver', false)
      if (navigatorPlatform) {
        replaceNativeGetter(navigatorPrototype, 'platform', navigatorPlatform)
      }

      const removePlaywrightGlobals = () => {
        Reflect.deleteProperty(globalThis, '__playwright__binding__')
        Reflect.deleteProperty(globalThis, '__pwInitScripts')
      }
      removePlaywrightGlobals()
      queueMicrotask(removePlaywrightGlobals)
    },
    { navigatorPlatform: mobile ? 'Linux armv81' : '' }
  )
}

/**
 * 为一个 spec 文件注册浏览器身份初始化 hook。
 *
 * @param {object} test Playwright test API。
 */
export function registerE2eBrowserIdentity(test) {
  test.beforeEach(async ({ context }, testInfo) => {
    await installE2eBrowserIdentity(context, {
      mobile: testInfo.project.metadata.browserIdentityMobile === true
    })
  })
}

/**
 * 断言当前页面不暴露已知 Playwright 身份；页面只访问当前项目的本地 baseURL。
 *
 * @param {object} page Playwright Page。
 * @param {object} testInfo Playwright TestInfo。
 * @param {Function} expect Playwright expect API。
 * @param {string} [navigationUrl='/'] 身份门禁使用的同源导航地址。
 * @returns {Promise<void>} 身份检查完成。
 */
export async function expectE2eBrowserIdentity(page, testInfo, expect, navigationUrl = '/') {
  const documentRequestPromise = page.waitForRequest(
    request => request.isNavigationRequest() && request.frame() === page.mainFrame()
  )
  await page.goto(navigationUrl)
  const documentRequest = await documentRequestPromise
  const headers = await documentRequest.allHeaders()
  const identity = await page.evaluate(() => {
    const navigatorPrototype = Object.getPrototypeOf(navigator)
    const webdriverGetter = Object.getOwnPropertyDescriptor(navigatorPrototype, 'webdriver')?.get
    const userAgentData = navigator.userAgentData

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      webdriver: navigator.webdriver,
      hasWebdriver: 'webdriver' in navigator,
      webdriverGetterSource: webdriverGetter
        ? Function.prototype.toString.call(webdriverGetter)
        : '',
      playwrightBinding: '__playwright__binding__' in globalThis,
      playwrightInitScripts: '__pwInitScripts' in globalThis,
      userAgentData: userAgentData
        ? {
            brands: userAgentData.brands,
            mobile: userAgentData.mobile,
            platform: userAgentData.platform
          }
        : null
    }
  })

  expect(identity.webdriver).toBe(false)
  expect(identity.hasWebdriver).toBe(true)
  expect(identity.webdriverGetterSource).toContain('[native code]')
  expect(identity.playwrightBinding).toBe(false)
  expect(identity.playwrightInitScripts).toBe(false)
  const browserVersion = page.context().browser()?.version()
  const headlessChromiumIdentity =
    testInfo.project.metadata.browserIdentityHeadlessChromium === true
  if (headlessChromiumIdentity) {
    const browserMajorVersion = browserVersion?.match(/^(\d+)\./)?.[1]
    expect(browserMajorVersion).toBeTruthy()
    expect(identity.userAgent).toMatch(
      new RegExp(` HeadlessChrome/${browserMajorVersion}\\.0\\.0\\.0 Safari/537\\.36$`)
    )
    expect(headers['user-agent']).toBe(identity.userAgent)
  } else {
    expect(identity.userAgent).not.toMatch(/HeadlessChrome|Playwright/i)
    expect(JSON.stringify(headers)).not.toMatch(/HeadlessChrome|Playwright/i)
  }
  expect(identity.userAgent).not.toMatch(/Playwright/i)
  expect(JSON.stringify(headers)).not.toMatch(/Playwright/i)
  expect(JSON.stringify(identity.userAgentData)).not.toMatch(/HeadlessChrome|Playwright/i)
  expect(headers['user-agent']).toBe(identity.userAgent)

  const expectedPlatform = expectedPlatformIdentity(identity.userAgent)
  expect(identity.platform).toBe(expectedPlatform.navigator)
  const chromeMajorVersion = identity.userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1]

  if (chromeMajorVersion) {
    expect(identity.userAgentData).not.toBeNull()
  }

  if (identity.userAgentData) {
    expect(identity.userAgentData.mobile).toBe(expectedPlatform.mobile)
    expect(identity.userAgentData.platform).toBe(expectedPlatform.clientHints)
    expect(headers['sec-ch-ua-mobile']).toBe(expectedPlatform.mobile ? '?1' : '?0')
    expect(headers['sec-ch-ua-platform']).toBe(JSON.stringify(expectedPlatform.clientHints))

    if (chromeMajorVersion) {
      const requestBrands = parseSecChUaBrands(headers['sec-ch-ua'])
      expect(requestBrands).toEqual(identity.userAgentData.brands)

      const browserBrands = requestBrands.filter(brand =>
        /^(?:Chromium|Google Chrome)$/.test(brand.brand)
      )
      expect(browserBrands.length).toBeGreaterThan(0)
      for (const brand of browserBrands) {
        expect(brand.version).toBe(chromeMajorVersion)
      }
    }
  }

  if (testInfo.project.metadata.browserIdentityMobile === true) {
    expect(identity.userAgent).toContain('Android 11')
  }
}

/**
 * 解析实际导航请求的低熵 UA brands。
 *
 * @param {string | undefined} headerValue `sec-ch-ua` 请求头。
 * @returns {{ brand: string, version: string }[]} 请求头声明的 brand/version。
 */
function parseSecChUaBrands(headerValue) {
  if (!headerValue) {
    return []
  }

  return Array.from(headerValue.matchAll(/"([^"]+)";v="([^"]+)"/g), match => ({
    brand: match[1],
    version: match[2]
  }))
}

/**
 * 从 UA 推导 navigator 与 Client Hints 必须共同表达的平台身份。
 *
 * @param {string} userAgent 当前 document 的 UA。
 * @returns {{ navigator: string, clientHints: string, mobile: boolean }} 一致平台合同。
 */
function expectedPlatformIdentity(userAgent) {
  if (userAgent.includes('Android')) {
    return { navigator: 'Linux armv81', clientHints: 'Android', mobile: true }
  }
  if (userAgent.includes('Windows')) {
    return { navigator: 'Win32', clientHints: 'Windows', mobile: false }
  }
  if (userAgent.includes('Macintosh')) {
    return { navigator: 'MacIntel', clientHints: 'macOS', mobile: false }
  }
  if (userAgent.includes('Linux')) {
    return { navigator: 'Linux x86_64', clientHints: 'Linux', mobile: false }
  }

  throw new Error(`[E2E_BROWSER_IDENTITY_PLATFORM_UNSUPPORTED] userAgent=${userAgent}`)
}
