# 002 · 后端媒体 Provider 架构

> 技术实现文档。覆盖:后端 parse/download 平台适配层、Provider 契约、请求/响应结果、错误模型、Provider 下载治理策略、Range 与带宽限速边界。
>
> 关联:
> - 本域产品:`@feat.md`
> - V2 链路与授权:`@tech-链路与授权.md`
> - 下载方法与续传:`@tech-下载方法与续传.md`
> - 速率治理:`@tech-速率治理.md`
> - 站点适配矩阵:`@tech-站点适配.md`

## 1. 目标

把后端下载执行从单个大 service 拆成“统一编排 + 平台 Provider”：

- 每个平台一个 Provider 文件。
- `parse` 固定返回统一 parse result。
- `download` 固定返回 JSON result。
- 用户并发、Range 头透传与错误映射由统一编排层处理；是否启用并发由 Provider policy 决定，Range 是否支持和上游响应处理由 Provider 决定。
- 具体平台只实现本平台如何解析、如何生成本次下载材料。

旧 `MediaNodeExecutionService` 曾同时承担 parse-v2、download-v2、各平台 proxy、direct、client_mux、Range/header、错误映射、4GiB 保护、限速与平台动态导入。多平台时期这种结构会持续膨胀；本架构把“平台差异”与“下载通用治理”分开，并删除旧执行 service，避免保留双轨入口。单平台化后 registry 只剩 Vimeo 一个 Provider，架构本身不变。

## 2. 非目标

- 不改 V2 外部接口路径和请求方式。
- `download_mode` 只有 `direct` / `client_mux`：`proxy` 已下线，类型 Literal、token 校验、执行侧流式脚手架（`StreamDownloadResult`、`StreamingResponse` 分支）全部删除。
- 不引入依赖注入；新增服务使用模块级单例。
- 不引入 Redis 计数做活跃下载并发限制。
- 不做 `provider.release()` 这种单例级释放入口。

## 3. 文件结构

```text
backend/src/app/provider/media/
  __init__.py          # MEDIA_PROVIDERS registry + get_media_provider()
  base_media.py
  vimeo_media.py

backend/src/app/provider/
  browser_runtime.py   # 匿名浏览器 runtime（Vimeo 匿名解析用）

backend/src/app/contracts/
  media_platform.py
  media_download.py

backend/src/app/constants/
  media_download.py

backend/src/app/services/
  media_provider_service.py
  media_active_download_service.py
  media_anonymous_download_service.py
  media_download_token_service.py
  media_resource_token_service.py
  media_pre_authorization_service.py
  media_service.py
```

职责：

| 文件 | 职责 |
| --- | --- |
| `contracts/media_platform.py` | 平台常量与 URL 平台识别 |
| `contracts/media_download.py` | download token claims 与 download mode 类型 |
| `constants/media_download.py` | 4GiB 等全局下载阈值 |
| `provider/media/base_media.py` | Provider 契约、请求对象、结果对象、错误类型、下载治理策略、Range 错误类型 |
| `provider/media/{platform}_media.py` | 单个平台的 `_parse()` / `_download()` 实现和模块级单例；当前只有 `vimeo_media.py` |
| `provider/browser_runtime.py` | 匿名浏览器 runtime：进程内共享 browser 实例、`ensure_browser()` 与关闭钩子 |
| `services/media_provider_service.py` | V2 parse/download 编排、Provider 查找、extra 透传、活跃下载治理、统一 release、错误映射 |
| `services/media_active_download_service.py` | 进程内用户活跃下载计数，上限由已验签 token 携带 |
| `services/media_anonymous_download_service.py` | 匿名设备下载的设备终生计数与资源排重 |
| `services/media_download_token_service.py` / `media_resource_token_service.py` | token 签发与验签 |
| `services/media_pre_authorization_service.py` | download-pre-v2 授权前置校验与短锁 |
| `services/media_service.py` | pre-v2 扣费、去重与计费规则 |

不新增 `direct_media.py`、`client_mux_media.py`。平台是 Provider 维度，mode 是下载结果维度。

`provider/media` 内部不得 import `app.services`。provider 基础设施模块 `provider/browser_runtime.py` 也不得 import `app.services`；它只提供匿名浏览器能力，不感知下载业务。公共 service 可以依赖 Provider registry、provider 基础设施或中性契约层做编排。

## 4. Provider 契约

### 4.1 BaseMedia

```python
from typing import ClassVar


class BaseMedia:
    platform: ClassVar[str]
    policy: ClassVar[ProviderPolicy]

    async def parse(self, request: MediaParseRequest) -> MediaParseResult:
        ...

    async def download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        ...

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        ...

    async def _download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        ...
```

