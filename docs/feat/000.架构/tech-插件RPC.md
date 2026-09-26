# 000 · 架构 · 插件 RPC 系统细节

> 对应 `feat.010.重构插件RPC系统`。本文件补 `@tech-extension.md` §A3 没写全的细节:EventRpc 固定通道、调用矩阵、能力边界、安全要求和下载调用契约。框架骨架(transport / 声明式注册 / 代码生成 / 一致性检查)见 `@tech-extension.md` §A3,本文不重复。
> 规则条文见根 `@../../../AGENTS.md`。本文记录当前已落地的稳定契约；源 feat 与本文冲突时以本文为准。

## 1. 目录与生成产物

```
extension/src/core/rpc/
├── index.ts                    # 稳定导出口
├── constants.ts                # 固定 EventRpc 通道、payload 上限等常量
├── types.ts                    # Handler / 声明类型
├── errors.ts                   # RpcError 分类(权限/传输/大小/超时/能力不存在/执行失败)
├── serve.ts                    # 服务端注册器(Chrome listener / 固定 Event listener)
├── injectedReady.ts            # MAIN provider 同步注册完成后的共享就绪信号
├── ChromeEventBus.ts           # chrome.runtime message 总线
├── transports/
│   ├── ChromeRpcTransport.ts   # popup/content/background/offscreen 之间(chrome.runtime)
│   └── EventRpcTransport.ts    # content→injected(DOM CustomEvent)
└── generator/
│   ├── manifest.json           # registers + generatedFiles 清单(代码生成输入)
│   └── templates/              # 生成模板
```

生成器 `scripts/rpc-generate.mjs` 输入 `generator/manifest.json`:

```json
{
  "registers": [
    "src/content/content-register.ts",
    "src/injected/injected-register.ts",
    "src/background/background-register.ts",
    "src/offscreen/offscreen-register.ts"
  ],
  "generatedFiles": [
    "src/popup/rpc/content.rpc.ts",
    "src/background/rpc/content.rpc.ts",
    "src/content/rpc/injected.rpc.ts",
    "src/content/rpc/background.rpc.ts",
    "src/popup/rpc/background.rpc.ts",
    "src/background/rpc/offscreen.rpc.ts",
    "src/offscreen/rpc/background.rpc.ts"
  ]
}
```

各上下文只声明方法签名(`declarationOnly(...)`,不含实现),生成器据此产出 typed client。`pnpm rpc-generate:check` 挂在 `pretype-check` / `prebuild`,产物与声明不一致则构建失败。

## 2. 两种 transport 与调用矩阵

| transport | 通道 | 适用方向 |
| --- | --- | --- |
| `ChromeRpcTransport` | `chrome.runtime` message | popup↔content、popup/background↔content、content/popup↔background、background↔offscreen |
| `EventRpcTransport` | DOM `CustomEvent` | content→injected |

生成器内置**调用矩阵校验**(`transportMatrix`):popup→content、background→content、content/popup→background、background→offscreen、offscreen→background 走 chrome;content→injected 走 event。方向与 transport 不匹配会在生成期报错,不允许手写错配。

**caller 识别**:chrome transport 的调用方身份由 serve 按 `sender` 推断——`sender.url` 路径等于 offscreen document 入口(`/src/offscreen.html`)归 `offscreen`,等于 SW 脚本入口归 `background`,其余扩展自有页归 `popup`;带 `sender.tab` 的归 `content`。

## 3. EventRpc 固定通道与信任边界(content ↔ injected)

content 与 injected 使用一个固定 DOM `CustomEvent` 通道传递 request-response frame。固定通道只是通信命名,不是秘密,也不提供页面身份认证。

宿主页面脚本可以观察、伪造或干扰 DOM 事件。普通下载插件接受这一风险,并用以下边界限制影响范围:

1. EventRpc 只接受固定 frame 结构和明确 method allowlist。
2. request/response 在 `JSON.parse` 前检查原始 UTF-8 字节上限,再校验基础 frame、方法专属 payload 上限和未知方法。
3. 解析 handler 继续校验 URL host、redirect、MIME 和允许的媒体类型(下载已不经 EventRpc,执行链边界见 §6)。
4. Chrome API、storage、额度、后端 token 和本项目后端权限只存在于 content/background。
5. 页面可以伪造 `caller` 对应的 DOM frame;EventRpc 的 caller 只表示路由元数据,不能作为授权依据。
6. 站点 handler 抛出的普通内部错误只向 DOM 返回固定中性 `SERVER_ERROR`;详细错误留在本地日志。Chrome transport 继续返回原有可定位错误,不受 DOM 错误收敛影响。

## 4. 能力清单(feat.010 声明范围)

**content**(popup/background 调 content):只暴露资源查询(`getResources`)。下载发起、取消、重试与队列快照已全部移到 background 编排器,content 不再持有下载状态。

**injected**(content 调 injected,走固定 EventRpc 通道):只保留检测与配置能力——`getCapturedVimeoConfig`（按 videoId 取 MAIN world 捕获的原生 config 快照）、`listCapturedVimeoConfigs`（聚合页枚举概要）、`applyRuntimeConfig` / `applySiteConfig`（同步日志级别与站点运行参数）。页面内分片下载与 remux 已退役,MAIN world 不再承载下载;config 捕获不主动推送,只由 content 主动查询。

