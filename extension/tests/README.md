# 插件端 E2E

插件 E2E 只验收真实站点。纯逻辑和协议转换由 Unit 覆盖；本项目后端合同由连接本地真实
后端的 Integration / E2E 覆盖，所有测试均禁止伪造本项目 API 响应。

## Unit / Integration

`pnpm test:unit:run` 执行 `tests/unit/` 与 `tests/integration/`，默认项目 API 地址是
`http://localhost:7900`，运行前启动本地真实后端。Chrome API、通用 HTTP transport、
Vimeo 媒体协议和外部 SLS 可在单测中隔离；登录、配额、商品、订单和远端配置 API 不得模拟。
Manifest 单测检查当前 Vite 配置，不运行构建或重写 `dist/`。

## 命令

```bash
pnpm test
pnpm run test:e2e:vimeo
pnpm run test:setup
pnpm run test:report
pnpm run test:clean
```

`pnpm test` 会 fresh build 当前源码，然后串行执行全部真实自动化项目：

- `extension-e2e-vimeo-real`：真实 Vimeo 公网视频的 DASH 下载经 injected mux 合成 MP4，1 条。

`pnpm run test:e2e:vimeo` 只运行该 project。

## 真实边界

自动化 E2E 加载当前 `dist` 的真实 unpacked MV3 扩展，并使用真实 Chromium、`chrome.*`、
站点 DOM、站点结构化数据、媒体请求、页面按钮和浏览器下载。下载用例必须把文件保存到测试
目录，并检查文件大小、Chrome 下载终态与 CDN 域名。

只允许两个非产品数据边界：

- SLS WebTracking 请求固定返回 `204`，避免 E2E 污染正式埋点。
- fixtures 在 browser 级 CDP 会话上把下载行为恢复为 Chrome 原生 `default`（覆盖
  Playwright 的 `allowAndName` 劫持），否则落盘产物被 GUID 改名、真实文件名与
  `filename` 子目录全部丢失，按名字断言下载产物的用例无法成立；扩展的
  `chrome.downloads.download` 在原生行为下正常 resolve，产物经 profile 偏好落到
  `tests/logs/downloads/<testRunId>`。

禁止 route 站点 document、DOM、结构化数据、媒体、官网页面或其他项目 API。真实环境失败
必须按样本变化、网络/WAF 或产品回归分类，不能用假页面替代。

## 浏览器与 profile

全部 E2E 与 profile setup 复用 `scripts/playwright-browser-identity.mjs`，使用支持
`--load-extension` 的完整 Chromium headed 模式，移除 `--enable-automation` 并关闭
`AutomationControlled`。新版稳定 Google Chrome 不支持这条 unpacked extension 启动链路；
首次运行需执行 `pnpm exec playwright install chromium`，Linux CI 需要 Xvfb。

| 场景 | 目录 |
|---|---|
| Vimeo profile 基目录 | `tests/logs/test-user-data`（固定绝对路径，只作父目录） |
| 运行 profile | `<基目录>/<testRunId>`（每次运行一次性生成，启动前自动清理历史运行残留） |
| 下载文件 | `tests/logs/downloads/<testRunId>` |
| Playwright 报告 | `tests/logs/playwright-report` |
| trace / screenshot / video | `tests/logs/test-results` |

Vimeo 固定样本是公开视频，不依赖登录态；`pnpm test:setup` 只负责 fresh build 并准备
基目录，profile 由每次运行的 Playwright Chromium 全新初始化，不需要人工登录。
Playwright 使用 `fullyParallel=false`、`workers=1`。

**不要用真实 Chrome 打开基目录下的任何 profile**：真实浏览器会把 profile 升级到自己的
格式，旧版 CfT chromium 随后启动即退（U-H1 事故根因）。运行级一次性 profile 让本套件
永远只加载由同一 Chromium 初始化的目录，该漂移结构上不会复发。

## 固定样本

| 项目 | 覆盖 |
|---|---|
| Vimeo | 固定公网视频注入面板后按样本实际提供的 DASH 选项下载，injected mux 合成真实 MP4 并恢复按钮状态 |

用例不预设 delivery：从面板实际渲染出的选项里取最小画质的 DASH/HLS 选项，覆盖 injected
mux（本仓库唯一自有的下载实现）。样本不再提供该交付时带原因 skip，提示需要更换样本。

Vimeo 命中 Cloudflare 人机验证时会明确 skip；该结果只说明当前自动化 profile 无法进入
页面，不能记作产品通过。

Chrome 下载管理器（`progressive` / 缩略图交付）目前没有真实 E2E 锚点：固定样本 `1196869805`
的 config 不含 progressive 交付，此前候选样本被 Vimeo Premium 弹层拦截指针事件。真实采样已
确认公开样本 `1084537`（3 档）与 `32001208`（4 档）提供 progressive，媒体 host 为
`vod-progressive-ak.vimeocdn.com`，但尚未接入自动化。该路径当前由
`tests/unit/vimeo-browser-download-background.spec.ts` 覆盖；把可用样本接进 E2E 是后续待办。

## 环境变量

Vimeo profile 目录固定为仓库内绝对路径，不接受环境变量覆盖；下表只列可覆盖项。

| 变量 | 默认值 | 用途 |
|---|---|---|
| `E2E_DOWNLOAD_DIR` | `tests/logs/downloads/<testRunId>` | 临时覆盖下载目录 |

## 失败定位

扩展装配失败使用 `E2E_EXTENSION_DIST_MISSING`、`E2E_EXTENSION_CONTEXT_START_FAILED`、
`E2E_EXTENSION_SERVICE_WORKER_MISSING` 和 `E2E_BUILD_INCOMPLETE`；Popup 相关使用
`E2E_POPUP_URL_INVALID`；Vimeo 面板使用 `VIMEO_REAL_NO_VIDEO_OPTION`，播放暂停失败使用
`VIMEO_REAL_PAUSE_FAILED`。错误信息必须包含 URL、选择器或资源 ID、下载目录和恢复命令。
