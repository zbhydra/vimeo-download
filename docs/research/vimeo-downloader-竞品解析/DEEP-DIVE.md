# 竞品深度调研：操作逻辑 / 技术方案 / 功能差异

> 对竞品（Vimeo Downloader - HD Video & Audio Save v2.6.14）三个维度的深度解析，基于 `source/` 完整源码静态分析。与 [README.md](./README.md)（检测机制 + 首轮对比）互补：README 回答「首页为什么能检出 12 个」，本文回答「全面差在哪、哪些值得跟、哪些要避坑」。
>
> 调查方法：bundle 经 prettier 美化后按字符串锚点定位；证据以「文件 + 锚点」标注（`bg`/`off`/`worker`/`common`/`popup`/`opts` 为各 bundle 美化版缩写）。竞品 UI 文案不走 chrome i18n（`_locales/` 仅商店元数据），而是内嵌在 `chunk-common.5cedc827.js` 的 55 语言字典——那是功能全集的钥匙。
>
> **更新记录**：§5 为第二轮补挖（2026-09-26 晚，以我方交付 OPFS/购买页/设置弹层/运营三件套后的最新状态为基准），并复核 §4 跟进清单状态——两轮间的差距消除情况见 §5.3。

## 1. 操作逻辑

### 1.1 竞品用户旅程全景

**入口模型：纯 popup，页面零注入 UI。** `inject.js` 只挂钩网络，content script 只做存储中继，Vimeo 页面上没有任何可见元素——全部交互收在 popup（我们则有页面按钮面板 + popup 双入口）。

popup 旅程（自上而下）：

1. **版本过期拦截**：`versionDeprecated` 时整个 popup 替换为全屏覆盖层（"Version Outdated" + 卸载重装引导 + 官方版下载链接）。
2. **header**：齿轮进 options 页；登录态显示皇冠 PRO 徽标 + 邮箱下拉菜单（套餐/到期日/管理订阅/登出）；免费态显示 Pro 购买按钮。无语言切换器（在 options）。
3. **检测态**：spinner "Detecting videos..."；三种空态各有引导——non-vimeo（"Browse Vimeo" 跳 Staff Picks）、timeout（"Report this page" 一键上报）、refresh-required（"Refresh Page" 按钮并自动重检）。
4. **多视频**：下拉切换（"N videos detected"），切换即重置画质选择与剪辑区间。
5. **信息卡**：缩略图 + 标题 + 作者 + 时长。
6. **档位区 5 行**：Video（画质下拉 + 喇叭静音开关，记忆偏好）/ Direct Download（progressive 直链）/ Audio（MP3）/ Subtitle（.vtt）/ Cover（JPG）。超阈值估算时行间出现黄色 auto-split 预告。
7. **剪辑下载**：双 handle 滑轨（hover 显现、点击吸附、最小间隔 1s）+ 展开后起止文本框（`m:ss` / `h:mm:ss` 格式、Enter/blur 提交、非法区间红字）+ "Full Video" 重置。**Pro 门控的表现是「碰即锁」**：未登录/非 Pro 时 focus/点击/拖拽一律弹内嵌付费窗，控件同步锁定。
8. **保存位置**：子文件夹文本框（popup 与 options 双向同步）。
9. **底部队列**："Downloads continue in background" 蓝条；失败时红条引导刷新重试；每任务状态图标（spinner/勾/叉/灰圈）+ 进度条（merging/converting 阶段变条纹）+ 百分比 + 速度 + 阶段文案；**下载中任务不可取消**（tooltip "Cannot cancel in progress"），仅 pending 可取消；完成后仅保留最近 3 条；"Stop All" 全停。重复入队 toast 拦截。
10. **footer**：CDN 下发的跑马灯公告；免费态五星评分引导（≥4 星跳商店）；版本徽标 + 累计下载计数徽章。
11. **Pro 购买在 popup 内闭环**：三卖点 + 月 $5/年 $50 两卡 + 邮箱 → `/api/checkout` 返回外部收银台 URL；**支付成功页自动登录**（auto-login content script 用 session_id 换 token，还返回明文账号密码）；登录/忘记密码/订阅管理都是 popup 内视图，不出插件。

