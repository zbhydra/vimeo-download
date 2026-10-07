# 002 · 速率治理

> 覆盖后端下载并发治理与 website 客户端下载速率上报。
> 关联:`@tech-链路与授权.md`(下载授权链路) `@tech-下载方法与续传.md`(各 mode 的能力合同) `@tech-后端媒体Provider架构.md`(ProviderPolicy 与下载生命周期)

速率治理包含三个维度:执行侧的**活跃下载并发**、Provider 的**下载材料刷新频率**、观察侧的**客户端速率上报**——是不同侧面,非重复。

| 维度 | 现状 | 观察对象 | 作用 |
| --- | --- | --- | --- |
| 并发治理 | 已实施（当前 Provider 未启用） | 后端进程内的活跃下载流 | 阻止单身份长期占满后端流资源 |
| 下载材料刷新频率 | 已实施（当前 Vimeo） | 已签名 token 的设备身份或旧 token 签发 IP | 限制重复刷新临时下载材料 |
| 客户端上报 | 已实施 | 浏览器本次下载平均速率 | 埋点观测,落到 mark-log / SLS |

**已下线**:后端输出带宽限速(`ProxyBandwidthLimitService`、`proxy_total_rate_limit_mb_per_second`、`proxy_user_rate_limit_bytes_per_second`、`dl_user_rate_mb_s` 配置项)与 TG 客户端上游速率统计,都随对应链路一并删除。当前没有任何平台产出 `download_mode = "proxy"`，服务端不代理媒体字节，因此不存在服务端限速对象。

## 1. 活跃下载并发

### 1.1 范围

包含:

- 单个后端进程内按身份限制同时存在的活跃下载流数量。
- 由 `ProviderPolicy.active_limited` 决定某个 Provider 是否进入计数。

不包含:

- `direct` 下载;浏览器直连平台 CDN,后端不持有流,无法也不必计数。
- `client_mux` tracks 下载;浏览器直连 tracks,同上。
- 后端输出带宽限速;**当前不存在**服务端代理字节的输出限速。
- Redis 跨进程/跨节点精确并发计数。
- 其他平台尚未定义的下载调用频率限制。

### 1.2 计数口径

- 上限值来自数据库配置 key `dl_active_download_limit`,下载授权入口（匿名与账号两个入口共用）读取；缺失或非正整数量直接返回 `MEDIA_DOWNLOAD_PRE_UNAVAILABLE`，不做静默兜底。
- 上限写入并签名进 `media_download` token 的 `active_download_limit`，`download-v2` 只读 token，不查 DB、不查订阅、不查档位。
- 只用进程内 dict(`media_active_download_service`)，不使用 Redis；进程重启后计数自然清空。
- 身份键:账号授权为 `user:{id}`，匿名设备为 `device:{id}`；网站只产生设备身份。
- 超过上限直接返回 `RATE_LIMIT_EXCEEDED_MEDIA`，`data.reason = "active_download_limit_exceeded"`，不排队等待，前端不切节点。
- 只在 `provider.policy.active_limited=True` 时生效；`download_mode` 不决定是否进入计数。

当前状态:唯一的平台 Provider `VimeoMedia` 声明 `ProviderPolicy(active_limited=False)`（Vimeo 走 `direct` / `client_mux`，后端不持有媒体流），因此并发计数当前**不会触发**。该能力与具体 `download_mode` 无关:由 `ProviderPolicy.active_limited` 决定是否进入计数,凡后端持有下载流的 Provider 均适用。

### 1.3 释放语义

释放由 `media_provider_service` 包装 stream 后统一执行:

- stream 正常结束、报错、客户端断开和 BackgroundTask 兜底都必须幂等 release。
- 释放阶段先还 active 计数，再做 Provider cleanup，避免清理慢阻塞续传。
- `ActiveDownloadGuard.release()` 可重复调用，重复释放不会减成负数。

### 1.4 平台下载材料刷新频率

Vimeo 的 `vimeo_direct_intent` 使用 `RedisFixedLimiter` 对下载材料刷新按已签名 token 的 `device_id` 限制 6 次/60 秒；旧 token 缺少 `device_id` 时按 token 的 `issued_ip` 回退，仍为 6 次/60 秒。该限制在 Provider 执行层生效，不区分账号分支，也不增加 IP 辅助桶。

