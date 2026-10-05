# 002 · 下载方法与续传

> 覆盖原 feat.039 全套(039 / 039.001 / 039.002 / 039.003) + 原 feat.018(下载恢复能力,已并入 039.002)。
> 关联:`@tech-链路与授权.md`(下载链路使用这些方法) `@tech-速率治理.md`(活跃下载并发与客户端速率上报)

## 1. 概念边界

| 概念 | 说明 | 示例 |
| --- | --- | --- |
| `MediaPlatform` | 内容来源,用于平台识别、平台显示、后端分发和部分播放能力 | `vimeo` |
| `DownloadMode` | 下载方法 ID,用于选择前端下载器 | `direct`、`client_mux` |
| `DownloadMethodDefinition` | 下载方法注册项 | mode、能力、runner |
| `DownloadActionPlan` | 某个资源本次能否下载/入队/重试的最终计划 | 由资源能力、下载方法能力、集合上下文共同计算 |
| `DownloadQueuePlan` | Download all 的串行队列计划 | 最终入队资源、执行顺序、并发数固定为 1 |
| `DownloadCompletion` | 下载方法完成后的保存动作 | object URL、navigation URL、deferred job |

平台与下载方法不是完全无关:

- 本地链接识别与平台显示仍由 `platform` 参与。
- `download_mode` 以后端 parse 结果为准。
- 前端 fallback resource 才允许根据 `platform` 推断默认 mode,函数需命名为 `resolveFallbackDownloadMode()`,避免误认为平台驱动主链路。
- 资源是否可下载与可否入队由 `capabilities.download` / `capabilities.downloadQueue` 决定；当前契约中不存在 `play` 能力。

## 2. download_mode 当前模式契约

| download_mode | 传输方式 | 保存策略 | 会话策略 | 存储预检 | 默认入队 | 配额时机 |
| --- | --- | --- | --- | :--: | --- | --- |
| `direct` | 平台 CDN 直连 | `object_url` | `byte_resume` | 是 | `allow` | `intent` |
| `client_mux` | 多轨直连后本地合成 | `object_url` | `none` | 是 | `deny` | `intent` |

各模式语义:

- `proxy` 已下线：服务端不再代理媒体字节，前端不再注册该模式，`download_mode = "proxy"` 会被 parse 阶段拒绝（见 §3 注册规则）。
- `direct`:授权直链单资源下载。浏览器直连平台 CDN,后端无法限速;download-v2 direct JSON 返回失败或 URL 过期可在方法内部刷新一次。
- `client_mux`:多轨直连下载后浏览器合成 MP4。浏览器直连 tracks，后端无法限速。首阶段 `canResume=false`；当前 Vimeo 仅 DASH 交付的样本走这条路径。

`quotaTiming` 用于标识各方法的配额阶段；账号授权接口（网站不再调用）的 Credits 扣减发生在 `download-pre-v2`，网站匿名授权不扣费。`download-v2` 之后的 active limit、资源不可达、用户取消保存或 CDN/tracks 失败首期不自动退费。同一用户同一资源 6 小时内重复授权不重复扣费。

## 3. DownloadMethodDefinition 注册表

`download-methods.ts` 是唯一声明 `download_mode` 默认方法、能力和 runner 的地方。不新增 class,不新增 Provider/Adapter,不做依赖注入。每个具体下载器只导出固定 runner 函数。新增后端 `download_mode` 时在 `DOWNLOAD_METHODS` 增加方法定义。

runner 统一接收资源、可选恢复记录、运行上下文和回调选项，返回下载结果。

| 合同 | 字段 | 说明 |
| --- | --- | --- |
| 运行上下文 | `deviceId` | 当前设备 ID |
| 运行上下文 | `ownerSub` | 固定为 `device:{id}` |
| 运行选项 | `onProgress` | 可选下载进度回调 |
| 运行选项 | `onUsedNode` | 可选实际命中节点回调 |

