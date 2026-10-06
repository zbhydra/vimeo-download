import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LANGUAGE_SITEMAP_LOCALES } from '../src/sitemap/languageSitemap.mjs'
import {
  CHROME_WEB_STORE_URL,
  DEVELOPER_EMAIL,
  OFFICIAL_X_HANDLE,
  OFFICIAL_X_URL,
  PRODUCT_NAME,
  SITE_HOST,
  SITE_ORIGIN
} from '../src/lib/site.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const repoDir = path.resolve(__dirname, '..')
const tempRootDir = path.join(repoDir, 'tmp')
const execFileAsync = promisify(execFile)
/** 评价入口 = 插件商店地址 + /reviews；商店地址取自唯一定义点 src/lib/site.mjs。 */
const CHROME_REVIEW_BASE_URL = CHROME_WEB_STORE_URL

const GOOGLE_TEST_REQUEST_CONTEXT = {
  deviceId: 'test-google-device',
  token: null
}

/** 预置到假 localStorage 的首次打开时间；固定值让注册归因请求体可精确比对。 */
const GOOGLE_TEST_FIRST_OPENED_AT = 1788000000000

/** 注册归因三字段由 src/scripts/runtime/auth.ts 的 getRegistrationContext 统一提供。 */
const GOOGLE_TEST_REGISTRATION_BODY = {
  registration_entry: null,
  register_device_id: GOOGLE_TEST_REQUEST_CONTEXT.deviceId,
  first_opened_at: GOOGLE_TEST_FIRST_OPENED_AT
}

async function createTempDir(prefix) {
  await mkdir(tempRootDir, { recursive: true })
  return mkdtemp(path.join(tempRootDir, prefix))
}

async function collectHtmlFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const htmlFiles = []

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      htmlFiles.push(...(await collectHtmlFiles(fullPath)))
      continue
    }

    if (entry.isFile() && fullPath.endsWith('.html')) {
      htmlFiles.push(fullPath)
    }
  }

  return htmlFiles
}

function extractTagValues(xml, tagName) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, 'g'))).map(
    (match) => match[1]
  )
}

function extractCanonicalUrl(html) {
  const match = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)
  return match?.[1] ?? ''
}

function extractRobotsMeta(html) {
  const match = html.match(/<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i)
  return match?.[1] ?? ''
}

function extractTagWithAttribute(html, attribute) {
  const match = html.match(new RegExp(`<[^>]+\\s${attribute}(?:[\\s=>][^>]*)?>`, 'i'))
  assert.ok(match, `Expected built HTML to include [${attribute}]`)
  return match[0]
}

function tagHasBooleanAttribute(tag, attribute) {
  return new RegExp(`\\s${attribute}(?:[\\s=>]|$)`, 'i').test(tag)
}

async function flushBrowserTasks() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function readUiRecord(source, exportName) {
  const recordMatch = source.match(new RegExp(`export const ${exportName}:[\\s\\S]*?= \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(recordMatch, `Expected src/i18n/ui.ts to export ${exportName}`)
  return new Map(
    Array.from(recordMatch[1].matchAll(/'([^']+)': '([^']*)'/g)).map((match) => [
      match[1],
      match[2]
    ])
  )
}

async function collectCanonicalUrls() {
  const htmlFiles = await collectHtmlFiles(distDir)
  const canonicalUrls = new Set()

  for (const filePath of htmlFiles) {
    const html = await readFile(filePath, 'utf8')
    const canonicalUrl = extractCanonicalUrl(html)
    assert.ok(canonicalUrl, `Expected ${path.relative(distDir, filePath)} to include canonical URL`)
    if (extractRobotsMeta(html).toLowerCase().includes('noindex')) {
      continue
    }
    canonicalUrls.add(canonicalUrl)
  }

  return canonicalUrls
}

test('Nginx configs canonicalize every built directory route directly to HTTPS', async () => {
  const configPaths = ['deploy/vimeo-web.conf', 'deploy/vimeo-web-test.conf']
  const htmlFiles = await collectHtmlFiles(distDir)
  const builtDirectoryRoutes = htmlFiles
    .filter((filePath) => path.basename(filePath) === 'index.html')
    .map((filePath) => {
      const relativeDirectory = path.relative(distDir, path.dirname(filePath))
      return relativeDirectory === '' ? '/' : `/${relativeDirectory.split(path.sep).join('/')}`
    })
    .filter((routePath) => routePath !== '/')

  assert.ok(builtDirectoryRoutes.length > 0, 'Expected the build to contain directory routes')

  for (const configPath of configPaths) {
    const source = await readFile(path.join(repoDir, configPath), 'utf8')
    const canonicalLocation = source.match(
      /location ~ "([^"]+)" \{\s*if \(-f \$request_filename\/index\.html\) \{\s*return 301 https:\/\/\$host\$uri\/\$is_args\$args;\s*\}\s*\}/
    )

    assert.ok(
      canonicalLocation,
      `Expected ${configPath} to canonicalize built index pages with one explicit HTTPS redirect`
    )

    const routePattern = new RegExp(canonicalLocation[1])
    assert.equal(routePattern.test('/a'), true)
    assert.equal(routePattern.test('/'), false)
    assert.equal(routePattern.test('/about/'), false)

    for (const routePath of builtDirectoryRoutes) {
      assert.equal(
        routePattern.test(routePath),
        true,
        `Expected ${configPath} to cover built route without trailing slash: ${routePath}`
      )
    }

    assert.equal(source.includes('features|guide|solutions|faq'), false)
  }
})

test('built pages do not reference TypeScript module scripts', async () => {
  const htmlFiles = await collectHtmlFiles(distDir)

  for (const filePath of htmlFiles) {
    const html = await readFile(filePath, 'utf8')
    const matches = Array.from(
      html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+\.ts(?:\?[^"]*)?)"[^>]*><\/script>/g)
    )

    assert.equal(
      matches.length,
      0,
      `Expected ${path.relative(distDir, filePath)} to avoid TypeScript module scripts, found: ${matches.map((match) => match[1]).join(', ')}`
    )
  }
})

test('language switch URL keeps the current query parameters', async () => {
  const { module, cleanup } = await importCompiledTypescriptModule(
    'src/scripts/site/language-switcher.ts',
    'language-switcher.js',
    'language-switcher-'
  )

  try {
    assert.equal(
      module.buildLanguageSwitchUrl(
        '/zh-cn/ext-pricing/',
        `${SITE_ORIGIN}/ext-pricing/?utm_source=extension&source=upgrade_modal`
      ),
      '/zh-cn/ext-pricing/?utm_source=extension&source=upgrade_modal'
    )
    assert.equal(
      module.buildLanguageSwitchUrl(
        '/ext-pricing/',
        `${SITE_ORIGIN}/zh-cn/ext-pricing/`
      ),
      '/ext-pricing/'
    )
  } finally {
    await cleanup()
  }
})

test('homepage keeps fonts and route CSS off the critical path while preserving analytics', async () => {
  const html = await readFile(path.join(distDir, 'index.html'), 'utf8')

  assert.equal(html.includes('fonts.googleapis.com'), false)
  assert.equal(html.includes('fonts.gstatic.com'), false)
  assert.match(
    html,
    /<script\b(?=[^>]*\basync\b)(?=[^>]*src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-LBSKJD0H16")[^>]*>/i
  )
  assert.equal((html.match(/xyfmieibkw/g) ?? []).length, 1)
  assert.equal(/<link\b[^>]+rel="stylesheet"/i.test(html), false)
  assert.equal(html.includes('data-defer-download-runtime="true"'), true)
})

test('every locale homepage has one H1, eight ordered sections and valid structured data', async () => {
  const sectionIds = [
    'home-intro',
    'home-features',
    'home-steps',
    'home-comparison',
    'home-scope',
    'home-plans',
    'home-faq',
    'home-final-cta'
  ]
  // 展示区文案不得出现的内容：积分 / 签到 / 额度数字 / 价格（两者都来自后端配置，不写进静态文案）。
  const forbiddenCopy = /credits?\b|check-?in|积分|積分|签到|簽到|[$€£¥￥₩₫฿₽]|\b(USD|EUR|GBP|JPY|CNY)\b/i

  for (const language of LANGUAGE_SITEMAP_LOCALES) {
    const languagePath = language.pathPrefix ? `${language.pathPrefix}/` : ''
    const html = await readFile(path.join(distDir, languagePath, 'index.html'), 'utf8')
    const label = language.locale

    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${label}: expected exactly one H1`)

    const positions = sectionIds.map((id) => html.indexOf(`id="${id}-heading"`))
    for (const [index, position] of positions.entries()) {
      assert.notEqual(position, -1, `${label}: missing section ${sectionIds[index]}`)
    }
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
      `${label}: sections are out of order`
    )
    // 8 个展示区块各一个 H2（插件展示在 hero 舞台里，标题类名是 home-intro-heading；收尾 CTA 是舞台卡，标题类名是 home-cta-heading）；弹窗标题（等待窗、确认窗）不属于展示区块，不计入。
    assert.equal(
      (html.match(/<h2\b[^>]*class="home-(?:section|intro|cta)-heading"/g) ?? []).length,
      sectionIds.length,
      `${label}: expected one section H2 per section`
    )

    const schemas = Array.from(
      html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
    ).map((match) => JSON.parse(match[1]))
    const types = schemas.map((schema) => schema['@type'])
    assert.equal(types.includes('WebApplication'), false, `${label}: WebApplication must not be emitted`)

    const software = schemas.find((schema) => schema['@type'] === 'SoftwareApplication')
    assert.ok(software, `${label}: missing SoftwareApplication`)
    assert.equal(software.applicationCategory, 'BrowserExtension')
    assert.ok(software.featureList.length >= 8 && software.featureList.every((item) => item.trim()))

    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage')
    assert.ok(faq, `${label}: missing FAQPage`)
    assert.ok(faq.mainEntity.length > 0)
    for (const question of faq.mainEntity) {
      assert.equal(question['@type'], 'Question')
      assert.ok(question.name.trim() && question.acceptedAnswer.text.trim())
      // 可见 FAQ 与 JSON-LD 同源：每个问题都要出现在页面正文里。
      assert.equal(html.includes(question.name.replace(/&/g, '&#38;')) || html.includes(question.name), true)
    }

    // 展示区块范围：从第一个区块的 <section> 起到 </main>；其中不得有任何脚本，保持纯静态。
    const sectionsHtml = html.slice(html.lastIndexOf('<section', positions[0]), html.indexOf('</main>'))
    assert.equal(/<script\b/i.test(sectionsHtml), false, `${label}: display sections must not contain <script>`)

    const toText = (fragment) =>
      fragment
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    // 整页（含工具首屏 workspace 与 trust points）文案不得出现积分 / 签到 / 价格。
    const pageText = toText(html.slice(html.indexOf('<main'), html.indexOf('</main>')))
    assert.equal(forbiddenCopy.test(pageText), false, `${label}: homepage mentions a forbidden term`)
    assert.equal(forbiddenCopy.test(JSON.stringify(software.featureList)), false)
    assert.equal(forbiddenCopy.test(software.description), false)
    assert.equal(forbiddenCopy.test(JSON.stringify(faq)), false)

    // 展示区块除格式词外不出现数字（次数、大小、价格都来自后端配置，不写进静态文案）。
    // 插件界面示意（figure）是装饰：地址栏、时间、进度等示意数字不是文案，不计入。
    const sectionsText = toText(sectionsHtml.replace(/<figure\b[\s\S]*?<\/figure>/gi, ' '))
      .replace(/\b(MP3|MP4|M4A|VTT|JPEG|HLS|DRM|CSV)\b/gi, ' ')
      .replace(/\b(720|1080)p\b/gi, ' ')
      .replace(/&#\d+;|&#x[0-9a-f]+;/gi, ' ')
    assert.equal(
      /[0-9０-９]/.test(sectionsText),
      false,
      `${label}: display sections contain digits: ${(sectionsText.match(/.{0,16}[0-9０-９]+.{0,16}/) ?? [''])[0]}`
    )
    // SoftwareApplication 描述的是插件，不得写成「不需要插件」。
    assert.equal(/extension|拡張|확장|扩展|擴充|расширен|ส่วนขยาย|tiện ích|ekstensi|erweiterung|extensión|extensão|estensione/i.test(software.description), true)
  }
})

test('localized Pricing subscription copy defines renewal states', async () => {
  const imported = await importCompiledTypescriptModule(
    'src/i18n/pricing.ts',
    'pricing.js',
    'pricing-i18n-'
  )
  const expectedCopy = {
    jaJPPricingContent: ['拡張機能サブスクリプション', '自動更新'],
    koKRPricingContent: ['확장 프로그램 구독', '자동 갱신'],
    esESPricingContent: ['Suscripción para la extensión', 'Renovación automática'],
    ptBRPricingContent: ['Assinatura para a extensão', 'Renovação automática'],
    deDEPricingContent: ['Erweiterungs-Abo', 'Automatische Verlängerung'],
    frFRPricingContent: ['Abonnement pour l’extension', 'Renouvellement automatique'],
    ruRUPricingContent: ['Подписка для расширения', 'Автопродление'],
    itITPricingContent: ['Abbonamento per l’estensione', 'Rinnovo automatico'],
    viVNPricingContent: ['Gói đăng ký tiện ích mở rộng', 'Tự động gia hạn'],
    thTHPricingContent: ['การสมัครสมาชิกส่วนขยาย', 'ต่ออายุอัตโนมัติ'],
    idIDPricingContent: ['Langganan ekstensi', 'Diperpanjang otomatis']
  }

  try {
    for (const [exportName, [eyebrow, autoRenewOn]] of Object.entries(expectedCopy)) {
      const content = imported.module[exportName]
      assert.ok(content, `Expected pricing.ts to export ${exportName}`)
      assert.equal(content.subscription.eyebrow, eyebrow)
      assert.equal(content.subscription.autoRenewOn, autoRenewOn)
    }

    const subscriptionManagementExports = [
      'pricingContent',
      'zhCNPricingContent',
      'zhTWPricingContent',
      ...Object.keys(expectedCopy)
    ]
    for (const exportName of subscriptionManagementExports) {
      const content = imported.module[exportName]
      assert.ok(content, `Expected pricing.ts to export ${exportName}`)
      assert.ok(content.subscriptionManagement.buttonLabel)
      assert.ok(content.subscriptionManagement.loadFailed)
    }

    assert.equal(imported.module.pricingContent.subscriptionManagement.buttonLabel, 'Manage subscription')
    assert.equal(
      imported.module.pricingContent.cancellationGuide,
      undefined,
      '订阅管理入口不再有渠道内取消指引弹窗文案'
    )
  } finally {
    await imported.cleanup()
  }
})

