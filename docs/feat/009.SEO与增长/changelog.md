# 009 · SEO 与增长 - 变更记录

## 2026-11-02 官网商店入口加 UTM；新增文字稿文章，修正三篇指南

**Why**：hydra 确定官网和插件商店两手抓，商店后台可按 UTM 拆分来源（developer.chrome.com/blog/cws-analytics-revamp），目前看不出官网带来多少商店访问。复核发现三篇已发布指南有问题：字幕篇写「官方文字稿下载需要付费计划」，官方 2026-10-08 已改为 Free 和付费都可用；not-working 篇引用的报错文案，在 `parse-v2` 主路径上并不是用户实际看到的；how-to 篇上架前拿掉的 Option 4 扩展节，上架后没有按计划恢复。

**变更**：

- `website/src/lib/site.mjs`：新增 `CHROME_WEB_STORE_INSTALL_URL`。`Layout.astro`、`HomePage.astro`、`PricingPage.astro`、`CompanyPage.astro` 的安装入口改用它。`sameAs` 和 `PricingSubscriptionConfirmModal.astro` 的评价地址用规范地址，因为后者要在地址后面拼 `/reviews`。
- `docs/seo-skill/how-to-get-a-vimeo-transcript/`、`website/src/content/guides/how-to-get-a-vimeo-transcript/`：新增文字稿文章、决策记录和运行时正文；`website/public/llms.txt`、`llms-full.txt` 和本域 `feat.md` 同步登记。
- `docs/seo-skill/{how-to-download-a-vimeo-video,vimeo-downloader-not-working,download-vimeo-subtitles-as-vtt,save-vimeo-audio-as-mp3-or-m4a}/en-US.md`：先用运行时正文覆盖旧源稿（旧稿还留着上架前的占位块），再写入修改。运行时正文已同步（hydra 2026-11-02「一次改完吧」）。how-to 篇的 `seoTitle` 和 `description` 同时改为含插件的版本，`save-vimeo-audio` 篇只改商店链接和浏览器说明，`updatedAt` 不变。
- **未部署。** 部署要等 1.0.3 上架（新文章和字幕篇依赖它）和 2026-11-11 观察期结束；部署时重读官方页面并把日期改成实际日期。
- `website/src/i18n/lang/*.ts`：解析失败文案写明插件只在电脑浏览器可用。手机浏览器装不了插件，原文案把手机用户引向走不通的路。

## 2026-11-02 `/es/`、`/pt/` Title 恢复当地动作词

**Why**：10-27 把 14 语言 Title 统一成「免费 HD + Chrome 扩展」时，去掉了 es / pt 的动作词（`Descarga vídeos`、`Baixe vídeos`），而这两个市场搜的正是动作词。证据如下，GSC 资源为 `sc-domain:vimeodownloader.app`，网页搜索、全部国家与设备，选择过去 28 天（实际覆盖 10-06 至 10-31），2026-11-02 读取：
- 最近 7 天（10-25 至 10-31）：`descargar videos de vimeo` 1/1 排 33，`descargar de vimeo` 1/2 排 29，`descargar video vimeo` 0/3 排 33；`baixar video do vimeo` 0/2 排 75，`baixar videos do vimeo` 0/1 排 84。
- 按国家维度手工分组，西语国家 28 天 19 点击 / 167 曝光，英语国家 16 / 207。`/es/` 的 14 次点击中有 5 次来自品牌词 `vimeodownloader`，不能全部算作通用需求。
- 当地 SERP 抽样（2026-11-02，hydra 的浏览器，`hl=es&gl=es`、`hl=es-419&gl=mx`、`hl=pt-BR&gl=br`，各 8–9 条）：工具类结果的标题直接使用 `Descargar videos de Vimeo`、`Baixar video do Vimeo` 这类表达。只作用词参考，不是完整的当地排名。

10-29 起 `descarg` 类查询只有 4 次曝光，看不出 10-27 的 Title 是否造成掉排名。这次是按查询词做的修正，不是回滚已证实的回退。

**变更**：
- `website/src/i18n/lang/es-ES.ts`：首页 `meta.title` 改为 `Vimeo Downloader - Descargar vídeos de Vimeo gratis en HD`（57 字符）。
- `website/src/i18n/lang/pt-BR.ts`：首页 `meta.title` 改为 `Vimeo Downloader - Baixar vídeos do Vimeo grátis em HD`（54 字符）。
- 其他 12 语言不变：当地动作词查询的证据不足。
- `tech-落地页与Sitemap.md`、`docs/seo-skill/homepage/page_seo.md`：同步 Title 口径。

**验证**：`pnpm build` 通过（95 页，sitemap 65 URL）；`every locale homepage has one H1, eight ordered sections and valid structured data` 通过。线上核对：`/es/`、`/pt/` 的 title 已更新，`/`、`/de/`、`/fr/` 未变；这些页面均返回 200、只有一个 H1、hreflang 15 条。

**部署与收录**：
- 已部署生产，版本 `v20261102_150013`，上一版 `v20261028_212937`。部署前核对：相对线上构建，工作区只多这两行 Title；`Layout.astro` 里未提交的 Launchstag 徽章线上已有；Nginx 配置校验值与服务器一致。
- `deploy.sh` 退出码为 35：最后一步提交 IndexNow 时 curl 连接失败，`set -e` 让脚本提前退出。此时 `current` 已切换、Nginx 已重载，发布本身已完成。
- GSC 已对 `/es/`、`/pt/` 提交「要求建立索引」，两次均显示「已要求建立索引」。

**观察口径**：与英文首页分开看。GSC 按页面筛选 `/es/`、`/pt/`，比较上线前后各 14 个完整数据日（前窗 10-19 至 11-01）的曝光、点击、排名及 `descarg` / `baixar` 类查询。样本很小，只描述变化，不直接归因于 Title。

**已知限制**：
- 译文未经母语审校。es-ES 写 `vídeos`，而 `/es/` 的曝光多来自拉美（习惯写 `videos`），拼写是否调整留待观察。
- Title 不再提 Chrome 扩展（描述仍提），`descargar videos vimeo extensión chrome` 等词（排 7–8，28 天合计 3 次曝光）可能受影响。
- 首页 `lastmod` 的来源不含语言字典，这次 sitemap 的 `lastmod` 不变，只靠 GSC 索引请求通知 Google。单独改字典时都有这个缺口，本次未修。