**options 设置页**（我们没有的形态；全部即改即存 + 2.5s 保存反馈）：语言（55 种 + Auto 跟随浏览器）、下载子目录、**文件名规则模板**（`{title}_{quality}_{type}` 默认，变量点击插入 + 实时预览）、历史容量上限（1-2000 条，默认 500）、**备用下载方式开关**（blob 落盘兼容 Vivaldi 等的救援开关）、**分段模式**（Auto split + 阈值 GB 数值输入 0.5-8 / Never split streaming BETA）。History tab：搜索/6 种排序/分页/**导出 Excel（SheetJS 真导出 xlsx）**/单删/清空/类型徽章/相对日期。

### 1.2 与我们的操作逻辑差异（要点）

| 维度 | 竞品 | 我们 | 差距评估 |
| --- | --- | --- | --- |
| 页面内 UI | 无（纯 popup） | 页面按钮面板 | 我们多一个入口，非劣势 |
| 剪辑交互 | 滑轨+文本框混合，「碰即锁」门控 | 数字输入+双滑杆，无门控 | 交互形态已对齐 |
| 队列取消 | 下载中不可取消 | 全生命周期可取消 | 我们强 |
| 空态引导 | 三种空态各配动作（报告/Browse/刷新） | 空态+Rescan | 可借鉴文案与引导 |
| 设置页 | 完整 options + History 页 | 无 | **明确缺口** |
| 商业闭环 | popup 内登录/购买/管理订阅 + 支付成功自动登录 | 登录走官网桥接 | 商业模式不同，不强跟 |
| 通知 | 版本过期、登录成功两种 | 无 | 低成本可补 |
| 增长组件 | 评分引导、跑马灯公告、累计下载徽章 | 无 | 增长期可补 |
| 语言 | 55 种 UI 字典 + options 切换 | 14 种（跟随浏览器） | 覆盖面差距 |

## 2. 技术实现方案

### 2.1 后端依赖全景（8 个 API + CDN + 埋点）

| 端点 | 用途 |
| --- | --- |
| `POST /api/m3u8-parser` | 远程 HLS 解析（返回分片清单+init URL），触发条件 = 远程开关 `useBackendM3u8Parsing` 开 **且** 本地拿不到 config |
| `GET /api/system-config/v2?fp=` | AES-GCM 加密的远程功能开关（mode: free/paid、feature 门控表、远程解析开关），设备指纹派生密钥，缓存 1h，失败兜底 `{mode:"paid"}` |
| `POST /api/login` / `verify-token` / `password-reset` | 账号体系；token AES-GCM 加密存 storage（设备指纹派生 key），24h 缓存 + 本地 `expiresAt` 判过期 + 离线放行 |
| `POST /api/checkout` | 返回 Stripe 收银台 URL |
| `GET /api/auto-login` | 支付成功页 session_id 换 token（**返回明文密码**，安全上不可效仿） |
| `GET /api/manage-subscription` | 跳转 billing portal |
| CDN `vimeoOptions.json` | 版本 deprecation 判定 + footer 公告，每小时 alarm 拉取 |
| 阿里云 SLS | 行为埋点（含 email/isPaid/URL） |

对比：我们无后端下载依赖（重签走 Vimeo 自身），远程配置体系（runtimeConfig 稀疏覆盖）与竞品 system-config 同构但轻量；商业化我们走后端配额而非前端 feature 门控。

### 2.2 下载管线：双栈并行（核心差异）

- **legacy（ffmpeg.wasm）**：分片 fetch→arrayBuffer 整片进内存→MEMFS 拼接→ffmpeg 仅在需要时介入（剪裁 `-ss/-t -c copy`、合流 `-c:v copy -c:a aac`、音频转 MP3 `-acodec libmp3lame`），其余场景字节拼接直接当产物。分片池并发 6、3 重试指数退避。**不支持 AES-128**（解析器分叉），加密视频产出坏文件。
- **streaming（libav worker，BETA）**：未混淆的 1321 行 `streaming-libav-worker.js` 是最好的参考——协议 `init/download/abort/dispose` → `ready/progress/diag/done/error`；并行取片（并发 4、5 重试、30s 超时、500ms 退避、404/416 不可重试）→ AES-128-CBC 解密（keyUrl 全局缓存、IV 缺省用 media sequence 构造、仅 identity keyformat、init 不解密）→ 剥 PNG 伪装壳 → 逐段 demux → 跨段 PTS 零点对齐（AV gap 阈值 250ms）→ **packet 级 remux 流式写 OPFS**（`FileSystemSyncAccessHandle`，内存 O(1)）→ 坏分片 ≤35% 容忍。但**交付时仍整文件读回 Blob**（>4GB 尖峰，官方错误文案自认）。
- **对 Vimeo 的实际处理：完全没有 MPD/DASH 解析**——`streams_avc` 只当画质元数据表，实际下载一律走 HLS playlist（本地解析或后端远程解析），双轨各下各的再合成。
- 我们：单管线 Mediabunny 纯 remux（不解码不转码）、分片并发 4、无 AES 需求、签名重签 + track 守卫（竞品完全没有重签，排队期间 URL 过期只能失败）。

