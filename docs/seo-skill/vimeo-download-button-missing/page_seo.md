# page_seo：vimeo-download-button-missing

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `vimeo-download-button-missing` |
| 建议运行时路由 | `/guides/vimeo-download-button-missing/`（2026-10-07 定稿；索引页 `/guides/`，入口在页脚 Resources） |
| 页面类型 | 信息/文章页（spec §4），排障型 |
| 核心搜索意图 | 排障型：视频页没有 Download 按钮，为什么，该怎么办 |
| 页面目标 | 用 Vimeo 官方帮助列出的原因做自查流程，区分所有者与观众两种身份，给出合规的下一步（找所有者、看许可证、离线观看、联系 Vimeo 支持） |
| 主要转化动作 | 点击「How to download a Vimeo video」，面向已经有权保存视频的用户 |
| 源语言 | en-US |
| 目标市场 | 美国英语 |
| 目标 locale / x-default | 只发布 en-US。只有一个语言版本，按规则不输出 hreflang 与 x-default；其他 locale 待本地化 |
| 母语审校 | 待确认 |
| 源语言确认 | 2026-10-07 hydra 确认源稿（「在线只是针对公开视频」） |
| 运行时同步 | 已同步到 `website/src/content/guides/vimeo-download-button-missing/en-US.md`（改动见 `docs/feat/009.SEO与增长/changelog.md` 2026-10-07）；构建与 module-scripts 通过 |
| 真实页面验证 | 本地 dev（真实后端）桌面 1280px、手机 390px 已验证：无横向滚动、锚点可达、表格手机卡片；线上未部署、未验证 |

## 2. 与其他页面的分工

- 与首页：无工具意图词，不抢词。
- 与 `how-to-download-a-vimeo-video`：那一篇讲有按钮时怎么用、没按钮且有权保存时怎么用工具；本页只讲「为什么没有按钮」与合规出路，不讲工具步骤。
- 与 `is-it-legal-to-download-vimeo-videos`：本页引用条款 §5.4 一句话，细节交给那一篇。
- 已合并：N1、N2、N22。N20（「vimeo download without download button」）是绕过取向（5/10 条是 PyPI 包），没有合并；本页不教任何绕过方法。

## 3. 已用事实与出处

所有 Vimeo 官方来源均在 2026-10-06 用 curl 读取页面 HTML 逐字核对，日期为页面自带的 Updated。

| ID | 正文中的说法 | 来源 | 备注 |
|---|---|---|---|
| B1 | 三个原因及其引文：「If the video owner disabled downloads, you will not see the download button.」「Free and Basic members cannot enable video downloads. They also cannot download videos from their own account.」「Make sure you are watching from the video's page on vimeo.com. If you watch a video from the embedded player on a different website, you will not be able to download it.」 | V1，Updated November 05, 2025 | 官方标题称这是「most common reasons」 |
| B2 | 目前没有办法让视频可从内嵌播放器下载 | V4b，Updated November 14, 2025 | |
| B3 | 需登录；按钮在播放器下方；公开视频的 source file 需登录：「You must be logged in to download a source file for a Public video.」 | V2，Updated November 05, 2025 | |
| B4 | 都排查过仍没有按钮：可联系 Vimeo 支持，附视频链接并说明已排查 | V1 | |
| B5 | 所有者开关下载：Library → 视频 → Share → Viewer permissions → Downloads；默认设置在 Upload Defaults 的「Download them」；可应用到已有视频 | V4，Updated November 06, 2025 | V4 顶部写明需要付费计划 |
| B6 | 自己的视频下载：Library → Share 按钮的下拉箭头 → Download → 版本旁的下载图标 | V3，Updated December 03, 2025 | 需要付费计划 |
| B7 | 「Our members retain copyright ownership of their works and have the discretion to determine the extent of permissible usage.」；Creative Commons 视频可按许可证条款使用；「always a good idea to contact the video's owner」；该页没有谈下载 | V8，Updated May 29, 2025 | |
| B8 | 离线观看：iOS 与 Android 的 Vimeo App 可加入离线列表；Android 帮助页写明离线列表视频「can only be played within the Vimeo app and cannot be exported or played in other apps」 | V1、V6（Updated June 13, 2025，Android 页） | iOS 页没有读取，正文只对 Android 页引文 |
| B9 | 条款 §5.4 引文，Last Updated July 8, 2024 | V9 | curl 读取页面 HTML 核对 |
| B10 | 本站工具是独立工具，由 Ginyo Technologies Limited 运营，不隶属于 Vimeo, Inc.；在线工具保存公开视频；不会给出所有者没有给出的许可 | 事实表；`en-US.ts` scope.compliance；P3；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 最后一句是逻辑陈述，不是对工具行为的断言 |
| B11 | FAQ「Why can I download some but not others」「Can I download an embedded video」「I'm the owner…」 | B1–B6 的复述，无新增事实 | |

