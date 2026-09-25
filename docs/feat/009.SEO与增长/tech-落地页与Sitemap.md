# 009 · 落地页与 Sitemap(Vimeo 平台落地页 + 多语言 Sitemap 生成器 + 首页 SEO)

> 技术实现文档。覆盖：website Vimeo 平台 SEO 落地页的模板与路由、自定义 Astro sitemap 集成（14 语言拆分 + lastmod）、首页 SEO 内容与结构化数据、SEO meta 来源治理。
>
> 来源：原 `feat.020 平台SEO落地页` + `feat.026 website多语言Sitemap治理` + `feat.024 website首页private视频下载改造`（首页 SEO 内容改造，§5）。原 `feat.030 website禁下载频道workaround落地页` 随产品单平台转型整体作废，其页面与组件已从代码删除，见 §3。
>
> 关联：
> - 本域产品：`@feat.md`
> - llms.txt 内容、导航/Install CTA：`@tech-LLMs与增长入口.md`
> - 签到后端：`@tech-签到活动.md`
> - website 目录结构、Astro 技术栈、构建配置：`@../000.架构/overview.md` `@../000.架构/tech-website.md`
> - 14 语言清单/locale→URL 路径映射：`@../010.多语言/tech-website多语言.md`
> - 下载工作区组件：`@../002.下载功能/feat.md`

## 1. Vimeo 平台 SEO 落地页(website)

### 1.1 现状(以代码为准)

产品单平台转型后，website 只剩 **一个平台落地页**：

```
website/src/pages/
├── vimeo-downloader.astro          # en-US 入口
└── [lang]/vimeo-downloader.astro   # 13 语言镜像
```

`PlatformDownloaderPage.astro` 的 `Platform` 联合类型已是 `type Platform = 'vimeo'`（单值），TikTok / X / Instagram / Threads 的页面与组件残留均已删除。

### 1.2 共享模板 PlatformDownloaderPage.astro

`website/src/components/pages/PlatformDownloaderPage.astro` 是平台落地页模板。

Props：

```ts
type Platform = 'vimeo'

interface Props {
  locale: Locale
  platform: Platform
}
```

页面区块顺序(从上到下)：

1. **Hero 工具区**：复用首页 `.hero.hero-tool` 样式(含左右光晕装饰)，内嵌 `DownloadWorkspace` 组件，`headingLevel="h1"`。平台专属覆盖字段（title / linkPlaceholder / helperText）从 i18n `pages.platformDownloaders.vimeo.workspace` 取，其余字段继承首页 `pages.homepage.workspace`。
2. **Features 特性卡片**：标题 + 副标题 + 3 列卡片网格，960px 以下转单列；样式 scoped 在组件 `<style>` 内。
3. **HowTo 使用步骤**：复用 `HomepageHowToSection` 组件，3 步(复制链接→粘贴→下载)。
4. **FAQ 区块**：复用 `HomepageFaqSection`(details/summary 折叠)。

> 模板**不含** Cross-Links 互链区块：`pages.homepage.crossLinks` 是 optional 字段且 14 语言均未填充，`HomePage.astro` 的条件渲染不会命中，历史多平台互链已随单平台转型退场。

### 1.3 链接识别策略

`website-shared/src/download/scripts/platform.ts` 的 `detectPlatform(link)` 只识别 `vimeo.com` / `www.vimeo.com` / `player.vimeo.com` 三个 host，识别结果**仅用于埋点提前填充 GA4 event**；识别不到返回 `null`，不阻断提交。真正的准入由后端 Provider 判定。

### 1.4 JSON-LD 结构化数据

落地页注入两个 schema：

- **FAQPage**：对应 FAQ 区块的问答(`page.faq.items`)。
- **WebApplication**：标注在线工具(`applicationCategory: MultimediaApplication`，`operatingSystem: Any`，`offers.price: 0`，name 用品牌名)。

落地页设置 `includeSoftwareApplicationSchema={false}`，避免与全局 Chrome 扩展 schema 冲突。

### 1.5 SEO meta

Title / description / keywords 在 `website/src/i18n/lang/{locale}.ts` 的 `pages.platformDownloaders.vimeo.seo`，由 `src/i18n/schema.ts` 约束字段齐全（14 语言必填）。Title 后缀统一使用品牌 `Vimeo Video Downloader`。

### 1.6 多语言路由

`[lang]/vimeo-downloader.astro` 用统一模式生成路径：

