# SEO 内容工作区：英文长尾文章

> 本目录是 `docs/references/specs/spec-google-seo.md` §3 规定的内容工作区，只放选题决策与文章源稿，不是运行时数据源。
> 读取日期 2026-10-06。本轮只产出内容文件：没有改任何代码，没有提交 git，没有访问 vimeodownloader.app 及其子域。

## 1. 工作区说明

- 源语言 en-US，目标市场美国英语。本轮没有做其他 locale，各 locale 状态一律为「待确认」。
- 每篇一个目录 `{slug}/`，含 `page_seo.md`（简体中文，决策与事实记录）和 `en-US.md`（英文正稿）。`QA.md` 是逐篇对照 spec §11 的自检记录与机械检查结果。
- 全部页面类型为「信息/文章页」（spec §4）。路由 `/guides/{slug}/`（2026-10-07 定稿，见 §7）。
- `en-US.md` 里的两个标记：
  - `[EXTENSION_CTA]` 与成对的 `<!-- EXTENSION_BLOCK_START -->` / `<!-- EXTENSION_BLOCK_END -->`：扩展尚未在 Chrome Web Store 上架，上架前发布必须整块删除，上架后再启用。
  - `<!-- MEDIA: 文件名 | alt: ... -->`：需要补真实截图的位置，截图清单见各 `page_seo.md`。不使用占位图。
- 范围依据：`docs/feat/009.SEO与增长/feat.md` 在工作区有未提交改动，写明「长尾文章页尚未上线：2026-10-06 决定启动。选题与英文源稿在 `docs/seo-skill/` ……路由、模板与多语言形态在源稿确认后补入本文。在此之前，站内不出现文章页入口」。所以本轮源稿被授权，但路由、站内入口与多语言形态仍待 hydra 确认（见 §7）。
- 状态词汇：「源语言稿已完成」不等于「已发布」。只有源码同步、构建通过并验证真实页面后才能标记已发布（spec §3）。

## 2. 选题总表（选中 6 篇）

候选英文查询 36 条（Q1–Q12 复用 sxo.md，N1–N24 本次新搜）→ 聚类 26 个意图 → 选中 6 篇。宁少勿滥：其余意图的取舍理由见 §3。

| slug | 目标意图 | 代表查询 | SERP 证据（WebSearch，US，2026-10-06，非 Google 实时 SERP） | 发布条件 | 优先级 | 状态 |
|---|---|---|---|---|---|---|
| `how-to-download-a-vimeo-video` | 方法型：怎样把一个视频存成文件。官方 Download 按钮 → 在线工具（一次一个链接、最高画质 MP4）；扩展块待上架 | how to download vimeo videos；how to save a vimeo video；download vimeo video without software | Q6 混合（文章 30%、商店 20%、工具 20%）；N18 官方 30%、商店条目 30%、文章 20%、工具 20%；N19 文章 60%、工具 40%；Q5 文章 56%、工具 44% | 可立即发布（在线工具今天能完成任务）。扩展块上架后启用 | P0 | 已同步到站点源码（2026-10-07），构建与本地真实页面验证通过，线上待部署 |
| `is-it-legal-to-download-vimeo-videos` | 信息型：下载 Vimeo 视频是否合法，Vimeo 条款与版权各管什么 | is it legal to download vimeo videos | Q11 文章/问答 9/9（100%） | 可立即发布（不依赖产品能力） | P1 | 已同步到站点源码（2026-10-07），构建与本地真实页面验证通过，线上待部署 |
| `vimeo-download-button-missing` | 排障型：为什么视频页没有 Download 按钮，该找谁、怎么办 | vimeo download button missing；why can't I download a vimeo video；vimeo video not downloading | N1 文章+官方 6/9，工具 0；N2 官方+文章+论坛 8/9，工具 0；N22 论坛+官方+文章 8/9，工具 0 | 可立即发布（解释性内容，引用 Vimeo 官方帮助） | P1 | 已同步到站点源码（2026-10-07），构建与本地真实页面验证通过，线上待部署 |
| `vimeo-downloader-not-working` | 排障型：本站在线工具的报错文案逐条解释与恢复 | vimeo downloader not working；vimeo download failed | N3 论坛/Issue 6/9、厂商文章 2/9，工具 0；N21 论坛/Issue 6/10、厂商文章 2/10，工具 0 | 可立即发布（只写在线工具现有错误态） | P1 | 已同步到站点源码（2026-10-07），构建与本地真实页面验证通过，线上待部署 |
| `save-vimeo-audio-as-mp3-or-m4a` | 方法型：只存 Vimeo 视频的音频，M4A 或 MP3 | vimeo to mp3；extract audio from vimeo video | Q8 文章 56%；N11 文章 5/9（56%） | 待插件上架（核心任务依赖扩展；在线工具只输出 MP4） | P2 | 源语言稿已完成，待 hydra 确认 |
| `download-vimeo-subtitles-as-vtt` | 方法型：把视频自带字幕存成 VTT 文件，并说明它不是文字稿 | download vimeo video with subtitles；download vimeo captions | Q9 文章 78%；N23 文章+官方 8/9（89%），工具 1 | 待插件上架（在线工具不输出字幕） | P2 | 源语言稿已完成，待 hydra 确认 |

