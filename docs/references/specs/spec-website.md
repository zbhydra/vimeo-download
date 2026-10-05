# Website 工程规范（Astro）

> `website/` 前端代码**强制规范**。写/改 website 前必读。
> 技术栈：Astro 5.5（SSG 静态站）+ 原生 TS + 命令式 DOM（**非 SPA**）。无 Vue / React 集成。
> 关联：[[spec-extension]]、设计系统 `design.md`、注释与错误定位见 [[spec-code]]。

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
- 设计 token 遵循 `design.md`（Geist 亮色）：`Layout.astro` 的 `<style is:inline is:global>` 里用与 design.md 同名的 CSS 变量（`--background-100`、`--gray-1000`、`--gray-alpha-400`、`--blue-700` 等）定义，值取自 design.md，只收录用到的子集，新增前先在此补齐；另有 `--font-sans`（系统字体栈，不引入字体依赖）、`--radius-sm/md`（6 / 12px）、`--transition-fast/normal`（160 / 220ms，动效时长）、`--shadow-card/popover/modal`（三档阴影）、`--focus-ring`。组件消费 `var(--xxx)`。
- 全站共享样式在 Layout 全局块提供，页面不得各写一份：`.btn-primary`（gray-1000 实底）、`.btn-secondary`（白底 + gray-alpha-400 描边）、`.text-link`（blue-700，accent 用于链接与焦点）、`:focus-visible` 焦点环（`--focus-ring`）。焦点环规则特异性 0,4,0（`:root` 0,1,0 + `:is()` 取最具体参数 `[tabindex]:not([tabindex="-1"])` 的 0,2,0 + `:focus-visible` 0,1,0）；`tabindex="-1"` 的元素（脚本聚焦的标题等）不显示焦点环。组件写在可交互元素上的 `box-shadow`，特异性高于 0,4,0（不论先后），或等于 0,4,0 且在文档中出现更晚，就会盖住焦点环，这类选择器必须排除 `:focus-visible`（`:not(:focus-visible)`）。算特异性要计入 scoped 编译附加的属性选择器：它给选择器里每个复合选择器各加 0,1,0（如 `.company-section[data-astro-cid-…] h2[data-astro-cid-…]`）。scoped 的 `.a` 是 0,2,0，`.a.b`、`.a:hover` 是 0,3,0，不会盖住；`.a.b:hover`、`.a .b` 是 0,4,0，`.a .b.c` 是 0,5,0，可能盖住。组件不对 `box-shadow` 使用 `!important`。不要在组件里自行补焦点规则。
- 视觉：仅亮色，不做暗色；accent blue-700 只用于链接与焦点。blue 色阶其余步（如 blue-100 / blue-400 / blue-500）可按 design.md 用于状态提示，例如好评赠送横幅；主按钮、描边、装饰不用 blue。
- 样式原生 CSS + Astro `<style>` scoped（默认）；`is:global` 仅用于 Layout 全局 token、跨组件需命中动态插入 DOM 的场景（DownloadWorkspace、PricingAuthModal 等）。
- 移动端断点统一 `@media (max-width: 960px)`。
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
