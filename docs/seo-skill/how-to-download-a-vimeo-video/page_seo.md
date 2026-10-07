# page_seo：how-to-download-a-vimeo-video

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `how-to-download-a-vimeo-video` |
| 建议运行时路由 | `/guides/how-to-download-a-vimeo-video/`（2026-10-07 定稿；索引页 `/guides/`，入口在页脚 Resources） |
| 页面类型 | 信息/文章页（spec §4） |
| 核心搜索意图 | 方法型：我想把一个 Vimeo 视频存成文件，该用哪种办法、怎么操作 |
| 页面目标 | 用「官方按钮优先 → 在线工具 → 扩展」的决策顺序，让用户在一个页面里完成任务链路：判断、步骤、限制、失败恢复、下一步 |
| 主要转化动作 | 点击正文中的「Vimeo Downloader online tool」链接进入首页在线工具 |
| 源语言 | en-US |
| 目标市场 | 美国英语 |
| 目标 locale / x-default | 只发布 en-US。只有一个语言版本，按规则不输出 hreflang 与 x-default；其他 locale 待本地化 |
| 母语审校 | 待确认 |
| 源语言确认 | 2026-10-07 hydra 确认源稿（「在线只是针对公开视频」） |
| 运行时同步 | 已同步到 `website/src/content/guides/how-to-download-a-vimeo-video/en-US.md`（改动见 `docs/feat/009.SEO与增长/changelog.md` 2026-10-07）；构建与 module-scripts 通过 |
| 真实页面验证 | 本地 dev（真实后端）桌面 1280px、手机 390px 已验证：无横向滚动、锚点可达、表格手机卡片；线上未部署、未验证 |

## 2. 与首页的分工（不抢词）

- 首页承接工具意图：vimeo downloader、vimeo video downloader、download vimeo video online。SERP 以工具页为主（README §4：Q1–Q4、N5、N17、N24）。
- 本页只承接「如何下载」的方法型意图。SERP 是混合型：Q6 文章 30%、商店 20%、工具 20%；N19 文章 60%；Q5 文章 56%；N18 官方与商店条目各 30%。
- 本页对首页的增量：官方 Download 按钮的真实步骤与前提、Vimeo App 离线列表（只能看不能导出）、在线工具的链接格式与失败边界、结果卡能看到什么、中断后能否续传、合规引文。首页没有这些。
- 合并进本页的查询：Q5、Q6、N4（播放器链接）、N14（离线观看）、N18、N19。没有为它们另建页面。
- 蚕食风险：「how to download vimeo videos」与首页的「download vimeo video」属同一个簇。用正文链接（首页=工具入口，本页=步骤与决策）区分；上线后用 GSC 的 query 维度观察两页是否互抢，必要时调整本页 Title。

