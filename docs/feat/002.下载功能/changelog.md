# 002 · 下载功能 — 变更记录

> 记录本域(下载功能)每次文档修改:一行 why + 一行 from→to。

## 2026-09-25 Popup 补齐竞品操作项：直接下载行与剪辑双滑杆

**Why**：竞品 Popup 提供 progressive 直链独立入口、区间滑杆与下载子目录；本插件的保存位置早已落地，但 Video 行仍把 progressive 直链混在合流档位里（音轨开关与裁剪控件对直链无意义），裁剪也只有数字输入、缺「拖一下就掐头去尾」的操作路径。

**From → To**：
- 直接下载行：行分组重构为 Video / 直接下载 / Audio / Subtitle / Image——Video 行只列 DASH/HLS 合流档位（音轨开关语义不变，`Best` 派生自 progressive 时由直接下载行承载），新 direct 行只列 progressive 直链（下拉 + 行内下载，无音轨开关、不参与裁剪，恒全片全音轨），固定在 Video 行之后；当前视频没有 progressive 档位时整行不渲染（与其余行的禁用占位不同）。信息区副标题在 Video 行无档位时回退直接下载行。i18n 新键 `videoPanel.directRow.label`（14 locale）。
- 剪辑双滑杆：新增 `TrimSlider.vue` + `popup/utils/trimSlider.ts`（0.1s 粒度钳制/步进/文本化纯函数），与裁剪数字输入双向绑定同一状态；滑杆上限 = 视频时长（组元数据 `durationSeconds` 优先、资源时长兜底、都没有为 0 禁用）；键盘 ±1s / Shift ±10s / Home / End，双 handle `role="slider"` + aria 完整；交互写回恒为十进制文本，`parseVimeoTimeRange` 约束恒成立；空输入只做显示兜底不回写，「不填 = 整片」不变；`:clip:` 下载链零改动。
- 保存位置：本轮复审确认既有实现（`chrome.storage.local` 持久化 `settings.downloadPath`，popup change 时写入、空值回填默认；background 下载前读设置拼 `{子目录}/{文件名}`，净化集中在 `BrowserDownloadService` 一处）与文档一致，零代码改动。
- 顺手修复：TrimSlider 轨道与 handle 的 pointerdown 过滤非主键（右键按下会先误移 handle 再弹 contextmenu）。
- 已接受限制：直接下载行正向渲染与「落盘子目录生效」因验证环境无 progressive 样本未获真实站点证据（单测覆盖，环境受限非缺陷）。
- 测试：新增 `trim-slider.spec.ts`（9 用例），`video-panel.spec.ts` 补直接下载行归行与双滑杆联动用例；全量 442 通过。
- 文档：同步 `feat.md`（功能范围、Popup 面板小节与验收标准）、`tech-扩展端Vimeo本地下载.md`（§3 / §8.1 / §12.1 / §12.3~§12.7 / §12.9 / §13 / §14）。

## 2026-09-25 badge 改为视频数语义

**Why**：聚合页资源条数大（8 视频实测 115 条），badge 按资源数累计会显示三位数，与 Popup「检测到 N 视频」口径不一致；产品口径是一个视频无论多少档位都算 1。

**From → To**：
- `ResourceBuffer.getCount()`（资源总数）删除，替换为 `getVideoCount()`（非空视频组数——零资源组与 popup 一样不计入）；badge 通知 `notifyUpdate` 改用视频数，`clear()` 日志保留资源数口径。
- 测试：`resource-buffer.spec` badge 断言全部改为视频数口径，新增「同一视频两个档位只计 1」锁定用例；淘汰/清空/页切用例数字不变仅换口径。
- 文档：同步 `tech-扩展端Vimeo本地下载.md` §11 的 badge 语义句。

## 2026-09-25 聚合页检测对齐竞品：上限 16、元数据通路与 Popup 现代化

**Why**：聚合页回退沿用 8 条上限与串行加载，轮播持续供给新捕获却只在挂载窗口枚举一次，长驻聚合页视频组数无上限最终撑破 `getResources` 响应限额让 Popup 读取必败；同时 Popup 视觉与选择器缺封面，未对齐竞品的检测数量与观感。

**From → To**：
- 检测上限 8→16：MAIN world 捕获 LRU（`MAX_CAPTURED_CONFIGS`，超限按捕获序淘汰）、content 枚举截断（`MAX_FALLBACK_VIDEO_IDS`）与同时等待 videoId 数全部对齐 16；枚举响应限额 16KiB→32KiB，`getResources` 响应限额 768KiB→1.5MiB（定容：16 视频 × 约 30 条 × 2.7KB ≈ 1.3MB，组元数据随资源再加约 120KB）。
- 回退重扫定时器：新增 3s 重扫（`scheduleFallbackResweep`）——页面稳定后轮播仍持续向 MAIN world 供给新捕获（实测 74s 累计 15 个）而 DOM 零相关 mutation（实测 80s），枚举只靠挂载窗口跑一次跟不上；重扫持续消费新捕获，身份守卫让定时器自然衰减。
- 回退加载有界并发 4：新增纯函数 `runWithBoundedConcurrency`（Promise 池、`allSettled`、逐视频失败隔离）；16 视频全量枚举串行约 14s 起压到约 4s，单视频检出时延实测平均约 1.9s。
- 视频组数上限：`ResourceBuffer.MAX_VIDEO_GROUPS=16`，`mergeVideoResources` 超限按首并入序淘汰最旧组（资源与元数据一起删）——修复长驻聚合页组数单调增长 → 响应超限 → Popup FETCH_FAILED；淘汰后该视频不进列表，选中保持逻辑自动回落第一项。
- 元数据通路：`parseVimeoConfig` 提取组元数据（标题/作者/时长/封面，封面仅接受 https + `*.vimeocdn.com`）随 `MediaResource.groupMetadata`（transport-only）进 ResourceBuffer，`getResources` 响应新增必填 `videoGroups: VideoGroupSummary[]`（顺序=捕获序，title 缺失为空串，空资源组也在列）；组元数据唯一来源是校验链，不可信枚举通道不产生该结构。
- Popup 现代化：新增 `core/constants/design.ts`（`DESIGN_TOKENS`，与 design.md 逐字符对齐，备案补值 `GRAY_1000_HOVER`）、`VideoThumb.vue`（封面 ↔ 占位兜底，`:key` 防换源残留）、`VideoSelector.vue`（combobox + listbox 封面选择器，键盘 + aria 完整）；`VideoPanel.vue` 信息区重构为 168×94 封面信息卡；`buildDetectedVideos` 消费 `videoGroups`（零资源组跳过不计数，标题兜底链 组标题→资源标题→文件名→videoId）。四行档位/时间裁剪/保存位置/下载逻辑零改动，i18n 零新键。
- 已接受限制：badge 仍为资源数语义（可能三位数）；枚举与点查之间捕获上限淘汰可致单视频最长 12s 空等。
- 文档：同步 `feat.md`（视频选择器/信息卡口径与检测上限验收）、`tech-扩展端Vimeo本地下载.md`（§5 / §5.2 / §11 / §12.3 / §12.4 / 新增 §12.9 / §13 / §14）。

## 2026-09-25 扩展聚合页多视频检测与 Popup 视频选择器

**Why**：`vimeo.com/watch` 等聚合页没有唯一视频身份，Popup 一直是空态——页面预览过的视频明明已捕获原生 config 却无处下载；同时缓存「单视频整体替换」模型承担不了多视频并存。

**From → To**：
- 聚合页回退通道：页面身份四路提取皆空时，content 通过新 EventRpc `listCapturedVimeoConfigs` 枚举 MAIN world 已捕获 config 概要（按捕获序，上限 8，响应体 16KiB；概要只作发现提示，业务数据不采信），逐视频走既有校验链（videoId 一致校验 + URL 白名单）加载资源，按视频合并写入 ResourceBuffer；聚合页不渲染页面按钮，payload 不可信边界与身份校验口径未放宽。
- ResourceBuffer 模型重建：`Map<videoId, Map<resourceId, MediaResource>>`；一等 API `replaceSnapshot`（播放页整页快照替换）与 `mergeVideoResources`（聚合页按视频合并，组内去重 + 来源排序择优），旧 `replaceResources` / `addResources` 删除；播放页行为不变。badge 仍为跨视频资源数语义，聚合页可到三位数。
- Popup：多视频时显示检测数量（`videoPanel.detectedCount`，`{count}` 插值）与视频选择器（`videoPanel.videoSwitcherLabel`，14 locale 已补），切换联动信息区、四行档位与时间裁剪，不携带上一视频瞬态；单视频布局不变。`getResources` 响应上限 256KB → 768KB（实测 8 视频 113 条 305KB，最坏估算约 650KB）。
- 守卫：身份在回退轮进行中出现时，在途循环三处中断（枚举前短路 / 循环体复核 / 写前复核），聚合资源不混入单视频 buffer。
- 已接受限制：回退串行加载首视频延迟约 4-10s；枚举与点查之间 MAIN world 8 条上限淘汰可造成单视频最长 12s 空等（聚合页资源出现慢的成因之一）。
- 文档：同步 `feat.md`（功能范围、Popup 面板节、验收标准）、`tech-扩展端Vimeo本地下载.md`（§2/§3/§5/§11/§12/§13/§14）、`tech-站点适配.md`（§5.1.1、§6 差异矩阵）、`references/index.md` 索引行。

## 2026-09-20 扩展 Popup Video 行改为「画质下拉 + 音轨开关」

**Why**：带音轨与无音轨此前是 Video 行里两个并列的档位，与同画质的带音轨档位只差交付内容，并列出现是重复；改成两个正交控件后，画质选择不再被音轨维度割裂。

**From → To**：
- Video 行：下拉只列画质档位（`Best` + 每条 video track 一条 `dash:{trackId}`），新增音轨开关（有音轨 / 无音轨）；实际下载的资源由「下拉画质 × 开关」共同决定。同一条 video track 的 `dash:{trackId}` 与 `dash:{trackId}:no-audio` 仍是两个独立资源、两个独立 ID，`:no-audio` / `:clip:` 的生成与解析、下载执行与刷新定位一个字符未改，只是在下拉里并成一条。
- 边界：两个变体都在时才可切换；只有纯视频交付时（playlist 无音轨、视频 + 音频合计超限只剩纯视频）锁「无音轨」并禁用，只有带音轨交付时（progressive / HLS 直链自带音轨）锁「有音轨」并禁用。`Best` 没有 `best:no-audio` 资源，其无音轨交付落到最高画质的纯视频档；档位标签（含大小）随开关换成实际交付那条资源的标签，下拉、信息区副标题与下载按钮可访问名三处同值。
- i18n：`I18N_KEYS.VIDEO_PANEL` 新增 `AUDIO_SWITCH_LABEL` / `AUDIO_SWITCH_WITH_AUDIO` / `AUDIO_SWITCH_WITHOUT_AUDIO`，14 语言同步；不复用带画质插值的 `resourceItem.label.videoNoAudio`。
- 契约：音轨开关态只活在 Popup 组件内，不写 `chrome.storage`、不新增 `AppSettings` 字段、不新增权限；`MediaResource` 与 RPC 未改动。
- 文档：同步 `tech-扩展端Vimeo本地下载.md` 的 §12.5 / §12.6 / §12.8 与 `feat.md` 的 Popup 面板小节。页面按钮面板（`sites/vimeo/content/buttons.ts`）保持平铺按钮，不改。

