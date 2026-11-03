# 002 · 插件端 E2E

## 功能目标

插件 E2E 只回答一个问题：当前 development build 的 unpacked 扩展，能否在真实 Vimeo 页面上
找到正确媒体，并通过 popup 或页面面板把正确的文件保存到磁盘。

受控 HTML、假站点数据、假媒体和 API mock 不能证明真实页面兼容性，不进入 E2E。
纯逻辑、协议、异常分支和状态转换由 Unit/Integration 覆盖。

## 真实环境定义

自动化 E2E 必须同时满足：

1. 每次运行 fresh build 当前工作树（`global-setup.ts` 执行 `pnpm run build:dev`），并加载真实 unpacked MV3 扩展。
2. 使用完整 Chromium headed 与真实 `chrome.*` 实现。
3. 访问固定公网 Vimeo 样本；项目 API 只访问本地真实后端，额度也是真实的。
4. 不替换站点 document、DOM、结构化数据、媒体请求或 CDN 响应。
5. 操作真实 popup 页面或真实页面面板，文件经 Chrome 原生下载落盘。
6. 下载断言基于落盘文件，不接受只检查按钮文字或请求发出。
7. 页面、样本或网络异常必须明确失败或带证据 skip，不能切回假页面继续通过。

只保留一个路由隔离：SLS WebTracking 请求固定返回 `204`，避免测试污染正式埋点。

本机直连不到 Vimeo 时用 `E2E_PROXY_SERVER` 指定代理，见 `extension/tests/README.md`。

## 测试矩阵

| Project | 文件 | 用例 | 真实验收内容 |
|---|---|---:|---|
| `extension-e2e-vimeo-real` | `vimeo-real-download.spec.ts` | 1 | player 样本经 popup 下载 MP4 和裁剪 MP3：injected mux、FIFO 队列、真实额度、下载历史 |
| `extension-e2e-vimeo-real` | `vimeo-real-subtitle.spec.ts` | 2 | 自动生成字幕从 popup 和页面面板保存为 WebVTT |
| `extension-e2e-vimeo-real` | `vimeo-real-panel-queue.spec.ts` | 1 | 页面面板下载视频时其他按钮可点，点击后排队，视频和字幕依次落盘 |
| `extension-e2e-vimeo-real` | `vimeo-real-upgrade-modal.spec.ts` | 1 | 真实额度用完后，页面升级弹窗打开插件订阅页 |

`pnpm test` 发现这 5 条真实自动化用例；不存在 UI、controlled 或 mock site project。
Playwright 使用 `fullyParallel=false`、`workers=1`；`retries` 在本地为 0、CI 为 2。

## Vimeo

### 样本

- 下载样本：`https://player.vimeo.com/video/1225933284`（131 秒）。旧样本 `1196869805` 2026-10-22 起返回 401。选它的原因：它只提供 DASH 和 HLS 分片交付，没有 progressive，正好覆盖本单元真正拥有的 injected mux 路径。
- 字幕样本：`https://player.vimeo.com/video/1226740492`。字幕轨在 `captions.vimeo.com`，只有自动生成字幕。
- 样本失效时用例直接失败（导航或定位器超时），需要更换样本。

### Profile

- Profile 基目录由 `resolveVimeoProfileDir()` 解析到 `extension/tests/logs/test-user-data/`，每次运行由 `resolveRunProfileDir()` 在其下生成一次性目录，不提供 profile 参数或环境变量。
- 公网 Vimeo 样本不依赖登录态。
- 用例使用持久化 Chromium context（`launchPersistentContext`），worker 结束前正常关闭让 Chromium 自行释放 profile lock；关闭失败要报错并给出项目名、profile 路径与原因。
- `dist/manifest.json` 缺失时直接失败并提示执行 `pnpm run build`；global setup 已先做一次 fresh build 并断言 MV3 关键产物。

### 下载（`vimeo-real-download.spec.ts`）

- 打开 player 样本和 popup 页面，等裁剪输入框出现（上限 60 秒，按真实重试入口轮询），并检查 popup 弹窗与裁剪输入的原生边界。
- 选最低画质视频下载，再设 0–2 秒裁剪、以 MP3 下载音频；队列依次是 `downloading`、`waiting`。
- 媒体落盘等待上限 180 秒（injected mux 需要先下载全部分段），只认本轮新出现的文件，路径在 `<downloadDir>/vimeoMediaDownloader` 内。
- `ffmpeg` 能完整解码；MP4 含视频轨和音频轨；MP3 只有音频轨，时长 1.8–2.3 秒。
- 真实 `quota/check` 调用 2 次且都允许；下载历史 2 条都成功；最后队列清空。

### 字幕（`vimeo-real-subtitle.spec.ts`）

- Popup：打开 player 样本和 popup 页面，字幕行包含 `English (auto-generated)`，点下载箭头。
- 页面面板：打开同一 player 样本，在 `vdl-vimeo-row-subtitle` 里真实点击该轨道的选项（按钮要求 `event.isTrusted`）。
- 落盘等待上限 60 秒，只认本轮新出现的 `.vtt`：文件名含轨道名，内容以 `WEBVTT` 开头并含时间轴。

