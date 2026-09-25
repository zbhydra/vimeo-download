# 000 · 架构 · Astro 网站（website）

> website 的现状事实：目录、多语言、Sitemap、Cloudflare、SEO、SLS 双写。可复用的运行时代码抽在 `website-shared/`。规则条文见根 `@../../../AGENTS.md`。

## 1. 技术栈

- **Astro 5**（`website/astro.config.mjs`，站点源集中在 `src/lib/site.mjs` 的 `SITE_ORIGIN`，`base='/'`）。生产域当前仍是占位值 `https://vimeo-video-downloader.example`，上线前必须替换。
- 集成：`@astrojs/vue`（Vue 3.5 岛屿）+ 自定义 `languageSitemap()` 集成（`src/sitemap/`）。
- 下载引擎：`mediabunny`（dev 软链本地 node_modules）。
- 共享源码包：`@website-shared` alias → 仓库根 `../website-shared/src`（见 §8）。
- 构建：`pnpm build` = `astro check && astro build`，无 Service Worker 前置步骤；e2e：Playwright（对接 backend 真实 API）。
- 部署：nginx（`website/deploy/vimeo-web.conf` 生产、`vimeo-web-test.conf` 测试）。

## 2. 目录结构（website）

```
website/
├── astro.config.mjs          # 集成 vue() + languageSitemap()；alias @website-shared
├── package.json
├── cloudflare/
│   ├── cache-rules.md        # CDN 缓存规则说明
│   └── README.md
├── deploy/
│   ├── vimeo-web.conf        # nginx 配置（真实目录无尾斜杠→HTTPS 尾斜杠 301；静态 30d immutable）
│   ├── vimeo-web-test.conf   # 测试环境
│   └── deploy.sh
└── src/
    ├── components/           # download/ homepage/ pages/ site/ UI 组件
    ├── i18n/
    │   ├── index.ts
    │   ├── ui.ts             # 14 locale + localeNames + localePaths + hreflangMap
    │   ├── content.ts        # getContent(locale)
    │   ├── schema.ts
    │   └── lang/             # 每语言一份 *.ts（完整 SiteContent 文案对象）
    ├── layouts/
    │   └── Layout.astro      # 唯一布局：canonical / hreflang / OG / Twitter / JSON-LD / GA4 / SLS 注入
    ├── legal/
    │   └── legalContent.ts   # terms/privacy 文案中心 + LegalPageContent/LegalBlock 合同
    ├── company/
    │   └── companyContent.ts # about/contact 的 14 语言文案、页面日期与 footer 标签
    ├── lib/
    │   └── site.mjs          # 站点身份唯一配置点：域名 / 产品名 / 公开邮箱 / 官方 X / Chrome 商店地址
    ├── middleware.ts         # 当前空壳（pass-through，无语言重定向）
    ├── pages/
    │   ├── index.astro       # 默认 en-US（无 URL 前缀）
    │   ├── vimeo-downloader.astro  # 唯一平台落地页（无前缀 en-US）
    │   ├── *.astro           # 无前缀业务页（changelog/about/contact/privacy/terms/pricing/ext-pricing）
    │   ├── clink/            # Clink 支付成功/取消结果页
    │   ├── paypal/           # PayPal 支付成功/取消结果页
    │   └── [lang]/           # 动态语言段镜像（同上 + vimeo-downloader）
    ├── scripts/
    │   ├── globalClickEvents.ts
    │   ├── homepage/         # api / auth / device / mark / sls-mark
    │   └── site/             # toast / confirm / language-switcher
    └── sitemap/
        └── languageSitemap.mjs   # 自定义 Astro 集成：按语言分片生成 sitemap
```

## 3. 多语言机制

- **14 个 locale**（`src/i18n/ui.ts`）：de-DE / en-US / es-ES / fr-FR / id-ID / it-IT / ja-JP / ko-KR / pt-BR / ru-RU / th-TH / vi-VN / zh-CN / zh-TW。
- **URL 模式**：`en-US` 为**空前缀**（`/`），其余语言带 `/<lang>/` 前缀（`localePaths` 映射）。`hreflangMap` 供 SEO alternate 用。
- **路由**：**双重页面**——`pages/index.astro`（默认 en-US）+ `pages/[lang]/index.astro`（动态段）；公共渲染抽到 `components/pages/*.astro`，按 `locale` 传参复用。
- **文案**：每语言一份 `src/i18n/lang/*.ts`（完整 `SiteContent` 对象），`getContent(locale)` 取值；`legal/legalContent.ts` 单独管 terms/privacy，`company/companyContent.ts` 单独管 about/contact。
- **法律页文案模型**：`LegalPageContent.sections[].blocks` 是**有序块数组**（`paragraph` / `list`），按源文档顺序渲染，不假设列表一定在段落之后；段落文本内只允许 `**加粗**` 与 Markdown 行内链接两种标记，由 `LegalPage.astro` 解释并转义后 `set:html` 输出。`updatedLabel/updatedAt/updatedAtIso` 可缺省——运营事实未确认时不渲染日期行，也不写结构化数据 `dateModified`。
- **语言切换**：`Layout.astro` 生成同页目标语言路径，`scripts/site/language-switcher.ts` 保留当前 query、写 `user-language` cookie（365 天）后执行**整页跳转**（非客户端路由）。
- **middleware.ts**：当前是**空壳 pass-through**（注释明确「当前无语言重定向逻辑」）。
- 一致性约束：`sitemap/languageSitemap.mjs` 的 `LANGUAGE_SITEMAP_LOCALES` 数组必须与 `i18n/ui.ts` 的 `localePaths`/`hreflangMap` **手动保持一致**。