## 2026-10-27 首页 SEO：Title 统一免费+扩展口径、首屏承接音频意图、修正 Offers

**Why**：拉取 GSC 28/90 天与 GA4 28 天数据后，首页（`https://vimeodownloader.app/`）28 天为 41 点击 / 410 曝光 / CTR 10% / 均排 11.8，占全站点击 62%。诊断出三处口径不一致：① H1 已写 Free、Title 仍写 `Download HD Video & Audio`，两处都没提 `extension`；② `vimeo downloader extension`（57 曝光，首页最大曝光来源）与 `vimeo downloader chrome`（16 曝光）合计占首页曝光 20%，Title 未承接；③ mp3/wav 类查询已排到 4.5–10 但零点击，首屏没有任何音频是在插件里完成的提示。技术侧（canonical / hreflang / 4 组 JSON-LD / 单一 H1 / 移动端 LCP 1.17s / CLS 0 / 无渲染阻塞资源）无缺陷，本轮不动结构。

**变更**：
- `website/src/i18n/lang/*.ts`（14 语言）：首页 `meta.title` 改为「品牌词 - 免费 HD + Chrome 扩展」口径，与 H1 的 Free 一致并承接扩展类查询；长度受控在西文 ≤60、CJK ≤40。
- `website/src/i18n/lang/*.ts` + `src/i18n/schema.ts`：`heroTrustPoints` 由 2 项扩为 3 项，新增「音频与字幕用扩展」，规格类型改为 `[string, string, string]`。
- `website/src/components/pages/HomePage.astro`：≤600px 下三个信任点由两列网格改为纵向单列，避免 3 项在两列网格里留下半行空白。
- `website/src/layouts/Layout.astro`：`SoftwareApplication.offers` 由 `price: 0` 的单一 `Offer` 改为 `AggregateOffer`（`lowPrice: 0`、`offerCount: 2`）。原写法与 FAQ、Pricing 页的付费 Unlimited 事实矛盾。
- `docs/feat/009.SEO与增长/feat.md`、`tech-落地页与Sitemap.md`：同步信任点数量、Title 口径与 Offers 口径。

**验证**：`pnpm build` 通过（95 页，sitemap 65 URL）；`every locale homepage has one H1, eight ordered sections and valid structured data` 通过；首页相关 20 个用例全部通过。本地 preview 下 1440 / 390 / 德语 390 三视口实测：三个信任点均渲染、无横向溢出，桌面单行、移动端三行。构建产物逐语言核对：Title 全部在阈值内，`offers` 均为 `AggregateOffer`。

**已知限制**：
- 其他 13 语言的新 Title 与信任点文案未经母语审校，为本轮按现有译文风格直译。
- 效果观察口径：Deployment 后 14–28 天看 `vimeo downloader extension` / `vimeo downloader chrome` 的 CTR 与 `vimeo mp3 download` 簇的点击是否出现，不把单次文案修订归因为排名提升。
- 未做：HSTS（需 Cloudflare 面板配置、不可快速回滚，另开）；`vimeo downloader` 品牌词仍排 37.6，属站点权重问题，非本轮可解。
- 未部署，等待部署窗口，且需避开 10-26 内链/lastmod 实验的 7–14 天观察期，避免污染该实验结论。

## 2026-10-25 外链平台批量提交：6 平台落袋，2 站审核中

**Why**：10-25 changelog 记录「外链建设本轮不做」后，hydra 决定启动站外目录/启动平台提交，为域名补第一批第三方外链。

**变更**：
- 新增 `tech-外链提交平台.md`：平台清单（6 平台状态）、收录标准（只投接受非 AI 工具的综合平台）、各平台后续动作、自动化提交踩坑记录。
- 新增 `references/外链提交素材库.md`：标准提交素材（区分 website 与 extension 两种口径）、各平台账号、长度硬限制对照。
- 新增 `plans/002.外链平台批量提交.md`：执行记录与 DevPost 申诉邮件文本。
- 提交结果：Product Hunt（排期 2026-10-27）、Crunchbase（profile 公开）、Indie Hackers（产品页上线）、AIToolboard / AlternativeTo（审核中）、DevPost（项目建成，账号申诉中）。

**验证**：各平台提交后均有平台侧确认（弹窗/成功页/公开 URL）；Crunchbase 与 IH 的 profile URL 已可直接访问。

**已知限制**：AlternativeTo 过审后需人工关联 Vimeo 才生效外链；DevPost 解封依赖邮件审核；产品缺 512×512 方形 logo，要求方图 icon 的平台暂用 og-image 代替。

## 2026-10-25 SEO 修复：语言内链、X 占位入口下线、插件类文章发布

**Why**：GSC 90 天数据（实际覆盖 2026-10-06 至 10-22）显示 65 点击 / 615 曝光、平均排名 19；31 页已索引、43 页未索引，其中 5 个 Guides 页全部「已发现但未抓取」；外链 24 条全部来自 google.com。技术侧 canonical / hreflang / sitemap / CWV 均正常，可动的杠杆是收录、内链、外链与内容供给。外链建设本轮不做（hydra 决定）。

**变更**：
- `website/src/layouts/Layout.astro`、`src/scripts/site/language-switcher.ts`：
  - 语言切换器由 `<button data-path>` 改为带 `href` / `hreflang` / `lang` 的链接：14 个语言版本互为可抓取内链，不依赖 JS。
  - 当前 query 在浏览器初始化时补进 href，构建产物不带 query；点击只写 `user-language` Cookie。
- `website/public/robots.txt`：Disallow `/cdn-cgi/l/email-protection`（Cloudflare 邮箱混淆占位地址，抓取得到 404）；删除已过期的域名 TODO 注释。
- 官方 X 入口下线：`x.com/VimeoDownloader` 返回 404。
  - `src/lib/site.mjs` 删除 `OFFICIAL_X_HANDLE` / `OFFICIAL_X_URL`；`Layout.astro` 的 `Organization.sameAs` 只保留商店地址，移除 `twitter:site`。
  - `CompanyPage.astro` 删除 Contact 页 X 按钮与 `official_x_click` 埋点；`companyContent.ts` 删除 14 语言的 `officialXLabel`；删除只此一处使用的 `XBrandIcon.astro`。
  - 账号可用后按 `feat.md` §「官方 X 入口（暂停）」恢复。
