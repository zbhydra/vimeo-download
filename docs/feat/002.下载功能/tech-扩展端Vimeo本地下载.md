# 002 · 扩展端 Vimeo 纯前端下载

> 本文只覆盖 Chrome 插件在 `vimeo.com` / `player.vimeo.com` 页面内的本地下载能力。它不走 website/backend 的匿名解析链路,不调用 `parse-v2` / `download-v2`,不把 Vimeo config、Cookie、媒体 URL 发给我们的服务器。
>
> 关联:
> - 下载域平台矩阵:`@tech-站点适配.md`
> - 共享下载队列与单项下载:`@plans/015.共享单项下载与for-of批量.md` `@plans/016.单一Injected-RPC与固定EventRpc.md`
> - 插件工程规范:`@../../references/specs/spec-extension.md`

## 1. 结论

Vimeo 扩展端可以做**纯前端下载**,并且不应该只做“首版 progressive MP4”:

- 页面按钮直接展示在视频标题区域,不等用户点击后再展开。
- Video 行展示 `Best` 与所有可下载画质;DASH 画质同时提供带音轨与无音轨两种交付。
- Audio 行展示 `Best Audio` 与所有独立音频轨。
- Subtitle 行展示每种语言的字幕轨,单文件直链交给 Chrome 下载管理器。
- Image 行展示最高分辨率 thumbnail。
- Progressive MP4 有完整直链时交给 Chrome 下载管理器，不经过页面 Blob。
- DASH adaptive 有更高清版本时,前端下载视频轨 + 音频轨并在浏览器内 mux 成 MP4。
- Audio-only 直接下载最高码率音频轨,保存为 `.m4a`。
- Thumbnail 从 `config.video.thumbs` 取最高分辨率 URL。
- DASH/HLS 交付可按秒级区间裁剪成片段,在 remux 阶段按 packet 边界截取,不重新编码。

失败处理保持简单:config 过期、CDN 403、CORS/网络失败、mux 失败时刷新 config 一次;仍失败就提示用户刷新页面重试,不做后端 fallback。

## 2. 范围

### 2.1 包含

- `https://vimeo.com/{videoId}` 视频详情页。
- `https://www.vimeo.com/{videoId}` 视频详情页。
- `https://player.vimeo.com/video/{videoId}` 嵌入播放器页。
- `https://vimeo.com/watch` 等无唯一视频身份的聚合页:走聚合页回退通道(见 §5.2),只服务 Popup,不渲染页面按钮。
- 当前页面已经允许用户播放的视频。
- Progressive MP4 多画质。
- DASH adaptive 多画质,含最高画质 mux。
- DASH video 的无音轨交付。
- Audio-only 下载。
- 字幕轨下载（WebVTT / TTML / SRT）。
- 片段裁剪（DASH/HLS，秒级区间）。
- Thumbnail 下载。
- Popup 视频面板(播放页单视频、聚合页多视频选择器)与页面内按钮共用同一资源缓存。

### 2.2 不包含

- website/backend 匿名 Playwright 解析。
- 后端代理下载、后端刷新 signed URL。
- 破解 DRM、Widevine、加密 HLS、OTT 内容。
- 绕过密码页、私有权限、登录墙。
- 从 `blob:` 播放地址反推完整视频文件。
- 服务器端 mux。
- Progressive 直链的片段裁剪（Chrome 原生下载无法只取区间，见 §8.5）。
- 画面精确到帧的裁剪（按 packet 边界，视频起点对齐关键帧）。
- 按分片跳过区间外的 DASH/HLS 分片（playlist 未提供每片时长，只按 packet 裁剪）。

## 3. 权限与上下文边界

Manifest 需要把 Vimeo 页面和 CDN 都列入 host permissions。这是扩展端本地请求,不是我们的后端请求。媒体主机以真实采样为准：progressive 为 `vod-progressive-ak.vimeocdn.com`，DASH/HLS 为 `vod-adaptive-ak.vimeocdn.com` 与 `skyfire.vimeocdn.com`，全部落在 `vimeocdn.com` 下，因此不额外申请其它 CDN 域。字幕不属于媒体 CDN：播放器 config 里的 `text_tracks[].url` 指向 `player.vimeo.com/texttrack/*`（第三个 host permission 已覆盖），或 Vimeo 字幕 CDN；两者都不需要新增权限。

```text
https://vimeo.com/*
https://www.vimeo.com/*
https://player.vimeo.com/*
https://*.vimeocdn.com/*
```

职责划分:

| 上下文 | 职责 |
| --- | --- |
| top content(`vimeo.com` / 顶层 `player.vimeo.com`) | 提取 `videoId`、通过 EventRpc 消费捕获的 config(播放页按 videoId 点查、身份缺失聚合页枚举概要,见 §5.2)、注入按钮、维护 tab 资源缓存；按来源把直连文件（progressive / thumbnail / 字幕）分流到 background，并在页面存活时查询 Chrome 进度 |
| player-frame content(`player.vimeo.com`) | 只把 frame 内 `videoId` postMessage 给 top content 作为 identity 兜底;不传 config 或 signed URL,不启动资源缓存与下载调度 |
| injected / MAIN world | `document_start` 安装原生 config 捕获,保留完整 signed URL 与 JSON,并按捕获序提供有界概要枚举；只执行需要分片读取和 remux 的 DASH/HLS 下载,不做后端通信 |
| popup | 视频面板（见 §12）：播放页展示单视频,身份缺失聚合页展示多视频选择器;展示当前 tab 的视频信息、四行档位与时间裁剪，按选中档位触发单个下载；入队与排重走 `core/content/download/downloadManager.ts` 的共享队列合同，下载状态与进度由顶部入口的浮层读取 |
| background | 不负责初始资源发现；校验 Vimeo caller、descriptor、CDN/MIME 边界，必要时刷新一次 signed config，并用 `chrome.downloads` 创建或查询 Progressive/Thumbnail/字幕任务 |

Manifest 申请 `downloads` permission。Progressive/Thumbnail 使用 `chrome.downloads.download()`，任务创建后由 Chrome 网络栈和下载管理器持有，不依赖页面或 MV3 Service Worker 持续运行；跳转、刷新或关闭来源 tab 不会取消已经创建的任务。DASH/HLS 仍使用 `fetch -> segment buffers -> remux -> objectURL -> a.click()`，因此其读取和 remux 跟随页面生命周期。adaptive mux 复用 website `client_mux` 已验证的 Mediabunny 思路,但实现位置在 extension 侧。

Vimeo content script 拆成独立 manifest entry（`src/sites/vimeo/content/entry.ts`），不把主入口整体改成 `all_frames:true`。Vimeo frame entry（`content/frame.ts`）只在 `player.vimeo.com/*` 内开启 identity helper。

Progressive / Thumbnail / 字幕三类都是完整文件直链，走同一条 `chrome.downloads` 通道；DASH/HLS（含无音轨视频与片段裁剪）走 injected 分片 + remux。片段裁剪只改变 remux 阶段的 packet 选择，不改变下载与队列路径。

## 4. 页面 DOM 与按钮插入点

### 4.1 已验证 DOM

Vimeo 视频详情页当前可用结构:

```text
document
└─ main
   └─ [data-testid="vd-wrapper"]
      ├─ ...播放器区域...
      ├─ h1
      └─ [data-testid="action-bar"]
```

关键选择器:

| DOM | 选择器 | 用途 |
| --- | --- | --- |
| 页面主体 | `main` | 最外层兜底容器 |
| 视频详情容器 | `main [data-testid="vd-wrapper"]` | 优先扫描范围 |
| 标题 | `main [data-testid="vd-wrapper"] h1` 或 `main h1` | 插入按钮区的上方锚点 |
| Vimeo 原生操作栏 | `main [data-testid="vd-wrapper"] [data-testid="action-bar"]` | 按钮区插入前的下方锚点 |
| Player iframe | `iframe[src*="player.vimeo.com/video/"]` | 提取 videoId 的来源之一 |
| OpenGraph player URL | `meta[property="og:video:url"]` | 提取 videoId 的首选来源 |

不要把按钮插进 Vimeo player iframe 内部;详情页按钮只挂在主页面标题区域。`video.src` 常见为 `blob:` 或分段 range URL,不作为下载地址。

### 4.2 插入算法

按钮面板插入在标题和原生 action bar 之间,也就是用户红框期望的标题操作区。

```ts
const wrapper =
  document.querySelector('main [data-testid="vd-wrapper"]') ??
  document.querySelector('main') ??
  document.body
const title = wrapper.querySelector('h1') ?? document.querySelector('main h1')
const actionBar = wrapper.querySelector('[data-testid="action-bar"]')

// 1) 有 action bar：插到它前面
actionBar.parentElement.insertBefore(panel, actionBar)
// 2) 有标题：插到 h1 之后
title.insertAdjacentElement('afterend', panel)
// 3) 都没有：前置到 wrapper
wrapper.prepend(panel)
```

