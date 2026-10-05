# 002 · website 前端 V2 切换

> 技术实现文档。覆盖:website/extension V2 流程的前端行为、超时、错误处理、执行策略、改动范围、测试、灰度与回滚。
>
> 关联:
> - 本域产品:`@feat.md`
> - V2 链路 + 接口规格 + token:`@tech-链路与授权.md`
> - 下载方法与续传:`@tech-下载方法与续传.md`
> - 速率治理:`@tech-速率治理.md`
>
> 来源:原 `feat.041 §5 前端切换` 全部。

## 1. 前提

原 feat.039.003 已移除下载链路的 `client_request_id`;账号授权接口 `download-pre-v2` 不再需要、不校验该字段,前端也不再生成或持久化下载用请求 ID。

## 2. 前端行为

客户端执行 V2 流程:

1. 先调业务服务器 `parse-pre-v2`,取得有序解析节点。
2. 按 `nodes` 顺序请求 `parse-v2`;只有当前节点超时、连不上、DNS/TCP/TLS 失败、网关不可达或返回 `MEDIA_PARSE_NODE_UNAVAILABLE` 时才试下一个。
3. `parse-v2` 成功后,保存 `canonical_link`、`platform`、`download_mode`、`source_id`、`size`、`resource_token`,并记录实际解析成功的 Pre 节点 `node_id`。
4. 用户点击下载并通过身份一致性校验后,按当前方法合同执行 origin storage 预检。
5. 预检只按当前方法定义的 `requiresStoragePreflight` 判断;`direct` / `client_mux` 都必须预检且没有 fallback,预检失败直接阻断（`proxy` 已下线，`storagePreflightFallback` 机制一并删除）。
6. 对最终 action plan 调用匿名下载授权入口（网站固定匿名，与 Pricing 页是否登录无关）,提交 `resource_token` 和可选 `preferred_node_id`。
7. 收到 `token + nodes` 后,POST 按 `nodes` 顺序请求 `download-v2`,请求体 `{"token": token}`；网站端只用 POST，不构造 GET 下载导航。
8. POST 对第一个下载入口发起请求;只有当前入口超时、连不上、DNS/TCP/TLS 失败、网关不可达或 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` 时试下一个。token 无效或过期时停止换节点,引导重新创建下载授权。
9. 按 `download_mode` 处理 POST 响应:`direct` 读 JSON 后请求平台 CDN;`client_mux` 读 JSON 后拉 tracks 合成;文件名取 `download-v2` 返回的 `filename`，为空时兜底 `parse-v2` 资源 `filename`。
10. `direct` 已知大小资源下载中断后按 `Range` 从已写入 offset 自动续传，连续无进展重试 3 次后保留记录并提示 Continue；链接过期时方法内部最多重新授权一次。

首阶段不要求浏览器原生下载在中途自动换节点;只处理节点请求前失败、节点临时不可用、支持 Range 的下载器重试。

网站只调用匿名授权接口，三态、等待及中止规则见 [Website 匿名下载接入](tech-Website匿名下载接入.md)；账号接口 `download-pre-v2` 网站不再调用，后端保留（见 [004 计划](../000.架构/plans/004.官网改版-插件展示与免费网页下载.md) §8）。需要重新授权时仍经同一入口。

下载模式边界（`proxy` 已下线，前端不再注册该模式）：

| 模式 | V2 前端入口 | `download-v2` 响应 | 后续动作 |
| --- | --- | --- | --- |
| `direct` | `匿名下载授权 -> download-v2` | `download_url` JSON | 前端请求平台 CDN |
| `client_mux` | `匿名下载授权 -> download-v2` | tracks JSON | 前端拉轨道并合成 |

website 下载固定使用完整 V2 Pre 流程。`PUBLIC_MEDIA_DOWNLOAD_V2_ENABLED` 和 `EXTENSION_MEDIA_DOWNLOAD_V2_ENABLED` 不能作为运行时分支开关;异常时按发布平台回滚构建或修复 V2 链路。

前端超时:

| 阶段 | 超时 |
| --- | --- |
| `parse-pre-v2` | 10 秒 |
| 单个节点 `parse-v2` | 15 秒 |
| 下载授权（匿名 `download-anonymous-pre-v2`） | 10 秒 |
| `download-v2` 建立连接 | 10 秒 |

上述超时只覆盖 `download-v2` 建立连接与读取 JSON 材料；JSON 获取成功后按当前规则处理 CDN/tracks 失败。执行材料过期时,新下载内最多重新走一次下载授权;OPFS Continue 不重新授权,记录里的直链材料缺失或已失效时加载阶段清理恢复记录、不展示 Continue,执行时发现失效则清理记录并提示重新 Download;restartable Restart 作为新的传输动作重新走授权。

V2 下载授权必须使用 `parse-v2` 返回的 `canonical_link`。前端用用户原始 link 调下载授权 可能导致目标节点 `download-v2` 重新解析失败或返回资源不可达。

下载 token 默认用 POST body 传给 `download-v2`,不放入 query；`proxy` 下线后网站端不再有把 token 放进 URL 的下载入口。错误日志、埋点、控制台日志都不能输出完整 token。平台 CDN 请求和 tracks 请求用 no-referrer 策略。

## 3. 执行策略

- 当前前端走 `parse-pre-v2 -> parse-v2 -> 匿名下载授权 -> download-v2`(网站只走匿名授权,不区分登录身份)。
- 前端一旦发起下载授权,失败按当前下载动作失败处理,用户可重新点击下载。
- 授权成功返回 token 后,只能用本次授权的 `nodes`/`token`。
- 候选池统一、不按节点类型分层:后端返回的 `nodes` 就是池内全部可用节点,不存在「没有下载节点时才拿业务节点兜底」;节点本地无法执行时由 `download-v2` 返回 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE`。
- token 过期后重新走下载授权。

