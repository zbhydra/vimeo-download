# 竞品深度调研：操作逻辑 / 技术方案 / 功能差异

> 对竞品（Vimeo Downloader - HD Video & Audio Save v2.6.14）三个维度的深度解析，基于 `source/` 完整源码静态分析。与 [README.md](./README.md)（检测机制 + 首轮对比）互补：README 回答「首页为什么能检出 12 个」，本文回答「全面差在哪、哪些值得跟、哪些要避坑」。
>
> 调查方法：bundle 经 prettier 美化后按字符串锚点定位；证据以「文件 + 锚点」标注（`bg`/`off`/`worker`/`common`/`popup`/`opts` 为各 bundle 美化版缩写）。竞品 UI 文案不走 chrome i18n（`_locales/` 仅商店元数据），而是内嵌在 `chunk-common.5cedc827.js` 的 55 语言字典——那是功能全集的钥匙。

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

## 4. 可跟进建议（按价值/成本排序，未实施）

1. **mux 内存治理 + 大文件分段**（我们自己的债，最高优先）：Mediabunny BufferTarget → OPFS 流式写；参照竞品 auto-split 的「估算→按时间等比拆分→子任务入队」模式做任务级分段。
2. **下载历史 + options 设置页**：一个 storage 键 + 一个 options 入口页；文件名模板与语言切换一并做。
3. **下载完成/失败系统通知**：`notifications` 权限 + 编排器终态挂钩，竞品都没做，做了就是差异点。
4. **MP3 导出**：需评估 wasm 转码包（ffmpeg.wasm 25MB 偏重；libav h264-aac-mp3 变体约 5MB 更合适）与 CSP `wasm-unsafe-eval`。
5. **空态引导文案**（报告入口/Browse Vimeo/刷新引导）：纯文案级，半天工作量。
6. **AES-128 HLS**：先确认我们 HLS fallback 在加密流上的现状再定。
