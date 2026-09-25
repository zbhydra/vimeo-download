# 插件端 E2E

插件 E2E 只验收真实站点。受控 HTML、假站点数据、假媒体响应和通用 API mock 不属于
E2E；纯逻辑和异常分支由 Unit/Integration 覆盖。

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

只允许一个非产品数据边界：

- SLS WebTracking 请求固定返回 `204`，避免 E2E 污染正式埋点。

禁止 route 站点 document、DOM、结构化数据、媒体、官网页面或其他项目 API。真实环境失败
必须按样本变化、网络/WAF 或产品回归分类，不能用假页面替代。

## 浏览器与 profile

全部 E2E 与 profile setup 复用 `scripts/playwright-browser-identity.mjs`，使用支持
`--load-extension` 的完整 Chromium headed 模式，移除 `--enable-automation` 并关闭
`AutomationControlled`。新版稳定 Google Chrome 不支持这条 unpacked extension 启动链路；
首次运行需执行 `pnpm exec playwright install chromium`，Linux CI 需要 Xvfb。

| 场景 | 目录 |
|---|---|
| Vimeo profile | `tests/logs/test-user-data`（固定绝对路径） |
| 下载文件 | `tests/logs/downloads/<testRunId>` |
| Playwright 报告 | `tests/logs/playwright-report` |
| trace / screenshot / video | `tests/logs/test-results` |

Vimeo 固定样本是公开视频，不依赖登录态；`pnpm test:setup` 只负责 fresh build 并准备
profile 目录，不需要人工登录。Playwright 使用 `fullyParallel=false`、`workers=1`。

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
