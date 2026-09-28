# 002 · 站点适配(平台差异矩阵)

> 技术实现文档。覆盖:站点(Vimeo)的解析方式、采用的 `download_mode`、`client_mux` 轨道处理、特殊边界、website 与 extension 的差异。
>
> 本文档是 002 下载功能的**平台扩展层**:下载主链路(V2/授权/token/续传/速率/前端切换)已在同目录另外几个 `tech-*.md` 描述,本文只补「站点的差异」。
>
> 关联:
> - 本域产品:`@feat.md`
> - 下载方法与续传(当前 mode 契约、dispatcher):`@tech-下载方法与续传.md`
> - V2 链路与接口规格:`@tech-链路与授权.md`
> - 前端切换:`@tech-前端切换.md`
> - 速率治理:`@tech-速率治理.md`
> - 扩展端 Vimeo 本地下载:`@tech-扩展端Vimeo本地下载.md`
> - 网站 Vimeo 匿名解析:`@tech-网站Vimeo匿名解析与客户端合并.md`
>
> 原则:**以代码为准**。本文只保留当前已接入、当前已注册的站点与 mode。

## 1. 域边界

站点适配层只描述「同一套 V2 下载链路在平台上有什么不同」:

- 平台识别(host 白名单、URL 规范化)。
- 解析方式(匿名 Playwright 读取播放器 config)。
- parse 阶段产出的 `download_mode`(direct / client_mux)。
- 资源形态(progressive 单文件 / DASH 双轨)。
- 特殊边界(config 过期刷新、DASH 清单不可用、私密与受限内容)。
- website 端 vs extension 端的能力差异。

**不属于本层**:节点调度、token 签发与验签、4GiB 上限、扣积分去重、Range 续传协议、限速值来源、前端 mode 注册表与 dispatcher——这些都在另几个 `tech-*.md`。

## 2. 平台注册表(以代码为准)

前端平台识别在 `website-shared/src/download/scripts/platform.ts::detectPlatform()`;后端平台识别在 `backend/src/app/contracts/media_platform.py::detect_platform()`。平台解析/下载入口固定收敛到 `backend/src/app/provider/media/{platform}_media.py`;有状态基础设施放在 `backend/src/app/provider/browser_runtime.py`。`provider/media` 不依赖 `app.services`，不保留旧 service 双轨。

### 2.1 现行已落地的平台与 Provider/runtime

| 平台 (`platform`) | 前端 host 白名单 | 后端入口 | 解析方式 | 资源形态 |
| --- | --- | --- | --- | --- |
| `vimeo` | `vimeo.com`、`www.vimeo.com`、`player.vimeo.com` | `provider/media/vimeo_media.py` + `provider/browser_runtime.py` | 匿名 Playwright 打开页面并捕获播放器 config / DASH 清单 | 单视频;progressive MP4 或 DASH 双轨 |

`MEDIA_PROVIDERS`（`backend/src/app/provider/media/__init__.py`）当前只注册 `vimeo`；平台识别失败统一抛 `MEDIA_PLATFORM_UNSUPPORTED`，不再有「平台白名单外也能落到某个兜底 Provider」的路径。

## 3. download_mode 矩阵

### 3.1 现行注册的 mode(代码为准)

`website-shared/src/download/scripts/download-methods.ts::DOWNLOAD_METHODS` 只注册 `direct` / `client_mux` 两种 mode；`proxy` 已下线（前端 runner、注册项、预检 fallback 与历史恢复记录的兼容判定都已删除）。后端 `download_mode` 同样收窄为 `direct` / `client_mux`，`proxy` 的 resource token 与 download token 都会被节点拒绝。

| `download_mode` | runner | 现行使用场景 |
| --- | --- | --- |
| `direct` | `direct-download.ts::runDirectDownload` | Vimeo progressive MP4 |
| `client_mux` | `client-mux-download.ts::runClientMuxDownload` | Vimeo 仅有 DASH 时的双轨合成 |

当前已注册 mode 的完整契约(sessionPolicy / queueDefault / quotaTiming / requiresIntent / canResume)见 `@tech-下载方法与续传.md` §2。

### 3.2 按资源形态汇总 `download_mode`