| 方法定义字段 | 说明 |
| --- | --- |
| `mode` | 后端返回的 `download_mode` |
| `requiresIntent` | 是否需要先申请下载 intent |
| `saveStrategies` | 可能返回的保存动作 |
| `sessionPolicy` | 跨刷新恢复策略：`none` / `restartable` / `byte_resume` / `method_managed` |
| `requiresStoragePreflight` | 新下载是否先检查浏览器 origin storage |
| `queueDefault` | Download all 默认入队策略 |
| `quotaTiming` | 配额消耗时机：`stream_start` / `intent` / `job_start` |
| `run` | 具体 runner |
| `canResume` | 可选恢复能力判断 |
| `clearResume` | 可选恢复状态清理 |

注册表只注册 `direct` / `client_mux`，两个方法都不声明存储预检 fallback；预检失败即阻断当前下载，提示用户浏览器存储不足并引导插件（见 `@tech-下载存储治理.md`）。

注册规则:

1. `DOWNLOAD_METHODS` 是每个 `download_mode` 默认方法的唯一注册表；`assertDownloadMode()` 是唯一运行时 `DownloadMode` 校验入口。
2. `media-api` 与 `snapshot` 复用同一校验,不各自维护枚举。
3. 未知 `download_mode`（含已下线的 `proxy`）不做任何降级;parse 阶段抛明确错误,GA4/mark 记录 `web_download_mode_unsupported`(含 `platform`、`download_mode`、`source_id`,不含上游 URL)。

## 4. dispatcher 分派

分派伪代码：

```text
新下载方法 = actionPlan.method
返回 执行(新下载方法.runner, actionPlan.resource, 空恢复记录, context, options)

恢复方法 = 按 resource.downloadMode 查询默认注册表
返回 执行(恢复方法.runner, resource, resumeRecord, context, options)
```

统一入口规则:

- 新下载:`downloadPlannedResource(actionPlan, ...)`,执行预检后最终 action plan 的方法,方法内部按需申请下载授权。
- OPFS Continue:`resumeDownloadResource(resourceFromResumeRecord(record), record, ...)`,方法内部直接使用记录里的授权材料（`direct` 的已授权直链）续传,**不重新**申请授权;记录材料缺失或已失效时清理记录,不展示 Continue 卡片。
- Restart:`resumeDownloadResource(resourceFromResumeRecord(record), record, ...)`,方法内部清理当前记录后作为新的传输动作从 0 下载,重新走「授权 → `download-v2`」；同一设备同一资源在排重有效期内不重复计次。
- dispatcher 不写 mode 分支,恢复语义挂在具体下载方法上。
- workspace 不再生成下载用 `clientRequestId`(该字段已从账号授权契约删除,见 §9)。

## 5. DownloadActionPlan / DownloadQueuePlan

| 合同 | 字段 | 说明 |
| --- | --- | --- |
| `DownloadActionPlan` | `resource` | 本次操作的资源 |
| `DownloadActionPlan` | `method` | 该资源命中的方法定义 |
| `DownloadActionPlan` | `canDownload` | 是否允许单个下载 |
| `DownloadActionPlan` | `canEnqueue` | 是否允许进入 Download all 队列 |
| `DownloadActionPlan` | `downloadDisabledReason` | 可选的单下载禁用原因 |
| `DownloadActionPlan` | `queueDisabledReason` | 可选的入队禁用原因 |
| `DownloadQueuePlan` | `items` | 最终串行执行的 action plans |
| `DownloadQueuePlan` | `canStart` | 队列是否可以启动 |
| `DownloadQueuePlan` | `execution` | 固定为 `serial` |
| `DownloadQueuePlan` | `concurrency` | 固定为 `1` |
| `DownloadQueuePlan` | `disabledReason` | 可选的队列禁用原因 |

计算规则:

1. `resource.capabilities.download === false` 时 `canDownload=false`。
2. `method.queueDefault` 只是入队默认值,不是最终入队结论。
3. 资源可以通过可选能力字段禁用入队,例如 `capabilities.downloadQueue === false`。
4. 集合上下文可以禁用入队,例如只有一个资源时 `canEnqueue=false`。
5. 集合中混合不可入队资源时,只让 `canEnqueue=true` 的资源进入队列。
6. `workspace-render.ts` 只根据 `DownloadActionPlan` 渲染按钮,不自己推断 mode。
7. Download all 不是并发批量下载,只是串行下载队列;`concurrency` 固定为 `1`;队列按结果卡片展示顺序执行。
8. 队列执行期间沿用单资源下载路径,每次只调用一次 `downloadPlannedResource()`;`activeDownload` 同时最多一个资源。

