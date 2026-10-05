/**
 * Builds the production sitemap index and per-language sitemap files.
 *
 * Flow:
 * Astro build pages -> collect canonical URLs -> group by locale prefix ->
 * resolve page lastmod from Git/file metadata -> write XML files.
 */
import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { PRODUCT_NAME } from '../lib/site.mjs'

const execFileAsync = promisify(execFile)
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const SITEMAP_INDEX_FILENAMES = ['sitemap.xml', 'sitemap_index.xml']
const LEGACY_FLAT_SITEMAP_FILENAME = 'sitemap-0.xml'
const SITEMAP_STYLESHEET_PATH = '/sitemap.xsl'
const STATUS_CODE_PAGES = new Set(['404', '500'])
const SEARCH_BOT_BLOCKED_ROUTE_PATHS = new Set([
  '/clink/cancel/',
  '/clink/success/',
  '/paypal/cancel/',
  '/paypal/success/'
])
const WEBSITE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const SITEMAP_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>XML Sitemap Index | ${PRODUCT_NAME}</title>
        <style>
          body {
            margin: 0;
            background: #f6f7fb;
            color: #1e293b;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          main {
            width: min(1040px, calc(100vw - 48px));
            margin: 72px auto;
          }

          h1 {
            margin: 0;
            color: #0f172a;
            font-size: 56px;
            line-height: 1;
          }

          .brand {
            margin: 22px 0 18px;
            color: #334155;
            font-size: 32px;
            font-weight: 800;
          }

          .summary {
            margin: 0 0 28px;
            color: #475569;
            font-size: 18px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 8px;
            background: #ffffff;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
          }

          th,
          td {
            padding: 14px 18px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            font-size: 15px;
          }

          th {
            color: #0f172a;
            background: #eef2f8;
            font-size: 16px;
          }

          tr:nth-child(even) td {
            background: #f8fafc;
          }

          a {
            color: #2563eb;
            font-weight: 700;
            text-decoration: none;
          }

          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>XML Sitemap</h1>
          <p class="brand">${PRODUCT_NAME}</p>
          <xsl:choose>
            <xsl:when test="sitemap:sitemapindex">
              <p class="summary">
                This sitemap index contains
                <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)" /></strong>
                language sitemaps.
              </p>
            </xsl:when>
            <xsl:otherwise>
              <p class="summary">
                This sitemap contains
                <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)" /></strong>
                URLs.
              </p>
            </xsl:otherwise>
          </xsl:choose>
          <table>
            <thead>
              <tr>
                <th>
                  <xsl:choose>
                    <xsl:when test="sitemap:sitemapindex">Sitemap</xsl:when>
                    <xsl:otherwise>URL</xsl:otherwise>
                  </xsl:choose>
                </th>
                <th>Last Modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                <tr>
                  <td>
                    <a href="{sitemap:loc}">
                      <xsl:value-of select="sitemap:loc" />
                    </a>
                  </td>
                  <td><xsl:value-of select="sitemap:lastmod" /></td>
                </tr>
              </xsl:for-each>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a href="{sitemap:loc}">
                      <xsl:value-of select="sitemap:loc" />
                    </a>
                  </td>
                  <td><xsl:value-of select="sitemap:lastmod" /></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`

/**
 * Sitemap locale mapping. Keep this aligned with src/i18n/ui.ts:
 * locale -> localePaths pathPrefix + hreflangMap sitemapSlug.
 */
export const LANGUAGE_SITEMAP_LOCALES = [
  { locale: 'en-US', pathPrefix: '', sitemapSlug: 'en' },
  { locale: 'zh-CN', pathPrefix: 'zh-cn', sitemapSlug: 'zh-cn' },
  { locale: 'zh-TW', pathPrefix: 'zh-tw', sitemapSlug: 'zh-tw' },
  { locale: 'ja-JP', pathPrefix: 'ja', sitemapSlug: 'ja' },
  { locale: 'ko-KR', pathPrefix: 'ko', sitemapSlug: 'ko' },
  { locale: 'es-ES', pathPrefix: 'es', sitemapSlug: 'es' },
  { locale: 'pt-BR', pathPrefix: 'pt', sitemapSlug: 'pt-br' },
  { locale: 'de-DE', pathPrefix: 'de', sitemapSlug: 'de' },
  { locale: 'fr-FR', pathPrefix: 'fr', sitemapSlug: 'fr' },
  { locale: 'ru-RU', pathPrefix: 'ru', sitemapSlug: 'ru' },
  { locale: 'it-IT', pathPrefix: 'it', sitemapSlug: 'it' },
  { locale: 'vi-VN', pathPrefix: 'vi', sitemapSlug: 'vi' },
  { locale: 'th-TH', pathPrefix: 'th', sitemapSlug: 'th' },
  { locale: 'id-ID', pathPrefix: 'id', sitemapSlug: 'id' }
]

const DEFAULT_LANGUAGE = LANGUAGE_SITEMAP_LOCALES.find((language) => language.locale === 'en-US')
const PREFIX_LANGUAGE_MAP = new Map(
  LANGUAGE_SITEMAP_LOCALES
    .filter((language) => language.pathPrefix !== '')
    .map((language) => [language.pathPrefix, language])
)

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizeRoutePath(routePath) {
  if (!routePath || routePath === '/') {
    return '/'
  }

  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function isIgnoredRoutePath(routePath) {
  const normalized = normalizeRoutePath(routePath)
  if (SEARCH_BOT_BLOCKED_ROUTE_PATHS.has(normalized)) {
    return true
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 1 && STATUS_CODE_PAGES.has(segments[0])) {
    return true
  }

  return false
}

function getBuildBaseUrl(astroConfig) {
  return new URL(astroConfig.base, astroConfig.site)
}

function toAbsolutePageUrl(pathname, astroConfig) {
  const baseUrl = getBuildBaseUrl(astroConfig)
  const cleanPathname = String(pathname ?? '').replace(/^\/+/, '')
  let basePath = baseUrl.pathname
  if (!basePath.endsWith('/')) {
    basePath = `${basePath}/`
  }

  let fullPath = `${basePath}${cleanPathname}`
  if (
    astroConfig.trailingSlash !== 'never' &&
    astroConfig.build.format === 'directory' &&
    fullPath !== '/' &&
    !fullPath.endsWith('/')
  ) {
    fullPath = `${fullPath}/`
  }

  return new URL(fullPath, baseUrl).href
}

function collectPageUrls(pages, routes, astroConfig) {
  const urls = new Set()

  for (const page of pages) {
    if (!isIgnoredRoutePath(page.pathname)) {
      urls.add(toAbsolutePageUrl(page.pathname, astroConfig))
    }
  }

  for (const route of routes) {
    if (route.type !== 'page' || !route.pathname || isIgnoredRoutePath(route.pathname)) {
      continue
    }

    urls.add(toAbsolutePageUrl(route.generate(route.pathname), astroConfig))
  }

  return [...urls].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

export function classifySitemapUrl(url) {
  const pathname = new URL(url).pathname
  const segments = pathname.split('/').filter(Boolean)
  const prefixedLanguage = segments.length > 0 ? PREFIX_LANGUAGE_MAP.get(segments[0]) : undefined
  const language = prefixedLanguage ?? DEFAULT_LANGUAGE
  const routeSegments = prefixedLanguage ? segments.slice(1) : segments
  const routePath = routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}/`

  return {
    language,
    routePath
  }
}

