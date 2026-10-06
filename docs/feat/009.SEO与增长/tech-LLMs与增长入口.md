# 009 · LLMs 入口与增长导航(llms.txt + 导航/Install CTA + 页脚内链)

> 技术实现文档。覆盖：website llms.txt / llms-full.txt 内容规则与测试约束、导航、Install CTA、页脚内链分组、语言切换保持当前路径。
>
> 关联：
> - 本域产品：`@feat.md`
> - 首页 / Sitemap：`@tech-落地页与Sitemap.md`
> - 签到后端(网站已不再调用)：`@tech-签到活动.md`
> - website 目录结构 / Layout.astro：`@../000.架构/tech-website.md`
> - 14 语言文案 key 组织：`@../010.多语言/tech-website多语言.md`

## 1. llms.txt / llms-full.txt(website)

### 1.1 定位

网站根路径的 AI agent 可读入口，域名取 `src/lib/site.mjs` 的 `SITE_ORIGIN`：

- `<SITE_ORIGIN>/llms.txt`
- `<SITE_ORIGIN>/llms-full.txt`

目标是让 LLM、AI 搜索和 agent 快速理解 Vimeo Downloader 的产品定位、核心页面、支持平台与限制说明。域名当前是占位值，与 `SITE_ORIGIN` 一起替换。

**llms.txt 不是 robots、sitemap 或训练授权文件**——只是一份 AI 可读目录，不能控制爬虫抓取，也不能保证搜索排名。

### 1.2 文件位置

```
website/public/llms.txt          # 短入口
website/public/llms-full.txt     # 完整入口
```

Astro 构建时复制到 `website/dist/`。两份文件手写维护，不从 sitemap 自动生成。

### 1.3 /llms.txt 短入口结构(以文件为准)

```
# Vimeo Downloader
> 一句话定位(在线工具 + Chrome 插件)
## Pages        # 首页 / Pricing / About / Contact / Terms / Privacy / 完整入口
## Sitemap
## Key Facts
```

### 1.4 /llms-full.txt 完整入口结构(以文件为准)

```
# Vimeo Downloader
> Full content index ...
## Pages
## Language Entrances   # 14 个根语言首页
## Sitemaps             # 索引、别名、扁平 sitemap、14 个语言 sitemap
## Key Facts
```

- **Language Entrances 只列 14 个根语言首页**，不展开每个语言下所有重复页面。
- `pt-BR` 内容路径是 `/pt/`，对应 sitemap 文件是 `/pt-br-sitemap.xml`。
- sitemap 内的全部 canonical URL 不展开进 llms-full（避免长而低价值的重复列表）。

### 1.5 内容原则

- 每条链接一行 Markdown，附页面用途说明；保持英文（默认语言 en-US，面向通用 AI agent）。
- 只写当前源码能确认的页面与能力；`Key Facts` 与首页文案、商店文案一致，不写额度数字、价格与「无限」承诺。
- 只允许真实存在的站内 URL：首页、Pricing、About、Contact、Terms、Privacy、sitemap 与两份 llms 入口。

### 1.6 robots.txt 显式 Allow

`website/public/robots.txt` 在 `User-agent: *` 下显式 Allow 两个 llms 入口，作为 AI-readable 入口提示。不新增易过期的 AI crawler 专用 User-Agent 规则。

### 1.7 内容禁项(强约束)

LLMs 文件**不包含**：

- `mailto:` 或明文邮箱（面向 crawler，直接写会放大垃圾邮件风险；只提供站内页面入口）。
- 站外绝对 URL（只引用 `SITE_ORIGIN` 下的站内 URL）。
- 不存在的站内路径，包括已删除的 `vimeo-downloader`、`changelog`、`pricing`（旧积分页路径）与已删除平台的落地页路由；订阅购买页 `ext-pricing` 存在。
- 支付回跳页等非 canonical 页面。

### 1.8 测试约束(`website/tests/module-scripts.test.js`)

构建产物校验：