| 资源类型 | 判定条件 | `download_mode` | `download-v2` 响应 |
| --- | --- | --- | --- |
| Vimeo progressive video | `request.files.progressive[]` 中存在与授权 `sid` 匹配的轨道 | `direct` | `download-v2` 返回 `download_url` |
| Vimeo DASH video | progressive 缺失，且 `request.files.dash` 有可用 CDN | `client_mux` | `download-v2` 返回 video + audio 两条 track 的 JSON |

> Website/backend 下载执行走 `download-pre-v2` → `download-v2` 统一链路(见 `@tech-链路与授权.md`)。`download-v2` 按 Provider 返回的 result 生成 direct JSON 或 client_mux JSON。扩展端 Vimeo 本地下载不适用本 V2 链路，见 `@tech-扩展端Vimeo本地下载.md`。

## 4. client_mux 轨道处理(Vimeo DASH)

`client_mux` 当前唯一的使用场景是 Vimeo 只提供 DASH 的视频。

| 维度 | 口径 |
| --- | --- |
| 适用场景 | Vimeo parse 时 progressive 缺失、DASH 清单可用 |
| 轨道来源 | parse 阶段由 `provider/media/vimeo_media.py::VimeoMedia` 读取 DASH 清单，选出 video track 与 audio track；轨道 URL 只在 `download-v2` 返回 |
| 轨道 host | `*.vimeocdn.com`（含裸 `vimeocdn.com`）或 Vimeo 主域，且必须 `https`、无 userinfo、端口为 443/空 |
| 轨道来源清单 | DASH 清单 URL 由 config 的 `files.dash.cdns[default_cdn].url` 给出，服务端在页面上下文内以 `credentials: omit` / `no-referrer` / `redirect: error` 读取 |
| 合成方式 | 浏览器端 Mediabunny 无转码 remux |
| `sessionPolicy` | `none`(不跨刷新恢复) |
| `canResume` | `false`(`DOWNLOAD_METHODS.client_mux.canResume = () => false`) |
| `queueDefault` | `deny`(client_mux 资源不进 Download all 队列) |
| `quotaTiming` | `intent` |
| 失败 reason | `track_fetch_failed` / `client_mux_failed` / `client_mux_too_large` |
| 错误对象 | 只携带 `track_kind`、`status`、`reason`、`source_id`,不把 `download_url` 写入 `Error.message` |

## 5. 站点解析差异详解

### 5.1 Vimeo

| 维度 | 口径 |
| --- | --- |
| 平台识别 | `vimeo.com`、`www.vimeo.com`、`player.vimeo.com` |
| 规范链接 | 由链接中的数字 video id 归一化到 `https://vimeo.com/{id}` |
| 解析执行 | website/backend 走**匿名 Playwright**:用 `browser_runtime.ensure_browser()` 开新 context 打开规范链接，在页面上下文内捕获播放器 config 与其 DASH 清单；**不使用 yt-dlp** |
| 资源形态 | 单视频；progressive MP4 或 DASH 双轨(`direct` / `client_mux`) |
| 元数据缓存 | 解析结果缓存 30 分钟(`ex=1800`) |
| 解析限流 | 平台共性 3 次/10 秒 per user/device |
| 下载材料刷新限流 | `vimeo_direct_intent` 固定窗口 6 次/60 秒 |
| CORS | Vimeo CDN 返回 `Access-Control-Allow-Origin: *`，浏览器侧请求必须 `credentials: omit`；携带 Cookie 会被 CORS 拒绝 |
| 直链刷新 | `direct` / `client_mux` 方法内部最多刷新一次 intent(见 `@tech-下载方法与续传.md` §8.5)；DASH 清单在下载材料生成时重新捕获临时签名 |
| 范围外 | 私密/密码保护/付费/OTT/DRM 内容；在线播放；后端代理下载 |
| 扩展端差异 | 插件在 Vimeo 页面标题区直接展示 Video / Audio / Image 下载按钮，消费 Vimeo 原生 signed config 与 DASH/HLS、thumbnail，不调用后端、不重建 config URL；详见 `@tech-扩展端Vimeo本地下载.md` |

#### 5.1.1 扩展端纯前端下载

扩展端 Vimeo 下载不复用 website 后端解析口径。插件在用户当前 Vimeo 页面内提取 `videoId`，捕获 Vimeo 原生 player config，直接展示全部可下载选项，不等用户点击后再展开。无唯一视频身份的聚合页（如 `vimeo.com/watch`）走枚举已捕获 config 的回退通道，只服务 Popup 多视频选择器；口径见 `@tech-扩展端Vimeo本地下载.md` §5.2。