建议发布顺序：`how-to-download-a-vimeo-video` → `is-it-legal-to-download-vimeo-videos` → `vimeo-download-button-missing` → `vimeo-downloader-not-working`；`save-vimeo-audio-as-mp3-or-m4a` 与 `download-vimeo-subtitles-as-vtt` 两篇待扩展上架后再发布。前四篇的路由、入口与多语言形态确认之前也不发布（§7 第 1 条）。

内链图（只在确实帮助用户继续任务时互链）：

- how-to → 首页在线工具、downloader-not-working、legal、button-missing、`/ext-pricing/`。上架后建议在扩展块里补 audio、subtitles 两条链接（目前没有）。
- legal → how-to、button-missing。
- button-missing → how-to、legal。
- downloader-not-working → 首页在线工具、how-to、legal、`/contact/`。
- audio、subtitles → 首页在线工具、how-to（在线工具只输出 MP4 的说明）、`/ext-pricing/`、legal。两篇之间不互链。

## 3. 意图聚类与取舍（26 个意图）

「主导类型」按标题与 URL 判断，占比口径见 §6。

| # | 意图 | 代表查询（编号见 §4） | 主导页面类型 | 对应产品能力 | 决策 | 理由 |
|---|---|---|---|---|---|---|
| I01 | 在线工具核心词 | Q1 Q2 Q3 Q4 N5 N17 N24 | 工具 50%–78%（Q1 混合） | 在线工具（首页） | 不做 | 与首页抢词；工具页是该意图的主导类型 |
| I02 | 如何下载 Vimeo 视频 | Q5 Q6 N18 N19 | 混合，文章略多 | 官方按钮、在线工具、扩展 | 选中 `how-to-download-a-vimeo-video` | 同一意图多个词合并为一篇；增量是决策顺序、真实步骤、链接格式、限制与失败恢复 |
| I03 | 下载按钮缺失 / 为什么下不了 | N1 N2 N22 | 文章+官方帮助，工具 0 | 无（解释性） | 选中 `vimeo-download-button-missing` | SERP 为文章型；官方帮助是第一条结果，增量是完整自查流程与合规边界 |
| I04 | 下载器报错 / 失败 | N3 N21 | 论坛/Issue 为主，工具 0 | 在线工具错误态 | 选中 `vimeo-downloader-not-working` | 本站错误文案在源码中可逐条核对，竞品没有对应内容 |
| I05 | 合法性 | Q11 | 文章 100% | 无（合规说明） | 选中 `is-it-legal-to-download-vimeo-videos` | 纯信息型；可由 Vimeo 条款原文、官方帮助与美国版权局页面支撑 |
| I06 | 音频 MP3 / M4A | Q8 N11 | 文章 56% | 扩展（M4A，popup 中转码 MP3） | 选中 `save-vimeo-audio-as-mp3-or-m4a` | 待插件上架 |
| I07 | 字幕 | Q9 N23 | 文章 78%–89% | 扩展（VTT） | 选中 `download-vimeo-subtitles-as-vtt` | 待插件上架 |
| I08 | 文字稿 transcript | N9 | 文章 44%、工具 33%、扩展条目 22% | 无 | 不做 | 产品不生成文字稿；在字幕篇里说明区别 |
| I09 | 只下载一段（裁剪） | N10 | how-to 56%、工具 44%，意图含糊（Vimeo 内剪辑与下载片段混在一起） | 扩展（DASH/HLS 按时间裁剪） | 暂缓 | 需求未被证据证实；待上架和 GSC 数据后再评估 |
| I10 | 封面图 | Q12 | 工具 89% | 扩展（JPEG） | 不做 | 做成说明页属于页面类型错配 |
| I11 | Chrome 扩展 | Q7 | 商店/下载站 44%、对比评测 44% | 扩展 | 不做 | 由 CWS 条目和首页承接；会与首页争同一批词 |
| I12 | 最佳 / 对比 | Q10 | 对比页 80% | 无（只能写自身事实） | 待 hydra 决定，未写 | 全部是厂商或联盟站榜单；方法级对比是否点名竞品需决策 |
| I13 | 下载器是否安全 | N7 | 榜单文章 40%、工具/软件页 30% | 部分（数据流向见首页 FAQ） | 不做 | SERP 不是文章型意图；信任信息放首页、Privacy 更合适 |
| I14 | 下载自己的视频（所有者） | N6 | 官方 44%、文章 56% | 无 | 不做 | Vimeo 官方帮助已完整覆盖，产品无增量；官方路径在按钮缺失篇里给出 |
| I15 | 离线观看 | N14 | 文章 56%、应用商店 33%、官方 11% | Vimeo App 离线列表；在线工具 | 并入 how-to | 同一方法集合；单独成篇会近重复 |
| I16 | iPhone / Android 上下载 | N8；自动补全 to iphone | 文章+官方 | 未核实 | 阻塞 | 在线工具移动端可用性未核实，不写 |
| I17 | 嵌入在第三方网站的视频 | N15 | 混合（含 CWS 条目） | 产品只支持 vimeo.com / player.vimeo.com 顶层页 | 不做 | 触及域名限制边界 |
| I18 | 私密 / 密码视频 | 自动补全 with password | — | 不做 | 不做 | 合规边界 |
| I19 | 没有下载按钮时的绕过 | N20 | 文章 5/10、PyPI 5/10 | 不做 | 不做 | 绕过取向；合规版本的「为什么、怎么办」并入 I03 |
| I20 | 用播放器链接下载 | N4 | 文章/gist 56%、工具 33% | 在线工具（支持 player.vimeo.com 链接） | 并入 how-to | 链接格式作为 how-to 的一节 |
| I21 | 批量 / 频道 / Showcase | N13 | 代码库+软件+博客 | 无批量 | 不做 | 产品做不到 |
| I22 | m3u8 / yt-dlp | N16 | 开发者内容 | 无 | 不做 | 非产品能力 |
| I23 | 下载后没有声音 | N12 | 论坛/播放问题 | 无 | 不做 | 意图错配，多数是播放无声 |
| I24 | vimeo to gif / 转文字 | 自动补全 | — | 无 | 不做 | 没有这项能力 |
| I25 | Firefox / Safari 扩展 | 自动补全 | — | 不支持 | 不做 | 产品只支持 Chromium 系 |
| I26 | 日语 / 西语 how-to | Q13–Q16（sxo.md） | 文章 | — | 本轮不做 | 源语言 en-US 先确认；非英文，不计入 36 条 |

