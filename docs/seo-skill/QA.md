# QA：英文长尾文章自检

> 对照 `docs/references/specs/spec-google-seo.md` §11 单页验收清单。核对日期 2026-10-06（外链可达性 2026-10-07 复测）。
> 这是写作者的自检，不替代 hydra 对源语言的确认、母语审校或法务审阅。本轮只产出内容文件，没有实施路由、构建和真实页面验证，所以第 5、6、9 项只能是「部分」或「未实施」。

标记：通过 = 本轮可核实范围内满足；部分 = 内容侧满足但依赖未完成事项；未实施 = 不在本轮范围；待确认 = 需要 hydra 或母语审校。

## 1. 逐篇对照 spec §11

| 篇 | 1 目标与转化 | 2 事实可追溯 | 3 Title/Meta/H1/CTA 一致 | 4 正文覆盖、无堆砌 | 5 canonical/robots/sitemap/内链/hreflang | 6 结构化数据 | 7 locale 记录 | 8 状态不混写 | 9 构建与真实页面验证 |
|---|---|---|---|---|---|---|---|---|---|
| `how-to-download-a-vimeo-video` | 通过 | 通过 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |
| `is-it-legal-to-download-vimeo-videos` | 通过 | 通过 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |
| `vimeo-download-button-missing` | 通过 | 通过 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |
| `vimeo-downloader-not-working` | 通过 | 部分 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |
| `save-vimeo-audio-as-mp3-or-m4a` | 通过 | 部分 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |
| `download-vimeo-subtitles-as-vtt` | 通过 | 部分 | 通过 | 通过 | 部分 | 部分 | 待确认 | 通过 | 未实施 |

各项依据：

- 第 1 项：每篇 `page_seo.md` §1 记录了页面类型（信息/文章页）、单一搜索任务和单一主要转化动作。
- 第 3 项：Title、Meta、H1 的长度已按文本重新计数，与 `page_seo.md` 记录一致（见 §2）。audio、subtitles 的 CTA 是 `[EXTENSION_CTA]` 占位，上架后回填；占位本身没有承诺任何产品做不到的事。
- 第 4 项：没有关键词堆砌；空泛形容词扫描只命中套餐名「Unlimited」、界面按钮名「Best Audio」和否定句里的「guarantee」。
- 第 5 项：内链目标已核对（§2）。canonical、robots、sitemap、hreflang 都取决于 hydra 对路由、入口和语言范围的决定（README §7 第 1 条），未实施。
- 第 6 项：方案写在各 `page_seo.md` 的结构化数据一节：Article + BreadcrumbList，不用 FAQPage、HowTo；`author` 待确认所以省略，`image` 等真实截图。方案未实施。
- 第 7 项：本轮只有 en-US，其他 locale 的市场、关键词、审校和发布状态全部记为「待确认」。
- 第 8 项：每个 `page_seo.md` 都写明「运行时同步：未同步；真实页面验证：未验证」。「源语言稿已完成」没有被写成「已发布」。
- 第 9 项：没有改代码、没有构建、没有开页面，不适用于本轮。

第 2 项为「部分」的原因：

| 篇 | 原因 | 补救 |
|---|---|---|
| `vimeo-downloader-not-working` | 每一行的触发条件来自源码阅读，没有在真实浏览器里逐条复现 | 发布前按该篇 `page_seo.md` §11 复现，补一张真实截图 |
| `save-vimeo-audio-as-mp3-or-m4a` | 面板与 popup 的界面描述来自源码与 `en-US.json`，扩展未上架、没有发布版可核对；整页依赖扩展 | 上架后用发布版重新核对并实测 M4A、MP3 下载 |
| `download-vimeo-subtitles-as-vtt` | 字幕格式「normally WebVTT」来自源码注释和地址形态，没有在带字幕的真实视频上核对；整页依赖扩展 | 上架后用发布版实测，确认文件名、扩展名与内容 |

第 2 项为「通过」的三篇仍有保留：

