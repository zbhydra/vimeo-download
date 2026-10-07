# page_seo：vimeo-downloader-not-working

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `vimeo-downloader-not-working` |
| 建议运行时路由 | `/guides/vimeo-downloader-not-working/`（2026-10-07 定稿；索引页 `/guides/`，入口在页脚 Resources） |
| 页面类型 | 信息/文章页（spec §4），排障型；本站在线工具的错误文案参考页 |
| 核心搜索意图 | 排障型：Vimeo 下载器不工作、下载失败、视频下载不了；以及用户直接搜索工具报错原文 |
| 页面目标 | 让用户对照工具现有的报错文案，弄清原因并完成恢复动作，或明确得知该视频不受支持 |
| 主要转化动作 | 回到首页在线工具重试（「Vimeo Downloader online tool」链接） |
| 源语言 | en-US |
| 目标市场 | 美国英语 |
| 目标 locale / x-default | 只发布 en-US。只有一个语言版本，按规则不输出 hreflang 与 x-default；其他 locale 待本地化 |
| 母语审校 | 待确认 |
| 源语言确认 | 2026-10-07 hydra 确认源稿（「在线只是针对公开视频」） |
| 运行时同步 | 已同步到 `website/src/content/guides/vimeo-downloader-not-working/en-US.md`（改动见 `docs/feat/009.SEO与增长/changelog.md` 2026-10-07）；构建与 module-scripts 通过 |
| 真实页面验证 | 本地 dev（真实后端）桌面 1280px、手机 390px 已验证：无横向滚动、锚点可达、表格手机卡片；线上未部署、未验证 |

## 2. 与其他页面的分工

- 首页：工具意图。本页是工具报错之后的帮助页，不抢首页的词。
- `vimeo-download-button-missing`：官方 Download 按钮缺失。本页只讲本站在线工具的报错。
- `how-to-download-a-vimeo-video`：本页「Check these first」与那一篇的链接格式说明有重叠，只重复必要的三句，不整段重复。
- 已合并：N3、N21。N22 归入按钮缺失篇。

## 3. 已用事实与出处

