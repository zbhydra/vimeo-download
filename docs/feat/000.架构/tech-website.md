# 000 · 架构 · Astro 网站（website）

> website 的现状事实：目录、多语言、Sitemap、Cloudflare、SEO、SLS 双写。`website/` 自包含，全部源码在 `website/src`，无共享源码包、无 Vue。规则条文见根 `@../../../AGENTS.md` 与 `../../references/specs/spec-website.md`。
> 网站定位：免费网页下载器 + 插件展示 + 插件订阅购买；Credits 购买与展示、签到入口、下载工作区登录 / 账户均已从网站移除，后端接口与数据保留，网站不再调用（范围与后续处理见 `@plans/004.官网改版-插件展示与免费网页下载.md` §8）。

## 1. 技术栈

- **Astro 5**（`website/astro.config.mjs`，站点源集中在 `src/lib/site.mjs` 的 `SITE_ORIGIN`，`base='/'`）。生产域当前仍是占位值，上线前必须替换。
- 集成：只有自定义 `languageSitemap()`（`src/sitemap/`）。无 Vue、无 React；交互是 `.astro` 组件内的命令式 DOM 脚本。
- 内容集合：只有 `guides`（`src/content.config.ts`，Astro 内置 Content Layer，无额外依赖），正文是 Markdown。Markdown 关闭 smartypants（正文逐字引用界面文案），挂自写的 `rehypeTableCellLabels`。规则见 `@../009.SEO与增长/tech-落地页与Sitemap.md` §5。
- 下载引擎：`mediabunny`。
- TypeScript：`tsconfig.json` 继承 `astro/tsconfigs/strict`，除 `mediabunny` 的类型路径外无自定义 alias。
- 构建：`pnpm build` = `astro check && astro build`，无 Service Worker 前置步骤；e2e：Playwright（对接本地真实 backend，不使用 mock）。
- 部署：nginx（`website/deploy/vimeo-web.conf` 生产、`vimeo-web-test.conf` 测试）。

## 2. 目录结构（website）

```
website/
├── astro.config.mjs          # 集成 languageSitemap()；dev 端口 7910
├── package.json
├── cloudflare/               # CDN 缓存规则说明
├── deploy/                   # nginx 配置 + deploy.sh
├── e2e/ tests/               # Playwright 真实后端用例 / 模块脚本测试
├── public/                   # favicon、og-image、manifest、robots、llms*.txt、支付图标
└── src/
    ├── components/
    │   ├── download/         # 下载工作区、解析结果、匿名等待弹窗
    │   ├── homepage/         # 首页展示区块（8 个）与插件界面示意 ExtensionMockup（唯一实现，首页插件展示与收尾 CTA 共用）
    │   ├── pricing/          # Pricing 页壳、登录 / 订阅确认弹窗与控制器
    │   ├── order-checkout/   # 订阅结算弹窗与订单协议
    │   ├── payment-return/   # PayPal / Clink 回跳页共用组件与脚本
    │   ├── pages/            # 页面装配：Home / Pricing / Company / Legal / Guide / GuidesIndex
    │   └── site/             # 站级：深色舞台 SiteStage（hero / band / card 三变体，唯一实现）、SiteBandHeader（法务页、公司页与 Guides 页的页头带：SiteStage band + 可选面包屑 + H1 + 引言 + 日期胶囊，这几类页头的唯一实现）、确认框、X 图标
    ├── content.config.ts     # 内容集合 guides 的加载与 frontmatter schema
    ├── content/guides/       # Guides 文章正文：{slug}/{locale}.md
    ├── guides/guidesContent.ts # Guides 外框文案（14 语言）+ 文章读取、路径、语言判定
    ├── i18n/                 # ui / content / schema / pricing / payment-return + lang/*
    ├── layouts/Layout.astro  # 唯一布局
    ├── legal/ company/       # terms/privacy、about/contact 文案
    ├── lib/site.mjs          # 站点身份唯一配置点
    ├── lib/rehypeTableCellLabels.mjs # Markdown 表格单元格写入列名 data-label（手机表格卡片用）
    ├── pages/                # index / ext-pricing / about / contact / terms / privacy / guides/、[lang]/、clink/、paypal/
    ├── scripts/
    │   ├── globalClickEvents.ts  # 全站点击埋点
    │   ├── download/         # 下载状态机、下载方法、媒体接口
    │   ├── runtime/          # api / auth / device / mark / sls-mark / ga4 / 错误捕获
    │   └── site/             # confirm / language-switcher
    └── sitemap/languageSitemap.mjs
```