- 发布两篇插件类 Guides（英文）：`save-vimeo-audio-as-mp3-or-m4a`、`download-vimeo-subtitles-as-vtt`。
  - 插件已于 2026-10-08 上架，「待插件上架」前提解除；正文按源码逐条核对（`vimeoMediaDownloader` 默认目录、`Best Audio`、kbps 标签、`Rescan`、`Unavailable`）。
  - 源稿的截图占位按 spec §8 不保留假图，`[EXTENSION_CTA]` 换成商店真实链接；FAQ 由粗体段落改为三级标题，与已发布文章一致。
  - `llms.txt` / `llms-full.txt` 的 `## Guides` 同步两条。
- `feat.md` / `tech-LLMs与增长入口.md`：导航改为只有 Home；补语言切换器的链接化规格；robots 补 email-protection；文章清单补两篇。

**验证**：`pnpm build` 通过（93 → 95 页，sitemap 63 → 65 URL）；`node --test tests/module-scripts.test.js` 101/101 通过；本地真实页面核对两篇文章的 title / canonical / robots / H1 / Article + BreadcrumbList、锚点有效、390px 无横向溢出；首页语言链接带 query 且下拉可展开。

**部署与收录（2026-10-25）**：
- 已部署生产（版本 `v20261025_095105`）。`deploy.sh` 的第 6 步 Nginx 配置上传因 SSH 连接中断失败，但 `vimeo-web.conf` 本次未改动，线上配置无需变更；版本目录已切换、`current` 指向正确。
- 线上核验：`/`、`/guides/`、两篇新文章、`/about/`、`/contact/`、`/ext-pricing/` 均 200；`en-sitemap.xml` 13 条；首页 14 个语言链接；`llms.txt` 含两条新文章。IndexNow 手动补交返回 202（key 文件仍是 404，按既有裁决不修）。
- GSC「要求建立索引」用 hydra 的浏览器提交 11 个 URL：6 个 Guides 页（含索引页与两篇新文章）、首页、`/ext-pricing/`、`/about/`、`/contact/`。两篇新文章在提交时「網址不在 Google 服務中」（从未被抓取）。
- 提交到第 12 个 URL 时触发 GSC 单日配额上限（「超過配額」），未提交的 13 个语言首页、语言 about/contact 与 `terms`/`privacy` 需次日再提交。GSC 的 sitemap 操作菜单没有重新提交入口，只能等 Google 按 lastmod 重抓。

**已知限制**：两篇文章的界面描述来自源码，未用发布版插件实测 M4A / MP3 / VTT 落盘；截图待补；索引与排名变化需数天到数周才可见，不能把本次提交当成结果。

## 2026-10-26 收录复查：新文章已入索引，旧 Guides 仍未被抓取

**Why**：复查 10-25 的索引请求效果，并补交前一日因配额未提交的页面。

**GSC 索引状态（10-26 读取，sitemap 上次更新 2026-10-23）**：
- 已索引 31 → **37**；未索引 43 → 37（「已找到 - 尚未建立索引」26 → 25，「已检索 - 尚未建立索引」10 → 4）。
- **新增索引的 6 个页面全是语言版 about / contact / ext-pricing**，没有一个 Guides。
- 逐页检查：`/guides/` 索引页、`save-vimeo-audio-as-mp3-or-m4a`、`download-vimeo-subtitles-as-vtt` 已编入索引；**4 篇 2026-10-07 发布的旧 Guides 仍为「網址不在 Google 服務中」**（尚未被抓取）。
- 这说明 10-25 的索引请求对语言页有效，但 4 篇旧文章仍在队列中；新文章能先收录，是因为它们同时被两篇新文章所在的索引页和 sitemap 提及，且是新 URL。

**查询表现（近 28 天，10-06 至 10-24）**：66 点击 / 673 曝光 / CTR 9.8% / 平均排名 20.8。`vimeo downloader` 7 点击、29 曝光、排名 42.5；`vimeodownloader`（品牌词）6 点击、排名 4.6。**Guides 页面至今 0 曝光、0 点击**。

**GSC 索引请求配额**：10-25 在第 12 个 URL 触顶；10-26 提交 45+ 个 URL 均未触发配额，只有当日新增的 3 个（`/th/`、`/privacy/`、`/guides/how-to-download-a-vimeo-video/`）是真正的新提交，其余返回「已要求建立索引」。因此 10-25 的「配额约 11–12 个/天」判断不成立，实际限制更可能是**单个 URL 的请求频率**或当日已提交过的 URL 不再消耗配额。

**sitemap lastmod 缺陷**：10-25 首次部署时构建发生在 git 提交之前，新文章的 `lastmod` 取到了模板文件的 `2026-10-12`；10-26 重建后已变为 `2026-10-25T20:10:22+08:00`，但**未能部署**（见下）。

**部署阻塞**：服务器 `51.81.87.195` 的 SSH 在 `kex_exchange_identification` 阶段被断开（TCP 可连、站点 HTTPS 正常返回 200）。本机出口 IP `67.159.48.149` 疑似被 fail2ban 封禁或 sshd 限流。10-25 部署时也出现过一次同样断连。**修正后的 sitemap 尚未上线**，需在 SSH 恢复后重新执行 `deploy.sh`。

**已知限制**：上述索引数字来自 GSC 的「网页索引状态」报告，存在数天延迟；Guides 是否最终被收录需继续观察，不能把「已要求建立索引」当成已收录。

### 抓取诊断（2026-10-26 补充）

**GSC 即时测试结论**：对 `how-to-download-a-vimeo-video` 运行「测试线上网址」，结果为「Google 可為網址建立索引」「網頁可編入索引」，BreadcrumbList 有效。**页面本身没有任何索引阻碍**，问题不在 canonical / robots / 渲染，而在 Google 没有发起这次抓取。

**GSC 抓取统计（上次更新 2026-10-21）**：
- 抓取要求总数 680：`vimeodownloader.app` 531、`api.vimeodownloader.app` 145、`www.` 4。
- 依目的：**重新整理 88%，发现方式 12%**。Google 几乎只在重抓已知 URL，几乎不按新发现的 URL 抓取——这与「4 篇旧 Guides 三个月零抓取」一致。
- 依文件类型：**JavaScript 47%、HTML 22%、JSON 15%**；依 Googlebot 类型：网页资源载入 52%、桌面 26%、手机 13%。
- 回应分布：200 占 97%、301 占 2%、404 占 1%。

