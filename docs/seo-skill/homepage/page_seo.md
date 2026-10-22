# 首页：免费网页下载与插件需求的 SEO 方案

> 证据读取日期：2026-10-22。状态：本轮已授权实施，产品决定已定稿，尚未部署。本文维护首页的内容决定与证据；[英文源稿](en-US.md)维护确认文案，[执行计划](../../feat/009.SEO与增长/plans/001.首页免费定位与搜索意图优化.md)维护任务与验收。部署、Title 实验与文章发布未获授权。

## 1. 页面目标与范围

| 项目 | 决策 |
| --- | --- |
| 页面与路由 | 现有首页 `/` 及其语言版本；`homepage` 仅为本工作区目录名 |
| 页面类型 | 工具页，兼有插件介绍 |
| 用户即时任务 | 有权保存公开视频的用户，通过链接完成一次免费 MP4 下载 |
| 业务转化目标 | 沿用增长域的插件安装与订阅目标；需要独立音频、字幕或队列的用户进入商店或扩展方案页 |
| 核心词 | `vimeo downloader`；正文自然覆盖 `download vimeo video` 等任务表达 |
| 辅助表达 | `free`、`MP4`、`online`、`no registration`，均以实际能力为边界 |
| 源语言与研究市场 | en-US；Trends 覆盖全球及美国的英文搜索字词，SERP 为英文结果抽样 |
| 语言范围 | 页面结构与产品事实统一同步现有 14 个 locale；其他语言不继承英语的词量结论 |
| 既有语言合同 | 沿用 `i18n/ui.ts`、canonical、hreflang 与 x-default 配置 |

本轮优化内容与用户完成任务的路径，不把网页下载改定为业务主转化目标。依据是[增长域产品目标](../../feat/009.SEO与增长/feat.md)的「首页把自然搜索流量转化为插件安装与订阅」。范围不包含新落地页、新文章、下载能力、收费规则、后端接口、实验系统、结构化数据类型或路由迁移；插件卡保持默认展开，下载状态机与下载域合同不变。

## 2. 证据基线

### 2.1 Google Trends

- 读取日期：2026-10-22；请求范围：2025-10-22 至 2026-10-22；网页搜索、所有类别、未加引号的 Search term。
- 排除未完成周，使用 52 个完整周；最后完整周为 2026-10-11 至 2026-10-17。
- 下表将同批次各词的周均指数除以 `vimeo downloader` 的周均指数，再乘以 100。它不是 Google 原始的峰值指数，也不是月搜索次数；不同词的搜索范围有重叠，不能相加。

| 英文搜索字词 | 全球，以基准词为 100 | 美国，以基准词为 100 |
| --- | ---: | ---: |
| `vimeo downloader` | 100 | 100，48/52 周非零 |
| `download vimeo video` | 127.3 | 155.8 |
| `vimeo video downloader` | 50.9 | 30.2，样本稀疏，仅 22/52 周非零 |
| `free vimeo downloader` | 7.8 | 样本稀疏，仅 2 周显示非零值 |
| `vimeo downloader online` | 6.7 | 样本稀疏，仅 1 周显示非零值 |

同条件的全球变体组单独与其批次内的基准词比较：

| 英文搜索字词 | 全球，以同批 `vimeo downloader` 为 100 |
| --- | ---: |
| `vimeo downloader` | 100 |
| `vimeo download` | 312.16 |
| `download vimeo` | 312.33 |
| `vimeo to mp4` | 29.53 |

两个宽泛词序变体是本次较强的相对需求信号，但不是两个独立流量池；不能相加或换算本站潜在流量。不同批次的原始指数也不能直接比较。

