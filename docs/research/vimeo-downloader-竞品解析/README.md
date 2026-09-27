# 竞品解析：Vimeo Downloader - HD Video & Audio Save

> 参考竞品（用户浏览器中的对照对象）的完整代码解析。源码快照在本目录 `source/`，本文只记录机制与结论；代码为压缩 bundle，定位用「字符串锚点」而非行号。
>
> 结论先行：**它没有「页面身份」概念，是纯网络嗅探累积模型**——MAIN world 钩子捕获一切 `/config` 响应，按 frame 存储按 videoId 去重，popup 打开时枚举 tab 全部 frame 合并列表。聚合页（如 `vimeo.com/watch` 首页）能列出所有播放过的视频，正是这个模型的自然结果。
>
> 深度调研（操作逻辑 / 技术方案 / 功能差异三维对比与跟进建议）见 [DEEP-DIVE.md](./DEEP-DIVE.md)。

## 1. 识别信息

| 项 | 值 |
| --- | --- |
| 商店名（en） | Vimeo Downloader - HD Video & Audio Save |
| 版本 | 2.6.14（MV3） |
| 扩展 ID | `llangkpnndilncfkpgcpolnmgjgnompo` |
| 本机路径 | Edge `Default` profile：`~/Library/Application Support/Microsoft Edge/Default/Extensions/llangkpnndilncfkpgcpolnmgjgnompo/2.6.14_0` |
| 自有后端 | `api.vimeomediadownloader.com`（auto-login content script 绑定此域；另有远端开关 `useBackendM3u8Parsing` 让后端代解析 m3u8） |
| 快照说明 | `source/` 已排除 `_metadata/`、`*-legacy*`（与非 legacy 逐字节相同的旧 Chrome 兼容包）、`*.wasm`（ffmpeg-core 24MB + libav 5MB）、空 worker；保留全部文本源码与 icons |

## 2. 总体架构（manifest 摘要）

```
permissions: offscreen / storage / downloads / tabs / webNavigation / notifications
host_permissions: <all_urls>

content_scripts:
  inject.js                                   MAIN world · all_frames · <all_urls> · document_start
  content-script-vimeo-popup-integration.js   隔离 world · all_frames · <all_urls> · document_start
  content-script-auto-login.js                隔离 world · 仅 api.vimeomediadownloader.com · document_end

background: js/background.js（service worker，下载编排）
offscreen: offscreen.html + streaming-libav-worker.js + ffmpeg/libav wasm（DASH 音视频合成）
```

两个全站 content script 是**成对设计**：MAIN world 钩网络，隔离 world 做存储/中继，用 `window` CustomEvent（`vimeoConfig`）跨 world 传递。与本项目 `injected ↔ content` 的 EventRpc 同构，但无协议校验。

## 3. 检测机制详解

### 3.1 MAIN world 网络钩子（`js/inject.js`，webpack 入口模块 `3` → `5c9b`）

激活条件仅一条：`location.href.includes("vimeo")`——URL 含 "vimeo" 子串即生效（含 `vimeo.com`、`player.vimeo.com`，也包括任意 URL 里带 vimeo 的第三方站）。三条钩子：

1. **`window.playerConfig` setter 陷阱**：`Object.defineProperty(window,'playerConfig',{set})`，播放页内嵌 config 被赋值时派发 `vimeoConfig` 事件（detail 携带 `{url, data}`）。
2. **XHR 包装**：`open` 记录 URL，`send` 后当 URL 含 `/config` 且响应 JSON 满足 `request.files` 存在、`cdn_url` 含 "vimeo" 时派发 `vimeoConfig`。
3. **fetch 包装**：请求 URL 含 `/config` 时 `response.clone()` 读文本，校验同上后派发 `vimeoConfig`。

校验极简：不验 URL 与 `video.id` 的身份一致性，不验签名——能过 `/config` + `request.files` + `cdn_url` 三关就收。