`DownloadActionPlan` 同时服务 UI、新下载校验和最终方法选择。Continue 只传恢复记录,不重新校验 capability。

Website 新授权和 session 重新授权统一经过 `media-download-v2.ts` → `anonymous-download.ts`；匿名授权不返回余额。等待和用户中止暂停／停止当前串行队列，具体规则见 [Website 匿名下载接入](tech-Website匿名下载接入.md)。OPFS Continue 复用记录里已保存的直链材料，不因身份变化或匿名接入重新授权；需要新授权的 Restart 和材料刷新回到共同入口。

## 6. DownloadCompletion

| kind | 必要字段 | 说明 |
| --- | --- | --- |
| `object_url` | `objectUrl`、`filename`、`revokeAfterMs`、`bytesWritten`、`objectUrlSource` | `objectUrlSource` 只能是 `blob` 或 `file`；当前唯一 kind,没有第二个产出方 |

runner 返回值由 `completion` 和 `retryCount` 组成。

保存执行器 `executeDownloadCompletion(completion)`:

| kind | 行为 |
| --- | --- |
| `object_url` | 创建 `<a download>`,点击后按 `revokeAfterMs` revoke;`objectUrlSource=file` 时不得提前读取完整文件 |

约束:

- `object_url` 可以来自 `Blob`,也可以来自 OPFS `File`;下载器必须用 `objectUrlSource` 标明来源。
- 大文件方法必须通过 OPFS `File` 创建 object URL,禁止为了保存动作把完整文件读入 JS 内存。
- `workspace-download.ts` 只执行保存动作,不知道具体下载算法。

## 7. 下载器函数契约

每个下载器导出一个符合统一 runner 合同的函数,不使用类、不使用依赖注入,共享能力通过普通函数导入。现有 runner 为 `runDirectDownload` 和 `runClientMuxDownload`；它们接收相同的资源、恢复记录、上下文和选项，统一返回 `DownloadMethodResult`。

### 7.1 direct

职责:

1. 每次用户触发下载都重新授权,正常扣额度。
2. 授权拿到 direct URL 后,按存储能力选择 OPFS / IndexedDB;都不可用时普通 Memory 下载。
3. OPFS 时写单文件 checkpoint,并把当前 direct URL 写入方法字段。
4. 新下载过程中 direct URL 过期,可重新走「授权 → `download-v2`」获取一次 direct JSON。
5. `video.twimg.com` direct 响应没有对浏览器 `fetch` 暴露 `Content-Range`;X direct 只用 OPFS 保存本次流,跨刷新只允许 Restart,不做非 0 Range Continue。
6. 完成后创建 object URL,清理 checkpoint。

### 7.2 client_mux

职责:

1. 调用 `prepareClientMuxDownload()`。
2. 调用 `downloadClientMuxResource()` 下载双轨并合成。
3. track fetch 失败时重新走「授权 → `download-v2`」刷新一次 client_mux JSON。
4. 把 Blob 转为 object URL completion。

`client-mux.ts` 只保留双轨下载和 mux 成 Blob,不负责下载授权。本阶段 `sessionPolicy='none'`、`canResume=false`;以后要做恢复时在方法内部实现 `method_managed`(video/audio 各自记录 temp 文件、offset、done)。

## 8. 断点续传与 Continue 收口

### 8.1 DownloadResumeRecord

恢复记录分公共字段和方法字段。公共字段由存储层校验,方法字段只由对应下载方式读取。

| 公共字段 | 类型/取值 | 说明 |
| --- | --- | --- |
| `version` | `1` | 恢复记录版本 |
| `mode` | `DownloadMode` | 对应下载方法 |
| `platform` | `MediaPlatform` | 资源平台 |
| `link` / `sourceId` | 字符串 | 资源定位信息 |
| `filename` / `mimeType` | 字符串 | 文件信息 |
| `downloadedBytes` | 非负整数 | 已写入字节数 |
| `totalBytes` | 整数或空 | 可校验的总字节数 |
| `updatedAt` | 毫秒时间戳 | 最后 checkpoint 时间 |
| `persistent` | 布尔值 | 是否使用持久化临时存储 |
| `storageType` | `opfs` / `indexeddb` | 创建记录时选定的存储类型 |
| `recoveryMode` | `resumable` / `restartable` | 刷新后恢复语义 |
| `methodState` | 方法自有合同 | 只由对应下载方法读取 |