```ts
export function getStaticPaths() {
  return Object.entries(localePaths)
    .filter(([locale]) => locale !== 'en-US')   // en-US 走无前缀根路由
    .map(([locale, path]) => ({ params: { lang: path }, props: { locale: locale as Locale } }))
}
```

locale→URL 前缀映射见 `@../010.多语言/tech-website多语言.md`(en-US 无前缀，pt-BR 前缀是 `pt` 不是 `pt-br`，等)。

### 1.7 不修改现有首页结构

平台落地页是纯新增，不修改首页；不加入导航栏(靠搜索流量发现)；不新增后端接口。

## 2. 多语言 Sitemap 治理(website)

### 2.1 替换默认 @astrojs/sitemap

源文档基线：单个混合语言 sitemap-0.xml + 无 lastmod + 静态 public/sitemap.xml。

代码事实：`website/astro.config.mjs` 已**移除 `@astrojs/sitemap` integration**，接入自定义 `languageSitemap()`：

```js
// website/astro.config.mjs
import languageSitemap from './src/sitemap/languageSitemap.mjs'
import { SITE_ORIGIN } from './src/lib/site.mjs'
export default defineConfig({
  site: isDev ? 'http://localhost:7910' : SITE_ORIGIN,   // 域名唯一配置点在 src/lib/site.mjs
  integrations: [vue(), languageSitemap()],
  trailingSlash: 'ignore',
  // ...
})
```

`website/public/sitemap.xml`(静态索引)**已删除**，所有 sitemap 文件由构建生成。

### 2.2 自定义 integration：languageSitemap.mjs

`website/src/sitemap/languageSitemap.mjs` 是自定义 Astro integration(`name: 'language-sitemap'`)，默认导出一个工厂函数返回 Astro hooks。

**构建后写入的文件**(`writeSitemaps` 阶段)：

| 文件 | 内容 |
| --- | --- |
| `dist/sitemap.xml` | 根 sitemap index，robots 和 GSC 主入口 |
| `dist/sitemap_index.xml` | 内容与 sitemap.xml 相同(命名兼容排查) |
| `dist/sitemap-0.xml` | 扁平 urlset，收录全部 canonical URL(对照旧版 GSC 成功读取入口) |
| `dist/sitemap.xsl` | 浏览器可读表格样式；搜索引擎仍读原始 XML |
| `dist/{slug}-sitemap.xml` × 14 | 14 语言 sitemap |

**14 语言 sitemap 文件名**：

| Locale | URL 前缀 | sitemap 文件 |
| --- | --- | --- |
| en-US | `/` | `en-sitemap.xml` |
| zh-CN | `/zh-cn/` | `zh-cn-sitemap.xml` |
| zh-TW | `/zh-tw/` | `zh-tw-sitemap.xml` |
| ja-JP | `/ja/` | `ja-sitemap.xml` |
| ko-KR | `/ko/` | `ko-sitemap.xml` |
| es-ES | `/es/` | `es-sitemap.xml` |
| pt-BR | `/pt/` | `pt-br-sitemap.xml` |
| de-DE | `/de/` | `de-sitemap.xml` |
| fr-FR | `/fr/` | `fr-sitemap.xml` |
| ru-RU | `/ru/` | `ru-sitemap.xml` |
| it-IT | `/it/` | `it-sitemap.xml` |
| vi-VN | `/vi/` | `vi-sitemap.xml` |
| th-TH | `/th/` | `th-sitemap.xml` |
| id-ID | `/id/` | `id-sitemap.xml` |

> 注意：`pt-BR` 的 URL 前缀是 `/pt/`(不是 `/pt-br/`)，但 sitemap 文件名用 `pt-br-sitemap.xml`(用 hreflangMap 的语言值)；两套映射独立，不要混。这份配置必须和 `website/src/i18n/ui.ts` 的 localePaths/hreflangMap 一致。

### 2.3 每个 `<url>` 字段

每个 `<url>` 只包含：

- `<loc>`：完整绝对 URL(`SITE_ORIGIN` + 路径)。
- `<lastmod>`：W3C Datetime。

**不输出 `<priority>` / `<changefreq>`**(Google 忽略它们)。

### 2.4 lastmod 计算规则

`lastmod` 必须代表页面内容或结构的最后一次有效变更，**不能用构建时间**。

执行顺序(`getGitLastmod` → `getMtimeLastmod`)：