错误文案以 `website/src/i18n/lang/en-US.ts` L70–94 在工作区当前的值为准（该文件有未提交改动，但错误文案块没有变化）。

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| C1 | 工具读取视频时不登录，只能看到匿名访客能看到的内容 | `backend/src/app/provider/media/vimeo_media.py` L1 文档串「匿名读取」；L329–331 新建无登录态的浏览器上下文 | 源码 |
| C2 | 输入为空：「Please enter a media link.」；找不到有效链接：「This is not a valid URL.」；有效链接必须以 http:// 或 https:// 开头；只取第一条有效链接 | `website/src/scripts/download/workspace.ts` L168–178；`url.ts` L54–56、L79–94；`en-US.ts` L71–72 | 源码 |
| C3 | 非 Vimeo 链接：「This link platform is not supported.」（错误码 24000/24031）；Vimeo 解析失败：「This Vimeo video is private or cannot be parsed.」（24005） | `workspace-errors.ts` L21–29、L78–86；`en-US.ts` L90–91 | 源码 |
| C4 | 24005 的可能原因：非 Vimeo 主机或缺少数字视频 ID；取不到播放器配置；缺少 DASH 清单；缺少 AVC 视频轨或 AAC 音频轨且没有渐进式 MP4。正文写成「private、password-protected、paid、no longer available、链接不是单个视频、文件类型不支持」，没有写内部细节 | `vimeo_media.py` L140–148、L302–303、L480–483 | 源码 |
| C5 | 「Too many requests. Please try again later.」对应错误码 998 与 24004；后端有两处限流：解析按用户或设备限流；下载材料刷新按已签名 token 的 `device_id` 限制 6 次/60 秒，旧 token 缺少 `device_id` 时按 `issued_ip` 回退，仍为 6 次/60 秒。因此正文写「提交或点击 Download 多次，也可能在工具繁忙时出现」，没有写数字 | `workspace-errors.ts` L21、L28、L65–69；`vimeo_media.py` L179–185、L207–215；`backend/src/app/utils/redis_fixed_limiter.py` L39–52、L73 | 源码 |
| C6 | 通用兜底：「Failed to parse this link.」 | `workspace.ts` L247–250；`en-US.ts` L73 | 源码 |
| C7 | 「Failed to download this file.」对应直链过期与直链 HTTP 错误；工具每次开始下载会重新申请链接 | `workspace-errors.ts` L101–103；`docs/feat/002.下载功能/feat.md`「token 过期后视为新的下载动作，重新走下载授权」 | 源码与文档 |
| C8 | 「Network connection interrupted. Click Continue to resume.」：自动续传耗尽或流中断；直链 MP4 可续传（自动重试 3 次，正文写「automatic retries」，没写次数）；需要合并的下载不可续传 | `workspace-errors.ts` L94–99；`direct-download.ts` L44；`download-methods.ts` L98–118；`client-mux-download.ts` L83–86 | 源码 |
| C9 | 「Failed to download the video tracks.」：合并下载的某一条流下载失败；工具已自动重试一次 | `workspace-errors.ts` L117–119；`client-mux-download.ts` L47–73 | 源码 |
| C10 | 「Failed to generate MP4.」：两条流下载后合并失败 | `workspace-errors.ts` L120；`client-mux.ts` L150–157 | 源码 |
| C11 | 「This video exceeds the browser download size limit.」：超过浏览器下载大小上限（正文不写数值） | `workspace-errors.ts` L114–116；`client-mux.ts` L75、L162、L233 | 源码 |
| C12 | 存储不足：下载前检查浏览器可用存储；合并下载需要同时容纳视频流、音频流和成品，所以需要明显大于成品大小；文案同时显示文件大小与可用空间 | `download-storage-preflight.ts` L210–272（L229–231 乘 2）；`client-mux.ts` L233–245（3 个临时文件）；`workspace-download.ts` L244–257；`en-US.ts` L80–81 | 源码 |
| C13 | 「This resource can only be downloaded with the browser extension. Install it to continue.」：超大或大小未知的资源被在线工具拒绝（状态 3） | `workspace-download.ts` L166–170；`anonymous-download.ts` L51–58；`docs/feat/002.下载功能/feat.md`「Website 匿名等待」；`en-US.ts` 对比表「Large files」 | 源码与文档 |
| C14 | 「This download method is not supported yet. Please try again later.」 | `workspace-errors.ts` L105–107；`en-US.ts` L86 | 源码 |
| C15 | 按钮状态：Checking browser storage... / Downloading...（带百分比）/ Preparing MP4... | `workspace-download.ts` L392–397、L694–720；`en-US.ts` L47–49 | 源码 |
| C16 | 单文件 MP4 下载中关闭页面，回来时页面可能提示 Continue 或 Restart download（OPFS 可续传，IndexedDB 只能重新开始）；合并下载没有恢复记录 | `download-resume-store.ts` L1–10、L737；`workspace-render.ts` L150–165；`en-US.ts` L52–57 | 源码 |
| C17 | 文件名是视频标题加 .mp4；浏览器按普通下载保存 | P4、P7 | 源码 |
| C18 | `/contact/` 路由存在 | `website/src/pages/contact.astro` | 源码 |
| C19 | 运营主体 Ginyo Technologies Limited；不隶属于 Vimeo, Inc.；仅限有权保存的公开视频 | 事实表；`en-US.ts` scope.compliance；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 源码 |

## 4. 当前行为与待实施目标的差异

- 扩展未上架。表中三处与扩展相关的句子都放在 `EXTENSION_BLOCK` 里，上架前发布时删除。删除后三行分别读作「The online tool can't download this file.」「Free up disk space and try again.」「The online tool can't download this file.」。
- 工具在失败、状态 3、存储不足时会弹出扩展引导卡（UI 事实）。上架前这些引导卡的链接是占位，属于首页的已知问题，本页不处理。
- 倒计时窗口（「Download queued … starts in N seconds」）：当前配置下不出现（`docs/feat/002.下载功能/feat.md`），所以没有写。策略收紧后需补一行：关闭窗口会取消这次下载。
- 有意没有写「No downloadable files were found for this video.」：源码里 Vimeo 解析成功时恒返回 1 个资源，失败走异常，这条文案对 Vimeo 基本不可达（未实测），写进去会记录一个用户可能永远看不到的状态。

