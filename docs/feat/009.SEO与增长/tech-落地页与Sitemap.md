# 009 · 落地页与 Sitemap(首页内容结构 + Guides 文章页 + 多语言 Sitemap 生成器 + SEO meta)

> 技术实现文档。覆盖：website 首页(工具首屏 + 8 个展示区块)的组件与文案合同、结构化数据、Guides 文章页(内容集合、路由、渲染与收录规则)、自定义 Astro sitemap 集成(14 语言拆分 + lastmod)、SEO meta 来源治理。
>
> 关联：
> - 本域产品：`@feat.md`
> - llms 文件、导航/Install CTA、页脚：`@tech-LLMs与增长入口.md`
> - website 目录结构、Astro 技术栈、构建配置：`@../000.架构/tech-website.md`
> - 14 语言清单/locale→URL 路径映射：`@../010.多语言/tech-website多语言.md`
> - 首屏下载工作区：`@../002.下载功能/feat.md`
> - 决策基线：`@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §2.2、§2.8

## 1. 平台落地页:不存在

产品单平台，网页下载器直接放在首页首屏，不再有独立的平台落地页路由。`/vimeo-downloader/` 及其语言版本已删除（避免同一关键词两个页面），不做重定向；`/changelog/` 同样已删除；旧积分页路径 `/pricing/` 不再生成，订阅购买页是 `/ext-pricing/`。sitemap、llms、导航、页脚均不得再出现这些路径。

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
| `/terms/`、`/privacy/` | 对应 page + `[lang]/` + `components/pages/LegalPage.astro` + `components/site/SiteBandHeader.astro`（页头带）+ `legal/legalContent.ts` |
| `/about/`、`/contact/` | 对应 page + `[lang]/` + `components/pages/CompanyPage.astro` + `components/site/SiteBandHeader.astro`（页头带）+ `company/companyContent.ts` |
| `/ext-pricing/` | `pages/ext-pricing.astro` + `[lang]/` + `components/pages/PricingPage.astro` + `i18n/pricing.ts` + `components/pricing/` 的页壳、登录弹窗、页控制器 + `components/order-checkout/OrderCheckoutModal.astro` |
| `/guides/` | `pages/guides/index.astro` + `[lang]/` + `components/pages/GuidesIndexPage.astro` + `guides/guidesContent.ts` + `content/guides/`（任一文章变化都会改变索引页） |
| `/guides/{slug}/` | `pages/guides/[slug].astro` + `[lang]/` + `components/pages/GuidePage.astro` + `guides/guidesContent.ts` + `content/guides/{slug}/`（该文章全部语言的正文） |

以上路径均相对 `website/src/`。支付回跳页不在映射里：它们声明 noindex，在计算 lastmod 之前已被 §2.7 排除。

### 2.6 语言分组规则

- URL path 为 `/` 或第一段不是任何语言前缀 → 归入 en-US。
- URL path 第一段命中 `localePaths` 的 pathPrefix → 归入对应 locale。
- 每个 locale 内部 URL 按路径字母序排序；URL 去重后再写。

### 2.7 排除规则

不进入 sitemap：

- `404`、`500`。
- 构建产物里 robots meta 含 `noindex` 的页面。集成在写 sitemap 前读取 `dist` 中各页 HTML 判断，以页面自己的 robots 声明为唯一来源，不另维护路径清单。当前命中两类：
  - 四个支付回跳页 `/clink/cancel/`、`/clink/success/`、`/paypal/cancel/`、`/paypal/success/`，它们同时被 `robots.txt` Disallow；
  - 13 个非英语 locale 的 `/terms/`、`/privacy/`，它们只渲染英文回退稿，见 §4.6。
- 非根路径统一补尾斜杠后再入 sitemap。

`/ext-pricing/` 不被 robots 屏蔽，正常进入 sitemap。

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
| 首屏 | `components/download/DownloadWorkspace.astro` + 信任徽标 | `workspace`、`heroTrustPoints`(恰好 2 个) |
| 1 | `HomeIntroSection` | `intro`（含 `panel` 四行面板示意；示意由 `ExtensionMockup.astro` 渲染，与 `HomeFinalCtaSection` 共用） |
| 2 | `HomeFeaturesSection` | `features` |
| 3 | `HomeStepsSection` | `steps` |
| 4 | `HomeComparisonSection` | `comparison`（维度 / 网页版 / 插件三列） |
| 5 | `HomeScopeSection` | `scope`（适用 / 不做 / 合规三组） |
| 6 | `HomePlansSection` | `plans`（Free / Unlimited 两卡） |
| 7 | `HomeFaqSection` | `faq` |
| 8 | `HomeFinalCtaSection` | `finalCta` |

约束：

- 页面唯一 H1 是下载工作区的解析工具标题，由 `workspace.parse.titleBrand`（品牌词，渐变文字）与 `workspace.parse.titleTagline`（标语）两个键拼成，两个 span 之间保留空白，使 H1 文本内容为「品牌词 + 空格 + 标语」；不新增独立标题行。
- 首屏另有一行插件入口，文案键 `workspace.parse.extensionEntryLine`，后接 Chrome / Edge 两个按钮，链接均为安装地址；引导卡可见时由 CSS 兄弟选择器隐藏（显示条件见 `@../002.下载功能/feat.md`），不增加脚本状态。
- 展示区块纯静态、无客户端脚本；只有下载工作区运行前端状态机。
- 展示区块文案不写「无限」承诺、额度数字与价格，不出现 Credits、签到、积分购买；方案概览的数值来自后端配置，由 Pricing 页呈现。
- 文案事实与术语来源是 `docs/assets/store/<商店语言>.txt`，商店语言到站点 locale 的映射（如 `en_US`→`en-US`、`pt`→`pt-BR`）见 004 计划 §2.2。
- 专有名词（`Vimeo`、`Vimeo Downloader`、`Chrome`、`MP4` / `M4A` / `MP3` / `VTT` 等）不翻译。
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

`Layout.astro` 用常量 `PRODUCT_NAME`（`src/lib/site.mjs`）固定 schema 主实体品牌，写入 `WebSite.name`、`SoftwareApplication.name`、`Organization.name`；`Organization.legalName` 取 `OPERATOR_LEGAL_NAME`。

- `WebSite` 全站输出：`@id` 为 `/#website`，`publisher` 引用 Organization 的 `@id`。它是 Google 站点名称的首选来源。
- `author` / `publisher` 只引用 Organization 的 `@id`，不写品牌名；Legal 页 `WebPage.publisher` 也只引用该 `@id`，不内联第二个 Organization。
- 页面级 title / description 由各页传入，不反向影响 schema 主实体。

