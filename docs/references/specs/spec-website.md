# Website 工程规范（Astro）

> `website/` 前端代码**强制规范**。写/改 website 前必读。
> 技术栈：Astro 5.5（SSG 静态站）+ 原生 TS + 命令式 DOM（**非 SPA**）。无 Vue / React 集成。
> 关联：[[spec-extension]]、插件端设计系统 `design.md`（website 的视觉以 §4 为准）、注释与错误定位见 [[spec-code]]。

## 1. 技术栈与构建

- Astro 静态站点（SSG）+ 群岛架构。交互逻辑是 `.astro` 组件 `<script>` 块里的**命令式 DOM 操作**，不是 React/Vue 函数组件。
- 校验与构建：`pnpm build` = `astro check && astro build`（无 Service Worker 前置步骤；`astro check` 走 `@astrojs/check` + tsc，替代 `tsc --noEmit`）。
- 无 ESLint/Prettier；类型安全靠 `tsconfig strict: true`。
- 测试：`node --test tests/module-scripts.test.js`（模块脚本）+ Playwright e2e。

## 2. 代码风格

- `tsconfig strict: true`。
- 禁 `any`；`as unknown` 仅限 `JSON.parse` 后配合类型守卫收窄。
- 不引入 ESLint/Prettier（项目当前靠 strict TS + astro check）；如要加须 hydra 同意。

## 3. 目录结构

- `pages/`：Astro 文件路由（SSG）。
- `components/`：`pages/`（页面装配）/ `homepage/`（营销区块）/ `download/`（下载工作区组件）/ `pricing/`（Pricing 组件与控制器同目录）/ `order-checkout/`（结算弹窗）/ `payment-return/`（支付回跳页）/ `site/`（站级）。
- `scripts/`：`download/`（下载状态机与下载方法）/ `runtime/`（api/auth/mark/device/sls/ga4/frontend-error-capture）/ `site/`（confirm/language-switcher）。
- `layouts/Layout.astro`：唯一 HTML 外壳，全局 CSS 变量 + nav/footer + 全局错误捕获启动。
- `i18n/`：纯 TS 字典。
- 下载工作区：组件在 `components/download/`，状态机与下载方法在 `scripts/download/`，页面直接使用 `DownloadWorkspace.astro`。

## 4. 组件与样式

- 纯 `.astro` 组件 + 命令式 DOM；无第三方 UI 库。
- **视觉**：全站只有深色一套，不做明暗切换、不引入字体依赖。`design.md` / `design.dark.md` 供插件使用，website 的视觉以本节为准。
- **token**：`Layout.astro` 的 `<style is:inline is:global>` 是唯一出处，组件消费 `var(--xxx)`；跨组件使用的颜色只能从这里取，新增前先在此补齐。
  - **中性色沿用 Geist 的 token 名，值翻转为偏蓝的深色**（与 `design.dark.md` 同一种做法）：
    - 底：`--background-100`（页面）/ `--background-200`（交替区块）/ `--gray-100`（组件底）/ `--gray-200`（悬停、卡内填充），三档深浅区分层级；
    - 文字：`--gray-1000` 主、`--gray-900` 次、`--gray-700` 占位；
    - 描边：`--gray-alpha-100/400/500/600`；
    - 链接与品牌文字：`--blue-700` / `--blue-800`；
    - 状态色（含 `--violet-*`，首页两个组件的紫色色组共用，目前只有 `--violet-200` 与 `--violet-900`）：`-100/-200` 是同色相 alpha 0.10 / 0.16 的底，`-400/-500` 是 alpha 0.28 / 0.45 的描边，`-900` 是浅色文字。
  - **品牌与装饰 token**：
    - `--brand-500/600`、`--gradient-button`（主按钮）、`--gradient-brand`（带字渐变）、`--gradient-brand-text`（H1 品牌词）、`--gradient-border`（1 px 渐变描边）；
    - `--neon-cyan`、`--glass-bg` / `--glass-border`（玻璃面）、`--shadow-glow`、`--shadow-badge-color`（渐变徽标光晕的颜色，几何由各徽标自己写）；
    - `--on-brand`（品牌渐变 / 主按钮底上的文字色，纯白）、`--overlay-bg`（弹窗遮罩，所有弹窗共用；模糊 `blur(6px)` 不是颜色，留在各弹窗里）、`--payment-plate`（支付图标的浅灰底板，Pricing 信任行与结算弹窗共用）；
    - `--radius-sm/md/lg/xl/2xl`（6 / 12 / 16 / 20 / 24 px）；
    - `--shadow-card/popover/modal`、`--header-height`（吸顶 header 高度，≤ 600 px 为 60 px，其余 68 px）、`--font-sans`（系统字体栈）、`--transition-fast/normal`（160 / 220ms）、`--focus-ring`。
  - `:root` 设 `color-scheme: dark`；`body` 基准字号 16 px。
  - **纯白有两个出处**：① `--on-brand`：主按钮文字、`--gradient-brand` 底上的徽标文字（如 Most Popular、步骤编号）；② Layout 中 Chrome 图标小白底板（`.btn-chrome-plate`、`.nav-install-icon`）的 `#fff` 字面值。其余一律用 token，不另写白色。**同一个颜色值在 2 个及以上组件里用于同一用途，必须先成为 Layout token**；只在单个组件里用的装饰色留在该组件 scoped 的 CSS 变量里；页脚底色 `#05080F` 只写在 Layout。