**background**(content/popup/offscreen 调 background):连通性检查、状态/运行时/远端配置查询、徽标更新、打点、Google 登录、Vimeo 播放页 config 直连获取;下载编排能力——`downloadBatch`（入队，含发起 tab）、`getDownloadQueue`（快照）、`cancelDownloadTask` / `retryDownloadTask`（取消/重试）；offscreen 回传通道——`taskProgress` / `taskComplete` / `taskFailed` / `taskCancelled`（进度与终态）、`refreshSignatureRequest`（签名重签）、`keepAlive`（任务期心跳）。旧 `startBrowserDownload` / `getBrowserDownloadStatus` / `checkQuota` 已删除,统一并入编排器。

**offscreen**(background 调 offscreen):`startTask`（下发完整 MediaResource 启动 DASH/HLS 任务）、`cancelTask`（中止执行中任务）、`listActiveTasks`（活跃任务清单,SW 冷启动对账的真相源）、`releaseTaskArtifact`（落盘确认后释放 blob）。

## 5. 安全要求

| 项 | 要求 |
| --- | --- |
| EventRpc 通道 | 使用固定名称,按不可信 DOM transport 处理,不作为页面身份认证 |
| MAIN world 输入 | 执行 method allowlist、结构和大小校验 |
| 下载/解析输入 | 校验 host、redirect/finalUrl、MIME、媒体类型和结构化 source descriptor |
| 权限操作 | Chrome API、storage、额度、后端 token 只在 content/background 执行 |
| 调用方身份 | ChromeRpc 调用方身份由接收方按浏览器 `sender` 信息判断 |
| 手写越权请求 | 必须被拒绝(如 popup 手写请求更新徽标) |

## 6. 下载编排调用契约

### 6.1 入队与执行

每次 `downloadBatch` 是一次独立用户操作,请求携带完整 MediaResource 与发起 tab:

1. background `DownloadOrchestrator` 按输入顺序入队,同资源已有未完成任务时去重合并。
2. 任务出队执行时才检查配额:调用 `checkAndConsume(1)`;服务明确返回额度不足时任务以配额拒绝终态收敛,并向发起 tab 广播升级弹窗事件(content 不在场则跳过)。
3. 配额 API 异常时 fail-open 放行,不阻断用户下载。
4. 直连类(Progressive/封面/字幕)由 background 直接执行:校验来源合同后 `chrome.downloads.download`,轮询任务直到落盘回执;signed URL 过期时从原生 refresh config 恢复一次。
5. DASH/HLS 交 offscreen document 执行(见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §8):分片读取 + remux 在 offscreen 完成,产物以 blob URL 交 background `chrome.downloads` 落盘,`downloads.onChanged` 确认完成或中断后释放 blob 并收敛任务。
6. 下载失败保留为失败投影并继续后续任务;人工重试重新入队且跳过配额(用户已见过的失败不重复扣额度)。调用发出后不退款。

重复点击会再次执行上述流程,因此允许重复扣额和重复下载。

### 6.2 快照与取消

- 编排器维护跨 tab 全局未完成任务投影(单并发 FIFO),每次可见变化提升 revision 并经 `downloadQueueUpdated` 推送(runtime 送达 popup,tabs 广播送达 content 页面按钮);Popup 也可用 `getDownloadQueue` 主动查询,快照作用域恒为 background 全局队列。
- 取消全生命周期可用:等待任务直接出队移除;下载中任务按执行通道转发取消(Chrome `downloads.cancel` / offscreen `cancelTask`)。取消受理即从投影移除,不显示为失败。
- 取消转发偶发失败时记**取消墓碑**后本地终止:该 taskId 的后续交付与冷启动对账一律拒绝,防转发失败后任务复活、迟到产物照常落盘。
- SW 冷启动(或收到未知任务消息)时向 offscreen 对账,以 `listActiveTasks` 为真相源重建执行中任务;SW 内存中的等待队列不持久化,不恢复。

## 7. 异常分类(`core/rpc/errors.ts`)

| 场景 | 错误类型 |
| --- | --- |
| 调用方没有权限 | 权限错误 |
| 非法通信方向 | 传输错误 |
| 目标页面不存在或 content 未注入 | 目标不可用 |
| 请求或响应过大 | 大小超限(不返回原始大 payload) |
| 方法不存在 | 能力不存在 |
| 能力执行失败 | 服务端执行错误 |
| 调用超时 | 当前 request-response 失败；调用方记录错误,批量继续后续项,用户可再次点击 |
| RPC transport 已销毁 | pending 请求全部失败并清理 listener |

Event transport 的“服务端执行错误”对页面只暴露固定中性文案；协议自身的 method、大小和结构错误保留分类。Chrome transport 保持可定位错误内容。

## 8. 非功能指标

| 指标 | 要求 |
| --- | --- |
| 生成耗时 | 全量生成 < 2s |
| 单次 RPC 额外开销 | < 10ms(不含业务处理) |
| MV3 兼容 | background 异步响应符合 Manifest V3 消息通道 |
| 暴露面 | 生成的调用入口只含调用方允许访问的能力 |

## 9. 调试日志约束

日志只记录调用上下文、能力名称、传输类型、耗时、错误分类。**不记录** token、文件 URL、用户消息正文、完整请求/响应内容。

## 10. 站点实现边界

- 下载执行合同集中在 background 编排器与 offscreen 执行器;站点只负责解析建模,把带 descriptor 的 MediaResource 投递给 `downloadBatch`,不自行实现下载执行。
- injected 只注册站点真正需要的方法，不生成或实现占位方法。
- 站点入口直接组合具体 handler,不通过新增依赖注入传递 RPC client。
- 修改任一 register 后必须重新生成 client,并通过 `pnpm rpc-generate:check` 校验声明、调用矩阵和生成产物一致。
