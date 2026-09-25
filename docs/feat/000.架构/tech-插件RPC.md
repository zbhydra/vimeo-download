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
├── DomEventBus.ts              # DOM CustomEvent 总线
├── transports/
│   ├── ChromeRpcTransport.ts   # popup/content/background 之间(chrome.runtime)
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
    "src/background/background-register.ts"
  ],
  "generatedFiles": [
    "src/popup/rpc/content.rpc.ts",
    "src/background/rpc/content.rpc.ts",
    "src/content/rpc/injected.rpc.ts",
    "src/content/rpc/background.rpc.ts",
    "src/popup/rpc/background.rpc.ts"
  ]
}
```

各上下文只声明方法签名(`declarationOnly(...)`,不含实现),生成器据此产出 typed client。`pnpm rpc-generate:check` 挂在 `pretype-check` / `prebuild`,产物与声明不一致则构建失败。

## 2. 两种 transport 与调用矩阵

| transport | 通道 | 适用方向 |
| --- | --- | --- |
| `ChromeRpcTransport` | `chrome.runtime` message | popup↔content、popup/background↔content、content/popup↔background |
| `EventRpcTransport` | DOM `CustomEvent` | content→injected |

生成器内置**调用矩阵校验**(`transportMatrix`):popup→content、background→content 走 chrome;content→injected 走 event。方向与 transport 不匹配会在生成期报错,不允许手写错配。

## 3. EventRpc 固定通道与信任边界(content ↔ injected)

content 与 injected 使用一个固定 DOM `CustomEvent` 通道传递 request-response frame。固定通道只是通信命名,不是秘密,也不提供页面身份认证。

宿主页面脚本可以观察、伪造或干扰 DOM 事件。普通下载插件接受这一风险,并用以下边界限制影响范围:

1. EventRpc 只接受固定 frame 结构和明确 method allowlist。
2. request/response 在 `JSON.parse` 前检查原始 UTF-8 字节上限,再校验基础 frame、方法专属 payload 上限和未知方法。
3. 下载/解析 handler 继续校验 URL host、redirect、MIME 和允许的媒体类型。
4. Chrome API、storage、额度、后端 token 和本项目后端权限只存在于 content/background。
5. 页面可以伪造 `caller` 对应的 DOM frame;EventRpc 的 caller 只表示路由元数据,不能作为授权依据。
6. 站点 handler 抛出的普通内部错误只向 DOM 返回固定中性 `SERVER_ERROR`;详细错误留在本地日志。Chrome transport 继续返回原有可定位错误,不受 DOM 错误收敛影响。

## 4. 能力清单(feat.010 声明范围)

**content**(popup/background 调 content):register 暴露资源查询、下载入队、队列快照、按任务取消/重试和缓存清理合同。站点 provider 只实现实际需要的方法，不暴露主动扫描。

**injected**(content 调 injected,走固定 EventRpc 通道):Vimeo 站点注册 `getCapturedVimeoConfig`（按 videoId 取 MAIN world 捕获的原生 config 快照）、`applyRuntimeConfig` / `applySiteConfig`（同步日志级别与站点运行参数）与一次完整的 `downloadMedia` request-response（只处理需要页面内分片读取与 remux 的 DASH/HLS）。Progressive/Thumbnail 已在 content 分流，不进入 EventRpc。MAIN world 的 config 捕获不主动推送，只由 content 主动查询。

Vimeo MAIN 下载器与 content 原生下载协调器共用一个固定的单向 DOM 进度事件，payload 为 `sourceId + progress`；`progress` 是 `0..100` 数值或表示不可计算的 `null`，展示时向下取整。Vimeo 页面存在时通过短 background RPC 查询 Chrome 下载字节；页面销毁后事件停止，但任务不取消。该事件不经过 EventRpc method，不携带业务终态，也不形成第二个权限通道；宿主页面伪造该事件最多造成当前按钮显示错误，不能扣额度、触发下载或改变 request-response 结果。Popup 不订阅该事件。

**background**(content/popup 调 background):连通性检查、查询 background 状态、更新当前 tab 徽标；content 还可为受支持的 Vimeo 直连来源调用 `startBrowserDownload` 创建 Chrome 下载，并用 `getBrowserDownloadStatus` 查询单次轻量快照。background 不等待大文件完成。

> RPC 框架仍按上下文生成 client,但站点实现只注册自己需要的方法。当前 injected 合同只包含 `applyRuntimeConfig` / `applySiteConfig` / `getCapturedVimeoConfig` / `downloadMedia` 四项，不存在未被实现的空 stub。

## 5. 安全要求

| 项 | 要求 |
| --- | --- |
| EventRpc 通道 | 使用固定名称,按不可信 DOM transport 处理,不作为页面身份认证 |
| MAIN world 输入 | 执行 method allowlist、结构和大小校验 |
| 下载/解析输入 | 校验 host、redirect/finalUrl、MIME、媒体类型和结构化 source descriptor |
| 权限操作 | Chrome API、storage、额度、后端 token 只在 content/background 执行 |
| 调用方身份 | ChromeRpc 调用方身份由接收方按浏览器 `sender` 信息判断 |
| 手写越权请求 | 必须被拒绝(如 popup 手写请求更新徽标) |

## 6. 共享下载调用契约

### 6.1 单项下载

每次 `downloadOne(resource)` 都是一次独立用户操作:

1. 调用 `checkAndConsume(1)` 检查并扣除一个资源额度。
2. 服务明确返回额度不足时,记录结果并结束当前项。
3. 额度调用超时、RPC 失败或服务异常时记录错误并继续,保持 fail-open。
4. 如果来源是 Vimeo Progressive/Thumbnail，调用 `startBrowserDownload` 创建 Chrome 任务；页面存在时每 500ms 调用一次 `getBrowserDownloadStatus` 维持按钮进度和顺序批量。两个 RPC 都是短请求，background 不持有等待；导航只终止 content 轮询，Chrome 任务继续。
5. 其他来源发起一次完整的 `downloadMedia(request) -> response`；该请求覆盖媒体读取、必要处理和浏览器下载触发。24 小时页面生命周期级超时不会中止真实传输，缩短只会让 FIFO 误启下一项；调用方 timeout 只约束页面存活期的长调用。
6. 下载失败时记录详细错误并结束当前项。调用发出后不退款；仅 Vimeo 原生任务遇到可刷新服务端中断时允许刷新一次 signed config 后重建任务，其他失败不自动重试。

重复点击会再次执行上述流程,因此允许重复扣额和重复下载。

### 6.2 批量下载

批量调用方把有序资源一次性交给页面单例 FIFO。页面内 `downloadMany` 等待该批全部任务终态，保持按钮/批量会话语义；Popup 的 `downloadBatch` 完成资源回查和入队后立即返回，后台继续观察每项 completion 并记录失败。两者不预先检查总额度，也不要求整批同时成功。

批量不弹二次确认，直接进入同一循环。站点解析、扫描和面板行为不因共享下载函数改变。

Popup 打开或刷新时只查询固定目标 tab 的资源；资源变化造成的旧显示由再次刷新或重新打开纠正，下载队列则单独订阅版本化快照。

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

- `downloadMedia` 使用一份站点无关的 request-response 形状,handler 只负责需要页面内媒体处理的来源；可直接保存的 Vimeo Progressive/Thumbnail 使用声明式 background RPC 和 Chrome 下载管理器。
- injected 只注册站点真正需要的方法，不生成或实现占位方法。
- 站点入口直接组合具体 handler,不通过新增依赖注入传递 RPC client。
- 修改任一 register 后必须重新生成 client,并通过 `pnpm rpc-generate:check` 校验声明、调用矩阵和生成产物一致。