## 2026-09-20 扩展 Popup 补齐元数据、档位大小与保存位置

**Why**：Popup 单视频面板缺四类面板信息——config 里已经捕获到作者与时长却没解析、档位只有画质没有大小、封面行没有格式标识、下载只能落到浏览器下载目录根；同时确认不做音量独立开关（涉及下载身份规则，另议）。

**From → To**：
- 作者与时长：`video.owner.name` / `video.duration` 进入 `VimeoParsedConfig`，经 option 透传到 `MediaResource` 的新字段 `author` 与既有 `duration`（同一视频所有档位一致，`/config/request` 刷新片段缺 `video` 时沿用刷新前值）；信息区新增作者行与时长行，站点没给就整行不渲染，时长用既有 `formatMediaDuration`。
- 档位大小：档位标签在有真实字节数时追加 ` · {格式化大小}`。progressive 补读 config 的 `item.size`；DASH 沿用 init + segment 字节和，缺 segment 字节就不显示。大小不进 i18n（数字加单位的技术标识），也不写进 media 层的 `label` 字面量；页面按钮面板不追加。
- 封面格式标识：封面行静态文本从 `Thumbnail` 词条改为技术标识 `JPG`（封面固定交付 jpg，大写格式名与 `MP4` / `HLS` 同类，不进词条表）；封面词条仍用于下载按钮的可访问名。
- 保存位置：面板底部新增输入行（`videoPanel.savePath.label` / `videoPanel.savePath.placeholder`，14 语言），值存 `chrome.storage.local` 的 `settings.downloadPath`（默认 `vimeo-video-downloader`）；`chrome.downloads.download` 的 `filename` 由 background 拼成 `{保存子目录}/{文件名}`，目录段逐段丢弃绝对路径、盘符、`..`、`~`、空段与保留字符，文件名保持单段。作用范围只有经浏览器原生下载的交付（Progressive / 封面 / 字幕）；DASH/HLS 走页面内 mux 的 `anchor.download`，不受该设置影响。
- 契约与 i18n：`I18N_KEYS.VIDEO_PANEL` 新增 `SAVE_PATH_LABEL` / `SAVE_PATH_PLACEHOLDER`；`MediaResource` 新增 `author` 并同步 `ResourceBuffer` 的同资源比较；`settings.ts` 导出 `DEFAULT_DOWNLOAD_PATH`。
- 本次不做：Video 行的音量独立开关（当时带音轨 / 无音轨是两个并列档位；后由「扩展 Popup Video 行改为『画质下拉 + 音轨开关』」补上，`dash:{trackId}` / `:no-audio` 的身份规则不变）。
- 文档：同步 `tech-扩展端Vimeo本地下载.md` 的 §5.2 / §8.1 / §11 / §12.1 / §12.4 / §12.5，新增 §12.7 保存位置并把原 §12.7 明确不做改为 §12.8。

## 2026-09-20 扩展 Popup 改为单视频面板

**Why**：Popup 原形态是「当前页全资源表格 + 勾选 + 批量下载」，与单平台单视频的实际使用路径不匹配（用户每次只想下当前视频的某一个档位），且表中已无批量入口的调用方。

**From → To**：
- Popup 改为固定 400px 宽的单视频面板：视频信息（封面/标题/画质）→ Video / Audio / Subtitle / Image 四行「档位下拉 + 行内下载」→ 时间裁剪（起止秒，仅 DASH/HLS 可用）→ 空态。删除勾选框、统计头、`Download selected` / `Download all` / `Clear buffer` 与右侧资源表格组件。
- 下载语义：一次只发送面板选中的单个资源；片段由面板 `applyVimeoTimeRange` 生成 `:clip:{start}-{end}` 身份，content 侧缓存按该 ID 还原全片档位后重新套用同一函数，片段不写入缓存。
- i18n：`Best` / `Best Audio` / `(no audio)` / `Thumbnail` 由 media 层在 descriptor 里给出词条键（`labelKey` / `labelParams`），UI 翻译；删除 `resourceList.*` 与 `store.error.batchDownloadFailed` / `clearBufferFailed`，新增 `videoPanel.*` 与 `resourceItem.label.*`。
- 契约：`clearBuffer` RPC 失去唯一调用方，从 content register 与生成客户端移除；`MediaResource` 新增 `title`。
- 文档：`tech-扩展端Vimeo本地下载.md` 新增 §12 Popup 单视频面板并同步 §2.1 / §3 / §4.3 / §11 / §13 / §14；`feat.md` 的「Extension Popup 资源列表」改为「Extension Popup 单视频面板」。

## 2026-09-20 扩展端交付形态扩展：字幕、无音轨视频与片段裁剪

**Why**：Vimeo 单平台可下载的产物不止「带音轨的整片 MP4」——播放器 config 的 `request.text_tracks[]` 本身就是可下载的字幕文件，adaptive playlist 也存在无音轨视频轨，而用户经常只需要一段区间；这三类此前都无处交付。

**From → To**：
- 字幕：新增 Subtitle 行与字幕资源；`text_tracks[]` 每条轨一个候选（语言标识优先 `lang`、缺失用 `label`，展示名优先 `label`），相对地址按 config URL 解析，URL 只放行 `player.vimeo.com/texttrack/*` 与 Vimeo CDN（`isVimeoSubtitleUrl`），按扩展名识别 WebVTT/TTML/SubRip，经 Progressive/Thumbnail 同一条 `chrome.downloads` 通道下载，不参与片段裁剪。
- 无音轨视频：playlist 已无音轨的 DASH video track 不再请求音频分片，标签 `{height}p HD (no audio)`、文件名带 `-no-audio`；descriptor 声明了 audio track 而 playlist 已无该轨时直接失败，不静默降级成无声文件。
- 片段裁剪：区间以秒随描述符传递（`startSeconds` / `endSeconds`），只对 DASH/HLS 生效，在 remux 阶段按 packet 边界完成——视频起点前移到不晚于请求起点的关键帧、音频沿用视频时间基准、终点取第一个不早于请求终点的 packet，起点超出媒体长度时报错。区间并入 option/source id（`:clip:{start}-{end}`）与文件名（`-clip-{start}-{end}s`），signed URL 刷新后按去后缀的同一画质恢复并保留区间；progressive/字幕/封面调用裁剪直接抛错，不产出名字像片段、内容却是全片的文件，片段也不写入资源缓存。
- 边界：直连 URL 白名单按来源分流——字幕可以落在 `player.vimeo.com/texttrack/*`，其它来源仍只认 `*.vimeocdn.com`；background 校验 source kind / 媒体类型 / MIME / descriptor 属于同一资源后才创建原生下载。
- 文档：`tech-扩展端Vimeo本地下载.md` 新增 §6.6 字幕 / §8.4 无音轨视频 / §8.5 片段裁剪，并同步 §2.1 / §5.2 / §7 / §9 / §11；`feat.md` 补上三者的产品口径。

## 2026-09-20 交付形态收口：片段秒数格式、字幕 MIME 与占位按钮文案

**Why**：交付形态扩展审查发现三处交付裂缝——片段 ID 在指数记法下无法在 Popup 与 content 之间回环（用户点了没反应）、字幕响应的 MIME 白名单过窄（CDN 返回 `octet-stream` 会被取消且重试必然重现）、页面面板占位按钮的读屏名称是硬编码英文。

**From → To**：
- 片段秒数：`shared.ts` 用同一份「十进制文本」定义约束构造与解析，`parseVimeoTimeRange` 拒绝指数形式（`String(1e-7)` = `1e-7`）与负数/超范围值，`formatVimeoClipOptionId` 对写不出十进制文本的秒数直接抛错；Popup 侧非法输入仍按既有口径回落整片下载，不再产生 content 侧解析不出的片段身份。
- Popup 下载反馈：`downloadResource` 检查 `accepted`，content 未回查到资源时给出 `store.error.downloadFailed` 提示并打日志，不再静默丢弃。
- 字幕 MIME：`isSubtitleMimeType` 增加 `application/octet-stream` / `binary/octet-stream`（与 `core/injected/downloadValidation.ts` 对 DASH media segment 的既有口径一致）；URL 白名单仍是安全边界。**该风险来自仓内先例而非已确认故障**：本机无外网、未采样 Vimeo 字幕 CDN 的真实响应头。
- i18n 契约：新增 `resourceItem.noOptionAvailable`（参数 `kind`）承载占位按钮的读屏名称；`tests/unit/i18n-locales.spec.ts` 为 14 个 locale 的键集合与插值占位符提供机器检查。

## 2026-09-20 网站端下载完成契约收口到 object_url

**Why**：proxy 下线后 `navigation_url` / `deferred_job` 已无产出方（`DownloadCompletion` 构造点只剩 `response-download.ts`、`client-mux-download.ts`、`direct-download.ts` 三处 object_url），执行器的导航分支、`deferred_job` 抛错分支与 GA4 `web_download_handoff` 都不可达；`isDownloadTransferObserved` 恒真让批量 `allTransfersObserved` 也恒真。

**From → To**：
- `download-completion.ts` 的 `DownloadCompletion` 删除 `navigation_url` / `deferred_job` 两个成员；`download-methods.ts` 的 `DownloadSaveStrategy` 收窄为 `object_url`。
- `workspace-download.ts`：`executeDownloadCompletion` 只剩 object URL 保存动作；删除 `isDownloadTransferObserved`、`allTransfersObserved` 与 `web_download_handoff` 分支，成功埋点统一为 `web_download_success`（批量 `save_strategy` 固定 `object_url`）。
- 测试：`website/tests/module-scripts.test.js` 的 completion 用例更名为只断言 object_url 传输契约（用例数 98 不变）。
- 文档：`tech-下载方法与续传.md` §6 删除两个 kind 的字段行、执行器行为行与 `navigation_url` 约束。

## 2026-09-20 后端 proxy 下载模式契约下线

