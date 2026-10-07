# page_seo：download-vimeo-subtitles-as-vtt

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。
> 发布状态：待插件上架。整页依赖扩展，扩展上架前不得发布。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `download-vimeo-subtitles-as-vtt` |
| 建议运行时路由 | `/guides/download-vimeo-subtitles-as-vtt/`（暂定，待定） |
| 页面类型 | 信息/文章页（spec §4），方法型 |
| 核心搜索意图 | 方法型：把 Vimeo 视频自带的字幕或 captions 存成文件（VTT） |
| 页面目标 | 让用户用扩展保存某个语言的字幕文件，并清楚它是什么（单独的 VTT、不是文字稿、不烧进视频）、做不了什么（SRT、翻译、在线工具）、所有者另有官方路径 |
| 主要转化动作 | 安装扩展（`[EXTENSION_CTA]`，上架后启用） |
| 源语言 | en-US |
| 目标市场 | 美国英语 |
| 目标 locale / x-default | 本轮只有 en-US。其他 locale 待确认 |
| 母语审校 | 待确认 |
| 源语言确认 | 待 hydra 确认 |
| 运行时同步 | 未同步 |
| 真实页面验证 | 未验证 |

## 2. 与其他页面的分工

- 首页：功能卡有 Subtitle 一项（扩展区块）。本页是它的完整教程，首页不重复步骤。
- `save-vimeo-audio-as-mp3-or-m4a`：同一扩展的另一行（Audio）。意图不同，不互相链接，避免把两个意图写成一张互链网。
- `how-to-download-a-vimeo-video`：在线工具只输出 MP4 的说明交给它；本页只链接。
- 已合并：Q9「download vimeo video with subtitles」与 N23「download vimeo captions」是同一任务（拿到字幕）。「带字幕的视频文件」这个子意图在正文里直接回答为「不合并进视频」，没有为它另做页面。
- 不另做「vimeo transcript」页：Vimeo 官方 V5 已完整覆盖所有者的文字稿下载，本页只用一节指向它。