插入优先级:

1. 有 `actionBar.parentElement`: `insertBefore(panel, actionBar)`。
2. 无 action bar 但有 `h1.parentElement`: `h1.insertAdjacentElement('afterend', panel)`。
3. 无标题但有 wrapper: `wrapper.prepend(panel)`。

同一 `videoId` 只保留一个面板。重扫时在 `[data-testid="vdl-vimeo-panel"]` 集合中按 `data-vdl-video-id` 找到当前 videoId 的面板；渲染前会移除其它 videoId 的旧面板，避免 SPA 切换后重复。

### 4.3 插件自有 DOM

页面内直接展示四行按钮（`vdl-` 前缀为本产品自有标记）：

```html
<section
  data-testid="vdl-vimeo-panel"
  data-vdl-video-id="{videoId}"
  data-vdl-config-expires="{expiresAt}"
>
  <div data-testid="vdl-vimeo-row-video" data-vdl-kind="video">
    <span data-testid="vdl-vimeo-row-label">Video</span>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="video" data-vdl-choice="best">Best</button>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="video" data-vdl-choice="progressive:1080p:0">1080p MP4</button>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="video" data-vdl-choice="dash:{trackId}">1080p HD</button>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="video" data-vdl-choice="dash:{trackId}:no-audio">1080p HD (no audio)</button>
  </div>

  <div data-testid="vdl-vimeo-row-audio" data-vdl-kind="audio">
    <span data-testid="vdl-vimeo-row-label">Audio</span>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="audio" data-vdl-choice="best-audio">Best Audio</button>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="audio" data-vdl-choice="dash:{trackId}">149 kbps</button>
  </div>

  <div data-testid="vdl-vimeo-row-subtitle" data-vdl-kind="subtitle">
    <span data-testid="vdl-vimeo-row-label">Subtitle</span>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="subtitle" data-vdl-choice="subtitle:en">English</button>
  </div>

  <div data-testid="vdl-vimeo-row-image" data-vdl-kind="image">
    <span data-testid="vdl-vimeo-row-label">Image</span>
    <button data-testid="vdl-vimeo-option" data-vdl-kind="image" data-vdl-choice="best-thumbnail">Thumbnail</button>
  </div>
</section>
```

四行始终渲染（Video / Audio / Subtitle / Image），行标签走 vue-i18n 的资源类型文案。某一行没有可用资源时，该行放一个 `disabled` 的占位按钮：文案 `-`，`aria-label` 为 `No Vimeo {kind} available`，`data-vdl-choice="unavailable"`、`data-vdl-source-id=""`。

无音轨视频是 Video 行里的普通选项,不是新的行或开关:它按既有按钮模型渲染,`data-vdl-choice` 为 `dash:{trackId}:no-audio`。时间裁剪只在 Popup 面板提供（见 §12）,页面面板不提供区间选择。

按钮属性:

| 属性 | 说明 |
| --- | --- |
| `data-testid="vdl-vimeo-option"` | 所有下载按钮统一测试标记 |
| `data-vdl-kind` | `video` / `audio` / `subtitle` / `image` |
| `data-vdl-choice` | `best` / `best-audio` / `best-thumbnail` / 具体 option id（含 `subtitle:{lang}`、`dash:{trackId}:no-audio`）/ `unavailable` |
| `data-vdl-source-id` | `vimeo:{videoId}:{kind}:{qualityKey}`；占位按钮为空串 |
| `data-vdl-label` | 原始画质文案，用于下载结束后恢复按钮文本 |
| `data-vdl-busy-label` | 本地化忙碌文案，用不可见伪元素预留宽度 |
| `aria-label` | i18n 文案，例如 `Download 1080p MP4` |

行内排序：Video 行的 `Best`、Audio 行的 `Best Audio`、Image 行的 `Thumbnail` 排在最前，其余按内容生成顺序。

样式口径:

- 面板宽度跟随标题区域,`display:flex; flex-direction:column; gap:8px`。
- 每行 `display:flex; align-items:center; flex-wrap:wrap; gap:8px`。
- 行标签宽度固定 56px,避免按钮换行时抖动。
- 按钮高度 32px,最小宽度 72px,圆角 6px。
- `Best` / `Best Audio` 使用主按钮样式;其他画质使用次按钮样式。
- 禁用态用于 config 加载中、该类型无资源、下载中。
- 点击资源后锁定同一视频面板的全部可下载按钮,阻止重复下载与重复扣额;触发按钮设置 `aria-busy=true`,面板用 `aria-busy=true` 表达整体忙碌状态。
- 能计算总字节时触发按钮显示整数百分比;缺少可信总字节时显示当前语言的 `Downloading...`;完成或失败后恢复原画质文案与可点击态。
- 按钮用不可见的本地化忙碌文案预留宽度,下载状态与百分比变化不改变按钮尺寸。

## 5. config 是什么

Vimeo `config` 是播放器启动 JSON。播放器用它取得 signed CDN URL、DASH/HLS playlist、progressive MP4、thumbnail 与过期信息。

`/video/{videoId}/config` 不是可由 `videoId` 与 `h` 重建的稳定接口。详情页原生请求还带播放器选项、上下文和 `s` 等签名参数,签名覆盖完整查询参数。删除参数、只保留 `h+s`、删除 `s`,或自行请求 `/config?h=...` 都会得到 `403`。扩展不得构造、裁剪或重新排序该 URL。

原生 config 有两种来源:

| 页面形态 | 原生来源 | 扩展处理 |
| --- | --- | --- |
| `vimeo.com/{videoId}` 详情页 | Vimeo 自己发出的完整 signed `/video/{id}/config?...&s=...` XHR/fetch | MAIN world 捕获成功 JSON 响应,保留最终响应的完整 URL；fetch 只读 clone,不消费播放器原响应 |
| 顶层 `player.vimeo.com/video/{videoId}` | 初始 HTML 内联的 `window.playerConfig = {...}` | 结构化解析内嵌 JSON,使用其中原生 signed `request.config_refresh_url`;不额外请求 `/config` |

上表两条是主通道。主通道在 `captureTimeoutMs` 内没拿到 config(返回 null 或 RPC 失败)时,content 按 videoId 触发一次 background 直连兜底:background 用扩展身份请求 `https://player.vimeo.com/video/{videoId}`,从返回 HTML 取同一份内嵌 `window.playerConfig`,校验后交回 content。兜底不构造 config URL,也不依赖页面注入是否成功;只有主通道超时才触发,同一页面内同一 videoId 只兜底一次。需要 `h` 才能打开的播放页(未列出、私有)不在兜底范围内。

捕获边界:

1. MAIN world 入口在 `document_start` 安装,早于播放器初始化。
2. 网络来源只接受 `player.vimeo.com`、精确 `/video/{digits}/config`、`2xx`、JSON 响应。
3. URL 中的 signed query 原样保存,日志只记录 host,不输出签名。
4. URL videoId、config `video.id` 与 content 当前 videoId 必须一致。
5. 单份响应限制 `512KiB`,每页最多保留 16 个 video config,超限按捕获序淘汰最早;同时等待不同 videoId 的上限同为 16。只存在当前页面内存。
6. content 通过有界 EventRpc 读取捕获结果:播放页按 videoId 点查(`getCapturedVimeoConfig`),身份缺失的聚合页枚举概要(`listCapturedVimeoConfigs`,见 §5.2);两种读取都不再次获取初始 config。
7. fetch/XHR 包装只 clone 并读取成功的 config 响应,不修改原请求、不拦截媒体分片,也不缓存播放器响应体。
8. 兜底通道只由 background 发起、只接受 Vimeo content 调用,只取最终响应仍在 `player.vimeo.com` 的播放页;请求失败按 RPC 错误返回,播放页没有可用内嵌 config 时返回 null,两者都不伪造结果。

### 5.1 videoId 身份提取顺序

1. 首选:
   ```css
   meta[property="og:video:url"]
   ```
   `content` 示例:
   ```text
   https://player.vimeo.com/video/1201819515?h=dc93ef4923
   ```
2. 其次:
   ```css
   iframe[src*="player.vimeo.com/video/"]
   ```
3. 再次:
   ```css
   link[rel="canonical"]
   ```
4. 最后从当前 URL path 提取 `/123456789`。

`videoId` 匹配 `/video/{digits}` 或 Vimeo 页面 path 中的数字段。URL query 的 `h` 只属于 Vimeo 页面身份的一部分,扩展不再用它构造 config URL。

### 5.2 聚合页回退通道（无唯一视频身份时）

