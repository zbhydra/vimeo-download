# 008 · 订单管理

> 覆盖订单管理菜单的只读查询接口。通用 admin 接口约定见 `@tech-管理模块接口.md`,订单数据与状态机属 `@../004.订单系统/feat.md`。

## 范围

订单数据与状态机属订单域,本域只提供只读查询接口,不做任何写操作。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/orders` | `get_admin_user` | 分页 + 多条件筛选订单列表 |
| GET | `/api/admin/orders/{order_no}` | `get_admin_user` | 订单详情(含支付原始数据) |

`GET /orders` Query:`page`(默认 1)、`page_size`(默认 50,最大 100)、`order_no_like`(包含匹配)、`user_id`(精确)、`email`(用户当前邮箱,trim + 小写,包含匹配)、`payment_channel_order_no_like`(包含匹配)、`order_status`、`fulfillment_status`、`product_id`、`payment_method`、`created_from_ms` / `created_to_ms`(毫秒时间戳,均可选)。

用户当前邮箱搜索分两步:先按 `lower(email) LIKE %keyword%` 查出 user_id 集合,再按 `user_id IN (...)` 查订单;同时输入用户 ID 时取交集,交集为空直接返回空。该字段是用户表当前邮箱,不是下单时快照。订单查询与计数复用同一套 WHERE 条件,避免 client / admin 各写一套。

列表与详情不得返回用户密码、token、验证码等登录敏感信息。`payment_data` / `extra_metadata` 坏 JSON 时详情展示原始字符串或解析失败提示,不影响页面。订单状态 / 履约状态使用整数枚举,具体值与展示文案属订单域。

## 前端联动

订单列表用户列和订单详情抽屉用户项接入通用用户信息弹窗,点击用户 ID 打开弹窗。弹窗本身的接口、字段、下载记录分页和订单分页见 `@tech-用户信息弹窗.md`。订单接口仍只负责订单只读查询,不内嵌用户详情。

## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 订单 | `@backend/src/app/api/admin/admin_orders.py` | `@backend/src/app/services/order_service.py`(扩展筛选 + 计数 + 详情)、`@backend/src/app/services/user_service.py`(当前邮箱查询) |
