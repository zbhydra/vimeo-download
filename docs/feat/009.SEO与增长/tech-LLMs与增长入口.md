# 009 · LLMs 入口与增长导航(llms.txt + 导航/Install CTA + Footer 内链)

> 技术实现文档。覆盖：website llms.txt / llms-full.txt 内容规则与测试约束、导航精简、Install CTA、Footer 内链分组、语言切换保持当前路径。
>
> 来源：原 `feat.028 websiteLLMs入口` + `feat.029 website导航与插件CTA识别`(导航/CTA 部分)。原 `feat.030 ...workaround落地页` 的 Solution 下拉分组已随产品单平台转型删除，本文档只记录删除后的最终状态。
>
> 关联：
> - 本域产品：`@feat.md`
> - 平台落地页 / Sitemap：`@tech-落地页与Sitemap.md`
> - 签到后端：`@tech-签到活动.md`
> - website 目录结构 / Layout.astro / 导航：`@../000.架构/tech-website.md`
> - 14 语言文案 key 组织：`@../010.多语言/tech-website多语言.md`

## 1. llms.txt / llms-full.txt(website)

### 1.1 定位

网站根路径的 AI agent 可读入口，域名取 `src/lib/site.mjs` 的 `SITE_ORIGIN`：

- `https://<SITE_ORIGIN>/llms.txt`
- `https://<SITE_ORIGIN>/llms-full.txt`

目标是让 LLM、AI 搜索和 agent 在访问网站时能快速理解 Vimeo Video Downloader 的产品定位、核心页面、支持平台、限制说明和联系方式。

> 域名当前是占位值，与 `SITE_ORIGIN` 一起替换。

**llms.txt 不是 robots、sitemap 或训练授权文件**——只是一份 AI 可读目录，不能控制爬虫抓取，也不能保证搜索排名。

### 1.2 文件位置

```
website/public/llms.txt          # 短入口
website/public/llms-full.txt     # 完整入口
```

Astro 构建时复制到 `website/dist/llms.txt` 和 `website/dist/llms-full.txt`。

### 1.3 /llms.txt 短入口结构(以代码为准)

```
# Vimeo Video Downloader

> 一句话产品定位

## Core Product
## Download Tools
## Updates
## Key Facts
## Contact
```

内容原则：

- 每条链接一行 Markdown，每条链接包含页面用途说明。
- **保持英文**(默认语言是 en-US，LLMs 入口面向通用 AI agent)。
- 不写无法从当前代码确认的承诺。
- 只允许真实存在的站内 URL；内容页链接限当前网站 canonical 页面。

`## Download Tools` 在当前单平台产品下只有一个条目：`/vimeo-downloader/`。`## Core Product` 覆盖首页 `/`、`/vimeo-downloader/`、`/pricing/`、`/about/`、`/contact/` 与 `/llms-full.txt`。

### 1.4 /llms-full.txt 完整入口结构(以代码为准)

```
# Vimeo Video Downloader

> Full content index ...

## Core Product
## Platform Downloader
## Language Entrances
## Updates
## Technical Indexes
## Key Facts
## Contact
```

内容原则：

- 收录全部当前页面族。
- **Language Entrances 只列 14 个根语言首页**，不展开每个语言下所有重复页面。
- `pt-BR` 内容沿用当前站点路径 `/pt/`，对应 sitemap 文件沿用 hreflang slug `/pt-br-sitemap.xml`。
- **Technical Indexes** 列 sitemap 入口(`sitemap.xml` / `sitemap_index.xml` / `sitemap-0.xml` / 14 个 `{slug}-sitemap.xml`)，帮助 agent 进一步发现 canonical URL；不把 sitemap 内的全部 canonical URL 自动展开进 llms-full.txt(避免长而低价值的重复列表)。

### 1.5 robots.txt 显式 Allow

`website/public/robots.txt` 在 `User-agent: *` 下显式：