| 方法状态 | 字段 | 说明 |
| --- | --- | --- |
| `single_file_range` | `tempFileName` | 单文件 Range 续传的临时文件 |
| `multi_part` | `parts` | 方法自行维护每个 part 的 ID、临时文件、已下载字节、总字节和完成状态；workspace 不解析 |

约束:

- 不保存 `clientRequestId`。
- 不用 request id 命名 OPFS 临时文件。
- direct 的 `downloadUrl` 写入方法字段;OPFS Continue 只用它尝试一次 Range,不刷新、不重新授权。restartable Restart 不复用当前 `downloadUrl`,按新下载重新授权。
- 当前只需要一个全局 pending record;新下载开始前清理当前 record。
- 存储能力探测结果写入 `storageType/recoveryMode`;具体选择与恢复加载规则见 `@tech-下载存储治理.md`。

### 8.2 存储兼容层

`download-resume-store.ts` 提供 OPFS / IndexedDB 后端、状态校验和坏记录清理。存储类型选择、能力探测、运行时降级与恢复记录加载统一见 `@tech-下载存储治理.md`;本文件只规定恢复记录结构和各下载方法如何消费记录。

### 8.3 单文件 Range helper

`download-range-stream.ts` 只服务单文件方法。

职责:

1. 接收 `Response`、`startByte`、writer、progress callback。
2. `startByte > 0` 时要求 HTTP `206`。
3. 校验 `Content-Range` 起点等于 `startByte`;非 0 续传必须能拿到可校验总大小或文件指纹。
4. `size=null` 可以从头下载,但不能标记为任意偏移 `resumable`;只有拿到可校验总大小/文件指纹且 Provider 明确支持非 0 Range 时才允许 OPFS Continue,否则只能 restart/from 0。
5. 服务端返回 `200`、Range 不可拼接或网络失败,抛出可识别错误,由方法清理记录并让按钮回到 Download。
6. 每 1MiB 或 1 秒保存一次 checkpoint。
7. 完成后从 OPFS `File` 创建 object URL,避免为了保存把大文件完整读入 JS 内存。

### 8.4 direct 自动 Range 续传与 Continue 收口

```text
while (true) {
  fetch(当前 direct URL, 非 0 起点带 Range: record.downloadedBytes)
  if (链接过期/403/401 且 本次下载尚未刷新过) {
    重新走一次授权 -> download-v2
    回写新 URL、filename、总大小到恢复记录
    从同一 offset 继续
  }
  if (写入了数据) 连续无进展重试计数清零，并更新记录 offset
  if (断流或响应提前结束) {
    连续无进展重试计数 +1
    if (连续无进展重试达到 3 次) throw AutoRangeResumeExhaustedError
    从已写入 offset 继续
  }
}
```

- 自动 Range 重试预算固定为 3 次连续无进展重试；一旦有字节写入，预算重置。
- 链接刷新在新下载路径最多一次；刷新后仍失败按普通错误处理。
- `AutoRangeResumeExhaustedError` 保留恢复记录,提示用户继续。
- 其他错误清理恢复记录,回到普通 Download。
- OPFS Continue 复用记录里的 direct URL 与 offset，不重新授权；URL 失效则清理记录，提示用户重新 Download。

### 8.5 错误处理矩阵

| 错误 | 新下载 | OPFS Continue |
| --- | --- | --- |
| 网络断流 / stream interrupted | 自动 Range 重连 | 自动 Range 重连 |
| 连续无进展重试达到 3 次 | 保留记录,提示 Continue | 保留记录,提示 Continue |
| Range 响应不是 206 或 Content-Range 不匹配 | 清记录,报错 | 清记录,报错 |
| direct URL 过期 / 403 / 401 | direct 内部可刷新一次 | 清记录,提示重新 Download |
| download-v2 token invalid / expired | 方法内部最多重新授权一次 | 已知过期时不展示 Continue;执行时发现无效则清记录,提示重新 Download |

`MediaDownloadV2ReauthorizationRequiredError` 只由具体下载方法处理,workspace 不再 catch 这个错误。

## 9. 下载入口统一与 client_request_id 删除