### 4.2 各页面族的 SEO 字段来源

| 页面族 | title / description 来源 |
| --- | --- |
| 首页 `/` | `pages.homepage.meta.{title,description}`（覆盖「在线工具 + 插件」），由 `schema.ts` 强制 14 语言齐全。title 必须包含品牌词 `Vimeo Downloader`，当前格式为「品牌词 - 当地语言的任务描述」；各语言分别本地化，不得用一个常量覆盖全部语言 |
| Pricing `/ext-pricing/` | `i18n/pricing.ts` 的 `getPricingPageCopy` 由订阅文案生成 seo |
| Legal `/terms/` `/privacy/` | `legalContent.ts` 的 `seoTitle` / `seoDescription` |
| Company `/about/` `/contact/` | `companyContent.ts` 的 `seoTitle` / `seoDescription` |
| Guides 索引 `/guides/` | `guidesContent.ts` 的 `indexSeoTitle` / `indexSeoDescription`（14 语言齐全） |
| Guides 文章 `/guides/{slug}/` | 文章 frontmatter 的 `seoTitle` / `description`；不强制带品牌后缀，避免标题在 SERP 截断 |

站点级默认 description 是 `site.description`，与首页 `meta.description` 同一措辞。构建产物验收按西文 title ≤60、description 140-160 字符，CJK title ≤40、description 70-90 字符扫描；这些阈值不作为运行时常量。

### 4.3 规范品牌合同

唯一品牌为 `Vimeo Downloader`，不追加其他品牌后缀。以下位置均使用该名称：
- 页面元素：导航品牌、页脚品牌块与版权、14 语言首页 title；
- head 元数据：`application-name`、`og:site_name`；
- 结构化数据：`WebSite.name`、`Organization.name`、`SoftwareApplication.name`；
- 其他：Legal 文案（直接取 `PRODUCT_NAME`）、sitemap XSL。

不保留其他品牌别名作为运行时回退。Chrome 商店命名属于商店域，见 `@../../assets/store/`。

运营主体 `Ginyo Technologies Limited`（`OPERATOR_LEGAL_NAME`）是法定主体，不是品牌，不替代品牌名。它出现在：
- Terms：合同相对方；
- Privacy：引言；
- About、Contact 页头带与全站页脚：运营说明（`companyContent.operatorStatement`，14 语言）；
- 结构化数据：`Organization.legalName`。

### 4.4 结构化数据合规约束