function getRouteSourceFiles(routePath) {
  const normalized = normalizeRoutePath(routePath)

  if (normalized === '/') {
    return [
      'src/pages/index.astro',
      'src/pages/[lang]/index.astro',
      'src/components/pages/HomePage.astro'
    ]
  }

  if (normalized === '/terms/' || normalized === '/privacy/') {
    const pageName = normalized.split('/').filter(Boolean)[0]
    return [
      `src/pages/${pageName}.astro`,
      `src/pages/[lang]/${pageName}.astro`,
      'src/components/pages/LegalPage.astro',
      'src/legal/legalContent.ts'
    ]
  }

  if (normalized === '/about/' || normalized === '/contact/') {
    const pageName = normalized.split('/').filter(Boolean)[0]
    return [
      `src/pages/${pageName}.astro`,
      `src/pages/[lang]/${pageName}.astro`,
      'src/components/pages/CompanyPage.astro',
      'src/company/companyContent.ts'
    ]
  }

  if (normalized === '/pricing/') {
    return [
      'src/pages/pricing.astro',
      'src/pages/[lang]/pricing.astro',
      'src/components/pages/PricingPage.astro',
      'src/i18n/pricing.ts',
      'src/components/pricing/PricingPageShell.astro',
      'src/components/pricing/PricingAuthModal.astro',
      'src/components/pricing/pricing-page-controller.ts',
      'src/components/order-checkout/OrderCheckoutModal.astro'
    ]
  }

  throw new Error(`languageSitemap: route source files are not mapped for routePath=${normalized}`)
}

function getUrlSourceFiles(routePath) {
  return getRouteSourceFiles(routePath)
}

async function getGitLastmod(files, logger) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%cI', '--', ...files],
      { cwd: WEBSITE_ROOT }
    )
    const lastmod = stdout.trim().split('\n').filter(Boolean)[0]
    if (lastmod) {
      return lastmod
    }
  } catch (error) {
    logger.warn(`languageSitemap: git lastmod lookup failed: ${error.message}`)
  }

  return ''
}

async function getMtimeLastmod(url, files, logger) {
  let latestMtimeMs = 0
  let latestFile = ''

  for (const file of files) {
    const fileStat = await stat(path.join(WEBSITE_ROOT, file))
    if (fileStat.mtimeMs > latestMtimeMs) {
      latestMtimeMs = fileStat.mtimeMs
      latestFile = file
    }
  }

  if (latestMtimeMs === 0) {
    throw new Error(`languageSitemap: unable to resolve lastmod for url=${url}`)
  }

  const lastmod = new Date(latestMtimeMs).toISOString()
  logger.warn(`languageSitemap: using file mtime fallback for url=${url}, file=${latestFile}, lastmod=${lastmod}`)
  return lastmod
}