页面集合（14 语言；en-US 无前缀）：首页、Pricing、About、Contact、Terms、Privacy；Guides（索引页 + 文章）只在有文章正文的语言生成，目前只有英文；支付回跳页 `paypal/{success,cancel}`、`clink/{success,cancel}` 仅英文、无语言镜像。产品口径见 `@../009.SEO与增长/feat.md`、`@../011.Pricing页/feat.md`。

## 3. 多语言机制

- **14 个 locale**（`src/i18n/ui.ts`）：de-DE / en-US / es-ES / fr-FR / id-ID / it-IT / ja-JP / ko-KR / pt-BR / ru-RU / th-TH / vi-VN / zh-CN / zh-TW。
- **URL 模式**：`en-US` 为**空前缀**（`/`），其余语言带 `/<lang>/` 前缀（`localePaths` 映射）。`hreflangMap` 供 SEO alternate 用。
- **路由**：**双重页面**——`pages/*.astro`（默认 en-US）+ `pages/[lang]/*.astro`（动态段）；公共渲染抽到 `components/pages/*.astro`，按 `locale` 传参复用。
- **文案**：每语言一份 `src/i18n/lang/*.ts`（完整 `SiteContent` 对象，类型在 `i18n/schema.ts`），`getContent(locale)` 取值；Pricing 文案在 `i18n/pricing.ts`，回跳页文案在 `i18n/payment-return.ts`（仅英文）；`legal/legalContent.ts` 管 terms/privacy，`company/companyContent.ts` 管 about/contact。机制细节见 `@../010.多语言/tech-website多语言.md`。
- **语言切换**：`Layout.astro` 生成同页目标语言路径，`scripts/site/language-switcher.ts` 保留当前 query、写 `user-language` cookie（365 天）后执行**整页跳转**（非客户端路由）。无 middleware，不做语言重定向。
- 一致性约束：`sitemap/languageSitemap.mjs` 的 `LANGUAGE_SITEMAP_LOCALES` 数组必须与 `i18n/ui.ts` 的 `localePaths`/`hreflangMap` **手动保持一致**。
- **法律页文案模型**：`LegalPageContent.sections[].blocks` 是**有序块数组**（`paragraph` / `list`），按源文档顺序渲染；段落文本内只允许 `**加粗**` 与 Markdown 行内链接两种标记，由 `LegalPage.astro` 解释并转义后 `set:html` 输出。`updatedLabel/updatedAt/updatedAtIso` 可缺省——运营事实未确认时不渲染日期行，也不写结构化数据 `dateModified`。

## 4. Sitemap 生成

`src/sitemap/languageSitemap.mjs`（自定义 Astro 集成，钩 `astro:build:done`）：
1. 收集所有 canonical URL，剔除 404/500 与构建产物 robots meta 含 noindex 的页面（支付回跳页、只渲染英文回退稿的法务页）。
2. `classifySitemapUrl` 按**语言前缀分组**。
3. `lastmod` 从页面族源文件的 `git log` 取（失败回退文件 mtime）。
4. 输出：`sitemap.xml` + `sitemap_index.xml`（索引）+ 每语言一份 `<slug>-sitemap.xml`（共 14 份）+ `sitemap-0.xml`（兼容旧扁平格式）+ `sitemap.xsl`（人类可读样式表）。

页面族与源文件映射、排除规则见 `@../009.SEO与增长/tech-落地页与Sitemap.md` §2。

## 5. Cloudflare / 部署

- `cloudflare/README.md`：使用说明；新域名没有历史 URL，不配置 Bulk Redirects，也不保留任何旧路径兼容 301。已下线的 `/vimeo-downloader/`、`/changelog/`、`/pricing/`（旧积分页路径）不做重定向。
- `deploy/vimeo-web.conf` / `deploy/vimeo-web-test.conf`：nginx 配置——仅对构建产物中真实存在的目录执行「无尾斜杠 → HTTPS 尾斜杠」单跳 301，不维护第二份路由白名单，不做旧路径兼容。
- `deploy/deploy.sh`：发布静态版本后将对应环境的 vhost 安装到 `/usr/local/nginx/vhost/`，执行 `nginx -t`，失败恢复原配置，通过后 reload；静态资源使用 30 天 immutable 缓存。

## 6. SEO 基建