- DOM 注入:优先挂到 `main [data-testid="vd-wrapper"]` 内 `[data-testid="action-bar"]` 之前；找不到 action bar 时插到 `h1` 之后；再找不到时前置到 wrapper。
- 自有面板:`data-testid="vdl-vimeo-panel"`，内部固定三行 `vdl-vimeo-row-video` / `vdl-vimeo-row-audio` / `vdl-vimeo-row-image`；对应属性前缀为 `data-vdl-*`。
- config 来源:MAIN world 在 `document_start` 捕获详情页原生 signed config XHR/fetch；顶层 player 页读取初始 HTML 内嵌 playerConfig 与其原生 `config_refresh_url`。`videoId` 只用于身份匹配，禁止从 `videoId`/`h` 重建 config URL。
- 视频:优先列出 `request.files.progressive[]` 完整 MP4(标签如 `1080p MP4`)；DASH adaptive 更优或 progressive 缺失时，下载 video track + audio track 后在浏览器内 mux 成 MP4(标签 `{height}p HD`)；progressive 与 adaptive 都不可用时才走 HLS fallback(标签 `{height}p HLS`)。
- HLS:展示 fMP4 HLS(master variant + media playlist，有 `#EXT-X-MAP`，segment 命中 Vimeo CDN/Akamai)；`#EXT-X-KEY` 声明 AES-128 时在扩展内解密后下载（加密口径见 `@tech-扩展端Vimeo本地下载.md` §8.9）；TS/未知结构不展示。
- 音频:从 DASH playlist `audio[]` 列出所有独立音频轨，`Best Audio` 取最高码率，保存 `.m4a`。
- 图片:从 `video.thumbs` 取最大尺寸 thumbnail，保存 `.jpg`。
- Best 规则:progressive 与 adaptive 合并比较分辨率、fps、bitrate；三者都相同才优先 progressive。
- 内存预算:分片(mux)路径受 `muxMaxBytes` 约束，默认 768 MiB，由远端配置下发；已知大小超限不展示，运行中累计超限中止。
- 失败刷新:config 过期或 CDN `403/404/410` 时，使用 `request.config_refresh_url` 或原 config URL 刷新一次，仍失败提示用户刷新页面。

## 6. website 与 extension 差异

| 维度 | website | extension |
| --- | --- | --- |
| 入口 | 输入框粘贴 Vimeo 链接 | `vimeo.com` / `player.vimeo.com` 页面标题区面板 + Popup 视频面板（播放页单视频、聚合页多视频选择器） |
| 解析 | 后端匿名 Playwright 读取 config，产出 `direct` / `client_mux` | 页面内 MAIN world 捕获原生 config，纯前端解析 |
| 登录 | 登录后下载( Credits 或匿名额度，见 `@tech-匿名下载授权.md` ) | 可选登录，仅影响每日额度与订阅状态 |
| 资源类型 | 单视频 | 视频多画质、audio-only、thumbnail |
| 下载落盘 | `download-pre-v2` → `download-v2` | progressive/thumbnail 交 `chrome.downloads`；DASH/HLS 页面内 mux |
| 是否调用本项目后端 | 是 | 否(媒体不经过后端；仅登录/额度/订阅/远端配置调用 API) |

> 产品策略:网站为重心(移动端占多数)，扩展是桌面场景补充。

## 7. Website/backend 共性与扩展例外

以下约定以 Website/backend 下载链路为主；扩展端只适用明确写到扩展的条目。

