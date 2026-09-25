# 客户端测试规范

> `website`（Astro 静态站）与 `extension`（MV3 插件）测试**强制规范**。写/改前端测试前必读。
> 两端测试体系完全独立，分章遵守。
> 关联：[[spec-website]] [[spec-extension]]、设计系统 `design.md`。

## 1. 总则

1. **E2E 优先**：Less unit tests, more e2e。业务功能优先 e2e 覆盖真实用户路径。
2. **Unit 仅作补充**：只测纯函数、协议转换、类型映射、无 UI/IO 的小逻辑。
3. **稳定性优先**：断言语义/文本/状态/可见性/接口结果/业务副作用，避免像素完美差分。
4. **website-shared 无独立测试**：其代码由 `website/tests/module-scripts.test.js` 跨包编译 + 动态 import 间接覆盖；extension 不引用 website-shared。
5. **后端必须真实**：遵守根 `AGENTS.md` §3 第 10 条。不得通过 `page.route` / `route.fulfill`、替换 `fetch`、本地 fixture HTTP 服务或其他方式伪造本项目后端 API 响应；登录、商品、配额、订单与履约接口均无例外。
6. **核对有效配置**：构建和启动前检查环境变量覆盖，启动后确认浏览器实际请求本地真实后端；不能只凭 `--mode development` 或页面 HTTP 200 判断。后端未启动时按项目规范启动，无法启动时报告阻塞，不使用模拟或生产接口替代。

## 2. website 测试

### 2.1 单测：Node 内建 `node:test`

- 用 **Node 内建 `node:test`**（非 vitest/jest），断言 `node:assert/strict`。
- 单文件 `website/tests/module-scripts.test.js`，命令 `pnpm test:module-scripts`。
- 覆盖三类：
  - **构建产物**：HTML 不含 `.ts` module script、特定页文案。
  - **SEO 一致性**：sitemap 多语言索引 / hreflang / canonical 与 `i18n/ui.ts` 闭环；`llms.txt` / `robots.txt` / 退役页 CSV 引用的 URL 都对应真实 dist 文件。
  - **TS 纯函数**：SLS 埋点 / API 错误分类 / 登录 / checkin / 媒体解析 等。
- **纯函数测试标准手法**：tsc 编译到临时目录 + 动态 import + patch `import.meta.env.*`（参考 `importCompiledTypescriptModule` / `patchCompiledBrowserModuleFiles`）。
- DOM/浏览器全局可用手写 fake 隔离纯前端逻辑，但不得借此伪造本项目后端 API 响应。

### 2.2 e2e：Playwright 真实后端

- 目录 `website/e2e/*.spec.ts`。
- 浏览器身份统一由 `scripts/playwright-browser-identity.mjs` 管理：Chromium project 必须使用
  本机稳定版 Google Chrome，移除 `--enable-automation` 并关闭
  `AutomationControlled`；禁止静默回退到会暴露 `HeadlessChrome` 的 Playwright Chromium。
- 每个 website/admin spec 必须调用
  `registerE2eBrowserIdentity(test)`，保证新 document 在站点脚本执行前修正
  `navigator.webdriver`、Playwright globals 与移动端 `navigator.platform`。
- `browser-identity.spec.ts` 是身份回归门禁，必须同时断言 JS 属性、导航请求 UA/Client
  Hints 和移动端平台一致性。该门禁只证明没有已知自曝字段，不承诺绕过 Cloudflare/WAF。
- 稳定 Chrome 可通过 `E2E_CHROME_EXECUTABLE_PATH` 显式指定；缺失或版本无法识别时直接失败。
- **真实后端运行**：所有浏览器 project 的 API 均须指向本地实际运行的后端。现有依赖模拟响应的用例和脚本必须先迁移，迁移前不得执行或作为验收依据。
- **真实 smoke**：独立 `parse-download-smoke` project（`testMatch` SMOKE_SPEC），`E2E_REAL_API_BASE_URL` 必须指向本地真实后端，`globalSetup` 用后端 `e2e_seed_user.py` seed 账号并注入 token。
- 断言：Playwright 原生 `expect`（`toHaveTitle` / `toBeVisible` / `toContainText` / `toHaveCount`），用 locator auto-wait，禁 fixed sleep。

