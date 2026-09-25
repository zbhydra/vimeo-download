# 008 · 通用用户信息弹窗

> 覆盖管理后台内复用的客户端用户信息只读弹窗。通用 admin 接口约定见 `@tech-管理模块接口.md`;用户账号数据属 `@../007.用户系统`,Credits 属 `@../003.积分系统`,订阅属 `@../006.订阅系统`,下载记录属 `@../002.下载功能`,订单属本域订单管理。本文只描述 admin 侧聚合读取和前端复用入口。

## 范围

### 包含

- 后台内展示的非空 `user_id` 都可作为入口打开同一个用户信息弹窗。
- 用户基础信息:ID、邮箱、注册来源、注册方式、注册 IP(归属地)、最后登录 IP(归属地)、最后一次操作 IP(归属地)、注册时间、最后登录时间、登录次数、账号状态。
- 权益信息:当前 Credits 余额、是否有有效订阅、订阅过期时间。
- 下方 tabs:「最近下载」「积分记录」和「订单列表」。
  - 最近下载数据源为 `user_download_records`,远程分页,无筛选。
  - 积分记录数据源为 `user_credit_logs`,按流水 ID 倒序远程分页,无筛选。
  - 订单列表数据源为 `orders`,远程分页,不筛选状态,成功/失败/待支付/取消/过期等所有订单都展示。
- 管理后台所有展示时间统一格式为 `YYYY-MM-DD HH:mm:ss`,按固定 UTC+8 展示,不使用浏览器 locale 默认格式。

### 不包含

- 用户编辑、封禁、删除、改邮箱、代充、人工改订阅。
- 风控记录、extension 下载历史。
- 最近下载筛选、导出、下载详情日志联动。
- 打开弹窗时用 IP 实时 GeoIP 查询。IP 归属地只读 `users` 表已有国家 / 地区字段。

## 已裁决方案

采用「聚合 profile 接口 + 各 tab 独立分页接口 + 前端复用弹窗组件」:

- `GET /api/admin/users/{user_id}/profile` 读取用户基础信息、Credits 余额、订阅摘要。
- `GET /api/admin/users/{user_id}/downloads` 分页读取 `user_download_records`。
- `GET /api/admin/users/{user_id}/credits` 按流水 ID 倒序分页读取 `user_credit_logs`。
- `GET /api/admin/users/{user_id}/orders` 分页读取该用户全部订单。
- 前端新增 `UserInfoDialog.vue`,各页面在展示用户 ID 的位置调用弹窗 `open(userId)`。

未采用方案:

- 把最近下载和订单列表塞进 profile 接口:分页会让 profile 响应和 tab 状态耦合,后续 tabs 扩展更难维护。
- 在订单详情接口内附带用户信息:只能服务订单页,无法覆盖数据分析和下载排名。
- 打开弹窗实时查 GeoIP:增加依赖和不稳定外部行为,且与需求确认的「ip(归属地)」现有字段展示不一致。

## 数据口径

### 用户基础信息

来源 `users`:

| 字段 | 说明 |
| --- | --- |
| `user_id` | 用户 ID |
| `email` | 当前邮箱 |
| `full_name` / `avatar_url` | 当前资料字段,可为空 |
| `register_source` | 注册来源,例如 website / extension |
| `register_method` | 首次注册方式,例如 google / email_code |
| `register_ip` + `register_country` | 注册 IP(归属地) |
| `last_login_ip` + `last_login_country` | 最后登录 IP(归属地) |
| `last_operation_ip` + `last_operation_country` | 最后一次操作 IP(归属地) |
| `created_at` / `updated_at` / `last_login_at` | 毫秒时间戳 |
| `login_count` | 登录次数 |
| `is_del` | 账号是否已注销 |

展示规则:

- IP 和归属地成对展示为 `ip (country)`,IP 或国家缺失时缺失部分显示 `-`,两者都缺失时整项显示 `-`。
- `is_del=true` 显示已注销;否则显示正常。
- 用户不存在返回业务错误,前端 toast 后保留错误态,不伪造用户信息。

### Credits

来源 `user_credit_accounts`,通过 `user_credit_service.get_balance(user_id)` 读取。账户不存在返回 0。

### 订阅

来源 `user_subscriptions` 原始行:

- `has_subscription = expires_at is not None and expires_at > now_ms`。
- `expires_at` 返回原始过期时间;从未订阅时为 `null`;已过期时 `has_subscription=false` 但仍显示历史过期时间。
- 不读取订阅商品配置,避免配置异常影响用户详情排查。

### 最近下载

来源 `user_download_records`:

| 字段 | 说明 |
| --- | --- |
| `id` | 下载记录 ID |
| `resource_key` | website 下载资源指纹 |
| `platform` | 平台 |
| `canonical_link` | 规范化链接 |
| `source_id` | 资源 ID |
| `filename` | 文件名,可为空 |
| `size_bytes` | 文件大小,可为空 |
| `credits_cost` | 本次实际扣除 Credits,免扣重复为 0 |
| `created_at` | 下载记录创建时间 |

排序:按 `created_at desc, id desc`。分页参数 `page` 默认 1,`page_size` 默认 20,最大 100。

### 积分记录

来源 `user_credit_logs`:

| 字段 | 说明 |
| --- | --- |
| `id` | 流水 ID |
| `change_amount` | Credits 变化量,正数为获得,负数为消耗 |
| `reason` | 变动原因;已知原因显示本地化名称,未知原因显示原值 |
| `resource_key` | website 下载资源指纹,非下载流水可为空 |
| `metadata_json` | 业务扩展 JSON 快照,可为空 |
| `created_at` | 流水创建时间 |

排序只按 `id desc`;流水 ID 的递增顺序即写入顺序。分页参数 `page` 默认 1,`page_size` 默认 20,最大 100。

### 订单列表

来源 `orders`,复用订单管理列表的只读字段和状态口径:

- 只按 `user_id` 过滤,不提供状态、商品、支付方式等筛选。
- 展示全部订单状态和全部履约状态,包括成功、失败、未回调、超过重试等。
- 排序按 `created_at desc, id desc`;分页参数 `page` 默认 1,`page_size` 默认 20,最大 100。

## 接口