**Why**：`proxy` 的产出方(TikTok / Telegram Provider、`proxy_bandwidth_limit_service`)已随单平台转型删除，契约层被保留至今；用户明确要求去掉 proxy 下载，后端 `MediaDownloadMode` 收敛为 `direct` / `client_mux`。

**From → To**：
- 契约：`MediaDownloadMode` / `MediaResourceDownloadMode` / 两个 `_SUPPORTED_DOWNLOAD_MODES` 去掉 `proxy`；`MediaResourceDownloadMode` 合并为 contracts 的 `MediaDownloadMode` 单一定义；`MediaSourceResponse.download_mode` 去掉 `default="proxy"` 改为必填。已签发的含 `proxy` token 在 resource / download 两侧验签后即被拒。
- 执行侧：删除 `StreamDownloadResult`、`noop_async_close`、`MediaDownloadResult` 别名、`media_provider_service` 的 stream 包装与 `release_once` 机制（改为 `finally` 归还 active guard）、`media_v2_client` 的 `StreamingResponse` 分支与文件响应头工具。
- 文档：`tech-后端媒体Provider架构.md` §1/§2/§4/§6.2/§8/§9/§10.2 与 `tech-链路与授权.md` §1/§2/§4 的契约、响应规格与流程图按上述改动重写；`tech-站点适配.md` 更新注册项保留理由。新增 `direct` / `client_mux` 之外的 mode 一律在进入 Provider 前拒绝。

## 2026-09-20 网站端 proxy 下载模式下线

**Why**：后端契约已下线 `proxy`，网站端仍保留整条 proxy 实现（runner、注册项、预检 GET fallback、恢复记录的 proxy 授权材料），属于没有产出方的死代码；用户明确要求去掉 proxy 下载。

**From → To**：
- 删除 `website-shared/src/download/scripts/proxy-download.ts`；`DOWNLOAD_METHODS` 只剩 `direct` / `client_mux`；`DownloadMode` 收窄为 `direct | client_mux`（含 `homepage-runtime/mark.ts` 的本地副本）。
- 删除 `DownloadMethodDefinition.storagePreflightFallback` 与 `download-methods.ts` 的两个 proxy 合同；`workspace-download.ts` 的预检失败统一走既有阻断路径（提示 + 插件引导），删除 `web_download_storage_preflight_fallback` 前端埋点常量与上报。
- `media-download-v2.ts` 删除 proxy 流式打开能力（`openProxyResponse` / `openNextProxyResponse` / `refreshProxyAuthorization` / `openProxyNodeResponse`、`ProxyDownloadV2Authorization`、节点标注）；`media-api.ts` 删除 `requestMediaDownloadV2Response`、`buildMediaDownloadV2BrowserUrl` 与节点请求的 `extraHeaders`；`download-range-stream.ts` 删除 `proxy_nodes_exhausted` 原因与 `nodeCount`。
- `download-resume-store.ts` 删除 `ProxyResumeAuthorization` 与相关归一化：`normalizeMode` 不再接受 `proxy`，历史 proxy 记录按既有「记录无效」路径清理（localStorage 键删除 / IndexedDB 记录清除），不做迁移。
- 兜底默认值统一删除而非改默认模式：`media-api.ts` 的 `source.download_mode ?? 'proxy'`、`workspace-download.ts` 的两处埋点 `?? 'proxy'`、`globalClickEvents.ts` 安装按钮 mark 的硬编码 `downloadMode: 'proxy'`。
- 测试：`website/tests/module-scripts.test.js` 101 → 98 条（删除 3 条 proxy 专属用例：browser GET URL 构造、恢复记录持久化 proxy 授权、proxy Continue 复用保存授权；其余 proxy 用例改为 direct 夹具并保留原有非 proxy 断言——存储预检阻断、completion 契约、Range 自动续传预算、下载失败 mark 诊断）。`website/e2e/download-workspace.spec.ts` 98 → 87 条（删除 11 条 proxy 专属用例），其余用例的 mock 从 proxy 流式改为 direct intent + CDN 直链。
- 文档：`tech-下载方法与续传.md` §2/§3/§7/§8.4/§8.5/§9/§10/§11、`tech-前端切换.md`、`tech-下载存储治理.md`、`tech-站点适配.md`、`feat.md`、`tech-Website匿名下载接入.md`、`tech-网站Vimeo匿名解析与客户端合并.md` 的 proxy 现状描述改为「已下线」。

## 2026-09-18 整仓单平台转型：下载域收敛到 Vimeo

**Why**：仓库从 Telegram 多平台转型为单平台 Vimeo Video Downloader，下载域的平台矩阵、Provider 清单、限速链路与插件 E2E 全部需要按代码重写。

**From → To**：
- `tech-站点适配.md`：8 平台矩阵 → 单平台 Vimeo。
- `tech-扩展端Vimeo本地下载.md`：`tgdl-` DOM 前缀 → `vdl-`；固定 768MiB 上限 → 可远端配置的 `muxMaxBytes`（默认 768MiB，`runtimeConfig.ts` 的 `DEFAULT_VIMEO_CONFIG`）；新增运行时配置表；文件树与 e2e 样本改为 DASH 样本 `vimeo.com/1196869805`。
- `tech-速率治理.md`：删除 `ProxyBandwidthLimitService`、`proxy_total_rate_limit_mb_per_second`、`proxy_user_rate_limit_bytes_per_second`、`dl_user_rate_mb_s` 与 TG 客户端上游速率统计；只保留活跃下载并发与客户端速率上报。
- `tech-后端媒体Provider架构.md`：文件树、registry、示例、并发上限（改由已验签 token 携带）全部按代码重写；`ProviderPolicy` 只剩 `active_limited`；删除输出带宽限速章节。
- `tech-链路与授权.md` / `tech-匿名下载授权.md` / `tech-前端切换.md` / `tech-下载方法与续传.md` / `tech-Website匿名下载接入.md`：删除 Telegram 账号引用、`001.节点系统` 死链与「同 IP 共享带宽」验收项。
- `test-插件端e2e.md`：多 platform project（Telegram 12 / Instagram 5 / Vimeo 1）→ 单 project `extension-e2e-vimeo-real`（1 条）；profile 改为 `extension/tests/logs/test-user-data/`；`pnpm test:setup:vimeo`。
- 删除平台专属文档：`tech-扩展端TG扫描.md`、`tech-Telegram大文件与资源元数据.md`、`tech-扩展端X本地下载.md`、`tech-扩展端Instagram本地下载.md`、`tech-扩展端Threads本地下载.md`，以及 TG 专属 plans 003 / 004 / 031 与已随平台下线的 plans。

## 2026-09-10 匿名访客隐藏结果卡 Credits 标签

**Why**:匿名下载不消耗 Credits,结果卡仍展示积分消耗会误导匿名访客。

**From → To**:结果卡下载按钮一律展示 Credits 标签 → 标签只在登录态渲染与展示,匿名访客隐藏;登录态中途切换后按认证状态事件同步既有结果卡的标签可见性,口径记入 `@tech-匿名下载授权.md` §5。

## 2026-09-10 匿名免费总次数用尽改为要求登录

**Why**:排队窗口只让用户等待 300 秒后仍可无限次匿名继续下载,注册转化不受强制;产品改为免费额度(含等待部分)用尽后必须登录。

**From → To**:匿名超过 `dl_anonymous_immediate_count`(2)后每个新资源都返回状态 2 排队等待,可无限次等待下载 → 新增 `dl_anonymous_total_count`(初始 3,不得小于直接放行次数):累计第 1-2 次直接放行,第 3 次返回状态 2 等待,第 4 次起返回状态 3 要求登录,不签发、不计次、不写排重;排重期内重复下载仍直接放行且不重复计次。前端沿用既有状态 2 排队窗口与状态 3 登录弹窗处理,无代码改动;`tech-匿名下载授权.md` 同步判定顺序与验收口径。

## 2026-08-28 Telegram A Document 封面定位配置化

**Why**:A Document 封面候选仍由扫描器内的固定 selector 决定，Telegram 调整预览结构时无法通过统一远端配置恢复；版本检测和旧媒体查看器还保留无生产消费的重复 DOM 模型。

**From → To**:A Document 固定查询 `img, video[poster]` → `aDocumentPreviewSelector` 进入 Telegram DOM 默认值与稀疏覆盖合同；版本判断调用方直接复用唯一 `detectTelegramPageVersion`，删除无调用的 `VersionDetector` 包装及 `MediaViewerExtractor`。

## 2026-08-27 Telegram 统一远端配置

**Why**:新版扩展需要让 Telegram DOM 修复与可调下载参数共享一次 document 初始化配置，并保持内部配置消费简单一致。

**From → To**:新版仅请求旧 `tg-dom` 并由 `SegmentDownloader` 内置固定 200 MiB 阈值 → 新版通过 Background RPC 只请求独立 `tg-config`，在完整包内默认值上分别对 `dom`/`download` 执行 `Object.assign`；content 直接提交 DOM，injected 直接浅覆盖 typed download，同步失败只记录并继续。Telegram `DownloadServices` 显式把生效阈值传给站点无关 core 下载器；旧 `tg-dom` API、RPC、存储与默认 DOM 合同保持不变。

## 2026-08-27 扩展下载队列资源排重

**Why**:同一资源从批内重复项、页面按钮或 Popup 再次提交时会创建多行任务、重复扣额和重复下载；Telegram Sidebar 与 Threads 的资源 ID 还会随聊天或扫描来源产生碰撞和漂移。

**From → To**:共享 `DownloadManager.enqueue` 无条件创建任务 → 当前 document 按 canonical `MediaResource.id` 复用未完成任务：waiting 刷新材料并保持位置，downloading 冻结材料，failed 使用新材料恢复同一任务并尾插；批内重复共享当前 completion，只有新任务记录点击。Sidebar ID 统一为 chat/message/type，Threads 统一为 shortcode/type/position；`downloadBatch` 响应改为 `accepted/count`，分别表示存在成功回查输入及其数量。

## 2026-08-27 OPFS 成功文件限时清理

**Why**:浏览器接收 OPFS File 后若只依赖下次 Telegram 初始化清理，成功临时文件会在当前页面长期占用 origin storage。

**From → To**:成功 OPFS entry 保留到下次初始化 → File/object URL handoff 后由当前任务捕获具体 sink，120 秒后复用 `discard` 只删除自己的 entry；不清目录、不影响其它任务，memory 与既有 1 秒 object URL 释放不变。取消和不可重试失败仍立即清理；页面提前关闭导致 timer 消失时仍由下次初始化清理。浏览器 120 秒仍未落盘允许失败，不新增下载完成监听、持久 timer、后台状态、identity、manifest、UI 或 fallback。

## 2026-08-27 Telegram 页面内分块网络中断持续重试

