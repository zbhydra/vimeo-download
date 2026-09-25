# 008 · 外部 API

> 覆盖使用管理员 API Key 访问的独立外部 API 分组。API Key 的生成 / 轮换见 `@tech-系统设置.md`,后台 admin JWT 与节点 JWT-only 边界见 `@tech-后台架构与认证.md`。

## 定位

外部 API 是给第三方系统或自动化脚本读取后台数据的接口组。它不属于浏览器后台管理接口,不使用 admin Access Token / Refresh Token,也不使用节点本地 JWT-only 鉴权。

## 通用约定

- 路由前缀:`/api/external`。
- 挂载角色:只在 business role 挂载,download role 不挂载。
- 鉴权方式:`Authorization: Bearer <api_key>`。
- API Key 来源:管理员在系统设置页生成;数据库只保存 hash、前缀和生成时间。
- 鉴权依赖:新增 `get_external_api_admin()` 或同等命名的依赖,只负责校验 API Key hash、管理员存在且启用。
- 响应结构沿用 `{ code, data, msg }`,`code == 10000` 为成功。
- 外部 API 只用 GET / POST。
- 外部 API 不接受 admin JWT,不提供登录 / refresh,不调用 `get_admin_user()` 或 `get_admin_jwt_only()`。
- 外部 API 不代理任意 URL,只聚合本系统已登记节点的数据。

## 系统统计大盘

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/external/system/dashboard` | API Key | 返回系统统计大盘 |

响应 `data`:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `today_registered_count` | int | 今日注册人数 |
| `today_paid_order_amounts` | array | 今日付费订单总额,按币种分组 |
| `today_recharge_amounts` | array | 兼容旧调用方字段,值同 `today_paid_order_amounts` |
| `today_fulfillment_failed_count` | int | 今日履约失败订单数,重点展示 |
| `today_fulfillment_failed_amounts` | array | 今日履约失败订单金额,按币种分组,重点展示 |
| `nodes` | array | 当前节点列表 |

`today_paid_order_amounts` / `today_recharge_amounts` / `today_fulfillment_failed_amounts` 每项:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currency` | string | 币种 |
| `amount` | int | 6 位精度整数金额 |
| `display_amount` | string | 十进制展示金额字符串 |

`nodes` 每项:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `node_id` | int | 节点 ID |
| `name` | string | 节点名字 |
| `network_rate` | object \| null | 节点下载 / 上传速率 |
| `error` | string | 读取该节点本地信息失败时的错误摘要,成功为空字符串 |

`network_rate`:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rx_bytes_per_second` | int | 节点入站速率,按现有监控口径 |
| `tx_bytes_per_second` | int | 节点出站速率,按现有监控口径 |
| `sampled_at` | int | 采样时间 Unix 秒 |

## 统计口径

- 今日边界使用运营统计时区 `UTC+8` / `Asia/Shanghai` 自然日,与现有 Dashboard 口径保持一致。
- 今日注册人数:统计未注销用户今日创建数量。
- 今日付费订单总额:统计今日已支付且履约成功或履约失败的所有商品订单,按 `currency` 分组汇总,不同币种不混加。
- 今日履约失败:在今日付费订单统计口径内额外筛选 `callback_status = FAILED`,返回失败订单数量和按币种分组的失败金额。
- `today_recharge_amounts` 是历史字段名,为避免外部调用方立刻改字段,当前值与 `today_paid_order_amounts` 完全一致。
- 金额使用订单系统 6 位精度整数金额口径;展示金额只在响应边界转换为字符串。
- 当前节点列表来自业务库 `service_nodes`,包含启用和停用节点,按节点 ID 正序。
- 节点下载 / 上传速率来自节点本机监控快照。

## 节点读取规则

外部 API 由业务服务器聚合节点数据:

1. 读取 `service_nodes` 列表。
2. 对每个节点按 `internal_base_url` 请求节点内部快照接口。
3. 节点内部快照接口走 `/internal` 前缀,业务服务器并发请求各节点并携带内部共享凭证,不接受外部 API Key 或 admin JWT。
4. 单节点请求失败时,该节点保留在结果里并写 `error`。

新增节点内部快照接口:

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/internal/service-node/dashboard-snapshot` | 校验内部共享凭证后返回当前节点本机网络速率 |

内部快照响应:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `network_rate` | object \| null | 当前节点网络速率 |

边界:

- 外部 API Key 只到业务服务器,不透传给下载节点。
- 不复用 `/api/admin/node-monitor/network-rate`，因为那组接口的鉴权是 admin JWT / 节点 JWT-only。
- `/internal/service-node/dashboard-snapshot` 不读业务数据库,可在 business / download role 上挂载。
- `/internal/service-node/dashboard-snapshot` 使用 `service_node.internal_auth_token`;未配置或凭证错误时拒绝访问。部署层内网隔离仍作为额外边界。

## 错误处理

- API Key 缺失、格式错误、hash 不匹配、管理员停用:返回鉴权失败。
- 数据库统计失败:整个接口失败。
- Google 快照 JSON 损坏:整个接口失败,调用方稍后重试或管理员修复数据。
- 单个节点读取失败:该节点保留在 `nodes` 中,`network_rate=null`,`error` 写失败摘要,其他节点继续返回。
- 不做自动重试;调用方可稍后重试。

## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 外部 API 鉴权 | `@backend/src/app/api/external_dependencies.py` | `@backend/src/app/services/admin_api_key_service.py` |
| 系统统计大盘 | `@backend/src/app/api/external/external_system_dashboard.py` | `@backend/src/app/services/external_system_dashboard_service.py` |
| 节点内部快照 | `@backend/src/app/api/internal/service_node_dashboard_snapshot.py` | 复用 `monitor_service` |