### 3.2 帧内存储与选项构建（`js/content-script-vimeo-popup-integration.js`）

同样以 `location.href.includes("vimeo")` 激活。每个 frame 独立一份：

- **存储**：`Map<videoId, 记录>`，记录含 `title/cover/duration/fps/author/uploadDate/pageUrl/availableQualities/rawConfig` 与 `frameInfo{url, isMainFrame}`；5 分钟 TTL 清理，无上限。
- **选项构建**（收到 `vimeoConfig` 后同步做）：
  - `request.files.progressive` → 直接 mp4（`progressive-direct`）；
  - `request.files.dash.streams_avc` → 按画质逐档（大小用「分辨率→码率」估算表换算，非真实值）；`useBackendM3u8Parsing` 开关决定走后端解析；
  - `request.files.hls` → 记 default_cdn 的 m3u8 URL；
  - 纯音频档、`request.text_tracks` → 字幕（vtt）。
- **两条出口**：
  - 主动推送：`chrome.runtime.sendMessage({action:"video-config-detected", configs: getAllConfigs()})`——每次捕获把本 frame 的**全部**配置推给 runtime；
  - 被动应答：响应 popup 的 `ping`（探测 frame 可达性）、`get-download-options`（返回本 frame 全部配置）、`refresh-configs`（清空本 frame 存储）。

### 3.3 popup 聚合（`js/popup.24321cdc.js`）——检测数据不在 background

弹窗打开时的收集流程：

1. `chrome.tabs.query({active, currentWindow})` 取当前 tab；
2. `chrome.webNavigation.getAllFrames({tabId})` 枚举该 tab **所有 frame**，过滤 `url.includes("vimeo")` 的 frame（主 frame 也含 vimeo 时才不算「非 Vimeo 页」空态）；
3. 对每个命中 frame `ping` 探活，再逐 frame 发 `get-download-options`，总超时 3s；
4. `processVideos` 合并：按 `videoId` 去重，同视频的多 frame 画质选项按 `name-downloadType` 去重后拼接；
5. 另有被动通道：`runtime.onMessage` 收 frame 推送的 `video-config-detected`（校验来源 tab），实时刷新列表——即使用户没开弹窗， frame 也在持续上报。

「检测到 8 视频」= 各 frame 存储按 videoId 去重后的并集大小，下拉选择器即此列表。

### 3.4 background 职责（`js/background.js`）——只管下载，不管检测

消息分发（`vimeo-download-merge` 转发下载任务、`offscreen-task-*` 结果回执、`update-badge`、`stop-all-tasks`、`get-settings` 等）。下载核心：DASH 音视频分离流经 offscreen document 里的 ffmpeg/libav wasm 合流（大文件自动分段），`downloads.onDeterminingFilename` 控制落盘名。**不持有视频列表状态**——检测数据活在各 frame 内存里。

## 4. 首页 `vimeo.com/watch` 检出 8 个视频的链路推演

首页是聚合页：hero 轮播轮换播放多个精选视频，Staff Picks 卡片 hover 预览播放。对竞品：

1. 轮播内每个视频播放时，其所在上下文（站内播放器或 iframe）发出的 `/video/{id}/config` 被 MAIN world 钩子捕获 → 派发 `vimeoConfig` → 该 frame 的 Map 里 `addConfig(videoId, …)`；
2. 用户停留/滑动首页，轮播与预览陆续播放，Map 里累积多个 videoId；
3. 打开弹窗 → `getAllFrames` 找到主 frame（及任何 player iframe）→ 逐 frame `get-download-options` → 按 videoId 去重合并 → 列出 8 个。

没有一步依赖「当前页面是哪个视频的页面」。

## 5. 与本项目插件的差异对比