**⚠️ 对我们自身的警示**：竞品 streaming 管线已用 OPFS 流式写盘压内存（尽管交付仍有尖峰），而**我们的 offscreen 合成用 Mediabunny `BufferTarget` 是全内存驻留**——4K 长视频（数 GB）会 OOM。这是本轮调研对我们最有价值的发现，建议后续立项：mux 目标改 OPFS（FileTarget/StreamTarget）或引入大文件分段。

### 2.3 大文件 auto-split（我们没有的能力）

两级机制：①**任务级 auto-split**——按码率表（2160p→20Mbps…360p→0.6Mbps，+128kbps 音频）× 0.648 经验系数估算大小，超阈值（默认 1.5GB，可调 0.5-8）时按「目标片大小/估算总量」等比换算时间窗，把原任务拆成 N 个带 `startTime/endTime` 的子任务入队，每片 ffmpeg/libav 精剪，文件名带时间区间后缀；②legacy 管线内**分卷 chunking**——超阈值非剪裁任务把分片列表按块切，每块独立合成独立交付，靠 `conflictAction:uniquify` 变成同名 `(1)(2)` 序列（用户感知差）。内存不足错误还会翻译成引导文案（提示把阈值降到 1.0/0.8/0.5GB）。

### 2.4 音频转码（我们没有的能力）

**音频下载在两条管线都是强制转 MP3**（legacy `-acodec libmp3lame -q:a 2`；streaming libav 完整解码→aresample→libmp3lame 128kbps 重编码），没有 m4a 选项。合流时音轨 AAC 重编码。我们只有 remux（m4a 透传），无转码能力。

### 2.5 持久化与安全

竞品 storage 全集：settings（含文件名模板）、AES-GCM 加密凭据、`download_history`（map，容量上限裁剪）、`downloadCount`、设备指纹。**下载队列不持久化**（offscreen 内存）。安全坑：auto-login 明文密码、postMessage 无源校验、加密 key 派生自易变设备指纹（指纹变→凭据静默清除）、特性开关依赖后端可用性（后端挂了免费用户反而被锁）。我们：凭据走后端配额体系（不在插件端存储），插件端仅 settings + 保存位置。

### 2.6 技术弱点清单（避坑）

竞品可见缺陷（我们已避免的标注✓）：legacy 不支持 AES；运行中任务不可取消（abort 通道建好未接线）✓我们已解决；队列不持久化（两边相同，均属已接受限制）；streaming 交付整文件 Blob 尖峰（>4GB）；分卷交付靠 uniquify 命名（用户感知差）；码率估算系数拍脑袋；wait-blob 500ms×60 轮询竞态（我们的 onChanged 回执更可靠）✓；明文密码 auto-login；deprecation 仅 onInstalled 检查（长期不更新用户永远看不到）；特性开关依赖后端可用性；无签名 URL 重签 ✓我们已解决；下载历史与任务状态割裂（popup 点击时写，offscreen 完成不回写）；无 HLS DISCONTINUITY/live 处理。

## 3. 功能差异矩阵

### 3.1 竞品有、我们没有（按建议优先级排序）