### 页面面板队列（`vimeo-real-panel-queue.spec.ts`）

- 打开字幕样本的 player 页面，真实点击 Video 行最后一个按钮（最低画质、无音轨）。该按钮禁用并显示下载中或百分比，字幕、封面和 `Best` 仍可点击。
- 再点字幕按钮：它显示等待中并禁用，封面仍可点击。
- 只认本轮新出现的文件：`.mp4` 非空、`.vtt` 以 `WEBVTT` 开头。队列清空后两个按钮恢复原文案和可点击态。
- 界面语言跟随浏览器，状态文案从按钮的本地化属性读取，不写死英文。

### 页面升级弹窗（`vimeo-real-upgrade-modal.spec.ts`）

- 全新 profile 从头计额度，在 player 页面反复点封面按钮，每次等本地真实后端的额度响应，直到返回不足（`status=0`）并出现弹窗。
- 点弹窗主按钮：新开一个 `chrome-extension://<扩展 ID>/ext-pricing.html` 标签页，`source=upgrade_modal`，订阅页标题可见，弹窗关闭。

## 不在当前 E2E 的范围

- 完整登录流程、订阅页的购买流程、语言切换、空态和假资源列表不用当前 Vimeo E2E 验收；登录入口仅检查新开插件登录页有 Google 按钮，邮箱表单默认收起，点入口后出现。
- 面板的音频下载：视频和字幕走了页面面板，音频走 popup。
- 正常 vimeo.com 页面：自动化 profile 每次都被人机验证盖住，面板在那里的位置没有真实 E2E。
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
| `extension/tests/fixtures.ts` | Vimeo profile 解析、持久化 Chromium、扩展加载、下载目录与落盘等待 |
| `extension/tests/e2e/vimeo-real-download.spec.ts` | 视频和音频真实下载 |
| `extension/tests/e2e/vimeo-real-subtitle.spec.ts` | 字幕真实保存 |
| `extension/tests/e2e/vimeo-real-panel-queue.spec.ts` | 页面面板下载队列 |
| `extension/tests/e2e/vimeo-real-upgrade-modal.spec.ts` | 页面升级弹窗的去向 |
| `extension/scripts/setup-vimeo-test-profile.mjs` | 准备 Vimeo 测试 profile 与运行时 |

## 命令

| 命令 | 含义 |
|---|---|
| `pnpm test` | fresh build 后执行真实用例 |
| `pnpm test:e2e:vimeo` | 只运行 `extension-e2e-vimeo-real` 的 5 条 |
| `pnpm test:setup:vimeo` | 准备 Vimeo 测试 profile（`pnpm test:setup` 是它的别名） |
| `pnpm test:report` | 打开最近一次 Playwright 报告 |
| `pnpm test:clean` | 清理运行产物，不删除人工 login profile |
| `pnpm test:unit:run` | Vitest 单元/集成用例（非 Playwright） |

## 验收标准

1. `pnpm exec playwright test --list` 只发现这 5 条真实自动化 E2E。
2. 默认项目名必须明确包含站点名和 `real`，不能使用含糊的 `ui` 或 `controlled`。
3. E2E 源码不能包含 fake document、controlled media、通用 `**/api/client/**` route。
4. Vimeo 页面、媒体请求和项目 API 保持真实；只有 SLS sink 可固定响应。
5. 所有下载断言必须基于落盘文件。
6. 每次 E2E 都 fresh build 当前源码，不复用旧 `dist` 作为通过依据。
7. Playwright 必须保持 `fullyParallel=false`、`workers=1`。

## 风险

| 风险 | 处理 |
|---|---|
| vimeo.com 人机验证 | 自动化 profile 打开 vimeo.com 每次都显示 `Verify to continue`，响应头没有 `cf-mitigated`。真实用例只用 player 页面，被拦截的页面上的结果不记为产品通过 |
| 样本被删除、转私密或交付变化 | 用例失败，需更换样本 |
| 本机代理波动 | 表现为导航超时（`ERR_TIMED_OUT`）或下载停在 0 B，用例失败；确认网络后重跑，不记录为产品通过 |
| 下载目录污染 | 按 test run 隔离；用例只认本轮新出现的文件 |
| 文件名偶发退回 URL 文件名 | 2026-11-02 在 vimeo.com 面板路径约 20 次走到下载的运行里出现 1 次：`325078346.vtt` 存到下载根目录，内容正确。[035 计划](./plans/035.插件审查问题收口.md) U8 记过同样症状（Edge 首个下载存成 UUID 名）。根因未知；Chromium 定义 `onDeterminingFilename` 有监听时 `filename` 参数被忽略，所以监听没给建议名时会退回默认名，但这次是否如此没有抓到现场。用例的文件名断言会失败，复现时先保留下载目录和 SW 日志 |
| 正式埋点污染 | SLS 请求固定返回 `204` |