## 3. 已用事实与出处

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| A1 | 在线工具免费、不需要账号 | `website/src/i18n/lang/en-US.ts` FAQ「Do I need an account」「Is it free」；事实表 | 源文案 |
| A2 | 接受 vimeo.com、www.vimeo.com、player.vimeo.com；player 链接形如 `player.vimeo.com/video/ID`；链接必须含数字视频 ID | P1 | 源码 |
| A3 | 链接须以 `https://`（或 http://）开头，否则提示 "This is not a valid URL." | P2；`en-US.ts` L72 | 源码 |
| A4 | 粘贴多个链接时只读第一条有效链接；一次一个，没有批量 | P2 | 源码 |
| A5 | 返回 Vimeo 为该视频提供的最高画质 MP4，不能选分辨率 | P3；首页 helperText 与对比表的工作区未提交改动（「highest quality available」「One link at a time」） | 源码 |
| A6 | 结果卡：文件名（标题 + .mp4）、「类型 · 时长 · 分辨率 · 大小」、缩略图（有时）、Download 按钮；大小未知显示 "Unknown size" | P4、P6 | 源码 |
| A7 | 按钮状态依次为 Checking browser storage... / Downloading... / Preparing MP4... | `workspace-download.ts` L392、L694、L714；`en-US.ts` L47–49 | 源码 |
| A8 | 下载中离开页面浏览器会弹确认框 | P8 | 源码 |
| A9 | 文件通过浏览器普通下载保存 | P7 | 源码 |
| A10 | 直链 MP4 中断后自动重试，失败显示 Continue；需要合并的视频不能续传，只能重新开始 | P9 | 源码 |
| A11 | 超大或大小未知的文件可能被拒；下载前检查浏览器存储 | `en-US.ts` 对比表「Large files」；P10 | 首页文案 + 源码 |
| A12 | 私密、密码保护、付费视频不保证可用；不去除 DRM、不解锁访问控制 | `en-US.ts` FAQ「Can it download private…」；事实表 | 首页文案 |
| A13 | 官方 Download 按钮：下载公开视频的 source file 需登录；按钮在播放器下方；弹窗选文件大小；点下载图标；浏览器可能在新标签页打开，Windows 右键 Save as、Mac 按住 Control 点击 Save link as；不支持批量；建议安全存放文件 | V2（Updated November 05, 2025） | curl 读取 HTML 逐字核对 |
| A14 | 观众只能在 vimeo.com 视频页下载，不能在内嵌播放器下载 | V4（Updated November 06, 2025）、V1、V4b | curl 读取 |
| A15 | 自己的视频：Library → Share 旁下拉箭头 → Download → 版本旁的下载图标；需要付费计划；付费账号的团队成员也可用 | V3（Updated December 03, 2025） | curl 读取 |
| A16 | Vimeo App 离线列表只能在 App 内播放，不能导出 | V6（Updated June 13, 2025，Android 页） | curl 读取 |
| A17 | 自己的视频在手机 App：Android「Save to device」、iPhone「Save to Camera Roll」 | V7（Updated May 10, 2024） | curl 读取 |
| A18 | Vimeo 条款 §5.4 引文，Last Updated July 8, 2024 | V9 | curl 读取页面 HTML，引文与页面文本逐字一致 |
| A19 | 运营主体 Ginyo Technologies Limited；与 Vimeo, Inc. 无关联；Vimeo 是 Vimeo, Inc. 的商标 | 事实表；`en-US.ts` scope.compliance；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 源码 |
| A20 | 扩展块：Video/Audio/Subtitle/Image 四行、选画质、M4A 与 popup 中的 MP3、VTT、DASH/HLS 裁剪、JPEG 封面、跨标签队列；Chrome 与 Chromium 系；只在 vimeo.com 与 player.vimeo.com；不支持 Vimeo App 与其他站点；免费每日额度与 Unlimited；登录可选 | `en-US.ts` softwareApplication.featureList、comparison、FAQ；P13–P17；P18 | 源码与首页文案 |

## 4. 当前行为与待实施目标的差异

- 扩展尚未在 Chrome Web Store 上架，安装链接是占位。正文里所有扩展内容都在 `EXTENSION_BLOCK` 中，上架前发布时整块删除。en-US.md 里共 4 处块：方法列表的一条、「Very large files」一条末尾的一句（行内）、Option 4 整节（含 `[EXTENSION_CTA]`）、FAQ 第一问末尾的一句（行内）。全部删除后正文不再出现扩展（已逐段检查）。
- 在线工具大文件被拒时，页面本身会引导到扩展（UI 事实）；上架前这条引导是死链，属于首页的已知问题，本页不重复。
- 首页的画质与批量文案已在工作区（未提交）修正；提交上线前，本页「不能选分辨率」「一次一个链接」的说法会与线上首页不一致。

## 5. SERP 证据与限制

- 证据：README §4 的 Q5、Q6、N4、N14、N18、N19（意图归并依据）；Q1–Q4、N17（首页占位，用于划分边界）。
- 限制：WebSearch 不等于 Google 实时 SERP，只限美国，每查询 ≤10 条标题与 URL；类型按标题与 URL 判断；看不到 PAA、AI Overview、精选摘要；没有搜索量与 GSC。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title（扩展上架前） | How to Download a Vimeo Video: Button or Online Tool | 52 |
| Title（扩展上架后） | How to Download a Vimeo Video: Button, Online Tool or Extension | 63 |
| Meta Description（上架前后通用） | Use Vimeo's Download button when the owner enables it. For a public video you have the right to save, an online tool saves an MP4. Steps and limits. | 148 |
| H1 | How to download a Vimeo video | 29 |