## 4. 查询证据表（英文，36 条）

口径：WebSearch（工具声明仅限美国），读取日期 2026-10-06，无筛选域名。Q 开头为复用 `docs/scratch/vimeodownloader.app-audit/findings/sxo.md` §2.1 的记录（scratch 不入 git，此处复录）；N 开头为本次新搜。实际结果数就是工具返回条数，没有一个查询完成 Top 10 核实。

| 编号 | 查询 | 实际结果数 | 类型分布 | 主导类型 | 意图 |
|---|---|---|---|---|---|
| Q1 | vimeo downloader | 10 | 商店条目 3 · 工具 2 · 官方落地页 1 · Hybrid 1 · 对比 1 · 代码库 2 | 混合：商店 30%、工具 20% | I01 |
| Q2 | download vimeo video | 10 | 工具 5（另 1 待核实）· 文章/帮助 3 · 官方落地页 1 | 工具 50% | I01 |
| Q3 | vimeo video downloader | 9 | 工具 5 · 落地页 2 · 商店 1 · 对比 1 | 工具 56% | I01 |
| Q4 | vimeo downloader online free no sign up | 9 | 工具 7 · 对比 2 | 工具 78% | I01 |
| Q5 | vimeo to mp4 | 9 | 厂商 how-to 5 · 工具 4 | 文章 56%、工具 44% | I02 |
| Q6 | how to download vimeo videos | 10 | 文章 3 · 商店 2 · 工具 2 · 官方落地页 1 · PyPI 2 | 混合，文章 30% | I02 |
| Q7 | vimeo downloader chrome extension | 9 | 商店/下载站 4 · 对比评测 4 · 代码库 1 | 商店 44% = 对比 44% | I11 |
| Q8 | vimeo to mp3 | 9 | 厂商 how-to 5 · 软件落地页 2（待核实）· 对比 1 · 工具 1 | 文章 56% | I06 |
| Q9 | download vimeo video with subtitles | 9 | 文章/帮助 7 · 工具 1 · 目录 1 | 文章 78% | I07 |
| Q10 | best vimeo downloader | 10 | 对比 8 · 落地页 2 | 对比 80% | I12 |
| Q11 | is it legal to download vimeo videos | 9 | 文章/问答 9 | 文章 100% | I05 |
| Q12 | vimeo thumbnail downloader | 9 | 缩略图工具 8 · 代码库 1 | 工具 89% | I10 |
| N1 | vimeo download button missing | 9 | 官方 2（帮助、官方博客）· 厂商文章 4 · 目录 1 · 无关 2 | 文章+官方 67%，工具 0 | I03 |
| N2 | why can't I download a vimeo video | 9 | 官方 2 · 文章 4 · 论坛/Discussion 2 · 无关 1 | 文章 44%，工具 0 | I03 |
| N3 | vimeo downloader not working | 9 | 论坛/Issue 6 · 厂商文章 2 · PyPI 1 | 论坛/Issue 67%，工具 0 | I04 |
| N4 | download vimeo video from player link | 9 | 文章/gist 5 · 工具 3 · PyPI 1 | 文章/gist 56% | I20 |
| N5 | download vimeo video 1080p | 10 | 在线工具 7 · API 工具 1 · 应用商店 1 · 榜单 1 | 工具 70% | I01 |
| N6 | how to download your own vimeo video | 9 | 官方 4（帮助 3、落地页 1）· 文章 5 | 文章 56%、官方 44%，工具 0 | I14 |
| N7 | is vimeo downloader safe | 10 | 榜单/文章 4 · 工具/软件页 3 · 下载站条目 1 · 站点评测 1 · Wikipedia 1 | 榜单/文章 40% | I13 |
| N8 | download vimeo video on iphone | 9 | 官方 3 · 文章 5 · 新闻 1 | 文章 56%，工具 0 | I16 |
| N9 | vimeo transcript download | 9 | 文章 3 · 官方 1 · 工具 3 · 扩展/下载站条目 2 | 文章+官方 44%、工具 33% | I08 |
| N10 | download part of a vimeo video clip trim | 9 | how-to 5 · 工具 4（含 Vimeo 自家裁剪工具页） | how-to 56%、工具 44% | I09 |
| N11 | extract audio from vimeo video | 9 | how-to/文章 5 · 工具 2 · 软件落地页 1 · PyPI 1 | 文章 56% | I06 |
| N12 | vimeo video downloaded no sound | 9 | 论坛/Issue 5 · 文章 2 · 支持页 1 · 目录 1 | 论坛/Issue 56%（多为播放无声） | I23 |
| N13 | download all videos from vimeo showcase or channel | 9 | 代码库 3 · 文章/博客 4 · 软件落地页 1 · PDF 1 | 文章 44% | I21 |
| N14 | watch vimeo videos offline | 9 | 文章 5 · 官方帮助 1 · 应用商店 3 | 文章 56% | I15 |
| N15 | download embedded vimeo video | 9 | 商店条目 2 · 文章/榜单 3 · 论坛/gist 2 · PyPI 2 | 混合，文章 33% | I17 |
| N16 | vimeo m3u8 download | 10 | 代码库/gist 3 · 论坛 2 · 博客/文章 5 | 开发者内容 100% | I22 |
| N17 | can you download vimeo videos | 9 | 工具 5 · 官方 2 · 榜单 1 · PyPI 1 | 工具 56% | I01 |
| N18 | how to save a vimeo video | 10 | 官方 3 · 商店/市场条目 3 · 文章/社区 2 · 工具 2 | 混合，官方 30%、商店 30% | I02 |
| N19 | download vimeo video without software | 10 | 文章/榜单 6 · 工具 4 | 文章 60% | I02 |
| N20 | vimeo download without download button | 10 | 官方博客 1 · 文章/gist 4 · PyPI 5 | 开发者/绕过取向 | I19 |
| N21 | vimeo download failed | 10 | 论坛/Issue 6 · 厂商文章 2 · 无关 2 | 论坛/Issue 60%，工具 0 | I04 |
| N22 | vimeo video not downloading | 9 | 论坛/Discussion 4 · 官方帮助 1 · 厂商文章 3 · PyPI 1 | 论坛 44%，工具 0 | I03 |
| N23 | download vimeo captions | 9 | 文章/页面 6 · 官方帮助 2 · 工具 1 | 文章+官方 89% | I07 |
| N24 | vimeo to mp4 converter | 9 | 工具 7 · 文章/榜单 2 | 工具 78% | I01 |