- **唯一实现**：
  - 深色舞台（底色渐变、极光、网格、星点、光束、格式标签）只在 `components/site/SiteStage.astro`，有 `hero` / `band` / `card` 三种变体，页面组件不得另写；格式标签贴视口边缘定位，视口 < 1200 px 时隐藏，因为内容区两侧无空间；
  - 插件界面示意（页内面板、popup）只在一个共用组件里，其调暗的浅色（网页底、popup 底、Vimeo 青）不进全局；
  - 法务页与公司页的页头带（`SiteStage band` + H1 + 引言 + 更新日期胶囊）只在 `components/site/SiteBandHeader.astro`，两页消费它，不得各写一份。
- **按钮**：全站共享样式在 Layout 全局块，页面不得各写一份。
  - `.btn-primary`：`--gradient-button` 底、白字、`--shadow-glow`；
  - `.btn-secondary`：玻璃样式（`--glass-bg` 底、`rgba(255,255,255,.16)` 描边、`--gray-1000` 字）；
  - 共享按钮只有 `.btn-primary` / `.btn-secondary` 两种，次按钮只有玻璃样式一种；语言、菜单、关闭等图标按钮不在此列；`.text-link` 用 `--blue-700`；
  - `.btn-chrome-plate` 是共享的 Chrome 图标小白底板（Layout 全局类，按钮里的 Chrome 图标都用它）；header 安装按钮里的圆形 `.nav-install-icon` 是裁决保留的例外，两者的白底都是纯白白名单项。