- **统一链路**:website/backend 下载执行都走 `parse-pre-v2 → parse-v2 → download-pre-v2 → download-v2`(`@tech-链路与授权.md`);扩展端 Vimeo 本地下载不走该链路。
- **host 白名单**:同一套 Vimeo host 白名单同时存在于后端 `contracts/media_platform.py::detect_platform()`、`provider/media/vimeo_media.py` 与前端 `platform.ts::detectPlatform()`;前端识别只做本地判断(用于埋点和默认 UI)，不是鉴权。
- **parse 不暴露直链**:website/backend parse 响应隐藏 CDN 直链、轨道 URL、Cookie、完整 signed query;直链/轨道只在 `download-v2` 按 `download_mode` 返回。扩展端本地下载只读取当前页面内已有 URL，不调用 parse。
- **直链 host 校验**:direct/client_mux 返回的媒体 URL 必须命中 Vimeo CDN host 白名单且通过 `assert_public_host`。
- **CDN 请求 no-referrer**:Vimeo CDN 请求和 tracks 请求用 `no-referrer` 策略(`@tech-链路与授权.md` §2.5)。
- **直链刷新**:direct / client_mux 在新下载过程中最多通过 `download-pre-v2 -> download-v2` 刷新一次 direct/tracks JSON(`@tech-下载方法与续传.md` §8.5)。OPFS Continue 不重新授权;restartable Restart 是新的传输动作，清理当前记录后重新走 `download-pre-v2 -> download-v2`。
- **缓存 TTL**:Vimeo 解析结果缓存 30 分钟。
- **解析限流**:平台共性 3 次/10 秒 per user/device;下载材料刷新 6 次/60 秒。完整口径见 `@tech-速率治理.md`。
- **Website/backend 配额扣减**:按用户口径，同一用户同一资源 6 小时内只扣一次(`@tech-链路与授权.md` §3.3)。该规则不适用于扩展本地下载；扩展按当前 document 的 canonical 资源任务逐项扣除，同一未完成任务重复提交不再次扣除。
- **Download all**:`queueDefault=allow` 的 mode 且资源数 > 1 时展示;`client_mux`(deny)资源不进队列;含 client_mux 资源的结果不展示 Download all。详见 `@tech-下载方法与续传.md` §5。
- **Capabilities 与 mode 解耦**:`capabilities.{download,play}` 只给 UI 展示;`download_mode` 以后端 parse 结果为准。前端 fallback resource 才允许根据 platform 推断默认 mode，函数名 `resolveFallbackDownloadMode()`。详见 `@tech-下载方法与续传.md` §1。
- **Play 能力**:Vimeo 固定 `capabilities.play=false`；后端播放入口已废弃，播放流/session/token 旧 service 已移除。
- **扩展发布状态**:`extension/src/platforms/registry.ts` 是扩展唯一站点(Vimeo)的静态 Manifest 数据源；`extension/vite.config.ts` 的 `webExtension({ manifest })` 只消费该纯数据注册表，构建配置、Popup 站点识别与 E2E 校验读取同一份数据。

## 8. 站点接入清单(新增平台时)

新增平台接入必须同步以下位置(以代码为准，非文档):

| 层 | 文件 | 动作 |
| --- | --- | --- |
| 后端平台识别 | `backend/src/app/contracts/media_platform.py::detect_platform()` | 注册 host 白名单与 platform 标识 |
| 后端 Provider | `backend/src/app/provider/media/{platform}_media.py` + `provider/media/__init__.py::MEDIA_PROVIDERS` | 新增平台 Provider，实现 `_parse()` / `_download()` 并注册 |
| 后端平台私有逻辑 | `backend/src/app/provider/media/{platform}_media.py` | 放在对应 Provider class 内；如需有状态基础设施，放 `backend/src/app/provider/{platform}_runtime.py` 或明确命名的 provider runtime/pool 模块 |
| 后端 token/schema | `backend/src/app/schemas/...` / token service | 如有新的 platform Literal、resource token 字段或响应 schema，同步更新 |
| 前端平台识别 | `website-shared/src/download/scripts/platform.ts` | 加入 host 集合、`MediaPlatform` 类型、`detectPlatform()` 分支 |
| 前端下载 mode | `website-shared/src/download/scripts/download-methods.ts::DOWNLOAD_METHODS` | 若使用新 mode，先注册 Definition 与 runner，再在 service 返回该 mode |
| 错误码 | `backend/src/app/...`(错误契约) | 新增平台解析失败错误码 |
| i18n | website i18n 资源 | 平台标签、解析失败文案、详情字段 |
| 扩展端(如需要) | `extension/src/platforms/registry.ts` + `extension/src/sites/{platform}/` | 注册站点静态数据与 content/injected 入口 |
| 文档 | 本文件 §2.1/§3.2 + `references/index.md` | 矩阵更新 |

> 新增 mode 必须先在 `tech-下载方法与续传.md` §2 注册 Definition(包括 `sessionPolicy`/`queueDefault`/`quotaTiming`/`canResume`)并完成计费顺序设计，再在本文件 §3.1 标注使用场景。禁止靠 `platform === "xxx"` 特判绕过 `DOWNLOAD_METHODS` 注册表。