```txt
Allow: /llms.txt
Allow: /llms-full.txt
```

作为 AI-readable 入口提示。不新增易过期的 AI crawler 专用 User-Agent 规则；只在 `User-agent: *` 下显式允许 LLMs 入口。

### 1.6 内容禁项(强约束)

LLMs 文件**不包含**：

- `mailto:` 联系方式或明文邮箱(面向 crawler，直接写 mailto 会放大垃圾邮件风险；只提供站内页面入口)。
- 站外绝对 URL(只引用 `SITE_ORIGIN` 下的站内 URL)。
- 不存在的站内路径。
- 已删除的平台落地页路由(`tiktok-downloader` / `x-downloader` / `instagram-downloader` / `threads-downloader`)。
- pricing 之外的购买动作页与非 canonical 回跳页。

### 1.7 测试约束(module-scripts.test.js)

`website/tests/module-scripts.test.js` 显式校验：

1. `dist/llms.txt`、`dist/llms-full.txt` 存在，且首行标题为 `# Vimeo Video Downloader`。
2. `llms.txt` 链接到 `{siteUrl}/llms-full.txt`，反之亦然。
3. 两个文件都链接到 `{siteUrl}/sitemap.xml`。
4. 两个文件引用的站内 URL 都落在 `SITE_HOST`，且协议为 HTTPS。
5. 短入口必需 URL 齐全：`/`、`/pricing/`、`/vimeo-downloader/`、`/about/`、`/contact/`、`/llms-full.txt`、`/changelog/`、`/sitemap.xml`。
6. 完整入口必需 URL 齐全：上述之外再加 `/llms.txt`、`/sitemap_index.xml`、`/sitemap-0.xml`，以及 14 个语言首页与 14 个 `{slug}-sitemap.xml`。
7. 显式校验不包含 `mailto:`、明文邮箱、站外绝对 URL（域必须等于 `SITE_HOST`）。
8. 显式校验 `robots.txt` 包含 `Allow: /llms.txt` 和 `Allow: /llms-full.txt`。
9. 显式校验索引不含已删除的平台落地页路由。

### 1.8 方案取舍(为什么手写两份静态文件)

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 只新增 /llms.txt | 不选 | 后续完整目录会撑长；平台页/语言页/政策页会混在一起 |
| /llms.txt + /llms-full.txt(两份) | 选用 | 短入口可读，完整入口可扩展；符合外部有效样例；不需新增依赖 |
| 构建时从 sitemap 自动生成 | 不选(本阶段) | 会把多语言重复页面机械展开，说明文字质量差；还要新增生成逻辑和测试成本 |

## 2. 首页导航与 Install CTA(最终状态，以代码为准)

> **重要**：`feat.030` 加回的 Solution 下拉分组已随单平台转型删除。**当前代码最终状态：桌面与移动导航都只有 Home + Pricing 两个链接，加带插件图标的 Install 按钮与语言切换器；Footer 只有 Company 与 Resources 两个链接分组。**

### 2.1 桌面导航(Layout.astro `.nav-links`)

`website/src/layouts/Layout.astro` 桌面导航当前包含：

1. **Home 链接**(`t.layout.nav.home`)，指向 `currentLocalePath`。
2. **Pricing 链接**(`t.layout.nav.pricing`)，指向 `pricingPath`，带 `internal_workflow_click` 埋点(`data-ga-source="nav"` / `data-ga-target="pricing"`)。
3. **Install CTA**：
   - 主按钮，Chrome Web Store 链接(`CHROME_WEB_STORE_URL`)，`target="_blank"` + `rel="noopener"`。
   - 左侧图标是 `/googe-ext-logo-192px.svg` 图片(尺寸压缩到导航高度)，`alt=""`，`aria-hidden` 语义由空 alt 承担。
   - 按钮可访问名称由 `aria-label={t.common.installCta}` 提供，按钮内文字同用 `t.common.installCta`。
   - 沿用现有 `outbound_chrome_store_click` 埋点(`data-ga-source="nav"`)。