N 系列查询都在 2026-10-06 执行；每条只返回 9–10 条标题和 URL。

自动补全（来自 sxo.md §2.2，2026-10-06）：`download vimeo video` 的建议含 with password、transcript、from player link、to iphone、with subtitles；`how to download vimeo` 含 embedded videos、with subtitles、to phone。这些只用作「搜索旅程信号」，没有搜索量。

## 5. 来源登记（读取日期 2026-10-06）

Vimeo 官方页面（2026-10-06 读取：先用 WebFetch，再用 curl 下载页面 HTML、抽取正文逐字核对，以 curl 结果为准；V10 只用过 WebFetch，正文没有引用）：

| 编号 | 页面 | URL | 页面自带日期 | 被引用的内容 |
|---|---|---|---|---|
| V1 | Troubleshooting: I don't see a download button on a video | https://help.vimeo.com/hc/en-us/articles/29641627072017-Troubleshooting-I-don-t-see-a-download-button-on-a-video | Updated November 05, 2025 | 登录用户可下载「available for download by the video owner」的视频；按钮缺失三个原因（Owner's video settings、Plan type、Viewing method）；Free 与 Basic 不能开启下载，也不能下载自己账号里的视频；内嵌播放器不能下载；iOS 与 Android App 的离线列表；联系支持要带上视频链接并说明已排查上述原因 |
| V2 | How to download a video on Vimeo | https://help.vimeo.com/hc/en-us/articles/12426502581265-How-to-download-a-video-on-Vimeo | Updated November 05, 2025 | 「You can download videos from Vimeo if the owner has enabled downloads」；下载公开视频的 source file 需要登录；步骤；视频在新标签页打开时 Windows 右键 Save as、Mac 按住 Control 点击 Save link as；「bulk downloading is not supported」；「Store downloaded files securely to prevent unauthorised distribution」 |
| V3 | How to download a video from my library | https://help.vimeo.com/hc/en-us/articles/29641523095057-How-to-download-a-video-from-my-library | Updated December 03, 2025 | 所有者或付费账号的团队成员；Share 按钮旁的下拉箭头 → Download；需要付费计划；Library 没有批量下载 |
| V4 | How to change downloading permissions on my videos | https://help.vimeo.com/hc/en-us/articles/15059498665745-How-to-change-downloading-permissions-on-my-videos | Updated November 06, 2025 | 需要付费计划；观众只能在 vimeo.com 视频页下载，不能在内嵌播放器下载；所有者始终能看到按钮；Share → Viewer permissions → Downloads 开关；Upload Defaults 的「Download them」 |
| V4b | How to prevent viewers from downloading my videos | https://help.vimeo.com/hc/en-us/articles/16332478147217-How-to-prevent-viewers-from-downloading-my-videos | Updated November 14, 2025 | 「There is currently no way to make videos available to download from the embedded player.」 |
| V5 | How to view or download my video's transcript | https://help.vimeo.com/hc/en-us/articles/12425955868817-How-to-view-or-download-my-video-s-transcript | Updated August 31, 2026 | 「This feature requires a paid plan.」；对象是自己或团队上传的视频；「You must have edit access to the video to view or download its transcript」；仅限已上传或自动生成字幕的视频；路径：选择视频 → 左侧 Languages → 转录旁三点菜单 → Download；「The captions will download as .srt, .vtt, or a .ttml file」 |
| V6 | Viewer features available on the Vimeo app for Android | https://help.vimeo.com/hc/en-us/articles/12425998892817-Viewer-features-available-on-the-Vimeo-app-for-Android | Updated June 13, 2025 | 离线列表；「can only be played within the Vimeo app and cannot be exported or played in other apps」 |
| V7 | How do I download my video from the Vimeo mobile app? | https://help.vimeo.com/hc/en-us/articles/22593576635281-How-do-I-download-my-video-from-the-Vimeo-mobile-app | Updated May 10, 2024 | 自己的视频：Android「Save to device」、iOS「Save to Camera Roll」 |
| V8 | I want to use a Creative Commons video I saw on Vimeo. Do I need permission? | https://help.vimeo.com/hc/en-us/articles/12427604972305-I-want-to-use-a-Creative-Commons-video-I-saw-on-Vimeo-Do-I-need-permission | Updated May 29, 2025 | 「others can use that video according to the applicable license's terms and conditions」；建议联系所有者；「Our members retain copyright ownership of their works」；Vimeo 不保证上传者拥有全部权利；该页没有提到下载 |
| V9 | Vimeo Terms of Service | https://vimeo.com/terms | Last Updated: July 8, 2024 | §5.4 Prohibited Technical Measures（「You will not:」列表，含下载条款、规避访问限制、去水印）；第 6 节 Licenses Granted by You 的开头句（「you own and will retain ownership of all intellectual property rights in and to the content you submit」） |
| V10 | Vimeo 官方落地页 Download & Save Vimeo Videos Online | https://vimeo.com/features/video-editor/download-video | 无 | 只用于调研，正文没有引用 |