| # | 功能 | 竞品实现要点 | 跟进建议 |
| --- | --- | --- | --- |
| 1 | **下载历史页** | History tab：搜索/排序/分页/单删/清空/类型徽章/**导出 xlsx**/容量上限 | 高价值（留存功能）；我们已有落盘回执与打点，缺的是历史存储+UI |
| 2 | **options 设置页** | 即改即存+保存反馈；文件名模板（变量插入+预览）、语言切换、阈值、兼容开关 | 高价值；保存位置已有，缺页面与模板体系 |
| 3 | **MP3 音频导出** | 两条管线都强制 MP3（libmp3lame） | 高频用户需求；我们需引入转码（wasm-unsafe-eval CSP + ffmpeg.wasm 或 libav） |
| 4 | **大文件分段/streaming 落盘** | auto-split 任务级拆分 + OPFS 流式 mux | **我们自身技术债**（BufferTarget 全内存），建议合并立项 |
| 5 | 系统通知 | 仅版本过期 + 登录成功（下载完成反而不通知） | 低成本；建议我们直接做「下载完成/失败通知」——竞品都没做 |
| 6 | AES-128 HLS 解密 | streaming 管线支持（key 缓存/seq IV） | 我们 HLS fallback 遇加密流的现状需先确认 |
| 7 | 多语言切换 UI | 55 语言 + Auto | 我们 14 语言不可切；补 options 语言项即可复用现有 locale |
| 8 | 文件名模板 | 变量插入+实时预览 | 中价值，配合下载历史做 |
| 9 | 空态引导/bug 上报 | 三空态各配动作 + Report this page | 低成本文案级 |
| 10 | 评分引导/公告跑马灯/累计计数 | 免费态五星→跳商店；CDN 公告 | 增长期再说 |
| 11 | 版本强停 + 远程开关 | CDN 版本判定 + 全屏拦截 + feature 门控 | 我们有 runtimeConfig 可承接，按需 |
| 12 | popup 内账号/购买闭环 | 登录/计划/checkout/自动登录 | 商业模式不同，不跟 |

### 3.2 我们有、竞品没有（守住的差异点）

| # | 能力 | 说明 |
| --- | --- | --- |
| 1 | **落盘回执** | chrome.downloads + onChanged 确认；竞品 blob 交付靠 500ms 轮询猜 |
| 2 | **签名 URL 重签 + track 守卫** | 排队期间 URL 过期自动续签；竞品完全没有，只能失败重下 |
| 3 | **取消全生命周期** | 下载中可取消 + tombstone 防复活；竞品只能删 pending |
| 4 | **DASH 真解析** | 竞品完全无 MPD 解析（全走 HLS）；我们分片直下 |
| 5 | 队列内重试 | 竞品队列无 retry（只有 history 里的残缺「再下」） |
| 6 | 后端配额体系 | 服务端计费/额度，插件端无凭据存储（竞品明文密码是反面教材） |
| 7 | 页面按钮面板 | 竞品纯 popup |
| 8 | 检测信息卡 | 竞品仅 "JPG" 徽标，无封面信息卡 |
| 9 | badge=检测视频数 | 2026-09-26 裁决的产品口径 |

## 4. 可跟进建议（第一轮，状态见 §5.4）

> **状态注记（2026-09-26 晚）**：第 1 条的 OPFS 流式写盘、第 3 条系统通知、§1/§3 的设置弹层与购买页、评分引导、公告跑马灯已交付；其余项状态在 §5.4 统一复核。

1. **mux 内存治理 + 大文件分段**（我们自己的债，最高优先）：Mediabunny BufferTarget → OPFS 流式写；参照竞品 auto-split 的「估算→按时间等比拆分→子任务入队」模式做任务级分段。
2. **下载历史 + options 设置页**：一个 storage 键 + 一个 options 入口页；文件名模板与语言切换一并做。
3. **下载完成/失败系统通知**：`notifications` 权限 + 编排器终态挂钩，竞品都没做，做了就是差异点。
4. **MP3 导出**：需评估 wasm 转码包（ffmpeg.wasm 25MB 偏重；libav h264-aac-mp3 变体约 5MB 更合适）与 CSP `wasm-unsafe-eval`。
5. **空态引导文案**（报告入口/Browse Vimeo/刷新引导）：纯文案级，半天工作量。
6. **AES-128 HLS**：先确认我们 HLS fallback 在加密流上的现状再定。

## 5. 第二轮补挖与最新状态复核（2026-09-26 晚）

### 5.1 操作逻辑补挖

**i18n en 字典 167 键全量提取**（chunk-common module `7b80`）新发现的上轮遗漏功能：

- **文件名规则模板**：默认 `{title}_{quality}_{type}`，变量 `{title}{quality}{type}{author}{date}{videoId}` 点击插入 + 实时预览 + 恢复默认。
- **下载模式显式二选一**：「Auto split（阈值 GB）」vs「Never split (streaming) BETA」radio 卡，配「4K/长视频选 streaming，启动慢但省内存」引导语。
- **备用下载方式兼容开关**（`useBackgroundBlobDownload`，默认关）：针对「进度正常但文件没落盘」的 Chromium 变体（提 Vivaldi）救援开关。
- **auto-split 黄色预警**：选中项估算超阈值时行间黄色提示「下载前将自动分割」；精确条件 = 非字幕 && `splitMode!=="never"` && 估算 > 阈值（估算含剪辑占比折算，系数 0.648）。
- **内存失败自愈文案**：捕获 `Array buffer allocation failed` 后 toast 动态注入「去设置把阈值降到 1.0/0.8/0.5GB」指引，不是报错了事。
- **付费墙逃生门**：Pro 弹窗内嵌「Download without audio (Free)」——一键降级为静音版继续下载并持久化偏好，把付费流失用户转化为免费成功下载。