**结论**：不是技术缺陷，是抓取预算与站点权重问题。JS 占近半抓取量说明 Google 在渲染首页的下载工作区，进一步压缩了可用于抓正文的比例。旧 Guides 从新文章只获得 2–3 条内链、从首页只有 1 条，指向它们的入链本来就少。

**验证实验（2026-10-26，已提交 `d6a1ada`，未部署）**：
- 给有实质改动的三篇（how-to、not-working、两篇新文章）更新 `updatedAt` 为 2026-10-26；legal 与 button-missing 内容没变，日期保持 2026-10-07，不做只改日期的伪更新。
- 补交叉内链：how-to → 音频/字幕；not-working → 音频/字幕；两篇新文章 → button-missing / not-working，并互相链接。四篇旧文章从新文章的入链由 0 增至 2。
- 重建后 sitemap 中这 5 篇的 `lastmod` 变为 `2026-10-26T20:25:03+08:00`。
- **观察口径**：部署后 7–14 天，看这 4 篇是否出现首次抓取（「上次检索日期」不再是「不适用」），而不是看是否立刻被索引。若 14 天后仍未抓取，则 `lastmod` 与内链都不是瓶颈，应停止在这条路径上继续投入，转向外链与站点权重。

## 2026-10-07 上线 Guides 长尾文章（英文 4 篇）

**Why**：hydra 确认了 `docs/seo-skill/` 的英文源稿，并确认在线工具只针对公开视频。现在发布不依赖插件的 4 篇：
- how-to-download-a-vimeo-video
- is-it-legal-to-download-vimeo-videos
- vimeo-download-button-missing
- vimeo-downloader-not-working

只存音频、存字幕两篇依赖插件，等插件上架后再发布。

**变更**：
- `feat.md`：
  - 新增「Guides 文章页」：文章清单、语言与收录规则、界面元素；
  - 页面集合、页脚、导航语言切换器、业务流程、验收与埋点同步。
- `tech-落地页与Sitemap.md`：
  - §2.5 补 `/guides/` 与 `/guides/{slug}/` 的源文件映射；
  - §4.2 补 Guides 的 SEO 字段来源；
  - §4.6 补 Guides 的 hreflang 取值与 `availableLocales`（语言切换器）规则；
  - 新增 §5：内容模型、路由与语言判定、渲染、结构化数据；原 §5 改为 §6。
- `tech-LLMs与增长入口.md`：
  - 两份 llms 入口新增 `## Guides`；
  - 允许的站内 URL 补 Guides；
  - 退役路由按完整路径段匹配；
  - 语言切换器改按 `availableLocales` 渲染；
  - 页脚 Resources 组补 Guides。
- 代码：
  - 新增内容集合 `guides` 与 4 篇英文正文。上线前相对源稿的改动：
    - 去掉扩展相关段落与截图占位；
    - 日期移到页头；
    - FAQ 问题改成三级标题；
    - 在线工具对私密、密码保护、付费视频统一写作「不支持」（源稿两处写的是「不保证可用」）；
    - 「Video only」改成「一个带声音的 MP4」，避免误读成没有声音。
  - 新增 `GuidePage`、`GuidesIndexPage`，root 与 `[lang]/` 路由，以及 `guidesContent.ts`（外框文案 14 语言齐全）。
  - Markdown 关闭 smartypants；新增 `rehypeTableCellLabels`，供手机表格卡片显示列名。
  - `SiteBandHeader` 新增 `breadcrumb` 插槽。
  - `Layout`：
    - `includeLanguageSwitcher` 换成 `availableLocales`，语言切换器只列本页存在的语言；
    - 页脚 Resources 组按语言显示 Guides 入口。
  - `languageSitemap`：登记 Guides 页面族。
  - `llms.txt` / `llms-full.txt`：新增 Guides。
  - `module-scripts.test.js`：
    - 新增 Guides 用例；
    - 退役路由检查改为按路径段匹配；
    - 删除首页「Clarity ID 恰好出现一次」的断言。Clarity 已在 2026-10-06 删除，这条断言从那次提交起一直失败。

## 2026-10-06 上线后修正：品牌词落位、法务页多语言去重、运营主体公示、在线工具能力文案

**Why**：上线当天的 SEO 审计（`docs/scratch/vimeodownloader.app-audit/`）发现四个问题。
1. 13 个语言的 Terms / Privacy 只渲染英文回退稿，却可索引、互指 hreflang、进 sitemap，形成 26 个重复页。
2. 运营主体只出现在 Terms 里。
3. `SITE_TITLE` 让 14 个语言首页共用同一条英文 title。
4. 首页把在线工具写成可选分辨率、可批量；后端实际只返回最高画质的一个 MP4，且一次只解析一个链接。

另外，hydra 要求品牌词「Vimeo Downloader」落到页头、首页 title、页脚、结构化数据 name 与 `og:site_name`。

**变更**：
- `tech-落地页与Sitemap.md`：
  - §2.7：sitemap 排除改为读构建产物的 robots noindex，删除支付回跳页的硬编码路径清单。
  - §4.1：新增全站 `WebSite` 与 `Organization.legalName`；Legal 页 publisher 改为引用 `@id`。
  - §4.2：首页 title 必须含品牌词，且 14 语言各自本地化。
  - §4.3：品牌合同去掉已删除的 `serviceName`，补充运营主体规则。
  - 新增 §4.6：hreflang 与法务页索引规则。
- `tech-LLMs与增长入口.md`：页脚法务链接文案改取 `companyContent`；底部新增运营主体说明行。
- `feat.md`：
  - 页脚去掉官方 X，与 599b597 的代码一致；
  - 新增运营主体公示、品牌词与法务页索引的验收项；
  - 长尾文章页改为「已决定启动、尚未上线」。
- 代码：
  - `site.mjs`：删除 `SITE_TITLE`，新增 `OPERATOR_LEGAL_NAME`。
  - `Layout`：`title` 改为必传；`includeAlternateLanguageLinks` 换成 `alternateLocales`；新增 `og:site_name`、`application-name`、`WebSite`。
  - `legalContent`：派生 `LEGAL_CONTENT_LOCALES`，Privacy 引言写明运营主体（Last updated 改为 2026-10-06）。
  - `companyContent`：Privacy / Terms 链接文案上提为公共字段，新增 `operatorStatement`。
  - 14 语言字典：首页 title 改为「Vimeo Downloader - 当地语言任务描述」，按英文 `Download HD Video & Audio` 意译；在线工具说明与对比表「批量」格改为与实现一致。
  - 删除 Microsoft Clarity：Layout 里被注释的加载代码、Privacy 中的 Clarity 与会话回放披露；`feat.md` 的访问分析只保留 GA4。