test('language sitemap output matches locale mapping and built canonical pages', async () => {
  const siteUrl = SITE_ORIGIN
  const uiSource = await readFile(path.join(repoDir, 'src/i18n/ui.ts'), 'utf8')
  const localePaths = readUiRecord(uiSource, 'localePaths')
  const hreflangMap = readUiRecord(uiSource, 'hreflangMap')

  for (const language of LANGUAGE_SITEMAP_LOCALES) {
    assert.equal(localePaths.get(language.locale), language.pathPrefix)
    assert.equal(hreflangMap.get(language.locale), language.sitemapSlug)
  }

  assert.equal(LANGUAGE_SITEMAP_LOCALES.length, localePaths.size)

  const distFiles = await readdir(distDir)
  assert.equal(distFiles.includes('sitemap.xml'), true)
  assert.equal(distFiles.includes('sitemap_index.xml'), true)
  assert.equal(distFiles.includes('sitemap-0.xml'), true)

  const indexXml = await readFile(path.join(distDir, 'sitemap.xml'), 'utf8')
  const indexAliasXml = await readFile(path.join(distDir, 'sitemap_index.xml'), 'utf8')
  assert.equal(indexAliasXml, indexXml)
  assert.match(indexXml, /<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>/)
  assert.match(indexXml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  const sitemapStylesheet = await readFile(path.join(distDir, 'sitemap.xsl'), 'utf8')
  assert.match(sitemapStylesheet, new RegExp(`XML Sitemap Index \\| ${PRODUCT_NAME}`))
  assert.match(sitemapStylesheet, /sitemap:sitemapindex/)
  assert.match(sitemapStylesheet, /sitemap:urlset/)

  const indexLocs = extractTagValues(indexXml, 'loc')
  assert.equal(indexLocs.length, LANGUAGE_SITEMAP_LOCALES.length)
  assert.equal(indexLocs.some((loc) => loc.includes('sitemap-0.xml')), false)

  const canonicalUrls = await collectCanonicalUrls()
  const sitemapUrls = new Set()
  const legacyFlatXml = await readFile(path.join(distDir, 'sitemap-0.xml'), 'utf8')
  assert.match(legacyFlatXml, /<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>/)
  assert.match(legacyFlatXml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  assert.equal(extractTagValues(legacyFlatXml, 'changefreq').length, 0)
  assert.equal(extractTagValues(legacyFlatXml, 'priority').length, 0)
  const legacyFlatLocs = extractTagValues(legacyFlatXml, 'loc')

  for (const language of LANGUAGE_SITEMAP_LOCALES) {
    const sitemapUrl = `${siteUrl}/${language.sitemapSlug}-sitemap.xml`
    assert.ok(indexLocs.includes(sitemapUrl), `Expected sitemap index to include ${sitemapUrl}`)

    const sitemapPath = path.join(distDir, `${language.sitemapSlug}-sitemap.xml`)
    const sitemapXml = await readFile(sitemapPath, 'utf8')
    assert.match(sitemapXml, /<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>/)
    assert.match(sitemapXml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)

    const locs = extractTagValues(sitemapXml, 'loc')
    const lastmods = extractTagValues(sitemapXml, 'lastmod')

    assert.ok(locs.length > 0, `Expected ${language.sitemapSlug}-sitemap.xml to contain URLs`)
    assert.equal(lastmods.length, locs.length)
    assert.equal(extractTagValues(sitemapXml, 'changefreq').length, 0)
    assert.equal(extractTagValues(sitemapXml, 'priority').length, 0)

    for (const lastmod of lastmods) {
      assert.equal(Number.isNaN(Date.parse(lastmod)), false, `Expected valid lastmod: ${lastmod}`)
    }

    for (const loc of locs) {
      const locSegments = new URL(loc).pathname.split('/').filter(Boolean)
      const lastSegment = locSegments[locSegments.length - 1] ?? ''
      assert.equal(
        ['features', 'guide', 'faq', 'solutions'].includes(lastSegment),
        false,
        `Expected sitemap to exclude retired information route: ${loc}`
      )
      sitemapUrls.add(loc)

      if (language.locale === 'en-US') {
        const firstSegment = new URL(loc).pathname.split('/').filter(Boolean)[0] ?? ''
        const languagePrefixes = new Set(
          LANGUAGE_SITEMAP_LOCALES
            .map((item) => item.pathPrefix)
            .filter((pathPrefix) => pathPrefix !== '')
        )
        assert.equal(languagePrefixes.has(firstSegment), false)
      } else {
        assert.ok(
          new URL(loc).pathname.startsWith(`/${language.pathPrefix}/`),
          `Expected ${loc} to use /${language.pathPrefix}/ prefix`
        )
      }
    }
  }

  const publicCanonicalUrls = canonicalUrls
  assert.deepEqual(sitemapUrls, publicCanonicalUrls)
  assert.deepEqual(new Set(legacyFlatLocs), publicCanonicalUrls)

  const robotsTxt = await readFile(path.join(distDir, 'robots.txt'), 'utf8')
  assert.equal(robotsTxt.includes(`Sitemap: ${siteUrl}/sitemap.xml`), true)
  assert.match(robotsTxt, /^Disallow: \/clink\/cancel\/$/m)
  assert.match(robotsTxt, /^Disallow: \/clink\/success\/$/m)
  assert.match(robotsTxt, /^Disallow: \/paypal\/cancel\/$/m)
  assert.match(robotsTxt, /^Disallow: \/paypal\/success\/$/m)
  assert.equal(sitemapUrls.has(`${siteUrl}/clink/cancel/`), false)
  assert.equal(sitemapUrls.has(`${siteUrl}/clink/success/`), false)
  assert.equal(sitemapUrls.has(`${siteUrl}/paypal/cancel/`), false)
  assert.equal(sitemapUrls.has(`${siteUrl}/paypal/success/`), false)
  assert.equal(
    Array.from(sitemapUrls).some((url) => new URL(url).pathname.endsWith('/ext-pricing/')),
    true
  )
})

test('About and Contact pages expose localized trust content and structured data', async () => {
  const siteUrl = SITE_ORIGIN

  for (const language of LANGUAGE_SITEMAP_LOCALES) {
    const languagePath = language.pathPrefix ? `${language.pathPrefix}/` : ''
    const aboutHtml = await readFile(path.join(distDir, languagePath, 'about/index.html'), 'utf8')
    const contactHtml = await readFile(path.join(distDir, languagePath, 'contact/index.html'), 'utf8')
    const expectedAboutUrl = `${siteUrl}/${languagePath}about/`
    const expectedContactUrl = `${siteUrl}/${languagePath}contact/`

    assert.equal(extractCanonicalUrl(aboutHtml), expectedAboutUrl)
    assert.equal(extractCanonicalUrl(contactHtml), expectedContactUrl)
    assert.match(aboutHtml, /"@type":"AboutPage"/)
    assert.match(contactHtml, /"@type":"ContactPage"/)
    assert.match(aboutHtml, /"datePublished":"2026-09-18"/)
    assert.match(contactHtml, /"dateModified":"2026-09-18"/)
    assert.equal(aboutHtml.includes(`"@id":"${siteUrl}/#organization"`), true)
    assert.equal(contactHtml.includes(`"@id":"${siteUrl}/#support"`), true)
    assert.equal(aboutHtml.includes(`href="/${languagePath}contact/"`), true)
    assert.equal(contactHtml.includes(`href="/${languagePath}about/"`), true)
    assert.match(contactHtml, new RegExp(`href="mailto:${DEVELOPER_EMAIL}\\?subject=`))
    assert.equal(contactHtml.includes(DEVELOPER_EMAIL), true)
    assert.equal(
      (aboutHtml.match(new RegExp(`href="${OFFICIAL_X_URL}"`, 'g')) ?? []).length,
      1
    )
    assert.equal(
      (contactHtml.match(new RegExp(`href="${OFFICIAL_X_URL}"`, 'g')) ?? []).length,
      2
    )
    assert.match(contactHtml, /data-ga-source="contact"/)
    assert.equal(contactHtml.includes(`<meta name="twitter:site" content="${OFFICIAL_X_HANDLE}"`), true)
    assert.match(
      contactHtml,
      new RegExp(`"sameAs":\\[[^\\]]*"${OFFICIAL_X_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\]]*\\]`)
    )
  }
})

test('LLMs text indexes reference existing built website paths', async () => {
  const distFiles = await readdir(distDir)
  assert.equal(distFiles.includes('llms.txt'), true)
  assert.equal(distFiles.includes('llms-full.txt'), true)
  const siteUrl = SITE_ORIGIN

  const llmsTxt = await readFile(path.join(distDir, 'llms.txt'), 'utf8')
  const llmsFullTxt = await readFile(path.join(distDir, 'llms-full.txt'), 'utf8')
  const robotsTxt = await readFile(path.join(distDir, 'robots.txt'), 'utf8')

  assert.match(llmsTxt, /^# Vimeo Video Downloader$/m)
  assert.equal(llmsTxt.includes(`${siteUrl}/llms-full.txt`), true)
  assert.equal(llmsTxt.includes(`${siteUrl}/sitemap.xml`), true)
  assert.match(llmsFullTxt, /^# Vimeo Video Downloader$/m)
  assert.equal(llmsFullTxt.includes(`${siteUrl}/llms.txt`), true)
  assert.equal(llmsFullTxt.includes(`${siteUrl}/sitemap.xml`), true)
  assert.match(robotsTxt, /^Allow: \/llms\.txt$/m)
  assert.match(robotsTxt, /^Allow: \/llms-full\.txt$/m)

  assert.equal(llmsTxt.includes('mailto:'), false)
  assert.equal(llmsFullTxt.includes('mailto:'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(llmsTxt), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(llmsFullTxt), false)

  const requiredShortIndexUrls = [
    `${siteUrl}/`,
    `${siteUrl}/ext-pricing/`,
    `${siteUrl}/about/`,
    `${siteUrl}/contact/`,
    `${siteUrl}/llms-full.txt`,
    `${siteUrl}/sitemap.xml`
  ]

  // 单平台站点：索引不得再出现已删除的平台落地页。
  const retiredPlatformRoutes = ['tiktok-downloader', 'x-downloader', 'instagram-downloader', 'threads-downloader', 'vimeo-downloader', 'changelog']
  for (const retiredRoute of retiredPlatformRoutes) {
    assert.equal(llmsTxt.includes(retiredRoute), false, `Expected llms.txt to drop retired route: ${retiredRoute}`)
    assert.equal(llmsFullTxt.includes(retiredRoute), false, `Expected llms-full.txt to drop retired route: ${retiredRoute}`)
  }

  for (const url of requiredShortIndexUrls) {
    assert.equal(llmsTxt.includes(url), true, `Expected llms.txt to include required URL: ${url}`)
  }

  const requiredFullIndexUrls = [
    `${siteUrl}/`,
    `${siteUrl}/ext-pricing/`,
    `${siteUrl}/about/`,
    `${siteUrl}/contact/`,
    `${siteUrl}/llms.txt`,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/sitemap_index.xml`,
    `${siteUrl}/sitemap-0.xml`
  ]

  for (const language of LANGUAGE_SITEMAP_LOCALES) {
    const languagePath = language.pathPrefix ? `/${language.pathPrefix}/` : '/'
    requiredFullIndexUrls.push(`${siteUrl}${languagePath}`)
    requiredFullIndexUrls.push(`${siteUrl}/${language.sitemapSlug}-sitemap.xml`)
  }

  for (const url of requiredFullIndexUrls) {
    assert.equal(
      llmsFullTxt.includes(url),
      true,
      `Expected llms-full.txt to include required URL: ${url}`
    )
  }

  for (const source of [llmsTxt, llmsFullTxt]) {
    const absoluteUrls = Array.from(source.matchAll(/https?:\/\/[^)\s]+/g)).map((match) => match[0])
    for (const url of absoluteUrls) {
      const parsedUrl = new URL(url)
      assert.equal(parsedUrl.protocol, 'https:', `Expected LLMs index to avoid non-HTTPS URL: ${url}`)
      assert.equal(
        parsedUrl.host,
        SITE_HOST,
        `Expected LLMs index to avoid external URL: ${url}`
      )
    }

    const siteUrlPattern = new RegExp(`${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^)\\s]*`, 'g')
    const urls = Array.from(source.matchAll(siteUrlPattern))
      .map((match) => match[0])

    for (const url of urls) {
      const pathname = new URL(url).pathname
      const locSegments = pathname.split('/').filter(Boolean)
      const lastSegment = locSegments[locSegments.length - 1] ?? ''
      assert.equal(
        ['features', 'guide', 'faq', 'solutions'].includes(lastSegment),
        false,
        `Expected LLMs index to avoid retired information page: ${url}`
      )

      const distPath = path.extname(pathname)
        ? path.join(distDir, pathname.slice(1))
        : path.join(distDir, pathname.slice(1), 'index.html')
      await readFile(distPath, 'utf8').catch((error) => {
        assert.fail(
          `Expected LLMs index URL to reference a built file: ${url}; path=${path.relative(distDir, distPath)}; error=${error.message}`
        )
      })
    }
  }
})

async function findFile(rootDir, filename) {
  const entries = await readdir(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const matched = await findFile(fullPath, filename)
      if (matched) {
        return matched
      }
      continue
    }

    if (entry.isFile() && entry.name === filename) {
      return fullPath
    }
  }

  return null
}

async function collectFilesByExtension(rootDir, extension) {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const matchedFiles = []

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      matchedFiles.push(...(await collectFilesByExtension(fullPath, extension)))
      continue
    }

    if (entry.isFile() && fullPath.endsWith(extension)) {
      matchedFiles.push(fullPath)
    }
  }

  return matchedFiles
}

async function patchCompiledBrowserModuleFiles(rootDir) {
  const jsFiles = await collectFilesByExtension(rootDir, '.js')
  for (const filePath of jsFiles) {
    let source = await readFile(filePath, 'utf8')
    source = source.replace(/from '((?:\.\.?\/)[^']+)'/g, (match, specifier) => {
      if (specifier.endsWith('.js') || specifier.endsWith('.json')) {
        return match
      }
      return `from '${specifier}.js'`
    })
    source = source.replace(/import\('((?:\.\.?\/)[^']+)'\)/g, (match, specifier) => {
      if (specifier.endsWith('.js') || specifier.endsWith('.json')) {
        return match
      }
      return `import('${specifier}.js')`
    })
    source = source.replace(/from '([^']+\.json)'/g, "from '$1' with { type: 'json' }")
    source = source.replace(
      /import\.meta\.env\.PUBLIC_GOOGLE_CLIENT_ID/g,
      "'pricing-google-client-id'"
    )
    source = source.replace(
      /import\.meta\.env\.PUBLIC_API_BASE_URL/g,
      `'https://api.${SITE_HOST}/'`
    )
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_PROJECT/g, "'vimeo-download-logs'")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_HOST/g, "'ap-northeast-1.log.aliyuncs.com'")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_ENDPOINT/g, "''")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_LOGSTORE/g, "'vimeo-download-mark-logs'")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_ENABLED/g, "''")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_TOPIC/g, "'mark-log'")
    source = source.replace(/import\.meta\.env\.PUBLIC_ALI_SLS_SOURCE/g, "''")
    await writeFile(filePath, source)
  }
}

function installLocalStorage() {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      }
    }
  }

  return values
}

async function importWorkspaceSnapshotModule() {
  const tempDir = await createTempDir('workspace-snapshot-')
  const snapshotSource = path.resolve(
    repoDir,
    'src/scripts/download/snapshot.ts'
  )
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [snapshotSource]
    })
  )
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--project',
      tsconfigPath
    ],
    { cwd: repoDir }
  )

  const compiledFile = await findFile(tempDir, 'snapshot.js')
  assert.ok(compiledFile, 'Expected snapshot.ts to compile to snapshot.js')
  await patchCompiledBrowserModuleFiles(tempDir)

  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
      delete globalThis.window
    }
  }
}

async function importSharedDownloadUrlModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/url.ts'),
    'url.js',
    'shared-download-url-'
  )
}

async function importDownloadResumeStoreModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/download-resume-store.ts'),
    'download-resume-store.js',
    'download-resume-store-'
  )
}

async function importDownloadRangeStreamModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/download-range-stream.ts'),
    'download-range-stream.js',
    'download-range-stream-'
  )
}

async function importDownloadStoragePreflightModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/download-storage-preflight.ts'),
    'download-storage-preflight.js',
    'download-storage-preflight-'
  )
}

async function importMediaDownloadAllowlistModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/media-download-allowlist.ts'),
    'media-download-allowlist.js',
    'media-download-allowlist-'
  )
}

async function importWorkspaceErrorsModule() {
  const tempDir = await createTempDir('workspace-errors-')
  const sourceFile = path.resolve(repoDir, 'src/scripts/download/workspace-errors.ts')
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [sourceFile]
    })
  )
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', tsconfigPath], { cwd: repoDir })

  const compiledFile = await findFile(tempDir, 'workspace-errors.js')
  assert.ok(compiledFile, 'Expected workspace-errors.ts to compile to workspace-errors.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importWorkspaceDownloadModuleWithMockedDispatcher() {
  const tempDir = await createTempDir('workspace-download-')
  const sourceFile = path.resolve(repoDir, 'src/scripts/download/workspace-download.ts')
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [sourceFile]
    })
  )
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', tsconfigPath], { cwd: repoDir })

  const compiledFile = await findFile(tempDir, 'workspace-download.js')
  const dispatcherFile = await findFile(tempDir, 'download-dispatcher.js')
  assert.ok(compiledFile, 'Expected workspace-download.ts to compile to workspace-download.js')
  assert.ok(dispatcherFile, 'Expected workspace-download.ts dependency download-dispatcher.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  await writeFile(
    dispatcherFile,
    [
      'export async function downloadPlannedResource(plan, context, options) {',
      '  const resource = plan.resource;',
      '  globalThis.__workspaceDownloadTestDownloads?.push({ resource, context, hasProgress: typeof options?.onProgress === "function", saveStrategies: plan.method.saveStrategies, sessionPolicy: plan.method.sessionPolicy, requiresStoragePreflight: plan.method.requiresStoragePreflight });',
      '  const createError = globalThis.__workspaceDownloadTestCreateError;',
      '  if (typeof createError === "function") {',
      '    throw createError(resource);',
      '  }',
      '  return globalThis.__workspaceDownloadTestResult;',
      '}',
      'export async function resumeDownloadResource(resource, resumeRecord, context, options) {',
      '  globalThis.__workspaceDownloadTestDownloads?.push({ resource, resumeRecord, context, hasProgress: typeof options?.onProgress === "function" });',
      '  return globalThis.__workspaceDownloadTestResult;',
      '}'
    ].join('\n')
  )

  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
      delete globalThis.__workspaceDownloadTestDownloads
      delete globalThis.__workspaceDownloadTestCreateError
      delete globalThis.__workspaceDownloadTestResult
    }
  }
}

async function importWorkspaceRenderModule() {
  const tempDir = await createTempDir('workspace-render-')
  const sourceFile = path.resolve(repoDir, 'src/scripts/download/workspace-render.ts')
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [sourceFile]
    })
  )
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', tsconfigPath], { cwd: repoDir })

  const compiledFile = await findFile(tempDir, 'workspace-render.js')
  assert.ok(compiledFile, 'Expected workspace-render.ts to compile to workspace-render.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importHomepageApiModule() {
  const tempDir = await createTempDir('homepage-api-')
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsc',
      'src/scripts/runtime/api.ts',
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'Bundler',
      '--types',
      'astro/client',
      '--outDir',
      tempDir,
      '--skipLibCheck'
    ],
    { cwd: repoDir }
  )

  const compiledFile = await findFile(tempDir, 'api.js')
  assert.ok(compiledFile, 'Expected api.ts to compile to api.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importHomepageMarkModule() {
  const tempDir = await createTempDir('homepage-mark-')
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsc',
      'src/scripts/runtime/mark.ts',
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'Bundler',
      '--types',
      'astro/client',
      '--outDir',
      tempDir,
      '--skipLibCheck'
    ],
    { cwd: repoDir }
  )

  const markFile = await findFile(tempDir, 'mark.js')
  const apiFile = await findFile(tempDir, 'api.js')
  assert.ok(markFile, 'Expected mark.ts to compile to mark.js')
  assert.ok(apiFile, 'Expected mark.ts dependency api.ts to compile to api.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(markFile).href}?cache=${Date.now()}`)
  const apiModule = await import(pathToFileURL(apiFile).href)
  return {
    module,
    apiModule,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importSharedHomepageMarkModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/runtime/mark.ts'),
    'mark.js',
    'shared-homepage-mark-'
  )
}

async function importHomepageSlsMarkModule(sourceFile, tempPrefix) {
  return importCompiledTypescriptModule(sourceFile, 'sls-mark.js', tempPrefix)
}

async function importFrontendErrorCaptureModule(sourceFile, tempPrefix) {
  return importCompiledTypescriptModule(sourceFile, 'frontend-error-capture.js', tempPrefix)
}

async function importGlobalClickEventsModule() {
  const tempDir = await createTempDir('global-click-events-')
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsc',
      'src/scripts/globalClickEvents.ts',
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'Bundler',
      '--types',
      'astro/client',
      '--outDir',
      tempDir,
      '--skipLibCheck'
    ],
    { cwd: repoDir }
  )

  const compiledFile = await findFile(tempDir, 'globalClickEvents.js')
  assert.ok(compiledFile, 'Expected globalClickEvents.ts to compile to globalClickEvents.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importHomepageMarkSanitizerModule() {
  return importCompiledTypescriptModule(
    'src/scripts/runtime/mark-sanitizer.ts',
    'mark-sanitizer.js',
    'homepage-mark-sanitizer-'
  )
}

async function importSharedDeviceModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/runtime/device.ts'),
    'device.js',
    'shared-device-'
  )
}

async function importSharedFirstOpenedMarkModule() {
  const imported = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/runtime/first-opened-mark.ts'),
    'first-opened-mark.js',
    'shared-first-opened-mark-'
  )
  const deviceFile = await findFile(imported.tempDir, 'device.js')
  assert.ok(deviceFile, 'Expected first-opened-mark.ts dependency device.ts to compile to device.js')
  const deviceModule = await import(pathToFileURL(deviceFile).href)

  return {
    ...imported,
    deviceModule
  }
}

async function importSharedMediaApiModule() {
  const tempDir = await createTempDir('shared-media-api-')
  const sourceFile = path.resolve(repoDir, 'src/scripts/download/media-api.ts')
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [sourceFile]
    })
  )
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', tsconfigPath], { cwd: repoDir })

  const compiledFile = await findFile(tempDir, 'media-api.js')
  assert.ok(compiledFile, 'Expected media-api.ts to compile to media-api.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importCompiledTypescriptModule(sourceFile, compiledFilename, tempPrefix) {
  const tempDir = await createTempDir(tempPrefix)
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsc',
      sourceFile,
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'Bundler',
      '--types',
      'astro/client',
      '--outDir',
      tempDir,
      '--skipLibCheck'
    ],
    { cwd: repoDir }
  )

  const compiledFile = await findFile(tempDir, compiledFilename)
  assert.ok(compiledFile, `Expected ${sourceFile} to compile to ${compiledFilename}`)
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importPricingPageControllerModule() {
  const tempDir = await createTempDir('pricing-page-loader-')
  const sourceFile = path.resolve(
    repoDir,
    'src/components/pricing/pricing-page-controller.ts'
  )
  const confirmSource = path.resolve(repoDir, 'src/scripts/site/confirm.ts')
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      extends: path.join(repoDir, 'tsconfig.json'),
      compilerOptions: {
        outDir: tempDir,
        noEmit: false,
        allowImportingTsExtensions: false,
        types: []
      },
      files: [sourceFile, confirmSource]
    })
  )
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', tsconfigPath], { cwd: repoDir })

  const compiledFile = await findFile(tempDir, 'pricing-page-controller.js')
  assert.ok(compiledFile, 'Expected pricing-page-controller.ts to compile to pricing-page-controller.js')
  await patchCompiledBrowserModuleFiles(tempDir)
  const module = await import(`${pathToFileURL(compiledFile).href}?cache=${Date.now()}`)
  return {
    module,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

async function importHomepageAuthModule(sourceFile, tempPrefix) {
  return importCompiledTypescriptModule(sourceFile, 'auth.js', tempPrefix)
}

async function importPaymentReturnModule() {
  return importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/components/payment-return/payment-return.ts'),
    'payment-return.js',
    'payment-return-'
  )
}

async function importSiteConfirmModule(tempPrefix) {
  return importCompiledTypescriptModule(
    'src/scripts/site/confirm.ts',
    'confirm.js',
    tempPrefix
  )
}

function installGoogleScriptDom() {
  const scripts = []
  const storageValues = new Map()
  const assignedLocations = []

  class FakeScriptElement {
    constructor() {
      this.async = false
      this.defer = false
      this.removed = false
      this.src = ''
      this.listeners = new Map()
    }

    addEventListener(type, listener, options = {}) {
      const listeners = this.listeners.get(type) ?? []
      listeners.push({
        listener,
        once: Boolean(options.once)
      })
      this.listeners.set(type, listeners)
    }

    dispatch(type) {
      const listeners = [...(this.listeners.get(type) ?? [])]
      for (const item of listeners) {
        item.listener({ type, target: this })
      }
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter(item => !item.once)
      )
    }

    remove() {
      this.removed = true
    }
  }

  class FakeDomElement {
    constructor(tagName) {
      this.tagName = tagName
      this.type = ''
      this.className = ''
      this.dataset = {}
      this.disabled = false
      this.textContent = ''
      this.children = []
      this.listeners = new Map()
      this.attributes = new Map()
    }

    append(...children) {
      this.children.push(...children)
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? []
      listeners.push(listener)
      this.listeners.set(type, listeners)
    }

    dispatch(type) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ target: this })
      }
    }

    click() {
      this.dispatch('click')
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value))
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null
    }

    querySelector(selector) {
      if (selector !== '[data-google-oauth-button-label]') {
        return null
      }
      return this.children.find(child => child.dataset?.googleOauthButtonLabel === 'true') ?? null
    }
  }

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storageValues.has(key) ? storageValues.get(key) : null
      },
      setItem(key, value) {
        storageValues.set(key, String(value))
      },
      removeItem(key) {
        storageValues.delete(key)
      }
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    location: Object.assign(new URL(`${SITE_ORIGIN}/`), {
      assign(url) {
        assignedLocations.push(String(url))
      }
    }),
    history: {
      state: null,
      replaceState() {}
    }
  }
  globalThis.document = {
    documentElement: { lang: 'en-US' },
    createElement(tagName) {
      if (tagName === 'script') {
        return new FakeScriptElement()
      }
      return new FakeDomElement(tagName)
    },
    head: {
      append(script) {
        scripts.push(script)
      }
    },
    querySelector(selector) {
      const srcMatch = selector.match(/^script\[src="(.+)"\]$/)
      if (!srcMatch) {
        return null
      }
      return scripts.find(script => !script.removed && script.src === srcMatch[1]) ?? null
    }
  }

  return {
    scripts,
    storageValues,
    assignedLocations,
    cleanup: () => {
      delete globalThis.document
      delete globalThis.window
    }
  }
}

function installPromptingGoogleIdentity() {
  let initializeCount = 0
  let promptCount = 0
  let initializeConfig = null

  globalThis.window.google = {
    accounts: {
      id: {
        cancel() {},
        initialize(config) {
          initializeCount += 1
          initializeConfig = config
        },
        prompt(listener) {
          promptCount += 1
          queueMicrotask(() => {
            listener?.({
              isDismissedMoment: () => true,
              getDismissedReason: () => 'credential_returned'
            })
          })
        }
      }
    }
  }

  return {
    get initializeCount() {
      return initializeCount
    },
    get promptCount() {
      return promptCount
    },
    get initializeConfig() {
      return initializeConfig
    }
  }
}

function installGoogleRedirectDom(
  href = `${SITE_ORIGIN}/ext-pricing/?plan=month&google_login_code=old`
) {
  const dom = installGoogleScriptDom()
  const locationUrl = new URL(href)
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let replacedUrl = ''
  const createLocation = url =>
    Object.assign(new URL(url), {
      assign(nextUrl) {
        dom.assignedLocations.push(String(nextUrl))
      }
    })

  globalThis.window.location = createLocation(locationUrl.toString())
  globalThis.window.history = {
    state: { source: 'test' },
    replaceState(_state, _title, url) {
      replacedUrl = String(url)
      globalThis.window.location = createLocation(replacedUrl)
    }
  }
  globalThis.document.documentElement = { lang: 'en-US' }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })

  return {
    scripts: dom.scripts,
    assignedLocations: dom.assignedLocations,
    get replacedUrl() {
      return replacedUrl
    },
    cleanup: () => {
      dom.cleanup()
      if (previousNavigator) {
        Object.defineProperty(globalThis, 'navigator', previousNavigator)
        return
      }
      delete globalThis.navigator
    }
  }
}

async function assertGoogleScriptLoadRetriesAfterError(sourceFile, tempPrefix) {
  const { module, cleanup } = await importHomepageAuthModule(sourceFile, tempPrefix)
  const dom = installGoogleScriptDom()

  try {
    const firstRequest = module.requestGoogleRedirectPrompt('client-id', GOOGLE_TEST_REQUEST_CONTEXT)
    const concurrentRequest = module.requestGoogleRedirectPrompt('client-id', GOOGLE_TEST_REQUEST_CONTEXT)
    assert.equal(dom.scripts.length, 1)

    dom.scripts[0].dispatch('error')

    await assert.rejects(firstRequest, /Failed to load Google Identity Services/)
    await assert.rejects(concurrentRequest, /Failed to load Google Identity Services/)
    assert.equal(dom.scripts[0].removed, true)

    const retryRequest = module.requestGoogleRedirectPrompt('client-id', GOOGLE_TEST_REQUEST_CONTEXT)
    assert.equal(dom.scripts.length, 2)
    const googleIdentity = installPromptingGoogleIdentity()
    dom.scripts[1].dispatch('load')

    await retryRequest
    assert.equal(googleIdentity.initializeCount, 1)
    assert.equal(googleIdentity.promptCount, 1)
    assert.equal(typeof googleIdentity.initializeConfig.callback, 'function')
  } finally {
    dom.cleanup()
    await cleanup()
  }
}

async function assertGoogleIdentityInitializesOnce(sourceFile, tempPrefix) {
  const { module, cleanup } = await importHomepageAuthModule(sourceFile, tempPrefix)
  const dom = installGoogleScriptDom()

  try {
    const firstRequest = module.requestGoogleRedirectPrompt('client-id', GOOGLE_TEST_REQUEST_CONTEXT)
    assert.equal(dom.scripts.length, 1)

    const googleIdentity = installPromptingGoogleIdentity()
    dom.scripts[0].dispatch('load')

    await firstRequest
    assert.equal(googleIdentity.initializeCount, 1)
    assert.equal(googleIdentity.promptCount, 1)
    assert.equal(typeof googleIdentity.initializeConfig.callback, 'function')
    assert.equal(googleIdentity.initializeConfig.state_cookie_domain, undefined)

    await module.requestGoogleRedirectPrompt('client-id', GOOGLE_TEST_REQUEST_CONTEXT)
    assert.equal(googleIdentity.initializeCount, 1)
    assert.equal(googleIdentity.promptCount, 2)
  } finally {
    dom.cleanup()
    await cleanup()
  }
}

async function assertGoogleRedirectButtonUsesOAuthAuthorize(sourceFile, tempPrefix) {
  const { module, cleanup } = await importHomepageAuthModule(sourceFile, tempPrefix)
  const dom = installGoogleRedirectDom()

  try {
    const container = {
      textContent: 'loading',
      children: [],
      attributes: new Map([['aria-label', 'Continue with Google']]),
      append(...children) {
        this.children.push(...children)
      },
      getAttribute(name) {
        return this.attributes.get(name) ?? null
      }
    }
    module.renderGoogleRedirectButton(container, 'client-id', {
      source: 'test_redirect_button'
    })

    assert.equal(dom.scripts.length, 0)
    assert.equal(container.textContent, '')
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].dataset.googleOauthButton, 'true')
    assert.equal(container.children[0].children[0].className, 'google-oauth-button-icon')
    assert.match(container.children[0].children[0].innerHTML, /viewBox="12 10 20 20"/)
    assert.match(container.children[0].children[0].innerHTML, /fill="#4285F4"/)

    container.children[0].click()
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(container.children[0].disabled, true)
    assert.equal(dom.assignedLocations.length, 1)

    const authorizeUrl = new URL(dom.assignedLocations[0])
    assert.equal(authorizeUrl.origin, `https://api.${SITE_HOST}`)
    assert.equal(authorizeUrl.pathname, '/api/client/auth/google/oauth/authorize')
    const returnTo = new URL(authorizeUrl.searchParams.get('return_to'))
    assert.equal(returnTo.origin, SITE_ORIGIN)
    assert.equal(returnTo.pathname, '/ext-pricing/')
    assert.equal(returnTo.searchParams.get('plan'), 'month')
    assert.equal(returnTo.searchParams.get('register_device_id'), window.localStorage.getItem('homepage_device_id_v2'))
    assert.equal(returnTo.searchParams.get('first_opened_at'), window.localStorage.getItem('homepage_first_opened_at'))
  } finally {
    dom.cleanup()
    await cleanup()
  }
}