第三方官方来源：

| 编号 | 页面 | URL | 页面自带日期 | 被引用的内容 |
|---|---|---|---|---|
| G1 | U.S. Copyright Office, Fair Use | https://www.copyright.gov/fair-use/ | Last Updated: July 2026 | 合理使用的定义；逐案判断；四要素；版权局不能对个人提供具体法律意见 |
| G2 | Google Search Central, FAQ rich result 文档更新记录 | https://developers.google.com/search/docs/appearance/structured-data/faqpage | 2026-05-08、2026-06-15 | FAQ 富结果自 2026-05-07 起不再显示 |
| G3 | Google Search Central, Article structured data | https://developers.google.com/search/docs/appearance/structured-data/article | 无 | Article 没有必填属性；推荐 headline、image、datePublished、dateModified、author |
| G4 | W3C, WebVTT: The Web Video Text Tracks Format | https://www.w3.org/TR/webvtt1/ | Candidate Recommendation Draft，20 May 2026 | 摘要「WebVTT files provide captions or subtitles for video content」；§4.1「A WebVTT file must consist of a WebVTT file body encoded as UTF-8 and labeled with the MIME type text/vtt」；时间区间示例 `00:00:00.000 --> 00:00:25.000`（2026-10-06 curl 读取） |

产品事实来源（源码，读取日期 2026-10-06；行号以读取时为准）：

