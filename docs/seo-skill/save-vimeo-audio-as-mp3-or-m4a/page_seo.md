# page_seo：save-vimeo-audio-as-mp3-or-m4a

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。
> 发布状态：待插件上架。整页依赖扩展，扩展上架前不得发布。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `save-vimeo-audio-as-mp3-or-m4a` |
| 建议运行时路由 | `/guides/save-vimeo-audio-as-mp3-or-m4a/`（暂定，待定） |
| 页面类型 | 信息/文章页（spec §4），方法型 |
| 核心搜索意图 | 方法型：只保存 Vimeo 视频的音频，格式 MP3 或 M4A |
| 页面目标 | 让用户用扩展完成「只存音频」，并清楚两种格式的区别、哪些视频做不了、在线工具为什么做不了 |
| 主要转化动作 | 安装扩展（`[EXTENSION_CTA]`，上架后启用） |
| 源语言 | en-US |
| 目标市场 | 美国英语 |
| 目标 locale / x-default | 本轮只有 en-US。其他 locale 待确认 |
| 母语审校 | 待确认 |
| 源语言确认 | 待 hydra 确认 |
| 运行时同步 | 未同步 |
| 真实页面验证 | 未验证 |

## 2. 与其他页面的分工

- 首页有「Audio as M4A or MP3」卡片（工具首页的扩展区块）。本页是它的完整教程，首页卡片不重复步骤。sxo.md 把这类意图判为「功能长尾与页面类型错配（HIGH）」。
- 在线工具不输出音频，正文明确说明并指向 how-to 指南。
- 不与首页抢词：首页承接 vimeo downloader 等工具词；本页只承接 vimeo to mp3 与提取音频。

## 3. 已用事实与出处

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| E1 | 在线工具只输出 MP4 视频，不输出单独的音频 | 事实表；P3；`en-US.ts` FAQ「Which formats do I get?」 | 源码与文案 |
| E2 | 页面内面板固定四行：Video、Audio、Subtitle、Image，位于视频标题附近（优先插在 action bar 前，找不到则插在 h1 后） | P14；`extension/src/sites/vimeo/content/buttons.ts` L1–5、L302–322 | 源码 |
| E3 | Audio 行有 Best Audio（最高码率的音轨）和各码率按钮；码率按 kbps 标注；下载中面板按钮被锁定并显示进度 | `extension/src/sites/vimeo/media.ts` L1188–1217（kbps 标签）、L1283–1295（Best Audio）、L1370–1377（按码率降序）；`buttons.ts` L211–264 | 源码 |
| E4 | 页面面板只存 M4A；MP3 只能在 popup 里选 | `docs/feat/002.下载功能/feat.md`「音频格式选择」：页面注入面板不提供格式选择；`en-US.ts` 功能卡「Audio as M4A or MP3」 | 文档与首页文案 |
| E5 | popup 的 Audio 行：码率下拉 + 格式下拉（M4A、MP3）+ 下载箭头；MP3 在后台转码；超长音频转码期间进度可能停在接近完成处；格式选择不持久保存，重开 popup 回到 M4A | `extension/src/popup/components/VideoPanel.vue` L87–155、L349–355；`docs/feat/002.下载功能/feat.md` L181 | 源码与文档 |
| E6 | M4A 是视频自带的 AAC 音轨，不转码；音频选项只来自 DASH 清单且要求 mp4a 编码；文件扩展名：M4A 由 MIME `audio/mp4` 推出 `.m4a`，MP3 目标格式显式覆盖为 `.mp3` | `media.ts` L369、L1061–1067、L1470–1472；`extension/src/background/services/downloadFilename.ts` L44–82；`core/constants/resource.ts`（`AUDIO_TARGET_FORMATS`、`MIME_EXTENSION_MAP`）；`VideoPanel.vue` L111–122 | 源码 |
| E7 | 视频没有独立音频流时，页面面板的 Audio 行显示禁用的「-」，popup 显示「Unavailable」 | `buttons.ts` L153–176、L268–285；`extension/src/locales/en-US.json` L158 `videoPanel.unavailable` | 源码 |
| E8 | popup 状态：Scanning video…、No downloadable video on this page 与 Rescan、This page isn't a Vimeo page 与 Open Vimeo | `extension/src/locales/en-US.json` `videoPanel.*` | 源码 |
| E9 | 文件落在下载目录下的子目录，默认 `vimeoMediaDownloader`，可在设置里改 | `docs/feat/002.下载功能/feat.md` L185 | 文档 |
| E10 | 仅公开视频；不保证私密、密码保护、付费视频；不去除 DRM；只在 vimeo.com 与 player.vimeo.com 页面；不支持 Vimeo 桌面或手机 App、其他站点 | 事实表；`en-US.ts` scope；P19（host_permissions）；`extension/dist/manifest.json`（content_scripts.matches：vimeo.com、www.vimeo.com、player.vimeo.com） | 源码与文案 |
| E11 | 每个下载任务消耗 1 次额度；免费档有每日额度；付费 Unlimited 去掉每日限制；登录可选 | P18（`DownloadOrchestrator.ts` L812–830）；`en-US.ts` FAQ、对比表 | 源码 |
| E12 | 运营主体与非关联声明 | 事实表；`en-US.ts` scope.compliance；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 源码 |