## 5. SERP 证据与限制

- 证据（WebSearch，US，2026-10-06）：N3「vimeo downloader not working」论坛/Issue 6、厂商文章 2、PyPI 1，工具 0，官方 0；N21「vimeo download failed」论坛/Issue 6、厂商文章 2、无关 2，工具 0。结果都是针对其他工具（video-downloadhelper、youtube-dl、gpodder）的讨论。
- 对本站的含义：「Vimeo Downloader」恰好是本站品牌词，用户搜工具报错原文时没有现成的对应页面，这一页是它们的自然落点。没有搜索量，不预测流量。
- 限制：WebSearch 不等于 Google 实时 SERP；只限美国；类型按标题与 URL 判断；没有搜索量。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | Vimeo Downloader Not Working? Error Messages and Fixes | 54 |
| Meta Description | Find the exact error the Vimeo Downloader online tool shows, what it means and what to try: link, private video, storage and connection problems. | 145 |
| H1 | Vimeo Downloader not working: error messages and fixes | 54 |

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/`（首页在线工具） | Vimeo Downloader online tool | 路由已存在 |
| 站内出 | `/contact/` | contact us | 路由已存在 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | Our legal guide | 暂定路由 |
| 站内出 | `/guides/how-to-download-a-vimeo-video/` | How to download a Vimeo video | 暂定路由 |
| 站内入 | 工具错误区的「了解原因」链接（需要改代码，本轮不做）；how-to 指南 | | 009 当前没有文章入口，待 hydra 决定 |

## 8. 结构化数据

- Article + BreadcrumbList。不加 FAQPage、HowTo（G2）。
- Article：`headline` = H1；`datePublished`、`dateModified` 发布时按真实日期填；`author` 未确认，省略；`image` 用 §9 的真实截图，截图完成前省略。
- 已实施（2026-10-07）：Article + BreadcrumbList（Home → Guides → 本文）。`author` 与 `publisher` 都引用站点 Organization（运营主体），不虚构个人作者；`image` 仍省略；日期 2026-10-07。
- BreadcrumbList：Home → 本页；是否有 `/guides/` 索引页待定。

## 9. 媒体决策（需要真实截图，不用占位图）

| 文件名 | 内容 | alt | 说明 |
|---|---|---|---|
| `online-tool-error-message.png` | 在线工具链接输入框下方显示 "This Vimeo video is private or cannot be parsed." | Vimeo Downloader showing the message "This Vimeo video is private or cannot be parsed." under the link field | 用自己上传并设为私密的测试视频触发；不要用别人的视频 |

## 10. 发布条件

- 产品条件：满足（只写在线工具现有错误态）。分类为「可立即发布」。
- 工程前置：
  1. 路由、模板、站内入口、sitemap 与 hreflang 范围确定（README §7 第 1 条）。
  2. 发布前在真实浏览器里复现表中每一条（见 §11），确认文案与恢复动作无误。
  3. 错误文案变动时本页必须同步。建议在 009 或 002 文档里登记这个依赖。
  4. 上架前发布：删除 3 处 `EXTENSION_BLOCK`。上架后恢复，并核实每条扩展建议与发布版一致。
- 页面里显示「Last reviewed」日期（现为 2026-10-06）。

## 11. 待核实（正文没有写，或写法已规避）

- 本页每一行的触发条件都来自源码阅读，没有在真实浏览器里逐条复现。发布前至少复现：空输入、无 https 的链接、非 Vimeo 链接、私密视频、存储不足（用开发者工具限制存储）、网络中断（用开发者工具断网）、合并下载的 Preparing MP4 状态。
- 数字（解析与下载的限流次数、50/100 MiB 内存兜底、4 GiB 上限）都没有写进正文，它们是可收回的后端配置或内部实现。
- 「tool is busy」对应的下载材料刷新限流见 §3 的 C5。这是一个需要 hydra 评估的产品风险：每个签名 token 的 `device_id` 每 60 秒最多刷新 6 次，旧 token 按 `issued_ip` 回退；单个设备或旧 token 的签发 IP 可能看到「Too many requests」。本轮不改代码，只在 README 记录。
- Edge、Brave、Safari、Firefox 上这些错误的表现没有核实，正文没有按浏览器区分。