| 命令 | 说明 |
|------|------|
| `pnpm test:e2e` | 现有模拟后端用例完成真实后端迁移前禁止执行 |
| `pnpm test:e2e:parse-smoke` | 调用 `backend/scripts/e2e_parse_download_smoke.py` 启动单个本地业务服务器，再执行真实 Playwright smoke |

## 3. extension 测试

### 3.1 单测：vitest + happy-dom

- vitest + happy-dom；目录 `extension/tests/unit/**` + `tests/integration/**`，`*.spec.ts`。
- chrome mock：`tests/mocks/chrome-api.ts`（完整 mock，每方法 `vi.fn`，支持 callback 与 Promise 两种形态），`setupFiles: tests/setup.ts` 注入 `global.chrome`。
- **覆盖率 80% 硬门槛**（lines / functions / branches / statements，v8 provider）。
- 范式：`vi.stubGlobal('__DEV__', ...)` + 动态 import；`vi.mock` 替换 logger / storageManager / Router。
- 命令：`pnpm test:unit:run` / `test:coverage`。
- ⚠️ `setup.ts` 把 `console.log/warn/error/info` 全 mock 成 `vi.fn`，单测里看不到错误日志——与「catch 必 console.error」规范冲突，**单测除外**。

### 3.2 e2e：Playwright + 加载 unpacked 扩展

- 用 `launchPersistentContext` + `--load-extension=dist --disable-extensions-except=dist` 加载扩展（`tests/fixtures.ts`），从 service worker URL 反解 `extensionId`。
- 持久化 context 与 profile setup 同样复用 `scripts/playwright-browser-identity.mjs`：使用支持
  `--load-extension` 的完整 Chromium headed 模式，并在任何站点页面创建前安装身份 init
  script。新版稳定 Google Chrome 不允许这条 unpacked extension 启动链路，禁止用于插件 E2E。
- 目录：`tests/e2e/*.spec.ts`、`tests/manual/*.manual.spec.ts`（manual 仅 `E2E_INCLUDE_MANUAL=1` 入发现）。
- E2E 分两层：默认 hard gate 可在目标站点真实 HTTPS origin 上 route 外部站点的本地 HTML/DOM/接口 fixture，但本项目后端 API 必须连接本地真实后端；必须加载 fresh-built unpacked extension，并完整启动 background、MAIN injected、ISOLATED content 与真实 Chrome API，禁止只 mount Vue component。真实站点与登录态仅作为显式 Canary / manual，不进入默认 `test`、`check` 或日常 reviewer。
- `extension/` 的 Playwright project 只有 `extension-e2e-vimeo-real`（`testMatch` 为 `tests/e2e/vimeo-real-download.spec.ts`）。新增端到端能力时在既有站点 project 上扩展，不新建平台 project。
- Playwright 配置使用 `fullyParallel=false`、`workers=1`；`retries` 只由 CI 决定（本地 0）。每条 test 开始时先关闭 persistent context 遗留的普通页与站点页，再创建 fresh page，结束时关闭本 test 页面。
- controlled E2E 的 fixture 必须集中在测试入口，只覆盖当前验收需要的站点合同；不得增加生产测试开关、第二套启动框架或组件级假 E2E。真实 Canary 禁止替换站点 document、DOM、结构化数据与媒体响应。
- 真实 Vimeo 下载的配额检查请求本地真实后端，必须断言配额调用次数；Vimeo 页面 DOM、媒体请求和 Chrome 下载不得 mock。
- **chrome.* 是真实浏览器实现**，不 mock；`chrome.storage` 直接在 page 里操作。
- Vimeo 使用固定公网真实样本；只允许屏蔽 SLS 埋点请求，站点页面、配置、媒体和下载不得 mock。Cloudflare challenge 只能记为环境 skip，不能记为通过。
- Vimeo 样本是公开视频，不依赖登录态；面板选项由样本当前 config 决定，用例不预设 delivery（DASH / HLS / progressive）——取样本实际提供的选项，样本不再提供该交付时带原因 skip。面板缺失或始终给不出选项都是真实回归，按失败处理。
- 登录态：真实 Vimeo 入口固定使用同一个绝对 profile `extension/tests/logs/test-user-data/`，不提供 profile 参数或环境变量。`pnpm test:setup`（等价于 `test:setup:vimeo`）在 fresh build 后准备该 profile；日常 E2E 只读取 profile，不重复运行 setup。