- `SoftwareApplication.featureList` 只描述用户已加载或已有权访问的内容，不得出现 `100%`、`bypass` 等绝对化或绕过权限的承诺。
- OG 图为 1200×630 的静态 PNG（`public/og-image.png`），`public/manifest.json` 的描述与 `theme_color` 与新视觉一致。

### 4.5 Legal 页目录「当前项」规则

`LegalPage.astro` 的目录（左侧竖栏，手机为胶囊行）用 `aria-current="location"` 标出「正在阅读的章节」，样式只认该属性；没有 JS 时目录退化为普通锚点链接。判定规则：

- 滚动时取最后一个顶边已越过 `scroll-margin-top` 的章节，都没越过时取第一个；滚到页面底部时取最后一个，否则短的末尾章节永远不会成为当前项。
- 点击目录链接立即切换当前项，并「钉住」：记下该次点击的落点（目标章节顶边减 `scroll-margin-top`，夹在最大可滚动距离内）。平滑滚动途中与停在落点后，当前项保持为被点的链接，否则靠近页尾、滚不到阈值的短章节会被滚动判定覆盖回前一项。
- 钉住的解除只看滚动位置：滚动位置到落点的距离一旦比上次更大（离开或越过落点），就恢复滚动判定。因此滚轮、触摸、键盘、拖滚动条、页内查找、前进后退行为一致，不依赖枚举输入事件，也不依赖 `scrollend`。
- 无动画、无持久状态，不滚动胶囊行。

### 4.6 hreflang 与法务页索引规则

hreflang 只在「内容对等、且允许索引」的语言版本之间互指。页面通过 Layout 的 `alternateLocales` 声明这些版本：
- 默认是 14 语言全部，并加 `x-default` → en-US；
- 不足 2 个时不输出任何 hreflang，因为单一语言没有可互指的版本。

| 页面族 | `alternateLocales` | robots |
| --- | --- | --- |
| 首页、Pricing、About、Contact | 默认（14 语言） | `index, follow` |
| Terms、Privacy：该语言有自己的审校译本 | `LEGAL_CONTENT_LOCALES`（有译本的语言） | `index, follow` |
| Terms、Privacy：只渲染英文回退稿 | 空 | `noindex, follow` |
| Guides 索引页 | 有文章的语言 | `index, follow` |
| Guides 文章页 | 这篇文章实际存在的语言 | `index, follow` |
| 支付回跳页 | 空 | `noindex, nofollow, noarchive` |

某语言有没有法务译本，由 `legal/legalContent.ts` 的 `legalContentByLocale` 决定，`LEGAL_CONTENT_LOCALES` 与 `getLegalContentLocale` 都从它派生。

当前只有 en-US 有译本，因此：
- 英文 `/terms/`、`/privacy/` 可索引，但不输出 hreflang；
- 其余 13 语言的法务路由保留（站内导航不断），正文 `<article lang>` 标注 en-US；
- 页脚与 About / Contact 里的法务链接文案仍按页面语言本地化（`companyContent.termsLabel` / `privacyLabel`），不跟随正文回退成英文。

新增某语言的译本后，该语言法务页的索引、hreflang 与 sitemap（§2.7）自动恢复，不需要改路由或 sitemap 代码。

语言切换器是另一个声明：Layout 的 `availableLocales` 是「本页实际存在的语言版本」（默认 14 语言），切换器只列这些语言，不足 2 个时不渲染。它与 `alternateLocales` 分开，因为法务页的英文回退路由存在（可切换过去）却不参与 hreflang。当前取值：

| 页面族 | `availableLocales` |
| --- | --- |
| 首页、Pricing、About、Contact、Terms、Privacy | 默认（14 语言） |
| Guides 索引页 | 有文章的语言 |
| Guides 文章页 | 这篇文章实际存在的语言 |
| 支付回跳页 | 只有 en-US（不显示切换器） |

## 5. Guides 文章页(website)

### 5.1 文件

```
website/
├── astro.config.mjs                     # markdown：关闭 smartypants，挂 rehypeTableCellLabels
└── src/
    ├── content.config.ts                # 内容集合 guides：glob 加载 + frontmatter schema
    ├── content/guides/{slug}/{locale}.md # 文章正文，一篇一个目录、一个语言一个文件
    ├── guides/guidesContent.ts          # 外框文案（14 语言）+ 文章读取、路径、语言判定
    ├── lib/rehypeTableCellLabels.mjs    # 给表格正文单元格写入同列表头文字（data-label）
    ├── components/pages/GuidePage.astro        # 文章页
    ├── components/pages/GuidesIndexPage.astro  # 索引页
    └── pages/
        ├── guides/index.astro、guides/[slug].astro           # en-US
        └── [lang]/guides/index.astro、[lang]/guides/[slug].astro # 其他语言，只为有正文的语言生成
```

