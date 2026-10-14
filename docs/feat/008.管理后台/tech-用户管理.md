# 008 · 用户管理

> 用户管理菜单的接口与职责设计。界面和默认时间见 [产品需求的用户管理页](feat.md#用户管理页),订阅写入合同见 [人工设置与撤销权益](../006.订阅系统/tech-订阅商品与状态.md#人工设置与撤销权益)。实施跟踪见 [009 · 用户管理列表与订阅操作](plans/009.用户管理列表与订阅操作.md)。

## 边界

用户数据仍属用户域,权益和时间仍属订阅域。管理后台负责筛选、读取聚合与受控入口;通用用户信息弹窗保持只读。全部接口使用 `get_admin_user`,不接受客户端 JWT 或外部 API Key。

复用 `users`、`user_subscriptions` 和订阅商品配置,不改表、字段、索引或配置,不增加依赖、审计表、渠道退款或渠道取消接口。

## 接口

前缀 `/api/admin`,响应沿用 `{code,data,msg}`。列表排序、分页和交互见产品需求。

| 方法 | 路径 | 输入 | `data` |
| --- | --- | --- | --- |
| GET | `/users` | `user_id?: int >= 1`、`email?: string`、`page=1`、`page_size=20`(1 到 100) | `rows / total / page / page_size` |
| GET | `/users/{user_id}/subscription` | `user_id >= 1` | 设置表单默认值、自动续费限制、可选商品 |
| POST | `/users/{user_id}/subscription` | `product_id: string`、`expires_at: int \| null` | 保存后的订阅摘要 |
| POST | `/users/{user_id}/subscription/cancel` | 空请求体 | 撤销后的订阅摘要 |

列表行只返回界面使用的字段:用户 ID、邮箱、账号状态、注册时间、最后登录时间,以及 `subscription.product_id / period / has_subscription / expires_at`。不返回密码哈希、token 或登录凭据。账号状态与订阅摘要复用既有用户详情口径;保留已过期记录的原结束时间。

设置读取响应:

- `product_id`:默认选中的商品。
- `period`:默认商品的实例周期,当前有效订阅优先使用购买快照。
- `expires_at`:默认结束时间,有有效订阅时保留原始毫秒值。
- `is_auto_renew`:按既有实例续费快照、有效期及渠道取消事实计算,用于限制套餐选择。
- `products`:已启用付费商品的 `product_id / name / period`,按现有配置顺序返回;不依赖 checkout 是否有可用支付渠道。

当前有效商品未出现在启用目录时,单独展示当前商品 ID 和实例周期供原样保留,不把它加入可授予商品目录。商品配置异常时列表和取消仍可使用,设置读取返回现有配置错误。

设置请求的 `expires_at` 为毫秒时间戳。普通套餐必须传未来时间;终生套餐传 `null`,由订阅域决定保留当前时间或按终生规则开通,保存响应返回实际落库值。设置读取不计算额外的终生到期时间。

API/schema 负责类型、正数 ID、分页、邮箱清洗和时间输入校验;订阅域负责当前实例、商品可授予性、自动续费商品限制和写入语义。用户必须存在;不存在返回 `USER_NOT_FOUND`。无法授予的商品、普通套餐缺少未来时间、终生套餐传入自定义时间、有效自动续费用户切换商品均返回 `INVALID_REQUEST`,携带对应字段信息。鉴权和配置错误复用现有处理,不增加错误码。

## 查询与职责

- `UserService.user_lists` 增加独立的 `email_prefix`,保留订单查询正在使用的 `email_like` 包含匹配语义。前缀复用 `normalize_user_email`,并使用 SQLAlchemy `startswith(..., autoescape=True)`;数值条件继续使用 `user_ids` 数组。
- 增加 `count_users`,与列表复用同一个过滤方法。用户 ID 与邮箱前缀直接在同一查询中取交集,无条件时正常分页查询全部用户。
- `AdminUserProfileService` 扩展只读列表聚合:分页用户、同条件总数,再按当前页用户 ID 批量读取原始订阅。复用账号状态计算,不逐行查询、不加载 Credits、下载或订单。
- `SubscriptionService.subscription_lists` 按用户 ID 数组返回原始 Model 列表;`get_subscription_settings` 持有表单默认值和时间规则;`update_user_subscription` 原子设置权益,`cancel_user_subscription` 原子撤销权益。现有 seed 调用方同步使用带商品的设置合同。
- API 仍在 `admin_users.py` 内;写入直接调用订阅域,不让只读聚合 service 写业务数据。复用现有 router 注册,不新增管理 service 或跨端共享源码。

## 时间边界

默认时间由后端 `timestamp_now / add_natural_months` 计算,业务时区沿用 `America/New_York`。后台展示和输入固定按 UTC+8,与业务自然月计算的时区用途分开。

结束时间使用现有 `NInput` 编辑 `YYYY-MM-DD HH:mm:ss` 文本。用户修改后以平台 ISO 时间解析显式附加 `+08:00`,并用 `formatAdminTimeMs` 回格式化核对原文本,拒绝非法格式或被日期解析自动调整的值;不经过浏览器本地时区的日期控件。未修改时提交原始毫秒值,避免格式化到秒导致原结束时间变化。终生套餐的时间只读。

## 受影响文件

| 文件 | 责任 |
| --- | --- |
| `backend/src/app/api/admin/admin_users.py` | 列表、设置读取、设置和取消入口 |
| `backend/src/app/schemas/admin_user_schema.py` | 列表、设置表单、请求和响应类型 |
| `backend/src/app/services/user_service.py` | 前缀查询、共享过滤和计数 |
| `backend/src/app/services/admin_user_profile_service.py` | 只读用户列表聚合 |
| `backend/src/app/services/subscription_service.py` | 订阅批量读取、设置与撤销 |
| `backend/scripts/e2e_seed_user.py` | 适配现有设置方法调用 |
| `admin/src/views/UsersView.vue`(新增) | 查询、分页、订阅弹窗与取消确认 |
| `admin/src/api/users.ts` | 新增接口与严格类型 |
| `admin/src/router/index.ts`、`admin/src/layouts/AdminLayout.vue` | `/users` 路由和运营菜单 |
| `admin/src/i18n/zh-CN.json`、`admin/src/i18n/en-US.json` | 用户管理文案 |

复用 `FilterPanel / StatusPill / RecordCardList / UserInfoDialog / useViewport / formatAdminTimeMs`,不修改它们的共享行为。UI 尺寸、颜色、间距和动效沿用 [后台视觉基线](tech-视觉基线.md)。

## 验收

- ID 精确查询、邮箱字面前缀、同时输入取交集,分页与总数一致;既有订单邮箱包含匹配保持原语义。
- 设置读取遵循产品需求的默认规则,无需前端计算自然月;普通时间保持毫秒精度,终生时间由后端决定。
- 设置、有效自动续费限制、终生规则和本地取消均遵循订阅域合同;重新读取列表、既有 profile 和客户端权益确认真实生效。
- 设置和取消都要求有效管理员身份;参数错误、缺少用户与保存失败可正常报错并重试。
- 真实本地后端与数据库验证全部新增 API;浏览器验证查询、编辑、取消确认、中英文和响应式布局,禁止 API mock。

SQLAlchemy 前缀与字面转义语义已对照本地安装包的官方 API 文档核实,参考 [ColumnOperators.startswith](https://docs.sqlalchemy.org/en/20/core/sqlelement.html#sqlalchemy.sql.expression.ColumnOperators.startswith)。