## 4. 当前行为与待实施目标的差异

- 无。本页不依赖扩展。
- V4 说所有者始终能在自己的视频页看到下载按钮，V1 说 Free 与 Basic 不能下载自己账号里的视频。两句话来自不同帮助页，正文分别归属、不合并推论，避免替 Vimeo 解释它没有解释的关系。

## 5. SERP 证据与限制

- 证据（WebSearch，US，2026-10-06）：N1 官方 2、厂商文章 4、目录 1、无关 2，工具 0；N2 官方 2、文章 4、论坛 2、无关 1，工具 0；N22 论坛 4、官方 1、厂商文章 3、PyPI 1，工具 0。三个查询里工具页都是 0。
- 第一条结果是 Vimeo 官方帮助 V1。本页对官方页的增量：所有者与观众两条路径、官方各页的归并、合规边界、站内下一步。不指望超过官方页的排名。
- 限制：WebSearch 不等于 Google 实时 SERP；只限美国；类型按标题与 URL 判断；没有搜索量；看不到 PAA。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | No Download Button on a Vimeo Video? Why and What to Do | 55 |
| Meta Description | A Vimeo video has no Download button if the owner turned downloads off, their plan can't enable them, or you're in an embedded player. What to check. | 149 |
| H1 | Why a Vimeo video has no Download button | 40 |

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/guides/how-to-download-a-vimeo-video/` | How to download a Vimeo video | 暂定路由 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | Is it legal to download Vimeo videos? | 暂定路由 |
| 站外出 | V1、V2、V3、V4、V4b、V6、V8 | 以官方页面标题为锚文本 | 发布前复核 |
| 站内入 | how-to 指南、legal 指南；站点入口待定 | | 009 当前没有文章入口 |

## 8. 结构化数据

- Article + BreadcrumbList。不加 FAQPage、HowTo（G2）。
- Article：`headline` = H1；`datePublished`、`dateModified` 发布时按真实日期填；`author` 未确认，省略；`image` 本页没有真实相关图片，省略。
- 已实施（2026-10-07）：Article + BreadcrumbList（Home → Guides → 本文）。`author` 与 `publisher` 都引用站点 Organization（运营主体），不虚构个人作者；`image` 仍省略；日期 2026-10-07。
- BreadcrumbList：Home → 本页；是否有 `/guides/` 索引页待定。

## 9. 媒体决策

- 不需要截图。不放 Vimeo 界面的截图（第三方界面）。

## 10. 发布条件

- 产品条件：无。分类为「可立即发布」。
- 工程前置：
  1. 路由、模板、站内入口、sitemap 与 hreflang 范围确定（README §7 第 1 条）。
  2. 发布前重读 V1、V2、V3、V4、V4b、V6、V8、V9。Vimeo 的套餐名（Free、Basic、paid plan）可能变化，引文以读取当天为准。
  3. hydra 确认「What this page doesn't cover」一节对在线工具的措辞（README §7 第 2 条）。
- 页面里显示「Last reviewed」日期（现为 2026-10-06）。

## 11. 待核实（正文没有写，或写法已规避）

- 在线工具对「所有者关闭下载的公开视频」的实际行为没有实测；正文没有断言工具能或不能处理这类视频，只说它不会给出所有者没有给出的许可。
- Vimeo iOS 帮助页的离线列表说明没有读取；正文只引用 Android 页的原句，并注明是 Android 帮助页。
- 观众如何联系所有者：正文只说「ask the owner」，没有写具体入口（Vimeo 的私信、评论等没有逐项核实）。