| 命令 | 说明 |
|------|------|
| `pnpm test` / `test:headed` | 完整 Chromium headed；执行 `extension-e2e-vimeo-real` 的真实 Vimeo 流程 |
| `pnpm test:e2e:vimeo` | 只运行 `extension-e2e-vimeo-real` |
| `pnpm test:setup` / `test:setup:vimeo` | fresh build 后准备真实 Vimeo 的固定 profile |
| `pnpm test:clean` / `test:report` | 清理 / 看 report |

## 4. 数据、登录态与清理

| | website smoke | extension 真实跑 |
|---|---|---|
| 账号 | 后端 `e2e_seed_user.py` seed，**不清理** | 不需要登录态；固定 profile 只承载扩展自身的 device_id 与构建产物 |
| token | `globalSetup` 注入 env（`E2E_ACCESS_TOKEN` / `E2E_DEVICE_ID`），spec 写 localStorage | 无 |
| 隔离 | project + env 切 base URL | `testRunId`（`e2e-{ts}-{6}`）隔离下载目录 |

两端都不做严格 DB 清理，依赖 fixture / seed / profile 隔离。

## 5. 每个 feat 的 e2e 必含

- **按钮交互**：关键按钮可见、可点、点击后 UI 状态 / 接口调用 / 业务副作用符合预期。
- **列表数据**：展示正确数据、空结果、过滤/搜索、刷新后状态。
- **表单验证**：必填 / 格式 / 边界能拦截或提示，合法表单能提交并成功反馈。

## 6. 禁止事项

| 禁止 | 原因 |
|------|------|
| 像素完美截图作主要验收 | 维护成本高，业务信号弱 |
| `fixed timeout` 等待 UI | flaky，用 locator auto-wait |
| 用 `any` / `unknown` 写测试辅助类型 | 项目禁 any |
| extension e2e 用 `page.route` mock chrome API | chrome.* 用真实浏览器实现，单测才 mock |
| 用 component mount 代替 controlled extension e2e | 无法证明 background、content、injected、Manifest 与真实 Chrome API 启动链 |
| 真实 Canary route 站点页面、DOM、结构化数据或媒体 | 会把外部兼容性验收降级为 fixture 验收 |
| 默认测试或并发进程读取固定 profile | Chromium profile 锁冲突与构建产物串味 |
| 给 website-shared 加独立测试体系 | 其覆盖入口是 website 的 module-scripts.test.js |
| 固定账号 / ID / 文件名（extension 下载目录已用 testRunId 隔离） | 并行污染 |

## 7. checklist

**website**
- [ ] 纯函数用 `importCompiledTypescriptModule` 编译 + import
- [ ] 实际 API 请求连接本地真实后端，无模拟响应或生产回退
- [ ] smoke 用独立 project + `E2E_REAL_API_BASE_URL`
- [ ] 每个 spec 已注册 `registerE2eBrowserIdentity(test)`，身份门禁通过
- [ ] 断言用 locator auto-wait，无 fixed sleep

**extension**
- [ ] 单测 chrome mock 走 `tests/mocks/chrome-api.ts`
- [ ] 覆盖率达 80%
- [ ] e2e 用统一完整 Chromium headed 身份的 `launchPersistentContext --load-extension=dist`
- [ ] controlled hard gate 加载 fresh-built unpacked extension 并证明 background/content/injected 启动，不只挂组件
- [ ] 真实 Canary 的本项目 API（含配额）连接本地真实后端；站点页面、媒体与 chrome.* 不 mock
- [ ] 固定持久化 profile 只由 setup 脚本准备，串行使用且不复制用户日常 profile