## 4. Sitemap 生成

`src/sitemap/languageSitemap.mjs`（自定义 Astro 集成，钩 `astro:build:done`）：
1. 收集所有 canonical URL。
2. `classifySitemapUrl` 按**语言前缀分组**。
3. `lastmod` 从 `git log` 取（失败回退文件 mtime）。
4. 输出：`sitemap.xml` + `sitemap_index.xml`（索引）+ 每语言一份 `<slug>-sitemap.xml`（共 14 份）+ `sitemap-0.xml`（兼容旧扁平格式）+ `sitemap.xsl`（人类可读样式表）。

详见 `feat.026.website多语言Sitemap治理`。

## 5. Cloudflare / 部署

- `cloudflare/README.md`：使用说明；新域名没有历史 URL，不配置 Bulk Redirects，也不保留任何旧路径兼容 301。
- `deploy/vimeo-web.conf` / `deploy/vimeo-web-test.conf`：nginx 配置——仅对构建产物中真实存在的目录执行「无尾斜杠 → HTTPS 尾斜杠」单跳 301，不维护第二份路由白名单，不做旧路径兼容。
- `deploy/deploy.sh`：发布静态版本后将对应环境的 vhost 安装到 `/usr/local/nginx/vhost/`，执行 `nginx -t`，失败恢复原配置，通过后 reload；静态资源使用 30 天 immutable 缓存。

## 6. SEO 基建

- **唯一布局 `src/layouts/Layout.astro`** 集中注入：
  - canonical URL
  - hreflang alternate 链（含 `x-default` → en-US）
  - Open Graph / Twitter card（`twitter:site` 绑定官方 X 账号）
  - JSON-LD 结构化数据（`SoftwareApplication` + 带公开 `ContactPoint`、Chrome Web Store 与官方 X `sameAs` 的 `Organization`，可叠加页面级 `structuredData` props）
  - GA4（`G-LBSKJD0H16`）内联加载
- 页面通过 props 传 `title / description / ogImage / structuredData`，布局内组装 meta。
- 品牌实体信号统一使用 `Vimeo Video Downloader`，与 extension 的 `extensionName` 和商店文案逐字一致。

## 7. SLS 日志双写（website）

> **website 写 SLS，后端 Python 不写 SLS；extension 的独立 SLS mark-log 见 `@tech-extension.md` §A7。**

机制（`src/scripts/homepage/sls-mark.ts` + 各处 import）：
- 阿里云 SLS **WebTracking** 旁路上报，**不依赖阿里云 SDK、不新增 npm 依赖**。
- mark-log 写后端 `/api/client/mark/record` 时**同时**写一份 SLS。
- SLS `first_opened_at` 与后端 `mark_logs.first_opened_at` 都来自 website 本地首次打开毫秒时间；旧客户端不传后端字段时默认 `0`。
- website `device_id` 只使用 UUID，存储 key 为 `homepage_device_id_v2`；上线后脚本会删除旧 `homepage_device_id` / `homepage_legacy_device_ids`。
- 全局 `error` / `unhandledrejection`、后端连接失败/超时 → 只写 SLS（`web_frontend_uncaught_error`、`web_backend_connect_failed`），不请求 mark 接口、不进后端 `mark_logs`。
- SLS 上报**不依赖本项目后端**（后端不可用时仍尝试写 SLS），失败**不得影响**页面解析/下载/安装 CTA/登录/订阅。
- 字段只含排障必需信息，**不发送** Cookie/Authorization/访问令牌/完整下载直链；API path 预脱敏（只留 path）。

## 8. website-shared 共享源码包

`website-shared/src/`（纯源码包，无 package.json，靠 alias 引入）：
```
website-shared/src/
├── components/
│   ├── credit-purchase/      # 积分购买组件
│   ├── order-checkout/       # 订单结算组件
│   └── pricing/              # 官网 Pricing 页面组件与订阅下单控制器
├── download/
│   ├── components/           # 下载工作区 UI 组件
│   ├── scripts/              # 平台识别 / download-methods / 各 mode runner
│   └── schema.ts
└── homepage-runtime/
    ├── api.ts                # 后端连接失败 → SLS
    └── mark.ts               # recordHomepageMark（SLS 双写）
```
`website` 由此引入 Pricing、积分购买、下载脚本、首页运行时；**当前只有 website 消费该包**，**不与 extension/admin 共享**（extension 的 `core/` 是其内部共享层，admin 完全独立）。

## 9. 与 backend 的契约

website 前端调用 backend business 的 `/api/client/*`（下载/解析/积分/计数/订单/登录/签到）与 `/api/client/mark/record`（mark-log）。base URL 在 `src/scripts/homepage/api.ts`。后端契约同 `@tech-backend.md`。