`vimeo.com/watch` 等聚合页四路身份提取皆空,content 走回退通道:通过 EventRpc `listCapturedVimeoConfigs` 枚举 MAIN world 已捕获的原生 config 概要,逐视频走与播放页完全相同的校验链(点查 + videoId 一致校验 + URL 白名单)加载资源,按视频合并写入 ResourceBuffer 供 Popup 展示;页面按钮依赖页面身份,聚合页不渲染。

RPC 合同:无入参;响应为按捕获先后排序的概要数组,每条含 `videoId`、标题与可选的时长/封面 URL,条数受 MAIN world 捕获上限(16)约束,content 侧再截断到单页上限 16,响应体上限 32KiB(16 条 × 防御性最坏单条约 2KB)。概要只作为发现提示:EventRpc 是宿主页面可伪造通道,content 侧只保留数字形态的 videoId 并截断到单页上限,概要里的标题/封面等业务数据不采信,一律按 videoId 走既有校验链路重新获取——payload 不可信边界与身份校验口径同播放页点查,未放宽。

编排口径:

1. 每个 videoId 每页只编排一次:资源按 id 去重,失败视频(已下架/私有)的 background 兜底也不重放,重试没有增量价值。
2. 回退加载为有界并发 4(`runWithBoundedConcurrency` 纯函数,Promise 池推进,`allSettled` 等全部在途任务结束后才抛第一个错误):单视频加载以 playlist 网络为主,实测串行约 0.9s/视频,SPA 返回聚合页时一次全量枚举可达 16 个视频(串行约 14s 起),并发 4 压到约 4s,单视频检出时延实测平均约 1.9s。逐视频失败隔离——单个视频(已下架/私有)的失败只记日志,不阻塞其余视频。
3. 回退重扫定时器:页面稳定后轮播仍持续向 MAIN world 供给新捕获(实测 74s 内累计 15 个),但 DOM 不再产生 content 口径相关的变化(实测 80s 内零相关 mutation),枚举只靠挂载窗口跑一次跟不上;新增 3s 重扫定时器(`FALLBACK_RESWEEP_DELAY_MS`)反复执行回退路径,同一时刻最多一个,持续消费新捕获。
4. 身份在回退轮进行中出现时三处守卫中断:枚举前短路(有身份时整条回退路径不启动)、循环体复核(不再对剩余视频派发任务)、写前复核(等待期间出现身份的视频不写入)。重扫定时器的停止条件同这条守卫:身份出现后定时器自然衰减,不再重新武装。身份分支已把 buffer 收敛为单视频快照,聚合资源不得混入。
5. 已接受限制:枚举与点查之间 MAIN world 的 16 条上限按捕获序淘汰,被点查 videoId 的 config 可能已被淘汰,点查落空后按 `captureTimeoutMs` 空等(单视频场景最长约 12s,多轮最多叠加)。

### 5.3 config 必读字段

```json
{
  "request": {
    "files": {
      "progressive": [],
      "dash": {},
      "hls": {}
    },
    "config_refresh_url": "https://player.vimeo.com/video/{id}/config/request?...",
    "timestamp": 1783862620,
    "expires": 3600
  },
  "video": {
    "id": 1201819515,
    "title": "video title",
    "owner": { "name": "author name" },
    "duration": 754,
    "thumbs": {}
  }
}
```

字段用途:

| 字段 | 用途 |
| --- | --- |
| `request.files.progressive[]` | 完整 MP4 直链,有 `quality/width/height/fps/mime/size/url`；`size` 是真实字节数,缺失时不展示大小 |
| `request.files.dash` | DASH playlist 入口,用于最高画质 mux 与 audio-only |
| `request.files.hls` | HLS playlist 入口,无可展示 DASH video 时 fallback |
| `request.text_tracks[]` | 字幕轨,含 `url` / `lang` / `label` / `kind`;`url` 常为 `/texttrack/{id}.vtt?...` 相对路径,按 config URL 解析 |
| `request.config_refresh_url` | Vimeo 原生 signed 刷新地址;config/playlist 或下载 URL 过期时最多使用一次 |
| `request.timestamp` | config 签发时间,Unix 秒 |
| `request.expires` | 相对 `timestamp` 的 TTL 秒数,不是 Unix 绝对时间 |
| `video.thumbs` | thumbnail 候选 |
| `video.title` | 文件名与 Popup 信息区标题 |
| `video.owner.name` | Popup 信息区作者；站点没给就整行不渲染 |
| `video.duration` | Popup 信息区时长（秒）；站点没给就整行不渲染 |

字段缺失时的口径：`/config/request` 刷新片段与完整 config 共用同一套 request 字段，因此 `files` 与 `text_tracks` 都从 `request` 下读取。刷新响应缺少 `text_tracks` 时沿用刷新前的字幕轨（与 `video.thumbs` 的处理一致），避免刷新一次就丢掉字幕行；`video` 整段缺失时沿用刷新前的标题、作者与时长。

绝对过期时间统一计算为 `expiresAt = request.timestamp + request.expires`。config 只缓存在当前 tab 内存中;到期或失败后使用原生 refresh URL 刷新一次,不持久化 signed URL。`/video/{id}/config/request` 返回的是 request 片段,字段直接位于顶层,没有完整 config 的 `request` 与 `video` 外层;解析时从已校验的 endpoint path 恢复 videoId,刷新已有快照时沿用原始标题、作者、时长与缩略图。

### 5.4 扩展运行时配置

Vimeo 站点的运行参数集中在 `extension/src/sites/vimeo/runtimeConfig.ts`，包内默认值编译期全量存在，远端只下发稀疏覆盖（`remote-config` 的 `vimeo` 分组，见 `@../000.架构/tech-extension.md`）。

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `muxMaxBytes` | `768 * 1024 * 1024` | 分片 mux 路径的内存上限；已知超限的候选不展示，运行中累计超限即中断 |
| `configRefreshWindowSeconds` | `30` | config 剩余有效期低于该秒数时先走 refresh URL |
| `captureTimeoutMs` | `12000` | content 侧等待 MAIN world 捕获结果的 RPC 上限 |
| `scanDebounceMs` | `300` | DOM 变化后的扫描 debounce |

约束：

- 远端值只接受有限正整数；缺失、类型不符或非法一律丢弃并保留包内默认值，不做隐式转换。
- content 读到远端值后通过 `applySiteConfig` 同步给 MAIN world；MAIN world 侧再按同一份已知字段白名单校验一次，不把脏值带进内存上限判定。
- 两条配置链（通用远端配置与 Vimeo 站点配置）互不依赖，任一条失败只记日志，不阻断另一条也不阻断渲染。
- 配置改动在页面重新加载后生效，服务端不做推送、轮询或版本号。

## 6. 下载地址获取

### 6.1 Progressive MP4

来源:

```text
config.request.files.progressive[]
```

典型字段:

```json
{
  "quality": "1080p",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "mime": "video/mp4",
  "url": "https://vod-progressive-ak.vimeocdn.com/..."
}
```

> host 为真实采样观测值（14 支公开视频的 progressive 交付实测均来自 `vod-progressive-ak.vimeocdn.com`）；路径与签名参数是结构示意，不是真实既有地址。

处理规则:

- `url` 就是完整视频下载地址。
- 只接受 `https:` 且 host 命中 Vimeo CDN 白名单。
- 按 `height desc -> width desc -> fps desc -> quality desc` 排序。
- 每个 progressive 生成一个 Video 按钮。
- 同画质重复 URL 去重。

### 6.2 DASH adaptive

来源:

```text
config.request.files.dash
```

取 playlist URL:

```ts
const cdnName = dash.default_cdn
const playlistUrl = dash.cdns[cdnName].url
```

playlist JSON 典型结构:

```json
{
  "base_url": "../../../remux/avf/",
  "video": [
    {
      "id": "video-track-id",
      "base_url": "video/...",
      "mime_type": "video/mp4",
      "codecs": "avc1.64001f",
      "bitrate": 2810000,
      "width": 1280,
      "height": 720,
      "init_segment": "base64...",
      "segments": [{ "url": "segment.m4s?..." }]
    }
  ],
  "audio": [
    {
      "id": "audio-track-id",
      "base_url": "audio/...",
      "mime_type": "audio/mp4",
      "codecs": "mp4a.40.2",
      "bitrate": 149000,
      "sample_rate": 48000,
      "channels": 2,
      "init_segment": "base64...",
      "segments": [{ "url": "segment.m4s?..." }]
    }
  ]
}
```

segment 绝对 URL:

```ts
const segmentUrl = new URL(
  playlist.base_url + track.base_url + segment.url,
  playlistUrl
).href
```

处理规则:

- 每条 `video[]` 生成两个 adaptive Video 候选:带音轨（默认绑定最高码率音频）与不带音轨；音频轨整体缺失时只生成无音轨候选，不再整条隐藏。
- 每个 `audio[]` 生成一个 Audio 候选。
- 建模阶段先过滤不可稳定 remux 的 track:
  - video 只接受 `mime_type=video/mp4` 且 codec 为 `avc1` / `avc3`。
  - audio 只接受 `mime_type=audio/mp4` 且 codec 为 `mp4a`。
  - `webm` / `opus` / `vp9` / `hvc1` / `hev1` / 未知 codec 不展示。
- adaptive Video 默认绑定最高码率 audio track;无音轨交付不绑定音轨（见 §8.4）。
- 建模完成后,下载描述符保存已校验的 DASH playlist URL 与 track id;资源 `url` 表示该 playlist,不再使用 config URL 冒充资源地址。
- 用户点击后直接请求描述符中的 CDN playlist,正常下载链路不得预先请求 `/config/request`。
- playlist 或 segment 返回 `403`、`404`、`410` 时,才使用原生 `config_refresh_url` 刷新一次;刷新阶段已经解析出的 playlist 直接用于本轮重试。
- refresh 接口仍拒绝请求时结束本次下载并让用户重试,不构造签名或绕过 Vimeo 风控。
- 下载顺序:视频 init + segments、（有音轨时）音频 init + segments、浏览器内 mux MP4。
- 若 video+audio 的 `segment.size` 均可得且合计超过 `muxMaxBytes`（默认 768 MiB），该 adaptive 候选不展示；size 未知时允许展示，但下载累计字节超过 `muxMaxBytes` 立即中断并提示。
- `blob:` range 播放 URL 不参与。

### 6.3 HLS fallback

来源:

```text
config.request.files.hls
```

HLS 只做 fallback:

- 优先 DASH,因为 DASH playlist 明确给出独立 video/audio track 和 segment 列表。
- 没有可用 DASH video+audio 但有 HLS 时,只支持安全的非加密 fMP4 HLS fallback。
- 解析 master m3u8 variant 后再读取 media playlist;variant 必须声明 `avc1`/`avc3` video codec 与 `mp4a` audio codec。
- media playlist 必须无 `#EXT-X-KEY`,必须有 `#EXT-X-MAP`,不得使用 `#EXT-X-BYTERANGE`,segment 必须为 HTTPS Vimeo CDN/Akamai,且不能是 `.ts`。
- 满足上述条件时把 init + fMP4 segments 交给 Mediabunny remux 成 MP4;TS/encrypted/未知结构不展示按钮。
- Audio-only 只在 HLS 明确提供独立 audio rendition 且未加密时显示;否则不显示 HLS Audio。

### 6.4 Audio-only

Audio 行来源优先级:

1. DASH playlist `audio[]`。
2. HLS 独立 audio rendition。

DASH audio 下载:

1. 选择 `bitrate` 最高的 audio track 作为 `Best Audio`。
2. 用户也可以直接点具体码率按钮,如 `149 kbps`。
3. 下载 `init_segment` 与所有 `.m4s` segments。
4. 前端 remux/封装为 `audio/mp4`。
5. 文件名:`{safeTitle}-{bitrate}kbps.m4a`。

如果没有独立音频轨,Audio 行显示禁用态,不从 progressive MP4 里前端抽音频;那需要解封装整条视频,内存和时间都不划算。

### 6.5 Thumbnail

来源:

```text
config.video.thumbs
```

处理规则:

- 遍历 `thumbs` 里的所有 URL。
- key 是数字时按数字宽度排序,例如 `640`、`960`、`1280`。
- key 不是数字时,对 URL 去重后保留为 fallback。
- 选最大尺寸作为 `Thumbnail`。
- 文件名:`{safeTitle}-thumbnail.jpg` 或按响应 `Content-Type` 推断扩展名。

### 6.6 字幕（text tracks）

来源:

```text
config.request.text_tracks[]
```

处理规则:

- 每个 track 生成一个 Subtitle 候选,语言标识优先 `lang`,缺失时用 `label`；同一标识或同一 URL 只保留第一条。
- 展示名优先 `label`,缺失时用 `lang`。
- 相对 URL（如 `/texttrack/{id}.vtt?...`）按 config URL 解析成绝对地址。
- 只接受命中字幕白名单的 URL（见 §9）;白名单之外的 host 不进入资源缓存。
- 按 URL 扩展名判断格式：`.vtt` → WebVTT（默认）、`.ttml`/`.dfxp`/`.xml` → TTML、`.srt` → SubRip。
- 文件名：`{safeTitle}-{label}.{ext}`。
- 字幕是单个完整文件，不需要合并，交给 Chrome 下载管理器（`chrome.downloads`），与 Progressive/Thumbnail 同路径。
- 字幕不参与片段裁剪。

## 7. 画质展示与 Best 选择

Video 行必须直接展示所有可用选择:

```text
Video  [Best] [2160p] [1080p HD] [1080p HD (no audio)] [720p MP4]
Audio  [Best Audio] [256 kbps] [149 kbps] [105 kbps]
Subtitle [English] [中文]
Image  [Thumbnail]
```

排序规则:

| 类型 | 排序 |
| --- | --- |
| progressive video | `height desc -> width desc -> fps desc` |
| adaptive video | `height desc -> width desc -> bitrate desc -> fps desc` |
| audio | `bitrate desc -> sample_rate desc -> channels desc` |
| subtitle | config 内 `text_tracks` 顺序 |
| thumbnail | `width desc` |

`Best` 选择规则:

1. progressive 与 adaptive 合并比较。
2. 先比较 `height * width`。
3. 同分辨率比较 `fps`。
4. 再比较视频 `bitrate`。
5. 如果 progressive 与 adaptive 在分辨率、fps、bitrate 上都相同,优先 progressive,因为不需要 mux、失败率更低。
6. 如果 adaptive 分辨率、fps 或 bitrate 更高,`Best` 使用 adaptive mux。
7. 同画质的带音轨与无音轨候选完全同分时,`Best` 取带音轨版本；只有带音轨版本因超过 `muxMaxBytes` 不展示时,`Best` 才落到无音轨版本。

按钮标签:

- progressive:`1080p MP4`。
- adaptive:`2160p` / `1440p`，实际标签为 `{height}p HD`。
- 同画质同时有 progressive 和 adaptive 时,progressive 显示 `1080p MP4`,adaptive 显示 `1080p HD`。
- 无音轨 adaptive:`1080p HD (no audio)`,文件名后缀 `-no-audio`。
- audio:`149 kbps`。
- 字幕:语言名（`label`,缺失时用 `lang`）。

## 8. 下载执行

### 8.1 Progressive / Thumbnail

```text
content downloadOne
-> background.startBrowserDownload(source)
-> 校验 Vimeo caller / descriptor / CDN / MIME / filename
-> chrome.downloads.download({ url, filename, conflictAction: "uniquify" })
-> 立即返回 downloadId
-> content 每 500ms 调用 getBrowserDownloadStatus(downloadId)
-> 页面离开后停止 UI 查询，Chrome 任务继续
```

边界校验:

- 创建前校验原始 URL 只能是 Vimeo HTTPS CDN，source kind、媒体类型、MIME 与 descriptor 必须一致。
- 状态查询只接受当前扩展创建的 download ID，并校验 Chrome 报告的 `finalUrl` 与响应 MIME；进行中的越界任务立即取消。
- 字幕响应 MIME 接受 `text/*`、`application/ttml+xml`、`application/x-subrip`，以及 CDN 默认的 `application/octet-stream` / `binary/octet-stream`（与 `core/injected/downloadValidation.ts` 对 DASH media segment 的既有口径一致）。字幕是纯文本，安全边界在 URL 白名单而不是 MIME，MIME 拒绝只会得到一条取消后重试必然重现的失败路径。
- Chrome 返回服务端授权/禁止/失败中断时，background 从原生 refresh config 只重建 Progressive/Thumbnail 列表，不加载无关 DASH/HLS playlist；恢复同一个直连选项并重建一次任务，第二次失败直接提示用户重试。
- `filename` 由 background 拼成 `{保存子目录}/{文件名}` 的相对路径：文件名只保留单段名字（目录分隔符与控制字符替换成空格、截断 180、清洗后正好是 `.` / `..` 时换兜底名），保存子目录逐段丢弃非法段（绝对路径的开头 `/` 与连续 `/` 造成的空段、`.` / `..` 回退段、`~` 开头段、含 `:` 或 `<>"|?*` 与控制字符的段），全部丢弃时回退默认子目录。Chrome 只接受下载目录下的相对路径，绝对路径、空路径与含 `..` 的路径会让整个下载失败（见 §12.7）。
- 冲突时由 Chrome 自动 uniquify。

### 8.2 DASH video mux

执行流程:

1. 下载 video init segment。
2. 顺序下载 video segments。
3. 下载 audio init segment。
4. 顺序下载 audio segments。
5. 组成两个 `Blob`:video mp4 fragment、audio mp4 fragment。
6. 用浏览器端 mux 输出最终 MP4。
7. 用 objectURL 触发保存。
8. 已知总大小或下载累计字节超过 `muxMaxBytes`（默认 768 MiB）时中断,避免前端内存不可控。

进度:

- progressive/thumbnail 在页面仍存在且 Chrome 已知 `totalBytes` 时，按 `bytesReceived / totalBytes` 显示 `0%` - `99%`；Chrome 标记 complete 后显示 `100%`。总大小未知时保持 `Downloading...`。
- DASH 只有在 video/audio init 与全部 segment size 都已知时,按整份媒体的实际已读字节显示 `0%` - `99%`;每个 segment 在流读取过程中更新,不按完成分片数伪造进度。
- HLS 或任一 size 未知时不伪造百分比,页面保持 `Downloading...`。
- 网络读取完成后的 remux/保存阶段保持 `99%` 或 `Downloading...`;只有浏览器保存动作触发后才上报 `100%`。
- signed URL 刷新重试时回到 `Downloading...`,新 playlist 能提供完整 size 后再恢复百分比。

### 8.3 DASH audio-only

执行流程:

1. 下载 audio init segment。
2. 顺序下载 audio segments。
3. 输出 `.m4a`。
4. 如果直接拼接的 fragmented MP4 在验证样本中兼容性不稳定,默认走 audio-only remux。

### 8.4 无音轨视频

- 无音轨选项的 descriptor 不带 audio track：下载只取 video init + segments，音频分片既不请求也不计入字节预算。
- mux 走同一条 remux 链路，只是不添加 audio track，输出仍是 `.mp4`。
- descriptor 声明了 audio track 而 playlist 已无该轨时直接失败，不静默降级成无声文件。
- 有音轨选项的下载流程与字节预算口径完全不变（video + audio 合计）。

### 8.5 片段裁剪

区间以秒为单位、相对媒体起点，随下载描述符传递（`startSeconds` / `endSeconds`）；未携带区间时行为与整片下载完全一致。

执行口径:

1. 分片下载路径不变（仍取整条 track 的 init + segments），裁剪发生在 remux 阶段。
2. 视频起点对齐到不晚于请求起点的最后一个关键帧，否则首帧无法解码；因此实际起点可能早于请求起点，最多早一个 GOP。
3. 音频取覆盖请求起点的 packet；音频起点沿用视频的时间基准，保证裁剪后不出现音画错位。
4. 终点取第一个不早于请求终点的 packet；请求终点超出媒体长度时输出到媒体结尾。
5. 请求起点不早于媒体长度时报错，不产出与请求无关的片尾。
6. 区间并入 option/source id（`:clip:{start}-{end}`）与文件名（`-clip-{start}-{end}s`），使同一画质的多个片段在资源缓存、Popup 选择与下载队列中各自独立；signed URL 过期刷新后按去掉后缀的同一画质恢复并保留区间。秒数只接受能写成十进制文本的值：`String(1e-7)` 这类指数记法构造出来的后缀正则读不回来，`parseVimeoTimeRange` 直接拒绝，Popup 侧按「区间不合法」回落整片下载。
7. 只有 DASH/HLS 交付支持裁剪；progressive 直链经 Chrome 下载管理器保存，无法只取区间，字幕与 thumbnail 不参与裁剪。

精度限制：裁剪精确到 packet（视频帧即 packet），不重新编码，不按分片跳读。

## 9. URL 白名单

允许:

- `https://*.vimeocdn.com/*`
- `https://player.vimeo.com/*` 用于 config/playlist,以及字幕直链 `https://player.vimeo.com/texttrack/*`
- 字幕额外接受 Vimeo 字幕 CDN（同样落在 `vimeocdn.com` 下）

拒绝:

- `blob:`
- `data:`
- `http:`
- 任意非 Vimeo CDN host（字幕只放宽到 `player.vimeo.com/texttrack/*` 这一个端点，不放宽 `vimeocdn.com` 之外的 CDN，也不改 manifest）
- 带加密标记的 HLS segment

白名单要在资源进入缓存前校验,下载前再校验一次。字幕与媒体走两套判定：`player.vimeo.com` 只对 `/texttrack/` 前缀放行。

config refresh、DASH/HLS playlist 与 segment 的扩展 `fetch` 必须使用 `credentials: omit`。这些 signed URL 自带访问授权,Vimeo CDN 使用通配 `Access-Control-Allow-Origin`;携带 Cookie 会触发 `WildcardOriginNotAllowed`,表现为播放器正常播放但扩展 fetch 得到 `net::ERR_FAILED`。Progressive/Thumbnail 不再由页面 `fetch`，而是把 signed URL 交给 Chrome 网络栈；它们不依赖 Vimeo Cookie，也不需要把 Cookie 复制到 background。

## 10. SPA 与刷新

Vimeo 页面可能在同一 tab 内切换视频。content 用 History API / `popstate` 与 `MutationObserver` 触发 300ms debounce,重新提取 `videoId`;videoId 变化后清理旧面板与资源缓存。

资源扫描是事件驱动的:

1. 每个 videoId 只保留一个捕获与 playlist 加载任务,并发 DOM 通知共享同一 Promise。
2. MAIN world 等待原生 config 最多 10 秒,content RPC 上限 12 秒。
3. SPA 已切换到其他 videoId 时,旧异步结果直接丢弃。
4. 成功快照缓存在当前 content 控制器,后续 DOM 重排只重挂面板,不重复请求 config/playlist。
5. 不使用 3 秒 reconcile,也不对 `/config` 做网络轮询。捕获超时或解析失败时展示空态,用户刷新页面重试。

SPA 切换或离开页面时，content 的按钮状态和原生下载轮询随文档销毁；已创建的 Progressive/Thumbnail Chrome 任务继续。DASH/HLS 需要页面内分片和 remux，离页会终止当前处理，用户回到页面后重新点击。

Config 刷新触发条件:

- `request.timestamp + request.expires <= now + 30s`。
- signed playlist 返回 `403` / `404` / `410`，或 Chrome 直连任务报告可刷新服务端中断。
- playlist 或 segment 返回其它失败状态。

playlist 过期可使用 `request.config_refresh_url` 重建一次资源快照;初始 config 的 `403` 不是 playlist 过期,不得进入无限刷新。每次用户点击最多刷新一次 config。

## 11. 资源模型

Popup 和页面按钮使用同一批 `MediaResource`。ResourceBuffer 按视频分组持有资源(`videoId → resourceId → MediaResource` 两层 Map),两条写入路径共享同一模型:播放页身份路径用 `replaceSnapshot(videoId, resources)` 做整页快照替换——当前页面可见/已挂载的媒体是唯一真相,上一轮扫描的陈旧资源与切页前其他视频不残留;身份缺失聚合页的回退用 `mergeVideoResources(videoId, resources)` 按视频合并——新视频追加成组,组内按资源 id 去重、来源排序择优,视频顺序保持首次写入(捕获)顺序。旧的整体替换/追加 API 已删除,不存在第二套缓冲结构。badge 语义是当前页面检测到的视频数(`getVideoCount()`,一个视频无论多少档位都算 1,空资源组与 popup 一样不计入),与 popup 检测数量口径一致。

组数有上限(`MAX_VIDEO_GROUPS = 16`):长驻聚合页的回退重扫会持续并入新视频,组数不设上限则单调增长,最终撑破 `getResources` 响应限额让 popup 读取必败。`mergeVideoResources` 后组数超限时按首并入序淘汰最旧组(组资源与元数据一起删除),上限与 MAIN world 捕获上限、响应限额定容三方对齐;淘汰后该 videoId 不会再被回退路径重编排(站点侧每页编排一次的记录仍在),直到页面切换清空。

Vimeo 下载描述符随 `documentId` 携带恢复资源所需的最小合同:

| 字段 | 口径 |
| --- | --- |
| `videoId/sourceId/optionId` | 定位当前视频与刷新后同一个选项 |
| `kind` | `video` / `audio` / `subtitle` / `image` |
| `delivery` | `progressive` / `dash` / `hls` / `subtitle` / `thumbnail` |
| `configUrl` | 捕获的完整 signed config URL,或内嵌 config 的 signed refresh URL |
| `refreshConfigUrl` | config 返回的原生刷新 URL |
| track/playlist id | DASH/HLS 下载恢复所需的最小标识 |
| `audioTrackId` | DASH video 选项可选；无音轨交付不带该字段，audio 选项仍必需 |
| `startSeconds/endSeconds` | 片段裁剪区间，秒、相对媒体起点；两者同时合法（含十进制文本约束，见 §8.5）才生效，只支持 `dash` / `hls` |
| `labelKey/labelParams` | 按钮标签的 i18n 词条键与插值参数；技术标识（`1080p HD`、`128 kbps`）与字幕语言名不带键，UI 回退到 `label` |