async function assertGoogleOneTapCallbackPostsCredential(sourceFile, tempPrefix) {
  const { module, cleanup } = await importHomepageAuthModule(sourceFile, tempPrefix)
  const dom = installGoogleScriptDom()
  dom.storageValues.set('homepage_first_opened_at', String(GOOGLE_TEST_FIRST_OPENED_AT))
  const previousFetch = globalThis.fetch
  const fetchCalls = []
  let receivedLoginResponse = null

  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    fetchCalls.push({
      path: parsedUrl.pathname,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null
    })
    return new Response(
      JSON.stringify({
        code: 10000,
        data: {
          access_token: 'one-tap-access-token',
          refresh_token: 'one-tap-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            user_id: 11,
            email: 'one-tap@example.com',
            avatar_url: 'https://cdn.example.test/one-tap.png',
          }
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }

  try {
    const promptRequest = module.requestGoogleRedirectPrompt(
      'client-id',
      GOOGLE_TEST_REQUEST_CONTEXT,
      {
        source: 'test_one_tap',
        onCredentialLogin(response) {
          receivedLoginResponse = response
        }
      }
    )
    assert.equal(dom.scripts.length, 1)

    const googleIdentity = installPromptingGoogleIdentity()
    dom.scripts[0].dispatch('load')
    await promptRequest

    googleIdentity.initializeConfig.callback({
      credential: 'fake-google-id-token',
      select_by: 'user_1tap'
    })
    await flushBrowserTasks()

    assert.deepEqual(fetchCalls, [
      {
        path: '/api/client/auth/google-login',
        method: 'POST',
        body: {
          credential: 'fake-google-id-token',
          ...GOOGLE_TEST_REGISTRATION_BODY
        }
      }
    ])
    assert.equal(receivedLoginResponse?.access_token, 'one-tap-access-token')
    assert.equal(dom.storageValues.get('homepage_access_token'), 'one-tap-access-token')
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    dom.cleanup()
    await cleanup()
  }
}

async function assertGoogleRedirectResultCanBeCleared(sourceFile, tempPrefix) {
  const { module, cleanup } = await importHomepageAuthModule(sourceFile, tempPrefix)
  const dom = installGoogleRedirectDom(
    `${SITE_ORIGIN}/ext-pricing/?plan=month&google_login_code=code-1&google_login_error=bad&google_email_verification=user%40example.com`
  )

  try {
    assert.deepEqual(module.readGoogleRedirectResult(), {
      code: 'code-1',
      emailVerificationEmail: 'user@example.com',
      error: 'bad'
    })

    module.clearGoogleRedirectResult()
    assert.equal(dom.replacedUrl, `${SITE_ORIGIN}/ext-pricing/?plan=month`)
  } finally {
    dom.cleanup()
    await cleanup()
  }
}

function installSlsBrowserGlobals({
  href = `${SITE_ORIGIN}/download/`,
  language = 'zh-CN',
  userAgent = 'Mozilla/5.0 SLS test browser',
  viewport = { width: 1365, height: 768 }
} = {}) {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL(href)
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language, userAgent }
  })
  globalThis.window = {
    innerWidth: viewport.width,
    innerHeight: viewport.height
  }
  globalThis.document = {
    documentElement: { lang: language }
  }

  return () => {
    if (previousLocation) {
      Object.defineProperty(globalThis, 'location', previousLocation)
    } else {
      delete globalThis.location
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
  }
}

function installFirstOpenedMarkBrowserGlobals({
  href = `${SITE_ORIGIN}/`,
  language = 'zh-CN',
  userAgent = 'Mozilla/5.0 first opened mark test',
  viewport = { width: 1365, height: 768 },
  storageUnavailable = false,
  storageWriteFails = false,
  deviceId = '123e4567-e89b-42d3-a456-426614174111',
  firstOpenedAt,
  submittedAt
} = {}) {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  const storage = new Map([['homepage_device_id_v2', deviceId]])
  if (firstOpenedAt !== undefined) {
    storage.set('homepage_first_opened_at', String(firstOpenedAt))
  }
  if (submittedAt !== undefined) {
    storage.set('homepage_web_first_opened_submitted_at', String(submittedAt))
  }
  const calls = []
  const storageObject = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      if (storageWriteFails) {
        throw new Error(`localStorage.setItem failed for ${key}`)
      }
      storage.set(key, String(value))
    },
    removeItem(key) {
      storage.delete(key)
    }
  }
  const windowObject = {
    innerWidth: viewport.width,
    innerHeight: viewport.height
  }

  if (storageUnavailable) {
    Object.defineProperty(windowObject, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage unavailable for first opened mark test')
      }
    })
  } else {
    windowObject.localStorage = storageObject
  }

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL(href)
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language, userAgent }
  })
  globalThis.window = windowObject
  globalThis.document = {
    documentElement: { lang: language }
  }
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      href: parsedUrl.href,
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: init.method ?? 'GET',
      credentials: init.credentials,
      keepalive: init.keepalive === true,
      body: init.body ? JSON.parse(String(init.body)) : null,
      markType: parsedUrl.searchParams.get('mark_type'),
      markMsg: parsedUrl.searchParams.get('mark_msg'),
      firstOpenedAt: parsedUrl.searchParams.get('first_opened_at')
    })

    return new Response(JSON.stringify({ code: 10000, data: { recorded: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return {
    calls,
    storage,
    restore() {
      if (previousLocation) {
        Object.defineProperty(globalThis, 'location', previousLocation)
      } else {
        delete globalThis.location
      }
      if (previousNavigator) {
        Object.defineProperty(globalThis, 'navigator', previousNavigator)
      } else {
        delete globalThis.navigator
      }
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
      if (previousDocument === undefined) {
        delete globalThis.document
      } else {
        globalThis.document = previousDocument
      }
      if (previousFetch === undefined) {
        delete globalThis.fetch
      } else {
        globalThis.fetch = previousFetch
      }
    }
  }
}

function installFrontendErrorBrowserGlobals({
  href = `${SITE_ORIGIN}/download/`,
  language = 'zh-CN',
  userAgent = 'Mozilla/5.0 Frontend error SLS test',
  viewport = { width: 1365, height: 768 },
  deviceId = '123e4567-e89b-42d3-a456-426614174000'
} = {}) {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const listeners = new Map()
  const storage = new Map([['homepage_device_id_v2', deviceId]])
  const windowObject = {
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null
      },
      setItem(key, value) {
        storage.set(key, String(value))
      },
      removeItem(key) {
        storage.delete(key)
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    }
  }

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL(href)
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language, userAgent }
  })
  globalThis.window = windowObject
  globalThis.document = {
    documentElement: { lang: language }
  }

  return {
    deviceId,
    listeners,
    windowObject,
    restore() {
      if (previousLocation) {
        Object.defineProperty(globalThis, 'location', previousLocation)
      } else {
        delete globalThis.location
      }
      if (previousNavigator) {
        Object.defineProperty(globalThis, 'navigator', previousNavigator)
      } else {
        delete globalThis.navigator
      }
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
      if (previousDocument === undefined) {
        delete globalThis.document
      } else {
        globalThis.document = previousDocument
      }
    }
  }
}

function restoreGlobalProperty(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor)
    return
  }

  delete globalThis[name]
}

function installFooterBrandBrowser({
  href = `${SITE_ORIGIN}/`,
  deviceId = '01234567-89ab-4def-8123-456789abcdef'
} = {}) {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const cookieWrites = []
  const imageSrcAssignments = []
  const storage = new Map([
    ['homepage_device_id_v2', deviceId],
    ['homepage_device_id', 'web-device-obsolete'],
    ['homepage_legacy_device_ids', '["web-fp-v1-obsolete"]']
  ])
  const mount = {
    children: [],
    querySelector(selector) {
      if (selector !== 'img') {
        return null
      }
      return this.children.find(child => child.tagName === 'IMG') ?? null
    },
    append(child) {
      this.children.push(child)
    }
  }

  class FakeImageElement {
    constructor() {
      this.tagName = 'IMG'
      this.width = 0
      this.height = 0
      this.alt = ''
      this.decoding = ''
      this.srcValue = ''
    }

    set src(value) {
      const next = String(value)
      imageSrcAssignments.push({
        value: next,
        cookieWriteCount: cookieWrites.length
      })
      this.srcValue = next
    }

    get src() {
      return this.srcValue
    }
  }

  const documentObject = {
    querySelector(selector) {
      if (selector === '[data-footer-brand-icon]') {
        return mount
      }
      return null
    },
    createElement(tagName) {
      assert.equal(tagName, 'img')
      return new FakeImageElement()
    }
  }
  Object.defineProperty(documentObject, 'cookie', {
    configurable: true,
    get() {
      return cookieWrites.join('; ')
    },
    set(value) {
      cookieWrites.push(String(value))
    }
  })

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null
      },
      setItem(key, value) {
        storage.set(key, String(value))
      },
      removeItem(key) {
        storage.delete(key)
      }
    },
    location: new URL(href)
  }
  globalThis.document = documentObject

  return {
    cookieWrites,
    imageSrcAssignments,
    mount,
    storage,
    restore() {
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
      if (previousDocument === undefined) {
        delete globalThis.document
      } else {
        globalThis.document = previousDocument
      }
    }
  }
}

test('shared device builds host-only client uuid cookie attributes', async () => {
  const { module, cleanup } = await importSharedDeviceModule()

  try {
    assert.equal(module.CLIENT_UUID_COOKIE_NAME, 'client_uuid')
    assert.equal(
      module.buildClientUuidCookieString('01234567-89ab-4def-8123-456789abcdef', { protocol: 'https:' }),
      'client_uuid=01234567-89ab-4def-8123-456789abcdef; Max-Age=604800; Path=/; SameSite=Lax; Secure'
    )
    assert.equal(
      module.buildClientUuidCookieString('01234567-89ab-4def-8123-456789abcdef', { protocol: 'http:' }),
      'client_uuid=01234567-89ab-4def-8123-456789abcdef; Max-Age=604800; Path=/; SameSite=Lax'
    )
  } finally {
    await cleanup()
  }
})

