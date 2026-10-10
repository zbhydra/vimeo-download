# 002 · 解析与下载材料授权

本文记录网站 Vimeo 下载的当前协议边界。匿名计次和设备策略见
[匿名下载授权合同](tech-匿名下载授权.md)，扣费规则见 `003.积分系统`。

## 1. 流程

```text
parse-pre-v2 -> parse-v2 -> resource_token -> download(-anonymous)-pre-v2
```

业务节点在 `parse-pre-v2` 选择一个健康解析节点和一条启用代理。代理配置、
原始链接、节点 ID 和短有效期被 Fernet 加密认证为执行 token；网站只把 token
发给该节点一次。节点验 token 后创建带该代理的 Playwright context，只访问
Vimeo 一次。

节点把完整 `direct` 或 `client_mux` 材料放入加密认证的 `resource_token`。材料
包括 `source_id`、文件元数据、直链，或完整视频/音频轨道、初始化分片和分片 URL。
业务的 `download-pre-v2` 和匿名预授权先解密并校验材料、模式、资源身份、4 GiB
上限和网站文件白名单，再执行计费/计次，最后直接返回材料。业务不再选择下载
节点，也不重新访问 Vimeo。

解析或下载材料失败由用户重新解析或下载插件；客户端不自动重试、换代理、换节点、
故障转移、直连回退或刷新材料。材料不写 Redis，Vimeo 解析不使用材料 Redis 缓存。

## 2. 接口合同

### `POST /api/client/media/parse-pre-v2`

请求：`{"link": "https://vimeo.com/<id>"}`。

成功：`{"node": {"node_id": 2, "url": "https://.../api/client/media/parse-v2"}, "token": "<encrypted-token>"}`。

只返回一个节点。没有健康节点使用 `MEDIA_SERVICE_NODE_UNAVAILABLE`，没有启用代理、
动态代理 GET 失败或返回内容不是标准代理 URL 使用 `MEDIA_PARSE_PROXY_UNAVAILABLE`。
动态代理 `dynamic_url` 只 GET 一次，响应必须是单条带协议的代理 URL 文本，支持
HTTP、HTTPS、SOCKS5 及认证信息。

### `POST /api/client/media/parse-v2`

请求：`{"token": "<parse-pre-token>"}`。

节点只接受加密执行 token，不接受客户端代理地址或裸链接。token 无效/篡改使用
`MEDIA_PARSE_EXECUTION_TOKEN_INVALID`，过期使用 `MEDIA_PARSE_EXECUTION_TOKEN_EXPIRED`。
Vimeo 上游资源不可达、平台不支持和解析节点自身故障分别映射到现有
`MEDIA_PARSE_RESOURCE_NOT_FOUND`、`MEDIA_PARSE_UNSUPPORTED_PLATFORM`、
`MEDIA_PARSE_NODE_UNAVAILABLE`。

成功响应仍是通用 media schema；`resources[].resource_token` 是加密材料 token，
公开 JSON 不包含直链、轨道或 Provider 私有字段。

### `POST /api/client/media/download-pre-v2`

请求：`{"resource_token": "<resource-token>"}`。登录用户短锁覆盖材料验签和扣费。
材料验签、过期、结构或 claims 不一致使用 `MEDIA_RESOURCE_MATERIAL_INVALID` 或
`MEDIA_RESOURCE_MATERIAL_EXPIRED`；文件白名单使用 `MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED`；
余额不足使用 `CREDIT_INSUFFICIENT`。只有这些检查通过后才调用扣费，并返回：

```json
{
  "credits_balance": 12,
  "material": {
    "source_id": "vimeo:123:direct:1",
    "platform": "vimeo",
    "download_mode": "direct",
    "download_url": "https://*.vimeocdn.com/...",
    "filename": "video.mp4",
    "mime_type": "video/mp4",
    "size": 1048576
  }
}
```

匿名 `download-anonymous-pre-v2` 使用同一材料校验，按既有设备免费策略返回
`status`、`wait_seconds` 和 `material`；状态 3 仍只表示改用插件。

## 3. 删除边界

服务端下载执行节点已移除，Website 不再调用下载节点，也不处理旧的
`media_download` JWT。下载节点选择、Provider 下载阶段重新捕获和材料 Redis 缓存
不属于当前链路；`parse-v2` 仍可在 business/download role 挂载用于执行解析。

## 4. 错误码动作

| CommonCode | 客户端动作 |
| --- | --- |
| `MEDIA_PARSE_PRE_INVALID_LINK`、`MEDIA_PARSE_UNSUPPORTED_PLATFORM` | 修改链接后重新解析 |
| `MEDIA_PARSE_PROXY_UNAVAILABLE`、`MEDIA_SERVICE_NODE_UNAVAILABLE`、`MEDIA_PARSE_NODE_UNAVAILABLE` | 提示解析暂不可用，用户手动重新解析 |
| `MEDIA_PARSE_EXECUTION_TOKEN_INVALID`、`MEDIA_PARSE_EXECUTION_TOKEN_EXPIRED` | 重新解析 |
| `MEDIA_PARSE_RESOURCE_NOT_FOUND` | 检查 Vimeo 链接后重新解析 |
| `MEDIA_RESOURCE_MATERIAL_INVALID`、`MEDIA_RESOURCE_MATERIAL_EXPIRED`、`MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED` | 重新解析或下载插件 |
| `CREDIT_INSUFFICIENT` | 充值后重新下载 |

除统一中间件的 `INTERNAL_SERVER_ERROR` 外，节点和预授权路由不吞掉异常；每个
真实可达的业务失败分支返回稳定 CommonCode，客户端据此显示重新解析或下载插件。
