# 008 · 系统设置

> 覆盖系统设置菜单的低频运维动作。通用 admin 接口约定见 `@tech-管理模块接口.md`。

## 范围

系统设置提供低频运维动作:

- 刷新配置读取缓存。
- 生成 / 轮换当前管理员的外部 API Key。
- 编辑远端配置全局稀疏覆盖对象，供扩展打开 Vimeo 页面时读取。

除远端配置这一个明确配置入口外，它不是通用配置编辑器。

## 刷新配置读取缓存

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/admin/system-settings/config-cache/refresh` | `get_admin_user` | 清空并重新加载当前业务进程内的配置读取缓存 |

响应:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `refreshed_services` | `string[]` | 本次已刷新服务名 |
| `refreshed_at` | `int` | 刷新完成时间,毫秒时间戳 |

刷新范围:

- `config_public_service`:公共配置缓存。
- `config_subscription_product_service`:订阅商品配置缓存。
- `config_subscription_product_price_service`:订阅商品价格配置缓存。
- `config_credit_product_service`:积分包商品配置缓存。
- `config_credit_product_price_service`:积分包价格配置缓存。
- `config_payment_channel_service`:支付渠道配置缓存。
- `payment_config_service`:订阅 checkout 聚合配置缓存;实际清理其依赖的配置表 service。
- `credit_checkout_config_service`:Credits checkout 聚合配置缓存;实际清理其依赖的配置表 service。
- `system_data_service`:后台可编辑系统数据配置缓存,TTL 30 分钟。

执行规则:

1. API handler 调用独立的 `admin_system_settings_service.refresh_config_caches()`。
2. service 先调用上述服务的 `clear_cache()` 清空进程内缓存。
3. service 随后对可直接重载的读取入口使用 `force_refresh=True` 重新读取一次数据库,确保接口成功返回时当前业务进程已经拿到最新配置。
4. 聚合服务可通过 `get_snapshot(force_refresh=True)` 重载,重复清理同一底层配置服务是幂等操作。
5. 任一配置读取失败时直接让异常上抛,由全局错误处理中间件返回失败;前端展示错误,管理员可重试。

边界:

- 只刷新当前业务服务器进程内缓存,不广播到 download 节点或其他业务进程。多进程 / 多实例部署时,管理员需要访问对应实例或等待对应配置服务的 TTL 自然过期;`system_data_service` 为 30 分钟。
- 不刷新 Vimeo 媒体解析缓存、Google JWK 缓存、监控缓存、Redis 缓存。
- 不新增依赖注入;API 层可继续使用 `Depends(get_admin_user)` 做鉴权。

前端:

- 新增 `admin/src/api/system-settings.ts`,封装 `refreshConfigCache()`。
- `admin/src/views/SystemSettingsView.vue`,页面顶部包含"配置表缓存"、"API Key"、"远端配置"三个 tab。
- 侧边栏新增"系统设置"菜单,路由名 `SystemSettings`,路径 `/system-settings`。
- 文案写入 `admin/src/i18n/zh-CN.json` 与 `admin/src/i18n/en-US.json`。

验收:

- 已登录管理员点击"系统设置"可进入 `/system-settings`。
- 点击"刷新配置缓存"时按钮 loading,不会重复提交;成功后出现成功提示并展示刷新时间。
- 后端接口成功后,公共配置、支付渠道、订阅商品/价格、积分包商品/价格及两个 checkout 聚合配置的后续读取不再使用旧缓存。
- 后端接口失败时前端展示失败提示,不清理登录态,管理员可再次点击。

## API Key 管理

管理员在系统设置页生成外部 API Key。API Key 只用于访问 `@tech-外部API.md` 定义的 `/api/external/*` 接口,不能用于登录后台、不能调用 `/api/admin/*`、不能调用节点本地 JWT-only 接口。

### 数据模型

在 `admins` 表新增字段:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `api_key_hash` | string \| null | API Key 哈希;不保存明文 |
| `api_key_prefix` | string \| null | API Key 前缀,用于后台展示和排查 |
| `api_key_created_at` | int \| null | API Key 生成时间,毫秒时间戳 |

索引:

- `api_key_hash` 加唯一索引,服务外部 API Key 鉴权按 hash 精确查管理员。

存储规则:

- API Key 原文只在生成成功响应中返回一次。
- 普通查询只返回 `api_key_prefix` 与 `api_key_created_at`,不返回原文。
- 重新生成会覆盖 `api_key_hash` / `api_key_prefix` / `api_key_created_at`,旧 key 立即失效。
- 暂不做多 key、过期时间、权限分组、调用审计。

### 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/system-settings/api-key` | `get_admin_user` | 查询当前管理员 API Key 元信息 |
| POST | `/api/admin/system-settings/api-key` | `get_admin_user` | 生成 / 重新生成当前管理员 API Key |

`GET /api-key` 响应:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `has_api_key` | bool | 当前管理员是否已生成 API Key |
| `api_key_prefix` | string | API Key 前缀;没有时为空字符串 |
| `api_key_created_at` | int \| null | 生成时间 |

`POST /api-key` 响应:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `api_key` | string | 完整 API Key,只在本次响应返回 |
| `api_key_prefix` | string | API Key 前缀 |
| `api_key_created_at` | int | 生成时间 |

API Key 生成格式:

- 使用高熵随机字符串,前缀固定为 `tdm_`。
- `api_key_prefix` 保存前 12 位左右,用于确认当前 key。
- 哈希使用项目已有密码哈希工具或新增不可逆哈希工具;比较时使用恒定时间比较。

### 前端

- API Key 区块展示 `has_api_key`、`api_key_prefix`、生成时间。
- 未生成时按钮文案为"生成 API Key"。
- 已生成时按钮文案为"重新生成 API Key",点击前二次确认。
- 生成成功弹窗展示完整 API Key 与复制按钮,提示"只展示一次"。
- 弹窗关闭后页面只保留前缀与生成时间。

### 验收

- 首次生成后页面弹出完整 API Key,刷新后不再显示完整 key。
- 重新生成后旧 key 访问 `/api/external/*` 失败,新 key 可访问。
- 管理员停用后,其 API Key 不能继续访问外部 API。
- 数据库和日志中不出现 API Key 明文。

## 远端配置

远端配置是扩展读取的**全局、稀疏、顶层 JSON 对象**。包内默认值编译期全量存在于扩展里，服务端只保存管理员实际填写的覆盖项，缺项由客户端回退包内默认值。

### 数据合同

- 存储复用 `system_data.data_key="remote_config"`，`data_value` 保存管理员提交的完整顶层对象；不新增表、字段或索引。
- 记录不存在时读取结果为 `{}`。Admin 首次打开因此显示空对象，不展示扩展包内默认值。
- 顶层允许缺少分组、缺少字段和出现未知键；后端原样保存和返回，不补默认、不裁剪、不排序、不按扩展版本拆分。
- 对象值允许任意 JSON value。后端与 Admin 只校验请求可解析为**非数组顶层对象**，不维护字段表单或扩展版本 schema。
- 管理员保存 `{}` 只表示取消全部远端覆盖。默认值、已知字段类型和未知字段消费由各版本扩展在客户端边界处理。
- 配置改动在客户端**重新加载页面后生效**；服务端不做推送、轮询或版本号。

### 接口

下列表格中的“响应”均指项目统一响应 envelope 的 `data`；配置对象直接作为 `data` 或请求体，不增加 `config` 包装。

| 方法 | 路径 | 鉴权 | 请求 | 响应 | 说明 |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/client/remote-config/config` | 无 | 无 | JSON object | 扩展每个 document 读取一次；记录不存在返回 `{}` |
| GET | `/api/admin/system-settings/remote-config` | `get_admin_user` | 无 | JSON object | Admin 读取当前稀疏对象 |
| POST | `/api/admin/system-settings/remote-config` | `get_admin_user` | JSON object | JSON object | 原样覆盖保存并返回已保存对象 |

接口边界：

- 公共接口无鉴权、无参数，只读取 `remote_config`，不返回其他 `system_data` 键。
- Admin GET/POST 沿用统一 admin JWT 鉴权；API 层可使用 `Depends(get_admin_user)`，不新增依赖注入。
- Admin POST 只有 JSON 解析和顶层对象判断。解析失败或顶层类型错误返回 `INVALID_REQUEST` 并回显实际类型，不增加配置专用错误码。
- 扩展读取失败时由客户端使用包内默认值；后端不做重试、降级对象、版本选择或旧值回滚。

### Admin 前端

- `SystemSettingsView.vue` 提供 `远端配置` tab；第一次进入该 tab 时读取一次，切换离开再返回不自动重复请求，读取失败时由管理员点击重试。
- 编辑器使用全宽 `NInput type="textarea"`，等宽字体，最小高度 360px。服务端返回 `{}` 时文本固定显示 `{}`；不注入客户端默认对象和字段清单。
- 保存只由显式按钮触发，不自动保存，保存中禁止重复提交。点击时解析当前文本，并且只判断结果是不是非数组顶层对象；通过后原样提交。
- JSON 解析或顶层对象错误在编辑器下方显示，按钮不发请求；保存失败保留当前文本，成功后保留当前文本并提示重新加载页面生效。
- 不自动格式化，不排序键，不删除未知键，不提供“恢复默认”、版本选择、历史或回滚。管理员需要清空全部覆盖时手工输入并保存 `{}`。
- 新增中英文 i18n 文案：tab 名、保存、保存成功、读取失败/重试、JSON 解析错误、顶层对象错误和重新加载页面生效提示。

### 实现文件

- `admin/src/api/system-settings.ts`
- `admin/src/views/SystemSettingsView.vue`
- `admin/src/i18n/zh-CN.json`
- `admin/src/i18n/en-US.json`
- `admin/e2e/system-settings.spec.ts`

### 验收

- `remote_config` 记录不存在时，公共接口和 Admin GET 都返回 `{}`。
- Admin 可保存只有一个键的对象；再次读取逐项相同，后端不补客户端默认键。
- Admin 可保存包含未知键、未来键或任意 JSON value 的对象；再次读取不丢失这些项。
- 非 JSON 和非对象顶层值不能保存；缺少已知字段、存在多余字段或已知字段类型异常不被逐字段拒绝。
- 公共接口无需用户或 admin 登录，且只能读取 `remote_config`；Admin 两个接口未登录时不可访问。
- Admin 保存 `{}` 后没有“恢复默认”语义，只表示远端不覆盖；各扩展版本继续使用各自包内默认值。
- 保存成功后，新打开或重新加载的 Vimeo 页面可读到新对象；已经打开的页面不热更新。
- 不存在扩展版本上报、按版本响应、配置历史、Redis、锁、轮询、WebSocket 或持久客户端缓存。


## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 系统设置 | `@backend/src/app/api/admin/admin_system_settings.py` | `@backend/src/app/services/admin_system_settings_service.py` |
| API Key | 同上 | `@backend/src/app/services/admin_api_key_service.py` |
| 远端配置 | `@backend/src/app/api/admin/admin_system_settings.py`, `@backend/src/app/api/client/remote_config_client.py` | `@backend/src/app/services/system_data_service.py` |