### 9.1 统一入口

新下载、Continue、Restart、Download all 都走统一 dispatcher。dispatcher 只负责把资源、可选恢复记录、上下文和选项交给注册表选中的 runner，不包含具体下载算法。

### 9.2 删除账号授权的 client_request_id 契约

`client_request_id` 已没有业务价值,不再让前端为它生成 UUID。业务已靠用户短锁、resource token、Credits 扣减逻辑兜住。

后端改动:

| 文件 | 改动 |
| --- | --- |
| `backend/src/app/schemas/media_schema.py` | `MediaDownloadPreV2Request` 删除 `client_request_id` 字段 |
| `backend/src/app/services/media_pre_authorization_service.py` | 删除 `_CLIENT_REQUEST_ID_RE`、`_validate_client_request_id()`、`DownloadPreValidatedRequest.client_request_id` 和相关 import |

保留:

- 授权入口的身份短锁。
- resource token 验签。
- 账号授权的 Credits 扣减顺序。
- download token 签发。

前端改动:

| 文件 | 改动 |
| --- | --- |
| `media-api.ts` | `createMediaDownloadPreV2Authorization()` 删除 `clientRequestId` 参数和 `client_request_id` 请求字段 |
| `media-download-v2.ts` | `createMediaDownloadV2Session()` 删除 `clientRequestId` 参数;删除 download-pre invalid request id 分支;保留 token invalid/expired 错误类型给方法层判断 |
| `download-methods.ts` | `DownloadMethodOptions` 删除 `clientRequestId` |
| `download-dispatcher.ts` | 分别提供新下载 `downloadPlannedResource(plan, context, options)` 与恢复任务 `resumeDownloadResource(resource, record, context, options)` 入口 |
| `download-resume-store.ts` | 如需要,提供 `resourceFromResumeRecord(record)`,避免 workspace/direct 重复构造 resource |

`DownloadResumeRecord` 不包含 `client_request_id`,无本地记录迁移。

## 10. 源码结构

唯一源码目录:

```text
website/src/scripts/download/
  download-methods.ts
  download-action-plan.ts
  download-queue-plan.ts
  download-completion.ts
  download-dispatcher.ts
  download-resume-store.ts
  download-range-stream.ts
  download-temp-storage.ts
  direct-download.ts
  client-mux-download.ts
  media-api.ts
  media-download-v2.ts
  workspace-download.ts
  workspace-render.ts
  types.ts
```

这是网站唯一的下载运行源码目录，上面只列出本文涉及的文件，完整清单以目录为准。`website/` 与 `extension/` 不共享源码。

## 11. API 边界

本阶段不新增路径;`download-v2` 同路径增加 GET method,与 POST 复用 token 执行流程。

| 方法 | endpoint |
| --- | --- |
| parse pre | `POST /api/client/media/parse-pre-v2` |
| parse | `POST /api/client/media/parse-v2` |
| download pre（账号，网站不再调用） | `POST /api/client/media/download-pre-v2`(请求体:`resource_token`、`preferred_node_id`;**不再含** `client_request_id`) |
| download pre（匿名，网站使用） | `POST /api/client/media/download-anonymous-pre-v2`(请求体同上) |
| download execute | `direct` / `client_mux` 始终使用 `POST /api/client/media/download-v2`(请求体:`token`) 获取执行材料；节点保留同路径 GET 能力，但 `proxy` 下线后网站端不再使用。 |

未知 `download_mode`:

- 前端 parse 阶段抛明确错误。
- 用户可见文案为"不支持此下载方式,请稍后重试"。
- GA4/mark 记录 `web_download_mode_unsupported`,包含 `platform`、`download_mode`、`source_id`,不包含上游 URL。

## 12. 数据埋点

所有下载事件必须带:

| 字段 | 说明 |
| --- | --- |
| `platform` | `resource.platform` |
| `download_mode` | `resource.downloadMode` |
| `save_strategy` | `DownloadCompletion.kind` |
| `session_policy` | `DownloadMethodDefinition.sessionPolicy` |
| `resource_type` | `resource.type` |
| `file_size` | 成功时使用下载结果 |
| `reason` | 失败分类 |

禁止记录 signed URL、轨道 URL、segment URL、Authorization、Cookie。