1. `dist/llms.txt`、`dist/llms-full.txt` 存在，且首行标题为 `# Vimeo Downloader`。
2. 两份文件互相链接，且都链接到 `sitemap.xml`。
3. 两份文件引用的站内 URL 都落在 `SITE_HOST`，协议为 HTTPS，且在构建产物里真实存在。
4. 短入口必需 URL：首页、Pricing、About、Contact、`llms-full.txt`、`sitemap.xml`。
5. 完整入口必需 URL：上述之外再加 `llms.txt`、`sitemap_index.xml`、`sitemap-0.xml`，以及 14 个语言首页与 14 个语言 sitemap。
6. 不含 `mailto:` 与明文邮箱；`robots.txt` 含两条 Allow。
7. 索引不含已删除路由（平台落地页、`vimeo-downloader`、`changelog`）。

## 2. 导航与 Install CTA(以代码为准)

导航由 `website/src/layouts/Layout.astro` 渲染，桌面与移动导航同构：Home + Pricing 两个链接，加带插件图标的 Install 按钮与语言切换器。

### 2.1 桌面导航

1. **品牌**：Logo + 品牌名，指向当前语言首页。
2. **Home 链接**：指向当前语言首页，当前页高亮。
3. **Pricing 链接**：指向当前语言 `/ext-pricing/`，当前页高亮；带内部跳转埋点（来源为 `nav`，目标为 `pricing`）。
4. **Install CTA**：
   - 主按钮（`btn-primary nav-install-link`），链接为 `CHROME_WEB_STORE_URL`，新标签页打开且带 `noopener`。
   - 左侧图标是 `public/googe-ext-logo-192px.svg` 图片，`alt` 为空，装饰用。
   - 可访问名称与按钮文字均取 `t.common.installCta`。
   - 沿用外链点击埋点（来源为 `nav`）。
5. **语言切换器**：`includeLanguageSwitcher` 为真时渲染。

### 2.2 移动导航

移动菜单含 Home、Pricing、Install（埋点来源均为 `mobile_nav`）；Install 是带图标的满宽主按钮（`btn-primary mobile-nav-install`）。

### 2.3 i18n

`i18n/schema.ts` 的 `layout.nav` 字段为 `brand` / `home` / `pricing`；`layout.footer` 字段为 `resources` / `rights`；`common.installCta` 为安装文案。导航不再有 Solution、Changelog 字段。

## 3. 页脚内链

页脚（非 standalone 页面渲染）是 `nav.footer-link-groups`，含两个分组，`nav` 的可访问名称由公司分组标签与 `t.layout.footer.resources` 拼成：

| 分组 | 标题 | 链接 |
| --- | --- | --- |
| Company | `companyContent.footerGroupLabel` | About、Contact |
| Resources | `t.layout.footer.resources` | Terms、Privacy |

站内链接统一带内部跳转埋点（来源 `footer`，目标为对应页），并使用当前语言前缀。底部是 `t.layout.footer.rights` 版权文字。

## 4. 语言切换保持当前路径

语言切换的目标路径由「当前路径去掉语言前缀」再拼目标语言前缀计算，而不是固定指向语言首页；hreflang alternate 用同一份计算，保证 canonical / alternate 与切换目标一致。

验收：

- 在 `/ext-pricing/` 切日语 → `/ja/ext-pricing/`。
- 在 `/ja/ext-pricing/` 切英文 → `/ext-pricing/`。
- 首页切语言仍落在目标语言的首页。

切换器还会继承当前 URL 的完整 query（见 `@../010.多语言/tech-website多语言.md`）。

## 5. 验收/验证命令

```bash
cd website
pnpm build
pnpm test:module-scripts
```

## 6. 回滚

### LLMs

1. 删除 `website/public/llms.txt`、`website/public/llms-full.txt`。
2. 删除 `website/tests/module-scripts.test.js` 中的 LLMs 断言与 robots 的两条 Allow。
3. 重新 `pnpm build`。

### 导航/Install 图标

1. 恢复 `Layout.astro` 的导航链接状态(如需)。
2. 重新执行验证命令。