[计算结果与补充词数据](evidence/trends-comparison-2026-10-22.csv)保留原始周均指数、换算值和非零周数；[全球核心组](https://trends.google.com/trends/explore?date=2025-10-22%202026-10-22&q=vimeo%20downloader,vimeo%20video%20downloader,download%20vimeo%20video,free%20vimeo%20downloader,vimeo%20downloader%20online&hl=en)、[美国核心组](https://trends.google.com/trends/explore?date=2025-10-22%202026-10-22&geo=US&q=vimeo%20downloader,vimeo%20video%20downloader,download%20vimeo%20video,free%20vimeo%20downloader,vimeo%20downloader%20online&hl=en)、[全球变体组](https://trends.google.com/trends/explore?date=2025-10-22%202026-10-22&q=vimeo%20downloader,vimeo%20download,download%20vimeo,vimeo%20to%20mp4,free%20vimeo%20video%20downloader&hl=en)可用于复查筛选条件。

结论：核心工具需求与下载动作需求都值得承接。Free 是真实卖点；目前没有证据证明将它放进 Title 会增加本站流量，也不能用长尾指数较低证明它不该出现在文案中。

### 2.2 Google Search Console

资源为 `sc-domain:vimeodownloader.app`，读取日期为 2026-10-22。选择过去 28 天、网页搜索、全部国家与设备；图表实际显示 2026-10-06 至 2026-10-19，只有 14 天数据。

| 范围 | 点击 | 曝光 | 点击率 | 平均排名 |
| --- | ---: | ---: | ---: | ---: |
| 全站 | 56 | 513 | 10.9% | 19.1 |
| 精确页面 `https://vimeodownloader.app/` | 34 | 320 | 10.6% | 12.5 |

以下均为英文 HTTPS 首页查询维度，不把全站搜索词归因给首页：

| 可见查询 | 点击 | 曝光 | 平均排名 |
| --- | ---: | ---: | ---: |
| `vimeo downloader extension` | 1 | 40 | 11.1 |
| `download vimeo` | 0 | 11 | 21.1 |
| `vimeo downloader` | 1 | 9 | 37.6 |
| `download vimeo audio` | 3 | 6 | 5.5 |
| `vimeo downloader chrome` | 0 | 6 | 8.8 |

- 首页可见查询共 61 条，合计 11 次点击、157 次曝光。按搜索词不区分大小写匹配，三组结果如下；分组可重叠，不能相加，也不是全部查询的互斥意图分类。

| 匹配规则 | 可见查询数 | 曝光 | 点击 |
| --- | ---: | ---: | ---: |
| `extension`、`chrome` 或 `plugin` | 11 | 56 | 1 |
| `audio`、`mp3` 或 `m4a` | 11 | 19 | 4 |
| `free` | 4 | 6 | 0 |

- 插件组占可见查询曝光的 56/157，约 36%，在上述三组中曝光最多。该比例只描述可见查询，不能推广到顶部 320 次曝光或全部自然流量。
- [首页查询快照](evidence/gsc-homepage-queries-2026-10-22.csv)固定本次数据；[GSC 报告入口](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Avimeodownloader.app&num_of_days=28&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION&breakdown=query&page=!https%3A%2F%2Fvimeodownloader.app%2F)是滚动视图，后续打开不再代表本次快照。
- 查询表只覆盖顶部 34 次点击中的 11 次。[Google 官方差异说明](https://support.google.com/webmasters/answer/17010575?hl=en)于 2026-10-22 核对：加页面筛选时图表与表格的聚合方式会不同；查询表省略匿名低频查询，而这些查询在未加查询筛选时仍计入图表。本次使用页面筛选与查询维度，须考虑这两种机制，但没有证据把相差的 23 次点击精确分配给任一原因。
- 国家、设备明细与顶部的差额也不用于反推份额；不能把查询匿名化直接当作所有维度差额的解释。[Google 官方成效说明](https://support.google.com/webmasters/answer/7576553?hl=en)同时要求按具体页面或分组理解平均排名，不能将其作为固定排名。

结论：插件曝光和音频点击都是首页已出现的需求信号，应保留相应承接。样本尚不足以证明稳定优势，更不能据此承诺插件安装或收入提升。

### 2.3 SERP 与源码

- 2026-10-22 使用真实浏览器分别抽看 `vimeo downloader` 的 9 条、`download vimeo video` 的 8 条主要网页结果，二者有 6 个相同 URL，包括 VidDown、SaveTheVideo、Klipa 等工具页。没有声称取得完整 Top 10。
- 查询设置为 `hl=en`、`gl=us`、`pws=0`；浏览器跳转至 google.com.hk，页面仍显示中国设备位置。因此只作为英文意图抽样，不作为纯美国排名报告；未采用扩展注入的第三方流量数字。
- 实施前源码基线：[首页装配](../../../website/src/components/pages/HomePage.astro)顺序为工具 → 插件介绍 → 插件功能 → 插件安装四步；[步骤组件](../../../website/src/components/homepage/HomeStepsSection.astro)固定四列，≤960px 单列、≤600px 时间线，没有 1200px 两列档；信任点为两个。
- **实施前首访插件卡默认展开**：[卡片 HTML](../../../website/src/components/download/DownloadParseResults.astro)没有 `hidden`；[结果渲染](../../../website/src/scripts/download/workspace-render.ts)在无资源时保持展开，初始化也会调用它；[工作区 CSS](../../../website/src/components/download/DownloadWorkspace.astro)在卡片可见时隐藏一行入口，≤600px 时两张卡上下堆叠。因此不能把 `extensionEntryLine` 当作该基线的首访可见说明。
- 该基线默认状态来自 2026-10-10 提交 `fd2de2e`，并记录于[下载域合同](../../feat/002.下载功能/feat.md)。实施前[英文文案](../../../website/src/i18n/lang/en-US.ts)的 H1 是 `Save Any Public Vimeo Video`；本轮 H1 的修改与卡片原文保留均为 hydra 明确决定，见 §3.1。
- **插件已上架**：2026-10-22 读取 [site.mjs](../../../website/src/lib/site.mjs) 所指的[正式商店详情页](https://chromewebstore.google.com/detail/vimeo-downloader-download/joalfalamongfmejacciadcpdeahblai)，公开 HTML 返回 HTTP 200，产品 ID 匹配，H1 为 `Vimeo Downloader - Download HD Video & Audio`，与首页 `meta.title` 一致。商店可访问不代表已验证安装、全部功能或转化。
- [Guides 读取](../../../website/src/guides/guidesContent.ts)已支持按 locale 查找文章与生成路径；现有英文下载教程已链接回首页。首页可直接复用该能力，无需再维护语言或链接白名单。

以下留存本次 SERP 抽样的全部 URL。A 为 `vimeo downloader`（2026-10-22 06:13 UTC），B 为 `download vimeo video`（06:14 UTC）；序号是抽样记录顺序，不是完整搜索排名，`—` 表示该组未收录。

| URL | A | B |
| --- | ---: | ---: |
| [VidDown](https://www.viddown.net/download-vimeo-video) | 1 | 2 |
| [Reddit](https://www.reddit.com/r/TechTalkie/comments/1ktd8c6/how_to_download_a_video_from_vimeo_to_my_computer/) | 2 | 3 |
| [SaveTheVideo](https://www.savethevideo.com/vimeo-downloader) | 3 | 4 |
| [Vimeo Help](https://help.vimeo.com/hc/en-us/articles/12426502581265-How-to-download-a-video-on-Vimeo) | 4 | 1 |
| [Klipa](https://klipa.ai/en/tools/download-vimeo-video) | 5 | 6 |
| [Google Play](https://play.google.com/store/apps/details?id=com.videodownloaderforvimeo.vimeovideodownloader.without.watermark&hl=en_US) | 6 | — |
| [Vimeo Video Downloader Plus](https://chromewebstore.google.com/detail/vimeo-video-downloader-pl/fhdpopfpjekmhiaemmjjbgijbjjnglpi?hl=en) | 7 | — |
| [Moimobi](https://www.moimobi.com/en/tools/vimeo-video-downloader) | 8 | 5 |
| [Toolzu](https://toolzu.com/downloader/vimeo/) | 9 | — |
| [Free Vimeo Downloader](https://chromewebstore.google.com/detail/free-vimeo-downloader/migiikaijhclkmlpnnfficpopgmcpgia) | — | 7 |
| [Medium](https://medium.com/@polina.fomenkova1/i-figured-out-how-to-download-vimeo-videos-when-nothing-else-worked-fae39d5cfad9) | — | 8 |

## 3. 内容决定

### 3.1 首屏决定与元数据

hydra 已确认以下产品决定，实施依赖已解除：

| 编号 | 决定 | 影响 |
| --- | --- | --- |
| B1 | 保持插件卡默认展开 | 保留 10-10 的行为；首访先看到 Chrome、Edge 两张卡，一行入口仍被隐藏；不改下载状态机、不增加收起方案用例、不修改下载域合同 |
| B2 · H1 | 使用突出免费、移除 Any 的确认稿 | 具体英文维护于[英文源稿](en-US.md#12-h1-与插件卡片)，14 语言本地化 |
| B2 · 卡片 | 保留 Chrome/Edge 卡片当前原文 | 除下述德语 Description 人称例外外，现有 14 语言的 Description、Title、CTA 全部保留，包括 any / fast，不采用改写候选 |

- 本轮保留各 locale 的 `meta.title`、`meta.description` 与 `site.description`。英文标题仍为 `Vimeo Downloader - Download HD Video & Audio`，描述已把免费网页视频与扩展能力区分；不根据小样本重写标题。
- H1 继续由 `titleBrand` 与 `titleTagline` 拼接，保持一个 H1；使用确认的免费标语，不新增标题行。
- helper 说明免费 MP4、最高可用画质及大文件、大小未知文件可能需插件；不重复紧邻的 No registration，也不无条件写 No installation required。
- 原有两个 trust points 保留。一行入口说明音频、字幕与队列需求，使用不限定浏览器的 extension，匹配后面的 Chrome、Edge 两按钮；首访因插件卡展开而隐藏，保持原有显隐规则。
- 14 语言的 `workspace.parse.largeFileExtensionInlineChromeDescription`、`largeFileExtensionInlineEdgeDescription` 及同组 `*Title`、`*Cta` 保留当前原文；唯一例外是德语两张卡的 Description 人称统一为 Sie，保留 jedes / fast 承诺，其他 13 语言卡片及德语 Title / CTA 不变。helper 与 `extensionEntryLine` 按确认稿同步。

所有替换文案只维护在[英文源稿](en-US.md)，本文件不复制英文段落。

### 3.2 网页三步教程与页面顺序

复用 `HomeStepsSection`，将其改为网页下载三步，并放到下载工作区之后、插件介绍之前。首页负责立即使用工具，`how to download vimeo videos` 的方法选择与详细说明仍由既有 how-to 文章承接，归属沿用[增长域 Guides 流程](../../feat/009.SEO与增长/feat.md)与[SEO 选题表](../README.md)。新 H2 使用工具动作表达，how-to 措辞保留在文章标题及链接中；现有数据没有证明已发生排名蚕食，只将其作为后续观察风险。

1. 网页下载工具与原有信任点。
2. 网页三步教程：复制公开视频链接 → 粘贴解析 → 下载 MP4。
3. 插件介绍、现有两个 CTA 与保留的插件安装四步。
4. 插件功能。
5. 网页版与插件对比。
6. 适用范围与边界。
7. 明确属于 Chrome 扩展的方案概览。
8. FAQ。
9. 结尾插件 CTA。

首屏之后仍是 8 个静态展示区块，每区块一个 H2；工具、教程、插件介绍共享现有 `SiteStage hero`，装饰仍由该组件维护。三步组件桌面改为三列，≤960px 单列、≤600px 时间线；不新增背景组件或客户端脚本。H2 与正文不写 “in 3 steps”等数字，步骤编号继续交给列表样式。

教程末尾显示已有下载指南的上下文链接：`HomePage` 用 `getLocaleGuides(locale)` 查找 `how-to-download-a-vimeo-video`，用 `getGuidesPath` 生成地址，链接文字与 title 取文章的本地化标题，通过步骤组件的 slot 输出。没有对应语言正文时不输出链接或空占位，不回退到英语，不写 `locale === 'en-US'` 特例。

该链接沿用 `text-link`、全局焦点环，独立成行的点击区域至少高 44px；样式由写出链接的 `HomePage` 维护。复用 `internal_workflow_click`，来源为 `homepage_steps`、目标为 `download_guide`，实际 href 由现有委派器采集，不新增事件类型。

### 3.3 插件与音频

- 插件介绍标题明确 Chrome；导语覆盖视频、独立音频、字幕、封面和队列，同时说明每日免费额度与付费 Unlimited 方案。
- 保留 Add to Chrome 和方案 CTA；方案按钮更明确地指向扩展方案。
- 保留站内现有插件四步的完整内容，迁入 `intro.steps` 必填数组，由 `HomeIntroSection` 在 CTA 下、示意图前输出静态有序列表，每步标题用 H3，区块内仅保留原有一个 H2。新网页三步与插件四步分别解释两种操作；只迁移旧文案，不保留两份插件步骤数据。
- [how-to 源稿](../how-to-download-a-vimeo-video/en-US.md)的 Option 4 目前只有功能介绍和 CTA，没有上述四步；[站点文章](../../../website/src/content/guides/how-to-download-a-vimeo-video/en-US.md)也未启用该段，不能视为教程已承接。是否启用仍由 hydra 决定，不作为本次首页优化的依赖或既定发布范围。
- 现有音频功能卡保留，标题用简短名词表达 M4A、MP3 能力。既有功能卡顺序不变，避免影响首页对第 1、6 张卡的示意标注复用。
- 方案概览标题明确这是 Chrome 扩展方案；沿用现有免费额度与付费 Unlimited 的真实规则，不把“插件收费”扩写为“插件完全没有免费额度”。
- FAQ、对比表与插件 SoftwareApplication 保持事实一致；本轮不改价格、额度、FAQ 数据模型或结构化数据模型。
- [SEO 工作区说明](../README.md)、[音频](../save-vimeo-audio-as-mp3-or-m4a/page_seo.md)、[字幕](../download-vimeo-subtitles-as-vtt/page_seo.md)及 [how-to](../how-to-download-a-vimeo-video/page_seo.md)仍有「待上架」前提，已与 §2.3 的商店事实不符。本轮只记录这一漂移，不修改这些文件，也不据此自动发布文章。

### 3.4 本地化

按确认的英文稿同步现有 14 个 locale 的 H1、helper、`extensionEntryLine`、网页三步、插件介绍与插件四步，Chrome/Edge 卡片遵守 §3.1 的原文保留与德语人称例外，显隐保持不变。沿用现有文案键，仅为迁移的插件四步增加必填 `intro.steps` 数组，复用现有 `HomepageCardMessage` 类型；`schema.ts` 同步区块顺序与步骤职责，不新增可选 SEO 开关。

网页第 2、3 步引用的按钮名称分别取自该 locale 的 `workspace.parse.submit`、`workspace.parse.download`，与实际界面一致，不直译英文按钮名。

实施时按 locale 核对新增措辞与市场用语，记录翻译、母语审校、构建、真实页面验证状态。其他 13 语言尚无本次市场研究或审校结论，不宣称完成当地关键词优化；不为本轮另建文章译本或语言回退。

## 4. 验收与观察

### 4.1 交付验收

- 所有首页均只有一个 H1、8 个静态展示区块，顺序符合 §3.2；网页三步中不混入插件安装步骤，插件介绍区完整保留安装、固定图标、打开视频页、选画质四步；独立音频仍明确属于插件。
- 首访插件卡默认展开、一行入口隐藏，解析成功、无结果及原有需插件场景的显隐保持原规则；H1 采用确认的免费稿，Chrome/Edge 卡片遵守 §3.1 的原文保留与德语人称例外。
- 原有 Title、Meta、canonical、hreflang 与 FAQ/SoftwareApplication 合同继续成立；免费、能力和方案范围没有矛盾。
- 教程链接只指向存在的同语言正文，文章仍指回首页；安装和 Pricing 链接目标、原有埋点来源可核对。
- 桌面 1440px 与手机 390px 可用，没有因三列布局、插件四步迁移、较长本地化文案或教程前移导致横向溢出、遮挡或键盘焦点不可见。
- 实施时同步增长域 feat/tech 的页面顺序、两个信任点和实际步骤断点，并更新 `llms.txt`、`llms-full.txt` 的首页描述。具体文件见执行计划。
- 最少验证命令与真实后端要求见[执行计划](../../feat/009.SEO与增长/plans/001.首页免费定位与搜索意图优化.md#4-最少验证)；运行时验证由 U1 / 集成 worker 统一执行，实际结果只记入计划 §5。

### 4.2 效果观察

- GSC 以英文 HTTPS 首页、网页搜索、相同国家和设备筛选比较发布前后各 14 个完整数据日；记录发布日与确认的新内容抓取日，后置窗口覆盖抓取后的完整数据日。无法确认抓取日时注明不确定性。
- 本次可见数据自 10-06 开始，尚未独立核实它是否就是上线日；处于新站爬升期时，自然收录与排名变化会混入前后比较。各 14 日窗口只能描述变化，不能把差异归因于这次内容修订。
- 同时观察核心视频词、插件词和音频词的曝光、点击、CTR 与平均排名；Free 只作辅助观察，不用 1～2 次曝光的变化判断成败。不将 14 天与 28 天的总量直接比较。
- 源码已有 `web_download_start`、`web_download_success`、`outbound_chrome_store_click`、`internal_workflow_click`。有可用 GA4 数据时辅助观察网页完成下载和插件入口点击；本次没有读取 GA4，也未验证服务端是否收到事件，不把商店点击写成安装或付费转化。
- 本轮是内容修订，不是随机实验；验收不设虚构的排名或流量提升幅度。新数据足够后，再单独决定 Title 是否需要加入 Free；不预做开关或第二套标题。

## 5. 状态与已知限制

| 项目 | 状态 |
| --- | --- |
| Trends、GSC、英文 SERP | 已读取，覆盖范围与限制见 §2 |
| 商店公开详情页 | 已核对可访问性、产品 ID 与标题；未验证安装与发布版功能 |
| B1、B2 | hydra 已明确决定，见 §3.1；无待决依赖 |
| 英文源稿 | 已按产品决定定稿 |
| 源码、构建与页面阶段 | 已完成源码同步、构建与首页定向用例，页面 / 接线阶段及独立复核通过；实际结果与集中证据入口见[执行计划 §5](../../feat/009.SEO与增长/plans/001.首页免费定位与搜索意图优化.md#5-验收记录) |
| 下载与成功事件分支 | 未验证并暂停，等待新获权公开视频 URL；全链路验收尚未完成 |
| 其他语言审校与研究 | 其他 13 语言母语审校、市场与当地词研究未做 |
| 生产部署与效果验证 | 未执行；部署未获授权 |

GSC 仅有 14 天的小样本，不能证明单个文案的收益或稳定排名。历史 HTTP 首页有流量，但 2026-10-22 已核实其返回 301 至 HTTPS，本轮不把它当成待修复缺陷。源码与生产发布版本的对应关系、GA4 数据可用性仍须在实施与效果观察时核对。

审核顺带发现：[首页 lastmod 来源](../../../website/src/sitemap/languageSitemap.mjs)未包含语言字典，本轮只记录，不修改；[首屏 CSS](../../../website/src/components/pages/HomePage.astro)中已无对应元素的第四个信任点规则按本次批准范围删除。本次结构调整涉及已被 lastmod 跟踪的 `HomePage.astro`，无需扩成 Sitemap 重构。今后单独改字典的 lastmod 问题另行处理。