规则：

- `platform` / `policy` 是子类必须声明的类属性。
- `parse()` / `download()` 是统一入口，可做公共校验、日志上下文和错误归一。
- 具体平台只实现 `_parse()` / `_download()`。
- Provider 不返回 FastAPI response。
- Provider 不处理用户并发计数。
- Provider 不知道 active guard 或 BackgroundTask 的实现。
- Provider 不记录完整 token；需要日志关联时用 claims 里的 `jti`，API 层可记录 token hash。
- Provider 单例必须无状态；本次下载材料在 `_download()` 内自包含，不跨请求持有。
- 有状态基础设施不下沉进 Provider 单例：浏览器 runtime 放在 `app/provider/browser_runtime.py`，由 Provider 在 `_parse()` 内按需调用 `ensure_browser()`；`_download()` 打开的上游资源在本次调用内自行关闭，不单独保留 runtime 门面。

### 4.2 ProviderPolicy

```python
@dataclass(frozen=True)
class ProviderPolicy:
    active_limited: bool = True
```

含义：

| 字段 | 说明 |
| --- | --- |
| `active_limited` | 本 Provider 的下载是否进入用户活跃下载计数 |

活跃下载计数上限不是 Provider 自己实现，是公共治理策略，具体数值由已验签下载 token 携带；Provider 只声明本平台是否启用这条公共治理。

`active_limited=False` 表示不进入用户活跃下载计数，不影响 active guard 的归还。默认必须是 `True`；某平台要设为 `False` 时，必须在站点适配文档写明原因。

公共层只读取 `provider.policy` 做治理，不按 `download_mode` 推导：

```text
provider.policy.active_limited
  -> active_download_service.acquire(uid, limit)
```

Range 不做公共能力声明。`media_provider_service` 只把原始 `Range` 头传给 Provider；Provider 按本次资源、上游响应、文件指纹和平台规则决定是否支持：

- 当前没有 Provider 声明支持字节 Range：`proxy` 下线后节点不再输出文件流，`Range` 头仍原样透传给 Provider。
- 不支持或上游不能满足时抛 `MediaProviderErrorCode.RANGE_NOT_SATISFIABLE`；如需响应 `Content-Range: bytes */total`,放在 `MediaProviderError.data.content_range`。
- 客户端带非 0 起点 Range 时，Provider 不能静默从头返回 `200`。

示例：

```python
class VimeoMedia(BaseMedia):
    platform = "vimeo"
    # 只返回 direct / client_mux 的 JSON result
    policy = ProviderPolicy(active_limited=False)
```

## 5. 请求对象

文档中的 `JsonValue` 固定为可 JSON 序列化值：

```python
JsonScalar = str | int | float | bool | None
JsonValue = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
Extra = dict[str, JsonValue]
```

```python
@dataclass(frozen=True)
class MediaParseRequest:
    url: str
    user_id: int | None
    device_id: str | None
    client_ip: str
```

```python
@dataclass(frozen=True)
class MediaDownloadRequest:
    claims: MediaDownloadTokenClaims
    range_header: str | None
    client_ip: str
    extra: Extra
```

规则：

- 请求对象固定，后续新增上下文也加字段，不继续扩展长参数列表。
- 不在请求对象里放 bucket、active guard、end callback。
- `MediaParseRequest` 携带 best-effort 身份：登录时有 `user_id`，匿名时 `user_id=None`；`device_id` 来自请求头，可能为空；`client_ip` 必填。平台若有解析限流，按 user -> device -> IP 回退。
- `range_header` 保留原始值；Provider 自己决定如何解析、转发或拒绝 Range。
- `extra` 来自该 Provider 的 parse 结果，只透传给同一个 Provider 的 download。
- `claims.download_mode` 是资源对前端的执行形态声明；公共治理不按它分支。最终响应以 `provider.download()` 返回的 result 类型为准，并做 contract 校验。

## 5.1 Provider registry

Provider 注册表使用显式 dict，不做自动扫描、不做装饰器注册：

```python
MEDIA_PROVIDERS: dict[str, BaseMedia] = {
    vimeo_media.platform: vimeo_media,
}


def get_media_provider(platform: str) -> BaseMedia | None:
    ...
```

规则：

