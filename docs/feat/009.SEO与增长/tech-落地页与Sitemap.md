# 009 · 落地页与 Sitemap(首页内容结构 + 多语言 Sitemap 生成器 + SEO meta)

> 技术实现文档。覆盖：website 首页(工具首屏 + 8 个展示区块)的组件与文案合同、结构化数据、自定义 Astro sitemap 集成(14 语言拆分 + lastmod)、SEO meta 来源治理。
>
> 关联：
> - 本域产品：`@feat.md`
> - llms 文件、导航/Install CTA、页脚：`@tech-LLMs与增长入口.md`
> - website 目录结构、Astro 技术栈、构建配置：`@../000.架构/tech-website.md`
> - 14 语言清单/locale→URL 路径映射：`@../010.多语言/tech-website多语言.md`
> - 首屏下载工作区：`@../002.下载功能/feat.md`
> - 决策基线：`@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §2.2、§2.8

## 1. 平台落地页:不存在

产品单平台，网页下载器直接放在首页首屏，不再有独立的平台落地页路由。`/vimeo-downloader/` 及其语言版本已删除（避免同一关键词两个页面），不做重定向；`/changelog/`、`/ext-pricing/` 同样已删除。sitemap、llms、导航、页脚均不得再出现这些路径。

链接识别：`website/src/scripts/download/platform.ts` 的平台识别只认 `vimeo.com` / `www.vimeo.com` / `player.vimeo.com` 三个 host，结果仅用于埋点预填；识别不到不阻断提交，真正的准入由后端 Provider 判定。

## 2. 多语言 Sitemap 治理(website)

### 2.1 自定义集成

`website/astro.config.mjs` 只注册自定义 `languageSitemap()` 集成（`@astrojs/sitemap` 不使用），站点源取自 `src/lib/site.mjs` 的 `SITE_ORIGIN`（dev 用本地端口）。`website/public/` 下没有静态 sitemap，所有 sitemap 文件由构建生成。

### 2.2 构建产物

`website/src/sitemap/languageSitemap.mjs`（集成名 `language-sitemap`，钩 `astro:build:done`）写入：

| 文件 | 内容 |
| --- | --- |
| `dist/sitemap.xml` | 根 sitemap index，robots 和 Search Console 主入口 |
| `dist/sitemap_index.xml` | 内容与 sitemap.xml 相同(命名兼容排查) |
| `dist/sitemap-0.xml` | 扁平 urlset，收录全部 canonical URL |
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

只包含 `<loc>`（`SITE_ORIGIN` + 路径的完整绝对 URL）与 `<lastmod>`（W3C Datetime）。**不输出 `<priority>` / `<changefreq>`**(Google 忽略它们)。

### 2.4 lastmod 计算规则

`lastmod` 必须代表页面内容或结构的最后一次有效变更，**不能用构建时间**。

1. 对页面族源文件列表取 `git log -1 --format=%cI` 的最新提交时间。
2. 没有 Git 结果(构建环境无 Git 历史)时，退到相关源文件的 `mtime`(最大值)，并在构建日志打 warning，说明哪个 URL 用了 fallback、Git 查询失败原因、fallback 文件路径与时间。

### 2.5 页面族 → 源文件映射

`getRouteSourceFiles(routePath)` 把 URL 路径归到页面族，只从族源文件算 lastmod（不叠加 Layout、`i18n/ui.ts`、`i18n/lang/*` 等粒度过粗的文件，避免壳层或整语言翻译改动污染全站 lastmod）；路径未登记时直接抛错，构建失败：

| route pattern | source group |
| --- | --- |
| `/` | `pages/index.astro` + `pages/[lang]/index.astro` + `components/pages/HomePage.astro` |
| `/terms/`、`/privacy/` | 对应 page + `[lang]/` + `components/pages/LegalPage.astro` + `legal/legalContent.ts` |
| `/about/`、`/contact/` | 对应 page + `[lang]/` + `components/pages/CompanyPage.astro` + `company/companyContent.ts` |
| `/pricing/` | `pages/pricing.astro` + `[lang]/` + `components/pages/PricingPage.astro` + `i18n/pricing.ts` + `components/pricing/` 的页壳、登录弹窗、页控制器 + `components/order-checkout/OrderCheckoutModal.astro` |

以上路径均相对 `website/src/`。支付回跳页不在映射里：它们在路由收集阶段已被提前忽略，不进入 sitemap。

### 2.6 语言分组规则

- URL path 为 `/` 或第一段不是任何语言前缀 → 归入 en-US。
- URL path 第一段命中 `localePaths` 的 pathPrefix → 归入对应 locale。
- 每个 locale 内部 URL 按路径字母序排序；URL 去重后再写。

### 2.7 排除规则

不进入 sitemap：

- `404`、`500`。
- 搜索引擎封禁路由：`/clink/cancel/`、`/clink/success/`、`/paypal/cancel/`、`/paypal/success/`——这四个支付回跳页同时被 `robots.txt` Disallow、页面 noindex。
- 非根路径统一补尾斜杠后再入 sitemap。

`/pricing/` 不被 robots 屏蔽，正常进入 sitemap。

### 2.8 XML 写入

XML 写入做实体转义。sitemap index 内每个 sitemap 的 `<lastmod>` 用该语言 sitemap 内 URL 的最大 lastmod。

### 2.9 robots.txt(website 主站)

`website/public/robots.txt` 的合同：

- `User-agent: *` 下 Disallow 四个支付回跳页；
- 显式 Allow `/llms.txt` 与 `/llms-full.txt`；
- 只暴露根 sitemap 入口，域名与 `src/lib/site.mjs` 的 `SITE_ORIGIN` 一起替换（当前是占位值）。

## 3. 首页结构(website)

### 3.1 文件与区块顺序

- 路由：`pages/index.astro`（en-US）与 `pages/[lang]/index.astro`（其余 13 语言）都只装配 `components/pages/HomePage.astro`。
- 区块组件在 `components/homepage/`，每个区块一个文件，共用 `HomeSection.astro` 外壳（输出区块唯一的 H2，id 为 `<区块>-heading`）。

| 顺序 | 组件 | 文案键(`pages.homepage.*`) |
| --- | --- | --- |
| 首屏 | `components/download/DownloadWorkspace.astro` + 信任徽标 | `workspace`、`heroTrustPoints`(恰好 4 个) |
| 1 | `HomeIntroSection` | `intro`（含 `panel` 四行面板示意） |
| 2 | `HomeFeaturesSection` | `features` |
| 3 | `HomeStepsSection` | `steps` |
| 4 | `HomeComparisonSection` | `comparison`（维度 / 网页版 / 插件三列） |
| 5 | `HomeScopeSection` | `scope`（适用 / 不做 / 合规三组） |
| 6 | `HomePlansSection` | `plans`（Free / Unlimited 两卡） |
| 7 | `HomeFaqSection` | `faq` |
| 8 | `HomeFinalCtaSection` | `finalCta` |

约束：

- 页面唯一 H1 是下载工作区的解析工具标题（`workspace.parse.title`），不新增独立标题行。
- 展示区块纯静态、无客户端脚本；只有下载工作区运行前端状态机。
- 展示区块文案不写「无限」承诺、额度数字与价格，不出现 Credits、签到、积分购买；方案概览的数值来自后端配置，由 Pricing 页呈现。
- 文案事实与术语来源是 `docs/assets/store/<商店语言>.txt`，商店语言到站点 locale 的映射（如 `en_US`→`en-US`、`pt`→`pt-BR`）见 004 计划 §2.2。
- 专有名词（`Vimeo`、`Vimeo Video Downloader`、`Chrome`、`MP4` / `M4A` / `MP3` / `VTT` 等）不翻译。
- 合规边界：不暗示可下载受限内容，不宣称绕过权限或去除 DRM。

### 3.2 响应式

- 功能、步骤区块：四列 → 1200px 以下两列 → 960px 以下单列。
- 范围、方案、插件介绍区块：960px 以下单列。
- 对比表：960px 以下纵向堆叠，不横向溢出。
- 全站移动端主断点为 960px（见 `../../references/specs/spec-website.md` §4）。

### 3.3 结构化数据

- **FAQPage**：`HomePage.astro` 用 `homepage.faq.items` 构造，经 `Layout` 的 `structuredData` prop 注入，与可见 FAQ 同源；不能用 `slot="head"`（Layout 不消费该 slot）。
- **SoftwareApplication**：Layout 默认注入（`includeSoftwareApplicationSchema` 默认为真），Company、Legal、PaymentReturn 页传 `false` 不输出，实际只有首页和 Pricing 输出；类别为浏览器扩展，`description` 与 `featureList` 取 `pages.homepage.softwareApplication`（插件定位与能力清单，不得写成「无需插件」）。
- 不输出 WebApplication、不输出无法由真实数据支持的 `aggregateRating`。
- 验收：构建产物 `<head>` 内存在含 `FAQPage` 的 `application/ld+json`。

### 3.4 埋点

沿用 `data-ga-event` 委派：首页内链 / CTA 用内部跳转事件，来源字段区分区块（插件介绍、方案概览的 Free / Unlimited）；安装 CTA 用外链点击事件，来源字段区分导航、移动导航、插件介绍、结尾 CTA。不新增自定义事件类型。

## 4. SEO meta 来源治理(website)

### 4.1 JSON-LD 品牌字段与页面 SEO 解耦

`Layout.astro` 用常量 `PRODUCT_NAME`（`src/lib/site.mjs`）固定 schema 主实体品牌，同时写入 `SoftwareApplication.name`、`Organization.name`；`author` 只引用 Organization 的 `@id`，不写品牌名；页面级 title / description 由各页传入，不反向影响 schema 主实体。

### 4.2 各页面族的 SEO 字段来源

| 页面族 | title / description 来源 |
| --- | --- |
| 首页 `/` | `pages.homepage.meta.{title,description}`（覆盖「在线工具 + 插件」），由 `schema.ts` 强制 14 语言齐全 |
| Pricing `/pricing/` | `i18n/pricing.ts` 的 `getPricingPageCopy` 由订阅文案生成 seo |
| Legal `/terms/` `/privacy/` | `legalContent.ts` 的 `seoTitle` / `seoDescription` |
| Company `/about/` `/contact/` | `companyContent.ts` 的 `seoTitle` / `seoDescription` |

站点级默认 description 是 `site.description`，与首页 `meta.description` 同一措辞。构建产物验收按西文 title ≤60、description 140-160 字符，CJK title ≤40、description 70-90 字符扫描；这些阈值不作为运行时常量。

### 4.3 规范品牌合同

唯一品牌为 `Vimeo Video Downloader`，不追加其他品牌后缀。`schemaName`、导航品牌、页脚版权、Legal `serviceName`、sitemap XSL、`application-name`、`og:site_name` 与 `Organization.name` 均使用该名称；不保留其他品牌别名作为运行时回退。Chrome 商店命名属于商店域，见 `@../../assets/store/`。

### 4.4 结构化数据合规约束

- `SoftwareApplication.featureList` 只描述用户已加载或已有权访问的内容，不得出现 `100%`、`bypass` 等绝对化或绕过权限的承诺。
- OG 图为 1200×630 的静态 PNG（`public/og-image.png`），`public/manifest.json` 的描述与 `theme_color` 与新视觉一致。

## 5. 验收/验证命令

```bash
cd website
pnpm build
pnpm test:module-scripts
# 抽查构建产物:
#   dist/index.html, dist/zh-cn/index.html (首页多语言抽查)
#   dist/sitemap.xml, dist/sitemap_index.xml, dist/sitemap-0.xml, dist/*-sitemap.xml
#   dist/llms.txt, dist/llms-full.txt, dist/robots.txt
xmllint --noout dist/sitemap.xml dist/sitemap_index.xml dist/sitemap-0.xml dist/*-sitemap.xml
```

> `pnpm build` 已包含 `astro check`，不需要单独跑 `tsc --noEmit`。