**Why**:K 版 3,447,563,420 字节真实下载曾在不同 Range index 遇到分块网络 `TypeError`，任务失败会删除已写 OPFS 内容并要求从 0 重来；页面仍存活时应保留当前任务与已完成内容。

**From → To**:可重试分块网络中断可能结束任务 → 网络 `TypeError` 与 408 在同一页面任务和同一 sink 中由各 position 占用自己的并发槽位沿固定 1 秒独立持续重试，整批完成后才推进，已写内容与进度保留且不重复累计；默认活动请求不超过 20。每批局部 AbortController 通过 `AbortSignal.any` 组合用户 signal，non-retryable 或 Cancel 先中止并 drain 同批全部 position，再保留原错误、清理当前 sink 和推进 FIFO。成功与初始化清理、memory sink 合同不变。不增加跨刷新续传、持久 identity、manifest、恢复状态或新 UI。

## 2026-08-27 Telegram A/K 大文件存储与资源元数据

**Why**:A progressive 与 K stream 的大文件分块需要在保持现有页面 Range 路径、FIFO、进度和取消合同的同时避免 Renderer 持有完整文件；A/K 同一 Document 的 identity、文件名、大小、时长和封面需要由稳定 owner 统一提供。

**From → To**:`SegmentDownloader` 完整内存聚合 → 预检后按 200 MiB 固定阈值选择 memory 或 `extension-downloads/` OPFS sink，分块写完即释放，失败/取消删除当前文件，成功与页面关闭残留由下次 Telegram injected 初始化清理；A scanner 使用 document/message/WebPage identity 做 `queryAMediaResources` 只读补元数据，FIFO 队首用 `prepareAMediaResource` 取得真实 Worker 参数；K 只对 size 已知的内部 Document 构造原 stream URL，封面只取当前资源的 img/poster。Popup 资源行同步展示 canonical 文件名、大小、类型、时长和封面。

**验收状态**:全量 unit 除两条范围外旧断言外通过，`pnpm check` 与 production build 通过。Edge 151 真实 A/K 使用同一 3,447,563,420 字节 Document：A/K OPFS 均随进度增长，Renderer 未随文件大小线性增长；A 52% 取消删除当前文件并继续 FIFO，页面中途关闭残留与成功文件均在下次初始化清理。A/K 最终落盘大小均为 3,447,563,420 字节，系统流式 SHA-256 均为 `3c89946e9e2d0c84a011ce8d9a7be674b6639c5ca4e859a70988a9d816c34d26`。K stream 四次在不同 Range 分块发生站点响应错误并正确清理，队列 Retry 后最终成功。

## 2026-08-24 下载速度改用固定采样与 EMA 平滑

**Why**:分块进度事件由完整读取完成触发，20 路并发会让事件成批到达；事件驱动的短时窗口仍会随批次剧烈跳动，而且没有新事件时无法主动衰减或清空陈旧速度。

**From → To**:进度事件到达时计算相邻样本或 3 秒窗口平均 → 事件只记录最新累计字节，全页面唯一的 500ms 定时器对活动任务固定采样；首次积累 1 秒后展示，之后以新观测权重 0.2 的 EMA 平滑，无新增字节时逐步衰减并在连续 3 秒后主动置为未知。时间或累计字节回退时重建基线，任务退出活动状态时清理定时器；快照字段、精确/估算标识和 UI 格式不变。

## 2026-08-21 下载队列交互与能力合同修正

**Why**:真实分块进度会让 Telegram 页面 Widget 重建取消按钮并补偿焦点/滚动，造成首次点击偶发丢失；Popup 外层 RPC 同时错误等待整批终态，取消与指标又依赖目标 URL 推断能力。

**From → To**:Widget 改为稳定 trigger/popover 与按 `taskId` 原位对账行，纯进度不替换按钮或重复查询 Telegram 锚点；Popup `downloadBatch` 完成资源回查和入队后立即返回，后台观察 completion，页面 `downloadMany` 终态语义不变；任务快照增加活动传输中止能力，waiting 本地移除与 active 中止分离，Popup 的取消、取消中、summary 和指标全部由快照驱动。删除未被 server 消费的 timeout 配置与外层 24 小时生成合同，保留 content→MAIN 和 Telegram Worker 两处内层期限，并明确人工取消不能由 timeout 替代。

## 2026-08-21 Telegram 下载管理入口与任务取消

**Why**:页面与 Popup 需要查看同一份未完成 FIFO，并能按唯一任务取消 waiting 或已开始传输的 Telegram 下载；只移除 UI 不能证明真实读取已停止。

**From → To**:各入口只能入队且 Popup 只展示基本进度 → Telegram A/K 页面增加 document 级下载管理 Widget，与 Popup 共用唯一 `DownloadQueueSnapshot`，展示最终文件名、状态、进度、大小和速度；waiting 按 `taskId` 立即移除且不进 quota，active 等待 Blob/Segment abort 或 A Worker `cancelProgress` 的原长调用结束后才推进下一项。

**验收状态**:确定性 Unit/Integration、RPC、生产类型、lint、格式、权限和 production build 已通过。真实 A/K profile 均进入登录页，当前部署 A Worker 取消、真实 waiting/active 取消与后续落盘不记为通过；标准 Telegram E2E 还被范围外的既有 Instagram 产物门禁先行阻断。

## 2026-08-19 Telegram DOM 全局稀疏覆盖

**Why**:Telegram Web A/K 可独立更新 DOM；扩展把活动选择器散落在扫描、按钮、侧栏、Story 与 CSS 中时，单纯 class/id 变化也必须等待插件重新发布。与此同时，线上长期共存多个扩展版本，按版本维护完整配置或严格字段校验会让新增字段反向阻断旧客户端。

**From → To**:活动 Telegram DOM 分散硬编码且只能发版修复 → 后端与 Admin 提供一份全局稀疏对象，扩展在每个 document 打开时与 injected ready 并行读取一次；content 通过 typed RPC 交给 Background 请求公开接口，避免 Telegram 页面上下文直连后端，再用 `Object.assign` 语义直接浅覆盖包内完整默认对象；主消息、A 侧栏、A Story、URL/大小读取和按钮定位统一消费同一运行时配置，静态 CSS 与批量按钮 markup 只依赖插件自有 class。缺少项使用各版本本地默认，多余项由旧客户端自然忽略，同名项直接覆盖；不按版本分组，不上报客户端版本，不做 schema/selector 校验、历史或回滚。

**边界**:首次支持该能力之前的旧扩展无法远端修复；已支持的不同插件版本各自保留包内默认值，只读取自己认识的键。媒体身份语义、资源协议或下载算法变化仍需发布扩展。Admin 编辑入口、后端存储和接口见 `@../008.管理后台/tech-系统设置.md`。

## 2026-08-19 Telegram Web A Story 当前媒体下载入口

**Why**:A 版 Story 通过不改变 URL 的 `#StoryViewer` 全屏弹层展示，也不生成普通消息 `.Message`，主消息扫描、按钮定位和 Sidebar 链路都无法发现当前 Story。

**From → To**:Story 弹层无插件下载入口 → 独立观察 `#StoryViewer.shown`，从当前可见大媒体识别完整图片 Blob 或 video progressive document ID，在媒体右下侧显示唯一 40px 圆形下载按钮；窄屏回退到媒体内部右下角。图片保存当前完整画面，视频恢复 Telegram 上游使用的 `document{id}?download` Worker 原文件引用。Story 切换时按钮原位换绑，关闭即移除；点击、额度、FIFO 队列和瞬时进度继续复用共享下载链路。

**验收状态**:扫描器与 DOM 集成共 5 个定向测试通过，lint、生产 TypeScript、格式、权限、RPC 一致性和生产构建通过；`dist` 已用 headed Chromium 验证 MV3 service worker、Popup 与 Telegram A content script 无启动错误。真实 Telegram A Story 的按钮与落盘文件尚未执行登录态 E2E，因此不声明真实 Story 下载已验收。

## 2026-08-19 兼容 Telegram A 响应式相册布局

**Why**:Telegram A 上游 `Media: Use responsive styling (#7132)` 在 `.Album` 与选择 wrapper 之间新增 `.album-item` 布局层；扫描器仍能识别资源，但 UI 定位器依赖旧直系层级，导致相册复选框和逐媒体圆形按钮全部缺失。

**From → To**:扫描与 UI 注入分别维护相册层级选择器 → 两者共用只依赖 `.Album`、稳定 `album-media-message-*` 身份和 DOM ordinal 的媒体面收集逻辑，自然覆盖更新前后包装结构；A 父按钮不再执行 K 版 `.attachment` 查询。单元测试默认采用最新上游 DOM，并保留旧结构兼容回归。

## 2026-08-18 统一扩展端下载生命周期 SLS 埋点

**Why**:扩展此前只在 Popup 与 Telegram 部分按钮入口记录 `download_click`,其他已发布站点缺失,且没有成功/失败结果事件,无法形成完整下载漏斗。

**From → To**:

- Popup/Telegram 入口分散记录一次点击 → 所有站点统一由共享 `DownloadManager` 按单资源任务记录 `download_click`。
- 下载任务无结果埋点 → 实际下载完成记录 `download_success`;抛错记录 `download_failed`,并携带脱敏前的结构化 `error_name/error_message/resource_type/source_kind` 摘要。
- 批量一次点击只产生一个入口事件 → 批量 N 个资源按 N 个独立任务记录生命周期;额度拒绝记录 `download_quota_insufficient`,不误记为成功或失败。
- 失败摘要不包含媒体 URL、文件名和消息身份;SLS 写入前继续经过统一敏感字段脱敏与 1000 字符限制,上报失败不阻断下载队列。

## 2026-08-12 Telegram A mediaHash 真实下载进度

**Why**:A Document 下载期间 Telegram Worker 持续拉取分块，但插件未开启并消费 Worker 方法回调，页面只能长期显示 0% 后直接完成。

**From → To**:`mediaHash` 下载请求开启 Telegram 原生 `methodCallback`，将 GramJS 的 0-1 分块进度转换为现有页面与 Popup 使用的 0-100 事件；K 与其他下载路径不变。

## 2026-08-11 Telegram A Document DOM 即时入口与点击解析

**Why**:A LocalDb document 可能晚于消息 DOM 到达，扫描阶段等待内部镜像会让 audio、voice 和普通文件的父下载按钮延迟出现。

**From → To**:A 扫描器不再查询 LocalDb；看到 `.Audio` 或 `.File` 即优先生成仅含 `chatId/messageId` 的唯一待解析资源，让现有 ResourceBuffer 和父按钮立即工作。页面与 Popup 仍同步进入原 FIFO，仅当前项符合 A 主消息 placeholder 四字段合同时才调用一次 `getAMediaResources`，完整替换为真实 document 参数后下载；仍取不到时输出身份、响应数量和缺失字段并让用户重试。Sidebar、K 与其他资源原样通过，主消息扫描周期保持 3 秒。

