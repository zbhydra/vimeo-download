# 首页英文变更稿

> 状态：本轮已授权实施，英文稿已按 hydra 的产品决定定稿，尚未部署。以下只列本轮修改或迁移的文案键；页面职责、产品决定与证据见 [page_seo.md](page_seo.md)，实际同步与验收结果见[执行计划 §5](../../feat/009.SEO与增长/plans/001.首页免费定位与搜索意图优化.md#5-验收记录)。本文不是完整首页，也不替代运行时字典。

## 1. 首屏

### 1.1 已确认文案

| 文案键（相对 `pages.homepage`） | 确认英文 |
| --- | --- |
| `workspace.parse.helperText` | Paste a public Vimeo link to save an MP4 for free at the highest available quality. Large files or files of unknown size may require the extension. |
| `workspace.parse.extensionEntryLine` | Need audio, subtitles or a queue? Use the extension. |

品牌行仍由现有 `titleBrand` 提供；本轮不修改 `meta.title`、`meta.description`、`site.description`、主解析按钮文案或两个 trust points。

### 1.2 H1 与插件卡片

B1 保持两张插件卡默认展开，首访时一行入口仍不可见，不改下载状态机。

B2 的 H1 确认稿如下，14 语言按此本地化：

| 文案键（相对 `pages.homepage`） | 确认英文 |
| --- | --- |
| `workspace.parse.titleTagline` | Save Public Vimeo Videos for Free |

Chrome/Edge 卡片的现有 14 语言 Description、Title、CTA 保留原文，不删 any / fast。唯一例外是德语 `largeFileExtensionInlineChromeDescription`、`largeFileExtensionInlineEdgeDescription` 的人称统一为 Sie，保留 jedes / fast 承诺；其他 13 语言卡片及德语 `*Title`、`*Cta` 不变。原改写候选已撤去，除此人称例外不改写卡片原文。

## 2. 网页三步教程

`steps.heading`：

> Download a Vimeo video online

`steps.items` 按以下顺序替换为网页三步；原插件安装四步迁至 §3 的 `intro.steps`，不删除其内容：

| 顺序 | title | description |
| --- | --- | --- |
| 1 | Copy the Vimeo link | Open a public Vimeo video you have permission to save and copy its URL. |
| 2 | Paste it into the online tool | Paste the link into the tool above and select “Paste Vimeo Video Link” to find the video file. |
| 3 | Download the MP4 | Select “Download” and keep this tab open until your browser saves the file. |

教程下方的指南链接使用现有文章标题 How to download a Vimeo video 及实际路径，不另存一份英文锚文本。方法型 how-to 查询由文章承接；H2 与正文不写 “in 3 steps”等数字。

## 3. 插件介绍与方案范围

| 文案键（相对 `pages.homepage`） | 确认英文 |
| --- | --- |
| `intro.heading` | Vimeo Downloader for Chrome |
| `intro.lead` | Use the Chrome extension on the Vimeo page you are watching to save video, M4A or MP3 audio, VTT subtitles and cover images, with a download queue. It has a free daily allowance and a paid Unlimited plan. |
| `intro.secondaryCta` | See extension plans |
| `features.items[2].title` | Vimeo audio as M4A or MP3 |
| `plans.heading` | Chrome extension plans |

保留现有主安装 CTA、音频功能描述、免费额度与 Unlimited 卡片文案、对比表和 FAQ；实施时逐项核对它们与上述范围一致。

`intro.steps` 为迁移的必填数组，保留现有插件四步原文，在插件介绍 CTA 下、示意图前显示；每步 title 用 H3，区块内仅保留原有一个 H2：

| 顺序 | title | description |
| --- | --- | --- |
| 1 | Install | Add the extension from the Chrome Web Store. |
| 2 | Pin the icon | Pin it to your toolbar for quick access to the popup. |
| 3 | Open a Vimeo video | Go to a supported video page on vimeo.com or player.vimeo.com and start playing. |
| 4 | Choose a quality | Click the quality you want in the panel, or open the extension icon for the full list. Your browser writes the file to disk. |

其他 13 语言迁移各自现有四步，不用英文覆盖。本次不自动启用 how-to 源稿的 Option 4，也不据商店已上架自动发布音频、字幕文章。