**History 页反面教材（写入时机）**：`saveToHistory` 在 popup 点击瞬间、**先于任务派发**调用——任务失败/重复入队也已写入历史；完成/失败路径零回写（offscreen 全文无 history 引用）；记录无 status 字段。同键（`videoId_type_quality`）覆盖刷新，超限按最老裁剪。导出 xlsx 为固定 5 列、导出全量非当前搜索结果；`historyRedownload` 是死键（i18n 有文案、无按钮）。**我们若做历史：任务完成回写 + 成败状态标记，直接成为差异化卖点。**

**边缘流程**：

- **订阅过期**：本地 `expiresAt` 判定（verify-token 结果 24h 缓存 + 离线放行）；**下载管线零 auth**（offscreen 无任何 token 引用），下载中过期不中断，Pro 校验只发生在 popup 点击瞬间。
- **后端全挂降级矩阵**：探测/下载管线/历史/设置全部存活（本地）；system-config 三级降级（1h 缓存→过期缓存→**硬编码默认表 `{mode:"paid",…}`**——最坏情况带音频/剪辑被锁 Pro，免费档恒可用）；manage-subscription 失败转**预填客服 mailto**；支付失败回 popup 内联错误可重试。
- **支付回流**：无轮询无焦点监听，靠 `/success` 页 auto-login content script 用 session_id 换 token 完成开通（取消支付的用户重开 popup 仍是未登录态）。
- **popup 状态模型**：无路由，`showPremiumModal` 布尔 + `premiumView` 字符串（plans/login/forgotPassword）双开关；重开 popup 只保留 storage 侧（计数/音频偏好/has_rated/队列/历史/设置），表单与选中态全丢。

**探测与剪辑联动细节**：per-frame `ping` 全失败 → refresh-required（点刷新后 `tabs.onUpdated` complete 自动重查的半自动闭环）；`get-download-options` per-frame 3s race（慢 frame 按空计入不重试）+ 全局 10s loading 超时 + content `video-config-detected` 推送中途解除 loading；选剪辑区间后 **Direct Download 行整体隐藏**（progressive 不可裁剪），时长显示换显 `clip / total`；TimeRangeSelector 未登录点击/focus/拖拽即弹 Pro 窗并锁定。

### 5.2 技术方案补挖