## 3. 已用事实与出处

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| S1 | 在线工具只输出 MP4 视频，不输出字幕文件 | 事实表；P3；`en-US.ts` FAQ「Which formats do I get?」 | 源码与文案 |
| S2 | 页面面板有 Subtitle 行，每条字幕轨一个按钮，标签是播放器给出的名称（通常是语言名） | `extension/src/sites/vimeo/content/buttons.ts` L153–196；`extension/src/sites/vimeo/media.ts` L1169–1186（`buildSubtitleOptions`，`label: track.label`） | 源码 |
| S3 | 字幕来自播放器配置的 `request.text_tracks`；有 url 与语言标识才收；只收 https 且在 Vimeo 域或 CDN 白名单内的地址；按 url 与语言去重 | `media.ts` L352、L927–958；`extension/src/sites/vimeo/shared.ts` L225–242 | 源码 |
| S4 | 保存的格式由地址后缀决定：`.ttml/.dfxp/.xml` → ttml，`.srt` → srt，其余按 Vimeo 默认交付的 WebVTT 处理为 `.vtt`；不做格式转换。正文写「normally WebVTT，不能选 SRT」 | `media.ts` L969–980；`core/constants/resource.ts`（`MIME_TYPE_MAP.subtitle`、`RESOURCE_EXTENSION_MAP.subtitle`） | 源码 |
| S5 | 字幕是单个文件，直接交给浏览器下载管理器保存，不经过合并链路 | `core/constants/resource.ts` L40–61（`isBrowserManagedSourceKind`）；`media.ts` L1169 注释 | 源码 |
| S6 | popup 的 Subtitle 行是语言下拉 + 下载箭头；没有字幕时下拉显示「Unavailable」、下载按钮禁用；页面面板显示禁用的「-」 | `extension/src/popup/components/VideoPanel.vue` L87–155；`buttons.ts` L153–176、L268–285；`extension/src/locales/en-US.json` L147、L158；`docs/feat/002.下载功能/feat.md` L178 | 源码与文档 |
| S7 | 字幕始终下载完整文件，Trim 不作用于字幕 | `docs/feat/002.下载功能/feat.md` L184；`en-US.json` L163 `videoPanel.clip.hint`（"Subtitles and the cover always download the full file."） | 文档与文案 |
| S8 | 文件写入下载目录下的子目录，默认 `vimeoMediaDownloader`，可在设置里改；最终文件名按设置里的文件名模板渲染，扩展名为 `.vtt` | `feat.md` L185–187；`extension/src/background/services/downloadFilename.ts` L44–82 | 源码与文档 |
| S9 | Vimeo 官方：转录文字下载需要付费计划；只对你或你的团队上传的视频；需要对视频有编辑权限；仅限已上传或自动生成字幕的视频；路径是选择视频 → 左侧 Languages → 转录旁的三点菜单 → Download；文件为 .srt、.vtt 或 .ttml | V5（https://help.vimeo.com/hc/en-us/articles/12425955868817-How-to-view-or-download-my-video-s-transcript），Updated August 31, 2026；2026-10-06 curl 读取 HTML 逐字核对 | 官方帮助 |
| S10 | WebVTT 是 W3C 的字幕与 captions 文本格式；文件为 UTF-8 编码，类型 `text/vtt`；每条字幕是时间区间（示例 `00:00:00.000 --> 00:00:25.000`）加文本 | G4：W3C《WebVTT: The Web Video Text Tracks Format》Candidate Recommendation Draft，20 May 2026，https://www.w3.org/TR/webvtt1/，2026-10-06 curl 读取；摘要「WebVTT files provide captions or subtitles for video content」，§4.1「A WebVTT file must consist of a WebVTT file body encoded as UTF-8 and labeled with the MIME type text/vtt」 | 标准文档（草案状态） |
| S11 | 仅公开视频；不保证私密、密码保护、付费视频；不去除 DRM；只在 vimeo.com 与 player.vimeo.com 页面；不支持 Vimeo 桌面或手机 App、其他站点；免费档有每日额度，付费 Unlimited 去掉每日限制；登录可选；每个下载任务消耗 1 次额度（字幕也是一个任务） | 事实表；P18（`DownloadOrchestrator.ts` L619、L817）；P19；`extension/dist/manifest.json` | 源码与文案 |
| S12 | 运营主体与非关联声明 | 事实表；`en-US.ts` scope.compliance；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 源码 |

## 4. 当前行为与待实施目标的差异

- 扩展尚未在 Chrome Web Store 上架。全文以扩展为前提，`[EXTENSION_CTA]` 出现 2 次（开头、结尾）。上架前不发布；上架后回填链接。
- 额度数字（免费档每日几次）不写：首页政策是不写额度数字（009 feat.md）。
- 付费卖点文案「All video qualities, audio tracks & subtitles」暗示免费档受限，但源码没有按订阅档位的功能门禁，只有每日次数。正文不写免费档的功能限制（README §7 第 6 条）。
- 字幕格式「normally WebVTT」依据源码注释「Vimeo 默认交付的 WebVTT」与 `/texttrack/{id}.vtt` 的地址形态，没有在真实视频上核对过；发布前必须实测（§11 第 1 条）。

## 5. SERP 证据与限制