- 长度只作检查提示。Title、Meta、H1 表达同一目标：告诉用户有哪些办法、先用哪个。Title 带冒号后的方法名是为了贴近 SERP 里「how to download Vimeo videos」的写法，H1 保持短。
- Meta 里没有写扩展，上架前后都准确。
- 开头、方法清单与 Meta 都没有把在线工具和「没有 Download 按钮」绑在一起，只写「你有权保存的公开视频」。原因：源码里在线工具不检查所有者是否开启下载，Vimeo 条款 §5.4 又限定下载须经服务明示授权；把工具写成「没有按钮时的办法」会等于推荐用它越过所有者的选择。该立场待 hydra 确认（README §7 第 2 条）。

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/`（首页在线工具） | Vimeo Downloader online tool / Vimeo Downloader home page | 路由已存在 |
| 站内出 | `/guides/vimeo-download-button-missing/` | why a Vimeo video has no Download button | 暂定路由 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | Is it legal to download Vimeo videos? / Our legal guide | 暂定路由 |
| 站内出 | `/guides/vimeo-downloader-not-working/` | Vimeo Downloader not working | 暂定路由 |
| 站内出（扩展块） | `/ext-pricing/` | see Pricing | 路由已存在 |
| 站外出 | Vimeo 官方帮助 V2、V3、V6、V7；条款 V9 | 描述性锚文本 | 发布前复核仍有效 |
| 站内入 | 首页 FAQ / 对比区块的上下文链接 | 待定 | 009 当前没有文章入口，需要 hydra 决定（README §7 第 1 条） |

## 8. 结构化数据

- 只用 Article + BreadcrumbList。不用 HowTo（Google 已不再显示该富结果，G2 同类通告）。不加 FAQPage：FAQ 富结果自 2026-05-07 起不再显示（G2：文档更新记录 2026-05-08、2026-06-15），可见 FAQ 保留给读者，不承诺富结果。
- Article 字段：`headline` = H1；`image` = 真实截图（见 §9，截图完成前省略）；`datePublished`、`dateModified` 在发布时按真实日期填，现在不写占位；`author` 未确认（README §7 第 7 条），确认前省略。Google 文档：Article 没有必填属性（G3）。
- 已实施（2026-10-07）：Article + BreadcrumbList（Home → Guides → 本文）。`author` 与 `publisher` 都引用站点 Organization（运营主体），不虚构个人作者；`image` 仍省略；日期 2026-10-07。
- BreadcrumbList：Home → 本页。是否有 `/guides/` 索引页待定，没有索引页就只有两级。
- 所有声明都必须与可见内容一致。

## 9. 媒体决策（需要真实截图，不用占位图）

| 文件名 | 内容 | alt | 说明 |
|---|---|---|---|
| `online-tool-result-card.png` | 桌面浏览器里解析一个公开视频后的结果卡：文件名、详情行、Download 按钮 | Vimeo Downloader result card showing the file name, duration, resolution and file size with a Download button | 必须用真实运行的在线工具截图；测试视频用自己上传的公开视频，避免第三方内容 |
| `online-tool-downloading-state.png`（可选） | Download 按钮显示 "Downloading..." 与百分比 | Download button showing progress while the MP4 downloads | 可选 |

- 不放 Vimeo 官方界面的截图（第三方界面，版权与商标待 hydra 决定）；正文已用文字描述官方步骤并链接官方帮助。
- 移动端截图不做：移动端可用性未核实。
- 图片需声明宽高，首屏之后的图片延迟加载（spec §8）。

## 10. 发布条件

- 产品条件：满足（在线工具今天能完成任务）。分类为「可立即发布」。
- 工程前置：
  1. 路由、模板、站内入口与 sitemap、hreflang 范围确定并补入 009（README §7 第 1 条）。
  2. 补真实截图；确认首页的工作区未提交文案改动已上线。
  3. 发布前重读 V1、V2、V3、V4、V4b、V6、V7、V9，确认仍有效（帮助页会更新）。
  4. 上架前发布：删除所有 `EXTENSION_BLOCK` 与 `[EXTENSION_CTA]`，Title 用「上架前」版本。
  5. 扩展上架后：启用块，回填 CTA 链接，Title 换「上架后」版本，核实块内每一句仍与发布版一致。
- 页面里要显示「Last reviewed」日期（现为 2026-10-06），随事实复核更新。

## 11. 待核实（正文没有写）

- 在线工具在 iPhone、Android 浏览器上是否可用。
- 在线工具对「所有者关闭了下载按钮的公开视频」的实际行为（源码没有检查所有者的下载开关，未实测）。正文只陈述 Vimeo 条款与按钮机制，没有断言工具会或不会工作。
- 主按钮现在的文案是 "Paste Vimeo Video Link"，与实际动作（提交解析）是否匹配仍待核实（sxo.md）。正文只说「main button」，不引用文案。
- 结果卡缩略图是否总是出现，真机截图时核对。
- 倒计时窗口（"Download queued"）当前配置下不出现，所以正文没有写；策略收紧后需要补一步。
- Edge、Brave 上扩展的实测，所以正文只写「Chrome and other Chromium-based browsers」。
