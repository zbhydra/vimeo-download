# 002 · 站点适配 — 源文档索引

> 本目录是站点适配层(`@../tech-站点适配.md`)的源文档索引（源 feat 文件已在域化重构与产品转型中删除），这里只做归类引用，不复制内容，避免双源失配。
>
> 注：本表只列**当前存活**的文档入口。历史源 feat 的文件路径已失效，不再作为引用出现。

## 平台资料与目标规格

| 平台 | 现行文档 | 矩阵小节 |
| --- | --- | --- |
| `vimeo` | `@../tech-站点适配.md` §5.1<br>`@../tech-扩展端Vimeo本地下载.md`（扩展端）<br>`@../tech-网站Vimeo匿名解析与客户端合并.md`（website 端） | `tech-站点适配.md` §5.1 |

> 平台矩阵现状：**只有 Vimeo 一个平台**。Telegram / X / Instagram / Threads / TikTok / Reddit / Douyin 的站点文档已随对应 Provider 与插件站点删除，历史版本不在本索引中保留。

## 扩展端架构与验收

| 主题 | 文档入口 |
| --- | --- |
| Vimeo 页面三行面板、Popup 视频面板与下载状态 | `@../tech-扩展端Vimeo本地下载.md` |
| 共享逐项下载与 EventRpc | `@../../000.架构/tech-插件RPC.md` §3、§6、§10 |
| 插件端确定性 E2E 与真实站点验收 | `@../test-插件端e2e.md` |
| 插件工程规范 | `@../../../references/specs/spec-extension.md` |

## 下载方法架构基线

| 主题 | 文档 | 用途 |
| --- | --- | --- |
| 下载方法与续传 | `@../tech-下载方法与续传.md` | `DOWNLOAD_METHODS` 注册表、dispatcher、DownloadActionPlan、续传契约 |
| 后端媒体 Provider 架构 | `@../tech-后端媒体Provider架构.md` | 后端每平台 Provider、parse/download 契约、stream/json result、活跃下载并发生命周期 |
| 下载存储能力治理 | `@../tech-下载存储治理.md` | OPFS / IndexedDB / Memory 三层存储 + 真实写入探测 + 运行时 Memory 降级 |
| V2 链路与授权 | `@../tech-链路与授权.md` | V2 四接口规格、下载 token、扣费去重、4GiB 保护 |
| 速率治理 | `@../tech-速率治理.md` | 活跃下载并发与客户端速率上报 |
| 前端切换 | `@../tech-前端切换.md` | website 前端的 mode 分派、超时与错误处理 |

## 使用约定

- 矩阵阅读入口：`@../tech-站点适配.md`（以代码为准）。
- 站点产品/交互/UI 细节：以并入的 tech 为准。
- 接口规格、数据结构、执行步骤：以并入的 tech 为准。
- 文档与代码冲突时，以代码为准并同步更新 `@../tech-站点适配.md`。