- 新平台接入时只在 registry 增加一行。
- registry 不按 `download_mode` 分组。
- URL 平台识别失败抛 `MediaProviderErrorCode.UNSUPPORTED_PLATFORM`，映射为 `MEDIA_PARSE_UNSUPPORTED_PLATFORM`。
- 平台已识别但本节点 registry 缺对应 Provider 时，`get_media_provider()` 返回 `None`，由 `media_provider_service` 在进入 Provider 前抛节点不可用错误，`data.reason = "provider_missing"`；parse 映射为 `MEDIA_PARSE_NODE_UNAVAILABLE`，download 映射为 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE`，前端可切下一个节点。

## 6. 返回对象

### 6.1 Parse

`parse()` 返回带内部 `extra` 的 parse result：

```python
@dataclass(frozen=True)
class MediaParseResult:
    response: MediaParseResponse
```

Provider 不签发 resource token。

内部对象示意：

```python
MediaParseResult(
    response=MediaParseResponse(
        platform="vimeo",
        resources=[
            MediaResource(
                source_id="vimeo:1196869805",
                download_mode="direct",
                filename="video.mp4",
                extra={},
            )
        ],
    )
)
```

`response.resources[*].extra` 是后端内部字段，和对应 resource 放在一起，避免再维护旁路映射。公开 JSON 序列化时必须排除 `extra`：

- API 不公开 `extra`，公开响应不得出现 `resources[].extra`。
- 创建 resource token 时，把每个 `resource.extra` 签入该 resource 的 token。
- `download-pre-v2` 只验签并把 `extra` 原样写入 download token。
- `download-v2` 只把 `extra` 原样传给同平台 Provider。
- 除对应 Provider 外，任何公共层都不能读取 extra 做业务分支。
- 日志不能输出完整 extra。
- 字段名固定叫 `extra`；是否加密是 token 编码策略，不通过更换字段名表达。
- extra 只能放短小 JSON 定位材料，例如 format id、文件指纹、缓存 key；签名 JWT 只保证未被篡改，不提供保密。需要放敏感内容时，改用加密 token 或服务端缓存 key，不能把直链、cookie、secret 写进明文 JWT。
- extra 类型固定为 `Extra = dict[str, JsonValue]`；`JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]`。
- 签发 resource token 前必须校验 extra 可 JSON 序列化、compact JSON 后不超过 2048 bytes、最大嵌套深度不超过 4；不满足时不签发 token，返回 `MEDIA_PARSE_NODE_UNAVAILABLE` + `data.reason = "invalid_extra"`。
- extra 内的缓存 key 必须是随机不可猜测值，缓存记录必须绑定 `platform`、`canonical_link`、`source_id`、过期时间；含用户敏感材料时还必须绑定 `uid`。不能绑定“当前 token jti”:resource token 与 media download token 的 `jti` 不同,download-v2 看不到 resource token jti。
- 当前 Provider 重构不允许把“下载必需”的节点本地缓存 key 写入 extra。extra 必须能被所有候选下载节点解释：缓存 key 默认指向共享缓存且 TTL 覆盖 token TTL。节点本地材料只能作为可失效 hint,缺失时 Provider 必须降级到普通解析/账号池路径；如果某平台必须依赖节点本地缓存,需单独设计 node-bound 候选过滤,且过滤必须发生在 `download-pre-v2` 扣费前。

公开 parse 字段摘要：

| 字段 | 说明 |
| --- | --- |
| `status` | `ok` 或 `requires_client` |
| `platform` | 平台标识 |
| `original_link` / `canonical_link` | 原始链接与规范化链接 |
| `post` | 帖子级元数据 |
| `resources` | 资源列表；每个资源包含 `source_id`、`platform`、`filename`、`type`、`size`、`capabilities`、`download_mode`、`resource_token` |

### 6.2 Download

`download()` / `_download()` 统一返回 `JsonDownloadResult`；`proxy` 下线后不再有文件流结果类型。

```python
@dataclass(frozen=True)
class JsonDownloadResult:
    payload: DownloadJsonPayload