## 2026-10-06 官网视觉升级：Pricing 路径改回 `/ext-pricing/`，全站深色与首页版式重做

**Why**：005 恢复 `/ext-pricing/`、删除 `/pricing/`，全站改深色科技风。决策与范围见 `../000.架构/plans/005.官网视觉升级与Pricing路径改回.md`。

**变更**：
- `feat.md`：Pricing 页族路径与已删除路由口径改为 `/ext-pricing/` 存在、`/pricing/` 不存在；按钮规格、导航栏与页脚改为深色版式；首页区块表补首屏一行插件入口、浏览器窗口示意、bento 功能卡、竖向时间线、手机对比卡片、CTA 卡。
- `tech-落地页与Sitemap.md`：页面族映射与 SEO 来源改为 `/ext-pricing/`（`pages/ext-pricing.astro`）；H1 由 `titleBrand` + `titleTagline` 拼成；首屏一行入口键；`ExtensionMockup.astro` 共用；新增 §4.5 Legal 目录当前项规则；Legal / Company 页族的源文件映射补 `SiteBandHeader.astro`。
- `tech-LLMs与增长入口.md`：导航 Pricing 链接与语言切换示例改为 `/ext-pricing/`；不存在路径列表改为含 `pricing`、不含 `ext-pricing`；Install 改为主按钮（移动菜单里是带图标的满宽主按钮）。

## 2026-10-05 官网改版：首页即工具页 + 8 个插件展示区块，下线平台落地页、更新日志与签到入口

**Why**：网站定位改为「首屏免费网页下载 + 插件展示 + 插件订阅购买」。工具已在首页首屏，独立平台落地页与同一关键词重复；更新日志条目与插件真实版本无关；Credits 与签到不再在网站提供。决策基线见 `../000.架构/plans/004.官网改版-插件展示与免费网页下载.md`。

**From → To**：
- `feat.md`：重写。首页改为工具首屏 + 8 个区块（插件介绍、功能、使用步骤、网页版与插件对比、适用范围与边界、方案概览、FAQ、结尾 CTA）；导航只有 Home / Pricing / Install；页脚只有 Company 与 Resources(Terms / Privacy)；删除平台落地页、更新日志、首页账户入口、Credits 徽标与签到弹窗的描述，签到后端保留但网站不再调用。
- `tech-落地页与Sitemap.md`：重写。平台落地页章节改为「不存在」；首页区块改为现组件（`components/homepage/Home*Section`），旧的情景表、HowTo、Solutions、卖点网格、排错、合规卡、方法对比、互链区块已删除；结构化数据只剩 FAQPage + SoftwareApplication（删除 WebApplication）；sitemap 页面族只剩首页 / Terms·Privacy / About·Contact / Pricing，删除 changelog、`-downloader/`、ext-pricing 三族与回跳页分支；源文件路径改到 `components/pricing/` 与 `components/order-checkout/`。
- `tech-LLMs与增长入口.md`：重写。llms 文件结构改为 Pages / Sitemap / Key Facts（完整入口另有 Language Entrances 与 Sitemaps），只列真实存在的 6 个页面；测试约束与禁项删除 `vimeo-downloader`、`changelog`；`layout.nav` 字段为 brand / home / pricing；页脚 Resources 去掉 Changelog；Layout 里的 Solution 菜单残留已不存在。
- `tech-签到活动.md`：删除网站前端合同，只保留后端合同，开头加下线说明（网站不再调用）。
- 后端签到接口、数据与配置保留，后续处理见 004 计划 §8。

## 2026-09-18 整仓单平台转型：SEO 资产收敛到 Vimeo 单平台

**Why**：产品只剩 Vimeo 一个平台，TikTok / X / Instagram / Threads 落地页、互链区块与禁下载频道 workaround 长尾页已全部删除；旧文档仍在描述 5 个平台落地页与 Solution 下拉分组。

**From → To**：
- `tech-落地页与Sitemap.md`：全量重写。平台落地页从 5 个 → 1 个（`vimeo-downloader.astro`，`type Platform = 'vimeo'`）；页面区块改为 Hero → Features → HowTo → FAQ（无 Cross-Links，`homepage.crossLinks` 14 语言均未填充）；sitemap route family 与 robots 排除规则按代码订正（四个支付回跳页）；首页改造章节改为 Vimeo 口径；删除 workaround 长尾页整章。
- `tech-LLMs与增长入口.md`：llms.txt / llms-full.txt 章节结构按构建产物订正；导航改为 Home + Pricing 两项，Install 图标改为 `/googe-ext-logo-192px.svg` 图片；删除 Solution 下拉与 Footer Solution 内链，改为 Company + Resources 两个分组。
- `feat.md`：删除多平台落地页、跨平台互链、长尾文章页、Solution 分组；官方 X handle 改为 `OFFICIAL_X_HANDLE`（占位值 `@VimeoDownloader`）；埋点域名改为单站 GA4 + Clarity。
- 删除 `plans/002.website-tgd-pro-SEO优化.md`。

## 2026-09-11 插件 Popup 品牌回流入口

**Why**:主站插件 Popup 头部的品牌名此前只是静态标题,插件活跃用户没有一步到官网的路径,Pricing、签到、文章页等增长面对他们不可见。

- Popup 头部改为 Logo + 品牌名整体可点击的按钮,新标签页打开主站首页,URL 沿用插件打开 Pricing 的同一套来源参数约定(`utm_source=extension`,`source=header_brand`),依赖 GA4 UTM 归因,不新增插件侧埋点。
- 悬停提示与可访问名称新增 14 语言文案"前往官网";Logo 复用扩展自带图标,作装饰图标处理。
- 主站对 `utm_source=extension` 的特殊处理仅限 Pricing 页入口识别,首页不受影响。

## 2026-09-11 退役 GSC/GA4 运行时采集

**Why**:后台 GSC/GA4 定时采集不再使用,继续保留 cron、OAuth 授权链路和快照表只会留下每小时空跑的任务、多余的授权凭据存储和无人消费的历史快照。

**删除**:

- 后端采集链路:每小时采集 cron、`google_metrics_collect_service`、`google_data_oauth_service`、`google_data_config_service`、`google_metric_snapshots` 与 `google_data_oauth_token` 两张表的 model,以及 `GOOGLE_DATA_*` 错误码与多语言文案。
- admin API 的 `/system-settings/google-data/*` 全部端点(状态/配置/授权/断开/手动采集)。
- admin 前端系统设置页"google 数据采集"tab、对应 API 封装、i18n 文案与 e2e 用例。
- 外部系统大盘响应中的 `google_metrics` 段(最近一次 GSC / GA4 快照),大盘其余统计不受影响。
- `tech-GSC与GA4采集.md` 与对应 plan;`feat.md` 移除采集相关口径。

**边界确认**:

- 2026-08-13「退役离线市场调研工具」中"后台 GSC/GA4 定时采集继续保留"的口径由本条推翻。
- 服务器侧残留有意保留,不影响运行:同步脚本不删表,旧数据随各环境正常发版后不再被读写;如以后想清理,对象是 `google_metric_snapshots`、`google_data_oauth_token` 两张表和 `system_data.data_key="google_data"` 配置行;Redis 一次性 OAuth state key 带 TTL 自然过期。
- 用户 Google 登录(`google_auth_service` 等)与本次采集链路无关,不受影响。

## 2026-08-14 移除 TGD Pro Changelog 页面

**Why**：`website-tgd-pro` 不再对外提供产品更新日志，需要同时撤下导航入口、静态页面与机器索引，避免搜索引擎继续发现失效内容。

**变更**：

- 删除 `/changelog/` 与 13 个本地化路由，以及页面组件、i18n 内容契约和专用样式 token。
- Footer、原型、sitemap、LLM 索引和 SEO 构建校验同步移除 Changelog；可索引矩阵从 98 页调整为 84 页。

## 2026-08-13 退役离线市场调研工具与资料

**Why**:仓库不再承担市场调研与离线报告产出,继续保留采集脚本、依赖、规范和历史报告只会制造无效维护入口。

**删除**:

- 根目录 `scripts/market/` 下的 Website、Extension、SERP、Trends 与 OAuth 离线采集工具及独立依赖。
- `docs/market/` 下的采集入口、采集规范与历史市场报告。
- `.claude/commands/seo_research.md` 与离线 GSC/GA4 扩展调研文档。
- SEO 产品文档中的 SERP/Trends 离线工具范围、流程、验收与埋点说明。

**保留**:

- 后台 GSC/GA4 定时采集属于正式运行时能力,继续由 `tech-GSC与GA4采集.md` 管理。

## 2026-08-13 彻底退休 Solutions 页面

**Why**:`/solutions/` 已由 Cloudflare 长期 301 到禁下载频道 workaround 指南，但旧 Astro 路由仍生成页面并进入 sitemap、LLM 索引和 Breadcrumb，向搜索引擎持续宣告退役 URL。

**变更**:

- 删除 `/solutions/` 与 14 语言路由、`NoLimitsPage` 组件及其专属 i18n schema/文案。
- sitemap、LLM 索引和 workaround Breadcrumb 不再输出 `/solutions/`；Breadcrumb 收敛为「首页 → 当前指南」。
- Cloudflare 继续保留所有语言的 `/solutions` 与 `/solutions/` 一跳 301，只承担历史外链和搜索引擎旧索引迁移。
- 构建产物与 E2E 测试明确将 `/solutions/` 视为已退休路径。
- `website` 主站、测试站及 `website-tgd-pro` Nginx 改为按真实 `index.html` 统一补尾斜杠，并显式返回 HTTPS，覆盖所有现役 Astro 页面且不再维护路由名单；TGD Pro 的 `/solutions/` 仍是正式页面。两站部署脚本均负责校验、失败回滚并 reload vhost。

## 2026-08-11 接入官方 X 账号

**Why**:官方 X 账号已启用，但官网缺少可见入口和机器可读的主体关联，用户与搜索引擎无法从站内确认账号归属。

**变更**:

- 主站 14 语言 Footer 的 Company 分组新增带品牌图标的官方 X 入口，统一跳转 `https://x.com/TGDownload`。
- Contact 页在邮件支持旁增加官方 X 资料入口，保留邮件为主要支持渠道，不把 X 私信表述为客服承诺。
- 全站 `Organization.sameAs` 与 `twitter:site` 关联官方账号；Footer 和 Contact 点击分别上报来源明确的 GA4 事件。
- 构建产物测试覆盖 14 语言入口与元数据，Playwright 覆盖 Footer 和 Contact 的可见链接、handle 及安全外链属性。

## 2026-08-07 新增 About 与 Contact 信任入口

**Why**:两个官网缺少可抓取的产品身份与公开联系方式，GEO 审计无法把产品主体、支持渠道和页面来源关联起来。

**变更**:

- `website/` 与 `website-tgd-pro/` 新增 `/about/`、`/contact/` 及 14 语言静态路由，正文、SEO 文案和可见发布日期由统一内容模型提供。
- `website/` Footer 使用 Company 分组；`website-tgd-pro/` 将 About、Contact 与 Terms、Privacy、Changelog 放在同一紧凑链接区。页面之间形成互链，Contact 公开可点击的支持邮箱。
- 全站 `Organization` JSON-LD 新增稳定 `@id`、邮箱和 `ContactPoint`；About/Contact 页面通过 `@id` 引用同一主体，并声明 `datePublished` / `dateModified`。
- 两站的 Sitemap lastmod 源文件映射、LLM 索引与构建产物测试同步覆盖新页面；`website-tgd-pro/` 的 `llms.txt`、`llms-full.txt` 继续由构建集成生成。

## 2026-08-07 两个网站接入 Microsoft Clarity

**Why**:两个网站需要补充页面交互热图和会话回放,辅助定位 GA4 聚合事件无法解释的使用问题;两个域名使用独立项目,避免实验站与主站数据混合。

**变更**:

- `website/src/layouts/Layout.astro`:在主站全局 `<head>` 加载 Clarity 项目 `xyfmieibkw`。
- `website/src/legal/legalContent.ts`:隐私政策明确披露 Microsoft Clarity、交互分析与会话回放,并更新修订日期。
- `website-tgd-pro/src/layouts/Layout.astro`:在 `telegramvideodownload.pro` 全局 `<head>` 加载独立 Clarity 项目 `xygoc648m6`。
- `website-tgd-pro/src/legal/legalContent.ts`:同步披露 Microsoft Clarity、交互分析与会话回放,并更新隐私政策修订日期。
- `website-tgd-pro/tests/module-scripts.test.js`:验证所有构建页面恰好加载一次新站 Clarity 项目。
- `feat.md`:记录两个域名的访问分析范围与 Clarity 项目隔离要求。