后续其他平台需要「下载 N 次/分钟」时，必须先在本文件新增公共执行口径，至少写清身份键、挂载层级、错误码和是否影响节点切换；不得把该限制私塞进 Provider。

解析频率限制属解析链路，见 `@tech-链路与授权.md` 与各平台 Provider；它不经过本节。

## 2. 客户端速率上报

### 2.1 范围

website 的单个客户端下载任务结束时，上报本次下载的平均速率。下载成功和下载失败都要有同一口径的速率字段。

包含:

- 复用现有 `web_download_success` / `web_download_failed` mark-log 和 SLS 双写通道。
- 复用现有失败上报结构:`download_stats.average_bps`。
- 只覆盖单个资源下载任务，包括单个下载按钮、Continue、Restart。
- 补齐成功路径的速率字段，并补齐 Continue / Restart 入口的成功和失败上报。
- Continue / Restart 时，平均速率只计算本次继续下载新增的字节，不把之前已经下载的字节算进去。

不包含:

- 不新增后端 API、数据库表、索引或统计服务。
- 不新增 Pause / Resume 控件。
- 不做刷新、关闭页面后的补报系统。
- 不覆盖 Download all / 批量下载成功汇总。
- 不新增 telemetry id、本地 active telemetry、reported ids。
- 不新增 UI 文案或展示模块。

### 2.2 上报结构

```json
{
  "download_stats": {
    "bytes_done": 23488102,
    "bytes_total": 694471885,
    "average_bps": 445747
  }
}
```

速率口径:

```text
average_bps = floor(本次新增下载字节 / 本次有效下载耗时秒)
```

字段来源:

| 字段 | 来源 |
| --- | --- |
| `bytes_done` | 最后一次进度快照的 `downloadedBytes`;没有快照时用 completion 的 `bytesWritten` |
| `bytes_total` | 最后一次进度快照的 `totalBytes`;没有快照时用资源 size |
| `average_bps` | 最后一次进度快照的 `speedBytesPerSecond`,取整 |

### 2.3 时间口径

- 从开始读取下载响应 body 时算，到下载流结束或失败时停止。
- 不计算 parse、下载授权、排队、重试等待、object URL 保存、浏览器原生保存弹窗时间。
- 下载流中途没有新字节但未失败时，这段等待算进耗时。
- 进度源里 `speedBytesPerSecond` 已按下载 helper 自己的 `startedAt` 计算:
  - `response-download.ts`:从进入 `createObjectUrlCompletionFromResponse()` 后开始算。
  - `download-range-stream.ts`:从进入 `pipeRangeResponseToWriter()` 后开始算。
  - `client-mux.ts`:从开始下载轨道后开始算。
- Continue 的 Range helper 已使用 `sessionBytes = downloadedBytes - startByte`，保留这个口径。
- client_mux 的 mux 阶段 `speedBytesPerSecond=null`，不能覆盖最后一个下载阶段速率。

### 2.4 场景口径

| 场景 | 行为 |
| --- | --- |
| 下载成功 | `web_download_success` 带 `download_stats.average_bps` |
| 下载失败 | 复用现有 `web_download_failed` 的 `download_stats.average_bps` |
| Continue | 只计算本次 Continue 新增字节 |
| Restart | 从 0 重新计算 |
| Download all | 不在本需求范围内 |
| 页面刷新/关闭 | 本阶段不补报;恢复后下一次成功/失败再按本次动作上报 |
| Pause | 当前不新增 Pause;不做暂停态上报 |

### 2.5 成功 mark helper

```ts
export function buildHomepageDownloadSuccessMarkMessage(
  url: string,
  resources: MediaPost | MediaPost[],
  task: DownloadTaskForMark | null
): string
```

规则:

- 字段名使用现有 `average_bps`，不新增 `avg_speed_bps`。
- `mark_msg` 超长时，`download_stats` 保留;复杂错误信息按现有逻辑压缩。
- `mark_msg` 必须保持低于 1000 字符(后端 API 与数据库上限 1024)。
- mark 实现维护在 `website/src/scripts/runtime/mark.ts`。
- mark-log / SLS 上报失败不影响下载。

### 2.6 非功能要求

- 不新增 npm 依赖。
- 不新增依赖注入。
- 不使用 `any` / `unknown`。
- 不保存直链、token、Cookie、Authorization。
- 不新增埋点事件;只补字段到现有 mark 事件。