| 编号 | 事实 | 来源 |
|---|---|---|
| P1 | 支持 vimeo.com、www.vimeo.com、player.vimeo.com；player 链接去掉 `/video` 前缀；路径里必须有数字视频 ID | `backend/src/app/provider/media/vimeo_media.py` L112、L140–156 |
| P2 | 输入含多个链接时只取第一条有效链接；有效链接必须以 http:// 或 https:// 开头 | `website/src/scripts/download/url.ts` L54–56、L79–94；`website/src/scripts/download/workspace.ts` L174 |
| P3 | 返回最高分辨率的渐进式 MP4；没有时取最高画质 AVC 视频轨加最高码率 AAC 音频轨，在浏览器内合成 MP4；不能选分辨率 | `vimeo_media.py` L261–306、L460–519 |
| P4 | 文件名由视频标题加 .mp4 生成 | `vimeo_media.py` L457–459 |
| P5 | 匿名解析；解析限流；每次材料准备 60 秒超时 | `vimeo_media.py` L1、L179–185、L316–320 |
| P6 | 结果卡：缩略图、文件名、「类型 · 时长 · 分辨率 · 大小或 Unknown size」、Download 按钮 | `website/src/scripts/download/workspace-render.ts` L50–70、L196–236 |
| P7 | 保存方式是对象 URL 加隐藏 `<a download>`，即浏览器的普通下载 | `website/src/scripts/download/workspace-download.ts` L115–125 |
| P8 | 下载中离开页面会触发浏览器原生确认框 | `website/src/scripts/download/workspace.ts` L111–121 |
| P9 | 直链 MP4 可续传（自动续传 3 次后提示 Continue）；合并下载不可续传 | `direct-download.ts` L44；`download-methods.ts` L98–118；`client-mux-download.ts` L83–86 |
| P10 | 下载前检查浏览器存储；合并下载按文件大小的两倍加余量检查 | `download-storage-preflight.ts` L210–272，其中 L229–231 |
| P11 | 等待窗口：关闭窗口即取消，不会自动下载 | `anonymous-download.ts` L21–49；`docs/feat/002.下载功能/feat.md`「Website 匿名等待」 |
| P12 | 错误文案与映射 | `website/src/i18n/lang/en-US.ts` L70–94；`website/src/scripts/download/workspace-errors.ts` L71–138 |
| P13 | 扩展 Popup 五行：Video、Direct download、Audio、Subtitle、Image；Audio 行有 M4A/MP3 格式选择；Video 行有音轨开关；有 Trim 区 | `extension/src/popup/components/VideoPanel.vue` L87–200；`extension/src/locales/en-US.json` |
| P14 | 页面内面板四行：Video、Audio、Subtitle、Image | `extension/src/sites/vimeo/content/buttons.ts` L4 |
| P15 | 音频选项只来自 DASH 清单；M4A 是 AAC 透传，MP3 由后台转码 | `extension/src/sites/vimeo/media.ts` L385–420、L1188–1217、L1283–1295；`VideoPanel.vue` L111–122 |
| P16 | 字幕来自播放器配置的 text_tracks，每种语言一项，交给浏览器下载；格式按 URL 后缀判断，默认 VTT | `media.ts` L352、L918–980、L1169–1186 |
| P17 | 裁剪只支持 DASH/HLS；字幕和封面始终是完整文件 | `media.ts` L428–470；`extension/src/locales/en-US.json` 的 `videoPanel.clip.hint` |
| P18 | 每个下载任务消耗 1 次额度；没有按订阅档位的功能门禁 | `extension/src/background/services/DownloadOrchestrator.ts` L812–830 |
| P19 | 扩展 manifest 1.0.1：权限 storage、identity、downloads、offscreen、notifications；主机权限 vimeo.com、www.vimeo.com、player.vimeo.com、*.vimeocdn.com；最低 Chrome 116 | `extension/dist/manifest.json`（发布版待核实） |
| P20 | 默认保存子目录 `vimeoMediaDownloader`；默认文件名模板 `{title}_{quality}_{type}` | `docs/feat/002.下载功能/feat.md`「保存位置」「文件名规则」 |