`expiresAt` 属于资源快照和页面面板状态,计算后为 Unix 绝对秒;不把 `request.expires` TTL 当作绝对时间写入描述符。

`MediaResource` 另外携带展示用的元数据：`title` / `author` / `duration` 取自 config 的视频级字段（同一视频的所有档位一致，站点缺失就不带该字段），`size` 只在拿得到真实字节数时才有值；这四个字段都参与 `ResourceBuffer` 的同资源比较。

组级展示元数据走独立 transport 通道：站点解析层（`parseVimeoConfig`）从校验链产出的 config 附加 `MediaResource.groupMetadata`（标题/作者/时长/封面，封面 URL 只接受 https 且 `*.vimeocdn.com` 域，非法时缺失；同一视频组内所有资源携带同一份），`ResourceBuffer` 按组收取，经 `getResources` 响应的 `videoGroups` 统一交给 popup，不作为资源自身字段消费。合并路径的组元数据按字段补齐（已有非空值保留、空缺字段由新元数据补齐，只增不改），即使某轮资源全部重复也能补全上一轮缺失的元数据。不可信通道（EventRpc 枚举概要等）不产生该结构——组元数据的唯一来源是校验链。

`sourceId` 规则:

```text
vimeo:{videoId}:video:best
vimeo:{videoId}:video:progressive:{height}p:{fps}
vimeo:{videoId}:video:dash:{trackId}
vimeo:{videoId}:video:dash:{trackId}:no-audio
vimeo:{videoId}:audio:dash:{trackId}
vimeo:{videoId}:subtitle:{lang}
vimeo:{videoId}:image:thumbnail
```

片段追加 `:clip:{start}-{end}` 后缀，例如 `vimeo:{videoId}:video:dash:{trackId}:clip:12.5-30`。

## 12. Popup 视频面板

### 12.1 尺寸与骨架

固定 `672px` 宽，最小 `300px`、最大 `600px` 高（`src/style.css` 的 `--popup-width` / `--popup-min-height` / `--popup-max-height`）。popup 被裁掉的部分不会出现滚动条，所以宽度下限取固定区的实际排版：headless Chromium 按真实 locale 文案 + SF Pro 实测，最坏状态（未登录 + 额度可见 + 升级 CTA + 刷新按钮可见）下 `header` 功能控件最宽 `574.7px`（fr-FR）、`footer` 整句单行最宽 `470.8px`（ja-JP），`672px` 在两者之上留有余量，且距 Chrome popup 上限 `800px` 有 128px。`header` 一行放不下时功能控件折到第二行（`AppHeader.vue` 的 `flex-wrap`），文案不省略也不裁切。`header`（品牌 / 下载状态 / 额度 / 语言 / 登录）与 `footer`（支持邮箱）固定，主区从上到下是：视频选择器（仅多视频时出现，见 §12.3）→ 视频信息 → 四行档位 → 时间裁剪 → 保存位置；内容超过上限时只有主区内部滚动。

宽度变化的附带影响：popup 内升级弹窗（`core/content/components/UpgradeModal.vue`，宽度上限 `400px`）在旧的 400px popup 里命中 `@media (max-width: 400px)`，内容内边距被压到 24px；672px 后该断点在 popup 内不再命中，弹窗用满 400px、内边距回到 32px。该断点在 Content Script 注入页仍生效（媒体查询按页面视口求值，窄于 400px 的页面窗口会命中），故保留。

主区的整体状态互斥：**扫描中 → 未连接引导（§12.2）→ 空状态（本页无视频，可重新扫描）→ 面板内容（§12.3~§12.7）**。

### 12.2 未连接引导态（当前页不是 Vimeo）

Popup 打开时如果当前标签页不是站点页面、并且窗口里也没有任何已打开的站点标签页，面板不呈现错误，而是呈现引导态：一个跳转图标 + 提示文案（`videoPanel.notOnVimeo`）+ 「打开 Vimeo」按钮（`videoPanel.openVimeo`）。

判据只有 store 的 `hasTargetTab`（= `initialize` 是否拿到了目标 tab）。两个边界要一起守住：

- **初始化之前不能下结论**。`resourceStore.loading` 初值为 `true`，`initialize` 落定前面板一律按扫描中呈现；否则 Popup 在 Vimeo 页面上也会先闪一帧引导态。
- **引导态取代错误条**。没有目标标签页时 `resourceStore.error` 仍是 `store.error.tabNotFound`（「当前没有可连接页面」这一事实的载体，部分调用方依赖它），但面板在 `!hasTargetTab` 时不再把它渲染成红色错误条——用户在非 Vimeo 页面点开 Popup 属于预期情形，重复报错只会持续刷红。

按钮点击后走 `popup/utils/tabs.ts` 的 `openSiteTab`：先复用 `ensureSupportedTabOpen` 的查找逻辑（Popup 打开后用户仍可能自己开了站点标签页，此时切过去比再开一个更符合预期），确实一个都没有时才 `chrome.tabs.create` 新建站点入口页（`SITE_REGISTRATION.homeUrl`，当前为 `https://vimeo.com/watch`——该页对未登录访客直接可访问，不重定向到登录页）。跳转不关闭 Popup，也不就地重绑目标 tab——用户跳到 Vimeo 后重开 Popup，`onMounted` 会重新固定。

`ensureSupportedTabOpen` 的合同不变（找不到返回 `null`、绝不新建）：它的调用方依赖这个语义呈现未连接态，若由它自动新建，未连接态就再也无法出现。因此新建只发生在 `openSiteTab` 这条显式用户意图的路径上。

`chrome.tabs.create` / `chrome.tabs.update` 属于不需要任何权限即可调用的 tabs 能力（`tabs` 权限只影响 `url` / `title` / `favIconUrl` / `pendingUrl` 四个敏感属性的可读性，见 §3），本特性**不新增任何 Chrome 权限**：`manifest` 的 `permissions` 仍是 `storage` / `identity` / `downloads`。

### 12.3 当前视频判定与多视频选择器

content 的 Vimeo 缓存按视频分组持有资源(见 §11):播放页走 `replaceSnapshot` 单视频快照,身份缺失的聚合页走回退通道(§5.2)按视频合并,页面面板仍只渲染有身份的那个视频。popup 通过 `getResources` 读取当前 tab 全部资源与必填的 `videoGroups: VideoGroupSummary[]`——「分组键(= videoId) + 组展示元数据(标题/作者/时长/封面)」的数组,顺序与缓存组序一致(播放页是单视频快照;聚合页即捕获先后);`title` 缺失时为空串,只有元数据、没有任何资源的组也在列。组元数据是展示层的权威来源(config 原值),资源自身字段只在组元数据缺失时逐字段兜底。

`buildDetectedVideos`(popup 纯派生)把两者合成按序的视频展示列表:`videoGroups` 决定组序与展示元数据,资源按 `messageId`(= videoId)对号入座,popup 层不重排——同一行的档位只来自同一个视频。两条边界:零资源组跳过(只有 config 元数据、没有可下载档位的视频不进列表、不计入检测数,保证列出的每个视频都至少有一个档位可下);游离资源并入(扩展更新后旧 content script 未带组元数据时,资源按出现顺序追加成组,元数据从资源自身字段派生)。标题兜底链:组标题 → 资源标题 → 文件名 → videoId,最终不会是空串。

- 单视频(播放页常态):选择器不渲染,布局与单视频页面一致。
- 多视频(聚合页):视频信息区上方出现选择器——检测数量说明(`videoPanel.detectedCount`,`{count}` 插值)与视频选择器(`VideoSelector.vue`:combobox 触发按钮 + listbox 浮层,焦点始终留在触发按钮,高亮项经 `aria-activedescendant` 通告,`videoPanel.videoSwitcherLabel` 作可访问名)。列表项带小封面与标题(封面缺失时占位块);默认选中第一项,资源刷新后保留仍存在的选择,选择失效时回到第一项;切换后视频信息、四行档位、音轨开关与时间裁剪联动,且不携带上一个视频的瞬态(封面加载失败状态复位、裁剪输入清空)。
- `getResources` 响应上限从 768KiB 放宽到 1.5MiB(1572864 字节),按上限组合定容:16 视频 × 约 30 条 × 2.7KB ≈ 1.3MB(实测 8 视频 113 条约 305KB),组元数据随每条资源多带约 0.25KB、最坏再加 16 × 30 × 0.25KB ≈ 120KB,合计约 1.42MB;`videoGroups` 本身仅 16 组约 3KB。取 1.5MiB 覆盖并留余量。