## 4. 当前行为与待实施目标的差异

- 扩展尚未在 Chrome Web Store 上架。全文都以扩展为前提，`[EXTENSION_CTA]` 出现 2 次（开头一次、结尾一次）。上架前不发布；上架后回填链接。
- 额度数字（免费档每日几次）不写：首页政策是不写额度数字（009 feat.md），它是后端配置。
- 付费卖点文案「All video qualities, audio tracks & subtitles」暗示免费档受限，但源码没有按订阅档位的功能门禁，只有每日次数。正文不写免费档的功能限制（README §7 第 6 条）。

## 5. SERP 证据与限制

- 证据（WebSearch，US，2026-10-06）：Q8「vimeo to mp3」文章 56%（厂商 how-to 5、软件落地页 2、对比 1、工具 1）；N11「extract audio from vimeo video」how-to/文章 5、工具 2、软件落地页 1、PyPI 1（文章 56%）。标题示例：「3 Ways to Convert Vimeo to MP3 on Mac/PC (Free Included)」。
- 自动补全：vimeo to mp3 converter（sxo.md §2.2）。
- 增量依据：竞品多推荐桌面软件或录屏；本页只讲本产品的真实流程与限制，并说明在线工具做不到。
- 限制：WebSearch 不等于 Google 实时 SERP；只限美国；类型按标题与 URL 判断；没有搜索量。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | Vimeo to MP3: How to Save a Video's Audio as M4A or MP3 | 55 |
| Meta Description | Save only the audio of a public Vimeo video as M4A, or as MP3 from the extension popup. Steps, limits, and why the online tool can't do it. | 139 |
| H1 | How to save the audio from a Vimeo video as M4A or MP3 | 54 |

- Title 用「Vimeo to MP3」贴合 SERP 常见搜索写法，H1 用完整句式。三者表达同一任务。

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/`（首页） | online tool | 路由已存在 |
| 站内出 | `/guides/how-to-download-a-vimeo-video/` | How to download a Vimeo video | 暂定路由 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | Is it legal to download Vimeo videos? / legal guide | 暂定路由 |
| 站内出 | `/ext-pricing/` | Pricing | 路由已存在 |
| 站内入 | 首页「Audio as M4A or MP3」卡片、how-to 指南扩展块 | | 009 当前没有文章入口，待 hydra 决定 |

## 8. 结构化数据

- Article + BreadcrumbList。不加 FAQPage、HowTo（G2）。
- Article：`headline` = H1；`datePublished`、`dateModified` 发布时按真实日期填；`author` 未确认，省略；`image` 用 §9 的真实截图，截图完成前省略。
- 不为本页单独声明 SoftwareApplication：扩展的实体已在首页声明，页面里没有价格或评分。

## 9. 媒体决策（需要真实截图，不用占位图）

| 文件名 | 内容 | alt | 说明 |
|---|---|---|---|
| `extension-page-panel-audio-row.png` | Vimeo 视频页上扩展的四行面板，Audio 行显示 Best Audio | The Vimeo Downloader panel on a Vimeo video page with the Audio row showing Best Audio | 上架后用发布版截图；用自己上传的公开视频，避免第三方内容 |
| `extension-popup-audio-mp3.png` | popup 里 Audio 行，格式下拉选中 MP3 | The Vimeo Downloader popup with the Audio row's format menu set to MP3 | 同上 |

## 10. 发布条件

- 产品条件：待插件上架。核心任务依赖扩展，在线工具只输出 MP4。
- 上架后需要：
  1. 回填 `[EXTENSION_CTA]` 的链接；用发布版重新核对 §3 每条界面描述（面板位置、按钮文案 Best Audio、Unavailable、Rescan、设置里的默认子目录）。
  2. 用发布版实测一次 M4A 和 MP3 下载，确认文件格式、文件名、转码在较长音频上的表现。
  3. 补两张真实截图。
  4. 路由、入口、sitemap、hreflang 范围同 how-to 指南（README §7 第 1 条）。

## 11. 待核实（正文没有写）

- Edge、Brave 上的实测（正文只写「Chrome or other Chromium-based browser」）。
- 免费档是否受功能限制（README §7 第 6 条）。
- MP3 的码率、质量与转码耗时没有数据，正文不写。
- 发布版 manifest 的最低 Chrome 版本（1.0.1 构建是 116）和权限（storage、identity、downloads、offscreen、notifications）：正文没有写，不同版本可能不同。
- 视频只有渐进式 MP4（没有 DASH 清单）时 Audio 行为空，来自源码推断，没有在真实视频上验证过。
- 嵌入在第三方网站里的 Vimeo 播放器：manifest 给 player.vimeo.com 另注册了 `all_frames` 的 `frame.js`，说明扩展可能在这类页面上有部分能力；事实表写「不支持其他站点」，正文沿用事实表（只写 vimeo.com 与 player.vimeo.com 页面，不展开第三方嵌入）。待 hydra 确认真实边界（README §7）。
- 「Open the video ... and let the page finish loading」：没有核实播放与否是否影响面板出现，正文只写等待页面加载。
