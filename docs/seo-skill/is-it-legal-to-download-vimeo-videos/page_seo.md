# page_seo：is-it-legal-to-download-vimeo-videos

> 事实核实日期 2026-10-06。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `is-it-legal-to-download-vimeo-videos` |
| 建议运行时路由 | `/guides/is-it-legal-to-download-vimeo-videos/`（2026-10-07 定稿；索引页 `/guides/`，入口在页脚 Resources） |
| 页面类型 | 信息/文章页（spec §4） |
| 核心搜索意图 | 信息型：下载 Vimeo 视频是否合法；Vimeo 条款、所有者设置、版权三者各管什么 |
| 页面目标 | 让用户分清三层规则，并知道自己的情形该做什么（用按钮、问所有者、看许可证、别规避访问限制），同时如实说明本站工具的位置与边界 |
| 主要转化动作 | 点击「How to download a Vimeo video」，面向确认自己有权保存视频的用户 |
| 源语言 | en-US |
| 目标市场 | 美国英语（版权引文只用美国来源，正文已说明） |
| 目标 locale / x-default | 只发布 en-US。只有一个语言版本，按规则不输出 hreflang 与 x-default；其他 locale 待本地化 |
| 母语审校 | 待确认 |
| 源语言确认 | 2026-10-07 hydra 确认源稿（「在线只是针对公开视频」）；律师或合规审阅未做 |
| 运行时同步 | 已同步到 `website/src/content/guides/is-it-legal-to-download-vimeo-videos/en-US.md`（改动见 `docs/feat/009.SEO与增长/changelog.md` 2026-10-07）；构建与 module-scripts 通过 |
| 真实页面验证 | 本地 dev（真实后端）桌面 1280px、手机 390px 已验证：无横向滚动、锚点可达、表格手机卡片；线上未部署、未验证 |

## 2. 与首页及其他文章的分工

- 首页是工具意图，本页没有任何工具意图词，不会抢词。
- 与 `how-to-download-a-vimeo-video` 的分工：本页回答「可不可以」，那一篇回答「怎么做」。本页结尾把有权保存的用户导向那一篇。
- 与 `vimeo-download-button-missing` 的分工：本页讲三层规则，那一篇讲按钮缺失的原因与处理。

## 3. 已用事实与出处

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| D1 | 条款 §5.4「Prohibited Technical Measures」以「You will not:」开头；三条引文（下载条款、规避访问限制、去水印）逐字引用 | V9，Last Updated: July 8, 2024 | curl 读取页面 HTML，与 WebFetch 两次结果一致 |
| D2 | 条款是用户与 Vimeo.com, Inc. 之间的协议 | V9 开头 | curl 读取 |
| D3 | 第 6 节开头句：「As between you and Vimeo, you own and will retain ownership of all intellectual property rights in and to the content you submit.」 | V9 | curl 读取。注意此句在第 6 节开头，不在 6.1 小节 |
| D4 | 「Our members retain copyright ownership of their works and have the discretion to determine the extent of permissible usage.」；Creative Commons 视频可「according to the applicable license's terms and conditions」使用；建议联系所有者；Vimeo 不能保证每个上传者都有权施加许可证；该页没有谈下载 | V8，Updated May 29, 2025 | curl 读取 |
| D5 | 所有者可开关下载；「You can download videos from Vimeo if the owner has enabled downloads」 | V2，Updated November 05, 2025 | curl 读取 |
| D6 | Free 与 Basic 不能开启下载，也不能下载自己账号里的视频 | V1，Updated November 05, 2025 | curl 读取 |
| D7 | 观众只能在 vimeo.com 视频页下载，不能在内嵌播放器下载 | V4，Updated November 06, 2025 | curl 读取 |
| D8 | 自己的视频从 Library 下载，需要付费计划 | V3，Updated December 03, 2025 | curl 读取 |
| D9 | 建议安全存放下载的文件，防止未经授权的传播 | V2 | curl 读取 |
| D10 | 合理使用的定义、逐案判断、「it is best to consult an attorney」、版权局不能给个人具体法律意见 | G1，页面显示 Index last updated July 2026 | curl 读取页面 HTML 核对 |
| D11 | 在线工具把公开 Vimeo 视频存成 MP4，一次一个链接；不解锁私密、密码保护、付费视频；不去除 DRM | P3、P2；`en-US.ts` FAQ 与 scope.doesNot | 源码与首页文案 |
| D12 | 工具不检查用户是否有权保存，也不能使下载变得被允许 | `vimeo_media.py` 全文没有任何权限或授权检查逻辑 | 源码（以无逻辑为据） |
| D13 | 运营主体 Ginyo Technologies Limited；与 Vimeo, Inc. 无关联；Vimeo 是 Vimeo, Inc. 的商标 | 事实表；`en-US.ts` scope.compliance；`website/src/lib/site.mjs` `OPERATOR_LEGAL_NAME`（工作区未提交改动） | 源码 |