4. **语言切换器**(`includeLanguageSwitcher` 为真时渲染)。

### 2.2 i18n schema

`website/src/i18n/schema.ts` 的 `layout.nav` 字段为 `brand` / `home` / `pricing` / `solutions` / `changelog`。

- `home`、`pricing`、`changelog`、`brand` 均由导航与 Footer 直接消费。
- `solutions` 在当前代码中**只被 Footer `<nav>` 的 `aria-label` 复用**（与 `companyContent.footerGroupLabel`、`t.layout.footer.resources` 拼成一个可访问名称），页面上不再有可见的 Solution 分组或下拉菜单。该字段保留是为了不破坏 schema；如果后续要彻底移除，需同步改 Layout 的 `aria-label`。

### 2.3 移动导航

移动菜单(`.mobile-nav`)与桌面导航同构：只有 Home + Pricing 两个链接，Pricing 用 `data-ga-source="mobile_nav"` 区分埋点来源。

### 2.4 Install 图标与样式残留说明

`Layout.astro` 的 `<style>` 与 `<script>` 中仍保留 `.nav-menu-trigger`、`.nav-menu` 等样式规则与 `[data-nav-menu]` 的 click/Escape 关闭逻辑；由于 HTML 中已无对应元素，这些规则与监听器不会命中任何节点。属无害残留，不影响渲染与导航行为；清理时一并删除样式与 `solutionMenu` / `solutionTrigger` 相关脚本。

## 3. Footer 内链

Footer(`!standalone` 时渲染)当前是 `nav.footer-link-groups`，只含两个 `div.footer-link-group`：

| 分组 | 标题 | 链接 |
| --- | --- | --- |
| Company | `companyContent.footerGroupLabel` | About(`aboutPath`)、Contact(`contactPath`)、官方 X 账号(`OFFICIAL_X_URL`，带 `official_x_click` 埋点) |
| Resources | `t.layout.footer.resources` | Terms(`termsPath`)、Privacy(`privacyPath`)、Changelog(`${currentLocalePath}changelog/`) |

内链统一带 `data-ga-event="internal_workflow_click"` + `data-ga-source="footer"` + `data-ga-target=<目标>`。所有链接同当前语言前缀。

## 4. 语言切换保持当前路径

语言切换的目标路径由 `pagePathWithoutLocale` 计算，而不是固定指向语言首页：

- `pagePathWithoutLocale = currentPath` 去掉当前语言前缀。
- 每个语言的 `data-path = langPrefix + normalizedPagePathWithoutLocale`。
- `alternateLinks`(hreflang)用同一份计算生成，保证 canonical / alternate 与切换目标一致。
- 首页(无语言前缀的 `/` 或 `/<lang>/`)切到目标语言时输出的仍是该语言的首页。

验收：

- 在 `/vimeo-downloader/` 切日语 → `/ja/vimeo-downloader/`。
- 在 `/ja/vimeo-downloader/` 切英文 → `/vimeo-downloader/`。

## 5. 验收/验证命令

```bash
cd website
pnpm build
pnpm test:module-scripts
# 导航 e2e:
pnpm exec playwright test e2e/website.spec.ts --project=chromium \
  --grep "primary nav|install CTA"
# 移动导航:
pnpm exec playwright test e2e/website.spec.ts --project="Mobile Chrome" --grep "mobile nav"
```

## 6. 回滚

### LLMs

1. 删除 `website/public/llms.txt`、`website/public/llms-full.txt`。
2. 删除 `website/tests/module-scripts.test.js` 中新增的 LLMs 断言。
3. 重新 `pnpm build`。

### 导航/Install 图标

1. 恢复 `Layout.astro` 的导航链接状态(如需)。
2. 恢复 e2e 导航数量断言。
3. 重新执行验证命令。