## 4. 错误处理

| 场景 | 业务 code | 行为 |
| --- | --- | --- |
| 第一个解析节点超时或连不上 | 网络错误/网关错误 | 尝试下一个解析节点 |
| `parse-v2` 节点临时不可用、缺本地配置或 registry 缺 Provider | `MEDIA_PARSE_NODE_UNAVAILABLE` | 尝试下一个解析节点 |
| `parse-v2` 需要客户端扩展 | `MEDIA_PARSE_REQUIRES_CLIENT` | 走扩展引导 |
| `parse-v2` URL 无法识别为任何支持平台 | `MEDIA_PARSE_UNSUPPORTED_PLATFORM` | 展示不支持 |
| `parse-v2` link 输入错误 | `MEDIA_PARSE_INVALID_LINK` | 展示输入错误 |
| `parse-v2` 资源不存在 | `MEDIA_PARSE_RESOURCE_NOT_FOUND` | 展示解析失败 |
| `parse-pre-v2` 不可用 | `MEDIA_SERVICE_NODE_SELECT_FAILED`/`UNAVAILABLE` | 展示解析暂不可用 |
| 已发起下载授权后网络超时/5xx | 网络错误/5xx | 展示下载失败,不回退 |
| 授权入口身份锁忙 | `RATE_LIMIT_EXCEEDED_MEDIA` | 展示请求过于频繁 |
| 授权入口 Redis 锁基础设施不可用 | `MEDIA_DOWNLOAD_PRE_UNAVAILABLE` | 展示下载暂不可用 |
| 点击下载 | 授权成功响应中的三态 | 直接放行、等待或提示改用插件；关闭等待和状态 3 均为用户中止 |
| 授权入口无可返回节点 | `MEDIA_SERVICE_NODE_UNAVAILABLE` | 展示下载暂不可用 |
| 第一个下载入口超时或连不上 | 网络错误/网关错误 | 尝试下一个下载入口 |
| 下载节点临时不可用、缺本地配置或 registry 缺 Provider | `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` | 尝试下一个节点 |
| 活跃下载超限 | `RATE_LIMIT_EXCEEDED_MEDIA` + `data.reason=active_download_limit_exceeded` | 展示请求过于频繁/稍后再试,不切节点 |
| 下载节点资源不可达/上游无权限 | `MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` | 展示失败或重新走 Pre,不切节点 |
| token 无效/过期 | `MEDIA_DOWNLOAD_TOKEN_INVALID`/`EXPIRED` | 停止重试,重新授权 |
| 文件超过 4GiB | `MEDIA_DOWNLOAD_FILE_TOO_LARGE` | 展示文件过大 |
| 未知大小流式被节点中断 | `MEDIA_DOWNLOAD_FILE_TOO_LARGE` | 展示失败/过大,引导重新解析 |
| Range 不可满足 | `MEDIA_RANGE_NOT_SATISFIABLE` | 按下载器 Range 错误处理 |
| 所有候选节点临时失败 | 聚合最后一个失败 code | 展示下载失败 |

