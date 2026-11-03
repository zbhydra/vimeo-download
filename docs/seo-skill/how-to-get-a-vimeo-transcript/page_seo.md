# page_seo：how-to-get-a-vimeo-transcript

> 事实核实日期 2026-11-02。来源编号（V/G/P）见 `../README.md` §5。本文件是内容决策记录，不是运行时数据源。
> 发布状态：**2026-11-02 已部署生产（`v20261102_213914`）。** 1.0.4 上架前，插件保存字幕这一步在受影响视频上走不通，见 §4、§10。

## 1. 基本信息

| 项 | 值 |
|---|---|
| slug | `how-to-get-a-vimeo-transcript` |
| 建议运行时路由 | `/guides/how-to-get-a-vimeo-transcript/` |
| 页面类型 | 信息/文章页（spec §4），方法型 |
| 核心搜索意图 | 拿到 Vimeo 视频的文字稿：看、下载、或存成文件后转成纯文本 |
| 页面目标 | 按「只想看 / 视频是自己的 / 别人的公开视频 / 没有字幕」四种情况给出能走通的路径，并说清自动字幕可能不准 |
| 主要转化动作 | 安装扩展（Chrome 商店链接，`utm_medium=guide`、`utm_campaign=how-to-get-a-vimeo-transcript`） |
| 源语言 | en-US |
| 目标市场 | 全球英语（`vimeo transcript` 的 Trends 口径是全球） |
| 目标 locale / x-default | 本轮只有 en-US。其他 locale 待确认 |
| 母语审校 | 待确认 |
| 源语言确认 | 2026-11-02 hydra「一次改完吧」，视同确认 |
| 运行时同步 | 已同步到 `website/src/content/guides/how-to-get-a-vimeo-transcript/en-US.md`，2026-11-02 已部署 |
| 真实页面验证 | 本地 dev 和线上（2026-11-02）桌面 1280px、手机 390px 已验证 |

## 2. 与其他页面的分工

- `download-vimeo-subtitles-as-vtt`：讲怎么把字幕轨存成文件。本页讲「要的是文字」，存文件只是其中一条路径，步骤详情链接过去，不重复全部内容。
- `how-to-download-a-vimeo-video`：讲视频文件，与本页不重叠。
- `save-vimeo-audio-as-mp3-or-m4a`：本页「没有字幕」一节链接过去，作为自行转写的前一步。
- 推翻了旧结论：README §3 的 I08 与字幕篇 §2 曾判「不做，产品不生成文字稿；官方 V5 已覆盖」。这次重新判断的依据是 §5 的需求证据，以及本页的增量：观众侧的 Transcript 面板、别人的公开视频如何拿到文字、VTT 转纯文本的实测方法、真实样本的准确度观察。产品仍不生成文字稿，正文照实写。

## 3. 已用事实与出处

| ID | 正文中的说法 | 来源 | 核实方式 |
|---|---|---|---|
| T1 | Transcript 按钮在 vimeo.com 播放器下方，所有者启用才有；没有按钮表示视频不含文字稿；面板在右侧、高亮朗读位置、可点击跳转、放大镜搜索、设置菜单切语言和显示/隐藏时间戳 | V11，Updated January 13, 2026 | 2026-11-02 curl 读取 HTML 逐句核对 |
| T2 | 官方文字稿下载：Free 和所有付费计划可用；需要编辑权限；只限有上传或自动生成字幕的视频；路径 Library 选视频 → Languages → ⋮ → Download；格式 .srt、.vtt、.ttml；铅笔图标可编辑；官方建议发布前修正自动字幕错误 | V5，Updated October 8, 2026 | 同上。**官方在 10-08 改了口径，此前是「requires a paid plan」** |
| T3 | On Demand 的 Download 窗口可能含字幕文件，官方注明不是所有 VOD 都开放 | V12，Updated January 13, 2026 | 同上 |
| T4 | 官方有添加字幕的帮助文章 | V13（V5 的 Related articles 链接跳转后的地址） | 2026-11-02 curl 确认地址，未逐句读正文，正文只引用标题 |
| T5 | 插件 popup 的 Subtitle 行和页面面板都列出字幕轨，轨道名来自播放器，例如 `English (auto-generated)`；保存 `.vtt` 到 `vimeoMediaDownloader` | `extension/tests/e2e/vimeo-real-subtitle.spec.ts` 两条真实 E2E（2026-11-02，都在 player 页面） | 真实视频、真实扩展、真实落盘。**自动化 profile 打开 vimeo.com 每次都被 Vimeo 人机验证盖住，面板在正常页面上「near the video's title」的位置来自 `buttons.ts` 的挂载逻辑（action bar 前或 H1 后），没有真实 E2E** |
| T6 | 13 个公开视频中 10 个有字幕轨，其中 7 个只有自动字幕 | 2026-11-02 在 hydra 的浏览器读取 Staff Picks 与 /watch 页面视频的播放器 config，`request.text_tracks` 的 `kind`/`provenance` 字段 | 第一手抽样；非随机，正文已写明 |
| T7 | 打开其中 7 个视频页，6 个有 Transcript 按钮，含只有自动字幕的视频；第 7 个页面（1226731365）没有渲染 H1，也没有按钮，不判定原因 | 2026-11-02 在 hydra 的浏览器逐页读取 | 第一手。hydra 的浏览器可能已登录 Vimeo，未登录状态未单独验证 |
| T8 | 一条标为 `English (auto-generated)` 的轨道实际是高棉文；另一条全片只有 1 条字幕 | 视频 1226740492、1237176348 的真实 VTT | 第一手。正文不点名视频 |
| T9 | 两种转纯文本方法（编辑器正则、终端命令）在 11 个真实 VTT 上都只留下字幕文字；用户上传字幕含 `<i>` 这类标签，需要第二步去掉；11 个文件都没有 CRLF、`NOTE`/`STYLE` 块和纯数字的字幕行 | scratchpad 内 11 个样本。终端命令在 macOS 和 GNU grep 3.8 / sed 4.9（`debian:bookworm-slim`）实跑。另把 11 个文件转成 CRLF 再跑：开头的 `tr -d '\r'` 让输出与 LF 版逐字相同，不加时两边都混入 `\r`。编辑器正则用 Node（JS 正则引擎）实跑，只跑了 LF | **未在 VS Code 界面实操，未测 Windows。** 发布前建议补一次 VS Code 实操 |
| T10 | 扩展不创建、不翻译字幕；不转换格式；每个文件计入每日额度；可免费开始；私密等视频不保证 | 字幕篇 S1–S11；产品口径见记忆「宣传不标收费」 | 沿用已发布文章，已核对 |
| T11 | 运营主体与非关联声明 | 同字幕篇 S12 | 沿用 |