test('shared device writes client uuid cookie before mounting footer brand image', async () => {
  const { module, cleanup } = await importSharedDeviceModule()
  const browser = installFooterBrandBrowser()

  try {
    await module.initializeFooterBrandIcon()

    assert.equal(browser.cookieWrites.length, 1)
    assert.equal(
      browser.cookieWrites[0],
      'client_uuid=01234567-89ab-4def-8123-456789abcdef; Max-Age=604800; Path=/; SameSite=Lax; Secure'
    )
    assert.equal(browser.mount.children.length, 1)
    assert.equal(browser.mount.children[0].width, 32)
    assert.equal(browser.mount.children[0].height, 32)
    assert.equal(browser.mount.children[0].alt, '')
    assert.equal(browser.imageSrcAssignments.length, 1)
    assert.equal(browser.imageSrcAssignments[0].cookieWriteCount, 1)
    assert.equal(browser.imageSrcAssignments[0].value, '/assets/icons/logo.svg?v=20260706')
    assert.equal(Number(browser.storage.get('homepage_first_opened_at')) > 0, true)
    assert.equal(browser.storage.has('homepage_device_id'), false)
    assert.equal(browser.storage.has('homepage_legacy_device_ids'), false)
    const firstOpenedAt = browser.storage.get('homepage_first_opened_at')

    await module.initializeFooterBrandIcon()

    assert.equal(browser.cookieWrites.length, 2)
    assert.equal(browser.mount.children.length, 1)
    assert.equal(browser.imageSrcAssignments.length, 1)
    assert.equal(browser.storage.get('homepage_first_opened_at'), firstOpenedAt)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark reports once after first_opened_at is stored', async () => {
  const { module, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals()

  try {
    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()
    await flushBrowserTasks()

    const firstOpenedAt = Number(browser.storage.get('homepage_first_opened_at'))
    assert.equal(Number.isInteger(firstOpenedAt), true)
    assert.equal(firstOpenedAt > 0, true)
    assert.equal(browser.calls.length, 2)
    assert.equal(browser.calls[0].path, '/logstores/vimeo-download-mark-logs/track')
    assert.equal(browser.calls[0].method, 'GET')
    assert.equal(browser.calls[0].credentials, 'omit')
    assert.equal(browser.calls[0].keepalive, true)
    assert.equal(browser.calls[0].markType, 'web_first_opened')
    assert.equal(browser.calls[0].markMsg, '')
    assert.equal(Number(browser.calls[0].firstOpenedAt), firstOpenedAt)
    assert.equal(browser.calls[1].path, '/api/client/mark/record')
    assert.equal(browser.calls[1].method, 'POST')
    assert.equal(browser.calls[1].keepalive, true)
    assert.equal(browser.calls[1].body.mark_type, 'web_first_opened')
    assert.equal(browser.calls[1].body.mark_msg, '')
    assert.equal(browser.calls[1].body.first_opened_at, firstOpenedAt)
    assert.equal(
      browser.storage.get(module.WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY),
      String(firstOpenedAt)
    )

    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 2)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark reports stored first_opened_at when submitted marker is missing', async () => {
  const { module, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals({ firstOpenedAt: '1762345678901' })

  try {
    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 2)
    assert.equal(browser.calls[0].markType, 'web_first_opened')
    assert.equal(browser.calls[0].firstOpenedAt, '1762345678901')
    assert.equal(browser.calls[1].body.mark_type, 'web_first_opened')
    assert.equal(browser.calls[1].body.first_opened_at, 1762345678901)
    assert.equal(
      browser.storage.get(module.WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY),
      '1762345678901'
    )
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark skips after submitted marker exists', async () => {
  const { module, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals({
    firstOpenedAt: '1762345678901',
    submittedAt: '1762345678901'
  })

  try {
    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 0)
    assert.equal(
      browser.storage.get(module.WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY),
      '1762345678901'
    )
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark reports when device setup creates first_opened_at first', async () => {
  const { module, deviceModule, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals()

  try {
    await deviceModule.ensureDeviceId()

    const firstOpenedAt = Number(browser.storage.get('homepage_first_opened_at'))
    assert.equal(Number.isInteger(firstOpenedAt), true)
    assert.equal(firstOpenedAt > 0, true)
    assert.equal(browser.calls.length, 0)

    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 2)
    assert.equal(browser.calls[0].markType, 'web_first_opened')
    assert.equal(Number(browser.calls[0].firstOpenedAt), firstOpenedAt)
    assert.equal(browser.calls[1].body.mark_type, 'web_first_opened')
    assert.equal(browser.calls[1].body.first_opened_at, firstOpenedAt)
    assert.equal(
      browser.storage.get(module.WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY),
      String(firstOpenedAt)
    )

    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 2)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark reports storage unavailable when localStorage fails', async () => {
  const { module, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals({ storageUnavailable: true })

  try {
    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()
    await flushBrowserTasks()

    assert.equal(browser.calls.length, 2)
    assert.equal(browser.calls[0].markType, 'web_first_opened')
    assert.equal(browser.calls[0].markMsg, '{"reason":"localStorage_unavailable"}')
    assert.equal(Number(browser.calls[0].firstOpenedAt) > 0, true)
    assert.equal(browser.calls[1].body.mark_type, 'web_first_opened')
    assert.equal(browser.calls[1].body.mark_msg, '{"reason":"localStorage_unavailable"}')
    assert.equal(Number.isInteger(browser.calls[1].body.first_opened_at), true)
    assert.equal(browser.calls[1].body.first_opened_at > 0, true)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('website first opened mark reports storage unavailable when localStorage write fails', async () => {
  const { module, cleanup } = await importSharedFirstOpenedMarkModule()
  const browser = installFirstOpenedMarkBrowserGlobals({ storageWriteFails: true })

  try {
    module.initializeWebsiteFirstOpenedMark()
    await flushBrowserTasks()
    await flushBrowserTasks()

    assert.equal(browser.storage.has('homepage_first_opened_at'), false)
    assert.equal(browser.calls.length, 2)
    assert.equal(browser.calls[0].markType, 'web_first_opened')
    assert.equal(browser.calls[0].markMsg, '{"reason":"localStorage_unavailable"}')
    assert.equal(browser.calls[1].body.mark_type, 'web_first_opened')
    assert.equal(browser.calls[1].body.mark_msg, '{"reason":"localStorage_unavailable"}')
    assert.equal(Number.isInteger(browser.calls[1].body.first_opened_at), true)
  } finally {
    browser.restore()
    await cleanup()
  }
})

async function assertSlsMarkBuildsWebTrackingUrl(sourceFile, tempPrefix, expectedSite, href) {
  const { module, cleanup } = await importHomepageSlsMarkModule(sourceFile, tempPrefix)
  const restoreBrowser = installSlsBrowserGlobals({
    href,
    language: 'en-SG',
    userAgent: 'Mozilla/5.0 SLS mark URL test',
    viewport: { width: 1440, height: 900 }
  })

  try {
    const config = module.getSlsMarkConfig()
    const fields = module.buildSlsMarkFields(
      'web_parse_click',
      { deviceId: 'device-for-sls-url', token: 'secret-token' },
      'hello-from-module-test'
    )
    const url = new URL(module.buildSlsMarkUrl(config, fields))

    assert.equal(config.enabled, true)
    assert.equal(url.origin, 'https://vimeo-download-logs.ap-northeast-1.log.aliyuncs.com')
    assert.equal(url.pathname, '/logstores/vimeo-download-mark-logs/track')
    assert.equal(url.searchParams.get('APIVersion'), '0.6.0')
    assert.equal(url.searchParams.get('__topic__'), 'mark-log')
    assert.equal(url.searchParams.get('__source__'), expectedSite)
    assert.equal(url.searchParams.get('event'), 'mark-log')
    assert.equal(url.searchParams.get('site'), expectedSite)
    assert.equal(url.searchParams.get('client_product'), 'web')
    assert.equal(url.searchParams.get('mark_type'), 'web_parse_click')
    assert.equal(url.searchParams.get('mark_msg'), 'hello-from-module-test')
    assert.equal(url.searchParams.get('device_id'), 'device-for-sls-url')
    assert.equal(url.searchParams.get('page_path'), new URL(href).pathname)
    assert.equal(Number(url.searchParams.get('first_opened_at')) > 0, true)
    assert.equal(url.searchParams.get('user_agent'), 'Mozilla/5.0 SLS mark URL test')
    assert.equal(url.searchParams.get('language'), 'en-SG')
    assert.equal(url.searchParams.get('viewport'), '1440x900')
    assert.equal(Array.from(url.searchParams.values()).some(value => value.includes('secret-token')), false)
  } finally {
    restoreBrowser()
    await cleanup()
  }
}

test('homepage SLS mark builds WebTracking URL for website', async () => {
  await assertSlsMarkBuildsWebTrackingUrl(
    'src/scripts/runtime/sls-mark.ts',
    'homepage-sls-mark-',
    'website',
    `${SITE_ORIGIN}/ext-pricing/`
  )
  await assertSlsMarkBuildsWebTrackingUrl(
    path.resolve(repoDir, 'src/scripts/runtime/sls-mark.ts'),
    'shared-homepage-sls-mark-',
    'website',
    `${SITE_ORIGIN}/ext-pricing/`
  )
})

test('homepage SLS mark_msg strips user URL query and secret fields', async () => {
  const { module, cleanup } = await importHomepageSlsMarkModule(
    'src/scripts/runtime/sls-mark.ts',
    'homepage-sls-mark-sanitize-'
  )
  const restoreBrowser = installSlsBrowserGlobals()

  try {
    const fields = module.buildSlsMarkFields(
      'web_parse_click',
      { deviceId: 'device-for-sls-sanitize', token: null },
      JSON.stringify({
        url: 'https://vimeo.com/1194296700?token=secret-input-token&sig=secret-sig#fragment',
        access_token: 'secret-access-token',
        direct_url: 'https://cdn.example.com/private.mp4?download_token=secret-download-token'
      })
    )
    const url = new URL(module.buildSlsMarkUrl(module.getSlsMarkConfig(), fields))
    const markMsg = url.searchParams.get('mark_msg') ?? ''

    assert.equal(markMsg.includes('?token='), false)
    assert.equal(markMsg.includes('secret-input-token'), false)
    assert.equal(markMsg.includes('secret-sig'), false)
    assert.equal(markMsg.includes('secret-access-token'), false)
    assert.equal(markMsg.includes('secret-download-token'), false)
    assert.equal(markMsg.includes('download_token'), false)
    assert.match(markMsg, /https:\/\/vimeo\.com\/1194296700/)
    assert.match(markMsg, /"access_token":"\[redacted\]"/)
    assert.match(markMsg, /"direct_url":"\[redacted\]"/)
  } finally {
    restoreBrowser()
    await cleanup()
  }
})

test('homepage SLS keeps oversized structured mark_msg as valid JSON', async () => {
  const { module, cleanup } = await importHomepageSlsMarkModule(
    'src/scripts/runtime/sls-mark.ts',
    'homepage-sls-mark-json-limit-'
  )
  const restoreBrowser = installSlsBrowserGlobals()

  try {
    const fields = module.buildSlsMarkFields(
      'web_download_storage_preflight_blocked',
      { deviceId: 'device-for-sls-json-limit', token: null },
      JSON.stringify({ message: 'x'.repeat(1100) })
    )

    assert.deepEqual(JSON.parse(fields.mark_msg), {
      reason: 'mark_msg_exceeded_sls_limit'
    })

    const headerLikeFields = module.buildSlsMarkFields(
      'web_download_storage_preflight_blocked',
      { deviceId: 'device-for-sls-json-sanitize', token: null },
      JSON.stringify({ message: `authorization: Bearer ${'x'.repeat(1050)}` })
    )
    const headerLikePayload = JSON.parse(headerLikeFields.mark_msg)
    assert.equal(headerLikePayload.message, 'authorization=[redacted]')
    assert.equal(headerLikeFields.mark_msg.includes('x'.repeat(100)), false)
  } finally {
    restoreBrowser()
    await cleanup()
  }
})

test('frontend error capture dispatches uncaught Error to callback', async () => {
  const { module, cleanup } = await importFrontendErrorCaptureModule(
    'src/scripts/runtime/frontend-error-capture.ts',
    'frontend-error-capture-'
  )
  const browser = installFrontendErrorBrowserGlobals()
  const capturedErrors = []

  try {
    module.installFrontendErrorCapture(capturedError => {
      capturedErrors.push(capturedError)
    })
    const listener = browser.listeners.get('error')
    assert.equal(typeof listener, 'function')

    listener({
      target: browser.windowObject,
      error: new TypeError('Boom token=secret-token'),
      message: 'Boom token=secret-token',
      filename: `${SITE_ORIGIN}/assets/app.js?token=secret-token`,
      lineno: 12,
      colno: 34
    })

    assert.equal(capturedErrors.length, 1)
    assert.equal(capturedErrors[0].errorKind, 'error_event')
    assert.equal(capturedErrors[0].errorName, 'TypeError')
    assert.equal(capturedErrors[0].errorMessage, 'Boom token=secret-token')
    assert.equal(capturedErrors[0].pagePath, '/download/')
    assert.equal(capturedErrors[0].sourceFile, `${SITE_ORIGIN}/assets/app.js?token=secret-token`)
    assert.equal(capturedErrors[0].line, 12)
    assert.equal(capturedErrors[0].column, 34)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('frontend captured error SLS callback sends uncaught Error to SLS only', async () => {
  const { module, cleanup } = await importHomepageSlsMarkModule(
    'src/scripts/runtime/sls-mark.ts',
    'frontend-captured-error-sls-'
  )
  const browser = installFrontendErrorBrowserGlobals()
  const previousFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? String(init.body) : ''
    })
    return new Response('', { status: 200 })
  }

  try {
    module.reportFrontendCapturedErrorToSls({
      errorKind: 'error_event',
      errorName: 'TypeError',
      errorMessage: 'Boom token=secret-token',
      pagePath: '/download/',
      sourceFile: `${SITE_ORIGIN}/assets/app.js?token=secret-token`,
      line: 12,
      column: 34
    })
    await flushBrowserTasks()

    assert.equal(calls.length, 1)
    const url = new URL(calls[0].url)
    assert.equal(url.pathname, '/logstores/vimeo-download-mark-logs/track')
    assert.equal(url.searchParams.get('mark_type'), 'web_frontend_uncaught_error')
    assert.equal(url.searchParams.get('device_id'), browser.deviceId)
    assert.equal(calls.some(call => new URL(call.url).pathname === '/api/client/mark/record'), false)

    const markMsg = JSON.parse(url.searchParams.get('mark_msg') ?? '{}')
    assert.equal(markMsg.error_kind, 'error_event')
    assert.equal(markMsg.error_name, 'TypeError')
    assert.equal(markMsg.error_message.includes('secret-token'), false)
    assert.equal(markMsg.source_file, `${SITE_ORIGIN}/assets/app.js`)
    assert.equal(markMsg.line, 12)
    assert.equal(markMsg.column, 34)
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    browser.restore()
    await cleanup()
  }
})

test('shared frontend error capture dispatches unhandled rejection to callback', async () => {
  const { module, cleanup } = await importFrontendErrorCaptureModule(
    path.resolve(repoDir, 'src/scripts/runtime/frontend-error-capture.ts'),
    'shared-frontend-error-capture-'
  )
  const browser = installFrontendErrorBrowserGlobals({
    href: `${SITE_ORIGIN}/ext-pricing/`
  })
  const capturedErrors = []

  try {
    module.installFrontendErrorCapture(capturedError => {
      capturedErrors.push(capturedError)
    })
    const listener = browser.listeners.get('unhandledrejection')
    assert.equal(typeof listener, 'function')

    listener({
      target: browser.windowObject,
      reason: new Error('Async failed with access_token=secret-token')
    })

    assert.equal(capturedErrors.length, 1)
    assert.equal(capturedErrors[0].errorKind, 'unhandled_rejection')
    assert.equal(capturedErrors[0].errorName, 'Error')
    assert.equal(capturedErrors[0].errorMessage, 'Async failed with access_token=secret-token')
    assert.equal(capturedErrors[0].pagePath, '/ext-pricing/')
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('shared frontend captured error SLS callback reports website site', async () => {
  const { module, cleanup } = await importHomepageSlsMarkModule(
    path.resolve(repoDir, 'src/scripts/runtime/sls-mark.ts'),
    'shared-frontend-captured-error-sls-'
  )
  const browser = installFrontendErrorBrowserGlobals({
    href: `${SITE_ORIGIN}/ext-pricing/`
  })
  const previousFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? String(init.body) : ''
    })
    return new Response('', { status: 200 })
  }

  try {
    module.reportFrontendCapturedErrorToSls({
      errorKind: 'unhandled_rejection',
      errorName: 'Error',
      errorMessage: 'Async failed with access_token=secret-token',
      pagePath: '/ext-pricing/',
      sourceFile: '',
      line: 0,
      column: 0
    })
    await flushBrowserTasks()

    assert.equal(calls.length, 1)
    const url = new URL(calls[0].url)
    assert.equal(url.searchParams.get('mark_type'), 'web_frontend_uncaught_error')
    assert.equal(url.searchParams.get('site'), 'website')
    assert.equal(calls.some(call => new URL(call.url).pathname === '/api/client/mark/record'), false)

    const markMsg = JSON.parse(url.searchParams.get('mark_msg') ?? '{}')
    assert.equal(markMsg.error_kind, 'unhandled_rejection')
    assert.equal(markMsg.error_name, 'Error')
    assert.equal(markMsg.error_message.includes('secret-token'), false)
    assert.equal(markMsg.page_path, '/ext-pricing/')
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    browser.restore()
    await cleanup()
  }
})

test('frontend error capture ignores resource errors and deduplicates same error', async () => {
  const { module, cleanup } = await importFrontendErrorCaptureModule(
    'src/scripts/runtime/frontend-error-capture.ts',
    'frontend-error-capture-dedupe-'
  )
  const browser = installFrontendErrorBrowserGlobals()
  const capturedErrors = []

  try {
    module.installFrontendErrorCapture(capturedError => {
      capturedErrors.push(capturedError)
    })
    const listener = browser.listeners.get('error')
    assert.equal(typeof listener, 'function')

    listener({
      target: { tagName: 'IMG' },
      message: '',
      filename: '',
      lineno: 0,
      colno: 0
    })
    assert.equal(capturedErrors.length, 0)

    const event = {
      target: browser.windowObject,
      error: new Error('Same frontend failure'),
      message: 'Same frontend failure',
      filename: `${SITE_ORIGIN}/assets/app.js`,
      lineno: 56,
      colno: 78
    }
    listener(event)
    listener(event)

    assert.equal(capturedErrors.length, 1)
  } finally {
    browser.restore()
    await cleanup()
  }
})

test('homepage record mark keeps backend post when SLS fails', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const calls = []

  console.error = () => {}
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      path: parsedUrl.pathname,
      method: init.method ?? 'GET',
      credentials: init.credentials,
      keepalive: init.keepalive === true,
      body: init.body ? JSON.parse(String(init.body)) : null
    })

    if (parsedUrl.hostname.includes('log.aliyuncs.com')) {
      return new Response('', { status: 500, statusText: 'SLS failed' })
    }

    return new Response(JSON.stringify({ code: 10000, data: { recorded: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    await module.recordHomepageMark(
      module.HOMEPAGE_MARK_TYPE.WEB_PARSE_CLICK,
      { deviceId: 'device-for-sls-failure', token: 'access-token' },
      'sls failure should not block backend'
    )
    await flushBrowserTasks()

    assert.equal(calls.length, 2)
    assert.equal(calls[0].path, '/logstores/vimeo-download-mark-logs/track')
    assert.equal(calls[0].method, 'GET')
    assert.equal(calls[0].credentials, 'omit')
    assert.equal(calls[0].keepalive, true)
    assert.equal(calls[1].path, '/api/client/mark/record')
    assert.equal(calls[1].method, 'POST')
    assert.equal(calls[1].body.mark_type, 'web_parse_click')
    assert.equal(calls[1].body.mark_msg, 'sls failure should not block backend')
    assert.equal(Number.isInteger(calls[1].body.first_opened_at), true)
    assert.equal(calls[1].body.first_opened_at > 0, true)
  } finally {
    restoreBrowser()
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    console.error = previousConsoleError
    await cleanup()
  }
})

test('homepage record mark sends SLS before backend failure is thrown', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      path: parsedUrl.pathname,
      method: init.method ?? 'GET',
      keepalive: init.keepalive === true
    })

    if (parsedUrl.hostname.includes('log.aliyuncs.com')) {
      return new Response('', { status: 200 })
    }

    return new Response(JSON.stringify({ code: 50001, msg: 'backend mark failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    await assert.rejects(
      () =>
        module.recordHomepageMark(
          module.HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_FAILED,
          { deviceId: 'device-for-backend-failure', token: null },
          'backend failure should not cancel SLS'
        ),
      /backend mark failed/
    )

    assert.deepEqual(
      calls.map(call => call.path),
      ['/logstores/vimeo-download-mark-logs/track', '/api/client/mark/record']
    )
  } finally {
    restoreBrowser()
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    await cleanup()
  }
})

class FakeGlobalClickElement {
  constructor({ href = '', attributes = {} } = {}) {
    this.href = href
    this.attributes = Object.entries(attributes).map(([name, value]) => ({
      name,
      value
    }))
    this.attributeMap = new Map(Object.entries(attributes))
  }

  getAttribute(name) {
    return this.attributeMap.get(name) ?? null
  }

  closest(selector) {
    if (selector === 'a[href]' && this.href) {
      return this
    }
    if (selector === '[data-ga-event]' && this.attributeMap.has('data-ga-event')) {
      return this
    }
    return null
  }
}

test('global install CTA click sends SLS and keepalive mark', async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    HTMLAnchorElement: globalThis.HTMLAnchorElement,
    location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch
  }
  const clickListeners = []
  const fetchCalls = []
  const localStorageValues = new Map([
    ['homepage_device_id_v2', '123e4567-e89b-42d3-a456-426614174000'],
    ['homepage_first_opened_at', '1762345678901'],
    ['homepage_access_token', 'install-click-token']
  ])

  globalThis.Element = FakeGlobalClickElement
  globalThis.HTMLElement = FakeGlobalClickElement
  globalThis.HTMLAnchorElement = FakeGlobalClickElement
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL(`${SITE_ORIGIN}/`)
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      language: 'en-US',
      userAgent: 'Mozilla/5.0 install CTA test'
    }
  })
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    localStorage: {
      getItem(key) {
        return localStorageValues.get(key) ?? null
      },
      setItem(key, value) {
        localStorageValues.set(key, String(value))
      },
      removeItem(key) {
        localStorageValues.delete(key)
      }
    }
  }
  globalThis.document = {
    title: 'Vimeo Video Downloader',
    documentElement: { lang: 'en-US' },
    addEventListener(type, listener) {
      if (type === 'click') {
        clickListeners.push(listener)
      }
    }
  }
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    fetchCalls.push({
      href: parsedUrl.href,
      path: parsedUrl.pathname,
      method: init.method ?? 'GET',
      keepalive: init.keepalive === true,
      credentials: init.credentials,
      body: init.body ? JSON.parse(String(init.body)) : null
    })
    return new Response(JSON.stringify({ code: 10000, data: { recorded: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const importedModule = await importGlobalClickEventsModule()

  try {
    const target = new FakeGlobalClickElement({
      href: 'https://chromewebstore.google.com/detail/vimeo-video-downloader/example',
      attributes: {
        'data-ga-event': 'chrome_web_store_click',
        'data-ga-source': 'hero_install'
      }
    })
    assert.equal(clickListeners.length, 1)
    clickListeners[0]({ target })
    await flushBrowserTasks()
    await flushBrowserTasks()

    assert.equal(fetchCalls.length, 2)
    assert.equal(new URL(fetchCalls[0].href).hostname, 'vimeo-download-logs.ap-northeast-1.log.aliyuncs.com')
    assert.equal(fetchCalls[0].path, '/logstores/vimeo-download-mark-logs/track')
    assert.equal(fetchCalls[0].credentials, 'omit')
    assert.equal(fetchCalls[0].keepalive, true)
    assert.equal(new URL(fetchCalls[0].href).searchParams.get('mark_type'), 'web_extension_install_click')
    assert.equal(new URL(fetchCalls[0].href).searchParams.get('user_agent'), 'Mozilla/5.0 install CTA test')
    assert.equal(new URL(fetchCalls[0].href).searchParams.get('first_opened_at'), '1762345678901')
    assert.equal(fetchCalls[1].path, '/api/client/mark/record')
    assert.equal(fetchCalls[1].method, 'POST')
    assert.equal(fetchCalls[1].keepalive, true)
    assert.equal(fetchCalls[1].body.mark_type, 'web_extension_install_click')
    assert.equal(fetchCalls[1].body.first_opened_at, 1762345678901)
  } finally {
    await importedModule.cleanup()
    if (previous.document === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previous.document
    }
    if (previous.window === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previous.window
    }
    if (previous.Element === undefined) {
      delete globalThis.Element
    } else {
      globalThis.Element = previous.Element
    }
    if (previous.HTMLElement === undefined) {
      delete globalThis.HTMLElement
    } else {
      globalThis.HTMLElement = previous.HTMLElement
    }
    if (previous.HTMLAnchorElement === undefined) {
      delete globalThis.HTMLAnchorElement
    } else {
      globalThis.HTMLAnchorElement = previous.HTMLAnchorElement
    }
    restoreGlobalProperty('location', previous.location)
    restoreGlobalProperty('navigator', previous.navigator)
    if (previous.fetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previous.fetch
    }
  }
})

test('Google SDK 未加载完整时取消登录不抛异常', async () => {
  const previousWindow = globalThis.window
  const { module, cleanup } = await importHomepageAuthModule(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'google-partial-sdk-'
  )
  try {
    for (const google of [undefined, {}, { accounts: {} }]) {
      globalThis.window = { google }
      assert.doesNotThrow(() => module.cancelGoogleRedirectPrompt('测试 SDK 未就绪'))
    }
    let cancelled = false
    globalThis.window = { google: { accounts: { id: { cancel() { cancelled = true } } } } }
    module.cancelGoogleRedirectPrompt('测试 SDK 已就绪')
    assert.equal(cancelled, true)
  } finally {
    globalThis.window = previousWindow
    await cleanup()
  }
})

test('homepage auth failure classifier keeps token for network and server errors', async () => {
  const { module, cleanup } = await importHomepageApiModule()

  try {
    assert.equal(module.isHomepageAuthFailure(new TypeError('Failed to fetch')), false)
    assert.equal(
      module.isHomepageAuthFailure(new module.HomepageApiError('server unavailable', 503)),
      false
    )
    assert.equal(
      module.isHomepageAuthFailure(new module.HomepageApiError('token expired', 401, 10013)),
      true
    )
    assert.equal(
      module.isHomepageAuthFailure(new module.HomepageApiError('token revoked', 200, 10014)),
      false
    )
  } finally {
    await cleanup()
  }
})

test('homepage postJson wraps timeout as detailed API error', async () => {
  const { module, cleanup } = await importHomepageApiModule()
  const previousFetch = globalThis.fetch
  const previousDocument = globalThis.document
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  globalThis.document = { documentElement: { lang: 'en-US' } }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  try {
    await assert.rejects(
      () =>
        module.postJson(
          '/api/client/media/parse-pre-v2',
          GOOGLE_TEST_REQUEST_CONTEXT,
          { link: 'https://vimeo.com/1194296700' },
          { timeoutMs: 1 }
        ),
      (error) => {
        assert.equal(error instanceof module.HomepageApiError, true)
        assert.equal(error.code, 'REQUEST_TIMEOUT')
        assert.equal(error.status, 0)
        assert.match(error.failureReason, /api_post_failed: path=\/api\/client\/media\/parse-pre-v2/)
        assert.match(error.failureReason, /reason=REQUEST_TIMEOUT after 1ms/)
        return true
      }
    )
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('homepage api reports backend network failure to SLS only', async () => {
  const { module, cleanup } = await importHomepageApiModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const calls = []

  console.error = () => {}
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? String(init.body) : ''
    })

    if (parsedUrl.hostname.includes('log.aliyuncs.com')) {
      return new Response('', { status: 200 })
    }

    throw new TypeError('Failed to fetch token=secret-token')
  }

  try {
    await assert.rejects(
      () =>
        module.postJson('/api/client/media/parse-pre-v2', GOOGLE_TEST_REQUEST_CONTEXT, {
          link: 'https://vimeo.com/1194296700'
        }),
      (error) => {
        assert.equal(error instanceof module.HomepageApiError, true)
        assert.equal(error.code, 'NETWORK_ERROR')
        assert.equal(error.status, 0)
        return true
      }
    )
    await flushBrowserTasks()

    const slsCalls = calls.filter(call => new URL(call.url).hostname.includes('log.aliyuncs.com'))
    assert.equal(slsCalls.length, 1)
    assert.equal(calls.some(call => new URL(call.url).pathname === '/api/client/mark/record'), false)

    const url = new URL(slsCalls[0].url)
    const markMsg = JSON.parse(url.searchParams.get('mark_msg') ?? '{}')
    assert.equal(url.searchParams.get('mark_type'), 'web_backend_connect_failed')
    assert.equal(markMsg.method, 'POST')
    assert.equal(markMsg.api_path, '/api/client/media/parse-pre-v2')
    assert.equal(markMsg.failure_reason, 'NETWORK_ERROR')
    assert.equal(markMsg.error_name, 'TypeError')
    assert.equal(markMsg.error_message.includes('secret-token'), false)
    assert.equal(markMsg.timeout_ms, null)
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    console.error = previousConsoleError
    restoreBrowser()
    await cleanup()
  }
})

test('homepage api reports backend timeout to SLS only', async () => {
  const { module, cleanup } = await importHomepageApiModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const calls = []

  console.error = () => {}
  globalThis.fetch = (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      url: String(url),
      method: init.method ?? 'GET'
    })

    if (parsedUrl.hostname.includes('log.aliyuncs.com')) {
      return Promise.resolve(new Response('', { status: 200 }))
    }

    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  }

  try {
    await assert.rejects(
      () =>
        module.postJson(
          '/api/client/media/parse-pre-v2',
          GOOGLE_TEST_REQUEST_CONTEXT,
          { link: 'https://vimeo.com/1194296700' },
          { timeoutMs: 1 }
        ),
      (error) => {
        assert.equal(error instanceof module.HomepageApiError, true)
        assert.equal(error.code, 'REQUEST_TIMEOUT')
        assert.equal(error.status, 0)
        return true
      }
    )
    await flushBrowserTasks()

    const slsCalls = calls.filter(call => new URL(call.url).hostname.includes('log.aliyuncs.com'))
    assert.equal(slsCalls.length, 1)

    const markMsg = JSON.parse(new URL(slsCalls[0].url).searchParams.get('mark_msg') ?? '{}')
    assert.equal(markMsg.method, 'POST')
    assert.equal(markMsg.api_path, '/api/client/media/parse-pre-v2')
    assert.equal(markMsg.failure_reason, 'REQUEST_TIMEOUT')
    assert.equal(markMsg.error_name, 'AbortError')
    assert.equal(markMsg.timeout_ms, 1)
    assert.equal(calls.some(call => new URL(call.url).pathname === '/api/client/mark/record'), false)
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    console.error = previousConsoleError
    restoreBrowser()
    await cleanup()
  }
})

test('homepage api does not report HTTP failures as backend connect failures', async () => {
  const { module, cleanup } = await importHomepageApiModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET'
    })
    return new Response(JSON.stringify({ code: 50001, msg: 'backend failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }

  try {
    await assert.rejects(
      () =>
        module.postJson('/api/client/media/parse-pre-v2', GOOGLE_TEST_REQUEST_CONTEXT, {
          link: 'https://vimeo.com/1194296700'
        }),
      /backend failed/
    )

    assert.equal(calls.length, 1)
    assert.equal(calls.some(call => new URL(call.url).hostname.includes('log.aliyuncs.com')), false)
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    restoreBrowser()
    await cleanup()
  }
})

test('homepage postJson preserves backend error data failure reason', async () => {
  const { module, cleanup } = await importHomepageApiModule()
  const previousFetch = globalThis.fetch
  const previousDocument = globalThis.document
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  const failureReason =
    'media_parse_failed: platform=vimeo, code=INTERNAL_SERVER_ERROR(500), detail=parse timeout'

  globalThis.document = { documentElement: { lang: 'en-US' } }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 50001,
        msg: 'backend parse failed',
        data: {
          failure_reason: failureReason,
          retryable: false
        }
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    )

  try {
    await assert.rejects(
      () =>
        module.postJson('/api/client/media/parse-pre-v2', GOOGLE_TEST_REQUEST_CONTEXT, {
          link: 'https://vimeo.com/1194296700'
        }),
      (error) => {
        assert.equal(error instanceof module.HomepageApiError, true)
        assert.equal(error.status, 400)
        assert.equal(error.code, 50001)
        assert.equal(error.failureReason, failureReason)
        assert.deepEqual(error.data, {
          failure_reason: failureReason,
          retryable: false
        })
        return true
      }
    )
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('media download allowlist accepts media suffix or MIME and denies risky suffix first', async () => {
  const { module, cleanup } = await importMediaDownloadAllowlistModule()

  try {
    for (const [filename, mimeType] of [
      ['instagram-comments-format-example.csv', 'text/csv'],
      ['notes.TXT', 'application/octet-stream'],
      ['table.tsv', undefined],
      ['readme.md', undefined],
      ['data.json', 'application/json'],
      ['app.log', 'text/plain']
    ]) {
      assert.equal(module.isWebDownloadMediaAllowed({ filename, mimeType }), true, filename)
    }
    for (const filename of ['script.sh', 'script.js', 'archive.zip', 'unknown']) {
      assert.equal(
        module.isWebDownloadMediaAllowed({ filename, mimeType: 'text/plain' }),
        false,
        filename
      )
    }
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'clip', mimeType: 'video/mp4' }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'clip.480', mimeType: 'video/mp4' }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'setup.exe', mimeType: 'video/mp4' }),
      false
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'demo.mp4', mimeType: undefined }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'report.pdf', mimeType: undefined }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({
        filename: 'document',
        mimeType: 'application/pdf'
      }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'brief.docx', mimeType: undefined }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({
        filename: 'slides',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({ filename: 'sheet.xlsx', mimeType: undefined }),
      true
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({
        filename: 'archive.zip',
        mimeType: 'video/mp4; charset=utf-8'
      }),
      false
    )
    assert.equal(
      module.isWebDownloadMediaAllowed({
        filename: 'unknown',
        mimeType: 'application/octet-stream'
      }),
      false
    )
  } finally {
    await cleanup()
  }
})

test('workspace errors maps media download allowlist rejection to extension guidance copy', async () => {
  const { module, cleanup } = await importWorkspaceErrorsModule()
  const unsafeCopy =
    'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.'
  const copy = {
    errors: {
      unsafeFileTypeUseExtension: unsafeCopy,
      downloadFailed: 'fallback download failed'
    }
  }
  const error = new Error('backend rejected file type')
  error.code = 24049

  try {
    assert.equal(module.isUnsafeFileTypeError(error), true)
    assert.equal(module.mapErrorToCopy(copy, error, 'fallback'), unsafeCopy)
  } finally {
    await cleanup()
  }
})

test('workspace download all shows unsafe guidance when backend rejects an allowed-looking resource', async () => {
  const { module, cleanup } = await importWorkspaceDownloadModuleWithMockedDispatcher()
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const storageValues = new Map([['homepage_access_token', 'token-1']])
  const unsafeCopy =
    'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.'
  const downloads = []
  let scrollCount = 0
  let scrollTarget = null
  let confirmCallCount = 0
  let confirmOptions = null

  const createElement = (textContent = '') => ({
    hidden: false,
    textContent,
    dataset: {},
    disabled: false,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 320, bottom: 420, width: 640, height: 100 }),
    scrollIntoView: () => {}
  })
  const parseError = createElement()
  const largeFileExtensionGuide = createElement()
  largeFileExtensionGuide.hidden = true
  const elements = {
    root: createElement(),
    downloadAllButton: createElement('Download all (2)'),
    largeFileExtensionGuide,
    parseError,
    pendingResumeActions: createElement(),
    pendingResumeHint: createElement(),
    pendingResumeContinue: createElement()
  }
  const resources = ['source-1', 'source-2'].map(sourceId => ({
    sourceId,
    resourceToken: `token-${sourceId}`,
    filename: `${sourceId}.mp4`,
    type: 'video',
    size: 1024,
    link: `https://vimeo.com/${sourceId}`,
    mimeType: 'video/mp4',
    platform: 'vimeo',
    downloadMode: 'direct',
    capabilities: {
      download: true,
      play: false
    }
  }))
  const state = {
    activeDownload: false,
    copy: {
      auth: {
        modalTitle: 'Sign in'
      },
      parse: {
        downloadAll: 'Download all',
        downloadingAll: 'Downloading all...'
      },
      errors: {
        unsafeFileTypeUseExtension: unsafeCopy,
        unsafeFileTypeConfirmTitle: 'Use the browser extension',
        unsafeFileTypeConfirmViewExtension: 'View extension download',
        unsafeFileTypeConfirmCancel: 'Cancel',
        downloadFailed: 'Failed to download this file.'
      },
      downloadAll: {
        allSuccess: 'All files downloaded.',
        partialFailed: 'Some files failed.',
        allFailed: 'All downloads failed.'
      }
    },
    deviceId: 'device-1',
    pendingDownloadTask: null,
    resources,
  }

  globalThis.window = {
    scrollY: 80,
    scrollTo(options) {
      scrollCount += 1
      scrollTarget = options
    },
    localStorage: {
      getItem(key) {
        return storageValues.has(key) ? storageValues.get(key) : null
      },
      setItem(key, value) {
        storageValues.set(key, String(value))
      },
      removeItem(key) {
        storageValues.delete(key)
      }
    },
    async siteConfirmAction(options) {
      confirmCallCount += 1
      confirmOptions = options
      assert.equal(parseError.textContent, unsafeCopy)
      assert.equal(scrollCount, 0)
      return true
    }
  }
  globalThis.document = { documentElement: { lang: 'en-US' } }
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 10000, data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  globalThis.__workspaceDownloadTestDownloads = downloads
  globalThis.__workspaceDownloadTestCreateError = resource => {
    const error = new Error(`file type rejected for ${resource.sourceId}`)
    error.code = 24049
    return error
  }

  try {
    await module.handleDownloadAllClick(elements, state, {
      onRenderResults() {}
    })
    await flushBrowserTasks()

    assert.equal(downloads.length, 2)
    assert.equal(confirmCallCount, 1)
    assert.deepEqual(confirmOptions, {
      title: 'Use the browser extension',
      message: unsafeCopy,
      confirmLabel: 'View extension download',
      cancelLabel: 'Cancel'
    })
    assert.equal(parseError.textContent, unsafeCopy)
    assert.equal(parseError.hidden, false)
    assert.equal(largeFileExtensionGuide.hidden, false)
    assert.equal(scrollCount, 1)
    assert.deepEqual(scrollTarget, { top: 400, behavior: 'smooth' })
    assert.equal(state.activeDownload, false)
    assert.equal(elements.downloadAllButton.textContent, 'Download all (2)')
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    await cleanup()
  }
})