### 12.4 视频信息区

信息区以信息卡呈现：左侧 168×94 封面、右侧标题/作者/时长，卡片化布局与配色走 `DESIGN_TOKENS`（见 §12.9）。

| 元素 | 口径 |
| --- | --- |
| 封面 | 组元数据 `videoGroups[].thumbnailUrl`（来自校验链 config，见 §11）；缺失时回退 Image 档位资源的图片地址；两者皆缺或加载失败时显示占位图标，不改变布局 |
| 标题 | `videoGroups[].title`（config `video.title` 原值，见 §5.3）；组元数据缺失时逐级回退资源 `title` → 文件名 → videoId（见 §12.3 标题兜底链） |
| 作者 | `videoGroups[].author`（config `video.owner.name`）；组元数据缺失时回退资源 `author`；站点没给时整行不渲染 |
| 时长 | `videoGroups[].durationSeconds`（config `video.duration`），用共享格式化器渲染成 `m:ss` / `h:mm:ss`；组元数据缺失时回退资源 `duration`；站点没给时整行不渲染 |
| 副标题 | 当前选中档位的标签；文件大小已并入档位标签（见 §12.5） |

作者与时长只取自 config 的显式字段，缺失就不渲染，不用文件名等间接数据冒充。

### 12.5 四行档位

- 行与资源类型一一对应（Video / Audio / Subtitle / Image），与页面按钮面板共用同一批资源和同一批类型词条；行标签、下拉的可访问名称都走 i18n。
- 每行是「行标签 + `<select>` 档位下拉 + 行内下载按钮」；Image 行只有一个固定档位，用静态文本 `JPG` 替代下拉（封面固定交付 jpg，格式名属于技术标识，不进词条表）。
- 档位标签在拿到真实字节数时追加 ` · {格式化大小}`：progressive 用 config 的 `size`，DASH 用 init segment + 各 media segment 的字节和，任一 segment 缺 `size` 就整条不显示大小，不用码率估算顶替；页面按钮面板保持纯标签，不追加大小。
- 默认选中该行第一项（`Best` / `Best Audio` / 首个字幕语言 / 缩略图）；资源刷新后保留仍存在的选择，否则回到第一项。
- 某行没有可用档位（如没有字幕）时，下拉禁用并显示 `videoPanel.unavailable`，行内下载按钮禁用。
- Video 行的音轨是**独立开关**（`videoPanel.audioSwitch.*`：`label` 是可访问名称，`withAudio` / `withoutAudio` 是两个状态文案），画质仍由下拉选。同一条 video track 的 `dash:{trackId}` 与 `dash:{trackId}:no-audio` 仍是两个独立资源、两个独立 ID（身份规则不变，见 §11），只是在 Popup 的下拉里并成一条画质档位，由开关二选一。页面按钮面板是平铺按钮模型（没有行内开关的渲染位），带音轨 / 无音轨各是一个按钮；两处共享同一批资源与同一身份规则，只是呈现方式不同。
- 开关的可用性由当前画质决定：两个变体都在时才可切换；只有纯视频交付时（playlist 本来就没有音轨、视频 + 音频合计超限）锁在「无音轨」并禁用，只有带音轨交付时（progressive / HLS 直链自带音轨）锁在「有音轨」并禁用。开关态只活在 Popup 组件内，与行内选中态同级，不写存储。
- 档位标签随开关取**实际交付**那一条资源：切到「无音轨」时下拉、信息区副标题与行内下载按钮的可访问名一起换成无音轨资源的标签（含它自己的大小，两个变体大小不同）。`Best` 没有对应的 `best:no-audio` 资源，它的无音轨交付落到最高画质的纯视频档，标签同样跟着那条资源走。
- 英文词标签（`Best` / `Best Audio` / `(no audio)` / `Thumbnail`）由 media 层在 descriptor 里给出 i18n 词条键（§11 的 `labelKey/labelParams`），UI 只负责翻译；`1080p HD`、`720p MP4`、`128 kbps` 这类数字加单位的技术标识不带词条键。
- 行内下载按钮点击后只下载该行当前选中的那一个档位，不做批量。

### 12.6 时间裁剪

- 起点/终点为秒、相对媒体起点；区间合法（起点 ≥ 0、终点 > 起点，且两个秒数都能写成 `:clip:` 后缀认的十进制文本）才生效，未填或不合法时按整片下载——`1e-7` 这类指数记法属于不合法。
- 可用性由 Video 行当前档位决定：只有 `dash` / `hls` 交付能按 packet 取区间。progressive 档位禁用输入并在面板上说明原因（`videoPanel.clip.unsupported`），可用时展示区间只对 DASH/HLS 生效的说明（`videoPanel.clip.hint`）。
- 生效后 Video / Audio 行的下载调用 `applyVimeoTimeRange`，身份与文件名带 `:clip:{start}-{end}`；Subtitle / Image 行不参与裁剪，始终整片下载。无音轨档位同样可裁剪，身份形如 `dash:{trackId}:no-audio:clip:{start}-{end}`——`:no-audio` 段在内、`:clip:` 追加在最后，去后缀仍能定位回那条纯视频档位。
- 片段不写进缓存：popup 只发送片段资源 ID，content 侧 `VimeoResourceBuffer.getResource` 命中不到时去掉 `:clip:` 后缀取回全片档位，再用同一份 `applyVimeoTimeRange` 还原区间；两条路径用同一个函数，身份完全一致。

### 12.7 保存位置

- 面板底部一行「保存位置（`videoPanel.savePath.label`）+ 文本输入」，值持久化在 `chrome.storage.local` 的 `settings.downloadPath`（既有 `SettingsManager`，不新建存储层）；默认值 `vimeo-video-downloader`，输入变化在 `change` 时写回，不逐按键写。
- 存的是**下载目录下的相对子目录**，不存绝对路径。归一化与合法性判定只在真正调用 `chrome.downloads.download` 的 background（`BrowserDownloadService`）做一次：Popup 只负责显示与保存原始输入，不复制一份校验规则。目录段丢弃规则与文件名清洗见 §8.1。
- 作用范围只有 `isBrowserManagedSourceKind` 的交付（Progressive MP4 / 封面 / 字幕）。DASH/HLS 走页面内 mux 后的 `anchor.download`（§8.2、§8.3），MAIN world 没有 `chrome.*`，不经这条路径，始终落浏览器默认下载目录；默认选中的 `Best` 通常是 DASH，因此这一项默认不生效。
- 注入面因此收紧而非放开：文件名保持单段（`/` 仍被替换成空格），只有保存子目录允许保留 `/` 作为分隔符，且绝对路径、盘符、`..`、`~`、空段一律丢弃，交给 Chrome 的永远是非空相对路径。

### 12.8 明确不做

- 页面按钮面板的音轨开关：页面面板保持平铺按钮模型，带音轨 / 无音轨仍是两个并列按钮；「下拉画质 + 音轨开关」只做在 Popup 的 Video 行（§12.5），两处身份规则与资源完全一致。
- Audio 行的「不下载音频」：Audio 行只列可下载的音轨，不提供跳过音频的选项（无音轨交付由 Video 行的开关承担）。
- 内嵌任务队列：下载状态与进度仍在顶部入口的浮层里（`downloadStatusStore` 未改动）。
- 批量下载、勾选框、统计头、清空缓存：随批量模型一并删除（`clearBuffer` RPC 失去唯一调用方，已从 content register 移除）。

### 12.9 视觉 token 与新组件

- `core/constants/design.ts` 的 `DESIGN_TOKENS` 只收录 popup 实际消费的 design.md（Geist 亮色）token 子集：灰阶 / accent / 半透明描边、圆角、阴影与焦点环，命名与 design.md 的 token 名一一对应。唯一一处备案补值 `GRAY_1000_HOVER`（实心 gray-1000 填充的 hover 色）：design.md 只给「hover 沿色阶走」的规则而 gray 阶到 1000 为止，取半步提亮 `#323232`，已在 token 注释备案。组件经 `v-bind('DESIGN_TOKENS.*')` 桥接消费，禁止在 scoped CSS 里绕开 token 写裸值；dark 主题是后续独立事项（design.dark.md），不预留双套值。
- `VideoThumb.vue`：信息卡大封面与选择器小封面共用的缩略图组件，只负责「图片 ↔ 占位」兜底——加载失败或缺失时渲染占位图标，不破布局、不出现 broken image；`:key="src"` 让换源时重建 `<img>`，防止切换视频瞬间残留上一张封面；尺寸与圆角由外层 class 控制。
- `VideoSelector.vue`：多视频选择器（§12.3）。原生 `<select>` 无法在选项里渲染封面，改用「触发按钮 + listbox 浮层」的 combobox 模型，列表项带小封面与标题，支持键盘导航，焦点始终留在触发按钮、高亮项经 `aria-activedescendant` 通告，浮层经 `aria-controls` / `aria-expanded` 关联。