## 4. 当前行为与待实施目标的差异

- 无。本页不依赖扩展，也不描述任何尚未实现的能力。

## 5. SERP 证据与限制

- 证据：Q11「is it legal to download vimeo videos」，2026-10-06，WebSearch（US），9 条结果全部是文章或问答（100%）。标题示例（sxo.md §2.4）：「Is It Legal to Download Vimeo Videos?」「Download Videos From Vimeo: Legal Alternatives & Tips - SkyScribe」。
- 相关：N6、N7 也含合法性与安全性的混合意图，未并入。
- 限制：WebSearch 不等于 Google 实时 SERP；只限美国；类型按标题与 URL 判断；没有逐篇打开竞品；没有搜索量；看不到 PAA 与 AI Overview。
- 增量依据：竞品多是厂商文章，且常顺带推荐软件。本页以一手来源（条款原文、Vimeo 帮助、美国版权局）为主，不下法律结论，不推荐其他产品。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | Is It Legal to Download Vimeo Videos? What the Rules Say | 56 |
| Meta Description | Whether you can download a Vimeo video depends on the owner's settings, Vimeo's Terms of Service and copyright law. Plain-language guide, not legal advice. | 155 |
| H1 | Is it legal to download Vimeo videos? | 37 |

- 三者表达同一目标：这是一个分层的问题，并给出结构化的答案。Title 的「What the Rules Say」比 H1 多一层意思，用来区分于只回答「是/否」的竞品，没有改变页面职责。

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/guides/how-to-download-a-vimeo-video/` | How to download a Vimeo video | 暂定路由 |
| 站内出 | `/guides/vimeo-download-button-missing/` | why a Vimeo video has no Download button | 暂定路由 |
| 站外出 | V1、V2、V3、V4、V8、V9、G1 | 以来源标题为锚文本 | 发布前复核 |
| 站内入 | how-to 指南、button-missing 指南；站点入口待定 | | 009 当前没有文章入口 |

## 8. 结构化数据

- Article + BreadcrumbList。不加 FAQPage（FAQ 富结果自 2026-05-07 起不再显示，G2），不用 HowTo。
- Article：`headline` = H1；`datePublished`、`dateModified` 发布时按真实日期填；`author` 未确认（README §7 第 7 条），确认前省略；`image` 不用 logo（G3 建议使用与文章相关的图片），本页没有真实相关图片，省略。
- 已实施（2026-10-07）：Article + BreadcrumbList（Home → Guides → 本文）。`author` 与 `publisher` 都引用站点 Organization（运营主体），不虚构个人作者；`image` 仍省略；日期 2026-10-07。
- BreadcrumbList：Home → 本页；是否有 `/guides/` 索引页待定。

## 9. 媒体决策

- 不需要截图。正文是文字内容，不放占位图，也不放 Vimeo 条款页的截图（第三方界面）。

## 10. 发布条件

- 产品条件：无。分类为「可立即发布」。
- 工程前置：
  1. 路由、模板、站内入口、sitemap 与 hreflang 范围确定（README §7 第 1 条）。
  2. 发布前重读 V1、V2、V3、V4、V8、V9 和 G1，确认引文与日期仍有效；条款若有新版本，更新引文与「last updated」。
  3. 建议法务过目：本页只引用原文、不下结论，但属于「合法性」话题；至少需要 hydra 确认「Where Vimeo Downloader fits」一节的立场（README §7 第 2 条）。
- 页面里显示「Last reviewed」日期（现为 2026-10-06）。

## 11. 待核实（正文没有写，或写法已规避）

- 工具对「所有者关闭下载的公开视频」的实际行为没有实测，正文没有断言。D12 只说工具不检查用户权限。
- 美国以外市场的版权规则：正文只引用美国来源并明说。其他市场需要各自的来源与母语、法务审校。
- 官方帮助页没有逐页说明历史版本；它们会更新，引文可能失效。
- 条款页的 Last Updated 是 July 8, 2024，距读取日较久，发布前确认是否已有新版。