test('workspace storage preflight blocks download all and guides to the extension guide', async () => {
  const { module, cleanup } = await importWorkspaceDownloadModuleWithMockedDispatcher()
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalConsoleWarn = console.warn
  const storageValues = new Map([['homepage_access_token', 'token-1']])
  const downloads = []
  const mib = 1024 * 1024
  const storageCopy = 'Storage low: {file_size}/{available_space}/{required_space}'
  let scrollCount = 0
  let confirmOptions = null
  const fetchUrls = []
  const markPayloads = []
  const navigationDownloads = []

  const createElement = (textContent = '') => ({
    hidden: false,
    textContent,
    dataset: {},
    disabled: false,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 320, bottom: 420, width: 640, height: 100 }),
    scrollIntoView: () => {}
  })
  const parseError = createElement()
  const largeFileExtensionGuide = createElement()
  largeFileExtensionGuide.hidden = true
  const elements = {
    root: createElement(),
    downloadAllButton: createElement('Download all (2)'),
    largeFileExtensionGuide,
    parseError,
    pendingResumeActions: createElement(),
    pendingResumeHint: createElement(),
    pendingResumeContinue: createElement()
  }
  const resources = ['source-storage-1', 'source-storage-2'].map(sourceId => ({
    sourceId,
    resourceToken: `token-${sourceId}`,
    filename: `${sourceId}.mp4`,
    type: 'video',
    size: 50 * mib,
    link: `https://vimeo.com/${sourceId}`,
    mimeType: 'video/mp4',
    platform: 'vimeo',
    downloadMode: 'direct',
    capabilities: {
      download: true,
      play: false
    }
  }))
  const state = {
    activeDownload: false,
    copy: {
      auth: {
        modalTitle: 'Sign in'
      },
      parse: {
        downloadAll: 'Download all',
        downloadingAll: 'Downloading all...',
        checkingStorage: 'Checking browser storage...'
      },
      errors: {
        browserStorageInsufficientUseExtension: storageCopy,
        browserStorageInsufficientConfirmTitle: 'Not enough browser storage',
        browserStorageInsufficientConfirmViewExtension: 'View extension download',
        browserStorageInsufficientConfirmCancel: 'Cancel',
        downloadFailed: 'Failed to download this file.'
      },
      downloadAll: {
        allSuccess: 'All files downloaded.',
        partialFailed: 'Some files failed.',
        allFailed: 'All downloads failed.'
      }
    },
    deviceId: 'device-1',
    pendingDownloadTask: null,
    resources,
  }

  console.warn = () => {}
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    screen: {
      width: 390,
      height: 844
    },
    scrollY: 80,
    scrollTo() {
      scrollCount += 1
    },
    localStorage: {
      getItem(key) {
        return storageValues.has(key) ? storageValues.get(key) : null
      },
      setItem(key, value) {
        storageValues.set(key, String(value))
      },
      removeItem(key) {
        storageValues.delete(key)
      }
    },
    async siteConfirmAction(options) {
      confirmOptions = options
      return true
    }
  }
  globalThis.document = {
    documentElement: { lang: 'en-US' },
    body: {
      append() {}
    },
    createElement(tagName) {
      assert.equal(tagName, 'a')
      return {
        href: '',
        download: '',
        target: '',
        rel: '',
        referrerPolicy: '',
        style: {},
        click() {
          navigationDownloads.push({
            href: this.href,
            target: this.target,
            rel: this.rel,
            referrerPolicy: this.referrerPolicy
          })
        },
        remove() {}
      }
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0 Mobile Safari test',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPhone',
      language: 'en-US',
      languages: ['en-US', 'en'],
      deviceMemory: 4,
      hardwareConcurrency: 6,
      maxTouchPoints: 5,
      cookieEnabled: true,
      onLine: true,
      storage: {
        async estimate() {
          return {
            quota: 100 * mib,
            usage: 90 * mib
          }
        }
      }
    }
  })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    fetchUrls.push(href)
    if (href.endsWith('/api/client/mark/record') && typeof init.body === 'string') {
      markPayloads.push(JSON.parse(init.body))
    }
    return new Response(JSON.stringify({ code: 10000, data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  globalThis.__workspaceDownloadTestDownloads = downloads
  globalThis.__workspaceDownloadTestResult = {
    completion: {
      kind: 'object_url',
      objectUrl: 'blob:workspace-download-test',
      filename: 'resource.mp4',
      revokeAfterMs: 1000
    },
    retryCount: 0
  }

  try {
    await module.handleDownloadAllClick(elements, state, {
      onRenderResults() {}
    })
    await flushBrowserTasks()

    assert.equal(fetchUrls.some(url => url.endsWith('/api/client/media/download-pre-v2')), false)
    assert.equal(downloads.length, 0)
    assert.equal(navigationDownloads.length, 0)
    const blockedMarks = markPayloads.filter(
      payload => payload.mark_type === 'web_download_storage_preflight_blocked'
    )
    assert.equal(blockedMarks.length, 1)
    assert.equal(JSON.parse(blockedMarks[0].mark_msg).download_mode, 'direct')
    assert.deepEqual(confirmOptions, {
      title: 'Not enough browser storage',
      message: 'Storage low: 50 MiB/10 MiB/114 MiB',
      confirmLabel: 'View extension download',
      cancelLabel: 'Cancel'
    })
    assert.equal(parseError.textContent, 'Storage low: 50 MiB/10 MiB/114 MiB')
    assert.equal(largeFileExtensionGuide.hidden, false)
    assert.equal(scrollCount, 1)
    assert.equal(state.activeDownload, false)
    assert.equal(elements.downloadAllButton.textContent, 'Download all (2)')
  } finally {
    console.warn = originalConsoleWarn
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('shared media api keeps node unavailable as business error without synthetic 503', async () => {
  const { module, cleanup } = await importSharedMediaApiModule()
  const previousFetch = globalThis.fetch
  const previousDocument = globalThis.document
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const nodeUnavailableCode = 24034

  globalThis.document = { documentElement: { lang: 'en-US' } }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.endsWith('/api/client/media/parse-pre-v2')) {
      return new Response(
        JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            nodes: [
              { node_id: 1, url: 'https://node-a.example.com/api/client/media/parse-v2' },
              { node_id: 2, url: 'https://node-b.example.com/api/client/media/parse-v2' }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        code: nodeUnavailableCode,
        msg: 'node unavailable',
        data: { failure_reason: `test_node_unavailable: url=${href}` }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  try {
    await assert.rejects(
      () => module.parseMediaLink('https://vimeo.com/1194296700', GOOGLE_TEST_REQUEST_CONTEXT),
      (error) => {
        assert.equal(error.name, 'HomepageApiError')
        assert.equal(error.status, 200)
        assert.equal(error.code, nodeUnavailableCode)
        assert.match(error.failureReason, /test_node_unavailable/)
        return true
      }
    )
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('shared media api reports node network failure to SLS only', async () => {
  const { module, cleanup } = await importSharedMediaApiModule()
  const restoreBrowser = installSlsBrowserGlobals()
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const calls = []

  console.error = () => {}
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? String(init.body) : ''
    })

    if (parsedUrl.hostname.includes('log.aliyuncs.com')) {
      return new Response('', { status: 200 })
    }

    if (parsedUrl.pathname === '/api/client/media/parse-pre-v2') {
      return new Response(
        JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            nodes: [
              { node_id: 1, url: 'https://node-a.example.com/api/client/media/parse-v2?token=secret' }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    throw new TypeError('Node fetch failed access_token=secret-token')
  }

  try {
    await assert.rejects(
      () => module.parseMediaLink('https://vimeo.com/1194296700', GOOGLE_TEST_REQUEST_CONTEXT),
      (error) => {
        assert.equal(error.name, 'HomepageApiError')
        assert.equal(error.status, 0)
        assert.equal(error.code, 'NETWORK_ERROR')
        return true
      }
    )
    await flushBrowserTasks()

    const slsCalls = calls.filter(call => new URL(call.url).hostname.includes('log.aliyuncs.com'))
    assert.equal(slsCalls.length, 1)
    assert.equal(calls.some(call => new URL(call.url).pathname === '/api/client/mark/record'), false)

    const url = new URL(slsCalls[0].url)
    const markMsg = JSON.parse(url.searchParams.get('mark_msg') ?? '{}')
    assert.equal(url.searchParams.get('mark_type'), 'web_backend_connect_failed')
    assert.equal(markMsg.method, 'POST')
    assert.equal(markMsg.api_path, '/api/client/media/parse-v2')
    assert.equal(markMsg.failure_reason, 'NETWORK_ERROR')
    assert.equal(markMsg.error_name, 'TypeError')
    assert.equal(markMsg.error_message.includes('secret-token'), false)
    // 节点 JSON 准备预算 70s（采集+清单 60s + 传输余量），SLS 上报的是该请求实际使用的超时。
    assert.equal(markMsg.timeout_ms, 70000)
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch
    } else {
      globalThis.fetch = previousFetch
    }
    console.error = previousConsoleError
    restoreBrowser()
    await cleanup()
  }
})

test('homepage parse failed mark message includes backend failure reason', async () => {
  const { module, apiModule, cleanup } = await importHomepageMarkModule()
  const failureReason =
    'media_parse_failed: platform=vimeo, code=INTERNAL_SERVER_ERROR(500), detail=parse timeout https://cdn.example.com/video.mp4?token=secret-cdn&sig=secret-cdn-sig {"access_token":"secret-token","sig":"secret-sig"} {"headers":{"Authorization":"Bearer secret-header","Cookie":"sid=secret-cookie"}} {"download_url":"https://direct.example.com/file.mp4?access_token=secret-direct"} {\'direct_url\': \'https://single.example.com/file.mp4?token=secret-single\'}'

  try {
    const markMsg = module.buildHomepageParseFailedMarkMessage(
      'https://vimeo.com/1194296700?token=secret-input#frag',
      {
        reason: 'server_error',
        platform: 'vimeo',
        linkHost: 'vimeo.com',
        parseDurationMs: 42,
        error: new apiModule.HomepageApiError('backend parse failed', 400, 50001, {
          failure_reason: failureReason,
          retryable: false
        })
      }
    )
    const payload = JSON.parse(markMsg)

    assert.equal(payload.url, 'https://vimeo.com/1194296700')
    assert.equal(payload.reason, 'server_error')
    assert.equal(payload.error.phase, 'parse')
    assert.match(payload.error.message, /parse timeout https:\/\/cdn\.example\.com\/video\.mp4/)
    assert.match(payload.error.message, /"access_token":"\[redacted\]"/)
    assert.match(payload.error.message, /"headers":"\[redacted\]"/)
    assert.equal(payload.error.status, 400)
    assert.equal(payload.error.code, 50001)
    assert.doesNotMatch(markMsg, /secret-token/)
    assert.doesNotMatch(markMsg, /secret-sig/)
    assert.doesNotMatch(markMsg, /secret-cookie/)
    assert.doesNotMatch(markMsg, /secret-header/)
    assert.doesNotMatch(markMsg, /secret-direct/)
    assert.doesNotMatch(markMsg, /secret-single/)
    assert.doesNotMatch(markMsg, /secret-cdn/)
    assert.doesNotMatch(markMsg, /\?token=/)
  } finally {
    await cleanup()
  }
})

test('storage preflight mark keeps only compact diagnostics and valid JSON', async () => {
  const { module, cleanup } = await importSharedHomepageMarkModule()

  try {
    const markMsg = module.buildHomepageStoragePreflightMarkMessage(
      'https://vimeo.com/1194296700?token=secret-input#fragment',
      {
        downloadMode: 'direct',
        reason: 'opfs_unavailable_for_large_file',
        fileSizeBytes: 2_238_550_410,
        availableBytes: 2_147_482_433,
        requiredBytes: 2_574_332_972,
        browserInfo: {
          userAgent: `Mozilla/5.0 ${'Long Android WebView '.repeat(20)}`,
          deviceMemory: 0.5
        },
        causeName: 'QuotaExceededError',
        causeMessage:
          'OPFS probe failed for https://cdn.example.com/file.mp4?token=secret-cause'
      }
    )
    const payload = JSON.parse(markMsg)

    assert.equal(markMsg.length <= 1000, true)
    assert.deepEqual(Object.keys(payload).sort(), [
      'available_bytes',
      'browser',
      'cause',
      'download_mode',
      'file_size_bytes',
      'reason',
      'required_bytes',
      'url'
    ])
    assert.equal(payload.url, 'https://vimeo.com/1194296700')
    assert.equal(payload.browser.device_memory, 0.5)
    assert.deepEqual(Object.keys(payload.browser).sort(), ['device_memory', 'user_agent'])
    assert.equal(payload.cause.name, 'QuotaExceededError')
    assert.equal(payload.cause.message.includes('secret-cause'), false)
    const unknownSize = JSON.parse(module.buildHomepageStoragePreflightMarkMessage(
      'https://vimeo.com/123',
      {
        downloadMode: 'client_mux',
        reason: 'opfs_unavailable_for_large_file',
        fileSizeBytes: null,
        requiredBytes: null
      }
    ))
    assert.equal(unknownSize.file_size_bytes, null)
    assert.equal(unknownSize.required_bytes, null)
    assert.equal('error' in payload, false)
    assert.equal('storage' in payload, false)
  } finally {
    await cleanup()
  }
})

test('homepage download mark message keeps preferred node id when compacted', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const resource = {
    sourceId: 'source-1',
    filename: 'demo.mp4',
    type: 'video',
    size: 2048,
    link: 'https://vimeo.com/123',
    platform: 'vimeo',
    downloadMode: 'direct',
    preferredNodeId: 42,
    capabilities: {
      download: true,
      play: false
    }
  }

  try {
    const fullPayload = JSON.parse(
      module.buildHomepageMarkMessage('https://vimeo.com/123', resource)
    )
    assert.equal(fullPayload.resources[0].preferred_node_id, 42)

    const compactPayload = JSON.parse(
      module.buildHomepageDownloadFailedMarkMessage(
        'https://vimeo.com/123',
        {
          ...resource,
          filename: `${'long-name-'.repeat(40)}demo.mp4`
        },
        new Error('download failed with a very long message '.repeat(20))
      )
    )
    assert.equal(compactPayload.resources[0].preferred_node_id, 42)
  } finally {
    await cleanup()
  }
})

test('homepage download failed mark message includes backend failure reason', async () => {
  const { module, apiModule, cleanup } = await importHomepageMarkModule()
  const failureReason =
    'resource_token_verification_failed: InvalidSignatureError token=secret-token'
  const error = new apiModule.HomepageApiError('Invalid download request', 200, 24044, {
    failure_reason: failureReason,
    reason: 'resource_token_verification_failed'
  })
  error.task = {
    sourceId: 'source-1',
    filename: 'demo.mp4',
    downloadedBytes: 0,
    totalBytes: 3456789,
    speedBytesPerSecond: 0
  }

  try {
    const payload = JSON.parse(
      module.buildHomepageDownloadFailedMarkMessage(
        'https://vimeo.com/123?token=secret-input',
        {
          sourceId: 'source-1',
          filename: 'demo.mp4',
          type: 'video',
          size: 3456789,
          link: 'https://vimeo.com/123',
          platform: 'vimeo',
          downloadMode: 'direct',
          preferredNodeId: 42
        },
        error
      )
    )

    assert.equal(payload.error.code, 24044)
    assert.match(
      payload.error.message,
      /resource_token_verification_failed: InvalidSignatureError token=\[redacted\]/
    )
    assert.equal(payload.download_stats.reason, payload.error.message)
    assert.equal(payload.download_stats.bytes_done, 0)
    assert.equal(payload.download_stats.bytes_total, 3456789)
    assert.equal(payload.retry_count, 0)
    assert.doesNotMatch(JSON.stringify(payload), /secret-token/)
    assert.doesNotMatch(JSON.stringify(payload), /\?token=/)
  } finally {
    await cleanup()
  }
})

test('homepage download failed mark message includes compact-safe download stats', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const resources = [1, 2, 3].map((index) => ({
    sourceId: `source-${index}-${'id-'.repeat(30)}`,
    filename: `${'stats-resource-'.repeat(30)}${index}.mp4`,
    type: `video-${'kind-'.repeat(8)}${index}`,
    size: 4096 + index,
    link: `https://vimeo.com/${index}`,
    platform: 'vimeo',
    downloadMode: 'direct'
  }))
  const error = new Error(
    'network closed while streaming https://cdn.example.com/video.mp4?token=secret-download '.repeat(
      20
    )
  )
  error.task = {
    sourceId: 'source-1',
    filename: `${'stats-checkpoint-'.repeat(30)}demo.mp4`,
    downloadedBytes: 1536.9,
    totalBytes: 4096.2,
    speedBytesPerSecond: Number.POSITIVE_INFINITY,
    averageBytesPerSecond: 256.8,
    averageBps: 128,
    persistent: true
  }

  try {
    const payload = JSON.parse(
      module.buildHomepageDownloadFailedMarkMessage(
        'https://vimeo.com/123?token=secret-input',
        resources,
        error,
        3
      )
    )

    assert.ok(payload.download_stats)
    assert.equal(payload.download_stats.bytes_done, 1536)
    assert.equal(payload.download_stats.bytes_total, 4096)
    assert.equal(payload.download_stats.average_bps, 256)
    assert.match(payload.download_stats.reason, /network closed while streaming/)
    assert.equal(payload.auto_resume, true)
    assert.equal(payload.retry_count, 3)
    assert.equal(payload.checkpoint.downloaded_bytes, 1536)
    assert.equal(payload.checkpoint.total_bytes, 4096)
    assert.equal(payload.checkpoint.persistent, true)
    assert.doesNotMatch(JSON.stringify(payload.download_stats), /secret-download/)
    assert.equal(payload.resources[0].filename, undefined)
    assert.equal(payload.resources[0].size, undefined)
  } finally {
    await cleanup()
  }
})

test('homepage download failed mark message includes auto resume diagnostics', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const error = new Error(
    '[download-range-stream] auto Range resume exhausted, reason=direct stream made no progress for 3 consecutive retries, sourceId=source-auto-resume, downloadedBytes=115470144, totalBytes=143639972, retryCount=1, retryLimit=3, cause=RangeResumeResponseError: Content-Range start mismatch token=secret-download'
  )
  error.name = 'AutoRangeResumeExhaustedError'
  error.reason = 'direct_consecutive_empty_retries'
  error.causeName = 'RangeResumeResponseError'
  error.causeMessage = 'Content-Range start mismatch token=secret-cause'
  error.task = {
    sourceId: 'source-auto-resume',
    filename: 'MYANMAR VINA Vol-7.mp3',
    downloadedBytes: 115470144,
    totalBytes: 143639972,
    speedBytesPerSecond: 875799
  }

  try {
    const payload = JSON.parse(
      module.buildHomepageDownloadFailedMarkMessage(
        'https://vimeo.com/507?token=secret-input',
        {
          sourceId: 'source-auto-resume',
          filename: 'MYANMAR VINA Vol-7.mp3',
          type: 'audio',
          size: 143639972,
          link: 'https://vimeo.com/507',
          platform: 'vimeo',
          downloadMode: 'direct',
          preferredNodeId: 2
        },
        error,
        1
      )
    )

    assert.equal(payload.error.name, 'AutoRangeResumeExhaustedError')
    assert.equal(payload.error.reason, 'direct_consecutive_empty_retries')
    assert.equal(payload.error.cause_name, 'RangeResumeResponseError')
    assert.match(payload.error.message, /direct stream made no progress for 3 consecutive retries/)
    assert.match(payload.error.cause_message, /Content-Range start mismatch token=\[redacted\]/)
    assert.equal(payload.retry_count, 1)
    assert.equal(payload.download_stats.bytes_done, 115470144)
    assert.equal(payload.checkpoint.downloaded_bytes, 115470144)
    assert.doesNotMatch(JSON.stringify(payload), /secret-download/)
    assert.doesNotMatch(JSON.stringify(payload), /secret-cause/)
    assert.doesNotMatch(JSON.stringify(payload), /secret-input/)
  } finally {
    await cleanup()
  }
})

test('homepage download success mark message includes download stats', async () => {
  const { module, cleanup } = await importHomepageMarkModule()
  const resource = {
    sourceId: 'source-success-1',
    filename: 'success.mp4',
    type: 'video',
    size: 4096,
    link: 'https://vimeo.com/success',
    platform: 'vimeo',
    downloadMode: 'direct',
    preferredNodeId: 42,
    capabilities: {
      download: true,
      play: false
    }
  }

  try {
    const payload = JSON.parse(
      module.buildHomepageDownloadSuccessMarkMessage(
        'https://vimeo.com/success?token=secret-input',
        resource,
        {
          sourceId: 'source-success-1',
          filename: 'success.mp4',
          downloadedBytes: 4096.9,
          totalBytes: 4096.2,
          speedBytesPerSecond: 512.8
        }
      )
    )

    assert.equal(payload.url, 'https://vimeo.com/success')
    assert.equal(payload.resources[0].preferred_node_id, 42)
    assert.equal(payload.download_stats.bytes_done, 4096)
    assert.equal(payload.download_stats.bytes_total, 4096)
    assert.equal(payload.download_stats.average_bps, 512)
    assert.equal(payload.download_stats.reason, 'completed')
    assert.doesNotMatch(JSON.stringify(payload), /secret-input/)
  } finally {
    await cleanup()
  }
})

test('workspace download source reports start after used node and annotates failed stats', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/workspace-download.ts'),
    'utf8'
  )

  assert.match(source, /onUsedNode:\s*nodeId\s*=>\s*updateRuntimeDownloadNode/)
  assert.match(source, /recordDownloadStartOnce\(markContext,\s*state\)/)
  assert.match(source, /updateRuntimeDownloadProgress\(markContext,\s*snapshot\)/)
  assert.match(source, /buildRuntimeDownloadMarkError\(options\.error,\s*options\.markContext\)/)
  assert.match(source, /autoRangeError\?\.downloadedBytes/)
  assert.match(source, /function recordDownloadFailedMark/)
  assert.match(source, /retryCountForFailedMark\(\s*options\.error,\s*options\.fallbackRetryCount/)
  assert.match(
    source,
    /buildHomepageDownloadFailedMarkMessage\(\s*options\.url,\s*markResources,\s*markError,\s*failedRetryCount/
  )
  assert.equal(
    Array.from(source.matchAll(/HOMEPAGE_MARK_TYPE\.WEB_DOWNLOAD_FAILED/g)).length,
    1
  )
  assert.match(
    source,
    /recordDownloadFailedMark\(\{\s*state,\s*url:\s*link,\s*resources:\s*resource,\s*error:\s*parsedError,\s*fallbackRetryCount:\s*downloadRetryCount,\s*markContext/
  )
})

test('workspace download source blocks unsafe file types before starting any download', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/workspace-download.ts'),
    'utf8'
  )
  const singleDownloadIndex = source.indexOf('export async function handleDownloadClick')
  const downloadAllIndex = source.indexOf('export async function handleDownloadAllClick')
  const resumeIndex = source.indexOf('export async function handlePendingResumeContinue')
  const singleDownloadSource = source.slice(singleDownloadIndex, downloadAllIndex)
  const downloadAllSource = source.slice(downloadAllIndex, resumeIndex)
  const unsafeCheckIndex = singleDownloadSource.indexOf('!isWebDownloadMediaAllowed(resource)')
  const startIndex = singleDownloadSource.indexOf('state.activeDownload = true')
  const allPlansIndex = downloadAllSource.indexOf('const allPlans = state.resources.map')
  const allowedPlansIndex = downloadAllSource.indexOf(
    'allPlans.filter(plan => isWebDownloadMediaAllowed(plan.resource))'
  )
  const queuePlanIndex = downloadAllSource.indexOf('buildDownloadQueuePlan(allowedPlans)')
  const allSkippedIndex = downloadAllSource.indexOf('confirmUnsafeFileTypeExtensionGuide(elements, state)')
  const batchStartIndex = downloadAllSource.indexOf('state.activeDownload = true')

  assert.notEqual(singleDownloadIndex, -1)
  assert.notEqual(downloadAllIndex, -1)
  assert.notEqual(resumeIndex, -1)
  assert.ok(unsafeCheckIndex >= 0)
  assert.ok(startIndex >= 0)
  assert.ok(unsafeCheckIndex < startIndex)
  assert.ok(allPlansIndex >= 0)
  assert.ok(allowedPlansIndex > allPlansIndex)
  assert.ok(queuePlanIndex > allowedPlansIndex)
  assert.ok(allSkippedIndex > queuePlanIndex)
  assert.ok(batchStartIndex > allSkippedIndex)
  assert.match(source, /siteConfirmAction/)
  assert.match(source, /window\.confirm\(message\)/)
  assert.match(source, /setHidden\(elements\.largeFileExtensionGuide,\s*false\)/)
  assert.match(source, /scrollElementBelowTopNavigation\(elements\.largeFileExtensionGuide\)/)
  assert.match(source, /window\.scrollTo\(\{\s*top:\s*scrollTop,\s*behavior:\s*'smooth'\s*\}\)/)
  assert.match(source, /getTopNavigationOffset\(\)/)
})

test('workspace download source annotates single-task success stats without changing download all', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/workspace-download.ts'),
    'utf8'
  )
  const singleDownloadIndex = source.indexOf('export async function handleDownloadClick')
  const downloadAllIndex = source.indexOf('export async function handleDownloadAllClick')
  const resumeIndex = source.indexOf('export async function handlePendingResumeContinue')
  const singleDownloadSource = source.slice(singleDownloadIndex, downloadAllIndex)
  const downloadAllSource = source.slice(downloadAllIndex, resumeIndex)
  const resumeSource = source.slice(resumeIndex)

  assert.notEqual(singleDownloadIndex, -1)
  assert.notEqual(downloadAllIndex, -1)
  assert.notEqual(resumeIndex, -1)
  assert.match(singleDownloadSource, /buildHomepageDownloadSuccessMarkMessage\(/)
  assert.match(singleDownloadSource, /buildRuntimeDownloadSuccessMarkTask\(markContext,\s*downloadResult\.completion\)/)
  assert.match(resumeSource, /buildHomepageDownloadSuccessMarkMessage\(/)
  assert.match(resumeSource, /recordDownloadFailedMark\(/)
  assert.doesNotMatch(downloadAllSource, /buildHomepageDownloadSuccessMarkMessage\(/)
})

test('direct download source reports used node before direct URL fetch can fail', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/direct-download.ts'),
    'utf8'
  )
  const functionIndex = source.indexOf('async function runDirectDownloadFromStart')
  const startFromIntentIndex = source.indexOf('const initialPrepared = await prepareIntent', functionIndex)
  const notifyIndex = source.indexOf('options.onUsedNode?.(initialPrepared.nodeId)', startFromIntentIndex)
  const directFetchIndex = source.indexOf('runDirectIntentToMemory(', startFromIntentIndex)

  assert.notEqual(functionIndex, -1)
  assert.notEqual(startFromIntentIndex, -1)
  assert.notEqual(notifyIndex, -1)
  assert.notEqual(directFetchIndex, -1)
  assert.ok(notifyIndex < directFetchIndex)
})

test('direct download source persists refreshed URL before retrying OPFS download', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/direct-download.ts'),
    'utf8'
  )
  const functionIndex = source.indexOf('async function runDirectDownloadToOpfsWithAutoResume')
  const refreshIndex = source.indexOf('const refreshed = await refreshIntent()', functionIndex)
  const urlIndex = source.indexOf('activeDownloadUrl = refreshed.intent.downloadUrl', refreshIndex)
  const persistIndex = source.indexOf('activeRecord = await updateDownloadResumeRecord(activeRecord', urlIndex)
  const persistUrlIndex = source.indexOf('downloadUrl: activeDownloadUrl', persistIndex)
  const retryIndex = source.indexOf('continue', persistIndex)

  assert.notEqual(functionIndex, -1)
  assert.notEqual(refreshIndex, -1)
  assert.notEqual(urlIndex, -1)
  assert.notEqual(persistIndex, -1)
  assert.notEqual(persistUrlIndex, -1)
  assert.notEqual(retryIndex, -1)
  assert.ok(urlIndex < persistIndex)
  assert.ok(persistIndex < retryIndex)
})

test('homepage mark sanitizer redacts JSON and dict-like secret fields', async () => {
  const { module, cleanup } = await importHomepageMarkSanitizerModule()

  try {
    const sanitized = module.sanitizeMarkText(
      '{"access_token":"secret-token","sig":"secret-sig"} ' +
        '{"headers":{"Authorization":"Bearer secret-header","Cookie":"sid=secret-cookie"}} ' +
        '{"download_url":"https://direct.example.com/file.mp4?access_token=secret-direct"} ' +
        "{'direct_url': 'https://single.example.com/file.mp4?token=secret-single'}"
    )

    assert.match(sanitized, /"access_token":"\[redacted\]"/)
    assert.match(sanitized, /"sig":"\[redacted\]"/)
    assert.match(sanitized, /"headers":"\[redacted\]"/)
    assert.match(sanitized, /"download_url":"\[redacted\]"/)
    assert.match(sanitized, /'direct_url':'\[redacted\]'/)
    assert.doesNotMatch(sanitized, /secret-token/)
    assert.doesNotMatch(sanitized, /secret-sig/)
    assert.doesNotMatch(sanitized, /secret-header/)
    assert.doesNotMatch(sanitized, /secret-cookie/)
    assert.doesNotMatch(sanitized, /direct\.example\.com/)
    assert.doesNotMatch(sanitized, /single\.example\.com/)
    assert.doesNotMatch(sanitized, /secret-direct/)
    assert.doesNotMatch(sanitized, /secret-single/)
  } finally {
    await cleanup()
  }
})

test('Google Identity script loader retries after a failed load', async () => {
  await assertGoogleScriptLoadRetriesAfterError(
    'src/scripts/runtime/auth.ts',
    'homepage-auth-'
  )
  await assertGoogleScriptLoadRetriesAfterError(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'shared-homepage-auth-'
  )
})

test('Google Identity initializes once per page runtime', async () => {
  await assertGoogleIdentityInitializesOnce(
    'src/scripts/runtime/auth.ts',
    'homepage-auth-init-once-'
  )
  await assertGoogleIdentityInitializesOnce(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'shared-homepage-auth-init-once-'
  )
})

test('Google manual button uses backend OAuth authorize and return_to', async () => {
  await assertGoogleRedirectButtonUsesOAuthAuthorize(
    'src/scripts/runtime/auth.ts',
    'homepage-auth-redirect-button-'
  )
  await assertGoogleRedirectButtonUsesOAuthAuthorize(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'shared-homepage-auth-redirect-button-'
  )
})

test('Google One Tap callback posts credential to backend login', async () => {
  await assertGoogleOneTapCallbackPostsCredential(
    'src/scripts/runtime/auth.ts',
    'homepage-auth-one-tap-callback-'
  )
  await assertGoogleOneTapCallbackPostsCredential(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'shared-homepage-auth-one-tap-callback-'
  )
})

test('插件订阅曝光只要求 utm_source=extension，并保留实际 source', async () => {
  const previousWindow = globalThis.window
  globalThis.window = { location: { search: '' } }
  const { module, cleanup } = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/components/pricing/pricing-entry.ts'),
    'pricing-entry.js',
    'pricing-entry-'
  )
  try {
    for (const source of ['quota_counter', 'quota_upgrade_button', 'quota_unlimited_button', 'upgrade_modal', 'future_entry', null]) {
      const params = new URLSearchParams({ utm_source: 'extension' })
      if (source !== null) params.set('source', source)
      globalThis.window.location.search = `?${params}`
      assert.deepEqual(JSON.parse(module.readPricingEntryFlags().extensionEntryMarkMsg), {
        utm_source: 'extension', source
      })
    }
    for (const search of ['', '?source=quota_counter', '?utm_source=website&source=quota_upgrade_button']) {
      globalThis.window.location.search = search
      assert.equal(module.readPricingEntryFlags().extensionEntryMarkMsg, null)
    }
  } finally {
    globalThis.window = previousWindow
    await cleanup()
  }
})

test('Google redirect result reader clears only Google URL params', async () => {
  await assertGoogleRedirectResultCanBeCleared(
    'src/scripts/runtime/auth.ts',
    'homepage-auth-redirect-clear-'
  )
  await assertGoogleRedirectResultCanBeCleared(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'shared-homepage-auth-redirect-clear-'
  )
})

test('Order checkout builds billing identity and accepts only official payment URLs', async () => {
  const { module, cleanup } = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/components/order-checkout/order-checkout-api.ts'),
    'order-checkout-api.js',
    'order-checkout-api-'
  )

  try {
    assert.deepEqual(
      module.buildCreateOrderRequest(
        {
          product_class: 1,
          product_id: 'unlimited',
          auto_renew: true,
          period: 'quarter',
          payment_channels: []
        },
        {
          payment_method: 'paypal',
          payment_method_name: 'PayPal',
          currency: 'USD',
          amount: 12990000,
          provider_sku: 'unlimited-quarter-paypal'
        }
      ),
      {
        product_class: 1,
        product_id: 'unlimited',
        payment_method: 'paypal',
        currency: 'USD',
        amount: 12990000,
        auto_renew: true,
        period: 'quarter'
      }
    )
    assert.equal(
      module.readPaymentUrl(
        {
          checkoutUrl: 'https://uat-checkout.clinkbill.com/pay/sandbox',
          payment_url: 'https://checkout.clinkbill.com/pay/fallback'
        },
        'clink'
      ),
      'https://uat-checkout.clinkbill.com/pay/sandbox'
    )
    assert.equal(
      module.readPaymentUrl({ payment_url: 'https://checkout.clinkbill.com/pay/live' }, 'clink'),
      'https://checkout.clinkbill.com/pay/live'
    )
    assert.equal(
      module.readPaymentUrl({ url: 'https://uat-checkout.clinkbill.com/pay/legacy' }, 'clink'),
      'https://uat-checkout.clinkbill.com/pay/legacy'
    )
    assert.equal(
      module.readPaymentUrl({ checkoutUrl: 'http://checkout.clinkbill.com/pay' }, 'clink'),
      null
    )
    assert.equal(
      module.readPaymentUrl(
        { checkoutUrl: 'https://checkout.clinkbill.com.evil.example/pay' },
        'clink'
      ),
      null
    )
    assert.equal(
      module.readPaymentUrl({ checkoutUrl: 'https://evil.example/pay' }, 'clink'),
      null
    )
    assert.equal(
      module.readPaymentUrl(
        { payment_url: 'https://www.sandbox.paypal.com/checkoutnow?token=order' },
        'paypal'
      ),
      'https://www.sandbox.paypal.com/checkoutnow?token=order'
    )
    assert.deepEqual(module.DEFAULT_ORDER_PAYMENT_METHODS, ['clink', 'paypal'])
    // 未知支付方式不接受外部跳转地址。
    assert.equal(module.readPaymentUrl({ url: 'https://example.com/pay' }, 'unknown'), null)
  } finally {
    await cleanup()
  }
})

test('Pricing checkout client loads general subscription price options', async () => {
  const { module, cleanup } = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/components/pricing/pricing-checkout.ts'),
    'pricing-checkout.js',
    'pricing-checkout-api-'
  )
  const fetchCalls = []
  const reviewRewardEnabled = true
  let reviewRewardClaimedCount = 0
  let claimResult = 'granted'
  const previousFetch = globalThis.fetch
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  globalThis.document = { documentElement: { lang: 'en-US' } }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    fetchCalls.push({ path: parsedUrl.pathname, method: init.method ?? 'GET', body: init.body })
    if (parsedUrl.pathname === '/api/client/subscription/checkout-configs') {
      return new Response(JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          review_reward_enabled: reviewRewardEnabled,
          review_reward_claimed_count: reviewRewardClaimedCount,
          checkout_configs: [
            {
              product_class: 1,
              product_id: 'legacy_subscription_sku',
              product_name: 'Unlimited',
              period: 'quarter',
              auto_renew: true,
              display_currency: 'USD',
              display_amount: 12990000,
              daily_limit: -1,
              payment_channels: [
                {
                  payment_method: 'paypal',
                  payment_method_name: 'PayPal',
                  product_price_id: 21,
                  currency: 'USD',
                  amount: 12990000
                }
              ]
            },
            {
              product_class: 1,
              product_id: 'unlimited',
              product_name: 'Unlimited',
              period: 'year',
              auto_renew: false,
              display_currency: 'USD',
              display_amount: 9990000,
              daily_limit: -1,
              payment_channels: [
                {
                  payment_method: 'paypal',
                  payment_method_name: 'PayPal',
                  product_price_id: 22,
                  currency: 'USD',
                  amount: 12990000
                }
              ]
            }
          ]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (parsedUrl.pathname === '/api/client/subscription/review-reward/claim') {
      return new Response(JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          result: claimResult,
          review_reward_claimed_count: 1
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (parsedUrl.pathname === '/api/client/subscription/management') {
      return new Response(JSON.stringify({
        code: 10000,
        msg: 'success',
        data: { url: 'https://www.paypal.com/myaccount/autopay/' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Unexpected Pricing checkout test request: ' + parsedUrl.pathname)
  }

  try {
    const context = { deviceId: 'pricing-device', token: 'pricing-token' }
    const subscriptionData = await module.listSubscriptionCheckoutConfigs(context)
    assert.equal(subscriptionData.reviewRewardEnabled, true)
    assert.equal(subscriptionData.reviewRewardClaimedCount, 0)
    assert.equal(subscriptionData.plans.length, 2)
    const plan = subscriptionData.plans.find(item => item.product_id === 'unlimited')
    assert.equal(plan.product_id, 'unlimited')
    const channel = plan.payment_channels[0]
    assert.equal(channel.payment_method, 'paypal')
    assert.equal(channel.product_price_id, 22)
    assert.equal(plan.auto_renew, false)
    assert.equal(plan.period, 'year')
    assert.equal(module.formatPricingDisplayPrice(plan), '$9.99')
    assert.equal(module.formatPricingDisplayPrice(channel), '$12.99')
    assert.equal(module.formatSubscriptionPeriod('quarter', '/ month', '/ year', '/ lifetime', 'en-US'), '3 months')
    assert.equal(module.formatSubscriptionPeriod('year', '/ month', '/ year', '/ lifetime', 'en-US'), '/ year')
    assert.equal(module.formatSubscriptionPeriod('lifetime', '/ month', '/ year', '/ lifetime', 'en-US'), '/ lifetime')
    assert.deepEqual(fetchCalls.map(call => call.path), [
      '/api/client/subscription/checkout-configs'
    ])

    const management = await module.createSubscriptionManagement(context)
    assert.deepEqual(management, { url: 'https://www.paypal.com/myaccount/autopay/' })
    assert.deepEqual(fetchCalls.at(-1), {
      path: '/api/client/subscription/management',
      method: 'POST',
      body: undefined
    })

    const claim = await module.claimSubscriptionReviewReward(context)
    assert.deepEqual(claim, { result: 'granted', review_reward_claimed_count: 1 })

    claimResult = 'unexpected_result'
    await assert.rejects(
      module.claimSubscriptionReviewReward(context),
      /result must be granted or already_claimed/
    )

    reviewRewardClaimedCount = -1
    await assert.rejects(
      module.listSubscriptionCheckoutConfigs(context),
      /review_reward_claimed_count must be a non-negative integer/
    )
  } finally {
    globalThis.fetch = previousFetch
    delete globalThis.document
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('Pricing subscription loader rejects bad configs and ignores stale anonymous responses', async () => {
  const previousFetch = globalThis.fetch
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousConsoleError = console.error
  const previousHTMLElement = globalThis.HTMLElement
  const pendingResponses = []
  const appendedNodes = []
  class FakePricingElement {}
  const makeElement = () => Object.assign(new FakePricingElement(), {
    textContent: '',
    hidden: false,
    disabled: false,
    dataset: {},
    classList: {
      remove() {},
      toggle() {},
      add() {}
    },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    append() {}
  })
  const cardFields = {
    price: makeElement(),
    period: makeElement(),
    savings: makeElement(),
    error: makeElement(),
    buy: makeElement(),
    billingRow: makeElement(),
    billing: makeElement()
  }
  const cardSelectors = {
    '[data-pricing-subscription-price]': cardFields.price,
    '[data-pricing-subscription-period]': cardFields.period,
    '[data-pricing-subscription-savings]': cardFields.savings,
    '[data-pricing-subscription-error]': cardFields.error,
    '[data-pricing-subscription-buy]': cardFields.buy,
    '[data-pricing-subscription-billing-row]': cardFields.billingRow,
    '[data-pricing-subscription-billing]': cardFields.billing
  }
  const cardElement = Object.assign(new FakePricingElement(), {
    dataset: {},
    querySelector(selector) {
      if (!(selector in cardSelectors)) {
        throw new Error(`unexpected card selector: ${selector}`)
      }
      return cardSelectors[selector]
    }
  })
  const subscriptionList = makeElement()
  subscriptionList.append = node => appendedNodes.push(node)
  const elements = {
    subscriptionList,
    subscriptionTemplate: {
      content: {
        firstElementChild: Object.assign(new FakePricingElement(), {
          cloneNode: () => cardElement
        })
      }
    },
    skeletonTemplate: {
      content: {
        firstElementChild: Object.assign(new FakePricingElement(), {
          cloneNode: () => makeElement()
        })
      }
    }
  }
  const copy = {
    account: { unlimited: 'Unlimited' },
    subscription: {
      loading: 'Loading plans',
      loadFailed: 'Plans failed. Retry.',
      noPlan: 'No plan',
      noChannels: 'No channels',
      monthlyLabel: '/ month',
      yearlyLabel: '/ year',
      autoRenewOn: 'Renews',
      autoRenewOff: 'One-time',
      buyNow: 'Buy Now',
      loginToBuy: 'Sign In'
    },
    extensionSource: {
      primaryCta: 'Upgrade',
      signedOutCta: 'Sign In'
    }
  }
  const state = {
    deviceId: 'pricing-race-device',
    token: null,
    user: null,
    subscriptionPlans: [],
    reviewRewardEnabled: false,
    reviewRewardClaimedCount: 0,
    reviewRewardEligibilityLoaded: false,
    subscriptionLoadVersion: 0,
    isExtensionSource: false,
    isQuotaUpgradeButtonEntry: false
  }
  const planData = (amount, claimedCount) => ({
    code: 10000,
    msg: 'success',
    data: {
      review_reward_enabled: true,
      review_reward_claimed_count: claimedCount,
      checkout_configs: [{
        product_class: 1,
        product_id: 'unlimited',
        product_name: 'Unlimited',
        period: 'month',
        auto_renew: false,
        display_currency: 'USD',
        display_amount: amount,
        daily_limit: -1,
        payment_channels: [{
          payment_method: 'paypal',
          payment_method_name: 'PayPal',
          product_price_id: 1,
          currency: 'USD',
          amount
        }]
      }]
    }
  })

  globalThis.document = {
    documentElement: { lang: 'en-US' },
    querySelector() { return null },
    createElement() { return makeElement() }
  }
  globalThis.window = {}
  globalThis.HTMLElement = FakePricingElement
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = () => new Promise(resolve => pendingResponses.push(resolve))

  const { module, cleanup } = await importPricingPageControllerModule()

  try {
    const anonymousLoad = module.loadSubscription(elements, copy, state)
    state.token = 'signed-in-token'
    const signedInLoad = module.loadSubscription(elements, copy, state)

    pendingResponses[1](new Response(JSON.stringify(planData(22990000, 1)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    await signedInLoad
    pendingResponses[0](new Response(JSON.stringify(planData(12990000, 0)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    await anonymousLoad

    assert.equal(cardFields.price.textContent, '$22.99')
    assert.equal(cardFields.billing.textContent, copy.subscription.autoRenewOff)
    assert.equal(cardFields.billingRow.hidden, false)
    assert.equal(cardFields.savings.hidden, true)
    assert.equal(state.reviewRewardEnabled, true)
    assert.equal(state.reviewRewardClaimedCount, 1)
    assert.equal(cardFields.buy.disabled, false)
    assert.equal(state.subscriptionPlans.length, 1)

    console.error = () => {}
    const badLoad = module.loadSubscription(elements, copy, state)
    pendingResponses[2](new Response(JSON.stringify(planData(22990000, -1)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    await badLoad
    assert.equal(state.subscriptionPlans.length, 0)
    assert.equal(cardFields.buy.disabled, false)
    const lastAppended = appendedNodes[appendedNodes.length - 1]
    assert.equal(lastAppended.textContent, copy.subscription.loadFailed)
  } finally {
    globalThis.fetch = previousFetch
    console.error = previousConsoleError
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    if (previousHTMLElement === undefined) {
      delete globalThis.HTMLElement
    } else {
      globalThis.HTMLElement = previousHTMLElement
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('Pricing review reward failure retries immediately and close clears timer and restores focus', async () => {
  const previousFetch = globalThis.fetch
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousCustomEvent = globalThis.CustomEvent
  const previousConsoleError = console.error
  const originalDateNow = Date.now
  const timers = new Map()
  const clearedTimers = []
  let nextTimerId = 1
  let now = 1_000_000
  let claimAttempts = 0
  const reviewClickMarks = []

  const makeElement = (dataset = {}) => {
    const listeners = new Map()
    return {
      dataset: { ...dataset },
      hidden: false,
      textContent: '',
      id: '',
      focusCount: 0,
      addEventListener(type, listener) { listeners.set(type, listener) },
      click() { listeners.get('click')?.({ preventDefault() {} }) },
      focus() { this.focusCount += 1 },
      querySelector() { return null }
    }
  }
  const views = ['confirm', 'countdown', 'claiming', 'success', 'already_claimed', 'failed'].map(view => {
    const element = makeElement({ pricingSubscriptionConfirmView: view })
    const title = makeElement()
    title.id = `title-${view}`
    title.textContent = `Title ${view}`
    const description = makeElement()
    description.id = `description-${view}`
    element.querySelector = selector => selector === 'h2' ? title : description
    return element
  })
  const dialog = makeElement()
  dialog.open = false
  dialog.attributes = new Map()
  dialog.showModal = function () { this.open = true }
  dialog.close = function () { this.open = false }
  dialog.setAttribute = function (name, value) { this.attributes.set(name, value) }
  const error = makeElement({ failedMessage: 'Local claim failed', busyMessage: 'Server busy' })
  const retry = makeElement()
  const reviewButton = makeElement()
  const continueButton = makeElement()
  const closeButton = makeElement()
  const returnFocus = makeElement()
  const countdown = makeElement({ template: '{seconds}s' })
  const live = makeElement()

  globalThis.document = {
    documentElement: { lang: 'en-US' },
    querySelector() { return null }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.CustomEvent = class {
    constructor(type, options) {
      this.type = type
      this.detail = options?.detail
    }
  }
  globalThis.window = {
    setTimeout(callback) {
      const timerId = nextTimerId++
      timers.set(timerId, callback)
      return timerId
    },
    clearTimeout(timerId) {
      clearedTimers.push(timerId)
      timers.delete(timerId)
    },
    open() {},
    dispatchEvent() {},
    addEventListener() {}
  }
  Date.now = () => now
  console.error = () => {}
  globalThis.fetch = async (url, options = {}) => {
    const pathname = new URL(String(url)).pathname
    if (pathname.endsWith('/mark/record')) {
      reviewClickMarks.push(JSON.parse(String(options.body)))
      if (reviewClickMarks.length === 2) {
        throw new TypeError('mark endpoint unavailable')
      }
      return new Response(JSON.stringify({
        code: 10000,
        msg: 'success',
        data: { recorded: true }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (!pathname.endsWith('/subscription/review-reward/claim')) {
      return new Response('', { status: 200 })
    }
    claimAttempts += 1
    if (claimAttempts === 1) {
      throw new TypeError('internal network detail')
    }
    return new Response(JSON.stringify({
      code: 10000,
      msg: 'success',
      data: { result: 'granted', review_reward_claimed_count: 1 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const { module, cleanup } = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/components/pricing/pricing-subscription-confirm-controller.ts'),
    'pricing-subscription-confirm-controller.js',
    'pricing-review-controller-'
  )

  try {
    const controller = module.createController({
      dialog,
      views,
      titles: views.map(view => view.querySelector('h2')),
      rewardOffer: makeElement(),
      reviewButton,
      continueButton,
      closeButtons: [closeButton],
      countdown,
      error,
      retry,
      live,
      reviewUrl: `${CHROME_REVIEW_BASE_URL}/reviews`
    })
    const firstResult = controller.open({
      reviewRewardEnabled: true,
      reviewRewardClaimedCount: 0,
      requestContext: { deviceId: 'review-device', token: 'review-token' },
      returnFocus
    })
    reviewButton.click()
    await flushBrowserTasks()
    assert.deepEqual(reviewClickMarks, [{
      mark_type: 'web_extension_store_review_click',
      mark_msg: '',
      first_opened_at: 1_000_000
    }])
    now += 30_000
    timers.get(1)()
    await flushBrowserTasks()
    assert.equal(error.textContent, 'Local claim failed')
    assert.equal(views.find(view => !view.hidden).dataset.pricingSubscriptionConfirmView, 'failed')

    retry.click()
    await flushBrowserTasks()
    assert.equal(claimAttempts, 2)
    assert.equal(views.find(view => !view.hidden).dataset.pricingSubscriptionConfirmView, 'success')
    closeButton.click()
    assert.equal(await firstResult, 'closed')
    assert.equal(returnFocus.focusCount, 1)

    const secondResult = controller.open({
      reviewRewardEnabled: true,
      reviewRewardClaimedCount: 0,
      requestContext: { deviceId: 'review-device', token: 'review-token' },
      returnFocus
    })
    reviewButton.click()
    await flushBrowserTasks()
    closeButton.click()
    assert.equal(await secondResult, 'closed')
    assert.equal(reviewClickMarks.length, 2)
    assert.deepEqual(clearedTimers, [2])
    assert.equal(returnFocus.focusCount, 2)
  } finally {
    globalThis.fetch = previousFetch
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    Date.now = originalDateNow
    console.error = previousConsoleError
    if (previousCustomEvent === undefined) {
      delete globalThis.CustomEvent
    } else {
      globalThis.CustomEvent = previousCustomEvent
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

test('Clink success return page polls subscription order until paid', async () => {
  const { module, cleanup } = await importPaymentReturnModule()
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const titleElement = { textContent: 'Payment submitted' }
  const messageElement = { textContent: '' }
  const rootElement = {
    dataset: {},
    querySelector(selector) {
      if (selector === '[data-payment-return-copy="waiting"]') {
        return { dataset: { title: 'Payment submitted', description: 'Confirming payment' } }
      }
      if (selector === '[data-payment-return-copy="confirmed"]') {
        return { dataset: { title: 'Payment confirmed', description: 'Purchase ready' } }
      }
      if (selector === '[data-payment-return-copy="failed"]') {
        return { dataset: { title: 'Payment not completed', description: 'Try again' } }
      }
      if (selector === '[data-payment-return-title]') {
        return titleElement
      }
      if (selector === '[data-payment-return-description]') {
        return messageElement
      }
      return null
    }
  }
  const storageValues = new Map([
    ['homepage_access_token', 'test-token'],
    ['homepage_device_id_v2', '01234567-89ab-4def-8123-456789abcdef']
  ])
  const fetchCalls = []
  const intervals = []
  const clearedIntervals = []
  const openerMessages = []

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storageValues.get(key) ?? null
      },
      setItem(key, value) {
        storageValues.set(key, String(value))
      },
      removeItem(key) {
        storageValues.delete(key)
      }
    },
    location: {
      origin: SITE_ORIGIN,
      search: '?order_no=ORD-CLINK-RETURN'
    },
    opener: {
      postMessage(message, origin) {
        openerMessages.push({ message, origin })
      }
    },
    setInterval(callback, intervalMs) {
      intervals.push({ callback, intervalMs })
      return intervals.length
    },
    clearInterval(timerId) {
      clearedIntervals.push(timerId)
    }
  }
  globalThis.document = {
    documentElement: { lang: 'en-US' },
    querySelector(selector) {
      if (selector === '[data-payment-return]') {
        return rootElement
      }
      return null
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    fetchCalls.push({ path: parsedUrl.pathname, method: init.method ?? 'GET' })
    assert.equal(parsedUrl.pathname, '/api/client/order/status/ORD-CLINK-RETURN')
    const paid = fetchCalls.length >= 2
    return new Response(JSON.stringify({
      code: 10000,
      msg: 'success',
      data: {
        order_no: 'ORD-CLINK-RETURN',
        product_class: 1,
        product_id: 'unlimited',
        product_name: 'Unlimited',
        amount: 9990000,
        currency: 'USD',
        order_status: paid ? 2 : 1,
        callback_status: paid ? 3 : 1,
        payment_method: 'clink',
        paid_at: paid ? Date.now() : null,
        created_at: Date.now(),
        expired_at: Date.now() + 30 * 60 * 1000
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    module.initPaymentReturnPage({
      provider: 'clink',
      status: 'success'
    })
    await flushBrowserTasks()

    assert.equal(intervals.length, 1)
    assert.equal(intervals[0].intervalMs, module.PAYMENT_RETURN_POLL_INTERVAL_MS)
    assert.equal(module.PAYMENT_RETURN_POLL_INTERVAL_MS, 3000)
    assert.equal(fetchCalls.length, 1)
    assert.equal(titleElement.textContent, 'Payment submitted')

    intervals[0].callback()
    await flushBrowserTasks()

    assert.equal(fetchCalls.length, 2)
    assert.equal(titleElement.textContent, 'Payment confirmed')
    assert.equal(messageElement.textContent, 'Purchase ready')
    assert.equal(rootElement.dataset.paymentReturnState, 'confirmed')
    assert.deepEqual(clearedIntervals, [1])
    assert.equal(openerMessages.length, 2)
    assert.equal(openerMessages[0].message.type, 'credit_purchase_paypal_return')
    assert.equal(openerMessages[1].message.provider, 'clink')
    assert.equal(openerMessages[1].message.orderNo, 'ORD-CLINK-RETURN')
  } finally {
    globalThis.fetch = previousFetch
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', previousNavigator)
    } else {
      delete globalThis.navigator
    }
    await cleanup()
  }
})

/** 搭建支付回跳页的浏览器环境，返回可观察的页面状态与清理函数。 */
function installPaymentReturnEnvironment({ token, search, fetchImpl }) {
  const previous = {
    fetch: globalThis.fetch,
    window: globalThis.window,
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  }
  const copies = {
    waiting: { title: 'Payment submitted', description: 'Confirming payment' },
    confirmed: { title: 'Payment confirmed', description: 'Purchase ready' },
    failed: { title: 'Payment not completed', description: 'Try again' },
    submitted: { title: 'Payment submitted', description: 'Check where you started' }
  }
  const titleElement = { textContent: '' }
  const messageElement = { textContent: '' }
  const rootElement = {
    dataset: {},
    querySelector(selector) {
      const match = selector.match(/^\[data-payment-return-copy="(\w+)"\]$/)
      if (match) {
        return { dataset: copies[match[1]] }
      }
      if (selector === '[data-payment-return-title]') return titleElement
      if (selector === '[data-payment-return-description]') return messageElement
      return null
    }
  }
  const storageValues = new Map([['homepage_device_id_v2', '01234567-89ab-4def-8123-456789abcdef']])
  if (token) {
    storageValues.set('homepage_access_token', token)
  }
  const intervals = []
  const fetchCalls = []

  globalThis.window = {
    localStorage: {
      getItem: (key) => storageValues.get(key) ?? null,
      setItem: (key, value) => storageValues.set(key, String(value)),
      removeItem: (key) => storageValues.delete(key)
    },
    location: { origin: SITE_ORIGIN, search },
    opener: null,
    setInterval(callback, intervalMs) {
      intervals.push({ callback, intervalMs })
      return intervals.length
    },
    clearInterval() {}
  }
  globalThis.document = {
    documentElement: { lang: 'en-US' },
    querySelector: (selector) => (selector === '[data-payment-return]' ? rootElement : null)
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
  })
  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url))
    fetchCalls.push({ path: parsedUrl.pathname, method: init.method ?? 'GET' })
    return fetchImpl(parsedUrl, init)
  }

  return {
    titleElement,
    rootElement,
    intervals,
    fetchCalls,
    restore() {
      globalThis.fetch = previous.fetch
      for (const key of ['window', 'document']) {
        if (previous[key] === undefined) {
          delete globalThis[key]
        } else {
          globalThis[key] = previous[key]
        }
      }
      if (previous.navigator) {
        Object.defineProperty(globalThis, 'navigator', previous.navigator)
      } else {
        delete globalThis.navigator
      }
    }
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

test('payment return success page shows neutral submitted when the order cannot be confirmed', async () => {
  const { module, cleanup } = await importPaymentReturnModule()
  const cases = [
    { name: 'no login state', token: null, response: null },
    { name: 'token rejected', token: 'stale-token', response: jsonResponse({ code: 10001, msg: 'unauthorized', data: null }, 401) },
    { name: 'order not owned', token: 'test-token', response: jsonResponse({ code: 20001, msg: 'order not found', data: null }, 200) }
  ]

  try {
    for (const item of cases) {
      const env = installPaymentReturnEnvironment({
        token: item.token,
        search: '?order_no=ORD-NEUTRAL',
        fetchImpl: async () => item.response
      })
      try {
        module.initPaymentReturnPage({ provider: 'paypal', status: 'success' })
        await flushBrowserTasks()
        assert.equal(env.rootElement.dataset.paymentReturnState, 'submitted', item.name)
        assert.equal(env.titleElement.textContent, 'Payment submitted', item.name)
        assert.equal(env.fetchCalls.length, item.token ? 1 : 0, item.name)
      } finally {
        env.restore()
      }
    }
  } finally {
    await cleanup()
  }
})

test('payment return cancel page cancels the local order', async () => {
  const { module, cleanup } = await importPaymentReturnModule()
  const env = installPaymentReturnEnvironment({
    token: 'test-token',
    search: '?order_no=ORD-CANCEL',
    fetchImpl: async () => jsonResponse({ code: 10000, msg: 'success', data: null })
  })

  try {
    module.initPaymentReturnPage({ provider: 'clink', status: 'cancel' })
    await flushBrowserTasks()
    assert.deepEqual(env.fetchCalls, [{ path: '/api/client/order/cancel', method: 'POST' }])
    assert.equal(env.intervals.length, 0)
  } finally {
    env.restore()
    await cleanup()
  }
})

test('workspace snapshot validates owner, expiry, size and privacy whitelist', async () => {
  installLocalStorage()
  const { module, cleanup } = await importWorkspaceSnapshotModule()

  try {
    const owner = module.buildDownloadWorkspaceOwner('device-1')
    const resource = {
      sourceId: 'source-video-1',
      resourceToken: 'snapshot-resource-token',
      filename: 'demo.mp4',
      type: 'video',
      size: 1024,
      link: 'https://vimeo.com/123456789',
      mimeType: 'video/mp4',
      duration: 12,
      width: 320,
      height: 180,
      platform: 'vimeo',
      downloadMode: 'direct',
      capabilities: {
        download: true
      },
      resourceToken: 'snapshot-resource-token',
      token: 'secret-token',
      play_url: 'https://api.example.com/play?token=secret',
      Authorization: 'Bearer secret',
      email: 'hydra@example.com'
    }

    assert.equal(
      module.saveDownloadParseSnapshot(
        {
          originalLink: 'https://vimeo.com/123456789',
          canonicalLink: 'https://vimeo.com/123456789',
          resources: [resource]
        },
        owner
      ),
      true
    )

    const raw = window.localStorage.getItem(module.DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY)
    assert.ok(raw)
    const storedSnapshot = JSON.parse(raw)
    assert.equal(storedSnapshot.expiresAtMs - storedSnapshot.updatedAtMs, 24 * 60 * 60 * 1000)
    assert.equal(raw.includes('secret-token'), false)
    assert.equal(raw.includes('play_url'), false)
    assert.equal(raw.includes('Authorization'), false)
    assert.equal(raw.includes('hydra@example.com'), false)
    assert.equal(raw.includes('downloadRequests'), false)

    const loaded = module.loadDownloadWorkspaceSnapshot(Date.now(), 'device-1')
    assert.equal(loaded.owner.sub, 'device:device-1')

    assert.equal(module.loadDownloadWorkspaceSnapshot(Date.now(), 'device-2'), null)
    assert.equal(window.localStorage.getItem(module.DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY), null)

    const manyResources = Array.from({ length: 101 }, (_value, index) => ({
      sourceId: `source-${index}`,
      filename: `demo-${index}.mp4`,
      type: 'video',
      size: 1,
      link: 'https://vimeo.com/123456789',
      platform: 'vimeo',
      downloadMode: 'direct',
      capabilities: {
        download: true
      }
    }))
    const originalConsoleError = console.error
    console.error = () => {}
    try {
      assert.equal(
        module.saveDownloadParseSnapshot(
          {
            originalLink: 'https://vimeo.com/123456789',
            canonicalLink: 'https://vimeo.com/123456789',
            resources: manyResources
          },
          module.buildDownloadWorkspaceOwner('device-1')
        ),
        false
      )
    } finally {
      console.error = originalConsoleError
    }
  } finally {
    await cleanup()
  }
})

test('workspace snapshot drops legacy download request ids on load', async () => {
  installLocalStorage()
  const { module, cleanup } = await importWorkspaceSnapshotModule()

  try {
    const now = Date.now()
    window.localStorage.setItem(
      module.DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        updatedAtMs: now,
        expiresAtMs: now + 60_000,
        owner: {
          sub: 'device:device-1',
          deviceId: 'device-1'
        },
        parse: {
          originalLink: 'https://vimeo.com/123456789',
          canonicalLink: 'https://vimeo.com/123456789',
          resources: [
            {
              sourceId: 'source-video-1',
              filename: 'demo.mp4',
              type: 'video',
              size: 1024,
              link: 'https://vimeo.com/123456789',
              platform: 'vimeo',
              downloadMode: 'direct',
              capabilities: {
                download: true
              },
              resourceToken: 'snapshot-resource-token'
            }
          ]
        },
        playback: null,
        downloadRequests: [
          {
            scope: 'device:device-1',
            platform: 'vimeo',
            canonicalLink: 'https://vimeo.com/123456789',
            sourceId: 'source-video-1',
            downloadMode: 'direct',
            clientRequestId: '11111111-1111-4111-8111-111111111111',
            createdAtMs: now,
            expiresAtMs: now + 60_000
          }
        ]
      })
    )

    const loaded = module.loadDownloadWorkspaceSnapshot(now, 'device-1')
    assert.ok(loaded)
    assert.equal(Object.hasOwn(loaded, 'downloadRequests'), false)

    module.saveDownloadParseSnapshot(loaded.parse, loaded.owner)
    assert.equal(
      window.localStorage.getItem(module.DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY).includes('clientRequestId'),
      false
    )
  } finally {
    await cleanup()
  }
})

test('download URL helper extracts first valid Vimeo link from glued input', async () => {
  const { module, cleanup } = await importSharedDownloadUrlModule()

  try {
    assert.deepEqual(
      module.extractUserLinks('https://vimeo.com/111111111https://vimeo.com/222222222'),
      ['https://vimeo.com/111111111', 'https://vimeo.com/222222222']
    )
    assert.deepEqual(
      module.extractUserLinks('vimeo.com/111111111\nhttps://vimeo.com/222222222 https://player.vimeo.com/video/333333333'),
      [
        'vimeo.com/111111111',
        'https://vimeo.com/222222222',
        'https://player.vimeo.com/video/333333333'
      ]
    )
    assert.deepEqual(
      module.extractUserLinks('vimeo.com/111111111https://vimeo.com/222222222'),
      ['vimeo.com/111111111', 'https://vimeo.com/222222222']
    )
    assert.deepEqual(
      module.extractUserLinks('https://vimeo.com/111111111https://player.vimeo.com/video/222222222'),
      ['https://vimeo.com/111111111', 'https://player.vimeo.com/video/222222222']
    )
    // 非 Vimeo 链接即使粘连也不拆分。
    assert.deepEqual(
      module.extractUserLinks('https://example.com/1https://example.com/2'),
      ['https://example.com/1https://example.com/2']
    )
    assert.deepEqual(
      module.extractUserLinks('https://notvimeo.com/video/1https://vimeo.com/2'),
      ['https://notvimeo.com/video/1https://vimeo.com/2']
    )
    // 其他站点 URL 里出现的 Vimeo 链接不是新链接起点。
    assert.deepEqual(
      module.extractUserLinks('https://example.com/redirect?u=https://vimeo.com/111111111'),
      ['https://example.com/redirect?u=https://vimeo.com/111111111']
    )
    assert.equal(module.isValidUserLink('https://vimeo.com/111111111'), true)
    assert.equal(module.isValidUserLink('http://vimeo.com/111111111'), true)
    assert.equal(module.isValidUserLink('https://player.vimeo.com/video/111111111'), true)
    assert.equal(module.isValidUserLink('vimeo.com/111111111'), false)
    assert.equal(module.isValidUserLink('www.vimeo.com/111111111'), false)
    assert.equal(module.isValidUserLink('ftp://vimeo.com/111111111'), false)
    assert.equal(module.extractFirstValidUserLink('bad input vimeo.com/111111111'), null)
    assert.equal(
      module.extractFirstValidUserLink('bad input https://vimeo.com/111111111https://vimeo.com/222222222'),
      'https://vimeo.com/111111111'
    )
    assert.equal(
      module.extractFirstValidUserLink('bad input https://player.vimeo.com/video/111111111https://vimeo.com/222222222'),
      'https://player.vimeo.com/video/111111111'
    )
    assert.equal(
      module.extractFirstValidUserLink('bad input https://notvimeo.com/video/1'),
      'https://notvimeo.com/video/1'
    )
  } finally {
    await cleanup()
  }
})

function buildResumeStoreResource(overrides = {}) {
  return {
    sourceId: 'source-video-1',
    resourceToken: 'resume-resource-token',
    filename: 'demo-video.mp4',
    type: 'video',
    size: 12,
    link: 'https://vimeo.com/123456789',
    mimeType: 'video/mp4',
    platform: 'vimeo',
    downloadMode: 'direct',
    preferredNodeId: 21,
    capabilities: {
      download: true
    },
    ...overrides
  }
}

function installResumeStoreWindow() {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null
      },
      setItem(key, value) {
        values.set(key, String(value))
      },
      removeItem(key) {
        values.delete(key)
      }
    }
  }
  return values
}

function snapshotResumeStoreGlobals() {
  return {
    window: globalThis.window,
    navigator: globalThis.navigator,
    indexedDB: globalThis.indexedDB,
    URL: globalThis.URL
  }
}

function installFakeOpfs() {
  const files = new Map()
  const root = {
    async getFileHandle(name, options = {}) {
      if (!files.has(name)) {
        if (!options.create) {
          throw new DOMException('missing file', 'NotFoundError')
        }
        files.set(name, new Uint8Array())
      }
      return {
        async getFile() {
          return new File([files.get(name)], name)
        },
        async createWritable() {
          let draft = files.get(name).slice()
          return {
            async truncate(size) {
              draft = draft.slice(0, size)
            },
            async seek() {},
            async write(chunk) {
              draft = chunk instanceof Uint8Array ? chunk.slice() : new Uint8Array(chunk)
            },
            async close() {
              files.set(name, draft)
            },
            async abort() {}
          }
        }
      }
    },
    async removeEntry(name) {
      if (!files.has(name)) {
        throw new DOMException('missing file', 'NotFoundError')
      }
      files.delete(name)
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        async getDirectory() {
          return root
        }
      }
    }
  })
  return files
}

function installFakeOpfsWithWriteFailure(writeError) {
  const files = new Map()
  const root = {
    async getFileHandle(name, options = {}) {
      if (!files.has(name)) {
        if (!options.create) {
          throw new DOMException('missing file', 'NotFoundError')
        }
        files.set(name, new Uint8Array())
      }
      return {
        async getFile() {
          return new File([files.get(name)], name)
        },
        async createWritable() {
          return {
            async truncate() {},
            async seek() {},
            async write() {
              throw writeError
            },
            async close() {}
          }
        }
      }
    },
    async removeEntry(name) {
      files.delete(name)
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        async getDirectory() {
          return root
        }
      }
    }
  })
  return files
}

function clearResumeStoreGlobals() {
  delete globalThis.window
  delete globalThis.navigator
  delete globalThis.indexedDB
  delete globalThis.URL
}

function restoreResumeStoreGlobals(snapshot) {
  clearResumeStoreGlobals()
  if (snapshot.window !== undefined) {
    globalThis.window = snapshot.window
  }
  if (snapshot.navigator !== undefined) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: snapshot.navigator
    })
  }
  if (snapshot.indexedDB !== undefined) {
    globalThis.indexedDB = snapshot.indexedDB
  }
  if (snapshot.URL !== undefined) {
    globalThis.URL = snapshot.URL
  }
}

test('download storage preflight blocks when origin quota is not enough', async () => {
  const { module, cleanup } = await importDownloadStoragePreflightModule()
  const globals = snapshotResumeStoreGlobals()
  const mib = 1024 * 1024
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        async estimate() {
          return {
            quota: 100 * mib,
            usage: 90 * mib
          }
        }
      }
    }
  })

  try {
    const result = await module.checkDownloadStoragePreflight(
      buildResumeStoreResource({ size: 50 * mib })
    )

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'insufficient_storage')
    assert.equal(result.fileSizeBytes, 50 * mib)
    assert.equal(result.availableBytes, 10 * mib)
    assert.equal(result.requiredBytes, 114 * mib)
    assert.equal(module.formatStorageBytes(result.availableBytes), '10 MiB')
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download storage preflight blocks large files when OPFS is unavailable', async () => {
  const { module, cleanup } = await importDownloadStoragePreflightModule()
  const globals = snapshotResumeStoreGlobals()
  const mib = 1024 * 1024
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        async estimate() {
          return {
            quota: 500 * mib,
            usage: 0
          }
        }
      }
    }
  })

  try {
    const result = await module.checkDownloadStoragePreflight(
      buildResumeStoreResource({ size: 200 * mib })
    )

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'opfs_unavailable_for_large_file')
    assert.equal(result.availableBytes, 500 * mib)
    assert.equal(result.opfsWritable, false)
    assert.equal(result.errorName, 'OpfsUnavailable')
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download storage preflight passes when estimate and OPFS probe are healthy', async () => {
  const { module, cleanup } = await importDownloadStoragePreflightModule()
  const globals = snapshotResumeStoreGlobals()
  const mib = 1024 * 1024
  installFakeOpfs()
  globalThis.navigator.storage.estimate = async () => ({
    quota: 500 * mib,
    usage: 0
  })

  try {
    const result = await module.checkDownloadStoragePreflight(
      buildResumeStoreResource({ size: 50 * mib })
    )

    assert.equal(result.ok, true)
    assert.equal(result.fileSizeBytes, 50 * mib)
    assert.equal(result.availableBytes, 500 * mib)
    assert.equal(result.requiredBytes, 114 * mib)
    assert.equal(result.opfsWritable, true)
    assert.equal(module.formatStorageBytes(result.availableBytes), '500 MiB')
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('client mux storage preflight requires double space and OPFS for unknown or large input', async () => {
  const { module, cleanup } = await importDownloadStoragePreflightModule()
  const globals = snapshotResumeStoreGlobals()
  const mib = 1024 * 1024
  try {
    installFakeOpfs()
    globalThis.navigator.storage.estimate = async () => ({ quota: 200 * mib, usage: 0 })
    const resource = buildResumeStoreResource({ downloadMode: 'client_mux', size: 100 * mib })
    const insufficient = await module.checkDownloadStoragePreflight(resource)
    assert.equal(insufficient.ok, false)
    assert.equal(insufficient.reason, 'insufficient_storage')
    assert.equal(insufficient.requiredBytes, 264 * mib)

    globalThis.navigator.storage.estimate = async () => ({ quota: 1000 * mib, usage: 0 })
    assert.equal((await module.checkDownloadStoragePreflight(resource)).ok, true)
    const unknown = await module.checkDownloadStoragePreflight({ ...resource, size: null })
    assert.equal(unknown.ok, true)
    assert.equal(unknown.opfsWritable, true)
    assert.equal(unknown.requiredBytes, null)

    delete globalThis.navigator.storage.getDirectory
    for (const size of [null, 50 * mib + 1]) {
      const blocked = await module.checkDownloadStoragePreflight({ ...resource, size })
      assert.equal(blocked.ok, false)
      assert.equal(blocked.reason, 'opfs_unavailable_for_large_file')
      assert.equal(blocked.fileSizeBytes, size)
    }
    assert.equal((await module.checkDownloadStoragePreflight({ ...resource, size: 50 * mib })).ok, true)
    assert.equal((await module.checkDownloadStoragePreflight({ ...resource, downloadMode: 'direct', size: null })).ok, true)
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download temporary OPFS files clean only their own input and deferred output', async () => {
  const { module, cleanup } = await importCompiledTypescriptModule(
    path.resolve(repoDir, 'src/scripts/download/download-temp-storage.ts'),
    'download-temp-storage.js',
    'download-temp-storage-'
  )
  const globals = snapshotResumeStoreGlobals()
  const files = installFakeOpfs()
  try {
    const input = await module.createOpfsDownloadTempFile()
    const output = await module.createOpfsDownloadTempFile()
    await input.writable.write(new Uint8Array([1, 2, 3]))
    await input.writable.close()
    assert.equal((await input.getFile()).size, 3)
    await output.writable.write(new Uint8Array([4, 5]))
    await output.writable.close()
    assert.equal((await output.getFile()).size, 2)
    await input.cleanup()
    await input.cleanup()
    assert.equal(files.size, 1)
    assert.equal((await output.getFile()).size, 2)
    const failed = await module.createOpfsDownloadTempFile()
    await failed.writable.write(new Uint8Array([6]))
    await failed.cleanup()
    assert.equal(files.size, 1)
    await output.cleanup()
    assert.equal(files.size, 0)
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download resume store chooses OPFS resumable and does not persist clientRequestId', async () => {
  const { module, cleanup } = await importDownloadResumeStoreModule()
  const globals = snapshotResumeStoreGlobals()
  const values = installResumeStoreWindow()
  const files = installFakeOpfs()
  globalThis.URL = {
    createObjectURL() {
      return 'blob:resume'
    }
  }

  try {
    const record = await module.prepareResumeRecord(
      buildResumeStoreResource(),
      { deviceId: 'device-1', ownerSub: 'device:device-1', token: null },
      { downloadUrl: 'https://cdn.example.com/demo.mp4' }
    )
    assert.equal(record.storageType, 'opfs')
    assert.equal(record.recoveryMode, 'resumable')
    assert.equal(record.methodState.kind, 'single_file_range')
    assert.equal(record.methodState.downloadUrl, 'https://cdn.example.com/demo.mp4')

    const persisted = JSON.parse(values.get(module.DOWNLOAD_RESUME_RECORD_STORAGE_KEY))
    assert.equal(persisted.clientRequestId, undefined)
    assert.equal(persisted.methodState.downloadUrl, 'https://cdn.example.com/demo.mp4')

    const writer = await module.openResumeWriter(record, 0)
    await writer.write(new Uint8Array([1, 2, 3, 4]))
    await writer.close()
    const updated = await module.updateDownloadResumeRecord(record, {
      downloadedBytes: 4,
      totalBytes: null,
      mimeType: 'video/mp4',
      filename: 'demo-video.mp4',
      downloadUrl: 'https://cdn.example.com/demo.mp4'
    })
    const loaded = await module.loadDownloadResumeRecord()
    assert.equal(loaded.downloadedBytes, 4)
    assert.equal(loaded.totalBytes, null)
    assert.equal(loaded.methodState.tempFileName, updated.methodState.tempFileName)

    await module.clearDownloadResumeRecord(loaded)
    assert.equal(values.get(module.DOWNLOAD_RESUME_RECORD_STORAGE_KEY), undefined)
    assert.equal(files.size, 0)
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download resume store keeps OPFS temp file but exposes restartable record when Range resume is disabled', async () => {
  const { module, cleanup } = await importDownloadResumeStoreModule()
  const globals = snapshotResumeStoreGlobals()
  installResumeStoreWindow()
  installFakeOpfs()

  try {
    const record = await module.prepareResumeRecord(
      buildResumeStoreResource(),
      { deviceId: 'device-1', ownerSub: 'device:device-1', token: null },
      {
        downloadUrl: 'https://cdn.example.com/vimeo/demo.mp4',
        rangeResumable: false
      }
    )
    assert.equal(record.storageType, 'opfs')
    assert.equal(record.recoveryMode, 'restartable')
    assert.equal(record.methodState.kind, 'single_file_range')

    const writer = await module.openResumeWriter(record, 0)
    await writer.write(new Uint8Array([1, 2, 3, 4]))
    await writer.close()
    await module.updateDownloadResumeRecord(record, {
      downloadedBytes: 4,
      totalBytes: 12,
      mimeType: 'video/mp4',
      filename: 'demo.mp4',
      downloadUrl: 'https://cdn.example.com/vimeo/demo.mp4'
    })

    const loaded = await module.loadDownloadResumeRecord()
    assert.equal(loaded.storageType, 'opfs')
    assert.equal(loaded.recoveryMode, 'restartable')
    assert.equal(loaded.downloadedBytes, 0)
    assert.equal(loaded.methodState.kind, 'single_file_range')
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download resume store tags OPFS quota errors with storage type', async () => {
  const { module, cleanup } = await importDownloadResumeStoreModule()
  const globals = snapshotResumeStoreGlobals()
  const originalConsoleError = console.error
  installResumeStoreWindow()
  installFakeOpfsWithWriteFailure(
    new DOMException(
      'The operation failed because it would cause the application to exceed its storage quota.',
      'QuotaExceededError'
    )
  )
  console.error = () => {}

  try {
    const record = await module.prepareResumeRecord(
      buildResumeStoreResource(),
      { deviceId: 'device-1', ownerSub: 'device:device-1', token: null },
      { downloadUrl: 'https://cdn.example.com/demo.mp4' }
    )
    const writer = await module.openResumeWriter(record, 0)

    await assert.rejects(
      () => writer.write(new Uint8Array([1, 2, 3, 4])),
      error => {
        assert.equal(error.name, 'DownloadStorageError')
        assert.equal(error.storageType, 'opfs')
        assert.equal(error.operation, 'write_temp')
        assert.match(error.message, /storage=opfs/)
        assert.match(error.message, /operation=write_temp/)
        assert.match(error.message, /QuotaExceededError/)
        return true
      }
    )
  } finally {
    console.error = originalConsoleError
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('pending resume prompt renders filename and progress placeholders', async () => {
  const { module, cleanup } = await importWorkspaceRenderModule()
  try {
    assert.equal(
      module.formatPendingResumeText(
        'Detected an unfinished download "{filename}" ({progress}). Do you want to continue?',
        'zhuoqiuguan.mp4',
        37.8
      ),
      'Detected an unfinished download "zhuoqiuguan.mp4" (37%). Do you want to continue?'
    )
    assert.equal(
      module.formatPendingResumeText('Detected "{filename}" ({progress}).', 'price-$1.mp4', null),
      'Detected "price-$1.mp4" (unknown).'
    )
  } finally {
    await cleanup()
  }
})

test('download resume store can clear metadata before deleting OPFS temp file', async () => {
  const { module, cleanup } = await importDownloadResumeStoreModule()
  const globals = snapshotResumeStoreGlobals()
  const values = installResumeStoreWindow()
  const files = installFakeOpfs()

  try {
    const record = await module.prepareResumeRecord(
      buildResumeStoreResource(),
      { deviceId: 'device-1', ownerSub: 'device:device-1', token: null }
    )
    assert.equal(record.storageType, 'opfs')
    assert.equal(files.size, 1)

    await module.clearDownloadResumeMetadata()
    assert.equal(values.get(module.DOWNLOAD_RESUME_RECORD_STORAGE_KEY), undefined)
    assert.equal(files.size, 1)

    await module.cleanupResumeTempFile(record)
    assert.equal(files.size, 0)
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download resume store uses memory fallback without exposing a pending resume record', async () => {
  const { module, cleanup } = await importDownloadResumeStoreModule()
  const globals = snapshotResumeStoreGlobals()
  installResumeStoreWindow()
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { storage: {} }
  })

  try {
    const record = await module.prepareResumeRecord(
      buildResumeStoreResource({ downloadMode: 'direct' }),
      { deviceId: 'device-1', ownerSub: 'device:device-1', token: null }
    )
    assert.equal(record.storageType, 'memory')
    assert.equal(record.recoveryMode, 'current_page')
    assert.equal(record.persistent, false)
    const loaded = await module.loadDownloadResumeRecord()
    assert.equal(loaded, null)
  } finally {
    restoreResumeStoreGlobals(globals)
    await cleanup()
  }
})

test('download range stream resumes unknown size when 206 Content-Range start matches', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()
  const chunks = []
  const checkpoints = []

  try {
    const response = new Response(new Uint8Array([5, 6]), {
      status: 206,
      headers: {
        'content-range': 'bytes 4-5/*',
        'content-type': 'video/mp4'
      }
    })
    const result = await module.pipeRangeResponseToWriter(response, {
      sourceId: 'source-video-1',
      startByte: 4,
      fallbackTotalBytes: null,
      writer: {
        async write(chunk) {
          chunks.push(...Array.from(chunk))
        },
        async close() {}
      },
      onCheckpoint: async snapshot => {
        checkpoints.push(snapshot)
      }
    })

    assert.deepEqual(chunks, [5, 6])
    assert.equal(result.downloadedBytes, 6)
    assert.equal(result.totalBytes, null)
    assert.equal(checkpoints.at(-1).downloadedBytes, 6)
  } finally {
    await cleanup()
  }
})

test('download range stream resume speed excludes existing bytes', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()
  const originalDateNow = Date.now
  const checkpoints = []
  let now = 1_000
  Date.now = () => now

  try {
    const response = new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 206,
      headers: {
        'content-range': 'bytes 6-9/10',
        'content-type': 'video/mp4'
      }
    })
    await module.pipeRangeResponseToWriter(response, {
      sourceId: 'source-video-speed',
      startByte: 6,
      fallbackTotalBytes: 10,
      writer: {
        async write() {
          now = 3_000
        },
        async close() {}
      },
      onProgress: snapshot => {
        checkpoints.push(snapshot)
      }
    })

    assert.equal(checkpoints.at(-1).downloadedBytes, 10)
    assert.equal(checkpoints.at(-1).totalBytes, 10)
    assert.equal(checkpoints.at(-1).speedBytesPerSecond, 2)
  } finally {
    Date.now = originalDateNow
    await cleanup()
  }
})

test('download range stream detects byte progress for retry budget reset', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()

  try {
    assert.equal(module.hasRangeWriteProgress(100, 101), true)
    assert.equal(module.hasRangeWriteProgress(100, 100), false)
    assert.equal(module.hasRangeWriteProgress(100, 99), false)
  } finally {
    await cleanup()
  }
})

test('download range stream exhausted error keeps user copy and explains technical cause', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()

  try {
    const cause = new Error('Content-Range start mismatch, expected=115470144')
    cause.name = 'RangeResumeResponseError'
    const error = new module.AutoRangeResumeExhaustedError(
      '6190493851585618978',
      115470144,
      143639972,
      1,
      cause,
      {
        reason: 'direct_consecutive_empty_retries',
        retryLimit: 3
      }
    )

    assert.equal(error.name, 'AutoRangeResumeExhaustedError')
    assert.equal(error.userMessage, 'Network connection interrupted. Click Continue to resume.')
    assert.equal(error.reason, 'direct_consecutive_empty_retries')
    assert.equal(error.retryLimit, 3)
    assert.equal(error.causeName, 'RangeResumeResponseError')
    assert.match(error.message, /direct stream made no progress for 3 consecutive retries/)
    assert.match(error.message, /downloadedBytes=115470144/)
    assert.match(error.message, /retryCount=1/)
    assert.match(error.message, /cause=RangeResumeResponseError: Content-Range start mismatch/)
  } finally {
    await cleanup()
  }
})

test('download range stream turns browser Load failed into resumable interruption', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()
  const chunks = []
  const checkpoints = []
  let closeCalled = false
  let readerCancelCalled = false
  const originalReaderCancel = ReadableStreamDefaultReader.prototype.cancel
  const originalConsoleError = console.error
  ReadableStreamDefaultReader.prototype.cancel = function cancel(reason) {
    readerCancelCalled = true
    return originalReaderCancel.call(this, reason)
  }
  console.error = () => {}

  try {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
        },
        pull() {
          throw new TypeError('Load failed')
        }
      }),
      {
        status: 200,
        headers: {
          'content-length': '5',
          'content-type': 'video/mp4'
        }
      }
    )

    await assert.rejects(
      () =>
        module.pipeRangeResponseToWriter(response, {
          sourceId: 'source-video-load-failed',
          startByte: 0,
          fallbackTotalBytes: 5,
          writer: {
            async write(chunk) {
              chunks.push(...Array.from(chunk))
            },
            async close() {
              closeCalled = true
            }
          },
          onCheckpoint: async snapshot => {
            checkpoints.push(snapshot)
          }
        }),
      error => {
        assert.equal(error.name, 'RangeStreamInterruptedError')
        assert.equal(error.downloadedBytes, 3)
        assert.equal(error.totalBytes, 5)
        assert.equal(error.startByte, 0)
        return true
      }
    )
    assert.deepEqual(chunks, [1, 2, 3])
    assert.equal(readerCancelCalled, true)
    assert.equal(closeCalled, true)
    assert.equal(checkpoints.at(-1).downloadedBytes, 3)
  } finally {
    ReadableStreamDefaultReader.prototype.cancel = originalReaderCancel
    console.error = originalConsoleError
    await cleanup()
  }
})

test('download range stream rejects resume 200 before appending bytes', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()
  const chunks = []

  try {
    await assert.rejects(
      () =>
        module.pipeRangeResponseToWriter(
          new Response(new Uint8Array([1, 2]), { status: 200 }),
          {
            sourceId: 'source-video-1',
            startByte: 4,
            fallbackTotalBytes: 12,
            writer: {
              async write(chunk) {
                chunks.push(...Array.from(chunk))
              },
              async close() {}
            }
          }
        ),
      /resume requires 206/
    )
    assert.deepEqual(chunks, [])
  } finally {
    await cleanup()
  }
})

test('download range stream cancels invalid resumed response before appending bytes', async () => {
  const { module, cleanup } = await importDownloadRangeStreamModule()
  const chunks = []
  let closeCalled = false
  let cancelCalled = false

  try {
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
        },
        cancel() {
          cancelCalled = true
        }
      }),
      { status: 206 }
    )

    await assert.rejects(
      () =>
        module.pipeRangeResponseToWriter(response, {
          sourceId: 'source-video-1',
          startByte: 4,
          fallbackTotalBytes: 12,
          writer: {
            async write(chunk) {
              chunks.push(...Array.from(chunk))
            },
            async close() {
              closeCalled = true
            }
          }
        }),
      /Content-Range start mismatch/
    )
    assert.deepEqual(chunks, [])
    assert.equal(closeCalled, true)
    assert.equal(cancelCalled, true)
  } finally {
    await cleanup()
  }
})

test('download methods register only direct and client_mux without a storage fallback', async () => {
  const source = await readFile(
    path.resolve(repoDir, 'src/scripts/download/download-methods.ts'),
    'utf8'
  )
  const directStart = source.indexOf('direct: {')
  const clientMuxStart = source.indexOf('client_mux: {', directStart)
  const registryEnd = source.indexOf('\n}', clientMuxStart)
  const directSource = source.slice(directStart, clientMuxStart)
  const clientMuxSource = source.slice(clientMuxStart, registryEnd)

  assert.match(source, /direct:\s*\{/)
  assert.match(source, /client_mux:\s*\{/)
  assert.match(directSource, /requiresStoragePreflight:\s*true/)
  assert.doesNotMatch(directSource, /storagePreflightFallback/)
  assert.match(clientMuxSource, /requiresStoragePreflight:\s*true/)
  assert.doesNotMatch(clientMuxSource, /storagePreflightFallback/)
})

test('download methods allow zero-byte OPFS resume records', async () => {
  const directSource = await readFile(
    path.resolve(repoDir, 'src/scripts/download/direct-download.ts'),
    'utf8'
  )

  assert.match(directSource, /record\.storageType === 'opfs'[\s\S]*record\.methodState\.kind === 'single_file_range'[\s\S]*record\.methodState\.downloadUrl\.length > 0/)
  assert.doesNotMatch(directSource, /downloadedBytes\s*>\s*0/)
})

test('download completion executes the object_url transfer contract', async () => {
  const workspaceSource = await readFile(
    path.resolve(repoDir, 'src/scripts/download/workspace-download.ts'),
    'utf8'
  )
  const completionExecutorStart = workspaceSource.indexOf('function executeDownloadCompletion')
  const completionExecutorEnd = workspaceSource.indexOf(
    'function clearPendingTaskState',
    completionExecutorStart
  )
  const completionExecutorSource = workspaceSource.slice(
    completionExecutorStart,
    completionExecutorEnd
  )

  assert.match(completionExecutorSource, /anchor\.href\s*=\s*completion\.objectUrl/)
  assert.match(completionExecutorSource, /anchor\.download\s*=\s*completion\.filename/)
  assert.match(completionExecutorSource, /anchor\.rel\s*=\s*'noopener'/)
  assert.doesNotMatch(completionExecutorSource, /referrerPolicy/)
  assert.doesNotMatch(completionExecutorSource, /state\.activeDownload\s*=\s*false/)
  assert.match(workspaceSource, /save_strategy:\s*downloadResult\.completion\.kind/)
  assert.match(workspaceSource, /session_policy:\s*executablePlan\.method\.sessionPolicy/)
  assert.match(
    workspaceSource,
    /HOMEPAGE_MARK_TYPE\.WEB_DOWNLOAD_SUCCESS[\s\S]*reportGA4Event\('web_download_success'/
  )
  assert.doesNotMatch(workspaceSource, /web_download_handoff/)
})

test('download Range auto resume budget is three and exhausted records stay resumable', async () => {
  const directSource = await readFile(
    path.resolve(repoDir, 'src/scripts/download/direct-download.ts'),
    'utf8'
  )
  const workspaceSource = await readFile(
    path.resolve(repoDir, 'src/scripts/download/workspace-download.ts'),
    'utf8'
  )

  assert.match(directSource, /const MAX_AUTO_RANGE_RESUME_RETRIES = 3/)
  assert.match(directSource, /consecutiveNetworkErrors >= MAX_AUTO_RANGE_RESUME_RETRIES/)
  assert.match(directSource, /hasRangeWriteProgress\(startByte, retryStartByte\)/)
  assert.match(directSource, /consecutiveNetworkErrors = hasTransferredBytes \? 0 : consecutiveNetworkErrors \+ 1/)
  assert.match(directSource, /reason: 'direct_consecutive_empty_retries'/)
  assert.match(directSource, /throw new AutoRangeResumeExhaustedError/)
  assert.match(directSource, /error instanceof AutoRangeResumeExhaustedError\)[\s\S]*?throw error/)
  assert.match(
    workspaceSource,
    /parsedError instanceof AutoRangeResumeExhaustedError\)[\s\S]*?restorePendingDownloadTask/
  )
  assert.match(workspaceSource, /function retryCountForFailedMark/)
  assert.match(workspaceSource, /error instanceof AutoRangeResumeExhaustedError[\s\S]*error\.retryCount/)
})

test('client mux enforces resource and memory limits without OPFS', async (t) => {
  const tempDir = await createTempDir('client-mux-limits-')
  t.after(() => rm(tempDir, { recursive: true, force: true }))
  const configPath = path.join(tempDir, 'tsconfig.json')
  await writeFile(configPath, JSON.stringify({
    extends: path.join(repoDir, 'tsconfig.json'),
    compilerOptions: { outDir: tempDir, noEmit: false, allowImportingTsExtensions: false },
    include: [],
    files: [path.resolve(repoDir, 'src/scripts/download/client-mux.ts')]
  }))
  await execFileAsync('pnpm', ['exec', 'tsc', '--project', configPath], { cwd: repoDir })
  await patchCompiledBrowserModuleFiles(tempDir)
  const compiledFile = await findFile(tempDir, 'client-mux.js')
  const module = await import(pathToFileURL(compiledFile).href)
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: {} } })
  t.mock.method(console, 'error', () => {})
  const mib = 1024 * 1024
  const intent = {
    sourceId: 'size-boundary', platform: 'vimeo', downloadMode: 'client_mux',
    filename: 'size-boundary.mp4', mimeType: 'video/mp4', size: null,
    videoTrack: { delivery: 'file', kind: 'video', url: 'data:video/mp4;base64,AA==', mimeType: 'video/mp4', size: null },
    audioTrack: { delivery: 'file', kind: 'audio', url: 'data:audio/mp4;base64,AA==', mimeType: 'audio/mp4', size: null }
  }
  try {
    for (const [size, reason] of [
      [null, 'opfs_unavailable_for_large_file'],
      [50 * mib + 1, 'opfs_unavailable_for_large_file'],
      [4 * 1024 * mib, 'opfs_unavailable_for_large_file'],
      [4 * 1024 * mib + 1, 'client_mux_too_large'],
      // 小文件允许完成真实 data URL 读取，再由解析器拒绝无效媒体。
      [50 * mib, 'client_mux_failed']
    ]) {
      await assert.rejects(module.downloadClientMuxResource({ ...intent, size }), error => {
        assert.ok(error instanceof module.ClientMuxDownloadError)
        assert.equal(error.reason, reason)
        return true
      })
    }
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})


test('注册归因使用网站当前设备与首次打开时间', async () => {
  const { module, cleanup } = await importHomepageAuthModule(
    path.resolve(repoDir, 'src/scripts/runtime/auth.ts'),
    'registration-context-'
  )
  const originalWindow = globalThis.window
  const websiteDevice = '11111111-1111-4111-8111-111111111111'
  const websiteTime = 1788000000000
  globalThis.window = {
    localStorage: { getItem: key => key === 'homepage_first_opened_at' ? String(websiteTime) : null }
  }
  try {
    assert.deepEqual(module.getRegistrationContext(websiteDevice), {
      registration_entry: null, register_device_id: websiteDevice, first_opened_at: websiteTime
    })
  } finally {
    globalThis.window = originalWindow
    await cleanup()
  }
})


test('网站 SLS 的 user_id 为数字，缺少或无法识别账号时为 0', async () => {
  const { module, cleanup } = await importHomepageSlsMarkModule(
    path.resolve(repoDir, 'src/scripts/runtime/sls-mark.ts'),
    'sls-user-id-'
  )
  const restore = installSlsBrowserGlobals({ href: `${SITE_ORIGIN}/` })
  const makeToken = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
  try {
    for (const [token, expected] of [
      [makeToken({ user_id: 123, email: '测试@example.com' }), 123],
      [makeToken({ user_id: 456 }), 456],
      [null, 0],
      ['invalid-token', 0],
      [makeToken({ user_id: '123' }), 0],
      [makeToken({ user_id: -1 }), 0],
      [makeToken(null), 0]
    ]) {
      const fields = module.buildSlsMarkFields('web_page_open', { deviceId: 'site-device', token }, '')
      assert.equal(fields.user_id, expected)
      const url = new URL(module.buildSlsMarkUrl(module.getSlsMarkConfig(), fields))
      assert.equal(url.searchParams.get('user_id'), String(expected))
      if (token) assert.equal(url.href.includes(token), false)
    }
  } finally {
    restore()
    await cleanup()
  }
})