- **唯一布局 `src/layouts/Layout.astro`** 集中注入：
  - canonical URL
  - hreflang alternate 链：页面用 `alternateLocales` 声明内容对等且可索引的语言版本。默认 14 语言并含 `x-default` → en-US；不足 2 个时不输出。规则见 `@../009.SEO与增长/tech-落地页与Sitemap.md` §4.6
  - 语言切换器：页面用 `availableLocales` 声明本页实际存在的语言版本（默认 14 语言），切换器只列这些语言，不足 2 个时不渲染；规则同见 §4.6
  - 页脚 Resources 组：当前语言有 Guides 文章时在首位显示 Guides 入口
  - Open Graph / Twitter card（`og:site_name` 为品牌词；`twitter:site` 绑定官方 X 账号）
  - JSON-LD：
    - `SoftwareApplication`：仅首页和 Pricing 输出，Company、Legal、Guides、PaymentReturn 传 `includeSoftwareApplicationSchema={false}`；类别 `BrowserExtension`，`featureList` 为插件能力。
    - 全站 `WebSite`：站点名称。
    - `Organization`：带 `legalName`、公开 `ContactPoint`，以及指向 Chrome Web Store 与官方 X 的 `sameAs`。
    - 页面级 `structuredData` props 可叠加，首页、Pricing 各注入一份 FAQPage。
  - GA4 内联加载
  - 全站深色 token（Geist 语义名、深色值，另有品牌与装饰 token，`color-scheme: dark`）、按钮与焦点环全局样式，规则见 `../../references/specs/spec-website.md` §4
- 页面通过 props 传 `title`（必传，布局不提供默认标题）/ `description` / `structuredData`，布局内组装 meta。
- 品牌实体信号统一使用 `Vimeo Downloader`，与 extension 的 `extensionName` 和商店文案逐字一致。

## 7. SLS 日志双写（website）

> **website 写 SLS，后端 Python 不写 SLS；extension 的独立 SLS mark-log 见 `@tech-extension.md` §A7。**

机制（`src/scripts/runtime/sls-mark.ts` 与 `mark.ts`）：
- 阿里云 SLS **WebTracking** 旁路上报，**不依赖阿里云 SDK、不新增 npm 依赖**。
- mark-log 写后端 `/api/client/mark/record` 时**同时**写一份 SLS。
- SLS `first_opened_at` 与后端 `mark_logs.first_opened_at` 都来自 website 本地首次打开毫秒时间；旧客户端不传后端字段时默认 `0`。
- website `device_id` 只使用 UUID，存储 key 为 `homepage_device_id_v2`；上线后脚本会删除旧 `homepage_device_id` / `homepage_legacy_device_ids`。
- 全局 `error` / `unhandledrejection`、后端连接失败/超时 → 只写 SLS（`web_frontend_uncaught_error`、`web_backend_connect_failed`），不请求 mark 接口、不进后端 `mark_logs`。
- SLS 上报**不依赖本项目后端**（后端不可用时仍尝试写 SLS），失败**不得影响**页面解析/下载/安装 CTA/登录/订阅。
- 字段只含排障必需信息，**不发送** Cookie/Authorization/访问令牌/完整下载直链；API path 预脱敏（只留 path）。
- 文件清单与字段表见 `@tech-可观测与SLS.md`。

## 8. 运行时与下载工作区边界

- `scripts/runtime/`：api / auth / device / mark / sls-mark / ga4 / first-opened-mark / frontend-error-capture / mark-sanitizer，调用方直接引用，不设转发文件。`auth.ts` 负责登录态与令牌，调用方为 Pricing 登录 / 订阅控制器、订单结算控制器、`payment-return/payment-return.ts`、`scripts/globalClickEvents.ts` 与 `runtime/first-opened-mark.ts`；下载工作区不使用。
- `scripts/download/` + `components/download/`：首页首屏下载工作区。授权固定走匿名接口，归属为设备；不扣费、不弹登录。状态 3（需要登录）不再打开登录，提示用插件下载并展示插件引导卡，批量下载停止本轮。策略阈值来自后端 `config_public`，网站不写死次数与大小。详见 `@../002.下载功能/tech-链路与授权.md`。
- `components/pricing/` + `components/order-checkout/`：Pricing 页的登录弹窗、订阅确认（含好评赠送）与订阅结算；`components/payment-return/`：四个回跳页共用。详见 `@../011.Pricing页/tech-实现与配置.md`。

## 9. 与 backend 的契约

website 前端调用 backend business 的 `/api/client/*`（解析与匿名下载授权、订阅、订单、登录、`auth/me`）与 `/api/client/mark/record`（mark-log）。base URL 在 `src/scripts/runtime/api.ts`。后端契约同 `@tech-backend.md`。网站不再调用的接口（扣费下载授权、签到、Credits 商品配置）及其后续处理见 `@plans/004.官网改版-插件展示与免费网页下载.md` §8。