async function resolveLastmod(url, routePath, logger) {
  const files = getUrlSourceFiles(routePath)
  const gitLastmod = await getGitLastmod(files, logger)
  if (gitLastmod) {
    return gitLastmod
  }

  return getMtimeLastmod(url, files, logger)
}

function createEmptyLanguageGroups() {
  return new Map(LANGUAGE_SITEMAP_LOCALES.map((language) => [language.locale, {
    language,
    entries: []
  }]))
}

export async function buildLanguageSitemapGroups(urls, logger) {
  const groups = createEmptyLanguageGroups()

  for (const url of urls) {
    const { language, routePath } = classifySitemapUrl(url)
    const lastmod = await resolveLastmod(url, routePath, logger)
    const group = groups.get(language.locale)
    group.entries.push({
      url,
      lastmod
    })
  }

  for (const group of groups.values()) {
    group.entries.sort((left, right) => {
      const leftPath = new URL(left.url).pathname
      const rightPath = new URL(right.url).pathname
      return leftPath.localeCompare(rightPath, 'en', { numeric: true })
    })
  }

  return groups
}

function validateGroups(groups) {
  for (const { language, entries } of groups.values()) {
    if (entries.length === 0) {
      throw new Error(`languageSitemap: ${language.locale} has no sitemap entries`)
    }

    for (const entry of entries) {
      if (Number.isNaN(Date.parse(entry.lastmod))) {
        throw new Error(`languageSitemap: invalid lastmod=${entry.lastmod} for url=${entry.url}`)
      }
    }
  }
}

function renderLanguageSitemap(entries) {
  const urlsXml = entries
    .map((entry) => [
      '  <url>',
      `    <loc>${escapeXml(entry.url)}</loc>`,
      `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
      '  </url>'
    ].join('\n'))
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<?xml-stylesheet type="text/xsl" href="${SITEMAP_STYLESHEET_PATH}"?>`,
    `<urlset xmlns="${SITEMAP_NAMESPACE}">`,
    urlsXml,
    '</urlset>',
    ''
  ].join('\n')
}

function renderSitemapIndex(groups, siteUrl) {
  const sitemapXml = [...groups.values()]
    .map(({ language, entries }) => {
      const lastmod = entries
        .map((entry) => entry.lastmod)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
      const loc = new URL(`/${language.sitemapSlug}-sitemap.xml`, siteUrl).href

      return [
        '  <sitemap>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
        '  </sitemap>'
      ].join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<?xml-stylesheet type="text/xsl" href="${SITEMAP_STYLESHEET_PATH}"?>`,
    `<sitemapindex xmlns="${SITEMAP_NAMESPACE}">`,
    sitemapXml,
    '</sitemapindex>',
    ''
  ].join('\n')
}

function collectFlatSitemapEntries(groups) {
  return [...groups.values()]
    .flatMap((group) => group.entries)
    .sort((left, right) => {
      const leftPath = new URL(left.url).pathname
      const rightPath = new URL(right.url).pathname
      return leftPath.localeCompare(rightPath, 'en', { numeric: true })
    })
}

async function writeSitemaps(groups, outputDir, siteUrl) {
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'sitemap.xsl'), SITEMAP_XSL)
  const sitemapIndexXml = renderSitemapIndex(groups, siteUrl)
  for (const filename of SITEMAP_INDEX_FILENAMES) {
    await writeFile(path.join(outputDir, filename), sitemapIndexXml)
  }
  await writeFile(
    path.join(outputDir, LEGACY_FLAT_SITEMAP_FILENAME),
    renderLanguageSitemap(collectFlatSitemapEntries(groups))
  )

  for (const { language, entries } of groups.values()) {
    await writeFile(
      path.join(outputDir, `${language.sitemapSlug}-sitemap.xml`),
      renderLanguageSitemap(entries)
    )
  }
}

export default function languageSitemap() {
  let resolvedRoutes = []
  let astroConfig

  return {
    name: 'language-sitemap',
    hooks: {
      'astro:routes:resolved': ({ routes }) => {
        resolvedRoutes = routes
      },
      'astro:config:done': ({ config }) => {
        astroConfig = config
      },
      'astro:build:done': async ({ dir, pages, logger }) => {
        if (!astroConfig.site) {
          logger.warn('languageSitemap: missing astro config site; sitemap generation skipped')
          return
        }

        const urls = collectPageUrls(pages, resolvedRoutes, astroConfig)
        const groups = await buildLanguageSitemapGroups(urls, logger)
        validateGroups(groups)
        await writeSitemaps(groups, fileURLToPath(dir), getBuildBaseUrl(astroConfig))
        logger.info(`languageSitemap: wrote ${urls.length} URLs into ${groups.size} language sitemaps`)
      }
    }
  }
}