```

```python
DownloadJsonPayload = MediaDirectDownloadIntentResponse | MediaClientMuxDownloadIntentResponse
```

规则：

- `direct` 必须返回 `JsonDownloadResult(MediaDirectDownloadIntentResponse)`。
- `client_mux` 必须返回 `JsonDownloadResult(MediaClientMuxDownloadIntentResponse)`。
- 新增 mode 时先新增明确 schema，再允许 Provider 返回对应 payload。
- 不允许 Provider 随意返回裸 `dict`。
- `media_provider_service` 必须校验 `claims.download_mode` 与 JSON payload schema 匹配：`direct` 对应 `MediaDirectDownloadIntentResponse`,`client_mux` 对应 `MediaClientMuxDownloadIntentResponse`;不匹配时按节点不可用处理。
- `download-v2` 返回 JSON 时不再有服务端文件响应头：`Content-Disposition`、`Content-Length`、`Content-Range`、`Accept-Ranges`、上游 `ETag` 透传等白名单逻辑随 `proxy` 一起删除。
- JSON result schema 使用公开 API 字段 `mime_type`。

## 7. 错误模型

Provider 只抛统一错误，service 统一映射到 `CommonCode`。

```python
class MediaProviderErrorCode(StrEnum):
    INVALID_LINK = "invalid_link"
    UNSUPPORTED_PLATFORM = "unsupported_platform"
    UNSUPPORTED_DOWNLOAD_MODE = "unsupported_download_mode"
    REQUIRES_CLIENT = "requires_client"
    RESOURCE_NOT_FOUND = "resource_not_found"
    RESOURCE_UNREACHABLE = "resource_unreachable"
    NODE_UNAVAILABLE = "node_unavailable"
    RANGE_NOT_SATISFIABLE = "range_not_satisfiable"
    FILE_TOO_LARGE = "file_too_large"
    UPSTREAM_FAILED = "upstream_failed"
```

```python
class MediaProviderError(Exception):
    code: MediaProviderErrorCode
    message: str
    data: dict[str, object]
```

错误边界：

- 平台库、httpx、yt-dlp、TG client 的原始异常不直接穿透到 API。
- 未知异常由 `media_provider_service` 记录结构化日志后映射为节点不可用。
- Range 错误需要携带 `Content-Range` 时，Provider 把值放入 `MediaProviderError.data.content_range`，由 service/API 错误路径透传。
- `UNSUPPORTED_DOWNLOAD_MODE` 不应由正常 Provider download 流程产生；resource token 和 media download token decoder 必须在进入 Provider 前拒绝非法 mode。
- `UPSTREAM_FAILED` 只用于可换节点的上游临时失败,映射 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE`。上游明确无权限、资源失效或文件不存在必须抛 `RESOURCE_UNREACHABLE` 或 `RESOURCE_NOT_FOUND`,不得用 `UPSTREAM_FAILED`。

映射口径：

| Provider code | parse-v2 | download-v2 |
| --- | --- | --- |
| `INVALID_LINK` | `MEDIA_PARSE_INVALID_LINK` | 不适用 |
| `UNSUPPORTED_PLATFORM` | `MEDIA_PARSE_UNSUPPORTED_PLATFORM` | 进入 Provider 前拒绝非法 token |
| `UNSUPPORTED_DOWNLOAD_MODE` | Provider 不应返回 | 进入 Provider 前拒绝非法 token / contract mismatch 映射 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` |
| `REQUIRES_CLIENT` | `MEDIA_PARSE_REQUIRES_CLIENT` | `MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` |
| `RESOURCE_NOT_FOUND` | `MEDIA_PARSE_RESOURCE_NOT_FOUND` | `MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` |
| `RESOURCE_UNREACHABLE` | `MEDIA_PARSE_RESOURCE_NOT_FOUND` | `MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE` |
| `NODE_UNAVAILABLE` | `MEDIA_PARSE_NODE_UNAVAILABLE` | `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` |
| `RANGE_NOT_SATISFIABLE` | 不适用 | `MEDIA_RANGE_NOT_SATISFIABLE` |
| `FILE_TOO_LARGE` | 不适用 | `MEDIA_DOWNLOAD_FILE_TOO_LARGE` |
| `UPSTREAM_FAILED` | `MEDIA_PARSE_NODE_UNAVAILABLE` | `MEDIA_DOWNLOAD_NODE_UNAVAILABLE` |

## 8. 活跃下载并发与释放

### 8.1 活跃下载计数

`media_active_download_service` 使用进程内 dict 计数：

```text
key = user:{uid}
limit = 已验签下载 token 携带的上限
```

规则：

- 只在 `provider.policy.active_limited=True` 时进入计数。
- `download_mode` 不决定是否 acquire；Provider policy 才决定是否启用并发治理。
- Vimeo Provider 声明 `active_limited=False`：它只返回 direct / client_mux 的 JSON result，不占用后端持续输出流。
- 计数只在当前进程内生效；进程重启自动清空。
- 超过上限直接返回 `RATE_LIMIT_EXCEEDED_MEDIA`，`data.reason = "active_download_limit_exceeded"`，不排队等待。
- 超限不是节点不可用，不返回 `MEDIA_DOWNLOAD_NODE_UNAVAILABLE`，避免前端切换节点。

`acquire()` 返回本次下载 guard：

```python
guard = media_active_download_service.acquire(user_key="user:123", limit=token_limit)
guard.release()
```

`release()` 必须幂等。

上限取自已验签 token：普通应用的保守默认允许旧连接、新 Range 恢复连接与释放异步窗口短暂重叠，但阻止单用户长期占用过多后端流资源。

### 8.2 guard 释放

Provider 单例不做 `provider.release()`，也没有 Provider 级 `aclose`。`media_provider_service` 在调用 Provider 前准备 `active_guard: ActiveDownloadGuard | None`，整个执行包在 `try/finally` 中：

```text
download_v2()
  -> try:
       active_guard = acquire(...)   # policy.active_limited=True 时
       provider.download(...)        # Provider 在本次调用内自行打开并关闭上游资源
       契约校验 / size 校验
     finally:
       if active_guard is not None:
         active_guard.release()