## 2026-08-11 Telegram 通用 Document 下载合同修正

**Why**:通用 `document` 校验会因响应 MIME 缺失或与声明不一致而拒绝原文件，下载 RPC parser 丢弃 `documentId/codec`，文件名清理还会改写合法空格，导致“原 document”下载、字段和文件名合同不完整。

**From → To**:所有 `document` 都允许 Worker 返回 HTML，并直接保存其 Blob，不再因缺失、未知或不匹配的 MIME 拒绝；`documentId/codec` 在 content → injected JSON parser 显式校验并透传；canonical filename 保留合法内部空格与 Unicode，只清理跨平台禁用字符、危险首尾边界和 Windows 设备名。删除 Document MIME 防御及对应单元测试。

**验收状态**:聚焦单元测试已通过；真实 Telegram Document 扫描、下载及 A 相册回归仍等待登录 profile 恢复后执行，本条不提升真实 E2E 状态。

## 2026-08-11 Telegram A 主消息完整 Document 实现完成，待真实验收

**Why**:A 版主消息扫描过去依赖可见图片或视频 URL，未播放的语音、音频和普通文件没有稳定入口，也可能把封面或临时媒体当作原文件。

**From → To**:实现层新增按聊天和消息身份关联 Telegram 原始 document 的能力，覆盖 round、GIF、voice、audio、video、文件图片和普通 document；语音、音频和普通文件使用消息父下载按钮，视觉媒体沿用现有圆形入口。A 主消息扫描只按 DOM 建立入口，`.Audio/.File` 点击时再获取原文件参数；每条消息只选择一个主 document，未知 MIME 无原文件名时回退 `.bin`。Worker 失败、异常响应和超时统一清理请求并输出脱敏的阶段日志。

**验收状态**:单元测试、RPC 合同检查、类型检查、lint 和构建已通过；固定频道 `message 18/19` 初探尚未出现下载按钮，真实 Document 扫描与下载 E2E 尚未通过，因此本条不声明用户能力已验收。

## 2026-07-16 proxy 存储预检失败自动改走浏览器 GET

**Why**:proxy POST 需要先把响应流写入 Website origin storage,低配额或 OPFS 不可写会在授权前阻断;后端已经具备浏览器原生 GET 下载能力,该路径可直接写系统下载目录而不占用 origin storage。

**From → To**:proxy 存储预检失败后提示插件并终止 → proxy POST 方法声明完整 browser GET fallback,预检失败时 action plan 原子切换到 `navigation_url + sessionPolicy=none` 后继续授权和下载;direct/client_mux 继续阻断。新增独立 fallback 埋点和管理后台状态,避免把已转交 GET 的下载记为阻断。

## 2026-07-16 修复首页插件 Logo 的 LCP 加载优先级

**Why**:首页默认可见的 Chrome 插件 Logo 被复用组件统一标记为懒加载,虽然初始 HTML 已可发现该资源,Lighthouse 仍会延后 LCP 请求且提示缺少高请求优先级。

**From → To**:插件 Logo 无论区块是否首屏可见都统一懒加载,且导航更早以默认优先级请求同一张 Chrome Logo → 首页导航与默认可见的 Chrome Logo 均声明高请求优先级,Chrome/Edge 卡片 Logo 立即加载;其他默认隐藏的复用页继续懒加载,两张卡片 Logo 同时声明稳定的 `50×50` 布局尺寸。

## 2026-07-15 Telegram A/K 主消息增加逐媒体悬浮下载入口

**Why**:Telegram 主聊天区只有父消息批量按钮和相册复选框,用户要下载单张图片或单个视频时必须先调整选择;A 相册资源还统一沿用父消息 ID,无法让每格入口按真实子消息身份稳定绑定。

**From → To**:A 相册资源保留普通相册子消息身份并用 DOM ordinal 处理付费照片后缀/付费视频重复 ID,资源 ID 同时包含 chatId;K 相册沿用每格 `data-mid/data-peer-id`。A/K 单媒体在视觉宿主注入 36px 圆钮,相册则统一放入消息内容的不裁切 control layer,按复选框实测矩形与其中心线对齐并固定在正上方;`64×64`、`113×41` 等超小格也不改成横排或裁掉按钮。桌面 hover/focus 显示、触屏常显、下载中展示瞬时进度;DOM 重建时按稳定资源身份恢复,静止指针下重绑会按实际命中格恢复 hover。真实 A/K E2E 点击消息 13 圆钮并验证非空视频落盘。

**Lifecycle 收尾**:K 扫描与父按钮定位从全局 DOM 查询改为只接受 `.chat.tabs-tab.active`，并按 `mid + peer-id` 隔离隐藏聊天；父批量按钮从 `is_injected/data-tg-dl-injected` 一次性注入改为每轮 DOM reconcile，容器被局部删除后重建并恢复 busy/progress；A 普通相册在 ordinal/type 之外校验子消息 DOM ID，同类型格换序时跳过本轮，付费照片后缀和付费视频重复 ID 继续支持。

## 2026-07-15 扩展下载入口统一为页面单例 FIFO

**Why**:扩展各次 `downloadOne/downloadMany` 调用分别执行自己的循环，重复点击可能同时启动多条下载；Popup 也无法回答当前有多少任务、哪项正在下载和哪些项正在等待。

**From → To**:各调用方独立顺序执行、Popup 无下载状态 → 每个 content 页面由一个模块级下载管理器持有唯一 FIFO，页面按钮与 Popup 单项/批量只入队，唯一 worker 立即逐项排空且并发固定为 1；Popup 顶部显示下载中数量与当前进度，点击按下载中/等待中分组查看，关闭重开可从同一页面恢复未完成快照，完成/失败或页面销毁后不保留历史。

## 2026-07-15 Vimeo 直连文件改由 Chrome 下载管理器持有

**Why**:Vimeo Progressive MP4 可能很大，页面内 `fetch -> Blob -> a.click()` 同时占用页面内存并绑定当前文档生命周期；跳转、刷新或关闭来源 tab 会取消尚未完成的读取。

**From → To**:Progressive/Thumbnail 从 injected Blob 下载改为 content 分流、background 校验并调用 `chrome.downloads.download()`；页面存活时查询 Chrome 字节进度，页面销毁后任务继续，signed URL 重试只刷新完整文件列表、不加载无关 adaptive playlist。DASH/HLS 仍在 injected 下载分片并 remux；真实 Vimeo E2E 固定验证 CDN URL、任务创建后跳页及最终落盘。

## 2026-07-14 修复扩展端 X GIF-like 视频发现

**Why**:X 将 `animated_gif` 转码为 `/tweet_video/{mediaKey}.mp4`，其媒体键为字母数字且直接位于文件名；旧解析只接受数字目录 ID，同时 Performance fallback 只补捞 HLS，导致 GIF-like MP4 在资源缓存和页面入口中消失。

**From → To**:普通视频、HLS、GIF-like 共用“媒体身份”关联但按各自 CDN 路径严格解析；新增 `tweet_video` 与 `tweet_video_thumb` 共享媒体键、直接媒体响应与 Performance Resource Timing 补捞，仍保存为 MP4，并补齐 JSON、DOM、资源时序和直接响应回归测试。

## 2026-07-14 删除插件受控 E2E

**Why**:受控 HTML、假站点数据和假媒体只能证明内部 fixture 与实现一致，不能证明扩展在真实站点上找到了正确媒体、把按钮放在正确位置并下载了正确文件；默认全量还会先展示假页面，并有 UI 用例真实打开正式官网 Pricing 的错误边界。

**From → To**:默认 `pnpm test` 混合 53 条 UI/controlled E2E 与 6 条真实 Telegram → 删除 UI/controlled project、spec、站点 harness 和通用 API mock，默认只串行发现 Telegram 6 条、Instagram 5 条、Vimeo 1 条真实 E2E；三站 DOM、结构化数据、媒体和下载保持真实，只固定 quota check 与 SLS sink，Unit/Integration 继续承担纯逻辑和异常分支。

## 2026-07-13 收敛真实 E2E 浏览器身份

**Why**:真实 Telegram、Instagram、Vimeo 与 website parse/download smoke 会直接访问第三方页面或 CDN；默认 Playwright 浏览器暴露 `HeadlessChrome`、`navigator.webdriver=true`、`--enable-automation`，且 device descriptor UA 可能与运行中浏览器 Client Hints/平台冲突。

**From → To**:各项目独立使用 Playwright 默认 browser/device 身份 → `scripts/playwright-browser-identity.mjs` 统一两类真实可运行策略：website/admin 使用稳定版 Google Chrome hardened headless、实际主版本 UA 与每 spec 身份 hook，extension 使用支持 unpacked MV3 的完整 Chromium hardened headed；新增四类浏览器与移动端身份门禁，明确只消除已知自曝字段、不承诺绕过第三方 WAF。

## 2026-07-13 Instagram 后端解析接入节点 Cookie 池

**Why**:匿名 Instagram 的 Reel/Post、图片 SSR 与 Story SSR/Relay 都可能命中登录墙,需要消费节点本地 Cookie,并与 X 共用一套可维护的池模型。

**From → To**:X 专用 Cookie 基础设施 → `media_cookie_pool.py` 通用双平台池;Instagram 从纯匿名解析 → 匿名优先、启用 Cookie 随机逐条重跑完整解析路径,SSR Cookie 仅绑定 `.instagram.com`,全部失败保留首次匿名错误;X 既有游客 Playwright 兜底不变。

## 2026-07-13 完成 Instagram 固定页面真实 E2E

**Why**:真实 Instagram 暴露了受控 fixture 没覆盖的三类事实：blob Story 的 DOM 没有 media ID，Profile Reels permalink 正文没有原媒体结构，Home `/p/` 视频与 Reel 一样存在独立全屏交互层；必须用真实登录态、真实 DOM 和真实下载副作用闭环验证。

**From → To**:

- 真实 Instagram 只有未执行 Canary/布局检查 → 增加专用持久化 profile 与 setup 入口，唯一 `pnpm test:e2e:instagram` 串行覆盖 Home current/all/Story、固定 Post/Reel current/all、`twilight/` 与 `twilight/reels/` Grid。
- owner-only Story 只依赖 URL `ig_cache_key` → blob 媒体缺 DOM 身份时，由 MAIN world 有界读取当前 viewer React media ID 并标记回同一媒体节点；冲突身份、账号 pk 和媒体 URL 不跨 RPC。
- Grid 只按 `capture -> embedded -> permalink` 解析 → 目标 tile 从 React props 取得同 shortcode 的数值 pk，content 请求同源 media-info JSON；失败再回落 permalink，页面切换后的异步结果直接丢弃。
- 视频按钮舞台只覆盖 Reel 路由 → `/p/` 视频与 Reel 统一寻找媒体分支和原生交互层的最近共同舞台，按钮滚动进 viewport 后必须通过真实 pointer hit。
- 下载测试只等待单一状态且网络响应可能混入页面后台流 → download 事件与按钮会话竞速，配额调用后才捕获 CDN 响应；落盘文件逐字节匹配响应，配额次数等于文件数，失败输出按钮、stacking context 和扩展错误。
- Feed 虚拟化 article 暂未挂载媒体被重复记为错误 → 动态挂载缺失统一记 debug，最终按钮缺失和所有 resolver 来源失败仍作为可定位错误。

**已验证**：全量 Unit/Integration 61 个文件、473 个测试通过；`pnpm check`、RPC 生成检查、production build 通过；fresh build 后 `pnpm test:e2e:instagram` 真实固定流程 4/4 通过，所有下载入口均完成非空落盘、MIME/后缀检查和 CDN 字节一致性校验。

## 2026-07-12 恢复 Instagram 全页面当前项按钮与下载进度

**Why**:Instagram 真实 Post 详情不一定包含 `article`，Story owner-only 路由也不一定有测试属性；同时 Home 图片按钮被 hover 样式隐藏、视频按钮覆盖声音开关，点击后没有进度反馈，导致用户看到缺按钮或点击无反应。

**From → To**:

- 详情只从 `article` 找当前帖 → 由匹配当前内容的 permalink 与正文尺寸媒体共同证明归属；原生 action row 只作为“下载全部”的可选锚点，缺少时仍保留媒体 surface 的当前项按钮。
- Carousel 序号混入评论头像等非正文图片 → 只按合理尺寸正文媒体的原始相对 DOM 顺序计算，头像、评论小图不占序号，related grid 不进入当前帖。
- Story 只接受路由或 `data-*` media ID → owner-only Story 可从当前大媒体 Instagram CDN URL 的 `ig_cache_key` 解出纯数字 ID；小头像、冲突证据和无精确证据仍不注入按钮，URL 不作为下载源。
- Home 图片 current 仅 hover 出现且所有媒体 bottom=10px → 页面媒体与 Grid 按钮常显，图片/Grid 保持 10px，视频 bottom=60px，相对图片向上避让 50px 且不挡声音开关；Home 图片/视频、详情/Carousel、Reels、Story/Highlight 提供当前项入口，Grid 保留适用的卡片直接下载入口。
- Instagram 点击无反馈 → 点击同步显示 `…`，已知长度显示 0-99%、批量显示当前项序号，浏览器保存触发后报告 100 并恢复；短命 UI 事件不参与额度或完成判定，重复点击不禁用且仍独立扣额/下载。
- 受控 fixture 依赖理想化 DOM → 增加无 `article` 详情、owner-only Story、大/小媒体身份、Home 图片/视频位置和两阶段分块真实文件验证。

**已验证**：相关 Vitest 4 个文件、62 个测试通过；fresh build 后 Instagram controlled E2E 20/20、production build 通过。

## 2026-07-12 增加 X 页面下载进度与受控 E2E

**Why**:X 页面已有本地图片/MP4/HLS 下载，但页面按钮下载期间没有可见反馈，用户无法判断是否正在执行，也可能重复点击；旧 X tech 同时保留“不支持 HLS”和 TG 品牌按钮等过时口径。

**From → To**:

- X 页面按钮可重复点击且无进度 → 同 tweet 媒体/action 入口共同禁用，当前媒体显示 `50%` 或 `…`，action 批量显示 `1/2 50%`；不同 tweet 可并发。
- 网络读取完成直接等同完成或按 HLS segment 估算 → 已知 `Content-Length` 使用 floor 字节进度且保存前最高 99，未知长度/HLS 始终 `…`，`a.download.click()` 后才报告 100。
- 每资源历史 Map/aggregate 百分比 → 每 tweet 只保存当前资源、当前进度与发起 route key；单项失败立即恢复，批量局部失败时保持锁定并继续，全部项处理后恢复。
- X 技术文档旧 MP4-only/TG 徽标/旧权限和目录 → 重写为现行 DOM + 有限 network capture + MP4 优先/HLS remux + 固定 EventRpc + 纯下载图标合同。
- 只有 X Unit 回归 → 新增真实 unpacked extension 的受控 X E2E 设计，以两块 stream 固定 50% 并验证下载文件、禁用态、并发与局部失败。

**已验证**：X 定向 Unit 20/20、Telegram + X 共享出口回归 42/42、全量 Unit/Integration 432/432、X controlled E2E 3/3、完整 UI E2E 27/27 通过；覆盖率四项为 84.15% / 81.30% / 84.54% / 84.15%，`pnpm check`、RPC 生成检查、production build 与 `dev:extension` 启动通过。默认 `pnpm dev` 的 development build 成功，但当前 Edge CDP reload 连接超时，未把该环境项记为通过。

## 2026-07-12 恢复 Telegram 主消息按钮瞬时进度

**Why**:删除 Scheduler/Queue/DownloadStateManager 时误把用户可见的单次下载百分比一并删除；业务状态机属于过度设计，但当前下载的瞬时反馈是必要交互。

**From → To**:

- 主消息按钮下载期间始终停留在选择数文案 → Segment/Blob 分块报告百分比，A `mediaHash` 报告 0%/100%，按钮显示“剩余数 + 当前百分比”并在调用结束后恢复。
- 动态 task 事件 + Scheduler listener + 全局状态聚合 → 一个固定、非可信、仅改按钮文字的 DOM 事件；不进入 Popup，不参与额度、去重、完成判定或权限操作。
- 完整下载 EventRpc 固定 30 秒 → 24 小时页面生命周期级超时；避免 timeout 后 MAIN 仍下载而 content 提前进入下一项，真正卡住时用户刷新。
- 受控 Telegram 只验证扫描、Popup/sidebar → 新增 K `/k/stream` 原文件 route 与 unpacked-extension 主按钮进度/真实文件 E2E。

## 2026-07-11 完成 Instagram 插件端简单架构收口

**Why**:Plans 008-016 已把 Instagram 与共享下载落到一条简单生产路径，活跃文档和少量无引用查询 API 仍停留在目标期或旧状态模型，会继续诱导后续修改接回平行缓存、Scheduler 和下载状态。

**From → To**:

- DOM thumbnail/`srcset`/poster/背景图主资源、Instagram `ResourceBuffer`/平行 handler、owner 猜 Story、详情推荐吸收 → `PageContext -> routeMediaStore Map -> parser/resolver -> buttons/Popup`，DOM 只证明实体和挂载位置。
- 站点额度、Scheduler/Queue、busy 过滤、Popup 状态订阅、injected batch/progress/cancel → 每项 `downloadOne`，批量仅顺序 `downloadMany`，额度异常 fail-open，重复点击独立执行。
- 动态握手/early 与多站 stub → 固定不可信 EventRpc、站点自有 handler、完整 `downloadMedia` request-response；MAIN 无 Chrome/storage/token/额度能力。
- Instagram 旧文件和无引用 Map getter、下载器公开状态查询、旧统一入口与未挂载的 Popup `LoginModal.vue` → 删除；Telegram 实际使用的 Worker、Blob、Range 和 sidebar 算法保留，登录按钮改按现有事实只走官网统一登录。
- Threads/Vimeo → 明确 `disabled-unverified`，代码保留但不进入生产 Manifest。
- 验证记录 → Unit/Integration 56 个文件、425 个测试，固定 EventRpc/五站边界定向 91、完整受控 UI 23/23、Instagram controlled 17/17（含无 embedded JSON 的真实 network capture 与同 document Post → Profile Grid → Story SPA）、Chrome RPC caller 4/4、`rpc-generate:check`/check/fresh build 已通过；真实 A/K 全链路不虚报通过，Instagram Canary 因没有显式样本环境变量未执行。

## 2026-07-10 将扩展端共享下载收敛为逐项直调

**Why**:普通插件下载允许单项失败后由用户重试；把 Instagram 接入扩成任务身份、预留、异步终态、取消和跨 Popup 恢复会显著增加共享层复杂度，并提高 Telegram 回归风险。

**From → To**:

- `requestId/resourceId/taskId`、reservation、task snapshot/revision 和重放语义 → 上层顺序 `for...of` 调用 `downloadOne(resource)`，不保存跨点击或跨生命周期任务状态。
- `startDownload + outcome + cancelDownload` → 每项扣额后只发起一次覆盖实际下载的完整 `downloadMedia` request-response。
- 整批额度受理 → 每项独立 `checkAndConsume(1)`；明确不足只跳过当前项，额度服务异常记录后 fail-open，单项下载错误记录后继续。
- 动态 EventRpc 握手和多 provider 生命周期 → 固定 DOM event channel、基础 allowlist/schema/payload 校验和站点相关 handler；DOM 可观察、伪造与干扰风险明确接受。
- Popup 状态订阅与恢复 → 打开、刷新或重开时只查询当前 tab；Telegram 批量确认仍在逐项循环之前，既有解析、扫描和 sidebar 行为不变。

## 2026-07-10 增加默认关闭的 Website proxy 浏览器 GET 下载能力

**Why**:浏览器原生 GET 直接写下载目录,不需要 origin storage 预检;原实现分别硬编码 runner、下载策略和预检,关闭单个布尔值会形成 POST 流式下载却不预检且不可恢复的错误组合。

**From → To**:

- `download-methods.ts` 成为唯一模式合同源;线上 `PROXY_BROWSER_GET_DOWNLOAD_ENABLED=false`,proxy 使用 POST + object URL + byte resume + storage preflight。
- GET runner、`navigation_url`、无恢复和跳过 storage preflight 作为一套休眠合同,只能由同一编译期开关整体启用。
- GET 原生导航使用新窗口 handoff;因响应不可观测,只记录 start/handoff,不虚报下载成功或已命中节点。
- 后端保留同路径 GET token 入口并复用 POST 执行流程,默认 Website 不调用;前后端能力一起发布。

## 2026-07-10 制定扩展端 Instagram 媒体架构重构规格

**Why**:Instagram 插件端把 DOM thumbnail/Reel cover 与原媒体放在同一 `MediaResource` 流程,并用隐式路由和全局缓存承担 SPA、Story、Profile Grid、Popup 与下载任务职责,导致局部修改容易破坏其他页面;共享 Scheduler/RPC 问题又会影响 Telegram,需要拆成独立可验收阶段。

**From → To**:

- 新增 `@tech-扩展端Instagram本地下载.md`:确定 `PageContext/当前路由资源 Map/Resolver/Scanner/ensureButton/downloadOne` 简单模型,DOM 只定位,原媒体只来自权威 JSON/同源详情。
- 新增 `@plans/008.*` 至 `@plans/018.*`:依次覆盖发布注册表、当前页面资源 Map、媒体 parser/resolver、Post/Reel 按钮、集合页 Grid、Story/Highlight、Popup、共享逐项下载、固定 EventRpc、E2E/Canary 与发布收口；每阶段都有独立命令与验收项。
- Profile Grid 从“只下载 DOM 封面/不支持”目标改为按 shortcode 静默解析后直接下载单图、完整 Carousel 或 Reel MP4;失败不降级 thumbnail。
- Post/Reel 固定保留操作区全部与媒体层当前项两个入口;Reel cover 仅在页面菜单显式下载,不进入 Popup 或下载全部。
- Popup 改为打开或刷新时查询当前 tab；集合页保留当前路由中已滚动发现并解析成功的内容，列表短暂过时由刷新或重开纠正。
- 共享下载统一为 `downloadOne`:每项独立扣一个额度并执行一次完整 `downloadMedia`；批量只按顺序逐项调用，失败后继续，重复点击允许重复扣额和重复下载。
- EventRpc 使用固定 DOM 通道并接受宿主页面可观察和伪造风险；只保留基础输入校验，Chrome 权限、storage、额度和后端 token 留在 content/background。
- Playwright real/controlled project 固定前缀 `testMatch` 并用 `--list` 防止新 spec 静默漏跑；受控测试验证 Profile Grid 原媒体、逐项额度和真实下载副作用。
- 额度语义明确为解析失败不扣、明确额度不足只跳过当前项、额度服务异常 fail-open、下载发起后失败不退款、部分失败不回滚成功项。
- Threads/Vimeo 保持 `disabled-unverified`;平台矩阵、插件架构与 references 索引同步当前发布状态。
- `@../000.架构/tech-插件RPC.md`:EventRpc 从“私有可认证通道”修正为固定且不可信的 DOM transport；下载只保留完整 request-response，站点只实现相关 handler。
- `@test-插件端e2e.md`:增加受控 Instagram 正确性硬门禁与真实 Instagram Canary 双轨目标,并要求每次 E2E 验证 fresh build 和逐项下载副作用。

## 2026-07-09 调整活跃下载并发上限

**Why**:浏览器旧连接释放和 Range 恢复新连接之间可能短暂重叠,原上限 2 容易在释放异步窗口误杀恢复请求。

**From → To**:

- `@tech-速率治理.md` / `@tech-链路与授权.md` / `@tech-后端媒体Provider架构.md`:active-limited 用户活跃下载并发上限从 2 → 3;第 4 个请求仍返回 `active_download_limit_exceeded`。

## 2026-07-06 X direct 关闭 twimg 非 0 Range Continue

**Why**:`video.twimg.com` 没有向浏览器 `fetch` 暴露 `Content-Range`,网页端无法安全校验续传片段起点;Range 校验失败后还需要主动取消未读响应体,避免浏览器继续下载浪费流量。

**From → To**:

- `@tech-下载方法与续传.md`:direct 从默认 OPFS byte resume → X/twimg direct 只用 OPFS 保存本次流,跨刷新只 Restart/from 0。
- `@tech-站点适配.md`:X 小节补充 `video.twimg.com` 的 `Content-Range` CORS 限制与不可 Continue 的断点口径。

## 2026-07-05 新增 Vimeo 扩展端纯前端下载设计

**Why**:Vimeo 插件端下载需要在页面内直接展示所有可用资源,覆盖最高画质视频、多画质选择、audio-only 与 thumbnail,并明确不走 website/backend `yt-dlp` 链路。

**From → To**:

- 新增 `@tech-扩展端Vimeo本地下载.md`:明确 Vimeo config 来源、DOM 插入点、按钮 DOM、progressive/DASH/HLS 资源提取、最高画质选择、audio-only、thumbnail、config 过期刷新和扩展权限边界。
- `@tech-站点适配.md`:Vimeo 从仅 website/backend `direct` 下载 → 增加扩展端纯前端下载口径;extension 差异矩阵加入 Vimeo。
- `@references/index.md`:Vimeo 条目增加扩展端纯前端下载 tech 指向。

## 2026-07-03 媒体 pre-v2 控制面接入 Website 设备可信校验

**Why**:`parse-pre-v2` 和 `download-pre-v2` 是 website 下载链路的重要控制面入口,需要复用 Website 设备可信关系降低异常请求消耗。

**From → To**:

- `@tech-链路与授权.md`: `parse-pre-v2` 从仅 IP 限流前置 → 先校验 Website 设备可信关系,失败返回 `AUTH_PAGE_REFRESH_REQUIRED`。
- `@tech-链路与授权.md`: `download-pre-v2` 从登录后直接进入用户短锁 → 登录后先校验 Website 设备可信关系,失败返回 `AUTH_PAGE_REFRESH_REQUIRED`。

## 2026-07-03 新增后端媒体 Provider 架构与活跃下载并发计划

**Why**:现有 `MediaNodeExecutionService` 聚合 parse/download、TG/TikTok proxy、direct/client_mux、Range/header、错误映射、限速和释放逻辑;继续接入几十个平台会形成不可维护的大 service。Provider 还需要声明是否进入进程内用户活跃下载上限,避免同一用户同时占用过多后端流资源。

**From → To**:

- 新增 `@tech-后端媒体Provider架构.md`:明确每个平台一个 Provider、固定 `MediaParseRequest` / `MediaDownloadRequest`、固定 `StreamDownloadResult | JsonDownloadResult`、`ProviderPolicy(active_limited, bandwidth_limited)`、Provider `extra` 私有透传、Range 由 Provider 决定、统一 `release_once()`。
- 新增 `plans/003.backend-media-provider-refactor.md`（已随后续平台下线删除）:分阶段实施契约层、活跃下载计数、TG/TikTok proxy Provider、direct/client_mux Provider、收敛 `MediaNodeExecutionService` 平台执行逻辑。
- `@tech-链路与授权.md`:download-v2 内部流程从“按 platform + mode 调本地逻辑”补充为 `media_provider_service -> ProviderPolicy -> Provider -> Stream/Json result`,并写明活跃下载上限 2、`extra`、`Content-Disposition: attachment` 文件流判别与统一释放。
- `@tech-速率治理.md`:新增用户活跃下载并发口径;并发限制由 ProviderPolicy 决定,进程内计数,上限 2;不做 direct/client_mux 调用频率限制。
- `@feat.md` / `@references/index.md`:补充后端 Provider 架构文档入口。
- 审查后补强:区分 provider missing 与 unsupported platform;限定 `extra` JSON/大小/跨节点缓存契约;明确 proxy 关键响应头由 API/service 从结构化字段生成;补齐 Provider 返回前抛错、前端 attachment 判别和未来新 mode 扣费冲突口径。
- 复审后修正:download-v2 错误契约统一为 HTTP 200 envelope(除 token 401、Range 416),前端按 `Content-Disposition: attachment` + 业务 code 判别;`extra` 类型统一为 `dict[str, JsonValue]`;禁止 cache key 绑定会变化的 token `jti`;当前站点矩阵和 mode 契约只保留已接入、已注册内容;OPFS 只有可校验 Range 时才 `resumable`;Continue 不重新授权,Restart 作为新传输动作重新授权。

## 2026-07-01 TG 下载链路增加账号亲和与 username resolve 降频计划

**Why**:Telegram `ResolveUsernameRequest` FloodWait 显示 parse 与 download 会分别触发 username resolve;当前解析和下载可能使用不同 TG client,同一账号内又直接 `get_entity(username)`,导致重复消耗 Telegram username resolve 配额。

**From → To**:

- `@tech-链路与授权.md`:Telegram 账号亲和字段在 Provider 架构后归入 `extra.tg_client_ref`;parse-v2 不公开该字段,仅通过 signed resource token、download-pre-v2、media download token 透传到 download-v2;下载执行只把它作为账号池亲和 hint。
- 新增 `@plans/002.TG账号亲和与username-resolve降频.md`:覆盖 `client_ref=sha256(phone + "***SEC***")`、TG 账号池软亲和选择、token 内透传、`InputPeer`-only 解析路径(不再调用 `get_entity()` 拉完整 chat entity)、测试、发布观测与回滚。

## 2026-06-30 调整扩展端 X 页面按钮注入位置

**Why**:X action bar 结构变化后,原“Share 附近追加 + 媒体右上角常驻”容易出现按钮位置不可见或与原生 UI 冲突;产品期望为收藏旁“下载全部”与媒体 hover 右下角单资源下载。

**From → To**:

- `@tech-扩展端X本地下载.md`:媒体按钮从右上角常驻 → hover 右下角显示(触摸设备常驻);action bar 从 Share 附近插入 → 优先插到收藏按钮左侧,文案语义为“下载全部”。

## 2026-06-30 首页默认展示插件卡片

**Why**:首页下载工作区的 Chrome/Edge 插件引导需要作为默认推荐入口展示,不再等到桌面端解析出 500MiB 及以上 Telegram 文件后才出现。

**From → To**:

- `@tech-站点适配.md`:首页插件卡片从 `telegram + size>=500MiB + 桌面指针` 条件展示 → 首页默认展示;其他复用页保留原条件展示。
- `@references/index.md`:Telegram 来源索引补充首页默认插件卡片口径。

## 2026-06-30 新增扩展端 X 本地下载设计

**Why**:插件端 X 下载明确不走后端,且范围包含图片与视频;站点矩阵需要同时描述 website 后端 X 解析与扩展端注入能力,避免误导实现。

**From → To**:

- 新增 `@tech-扩展端X本地下载.md`:明确 X 插件端本地扫描/捕获/下载方案,覆盖图片 DOM、视频 `blob:` 播放与 `video.twimg.com` MP4 网络捕获、popup + 页面按钮、权限边界与验收样本。
- `@tech-站点适配.md` X 小节:从仅 website `yt-dlp` direct 下载 → 补充扩展端本地下载独立口径,不调用后端、不新增 `downloads` 权限。
- `@references/index.md` X 条目:从只指向 website 端 X 下载 → 增加扩展端 X 本地下载 tech 指向。

## 2026-06-29 插件 E2E 同步官网 Pricing 升级入口

**Why**:extension 订阅购买页删除后,下载额度不足只能通过升级弹窗跳官网 Pricing。

**From → To**:

- `@test-插件端e2e.md`:插件页面稳定链路从 options 订阅方案/订阅弹窗 → popup 登录弹窗、升级 modal、官网 Pricing 跳转。
- 配额不足断言从“跳转 options” → “打开官网 Pricing URL”。