## 2026-07-21 GSC Query 改为曝光 Top 200

**Why**:点击 Top 20 无法解释总曝光的长尾变化,且快照中的完整浮点精度增加了无效 JSON 体积。

**变更**:

- 24H / 7D / 28D `top_queries` 统一最多扫描 25,000 行,按 impressions 降序、clicks 次排序保存前 200 行。
- page / country / device 等非 query 维度继续沿用原有数量口径,不随 Query 扩大。
- GSC / GA4 快照完成计算和筛选后,落库前将 float 指标四舍五入到最多 4 位小数。

**边界确认**:

- 历史快照不回写;新口径从下一次采集开始生效。
- Top 200 只覆盖 Search Analytics API 在单次 25,000 行扫描中返回的 query,不包含 Google 因隐私规则隐藏的数据。

## 2026-07-16 签到活动严格封顶 14 天

**Why**:一条开始时间异常的存量 campaign 被计算为第 15 天,前端展示 `Claim 0 Credits`;领取请求先占用当天状态、再因零金额发奖失败。

**变更**:

- 签到配置固定为 14 天,奖励规则必须正数且完整、无重叠地覆盖第 1-14 天。
- 正常活动按配置截断错误的超长 `end_at`,对外 `day_index` 始终限制在 1-14。
- 第 14 天领取后不再返回下一次领取时间。
- 前端只在奖励大于 0 时展示和执行领取动作,非法零奖励状态不再打开签到弹窗。

**边界确认**:

- 第 14 个自然日当天仍是有效活动日;进入下一自然日后活动结束。
- IP 注册权益风控创建的已过期 campaign 继续以落库结束时间为准,不依赖签到配置恢复权益。

## 2026-07-03 签到活动接入 IP 注册权益风控

**Why**: 同一 IP 短时间大量注册的账号不应继续通过 website 签到活动领取 Credits。

**变更**:

- `feat.md`:签到活动产品口径补充命中 IP 注册权益风控时不给可领取活动。
- `tech-签到活动.md`:补充注册阶段插入已过期活动,以及签到入口先读最新 campaign 的规则。

**边界确认**:

- 风控配置和 `user_ip_registers` 表归用户系统。
- 本域只消费判断结果并保持现有签到响应/错误口径。
- 不做幂等;辅助表被清理后只影响后续新注册判断。

## 2026-06-29 主站 pricing 重新上线后的可发现性口径

**Why**: 新 pricing 页成为公开购买页,主站 `/pricing/` 不应再按下线页处理。

**变更**:

- `feat.md`:补充主站 pricing 进入 sitemap,但不进入 LLM 索引。
- `tech-LLMs与增长入口.md`:pricing 禁项说明从“robots 屏蔽”改为“公开页但不进 AI 可读索引”。

## 2026-06-29 新增 GSC/GA4 运行时采集设计

**Why**:运营需要在后台完成 Google 授权后,由后端定期保存 Search Console 与 GA4 核心指标快照,替代人工查看数据。

**新增**:

- `feat.md`:把 GSC/GA4 运行时指标采集纳入 SEO 与增长域,明确授权流程、采集范围、非目标、验收标准。
- `tech-GSC与GA4采集.md`:新增技术方案,定义 OAuth 授权、GSC/GA4 API 口径、统一快照表、cron、系统设置页 UI 与验收。

**口径确认**:

- GSC 24H 可通过 Search Analytics `dataState=hourly_all` 采集,但属于 fresh/hourly 部分数据,后续可能被 Google 修正。
- GSC 7D / 28D 可采 `clicks` / `impressions` / `ctr` / `position`。
- GA4 最近 30 分钟活跃用户可通过 Realtime API `activeUsers` 采集。
- GA4 Active users 可通过 Core Reporting API `activeUsers` 按 today / 7D / 28D 自然日窗口采集;不把小时 activeUsers 相加冒充滚动 24H 去重。
- OAuth callback 不走 admin 鉴权,只校验一次性 state;首版不申请 `openid` / `email`,不展示授权邮箱。
- GSC 与 GA4 最近成功时间和错误摘要分开保存、分开展示,避免一侧成功掩盖另一侧失败。
- GSC 与 GA4 的窗口时区和日期范围不同,每个窗口都要保存并展示 `window_label` / `timezone` 口径。
- 首版只做单站点、单 property、一张 JSON 快照表;不做多账号、多属性、趋势图、告警或补偿重算。

## 2026-06-29 Google 数据采集配置迁入 system_data

**Why**:采集目标不能靠部署 YAML 或历史默认值猜测,管理员必须能在后台明确配置当前 GSC siteUrl、GA4 propertyId 和 Google OAuth client。

**变更**:

- `tech-GSC与GA4采集.md`:把 Google 数据采集配置来源从 `google_data.*` YAML 改为 `system_data.data_key="google_data"`。
- 新增 `system_data` 表规格:data_key + JSON data_value + 毫秒时间戳。
- 明确 `system_data_service` 读取缓存 30 分钟,更新后清空缓存。
- status/API 响应只返回 `client_secret_configured`,不返回 `client_secret` 明文。

**边界确认**:

- 用户 Google 登录仍使用 `auth.google_client_*`,不属于本次 GSC/GA4 采集配置。
- GSC/GA4 采集链路只读取后台保存的 `system_data.google_data`,不再从部署 YAML 或历史默认值推断站点/property。

## 2026-06-23 文档结构迁移(扁平 feat → 领域目录)

**Why**:SEO/增长是独立的业务域(平台落地页、多语言 Sitemap、llms.txt、签到活动、导航/CTA),原能力分散在多个扁平 feat 文档与对应 plan,且多个 feat 的口径与现行代码严重不符(平台数过时、导航最终状态过时、robots 规则不一致等)。按"产品需求 vs 技术实现"拆分,所有口径以现行代码事实为准重写。

**From → To**:

- `docs/feat/feat.020.平台SEO落地页.md` + 原 plan feat.020.001.平台SEO落地页 → 本域 `feat.md`(产品:平台落地页策略/Sitemap/llms/签到/增长入口/边界/验收)+ `tech-落地页与Sitemap.md` §1(平台落地页共享模板/路由/JSON-LD)。
- `docs/feat/feat.026.website多语言Sitemap治理.md` + 原 plan feat.026.001.website多语言Sitemap治理 → `tech-落地页与Sitemap.md` §2(自定义 languageSitemap 集成/14 语言拆分/lastmod 规则/页面族映射)。
- `docs/feat/feat.028.websiteLLMs入口.md` + 原 plan feat.028.001.websiteLLMs入口 → `tech-LLMs与增长入口.md` §1(llms.txt/llms-full.txt 内容规则/robots Allow/测试约束)。
- `docs/feat/feat.030.website禁下载频道workaround落地页.md` + 原 plan feat.030.001.website禁下载频道workaround落地页 → `feat.md`(长尾文章页产品)+ `tech-落地页与Sitemap.md` §3(文章页路由/组件结构/结构化数据/UI 规格)+ `tech-LLMs与增长入口.md` §3-§5(Solution 下拉/Footer 内链/语言切换保 slug)。
- `docs/feat/feat.052.website签到活动与首页账户入口.md` + 原 plan feat.052.001.签到后端与Credits发放 + 原 plan feat.052.002.website首页账户入口与签到弹窗 → `feat.md`(签到活动产品/账户入口 UI/签到弹窗 UI)+ `tech-签到活动.md`(活动规则/Credits 发放接线/两个 POST 接口/时区/并发幂等)。前端账户入口/弹窗 UI 留在 `feat.md`(本域直接拥有的 UI);登录态/退出登录归 `@../007.用户系统`。
- `docs/feat/feat.029.website导航与插件CTA识别.md` + 原 plan feat.029.001.website导航与插件CTA识别 → `tech-LLMs与增长入口.md` §3(导航与 Install CTA 最终状态)。
- `docs/feat/feat.024.website首页private视频下载改造.md` + 原 plan feat.024.001.website首页private视频下载改造 → `tech-落地页与Sitemap.md` §7(首页 SEO meta 独立化 / private video downloader 区块顺序 / FAQPage JSON-LD / 合规风险登记)。**跨域归属修正**:原 feat.024 是纯 SEO 内容改造(14 语言、JSON-LD、关键词、sitemap),不是下载功能改造,归本域而非 `@../002.下载功能`;002 的 `references/index.md` §5.1 仍保留 024 作为 telegram 站点适配源 feat 索引(下载工作区 Hero 复用边界),但 024 的内容主体在本域 §7。

**@ 引用的相邻域**(只引用,不搬实现):

- website 目录结构/构建配置/Astro 技术栈:`@../000.架构/overview.md` `@../000.架构/tech-website.md` `@../000.架构/tech-backend.md`
- 14 语言清单/locale→URL 路径映射/文案 key 组织:`@../010.多语言/feat.md` `@../010.多语言/tech-website多语言.md`
- 下载工作区/下载链路/解析/播放:`@../002.下载功能/feat.md`
- 登录态/用户身份/Google 登录/退出登录:`@../007.用户系统/feat.md`
- Credits 余额账户/流水/扣费/积分包购买:`@../003.积分系统/feat.md` `@../003.积分系统/tech-数据模型与扣费.md`

**与源文档的关键差异(以代码为准)**:

1. **平台落地页数从 3 扩到 5**:源 feat.020 只规划 TikTok/X/Vimeo 三个平台。代码事实:`website/src/pages/*-downloader.astro` 与 `[lang]/*-downloader.astro` 已落地 **5 个平台**(TikTok、X、Vimeo、Instagram、Threads);`PlatformDownloaderPage.astro` 的 `Platform` 类型联合含这 5 个。该文件头部注释仍写"三个平台",是**过时注释**。本域 `tech-落地页与Sitemap.md` §1 按 5 个平台写。

2. **导航 Solutions 最终状态(029 + 030 合并)**:feat.029(2026-06-04 09:26)删除了导航 Solutions 入口、给 Install 按钮加拼图图标、声明删除 `layout.nav.solutions` schema 字段;feat.030(2026-06-04 11:20,同一天)又把 Solution 分组(作为下拉菜单触发器,不跳 /solutions/)加回来承接 workaround 长尾页。**当前代码最终状态:导航有 Home + Solution 下拉(含 workaround 链接)+ 带拼图图标的 Install 按钮**;`website/src/i18n/schema.ts` 约 585 行**仍保留 `layout.nav.solutions: string`**。feat.029 文档里"删除 solutions 导航字段"的口径已被 030 推翻,本域 `tech-LLMs与增长入口.md` §3 按最终状态写。

3. **签到 i18n 是顶层 `checkin` 字段,不是 `workspace.checkin`**:源 feat.052.002 说签到文案是 `workspace.checkin` 字段组。代码事实:`website/src/i18n/schema.ts` 约 38 行的签到文案是**顶层 `checkin` 字段组**(与 `quota`/`creditPurchase` 同级),不嵌套在 workspace 下。本域 `feat.md` 数据埋点与 UI 描述不绑字段路径,避免重复错误。

4. **签到后端路由前缀确认**:源 plan 写 `/api/client/checkin/entry` 与 `/claim`。代码事实:`backend/src/app/main.py` 约 369 行 `include_router(checkin_router, prefix="/api/client")`,路由 `APIRouter(prefix="/checkin")`,完整路径确认是 `/api/client/checkin/entry` 与 `/api/client/checkin/claim`。本域 `tech-签到活动.md` §4 写出绝对路径。

5. **llms.txt 章节结构以代码为准**:源 feat.028 给的章节(如 `## Plans and Updates`)与代码有出入。代码事实:`website/public/llms.txt` 章节是 `## Core Product` / `## Download Tools` / `## Updates` / `## Key Facts` / `## Contact`;`llms-full.txt` 章节是 `## Core Product` / `## Platform Downloaders` / `## Telegram Workflows` / `## Download Disabled Channel Workaround Pages` / `## Language Entrances` / `## Updates` / `## Technical Indexes` / `## Key Facts` / `## Contact`。本域 `tech-LLMs与增长入口.md` §1.3/§1.4 按代码章节写。

**边界确认**:

- 本域只描述 SEO/增长资产与签到活动本身;多语言机制(语言清单/路径映射/文案 key)归 `@../010.多语言`;下载链路归 `@../002.下载功能`;登录态/用户身份归 `@../007.用户系统`;Credits 模型归 `@../003.积分系统`;website 架构归 `@../000.架构`。
- 不搬其他域实现到本域;跨域只 @ 引用。
- 044(统一每日额度)不在本域出现。