## 6. 证据口径与限制

- WebSearch 不等于 Google 实时 SERP：只限美国，每个查询最多 10 条标题和 URL，排序和个性化可能不同。PAA、AI Overview、视频结果、广告、精选摘要都观察不到。工具附带的文字摘要是模型生成的，没有当作证据。
- 页面类型主要靠标题和 URL 判断，没有逐个打开；只有 Vimeo 官方页、版权局页面与 W3C WebVTT 规范用 WebFetch 或 curl 读取过。占比 = 该类型条数 ÷ 实际结果数。
- 没有 GSC、GA4、搜索量和排名数据。「优先级」是按证据与产品条件的判断，不是流量预测。
- 没有访问线上站点，也没有在真实浏览器里操作过在线工具或扩展：所有步骤和界面文案来自源码与 `docs/feat/`，发布前必须按 §7 补真机核对与截图。
- Vimeo 官方帮助页和条款页的日期见 §5（帮助页读取时显示的 Updated 日期，条款页 Last Updated: July 8, 2024）。这些页面会变，发布前必须重新读取。
- 没有调研 ko、de、pt 等其他市场；ja、es 只复用 sxo.md，且置信度低。
- 文章与 page_seo 里的 12 个外部链接（Vimeo 帮助页、Vimeo 条款、版权局、W3C）在 2026-10-07 复测，全部返回 HTTP 200；正文内容的核对日期仍是 2026-10-06。

## 7. 需要 hydra 决定或核实

### 2026-10-07 已裁决

- 第 1 条（路由与入口）：路由 `/guides/{slug}/`，索引页 `/guides/`；入口只放页脚 Resources 组，导航不加；只发布 en-US，某语言有正文才生成该语言页面；hreflang 只覆盖实际存在的版本，目前只有英文，不输出。
- 第 2 条（在线工具立场）：hydra 确认「在线只是针对公开视频」，文中在线工具一律写作只针对公开视频，保持本轮写法。
- 第 7 条（作者）：Article 的 `author` 用站点 Organization（运营主体）。没有可署名的真实个人，不虚构 Person。
- 第 8 条（首页能力文案）：已在提交 2976433 改为「highest quality available」「One link at a time」，与文章一致。
- 第 9 条（下载材料刷新限流）：hydra 说「这个你别管」，本任务不处理。已提交代码仍按常量键 `anonymous` 全站共享 6 次 / 60 秒；下面原文写的按 `device_id` / `issued_ip` 限流，是工作区里他人未提交的改动。not-working 一篇不写数字，但其中「also when the tool is busy」只在全站共享桶下成立，按设备限流上线后要删掉这半句。
- 其余各条（3 手机端、4 对比页、5 / 6 / 10 扩展相关、11 真机复现与截图）仍未完成。以下是原文，没有按今天的状态改写。