所有接口前缀 `/api/admin`,鉴权 `get_admin_user`,只读 GET。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users/{user_id}/profile` | 用户基础信息 + Credits + 订阅摘要 |
| GET | `/api/admin/users/{user_id}/downloads` | 用户最近下载分页 |
| GET | `/api/admin/users/{user_id}/credits` | 用户积分记录分页,按流水 ID 倒序 |
| GET | `/api/admin/users/{user_id}/orders` | 用户订单分页,全状态 |

### Profile 响应

```jsonc
{
  "user": {
    "user_id": 123,
    "email": "user@example.com",
    "full_name": "",
    "avatar_url": "",
    "register_source": "website",
    "register_method": "google",
    "register_ip": "1.2.3.4",
    "register_country": "US",
    "last_login_at": 1780000000000,
    "last_login_ip": "1.2.3.4",
    "last_login_country": "US",
    "last_operation_ip": "5.6.7.8",
    "last_operation_country": "SG",
    "login_count": 3,
    "is_del": false,
    "created_at": 1780000000000,
    "updated_at": 1780000000000
  },
  "credits": {
    "balance": 88
  },
  "subscription": {
    "has_subscription": true,
    "expires_at": 1782000000000
  }
}
```

### Downloads 响应

```jsonc
{
  "rows": [
    {
      "id": 10,
      "resource_key": "0123456789abcdef0123456789abcdef",
      "platform": "x",
      "canonical_link": "https://x.com/...",
      "source_id": "123",
      "filename": "video.mp4",
      "size_bytes": 1048576,
      "credits_cost": 1,
      "created_at": 1780000000000
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

### Orders 响应

响应结构与订单管理列表行一致,外层分页结构如下:

```jsonc
{
  "rows": [
    {
      "id": 1,
      "order_no": "ORD...",
      "user_id": 123,
      "user_email": "user@example.com",
      "product_class": 1,
      "product_id": "unlimited",
      "product_name": "Unlimited",
      "amount": 9900000,
      "currency": "USD",
      "order_status": 2,
      "callback_status": 3,
      "payment_method": "paypal",
      "payment_data": {},
      "payment_channel_order_no": "P-xxx",
      "payment_channel_uid": "",
      "paid_amount": 9900000,
      "paid_currency": "USD",
      "created_at": 1780000000000,
      "updated_at": 1780000000000,
      "paid_at": 1780000000000,
      "expired_at": 1780001800000,
      "client_ip": "1.2.3.4",
      "extra_metadata": {}
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

### Credits 响应

```jsonc
{
  "rows": [
    {
      "id": 12,
      "change_amount": -2,
      "reason": "download_charge",
      "resource_key": "0123456789abcdef0123456789abcdef",
      "metadata_json": "{\"platform\":\"vimeo\"}",
      "created_at": 1780000000000
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

## 后端实现

新增:

```text
backend/src/app/api/admin/admin_users.py
backend/src/app/services/admin_user_profile_service.py
backend/src/app/schemas/admin_user_schema.py
```

修改:

```text
backend/src/app/main.py
```

实现规则:

- API 层校验 `user_id >= 1`、`page >= 1`、`1 <= page_size <= 100`。
- service 为类 + 模块级实例 `admin_user_profile_service = AdminUserProfileService()`,不使用 `@singleton`,不新增依赖注入。
- profile 聚合允许读取多个业务域,但只读不写。
- downloads 查询用 `WHERE user_id = ? ORDER BY created_at DESC, id DESC OFFSET ? LIMIT ?`;count 与列表复用同一用户条件。
- credits 查询用 `WHERE user_id = ? ORDER BY id DESC OFFSET ? LIMIT ?`;count 与列表复用同一用户条件。
- orders 查询复用订单 service,仅传 `user_ids=[user_id]`,不传任何状态过滤。
- 不新增索引。`user_download_records` 已有 `idx_user_download_resource(user_id, resource_key)`,其最左前缀可服务按用户过滤;`user_credit_logs` 保持无索引。两个接口都是 admin 低频分页排查,可接受按用户查询的开销。
- 不新增数据表和 model 字段,不执行 schema 同步。

## 前端实现

新增:

```text
admin/src/api/users.ts
admin/src/components/UserInfoDialog.vue
admin/src/utils/time.ts
```

修改:

```text
admin/src/views/OrdersView.vue
admin/src/views/AnalyticsView.vue
admin/src/views/TgClientView.vue
admin/src/i18n/zh-CN.json
admin/src/i18n/en-US.json
```

组件规则:

- `UserInfoDialog.vue` 内部持有 profile loading、downloads/credits/orders loading、三个 tab 的分页状态。
- 暴露 `open(userId: number): void`;每次打开重置三个分页为 1,加载 profile + 当前 tab 第一页数据。
- modal 使用 `NModal preset="card"` 或同等 Naive UI 组件,宽度 `min(960px, calc(100vw - 32px))`。
- 上半部分为基础信息和权益信息;下半部分为 `NTabs`:「最近下载」「积分记录」「订单列表」。
- 下载表格远程分页,列为平台、链接、source ID、文件名、文件大小、扣除 Credits、时间。
- 积分表格远程分页,列为变动时间、积分变动、变动原因、资源 Key、详情;正数显示 `+` 前缀,未知原因显示原值。
- 订单表格远程分页,列为订单号、商品、金额、订单状态、履约状态、支付方式、创建时间。
- 所有用户可见文案走 `userInfo.*` i18n。
- 所有时间展示调用 `admin/src/utils/time.ts`,固定输出 `YYYY-MM-DD HH:mm:ss` UTC+8。
- 用户 ID 入口使用按钮或链接样式,有 hover / focus 可见反馈;点击不影响行内复制、查看详情等其他按钮。

接入点:

| 页面 | 位置 |
| --- | --- |
| 订单管理 | 订单列表用户列、订单详情抽屉用户项 |
| 数据分析 | 下载排名 tab 的用户 ID 列 |
| 服务节点 | 节点当前使用明细里的用户 ID 列 |

## 异常与空态

- profile 加载失败:弹窗显示错误状态并 toast,不让页面崩溃。
- downloads/credits/orders 加载失败:保留 profile,当前 tab 显示错误 toast 和空表或上次数据。
- 用户无下载记录:下载 tab 显示空态。
- 用户无积分记录:积分 tab 显示空态。
- `size_bytes=null`、时间为空、链接为空:显示 `-`。
- `user_id=null` 的位置不渲染入口,显示 `-`。

## 验证

后端:

```bash
cd backend
uv run black src/app/api/admin/admin_users.py src/app/services/admin_user_profile_service.py src/app/schemas/admin_user_schema.py tests/test_server/api/test_admin_user_profile_api.py
uv run ruff check src/app/api/admin/admin_users.py src/app/services/admin_user_profile_service.py src/app/schemas/admin_user_schema.py tests/test_server/api/test_admin_user_profile_api.py
uv run mypy src/app/api/admin/admin_users.py src/app/services/admin_user_profile_service.py src/app/schemas/admin_user_schema.py
uv run pytest tests/test_server/api/test_admin_user_profile_api.py
```

前端:

```bash
cd admin
pnpm build
pnpm test:e2e -- orders.spec.ts
```

人工:

- 订单管理、数据分析下载排名的用户 ID 都能打开同一个弹窗。
- 弹窗展示 IP(归属地)、Credits、订阅状态;下载 tab 和订单 tab 可分页。
- 字段缺失、无下载记录、用户不存在不导致页面崩溃。