文章源稿与决策记录在 `docs/seo-skill/{slug}/`，不是运行时数据源；发布时把确认后的正文同步到 `content/guides/`。

### 5.2 内容模型

- 集合 id 用文件相对路径去掉扩展名（`{slug}/{locale}`），不用默认的小写 slug，否则 `en-US` 会变成 `en-us`，对不上 `Locale`。路径不是两段、或 locale 不在 14 语言里时构建失败。
- frontmatter（全部必填）：

| 字段 | 用途 |
| --- | --- |
| `title` | H1；Article `headline`；索引页卡片标题 |
| `seoTitle` | `<title>` |
| `description` | meta description；索引页卡片摘要 |
| `publishedAt` | Article `datePublished` |
| `updatedAt` | Article `dateModified`；页头日期胶囊（按页面语言、UTC 格式化，避免美洲时区显示成前一天） |

- 正文从二级标题起写，不写 H1、不写日期行；FAQ 的问题写成三级标题。
- 文章顺序：`publishedAt` 升序，同一天按标题排序。

### 5.3 外框文案

`guidesContent.ts` 的 `GuidesContent` 为 14 语言齐全的 `Record<Locale, …>`（多语言规则要求新增文案全语言同步）：栏目名（页脚入口、面包屑）、面包屑无障碍名称、日期标签、索引页 title / description / H1 / 引言。外框文案齐全不代表该语言有页面：页面是否生成只看正文。面包屑的 Home 复用 `layout.nav.home`。

### 5.4 路由与语言判定

| 判定 | 规则 |
| --- | --- |
| 某语言是否有 Guides | 至少有一篇该语言正文 |
| 索引页 | en-US 走 `/guides/`；其他语言只为有 Guides 的语言生成 `/{prefix}/guides/` |
| 文章页 | 每个 `{slug}/{locale}` 生成一页；没有回退语言 |
| 页脚入口 | Layout 判定当前语言有 Guides 时，在 Resources 组首位渲染，埋点 `internal_workflow_click` / `footer` / `guides` |
| hreflang / 语言切换器 | 见 §4.6：都取「这篇文章实际存在的语言」 |

`[lang]/` 路由当前不生成任何页面（只有英文正文），它们保证某语言补上正文后，路由、页脚入口、hreflang 一起出现，不会出现入口指向 404。

### 5.5 渲染

- 页头复用 `SiteBandHeader`：`breadcrumb` 插槽放面包屑（Home › Guides），日期胶囊不带冒号。
- 正文由 Markdown 渲染为普通 HTML，样式写在 `GuidePage.astro` 的 `.guide-content :global(...)` 下，取值全部来自 Layout token。
- 关闭 smartypants：文章逐字引用界面文案（如 `Checking browser storage...`），不得被改成弯引号或省略号；smartypants 还会把表格单元格开头的引号判成右引号。
- GFM 会把 `www.` 开头的文字自动转成链接；正文里的主机名一律写成行内代码。
- 表格：桌面首列 30%；600px 以下 `table / tbody / tr / td` 改为块级，表头只留给读屏，每行成卡片，非首格用 `data-label` 显示列名。`data-label` 由 rehype 插件在构建时从同列表头取文字，所以不需要额外文案。

### 5.6 结构化数据

| 页面 | 类型 | 要点 |
| --- | --- | --- |
| 文章页 | `Article` | `headline` = H1；`author`、`publisher` 都引用 `/#organization`；`inLanguage`；没有真实配图时不写 `image` |
| 文章页 | `BreadcrumbList` | Home → Guides → 本文，三级都带 `item` |
| 索引页 | `CollectionPage` | `name` = H1，`publisher` 引用 `/#organization` |

文章与索引页都不输出插件应用结构化数据；不加 `FAQPage`、`HowTo`。

## 6. 验收/验证命令

```bash
cd website
pnpm build
pnpm test:module-scripts
# 抽查构建产物:
#   dist/index.html, dist/zh-cn/index.html (首页多语言抽查)
#   dist/guides/index.html, dist/guides/*/index.html (Guides 抽查)
#   dist/sitemap.xml, dist/sitemap_index.xml, dist/sitemap-0.xml, dist/*-sitemap.xml
#   dist/llms.txt, dist/llms-full.txt, dist/robots.txt
xmllint --noout dist/sitemap.xml dist/sitemap_index.xml dist/sitemap-0.xml dist/*-sitemap.xml
```

> `pnpm build` 已包含 `astro check`，不需要单独跑 `tsc --noEmit`。
