# 002 · 下载存储治理

> website 下载存储选择、能力探测、降级与恢复加载的权威合同。
> 关联:`@tech-下载方法与续传.md` §8(恢复记录结构与 Range 协议) `@tech-链路与授权.md`(传输类型与下载模式合同)

## 1. 范围与边界

website 端下载产出的临时文件、轻量恢复记录、object URL 的存储后端选择、能力探测、运行时降级与清理。

| 边界 | 说明 |
| --- | --- |
| 本文负责 | 下载前容量预检、存储类型选择、真实写入探测、运行时 Memory 降级、恢复记录清理、存储相关埋点 |
| `@tech-下载方法与续传.md` 负责 | `DownloadResumeRecord` 公共/方法字段结构、Range 协议、dispatcher 续传收口 |
| 不变 | 后端解析、预授权 material 合同、插件端链路、资源列表/下载按钮/播放器布局 |

## 2. 三类决策

下载链路三类决策独立,不互相推断:

| 决策 | 取值 | 决定方 |
| --- | --- | --- |
| 传输类型 `downloadMode` | `direct`、`client_mux`（`proxy` 已下线） | 后端 parse 结果(`resource.downloadMode`) |
| 存储类型 `storageType` | `opfs`、`indexeddb`、`memory` | 前端真实能力探测,见 §3 |
| 恢复类型 `recoveryMode` | `resumable`、`restartable`、`current_page` | 由 `storageType` 和资源是否可校验 Range 续传共同决定,见 §3 表 |

浏览器 UA 只进入埋点,不参与策略分支。

## 3. 存储类型与选择

### 3.1 三种存储语义

| `storageType` | 保存内容 | `recoveryMode` | 刷新后行为 |
| --- | --- | --- | --- |
| `opfs` | OPFS 临时单文件 + checkpoint | `resumable` | 仅资源可校验非 0 Range 续传时使用;显示「继续下载」,按 `downloadedBytes` 发 Range 续传 |
| `opfs` | OPFS 轻量任务记录 | `restartable` | OPFS 可用但资源未知大小、缺少可校验总大小/文件指纹或 Provider 未确认支持非 0 Range;显示「重新下载」,从 0 重新下载 |
| `indexeddb` | IndexedDB 轻量任务记录(不存 Blob 分片) | `restartable` | 显示「重新下载」,从 0 重新下载 |
| `memory` | 仅页面内临时数据 | `current_page` | 当前页面内完成;刷新后无恢复入口 |

IndexedDB 本期只保存轻量恢复记录(资源标识、已下载字节、方法状态),临时 Blob 分片进 Memory。移动端 IndexedDB 事务失败概率高,继续在 IndexedDB 存分片会拖垮下载主链路。

### 3.2 真实写入探测

存储能力只在**新下载开始时探测一次**,写入 `storageType/recoveryMode`,恢复时不再重新探测、不动态降级。探测必须覆盖「写入 → 读取 → 删除」完整链路,而不是 API 存在性。

```text
OPFS 真实 write/read/delete 成功且资源可校验非 0 Range 续传 -> storageType=opfs,    recoveryMode=resumable
OPFS 真实 write/read/delete 成功但资源不可校验续传         -> storageType=opfs,    recoveryMode=restartable
否则 IndexedDB 真实 write/read/delete 成功                 -> storageType=indexeddb, recoveryMode=restartable
否则                                                      -> storageType=memory,  recoveryMode=current_page
```

### 3.3 下载前容量预检

用户点击单文件下载或 Download all 后,在身份一致性校验通过、申请下载授权之前执行浏览器存储预检。预检失败时不授权、不消耗匿名次数、不进入下载队列,展示“浏览器存储空间不足”提示并引导用户使用插件下载；`proxy` 下线后不再存在预检 fallback 机制（`storagePreflightFallback` 字段已从方法定义删除）。

预检编排不按 `download_mode` 名称硬编码,统一读取 `DownloadMethodDefinition.requiresStoragePreflight`。`direct` / `client_mux` 都执行预检,失败即阻断。

预检规则:

1. 仅对 `resource.size` 已知且大于 0 的资源做容量判断;未知大小不阻断。
2. 需要空间为 `fileSize + max(64MiB, fileSize * 15%)`,给 `navigator.storage.estimate()` 的近似值留余量。
3. `navigator.storage.estimate()` 的 `quota - usage` 小于需要空间时阻断。OPFS 和 IndexedDB 共享同一个 origin quota,不按两块独立空间计算。
4. 执行 1MiB OPFS 写入、读取、删除探测;OPFS 不可写且文件大于 100MiB 时阻断,因为后续只能走不可靠的 Memory 临时数据。
5. estimate 不可用、大小未知、小文件 OPFS 不可用时不阻断,继续走既有 OPFS -> IndexedDB -> Memory 降级。

本阶段不引入浏览器原生 File System Access API,也不引入 Redis 或跨机房全局并发记录。

## 4. 运行时失败

下载过程中本地断点写入失败(OPFS write 抛错、IndexedDB 事务失败)时:

1. 清理当前恢复记录与临时文件。
2. 按真实下载失败展示错误(`web_download_failed`)。

失败后不重新授权、不刷新 material、不自动重新下载；用户手动再次点击。

## 5. 刷新后恢复记录加载

| 记录状态 | 行为 |
| --- | --- |
| `opfs + resumable`,OPFS 临时文件真实大小等于 `downloadedBytes` | 显示「继续下载」 |
| `opfs + restartable` | 显示「重新下载」 |
| `indexeddb + restartable` | 显示「重新下载」 |
| `storageType` 当前探测不可用 | 清记录,资源卡片显示普通下载 |
| OPFS 临时文件大小与记录不一致 | 清记录,资源卡片显示普通下载 |
| `memory + current_page` | 不被 `loadDownloadResumeRecord()` 读出,刷新后无恢复入口 |

恢复记录失效时,workspace 解析结果 snapshot 与 playback snapshot 不受影响。

## 6. UI 规格

沿用现有 `[data-download-pending-resume-actions]` 区域,布局/间距/按钮尺寸与现有下载恢复区一致。

| 元素 | `resumable` | `restartable` |
| --- | --- | --- |
| 恢复提示文本 | 继续下载提示 | 重新下载提示 |
| 主按钮文案 | 继续下载 | 重新下载 |
| 忽略按钮 | 清记录并隐藏提示 | 清记录并隐藏提示 |

存储恢复失效后,资源卡片下载按钮回到普通下载状态。容量预检失败复用站点确认弹窗和大文件插件引导卡片。新增文案进现有 i18n 体系。

## 7. 埋点

存储治理事件名：

| 事件 | 触发 |
| --- | --- |
| `web_download_storage_preflight_blocked` | 下载前容量预检阻断,不申请下载授权 |

`web_download_storage_preflight_fallback` 随 `proxy` 与预检 fallback 机制一起下线，前端不再上报（后端 mark 字典保留历史值）。

`web_download_failed` 由通用下载失败路径上报,不属于存储治理事件集合,见 `@tech-下载方法与续传.md` §12。

存储探测、checkpoint 和恢复记录失效当前不单独上报 mark；可恢复异常写入控制台诊断，最终下载失败统一进入 `web_download_failed`。

存储预检结果事件使用紧凑字段：

| 字段 | 说明 |
| --- | --- |
| `url` | 已去 query/fragment 的资源链接 |
| `reason` | `insufficient_storage` / `opfs_unavailable_for_large_file` |
| `download_mode` | `direct` / `client_mux` |
| `file_size_bytes` / `available_bytes` / `required_bytes` | 文件大小、预检时可用空间和本次要求空间 |
| `browser.user_agent` / `browser.device_memory` | 仅保留浏览器版本识别和近似设备内存 |
| `cause.name` / `cause.message` | 仅 OPFS 探测失败时记录脱敏后的底层错误 |

事件名已经表达存储预检阶段，因此不重复记录 `storage_type`、`recovery_mode`、`operation`、`error`；`available_bytes` 已是 `quota - usage` 的决策输入，因此不重复记录 `storage_usage` / `storage_quota`；错误文本不再重复展开结构化容量字段。`mark_msg` 必须是不超过 1000 字符的完整 JSON。

禁止记录 signed URL、轨道 URL、Authorization、Cookie(同 `@tech-下载方法与续传.md` §12)。

## 8. 验收标准

1. OPFS 完整可写时,下载中刷新后可继续 Range 续传。
2. OPFS 目录 API 存在但 `createWritable` 缺失/抛错时,下载成功,并记 OPFS 探测失败。
3. IndexedDB 写轻量 checkpoint 成功时,刷新后显示「重新下载」。
4. IndexedDB transaction 失败时,当前下载自动切 Memory 并成功。
5. 恢复记录的 `storageType/recoveryMode` 与 UI 行为一致。
6. 恢复失效只清恢复记录,解析结果与播放恢复保持稳定。
7. direct 下载 URL 过期时清理记录并要求用户手动重新解析。
8. `web_download_failed` 只代表真实传输失败或最终文件生成失败,不把 checkpoint 失败计入。
9. `direct` / `client_mux` 容量预检失败时提示用户浏览器存储不足并引导插件下载,不申请下载授权（`proxy` 自动 GET fallback 已随 `proxy` 下线删除）。
10. 存储预检 blocked 埋点只保留事件专用字段,不记录无消费方的浏览器指纹字段或重复错误内容,且入库后仍可解析为完整 JSON。

## 9. 源码结构

```text
website/src/scripts/download/
  download-storage-preflight.ts  # 下载前 origin quota 与 OPFS 可写预检
  download-resume-store.ts       # OPFS/IndexedDB 后端、能力探测、Memory fallback、恢复记录加载
  download-temp-storage.ts       # 临时写入器抽象
  types.ts                       # 存储、恢复与错误操作类型
  workspace-download.ts          # 调用探测、按计划触发下载
  workspace-render.ts            # 恢复提示渲染
```

> 下载运行源码统一在 `website/src/scripts/download/`(见 `@tech-下载方法与续传.md` §10)。