```

释放点覆盖 Provider 抛错、契约校验失败、size 超限和正常返回：只要 guard 已获取，`finally` 必定归还。

`release()` 必须幂等。

### 8.3 打开失败

```text
active acquire 成功
-> provider.download() 打开资源失败
-> media_provider_service finally 释放 active guard
-> 抛出统一错误
```

如果 Provider 在返回前已经打开了部分平台资源又抛错，Provider 必须在自身异常路径关闭这些部分资源；`download-v2` 没有对外文件流，公共层不再替 Provider 兜底释放。

如果 Provider 返回成功后，service 因真实 size 超过 4GiB 或其他公共校验失败而中止，`finally` 同样会释放 active guard。

## 9. 输出速率治理

后端不对下载输出做服务端限速（`proxy_bandwidth_limit_service` 与服务端带宽 bucket 已删除，`proxy` 下载模式随后也整体下线）。客户端侧速率上报与展示口径见 `@tech-速率治理.md`；服务端只保留活跃下载并发这一条公共治理。

## 10. media_provider_service 流程

### 10.1 parse-v2

```text
media_provider_service.parse_v2(url, user_id, device_id, client_ip)
  -> detect platform / get_provider(platform)
     平台识别失败: MEDIA_PARSE_UNSUPPORTED_PLATFORM
     registry 缺 Provider: MEDIA_PARSE_NODE_UNAVAILABLE(reason=provider_missing)
  -> build MediaParseRequest(url, user_id, device_id, client_ip)
  -> provider.parse(MediaParseRequest)
  -> 返回 MediaParseResult(response)
  -> API/service 把每个 resource.extra 签入对应 resource token
```

### 10.2 download-v2

```text
media_provider_service.download_v2(claims, range_header, client_ip)
  -> get_provider(claims.platform)
     registry 缺 Provider: MEDIA_DOWNLOAD_NODE_UNAVAILABLE(reason=provider_missing)
  -> 如果 token 已知 size > 4GiB:
       直接返回 MEDIA_DOWNLOAD_FILE_TOO_LARGE
  -> active_guard = None
  -> try:
       如果 policy.active_limited:
         active_guard = active_download_service.acquire(uid, limit)
       provider.download(MediaDownloadRequest(extra=claims.extra))
       校验 claims.download_mode 与 JSON payload schema:
         direct 必须是 MediaDirectDownloadIntentResponse
         client_mux 必须是 MediaClientMuxDownloadIntentResponse
         不匹配时返回 MEDIA_DOWNLOAD_NODE_UNAVAILABLE
       用 payload.size 做 4GiB 公共校验
       返回 JsonDownloadResult
     finally:
       如果 active_guard is not None:
         active_guard.release()
```

API 层只做：

```text
JsonDownloadResult -> ResponseUtils.ok(payload) + Cache-Control: no-store
```

## 11. 新平台接入规则

新增平台只允许主要改这些位置：

```text
backend/src/app/provider/media/{platform}_media.py
provider registry
平台对应测试
docs/feat/002.下载功能/tech-站点适配.md
```

不应新增：

- `media_provider_service` 里的大段 `if platform == ...`。
- 共享 `direct_media.py` / `client_mux_media.py`。
- Provider 自己维护用户并发计数。
- Provider 自己创建 FastAPI response。

验收口径：

- 新增第 N 个平台时，不需要理解其它平台资源的释放细节。
- 新增平台且复用已有 `download_mode` 时，不需要改 `download-v2` API。
- 新增平台且复用已有 `download_mode` 时，主要实现 `_parse()` / `_download()`、注册 Provider、补平台识别/token/schema/测试/站点文档。
- 新增 `download_mode` 时，必须先补 schema、前端 runner、方法注册和接口文档，不能塞进既有 Provider 主流程。