## 5. 改动范围

website/extension:

| 文件/目录 | 改动 |
| --- | --- |
| `website/src/scripts/download/media-api.ts` | `parse-pre-v2`、`parse-v2`、匿名授权、`download-v2` API 调用和响应类型；匿名授权读取三态，不返回余额 |
| `website/src/scripts/download/download-dispatcher.ts` | 所有下载方法先执行 V2 授权,再按 `download_mode` 分派 |
| `website/src/scripts/download/media-download-v2.ts` | 只保留 direct / client_mux 的 JSON 材料获取;`MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` 不再触发切节点 |
| `website/src/scripts/download/direct-download.ts` | 改为消费 V2 `download-v2` direct URL JSON |
| `website/src/scripts/download/client-mux-download.ts` | 改为消费 V2 `download-v2` tracks JSON |
| `website/src/scripts/download/response-download.ts`、`workspace-download.ts` | 处理节点失败、token 失效与 V2 JSON 响应 |
| `website/src/scripts/download/snapshot.ts` 等 | 工作区快照校验设备 owner；新授权走共同入口，已保存直链材料的续传保留原方法资格 |
| `website/src/components/download/` | 如需展示节点下载状态补 UI 状态 |
| `extension/src/core/api/` | 如扩展使用服务端下载入口,同步支持节点列表 |

后端:视前端需求补充 V2 错误码和响应字段。

## 6. 测试

前端:成功调用 Pre 接口;direct / client_mux 都经过共同授权入口并正确消费匿名授权响应;解析/下载节点失败时按顺序试下一个;`parse-pre-v2` 返回 `MEDIA_SERVICE_NODE_UNAVAILABLE` 时展示解析暂不可用;token 无效不换节点、过期重新授权;`preferred_node_id` 作亲和 hint;请求体不含 `client_request_id`;前端不生成/保存下载用请求 ID;匿名三态、等待取消、状态 3 插件引导及批量中止符合网站接入合同;授权请求的 link 用 `parse-v2.canonical_link`;不把完整 token 写日志/埋点;CDN/tracks 请求 no-referrer;无下载节点且业务节点健康可用时仍可用业务节点。

direct / client_mux 节点判别验收:`MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` 不切节点;`RATE_LIMIT_EXCEEDED_MEDIA` 不切节点;只有网络/网关错误和 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` 切下载节点。

后端:V2 Pre 返回最多 3 个入口;业务节点健康且 `weight>0` 时和下载节点进同一权重候选池。

执行:`cd website && pnpm tsc --noEmit && pnpm build` / `cd backend && uv run black . && uv run ruff check . && uv run mypy .`;extension 有改动同步构建检查。

## 7. 灰度与回滚

灰度顺序:

0. 确认当前线上前端构建产物已归档,或发布平台支持一键回滚。
1. 先部署后端和下载节点。
2. admin 添加 `node_type=1/2` 节点记录,确认健康检查通过;不希望参与的设 `weight=0`。
3. admin 添加下载节点。
4. 小流量发布当前 V2 Pre 前端。
5. 观察下载成功率和节点失败率。
6. 稳定后扩大流量。

回滚:

- 前端回滚到上一版构建;后端不提供接口分支开关。
- 发布前必须保留上一版前端构建产物或平台回滚入口。
- 后端恢复需回滚后端版本或重新实现。