1. 对页面族源文件列表执行 `git log -1 --format=%cI -- <files>`(committer date，ISO)，取最新提交时间。
2. 没有 Git 结果(构建环境无 Git 历史)时，退到相关源文件的 `mtime`(最大 mtimeMs)，并在构建日志打 warning 说明哪个 URL 用了 fallback、Git 查询失败原因、fallback 文件路径与时间。

### 2.5 页面族 → 源文件映射(getRouteSourceFiles)

`getRouteSourceFiles(routePath)` 把 URL 路径归到页面族，返回该族的源文件列表(只从族源文件算 lastmod，不叠加全局壳层/配置/locale 大文件)；路径未登记时直接抛错，构建失败：

| route pattern | source group |
| --- | --- |
| `/` | `src/pages/index.astro` + `src/pages/[lang]/index.astro` + `src/components/pages/HomePage.astro` |
| `/changelog/` | changelog.astro + [lang]/ + `src/i18n/content.ts` |
| `/terms/`、`/privacy/` | 对应 page + [lang]/ + `LegalPage.astro` + `src/legal/legalContent.ts` |
| `/about/`、`/contact/` | 对应 page + [lang]/ + `CompanyPage.astro` + `src/company/companyContent.ts` |
| `/pricing/`、`/ext-pricing/` | 对应 page + [lang]/ + `PricingPage.astro` + `src/i18n/pricing.ts` + website-shared 的 `PricingPageShell.astro` / `pricing-page-controller.ts` |
| `/paypal/success/`、`/paypal/cancel/` | 对应 page + website-shared 的 `credit-purchase/paypal-return.ts` |
| `/*-downloader/` | 对应 page + [lang]/ + `PlatformDownloaderPage.astro` |

**不叠加** `src/layouts/Layout.astro`、`src/i18n/ui.ts`、`src/i18n/lang/{locale}.ts`：这些粒度过粗，会让壳层/配置/整种语言的翻译改动污染全站或整语言的 lastmod。

### 2.6 语言分组规则

- URL path 为 `/` 或第一段不是任何语言前缀 → 归入 en-US。
- URL path 第一段命中 `localePaths` 的 pathPrefix → 归入对应 locale。
- 每个 locale 内部 URL 按路径字母序排序；URL 去重后再写。

### 2.7 排除规则

不进入 sitemap：

- `404`、`500`(`STATUS_CODE_PAGES`)。
- 搜索引擎封禁路由(`SEARCH_BOT_BLOCKED_ROUTE_PATHS`)：`/clink/cancel/`、`/clink/success/`、`/paypal/cancel/`、`/paypal/success/`——这四个支付回跳页同时被 `robots.txt` Disallow。
- 尾斜杠规范化(`trailingSlash !== 'never'`)：非根路径统一补尾斜杠后再入 sitemap。

> **pricing 的处理(以代码为准)**：源文档 feat.026 说"pricing 由 robots.txt 屏蔽，不进入 sitemap"。代码事实：主站 `website/public/robots.txt` 对 `User-agent: *` 只 Disallow 四个支付回跳路径，不屏蔽 pricing；`/pricing/` 与 `/ext-pricing/` 正常进入 sitemap。本域按主站现状写。

### 2.8 XML 写入

XML 写入做实体转义(`&`→`&amp;`、`<`→`&lt;`、`>`→`&gt;`、`"`→`&quot;`、`'`→`&apos;`)。sitemap index 内每个 sitemap 的 `<lastmod>` 用该语言 sitemap 内 URL 的最大 lastmod。

### 2.9 robots.txt(website 主站)

`website/public/robots.txt`：

```txt
User-agent: *
Disallow: /clink/cancel/
Disallow: /clink/success/
Disallow: /paypal/cancel/
Disallow: /paypal/success/

# AI-readable site indexes
Allow: /llms.txt
Allow: /llms-full.txt

# Sitemap reference
Sitemap: https://<SITE_ORIGIN>/sitemap.xml
```

- `User-agent: *` 下屏蔽四个支付回跳页(Clink / PayPal 的 success 与 cancel)；这些页面也不进入 sitemap。
- 显式 Allow `/llms.txt` 和 `/llms-full.txt` 作为 AI-readable 入口提示。
- 只暴露根 sitemap 入口；域名与 `src/lib/site.mjs` 的 `SITE_ORIGIN` 一起替换（当前是占位值）。