**SLS 遥测全集**（逐事件即时报、lz4 未启用、失败即丢无重试）：事件 30+（install/update、download complete/error/cancelled/auto_split、popup/open、auth/login_success/failed、payment/checkout、empty/browse_vimeo、bug_report、rating、options 全操作……），基础字段含 uuid（随机非用户绑定）/email/isPaid/**当前 tab URL**。**最值钱的是失败诊断包**：`offscreen-task-failed` 附 19 字段现场（task_stage/progress_pct/split_mode/pipeline/quality/is_clip/opfs_available/hls_host/error_recoverable…）全量进 SLS——我们的打点体系值得对齐这份字段清单（尤其 pipeline 标记与 opfs 可用性）。降噪名单：`exit(0)`/`message channel closed` 不上报。

**background 消息协议**：4 个监听器（action= 15 个、command= 6 个含死代码 XMLHttpRequest/player-vimeo 残留桥）、offscreen 自有 6 个、content 3 个；`video-config-detected` 由 content 直发 popup，**检测链路完全不经 background**。

**SW 生命周期对照**：竞品全部对账 = `getContexts` 复位标志（**无任务级对账**）；SW 死亡的真实丢失面 = blob/http 文件名注册映射（120s TTL 内存表→历史缺记录 bug）+ popup 在途 wait-blob promise；`l` 标志无互斥存在双 createDocument 报错竞态；隐性保活 = 每分片 2 条 runtime 消息。**我们已领先**：listActiveTasks 任务级对账 + 墓碑 + 落盘回执走 onChanged（无内存注册表可丢）。

**错误分类**：errorType = 原生 Error.name + 自定义 `StreamingMemoryError`；errorCode 仅 worker 三值；**前端只维护 1 个特判文案**（OOM→降阈值引导，55 语言）其余透传——错误→用户引导的极简模式，我们做失败文案不必建大错误码体系，挑 2-3 个高频场景给引导即可。

**内存与性能**：legacy 每任务 `dt()` 全量拆除 + ffmpeg 实例重建（换内存干净付初始化时间——任务级重建在真实产品可接受的证据）；分片直写 MEMFS 避免 JS 大 concat；**进度双轨**：percent=分片计数、speed=字节滑窗均值；offscreen 零 setInterval（全事件驱动，无节流依赖）；分片池并发 6（Semaphore 类）。

**Vimeo 耦合全集**：public config 直拉 `player.vimeo.com/video/{id}/config`（带 `bypass_privacy=1` 等参数）+ `vimeo.com/{id}` 播放页正则 `clip_page_config` 兜底；private 路径只用页面捕获的 hlsurl/qid（不额外请求）；`inject.js` 以 `<all_urls>` 注入但 `location.href.includes("vimeo")` 门控——第三方站嵌入的 player iframe 因自身 URL 命中被覆盖；`webNavigation` 权限声明未用（SPA 导航靠 popup 重探测）。

### 5.3 功能差异复核（以我方最新工作树为基准）

**上轮「竞品有我们没有」14 项复核**：已消除 4（系统通知——**反超**：我们做下载完成/失败，竞品仅版本+登录；多语言切换 UI；评分引导；公告跑马灯）、基本消除 1（流式 OPFS 架构对齐，差 auto-split 与 AES）、部分消除 3（设置页→SettingsModal 形态替代、空态引导、累计计数展示）、**仍缺失 6**（下载历史页、MP3 导出、AES-128 解密、文件名模板、版本强停+远程门控、备用下载兼容开关）。

**我方独有 13 项全部成立**，新增 4：SW 冷启动任务级对账（竞品无）、tombstone 取消语义、OPFS File 引用交付（竞品 streaming 内部 OPFS 但交付仍整文件 Blob 且无落盘回执）、remote-config 分组校验（竞品 CDN 静态 JSON 无校验无灰度）。

**本轮新交付的三组正面差异**：购买页（动态套餐+渠道选择+订单轮询 vs 竞品固定 $5/$50+必填邮箱+一次性跳转）；通知范围（下载结果 vs 版本+账号事件，正交）；公告配置链（自有后端可灰度可校验 vs CDN 静态文件）。

**i18n 覆盖**：竞品 55 vs 我们 14，缺口 41 个语言（运营主力缺口：ar/nl/pl/tr/uk/hi/bn/ta/te/ml/mr/gu/fil/ms/fa/sw 及多数欧盟语言；en 变体可缓）。

### 5.4 更新后的跟进清单（按用户价值排序）

| # | 项 | 状态/说明 |
| --- | --- | --- |
| 1 | **下载历史页**（含任务完成回写+成败状态+导出） | 最高投入产出比：落盘回执/成功计数数据已具备，缺 storage 键+UI；竞品「点击即写不回写」是反面教材，我们做成回写+状态即差异化 |
| 2 | **AES-128 HLS 解密** | 功能缺失而非体验降级：我们遇 `#EXT-X-KEY` 直接不出按钮（media.ts 返回空），加密流完全下不了；竞品 streaming 管线可下。需先评估 Vimeo 加密流占比 |
| 3 | **MP3 导出** | 高频刚需；OPFS mux 已就位，剩转码选型（libav mp3 变体 ~5MB 优于 ffmpeg.wasm 25MB）+ CSP `wasm-unsafe-eval` |
| 4 | **文件名模板** | 变量插入+实时预览，配合下载历史一起做收益最大 |
| 5 | **版本强停/远程门控** | remote-config 分组通道已建好但零门控挂载；竞品有 CDN 版本判定+全屏拦截（事故止损能力）。离线安全态设计参照竞品硬编码默认表 |
| 6 | **失败诊断包对齐** | 我们的 SLS 打点补充竞品 19 字段现场清单（pipeline/opfs_available/hls_host/is_clip…），排障价值高，成本低 |
| 7 | i18n 扩量（41 语言）与空态 bug 上报 | 增量翻译 + 半天文案级 |
| 8 | 任务级 auto-split | OPFS 后 OOM 风险已大幅缓解，优先级降低；单视频超长（>4GB）场景仍需要 |

**操作逻辑可抄清单**（低成本高感知）：付费墙逃生门（降级静音继续下载+偏好持久化）、内存失败自愈文案（错误→设置项动态指引）、refresh-required 半自动重检闭环、离线安全态默认表。