- `how-to-download-a-vimeo-video`：在线工具的能力说法（一次一个链接、最高画质、不能选分辨率）与工作区未提交的首页文案一致，但首页文案尚未上线，必须先于文章上线（README §7 第 8 条）。
- `is-it-legal-to-download-vimeo-videos`：引文均为逐字核对。「工具不检查你是否有权限」来自源码里没有这类逻辑，没有实测。建议法务或合规审阅后再发布。
- `vimeo-download-button-missing`：官方三条原因与操作步骤逐字核对；「怎样联系所有者」没有写具体入口，因为没有逐项核实。

## 2. 机械检查记录（对 `en-US.md` 与 `page_seo.md` 运行脚本，2026-10-06/07）

| 篇 | 英文词数 | H1 数 | 标题跳级 | 站内链接（去重） | 锚点 | 外链 | EXTENSION_BLOCK 成对 | `[EXTENSION_CTA]` | MEDIA 标记 | 运营主体与非隶属声明 | Last reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| how-to | 1770 | 1 | 无 | 5 | 均存在 | 5 | 4 对 | 1（在块内） | 1 | 有 | 有 |
| legal | 1487 | 1 | 无 | 2 | 无 | 7 | 0 | 0 | 0 | 有 | 有 |
| button-missing | 1051 | 1 | 无 | 2 | 无 | 7 | 0 | 0 | 0 | 有 | 有 |
| not-working | 1360 | 1 | 无 | 4 | 无 | 0 | 3 对 | 0 | 1 | 有 | 有 |
| audio | 865 | 1 | 无 | 4 | 均存在 | 0 | 0（整页依赖扩展） | 2 | 2 | 有 | 有 |
| subtitles | 977 | 1 | 无 | 4 | 无 | 2 | 0（整页依赖扩展） | 2 | 1 | 有 | 有 |

- 站内链接目标全部是已存在的 `/`、`/contact/`、`/ext-pricing/`（`website/src/pages/` 下有对应页面），或本批六篇的暂定路由 `/guides/{slug}/`；没有指向未规划页面的链接。
- 12 个不同的外部链接（Vimeo 帮助页、Vimeo 条款、美国版权局、W3C WebVTT）在 2026-10-07 逐个请求，全部返回 HTTP 200。
- 六篇 `en-US.md` 的 Title、Meta、H1 长度：

| 篇 | Title | Meta | H1 |
|---|---|---|---|
| how-to | 52（上架前）/ 63（上架后） | 148 | 29 |
| legal | 56 | 155 | 37 |
| button-missing | 55 | 149 | 40 |
| not-working | 54 | 145 | 54 |
| audio | 55 | 139 | 54 |
| subtitles | 58 | 151 | 51 |

  how-to 上架后 Title 为 63 字符，超出 60 的检查提示，只在扩展上架后使用；长度只作提示，不牺牲准确性（spec §6）。

## 3. 合规与证据自检（跨篇）

| 检查 | 结果 |
|---|---|
| 不教授绕过私密、密码、付费、DRM、域名限制 | 通过。正文里「bypass」「circumvent」只出现在否定句、Vimeo 条款引文和「不要尝试」的提醒里 |
| 不把在线工具写成越过所有者关闭下载的办法 | 通过。how-to 的开头、方法清单与 Meta 不把工具和「没有 Download 按钮」绑定，只写「你有权保存的公开视频」；button-missing 只指向所有者、许可证和官方路径。该立场待 hydra 确认（README §7 第 2 条） |
| 每篇提醒版权与 Vimeo 条款责任 | 通过，六篇都有。不带「Using ... responsibly」小节的 button-missing 在「What this page doesn't cover」里提醒 |
| 声明不隶属于 Vimeo, Inc.，运营主体 Ginyo Technologies Limited | 通过，六篇都有 |
| 不写未核实能力 | 通过。没有写 iPhone、Android 浏览器上的在线工具、Edge、Brave、速度或成功率数字、免费额度数字。正文里的 Android、iPhone 只出现在 Vimeo 官方 App 的帮助页引用中 |
| 不虚构数据、评价、用户数、排名、案例 | 通过 |
| Vimeo 功能说法引用官方帮助页并带 URL 与读取日期 | 通过。正文写明引用页与「Last reviewed」，`page_seo.md` 记录页面自带的 Updated 日期 |
| 扩展 CTA 只用占位，正文不写「从 Chrome Web Store 安装」 | 通过。六篇正文都不含「Chrome Web Store」；how-to 与 not-working 的扩展句子放在 `EXTENSION_BLOCK` 内，audio、subtitles 整页待上架 |
| 不推荐 HowTo、不承诺 FAQ 富结果 | 通过。FAQ 只作为页面可见内容 |
| 不抢首页词 | 通过。没有以「vimeo downloader」「vimeo video downloader」「download vimeo video online」为目标的文章 |
| 一篇一个独立意图，无近重复页 | 通过。同意图查询已合并（README §3） |