## 13. 文件结构

```text
extension/src/platforms/registry.ts                 # 唯一站点(Vimeo)的静态数据源：Manifest 声明 + 站点入口 URL
extension/src/background/services/BrowserDownloadService.ts
extension/src/core/downloadProgress.ts
extension/src/core/content/download/
├── download.ts
├── downloadManager.ts                              # 页面唯一 FIFO 下载管理器
└── browserDownload.ts
extension/src/core/content/services/ResourceBuffer.ts
extension/src/core/constants/design.ts              # Popup 视觉 token(DESIGN_TOKENS,design.md 亮色子集)
extension/src/sites/vimeo/
├── shared.ts                                       # host/CDN 白名单、videoId 提取、descriptor 编解码
├── config.ts                                       # config/playlist 加载与过期刷新
├── media.ts                                        # config/DASH/HLS 解析与资源建模
├── runtimeConfig.ts                                # 可远端覆盖的站点运行参数
├── content/
│   ├── entry.ts
│   ├── index.ts
│   ├── configCaptureClient.ts                      # 捕获点查(含 background 兜底)与聚合页枚举的 content 客户端
│   ├── siteConfig.ts
│   ├── messageHandler.ts
│   ├── frame.ts
│   ├── buttons.ts
│   ├── resourceBuffer.ts
│   └── styles/buttons.css
└── injected/
    ├── entry.ts
    ├── index.ts
    ├── configCapture.ts
    ├── download.ts
    └── mux.ts
```

入口注册:

- `extension/src/sites/vimeo/content/entry.ts`:Vimeo content 业务入口。
- `extension/src/sites/vimeo/injected/entry.ts`:Vimeo MAIN world `document_start` 入口,先安装 config 捕获再发布 RPC ready。
- `extension/src/sites/vimeo/content/frame.ts`:仅在 player frame 发布 videoId identity。
- `extension/src/platforms/registry.ts`:`extension/vite.config.ts` 的 `webExtension({ manifest })` 只消费该纯数据注册表生成 matches、host permissions、content script 入口、`downloads`/`storage`/`identity` permissions 与 CSS web accessible resource；嵌入播放器 frame 使用独立 content script entry 开 `all_frames:true`。
- `extension/src/popup/utils/tabs.ts`:站点 hostname 集合由注册表的 match patterns 派生，不两处维护；`ensureSupportedTabOpen` 只查找不新建，`openSiteTab` 在它之上补「确实没有才新建站点入口页」（§12.2）。
- `extension/src/popup/components/VideoPanel.vue`:Popup 视频面板（未连接引导 / 空状态 / 多视频选择器 / 视频信息卡 / 四行档位 / 时间裁剪 / 保存位置）。
- `extension/src/popup/components/VideoSelector.vue`:多视频选择器(combobox 触发按钮 + listbox 浮层,列表项带小封面与标题,见 §12.3 / §12.9)。
- `extension/src/popup/components/VideoThumb.vue`:封面缩略图(图片 ↔ 占位兜底,信息卡与选择器共用,`:key` 防换源残留)。
- `extension/src/popup/utils/videoPanel.ts`:面板的纯派生逻辑（`buildDetectedVideos` 消费 `videoGroups` 与资源合成检测列表、四行档位、标题与封面兜底链）。

## 14. 验收样本

- 普通 Vimeo 视频页面能在标题区看到 Video / Audio / Subtitle / Image 四行按钮。
- `Best` 等于页面可拿到的最高分辨率;若 adaptive 高于 progressive,走 adaptive mux。
- 多画质 progressive 时,每个画质都直接显示。
- 有 DASH audio 时,Audio 行展示 `Best Audio` 和码率按钮。
- Thumbnail 下载的是 `config.video.thumbs` 最大图。
- 页面 `<video src="blob:...">` 时仍能下载,因为下载源来自 config,不是 video DOM。
- 详情页完整 signed config XHR 被捕获后不再由扩展请求 `/config?h=...`,播放器原响应仍可正常消费。
- 直接打开 `player.vimeo.com/video/{id}` 时能从内嵌 playerConfig 建立资源,不依赖额外 config 请求。
- 同一页面不再每 3 秒产生 config `403`,DOM 重排也不会重复加载 playlist。
- config 过期或 403 时刷新一次 config 后重试。
- 私有/密码/DRM 页面拿不到 config 或加密 segment 时,按钮禁用并提示刷新/权限不足。
- 有 DASH video 时,页面面板的 Video 行同时给出带音轨与 `(no audio)` 两个并列按钮,`Best` 默认是带音轨版本。
- 有 `text_tracks` 时,Subtitle 行按语言展示可下载按钮,下载的是字幕文件本身（WebVTT/TTML/SRT）；没有字幕时该行是禁用占位。
- DASH/HLS 选项带区间时下载的是片段,区间并入 sourceId 与文件名,刷新 signed URL 后仍保留区间；progressive 选项不支持区间。
- Popup 面板展示当前视频的封面、标题与画质，四行档位默认选中第一项；没有字幕时 Subtitle 行禁用，没有缩略图时 Image 行按钮禁用。
- Popup 面板在 Video 行选中 progressive 档位时禁用时间裁剪并说明原因，选中 DASH/HLS 档位后输入区间可下载片段；片段身份与文件名带 `:clip:{start}-{end}`，字幕与封面始终整片下载；关掉音轨开关后片段身份是 `dash:{trackId}:no-audio:clip:{start}-{end}`，缓存按去后缀的基础 ID 还原出纯视频档位。
- Popup 面板 Video 行的下拉只列画质档位，音轨由独立开关切换：关掉后下载的是同画质的纯视频资源，下拉、信息区副标题与下载按钮的可访问名一起换成那条资源的标签（含它自己的大小）；当前画质只有一种交付时（playlist 无音轨、视频合计超限、progressive/HLS 直链）开关禁用并停在唯一可用的那一侧，`Best` 的无音轨交付落到最高画质的纯视频档。
- Popup 面板与页面面板的档位文案随界面语言切换（`Best` 在 zh-CN 下显示 `最佳`），没有档位的行占位按钮读屏名称同样走词条；片段区间输入非法值（起点不小于终点、负数、`1e-7` 这类指数记法）时按整片下载，content 未回查到资源时 Popup 给出下载失败提示，不静默丢弃请求。
- `vimeo.com/watch` 等无身份聚合页:Popup 显示检测数量与视频选择器,列表项为各视频封面与标题,切换后信息区与四行档位联动;页面按钮不渲染;只检测到一个视频时选择器不出现;检测上限 16 个视频,页面稳定后轮播持续供给的新捕获由 3s 重扫跟进,零资源(无可下载档位)的视频不进选择器。
- 身份在聚合页回退轮进行中出现时,在途回退按三处守卫中断(重扫定时器同受身份守卫约束、自然衰减),聚合资源不混入单视频 buffer;聚合页资源按视频分组写入,同一 videoId 每页只编排一次;长驻聚合页组数达 16 后按首并入序淘汰最旧组,badge 随之回落。
- Unit/Integration 覆盖 config 捕获、聚合页枚举回退与按视频合并、回退重扫定时器与有界并发加载、组数上限淘汰、`videoGroups` 组元数据通路（校验链唯一来源、字段补齐、零资源组与游离资源边界）、身份出现守卫、`getResources` 响应限额、四行按钮、Chrome 状态进度、未知长度 `Downloading...`、重复点击锁、一次 signed refresh、adaptive `Best` 保持同 delivery、无音轨交付、字幕建模与白名单、片段区间透传与 packet 级裁剪、Popup 面板档位生成与裁剪调用、音轨开关的画质 × 开关映射与「无音轨 + 片段」组合、缓存按片段 ID 还原资源、刷新片段缺 `text_tracks` 时沿用旧轨、档位词条在 zh-CN 下不回退英文 label、14 个 locale 键集合与占位符对齐、文件名和 URL/MIME 边界。
- 公网 smoke 固定使用 `https://vimeo.com/1196869805?fl=ip&fe=ec`（只提供 DASH 交付的样本），覆盖 injected mux 路径：取样本当前 config 实际给出的 DASH/HLS 选项，不预设 delivery，样本不再提供该交付时带原因 skip；面板缺失或始终给不出选项按真实回归失败处理。`pnpm test:e2e:vimeo` 只运行 `extension-e2e-vimeo-real` 这一个 project。Vimeo 明确返回 Cloudflare 人机验证时标记外部环境阻塞，不误报产品失败；Cloudflare 只能记为环境 skip，不能记为通过。