## 4. 当前行为与待实施目标的差异

- **依赖 1.0.4。** 线上 1.0.2 的字幕过滤器丢弃了 `captions.vimeo.com` 的字幕轨，10 个样本视频的 11 条轨全部受影响，popup 显示 Unavailable。修复已提交（`22966ad`），真实 E2E 已通过。2026-11-02 hydra 决定先部署本页：1.0.4 上架前，读者在受影响视频上走不通这一步。
- 产品不生成纯文本。插件直接输出 TXT 可能需要新增 `captions.vimeo.com` host 权限（当前字幕由 `chrome.downloads` 保存，扩展页 fetch 会失败），可能触发已安装用户重新授权。是否做由 hydra 决定；不做时本页的转换步骤就是用户的路径。

## 5. 需求与 SERP 证据及限制

- Google Trends（全球，过去 12 个月，2026-11-02 读取，相对值，`how to download vimeo videos` = 100）：`vimeo transcript` 357（52/52 周非零）、`vimeo subtitles` 142、`vimeo transcript download` 35、`download vimeo transcript` 33。同批里裁剪、批量、课程类词为 0。
- GSC（`sc-domain:vimeodownloader.app`，28 天）：Guides 合计 2 点击 / 32 曝光，还没有文字稿相关曝光。本页是否有流量要发布后才知道。
- SERP（`vimeo transcript download`，2026-11-02 浏览器抽样）：官方帮助 2 条、downsub、Reddit「Ways to download subtitles from Vimeo videos」、notta、proactor、subgrab、gmrtranscription。工具页和转写服务占多数。
- 限制：Trends 只有相对值，看不到绝对量；`vimeo transcript` 里可能混有所有者和产品功能查询，不全是观众；抽样 SERP 不代表所有地区。

## 6. 元数据

| 字段 | 内容 | 长度 |
|---|---|---|
| Title | How to Get a Vimeo Transcript: View It or Download It | 53 |
| Meta Description | See a Vimeo video's transcript on its page, download it if the video is yours, or save a public video's captions as a VTT file and turn them into plain text. | 157 |
| H1 | How to get the transcript of a Vimeo video | 42 |

## 7. 内链

| 方向 | 目标 | 锚文本 | 状态 |
|---|---|---|---|
| 站内出 | `/guides/download-vimeo-subtitles-as-vtt/` | How to download subtitles from a Vimeo video as VTT | 已存在 |
| 站内出 | `/guides/save-vimeo-audio-as-mp3-or-m4a/` | save its audio as M4A or MP3 | 已存在 |
| 站内出 | `/guides/is-it-legal-to-download-vimeo-videos/` | legal guide | 已存在 |
| 站内出 | `/`（首页） | online tool | 已存在 |
| 站外出 | V11、V5、V12、V13、Chrome 商店 | 以官方页面标题为锚文本 | 发布前复核 |
| 站内入 | 字幕篇「Not a plain transcript」一行 | 见字幕篇源稿 | 随本页一起发布 |
| 站内入 | `/guides/` 索引页 | 文章标题 | 发布时自动生成，需核对 |

## 8. 结构化数据

- Article + BreadcrumbList，`author` 用站点 Organization。不加 FAQPage、HowTo（G2，及 009 feat「Guides 不加 FAQ / HowTo 结构化数据」）。

## 9. 媒体决策

- 没有真实截图前不放图片（spec §8）。适合补的两张：Vimeo 页面的 Transcript 面板、popup 的 Subtitle 行。第三方视频画面不入图，用 hydra 自己上传的视频截。

## 10. 发布条件

已部署。hydra 决定不等 1.0.3 和 11-11：10-26 实验的观察期记录是 7–14 天，到部署当天已满 7 天，期间也已有其他上线。V5、V11、V12 的日期与措辞是部署当天核对的。

剩余事项：

1. 1.0.4 上架后，用发布版重跑一次 popup 步骤，再到 GSC 提交「要求建立索引」。
2. 用 VS Code 实操一次正则。

## 11. 待核实（正文没有写）

1. Transcript 面板的文字能否直接选中复制：没有验证，正文没有写。
2. 未登录 Vimeo 时 Transcript 按钮是否同样出现：T7 没有区分。
3. Vimeo 文字稿 API（V5 的 Related articles 提到）：面向开发者，正文没有写。