## 4. 发布前必做（按篇）

| 篇 | 前置 |
|---|---|
| how-to | 路由与入口确定；首页未提交文案先上线；补 1 张真实截图（`online-tool-result-card.png`）；上架前删除 4 处 `EXTENSION_BLOCK`；hydra 确认工具立场；真机验证在线工具步骤 |
| legal | 路由与入口确定；建议法务审阅；发布前重读 Vimeo 条款、帮助页与版权局页面 |
| button-missing | 路由与入口确定；发布前重读 Vimeo 帮助页（套餐名与菜单可能变化） |
| not-working | 路由与入口确定；在真实浏览器里逐条复现报错并补 1 张真实截图；上架前删除 3 处 `EXTENSION_BLOCK`；评估下载材料刷新限流风险（README §7 第 9 条） |
| audio | 扩展上架；回填 `[EXTENSION_CTA]`；用发布版核对界面并实测 M4A、MP3；补 2 张真实截图 |
| subtitles | 扩展上架；回填 `[EXTENSION_CTA]`；在带字幕的真实视频上实测文件格式与文件名；补 1 张真实截图 |

## 5. 本轮没有做到

- 没有任何真实截图，没有在真实浏览器里操作过在线工具或扩展。
- 没有核实：手机端、Edge、Brave、SRT、自动生成字幕是否进入播放器配置、第三方嵌入页面上扩展的真实边界。
- 没有 GSC、GA4、搜索量和排名数据；WebSearch 不等于 Google 实时 SERP。
- 没有其他 locale 的调研与本地化。

## 6. 发布复核（2026-10-07，四篇不依赖扩展的文章）

以下各项按 spec §11 复核 how-to、legal、button-missing、not-working 四篇：

| 项 | 结果 | 依据 |
|---|---|---|
| 5 canonical/robots/sitemap/内链/hreflang | 通过 | 各页 canonical 指向自身、`index, follow`，进入 `en-sitemap.xml`；只有英文版本，不输出 hreflang；页面内锚点都能跳到对应小节；页脚 Guides 入口只在英文页面出现 |
| 6 结构化数据 | 通过 | Article（author / publisher 引用 Organization）+ BreadcrumbList；索引页为 CollectionPage；不含 FAQPage、HowTo、image 占位 |
| 7 locale 记录 | 部分 | 只发布 en-US；其他 locale 未调研、未翻译 |
| 9 构建与真实页面验证 | 部分 | `pnpm build` 与 module-scripts 通过；本地 dev 连真实后端，桌面 1280px、手机 390px 检查无横向滚动、面包屑点按区 ≥44px、表格在手机上折成带列名的卡片；线上未部署、未验证 |

发布前复核时按源码改了三处，事实不变：
- 「Video only」改成「一个带声音的 MP4」，避免误读成没有声音；
- 私密、密码保护、付费视频统一写作「不支持」；
- 按钮名写成界面原文 **Paste Vimeo Video Link**。

另外两项：
- 正文里的主机名改成行内代码，否则 GFM 会把 `www.vimeo.com` 自动变成外链；
- 报错原文的直引号与 `...` 原样保留，因为站点关闭了 smartypants。

以上改动都已写回本目录四篇 `en-US.md` 源稿（FAQ 问题同样改成三级标题，扩展块原样保留）。扩展上架后从源稿重新同步，不会丢失这些修正。

仍未做：
- 真实浏览器里逐条复现报错；
- 真实截图；
- 法务或合规审阅（legal 一篇）。