| 维度 | 竞品 | 本项目 |
| --- | --- | --- |
| 检测模型 | 网络嗅探累积：多视频/多 frame，按 videoId 去重 | 页面身份优先：单视频/单页，先取 videoId 再查 config |
| 注入范围 | `<all_urls>` × all_frames × 2 个 script | 仅 `vimeo.com/*` + `player.vimeo.com/*`；MAIN world 入口**无 all_frames** |
| 激活条件 | URL 含 "vimeo" 子串（宽松，含第三方站） | host 白名单 + host 权限（严格） |
| config 校验 | `/config` + `request.files` + `cdn_url` 含 "vimeo"，共三关，不验身份一致 | URL videoId 与 config `video.id` 一致 + 签名 refresh URL 校验（严格） |
| 捕获存储 | 每 frame Map，可枚举（`getAllConfigs`），5 分钟 TTL | MAIN world Map 按 videoId 存，**只有点查无枚举** |
| popup 数据源 | 主动枚举 frame 收集 + 被动收 frame 推送 | 读 content 写入的 ResourceBuffer（单视频快照） |
| 下载合成 | offscreen + ffmpeg/libav wasm 客户端合流 | injected 侧下载（fMP4 HLS fallback 等） |

## 6. 我们在首页检测不到的根因

排查链（`extension/src/sites/vimeo/`）：

1. **身份门闩**：`content/index.ts` `scanAndRender` 先 `extractVimeoIdentityFromDocument`（`og:video:url` → player iframe src → canonical → location）。`/watch` 页四路皆空（无 og meta、canonical/URL 无数字段、hero 非匹配 iframe）→ 无 videoId → **直接 return**，从未向 MAIN world 查询过捕获。
2. **捕获不可枚举**：`injected/configCapture.ts` 的 Map 只有 `getCapturedVimeoConfig(videoId)` 点查。首页 hero 轮播播放产生的 config 响应**很可能已经被捕获在内存里**，但 content 没有办法问「你捕获到了什么」。
3. **iframe 内捕获缺失**：MAIN world 入口未开 `all_frames`，player.vimeo.com iframe 内的 config 请求我们根本不hook；iframe 里的 `frame.ts` 只发布身份，不发布资源。

根因是**模型差异**而非 bug：身份优先模型在「没有唯一主角视频的聚合页」上无身份可用，检测链在第一步就断。

## 7. 可借鉴方向（未实施，仅方案）

按改动量从小到大：

- **A. 枚举捕获**：MAIN world 捕获层增加 `listCapturedVimeoConfigs()`（返回已捕获 videoId + 元信息），content 在身份缺失时改为消费捕获列表，写 ResourceBuffer 供 popup 多视频展示。最小改动，能复刻首页检测；但 iframe 内播放仍捕获不到（需 B）。
- **B. MAIN world 入口开 `all_frames`（matches 收窄到 vimeo 域）**：补齐 iframe 内捕获；`frame.ts` 的身份兜底可与之合并。
- **C. 模型对齐竞品**：popup 数据源改为「按 tab 聚合多视频」，content 身份通道降级为「标记当前页主视频」。改动最大，涉及 ResourceBuffer / popup UI / 下载描述符身份模型，需先过设计评审。

注意约束：竞品的 `<all_urls>` + 全站 MAIN world 注入不可取（权限最小化是本项目硬约束，spec-extension §11）；宽松校验（不验 URL/config 身份一致）同样不可取——那会引入「跨视频签名 URL」类错误下载，我们现有校验口径应保留。

## 8. 再分析方法

```bash
# 快照美化（分析用，勿改 source/ 原件）
npx prettier --parser babel source/js/inject.js > /tmp/inject.pretty.js
# 关键锚点
#   inject.js:                              "playerConfig"、"vimeoConfig"、"/config"、"cdn_url"
#   content-script-vimeo-popup-integration.js: "video-config-detected"、"get-download-options"、
#                                            "progressive-direct"、"streams_avc"、"text_tracks"
#   popup.24321cdc.js:                      "getAllFrames"、"processVideos"、"video-config-detected"
#   background.js:                          "vimeo-download-merge"、"add-download-task"、"update-badge"
```
