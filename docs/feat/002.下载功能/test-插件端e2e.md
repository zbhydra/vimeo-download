# 002 · 插件端 E2E

## 功能目标

插件 E2E 只回答一个问题：当前 development build 的 unpacked 扩展，能否在真实 Vimeo 站点页面上
找到正确媒体、把面板放在正确位置，并通过真实浏览器下载得到正确文件。

受控 HTML、假站点数据、假媒体和通用 API mock 不能证明真实页面兼容性，不进入 E2E。
纯逻辑、协议、异常分支和状态转换由 Unit/Integration 覆盖。

## 真实环境定义

自动化 E2E 必须同时满足：

1. 每次运行 fresh build 当前工作树（`global-setup.ts` 执行 `pnpm run build:dev`），并加载真实 unpacked MV3 扩展。
2. 使用完整 Chromium headed 与真实 `chrome.*` 实现。
3. 访问固定公网 Vimeo 样本页；面板不存在或给不出选项都按失败处理，不做跳过。
4. 不替换站点 document、DOM、结构化数据、媒体请求或 CDN 响应。
5. 点击真实扩展面板按钮，并监听真实 Chrome download 事件。
6. 文件落盘后校验文件名后缀、非空大小与 ISO-BMFF `ftyp` 文件头。
7. 页面、样本或网络异常必须明确失败或带证据 skip，不能切回假页面继续通过。

只保留两个与面板正确性无关的隔离边界：

- `/api/client/quota/check` 固定为允许。它只避免测试账号当天额度阻断下载，
  不替换站点资源或下载链路。
- SLS WebTracking 请求固定返回 `204`，避免测试污染正式埋点。

## 测试矩阵

| Project | 用例 | 真实验收内容 |
|---|---:|---|
| `extension-e2e-vimeo-real` | 1 | 固定 DASH 样本的真实解析、injected mux 合成 MP4、真实落盘与按钮恢复 |

`pnpm test` 只发现这 1 条真实自动化用例；不存在 UI、controlled 或 mock site project。
Playwright 使用 `fullyParallel=false`、`workers=1`；`retries` 在本地为 0、CI 为 2。

## Vimeo

### 样本

- 固定样本：`https://vimeo.com/1196869805?fl=ip&fe=ec`（视频 ID `1196869805`）。
- 选它的原因：它只提供 DASH 交付，正好覆盖本单元真正拥有的 injected mux 路径；若样本不再提供该交付，用例带原因 skip。

### Profile

- Profile 目录由 `resolveVimeoProfileDir()` 统一解析到 `extension/tests/logs/test-user-data/`，不提供 profile 参数或环境变量。
- 公网 Vimeo 样本不依赖登录态，Setup 只负责准备一个干净的持久化 profile 并使扩展可用。
- 用例使用持久化 Chromium context（`launchPersistentContext`），worker 结束前正常关闭让 Chromium 自行释放 profile lock；关闭失败要报错并给出项目名、profile 路径与原因。
- `dist/manifest.json` 缺失时直接失败并提示执行 `pnpm run build`；global setup 已先做一次 fresh build 并断言 MV3 关键产物。

### 页面与面板

- 打开样本页后等待真实扩展面板出现（`vdl-vimeo-panel`），面板等待上限 60 秒，轮询间隔 500ms。
- 面板选项由样本当前 config 决定，用例不预设 delivery：取样本实际提供的 DASH/HLS 选项。
- Cloudflare 拦截页（`Verify to continue` 等文案标记 + `#challenge-running` 等 DOM 标记）与出网导航超时可以重开页面重试；导航尝试 12 次、总时长上限 150 秒，预算用尽才带证据 skip。
- 面板缺失或始终给不出选项都是真实回归，按失败处理。

### 下载

- 选择面板给出的真实画质后点击，按钮进入 `aria-busy="true"`，文案在 `Downloading...` 与百分比之间变化。
- 等待真实 Chrome download 事件，媒体落盘等待上限 180 秒（injected mux 需要先下载全部分段）。
- 落盘文件必须满足：后缀 `.mp4`、大小大于 0、文件头为 ISO-BMFF `ftyp`、路径在本次 `downloadDir` 内。
- 下载完成后按钮 `aria-busy` 属性被清除。
- 站点 document、媒体请求、扩展 RPC 和 Chrome 下载均不得 mock；只有 quota check 与 SLS sink 可固定响应。

## 不在当前 E2E 的范围

- Popup 登录、Pricing、语言切换、空态和假资源列表不用 E2E 验收。
- 面板选项解析、配置捕获、mux 分段边界、局部失败与并发由 Unit/Integration 覆盖。
- `tests/manual/*.manual.spec.ts` 是人工诊断，不进入自动化通过数（当前仓库没有 manual 套件）。
- 邮箱登录真实链路单独在 `tests/integration/email-login-real.spec.ts`，不属于 Playwright E2E project。

历史多平台 controlled 方案和当时的执行结果只保留在对应 Plan 与 changelog，不能作为当前发布
验收依据。

## 文件结构

| 文件 | 职责 |
|---|---|
| `extension/playwright.config.ts` | 只注册 `extension-e2e-vimeo-real` 一个 project |
| `extension/tests/global-setup.ts` | fresh build（`pnpm run build:dev`）并验证 MV3 关键产物 |
| `extension/tests/fixtures.ts` | Vimeo profile 解析、持久化 Chromium、扩展加载、下载目录 |
| `extension/tests/e2e/vimeo-real-download.spec.ts` | Vimeo 固定样本真实下载 smoke |
| `extension/scripts/setup-vimeo-test-profile.mjs` | 准备 Vimeo 测试 profile 与运行时 |

## 命令

| 命令 | 含义 |
|---|---|
| `pnpm test` | fresh build 后执行真实用例 |
| `pnpm test:e2e:vimeo` | 只运行 `extension-e2e-vimeo-real` 的 1 条 |
| `pnpm test:setup:vimeo` | 准备 Vimeo 测试 profile（`pnpm test:setup` 是它的别名） |
| `pnpm test:report` | 打开最近一次 Playwright 报告 |
| `pnpm test:clean` | 清理运行产物，不删除人工 login profile |
| `pnpm test:unit:run` | Vitest 单元/集成用例（非 Playwright） |

## 验收标准

1. `pnpm exec playwright test --list` 只能发现 1 条真实自动化 E2E。
2. 默认项目名必须明确包含站点名和 `real`，不能使用含糊的 `ui` 或 `controlled`。
3. E2E 源码不能包含 fake document、controlled media、通用 `**/api/client/**` route。
4. Vimeo 页面与媒体请求保持真实；只有 quota check 与 SLS sink 可固定响应。
5. 所有下载断言必须基于落盘文件（后缀 + 大小 + `ftyp`），不接受只检查按钮文字或请求发出。
6. 每次 E2E 都 fresh build 当前源码，不复用旧 `dist` 作为通过依据。
7. Playwright 必须保持 `fullyParallel=false`、`workers=1`。

## 风险

| 风险 | 处理 |
|---|---|
| Vimeo Cloudflare challenge | 页面重试耗尽预算后带证据 skip，不记录为产品通过 |
| 样本不再提供 DASH 交付 | 用例带原因 skip，需更换样本 |
| 样本视频被删除或转私密 | 面板给不出选项 → 真实回归失败，需更换样本 |
| 下载目录污染 | 按 test run 隔离，登录 profile 不随 `test:clean` 删除 |
| 线上额度波动 | 只固定 quota check |
| 正式埋点污染 | SLS 请求固定返回 `204` |