1. 文章路由与入口：`/guides/{slug}/` 是暂定值。009 现在写明「在源稿确认后补入路由、模板与多语言形态；在此之前站内不出现文章页入口」。需要决定页脚 Resources 是否加指南入口、文章是否只放 en 路径、hreflang 只覆盖实际存在的语言版本（spec §7）。
2. 「所有者关闭下载」的产品立场：源码里在线工具读取的是播放器配置的渐进式 MP4 与 DASH 清单（`vimeo_media.py` `_Config` 不含所有者下载开关），没有检查所有者是否开启下载，也没有真实验证过关闭下载的公开视频会发生什么。而 Vimeo 条款 §5.4 禁止「except as expressly authorized by the Service」的下载。本轮文章对此不做任何断言：按钮缺失篇只指向官方路径和授权，合法性篇如实引用条款，how-to 的开头、方法清单与 Meta 不把在线工具和「没有 Download 按钮」绑定，只写「你有权保存的公开视频」。需要 hydra 确认是否保持这个立场，以及首页合规区块是否要同步。
3. 手机端：在线工具在 iPhone、Android 浏览器上能否完成保存仍未核实。自动补全有 to iphone、to phone 需求。真机验证前不写；文章里只引用 Vimeo 官方 App 的做法。
4. 对比页是否点名竞品：Q10 对比页 80% 全是厂商或联盟榜单。本轮没有写。如果要做，建议只做方法级对比（官方按钮、在线工具、扩展、桌面软件、录屏、命令行），不排名、不点名；点名竞品需要逐项核实对方功能（spec §2.2）。
5. 扩展上架：audio、subtitles 两篇和 how-to、not-working 的扩展块都以 `[EXTENSION_CTA]` 或 `EXTENSION_BLOCK` 占位。上架后需要：回填链接、核实发布版 manifest 权限与最低 Chrome 版本、用发布版截图、核实 Edge、Brave 实测（目前没有）。工作区里有他人未提交的扩展改动（设置里新增「Large file download」分割模式与备用下载方式，对应 `docs/feat/002.下载功能/plans/036`），文章没有写这些；上架前需核对它们是否改变文章里的界面与文件保存描述。
6. 扩展付费卖点文案与源码不一致：Popup 的 `premium.selling.quality`「All video qualities, audio tracks & subtitles」和 `premium.selling.trimming`「Clip trimming included」暗示免费档受限，但源码没有按订阅档位的功能门禁，只有每日次数（P18）。audio、subtitles 两篇不写免费档的功能限制，也不写额度数字（首页政策不写数字）。请确认文案是否要改。
7. 作者署名：Article 结构化数据的 `author` 用 Organization 还是 Person；运营主体 Ginyo Technologies Limited 已在页脚公示。未确认前 page_seo 里的 schema 草案不含 author。
8. 首页能力文案已在工作区（未提交）改为「highest quality available」「One link at a time」，与文章一致；这些改动提交上线前，文章里「不能选分辨率」「一次一个链接」的说法会与线上首页矛盾。
9. 在线工具的下载材料刷新限流（需要评估的产品风险）：`vimeo_media.py` L207–215，按已签名 token 的 `device_id` 固定窗口 6 次 / 60 秒；缺少 `device_id` 的旧 token 按 `issued_ip` 回退，仍为 6 次 / 60 秒。解析接口另按用户或设备限流 3 次 / 10 秒（L179–185）。单个设备或旧 token 的签发 IP 可能遇到「Too many requests. Please try again later.」，不再是全站共享桶；这是读源码得出的结论，没有压测，也没有核对线上配置；`vimeo-downloader-not-working` 只写了「工具限制短时间内的请求数」，没有写数字。
10. 扩展在第三方网站内嵌播放器上的边界：事实表写「不支持其他站点」，但 `extension/dist/manifest.json` 对 `player.vimeo.com` 另注册了 `all_frames` 的 `frame.js`，说明扩展可能在嵌入了 Vimeo 播放器的第三方页面上有部分能力。audio、subtitles 两篇与 how-to 的扩展块沿用事实表（只写 vimeo.com 与 player.vimeo.com 页面，不展开第三方嵌入）。请确认真实边界后再决定是否改写。
11. `vimeo-downloader-not-working` 的每一行触发条件都来自源码阅读，没有在真实浏览器里逐条复现；发布前需要按 `page_seo.md` §11 复现并补一张真实截图。

## 8. 已发现的文档与源码不一致（以源码为准，本轮不改）

- `docs/feat/002.下载功能/feat.md` 说结果卡展示「所有者」；`workspace-render.ts` 只渲染缩略图、文件名、详情行和 Download 按钮（P6）。
- 同一文档「Vimeo 页面下载入口」写三行 Video/Audio/Image；源码和 `en-US.ts` 是四行，含 Subtitle（P14）。
- 事实表与首页 FAQ 的「下载中断可在页面上继续」只适用于直链 MP4；合并（client_mux）下载不能续传，只能重新开始（P9）。文章按源码写。

## 9. 本轮没有做到或证据不足

- 没有真机验证：在线工具的实际界面、倒计时窗口、移动端、Edge/Brave、扩展的实际面板、MP3 转码、字幕文件的真实格式与文件名，以及 `vimeo-downloader-not-working` 里的每条报错。
- 没有任何真实截图；各篇 `page_seo.md` 只列了需要截的清单。
- 没有核实 SRT 是否被扩展支持：源码按 URL 后缀判断格式，Vimeo 默认交付 VTT，其余格式没有实测。
- 没有核实 Vimeo 自动生成字幕是否出现在播放器的 text_tracks 里。
- 没有写入：对比页、片段裁剪页、手机端页、安全性页、封面页、日语与西语页。