- 证据（WebSearch，US，2026-10-06）：Q9「download vimeo video with subtitles」共 9 条，文章/帮助 7、工具 1、目录 1（文章 78%）；N23「download vimeo captions」共 9 条，文章/页面 6、官方帮助 2、工具 1（文章加官方 89%）。
- 官方帮助页在结果中，对象是所有者（V5 及 On Demand 的字幕下载页）。观众侧、不需要所有者权限的路径是本页的增量：保存播放器已经提供的字幕轨。
- 限制：WebSearch 不等于 Google 实时 SERP；只限美国；类型按标题与 URL 判断；没有搜索量；看不到 PAA。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | How to Download Vimeo Subtitles and Captions as a VTT File | 58 |
| Meta Description | Save a Vimeo video's subtitles or captions as a .vtt file with the browser extension. Steps, what you get, limits, and why the online tool can't do it. | 151 |
| H1 | How to download subtitles from a Vimeo video as VTT | 51 |

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/`（首页） | online tool | 路由已存在 |
| 站内出 | `/guides/how-to-download-a-vimeo-video/` | How to download a Vimeo video | 暂定路由 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | Is it legal to download Vimeo videos? / legal guide | 暂定路由 |
| 站内出 | `/ext-pricing/` | Pricing | 路由已存在 |
| 站外出 | V5（Vimeo 帮助）、G4（W3C WebVTT） | 以官方页面标题为锚文本 | 发布前复核 |
| 站内入 | 首页 Subtitle 功能卡、how-to 指南扩展块 | | 009 当前没有文章入口，待 hydra 决定 |

## 8. 结构化数据

- Article + BreadcrumbList。不加 FAQPage、HowTo（G2）。
- Article：`headline` = H1；`datePublished`、`dateModified` 发布时按真实日期填；`author` 未确认，省略；`image` 用 §9 的真实截图，截图完成前省略。
- 不为本页单独声明 SoftwareApplication：扩展的实体已在首页声明。

## 9. 媒体决策（需要真实截图，不用占位图）

| 文件名 | 内容 | alt | 说明 |
|---|---|---|---|
| `extension-page-panel-subtitle-row.png` | Vimeo 视频页上扩展的四行面板，Subtitle 行显示按语言命名的按钮 | The Vimeo Downloader panel on a Vimeo video page with the Subtitle row showing one button per language | 上架后用发布版截图；用自己上传、带至少一条字幕的公开视频，避免第三方内容 |

popup 步骤不配图：三步操作简单，一张面板图已能定位 Subtitle 行。

## 10. 发布条件

- 产品条件：待插件上架。核心任务依赖扩展，在线工具只输出 MP4。
- 上架后需要：
  1. 回填 `[EXTENSION_CTA]` 的链接；用发布版重新核对 §3 的界面描述（Subtitle 行位置与标签、Unavailable、Rescan、设置里的默认子目录）。
  2. 用发布版在一个带字幕的真实公开视频上实测：行里出现的标签文案、保存下来的文件名与扩展名（是否恒为 `.vtt`）、文件内容是否以 `WEBVTT` 开头。
  3. 补一张真实截图。
  4. 路由、入口、sitemap、hreflang 范围同 how-to 指南（README §7 第 1 条）。
  5. 发布前重读 V5 与 G4，核对「Updated」日期与措辞（W3C 文档是草案状态，状态可能变化）。

## 11. 待核实（正文没有写）

1. 真实视频上字幕轨的标签与文件格式（上面 §10 第 2 条）。正文对格式写的是「normally WebVTT」。
2. 自动生成字幕（auto-generated）是否会出现在播放器配置的 `text_tracks` 里：没有验证。V5 说所有者可以下载自动生成字幕的转录，但那是另一条路径；正文没有对观众侧能否保存自动生成字幕作任何断言。
3. 同一语言有多条轨道时的表现：代码按语言标识去重，只保留第一条（`seenLangs`），真实视频上是否出现这种情形没有验证；正文没有写这个限制。
4. 页面面板里字幕按钮在下载过程中是否显示进度：没有验证，正文没有写。
5. On Demand（付费租售）视频的字幕：没有验证；正文只写「私密、密码保护、付费视频不保证」。
6. 嵌入第三方网站的 Vimeo 播放器：同 audio 页，事实表称不支持其他站点，manifest 对 player.vimeo.com 另有 `all_frames` 脚本，边界待 hydra 确认。
7. Edge、Brave 上的实测（正文只写「Chrome or other Chromium-based browser」）。
8. 「player that supports external subtitle files」是通用说明，没有指名具体播放器，也没有核实任何播放器的行为。