## 3. 已废弃：禁下载频道 workaround 长尾页

原 `feat.030` 的 `/telegram-download-disabled-channel-workaround/` 文章页、`TelegramDownloadDisabledGuidePage.astro`、`i18n/downloadDisabledChannelWorkaround.ts` 与相关 sitemap route family **已随产品单平台转型整体删除**，代码中不再存在该路由。`/solutions/` 的退休状态与 Cloudflare 重定向是上一代产品的历史处置，不在本文档维护；仍需要时以部署侧配置为唯一依据。

## 4. 验收/验证命令

### website

```bash
cd website
pnpm build
pnpm test:module-scripts
# 抽查构建产物:
#   dist/vimeo-downloader/index.html, dist/zh-cn/vimeo-downloader/index.html (多语言抽查)
#   dist/sitemap.xml, dist/sitemap_index.xml, dist/sitemap-0.xml, dist/*-sitemap.xml
#   dist/llms.txt, dist/llms-full.txt, dist/robots.txt
xmllint --noout dist/sitemap.xml dist/sitemap_index.xml dist/sitemap-0.xml dist/*-sitemap.xml
```

> `pnpm build` 已包含 `astro check`，不需要单独跑 `tsc --noEmit`。

## 5. 首页 Vimeo 改造(website)

> 来源：原 `feat.024 website首页private视频下载改造`。原改造面向 Telegram 私有频道关键词，单平台转型后 H1、区块文案与专有名词锁定全部改为 Vimeo 口径。

### 5.1 定位

主站首页 `/`(及 14 语言 `/[lang]/`)是围绕 **Vimeo 视频下载**关键词的 SEO + 转化着陆页。**只改内容结构，不改下载解析逻辑**(`DownloadWorkspace` 仅作 Hero 保留，功能不变)。

### 5.2 SEO meta 独立化

- i18n 的 `pages.homepage` 下有**必填** `seo: { title; description; keywords }` 字段，所有 locale 的首页 meta 都从该字段取值。
- 不走 `t.site.name` / `t.site.keywords`(全站共享，无法承载首页口径)。
- 由 `src/i18n/schema.ts` 强制 14 语言齐全(运行期不缺字段)。
- H1 唯一：解析工具标题 `workspace.parse.title` 直接承载首页 H1 文案，**不新增独立标题行、不动 `headingLevel`**。

### 5.3 首页区块顺序(从上到下)

1. **Hero(解析工具区)**：H1(取 `workspace.parse.title`)→ 解析输入框 → 副描述(`workspace.parse.helperText`)→ **Trust Points**(`heroTrustPoints`，纯文字徽标)。视觉层：徽标渲染为白底 pill + 主色圆形对勾图标；hero 另加点阵纹理、顶部蓝色辉光与桌面端浮动装饰层，均纯装饰 aria-hidden，不新增文案。
2. **情景匹配表**(`InfoTable`，`homepage.situation`)。
3. **HowTo**(`HomepageHowToSection`，3 步)：复制链接 → 粘贴解析 → 选择画质下载。
4. **Solutions**(`SolutionsSection`)：标题 + intro + quickAnswer 强调段 + 方案卡。
5. **卖点网格**(`BenefitsSection`)：标题 + intro + 多张卖点卡；每张卡下半部按序位嵌入纯装饰迷你 mockup 插图，aria-hidden，占位内容为非语言装饰。
6. **排错清单**(内联)：`homepage.troubleshooting`。
7. **合规声明**(内联)：`homepage.permission`，独立卡片，声明不绕过权限、只处理用户已加载或已有权访问的内容。
8. **方法对比表**(`InfoTable`，`homepage.comparison`)。
9. **交叉链接**(`CrossLinksSection`，条件渲染)：仅当 `homepage.crossLinks` 有值才渲染；当前 14 语言均未填充，实际不输出。
10. **FAQ**(`HomepageFaqSection`，`homepage.faq`)。

### 5.4 首页结构化数据

- **FAQPage JSON-LD**：在 `HomePage.astro` 构造 `faqSchema` 对象，通过 `structuredData={[faqSchema]}` 传给 `Layout`(走 Layout 现有结构化数据渲染链路)，**不要用 `slot="head"` 注入**(Layout 不消费该 slot，会变成不渲染的 bug)。
- 验收断言：渲染后 `<head>` 内存在 `application/ld+json` 且含 `FAQPage`。