- **焦点环**：`:focus-visible` 用 `--focus-ring`（`0 0 0 2px #070B18, 0 0 0 4px #8AB4FF`）。规则特异性 0,4,0（`:root` 0,1,0 + `:is()` 取最具体参数 `[tabindex]:not([tabindex="-1"])` 的 0,2,0 + `:focus-visible` 0,1,0）；`tabindex="-1"` 的元素（脚本聚焦的标题等）不显示焦点环。组件写在可交互元素上的 `box-shadow`，特异性高于 0,4,0（不论先后），或等于 0,4,0 且在文档中出现更晚，就会盖住焦点环，这类选择器必须排除 `:focus-visible`（`:not(:focus-visible)`）。算特异性要计入 scoped 编译附加的属性选择器：它给选择器里每个复合选择器各加 0,1,0（如 `.company-section[data-astro-cid-…] h2[data-astro-cid-…]`）。scoped 的 `.a` 是 0,2,0，`.a.b`、`.a:hover` 是 0,3,0，不会盖住；`.a.b:hover`、`.a .b` 是 0,4,0，`.a .b.c` 是 0,5,0，可能盖住。组件不对 `box-shadow` 使用 `!important`。不要在组件里自行补焦点规则。
- **动效**：只允许舞台（SiteStage）与插件示意（ExtensionMockup）里的循环装饰动效（光束、扫描线、透视地面），且只动画 `transform` 与 `opacity`；`prefers-reduced-motion: reduce` 时全部停止。不做入场动效、滚动触发动效，不用 JS 驱动动画。功能性加载指示（骨架屏、spinner）不属于装饰动效，可以保留，同样只动画 `transform` / `opacity`，`prefers-reduced-motion: reduce` 时停止，静态外观仍需能表达「加载中」。
- **断点与触控**：断点统一两档，`@media (max-width: 960px)`（导航收进菜单、区块单列）与 `@media (max-width: 600px)`（手机布局）。弹窗只用 600 一档：弹窗内部的单栏化、整宽按钮、底部抽屉、整屏宽度和 44 px 规则都归 600；960 只用于页面区块的布局收拢；不另设弹窗专用断点。格式标签在 1200 px 处的显隐是唯一例外，它只控制装饰显隐，不是版式断点。
  - 手机布局：侧边距 16 px、区块上下内边距 64 px；可点区域不小于 44×44（正文句子里的行内文字链接例外，其尺寸受所在行行高约束，依据 WCAG 的 inline 例外，见 [WCAG 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 与 [2.5.5 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)；独立成行或成按钮的链接仍须达标）；输入框字号不小于 16 px；页面不出现横向滚动；
  - 舞台装饰减量为 2 条光束，不放格式标签；
  - 不用 CSS `order` 调整视觉顺序，保证 Tab 顺序与视觉一致。
- 样式原生 CSS + Astro `<style>` scoped（默认）；`is:global` 仅用于 Layout 全局 token、跨组件需命中动态插入 DOM 的场景（DownloadWorkspace、PricingAuthModal 等）。
- 禁 Tailwind / CSS-in-JS / CSS Modules（项目未用）。

## 5. 脚本归属

- 本仓库只有 `website/` 一个站点，源码全部在 `website/src`，不存在跨包共享层。
- 运行时基础能力（api / auth / device / mark / sls / ga4）统一在 `scripts/runtime/`，调用方直接引用，**禁止新增转发或镜像文件**。
- 单文件编译的测试（`tests/module-scripts.test.js`）不认 alias，被测源码之间用相对路径互相引用。

## 6. 状态管理

- 无 Pinia/Redux/Zustand。状态 = TS interface（如 `WorkspaceState`）+ 模块级闭包 + DOM `data-*` 属性。
- 跨组件通信用自定义 `CustomEvent`（`window.dispatchEvent`），不是 EventBus 库。
- 模块拆分约定：`*-state.ts` 持状态，`*-controller.ts` / `*-render.ts` / `*-elements.ts` 拆职责。

## 7. API 调用

- 原生 `fetch` 薄封装：`getJson` / `postJson` / `postJsonKeepalive` / `requestDownload`（`scripts/runtime/api.ts`）。
- 后端响应信封 `{code, data, msg}`，**`code === 10000` 才算成功**，否则抛 `HomepageApiError`。
- 非信封响应（无 `code` 字段）兜底直返 body，**仅限 mediabunny 等外部依赖**；新增自有接口必须返回信封。
- 请求头：`Accept-Language`（读 `<html lang>`）+ `X-Device-Id` + `X-Client-Product: web`，登录后加 `Authorization`。
- base url 走 `import.meta.env.PUBLIC_API_BASE_URL`。

## 8. 路由

- Astro 文件路由，全 SSG。
- 语言路由：en-US 走根路径，其余 locale 走 `[lang]/`，由 `getStaticPaths` 枚举 `localePaths`（**非运行时检测**）。
- 页面集合：首页（首屏下载器 + 插件展示）、`pricing`、`about`、`contact`、`terms`、`privacy`，各有根英文页 + `[lang]/` 镜像；支付回跳页 `paypal/`、`clink/` 仅英文、无镜像。没有平台落地页、更新日志页与第二个购买页，新增页面族须同步 `sitemap/languageSitemap.mjs` 的页面族源文件映射（未登记路径构建失败）。

## 9. i18n

- 纯 TS 字典 + `schema.ts` interface 强约束键（每字段 JSDoc）；非 i18next。
- locale 文件在 `i18n/lang/`，`getContent(locale)` 失败回退 en-US。
- 占位符（如 `{seconds}`）就地 `replace`。
- `<html lang>` 由 Layout 输出，作 `Accept-Language` 来源。

## 10. 错误处理

- 业务错误抛 `HomepageApiError`（携带 `status/code/data/failureReason`）；基础设施错误抛 `Error('详细上下文')`。
- msg 三要素（哪里 + 什么 + 请求/响应详情），见 [[spec-code]] §2。
- catch 后**必** `console.error(error)`；网络层失败额外上报 SLS。
- 全局兜底：`installFrontendErrorCapture`（window error + unhandledrejection，30s 同指纹去重），在 Layout 启动。
- 用户可见错误展示在触发它的组件内（工作区错误区、弹窗错误行等），需要二次确认走 `scripts/site/confirm.ts`；文案走 i18n。

## 11. checklist

- [ ] `pnpm build` 通过
- [ ] 无 `any`，`as unknown` 仅 JSON.parse 后
- [ ] 运行时能力写在 `scripts/runtime/`，未新增转发或镜像
- [ ] API 对接 `code === 10000` 信封
- [ ] 样式 scoped，`is:global` 仅限必要
- [ ] catch 后 `console.error`
- [ ] i18n 走字典，无硬编码中文文案