## 2026-06-29 同步 TG K 内部资源模型与阶段 3 收尾

**Why**:扩展端 TG 下载链路已从 photo/video DOM 判型推进到 K 内部 `message.media` 资源模型,并补齐 popup/A/sidebar 行为;tech 需要同步为 resourceIds、K sidebar 不生成可下载 DOM 资源、完整 ResourceType。

**From → To**:

- `@tech-扩展端TG扫描.md` `MediaResource` 从 photo/video 简化模型 → `photo/image/video/round/gif/audio/voice/document` + `sourceKind/mimeType/messageFullId/documentId`。
- content `downloadBatch` 从 popup 传资源对象 → popup 只传 `resourceIds`,content 从 `ResourceBuffer` 回查完整资源。
- K 主链路从 DOM 图片/视频 URL 判型 → DOM 找候选 + injected `getKMediaResources` 内部判型;DOM 缩略图只进 thumbnail。
- K sidebar DOM 下载能力 → 删除可下载资源生成;A sidebar 保留 `mediaHash/progressive` 并补 `sourceKind/mimeType/type`。

## 2026-06-23 文档结构迁移

**Why**:节点系统与下载业务耦合在同一份 feat 文档中,边界模糊;按"执行环境"与"跑在节点上的下载业务"拆分,把下载业务独立成域,便于独立演进和跨域引用。

**From → To**:

- `feat.041 §2 V2 协议链路 / §3 节点与 session(V2部分)/ §4 下载 token / §5 API 规格 / §5 前端切换` → `002.下载功能` 域(本目录)。
- `feat.039`(已下线的 `client_request_id` 移除)下载链路相关结论 → 已并入 `@tech-链路与授权.md` 与 `@tech-前端切换.md`。
- 速率治理相关产品/技术要点 → `@tech-速率治理.md`(另一 agent 负责)。
- 节点通用能力(角色/路由/调度/健康/管理/发布)→ 保留在 `@../001.节点系统/`。
- 积分余额与扣费规则 → 保留在 `@../003.积分系统/`;本域只描述"下载授权时按用户口径扣减、6 小时内同一资源只扣一次"这一事实。

## 2026-06-23 并入站点适配层

**Why**:各平台(TG/X/Instagram/Threads/TikTok/Vimeo/Reddit/Douyin 及计划中的 SoundCloud/Smule/iFunny/Dailymotion)的解析方式、`download_mode` 选择、client_mux 轨道处理、特殊边界原本散落在十余份扁平 feat 中,与 002 下载主链路域边界模糊;新增「站点适配」层把各站点差异收敛到一份矩阵,主链路四个 tech 不再重复承载平台细节。

**From → To**:

- `feat.004 / 014 / 015 / 016 / 017 / 019 / 021 / 022 / 023 / 024 / 034 / 035 / 036 / 037 / 038 / 042`(各站点扁平 feat)→ `@tech-站点适配.md`(差异矩阵 + 共性约定 + 接入清单)+ `@references/index.md`(源 feat/plan 索引,不复制内容)。
- 矩阵以代码为准:`DOWNLOAD_METHODS` 当前只注册 `proxy`/`direct`/`client_mux`;`hls_client_mux`(Dailymotion)、`direct_navigation`(Smule)与 iFunny/Smule/SoundCloud/Dailymotion 作为后续接入口径单独列出。
- `direct` / `client_mux` 统一由 `download-v2` 返回对应 JSON,矩阵统一改写为 V2 链路。
- `client_request_id` 已从 download-pre-v2 契约删除,矩阵不引用该字段。
- 未改 `feat.md` 已有段落、`tech-链路与授权.md`、`tech-下载方法与续传.md`、`tech-速率治理.md`、`tech-前端切换.md`;仅在 `feat.md` 末尾追加一句指向 `tech-站点适配.md`。

## 2026-06-23 并入 018 下载存储治理

**Why**:原 `references/index.md` 把 feat.018 归到「已并入 tech-下载方法与续传 §8」,但 §8.2 的存储选择与「不自动降级」描述停留在两态(`opfs/indexeddb`)、无 `memory_task`、无运行时降级,与 `website-shared/src/download/scripts/download-resume-store.ts` 现行实现(三态 `storageType` 含 `memory`、`MemoryTaskState`、`prepareMemoryFallbackRecord` 运行时降级重试一次)不一致,构成双源失配。

**From → To**:

- `docs/feat/feat.018.website下载存储能力治理.md` + 原 plan feat.018.001.*(OPFS/IndexedDB/Memory 三层存储、真实写入探测、运行时 Memory 降级、4 类存储埋点)→ 新增 `@tech-下载存储治理.md`。
- `references/index.md` 第 36 行 018 条目归宿:从「并入 tech-下载方法与续传 §8」修正为「并入 tech-下载存储治理」(修正指向,未新增重复条目)。
- 明确 `@tech-下载方法与续传.md` §8.2「不自动降级」只约束刷新后加载恢复记录失败;下载过程中断点写入失败的自动 Memory 重试由 `tech-下载存储治理.md` §4 约束,两者作用阶段不同,不冲突。
- 存储口径同步:IndexedDB 只存轻量记录;`website/src/scripts/download/checkpoint.ts`、`download-core.ts` 已迁入 `website-shared`。
- 未改 `feat.md` 已有段落、4 个原有 `tech-*.md`(链路与授权/前端切换/速率治理/站点适配)、`tech-下载方法与续传.md` 主体;`references/index.md` 只修正 018 条目归宿一行。

## 2026-06-23 补回 tech-站点适配 各平台关键差异点

**Why**:站点适配矩阵初版只汇总了平台 + `download_mode` + 解析方式概要,丢失了各平台在 tech-*.md 中本应承载的「算法/逻辑细节」——限流特殊值、计费口径差异、解码算法、fallback 链、接口契约参数、Range/断点严格口径、DOM 注入方案。这些是新增平台接入时不可从代码 i18n 反推的关键差异,核对后补回,以便删除 7 份已并入的扁平源 feat。

**From → To**(增量补,未重写整篇,保持原有结构):

- **TikTok(§5.2)**:`feat.015`/`feat.016` → 补断点续传严格口径(206 才续传,其余含 416/403/5xx 清断点;CDN 403 一次性重解析属 token 刷新);补扩展端 DOM 注入锚点方案(`a[data-e2e="video-music"]` `insertBefore`、48×48px 点击区、`xgwrapper-{index}-{videoId}` 取 ID、500ms SPA 轮询)。
- **Instagram(§5.5)**:`feat.023` → 补图片 `/p` 分支独立 limiter 1 次/15 秒(比共性 3 次/10 秒严);补直链刷新口径(403/404/410/CORS 非 2xx 时方法内部最多重新授权一次,清断点从头重试一次)。
- **Douyin(§5.8)**:`feat.038` → 补视频 URL fallback 链(play→playwm→url_list→currentSrc、aweme_id 过滤推荐视频、水印人工确认);补 direct format 缓存 600 秒 + signed URL ≤10 分钟;补 CORS preflight 验 Range。
- **iFunny(§6.1)**:`feat.037` → 补 fallback 多源(video[data-src]→og:video:secure_url→og:video:url→twitter:player;图片页正文主图,不用 og:image 作主资源);补稳定 `source_id` + `extra.cache_key` 共享缓存口径;下载 8 次/60 秒仅作为后续公共 proxy 下载频率 hook 需求;补 Range 续传严格口径(206 且文件指纹匹配才续传,200 则从 0 重来);补原始 CDN 直链输入例外。
- **Smule(§6.2)**:`feat.036` → 补 `e:` URL 解码算法(base64 + 固定 RC4 key);补媒体字段→资源映射(media_url→M4A、video_media_mp4_url→MP4 优先、visualizer 兜底、HLS 不返回);标注 `direct_navigation` 的计费顺序需单独设计预校验或退款补偿;补 cookie TTL(__cf_bm 剩余时间 vs 1500 秒较小值、无 expires 用 300 秒、Redis 按 egress_id+ua 分片,剩余时间按 Set-Cookie 到达时记录计算)。
- **Dailymotion(§6.4)**:`feat.034` → 补后续 `hls_client_mux` 接口契约参数(download-v2 返回 manifest_id+segment_count+filename+mimetype+estimated_size;新增受控 segment endpoint,禁传任意上游 URL;manifest TTL 30 分钟;禁跟 30x);标注 `hls_client_mux` 的计费顺序需单独设计预校验或退款补偿。

**源 feat 删除判定**:7 份源 feat(feat.015/016/023/034/036/037/038)的关键技术差异点(限流/计费/解码/fallback/契约/Range/DOM 注入)均已并入矩阵对应小节,UI 像素规格、错误文案逐条、选择器逐字、库版本选型理由、可行性调研样本数据属次要(在代码/i18n/调研文档),不补。**7 份源均可删**。

## 2026-06-23 新建 扩展端 TG 扫描 tech

**Why**:`references/index.md` 把 feat.004(扩展端 TG 频道扫描注入)归到 telegram 平台条目,但 002 域此前只有一句概括,没有 tech 承接这个独立系统的接口/数据结构/协议事实。需新建 tech 以代码为准承接,然后才能删源。

**From → To**:

- `docs/feat/feat.004.telegram资源扫描.md`(扩展端扫描:MediaResource/MessageObject、K/A 扫描器、资源缓冲区、按钮注入、content↔background RPC、injected `getStreamUrl*`)→ 新增 `@tech-扩展端TG扫描.md`。

**以代码核对源发现的过时点**:

- feat.004 消息协议 `TG_*` 常量全部不存在,改 camelCase RPC(`getResources/scanResources/downloadBatch/getDownloadStates/clearBuffer`);`TG_DOWNLOAD_RESOURCE` 单资源 RPC 不存在;类型名从 `Req*/Resp*` 改 `Content*`;`UPDATE_BADGE/RESOURCE_BUFFER_UPDATED/TG_MESSAGES_UPDATED` 改 `updateBadge()` RPC + `resourceBufferUpdated`/`tg_dl_messagesUpdated` 事件。
- feat.004 `GET_STREAM_URL` 改 `getStreamUrl` + 批量 `getStreamUrls`(扫描器实际用批量);`MediaResource` 漏必填 `metadata`;响应漏 `mimeType`;按钮无独立「完成」态文案;版本检测只看 pathname 首段不看 hash。
- feat.004 §11「首页链接校验」属 website 不属扩展端,tech 不承接。

**源 feat 删除判定**:feat.004 扩展端扫描部分可删,§11 首页校验属 website,删前需确认 website 域是否已有承接或单独迁出。

**未改**:`feat.md`、`references/index.md` 条目结构(仅在 telegram 行追加新 tech 指向)、其余 6 个 `tech-*.md`。