### 5.5 响应式

- ≤960px：卡片网格转单列。
- ≤640px：两张 InfoTable(情景匹配表 / 方法对比表)转纵向卡片堆叠，不横向溢出。

### 5.6 合规边界

- 屏幕录制等替代方案不得宣称绕过权限，只描述保存用户已经有权访问或已加载的内容。
- 不支持私密、密码保护与付费 Vimeo 视频，文案不得暗示可下载受限内容。

### 5.7 专有名词锁定不翻译

`Vimeo`、`Vimeo Video Downloader`、`player.vimeo.com`、`Chrome`/`Edge`/`Brave`、`MP4`/`MP3`/`JPG` 等专有名词锁定不翻译。

### 5.8 埋点

保留现有 `data-ga-event` / `data-ga-source` 委派埋点机制。新增可点击内链 / CTA 沿用 `data-ga-event="internal_workflow_click"`，`data-ga-source` 区分区块(如 `homepage_situation` / `homepage_solutions` / `homepage_comparison`)。解析 CTA 的现有埋点不变。不新增自定义事件类型(本节为内容改造，非埋点改造)。

## 6. SEO meta 来源治理(website)

### 6.1 JSON-LD 品牌字段与页面 SEO 解耦

`website/src/layouts/Layout.astro` 用一个本地常量固定 schema 主实体品牌，与页面 `<title>` / `<meta description>` 来源完全解耦：

```ts
const schemaName = PRODUCT_NAME   // 'Vimeo Video Downloader'，来自 src/lib/site.mjs
```

`schemaName` 同时写入 `SoftwareApplication.name`、`Organization.name`、`SoftwareApplication.author.name`。页面级 title / description 继续由各页传入，不反向影响 schema 主实体。

收益：schema 品牌实体保持统一；`site.name`(导航/页脚品牌)和首页 `pages.homepage.seo.title` 可独立做长度控制，不会污染结构化数据主实体。

### 6.2 页面 SEO 字段独立化模式

每个需要独立 SEO 口径的页面族，在 i18n 内维护**专用 SEO 字段**，不复用 `site.*` 或页面正文标题：

| 页面族 | SEO 字段位置 | 取值方式 |
| --- | --- | --- |
| 首页 `/` | `pages.homepage.seo.{title,description,keywords}` | 由 schema 强制 14 语言齐全(见 §5.2) |
| 平台落地页 `/*-downloader/` | `pages.platformDownloaders.vimeo.seo.{title,description,keywords}` | 由 schema 强制 14 语言齐全 |
| Changelog `/changelog/` | `pages.changelog.{seoTitle,seoDescription}` | 页面回退到正文 `title` / `description` |
| Legal `/terms/` `/privacy/` | `legalContent.ts` 的 `seoTitle` / `seoDescription` | `LegalPage.astro` 直接读 |
| Company `/about/` `/contact/` | `companyContent.ts` 的 `seoTitle` / `seoDescription` | `CompanyPage.astro` 直接读 |

构建产物验收按西文 title ≤60、description 140-160 字符，CJK title ≤40、description 70-90 字符扫描；这些阈值不作为运行时常量。

Changelog 页(`website/src/pages/changelog.astro`、`[lang]/changelog.astro`)显式回退：

```ts
const title = t.pages.changelog.seoTitle || t.pages.changelog.title
const description = t.pages.changelog.seoDescription || t.pages.changelog.description
```

> 原因：页面正文标题长度与 SEO 最优长度不一致，SEO title 需要独立控制；仅在不重复时追加规范品牌。

### 6.3 规范品牌合同

唯一品牌为 `Vimeo Video Downloader`，不追加其他品牌后缀。

- `schemaName`、全站 i18n `site.name`、导航 `nav.brand`、页脚版权、Legal `serviceName`、sitemap、`application-name`、`og:site_name`、`WebSite.name`、`WebApplication.name` 与 `Organization.name` 均使用 `Vimeo Video Downloader`。
- 不保留其他品牌别名作为运行时回退。
- Chrome 商店命名属于商店域，见 `@../../assets/store/`。

### 6.4 结构化数据合规约束

- `Layout.astro` JSON-LD 不得输出无法由真实数据支持的 `aggregateRating`。
- `SoftwareApplication.featureList` 只描述用户已加载或已有权访问的内容，不得出现 `100%`、`bypass` 等绝对化或绕过权限的承诺。
