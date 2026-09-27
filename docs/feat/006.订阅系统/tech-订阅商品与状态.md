# 006 · 订阅商品与状态

> 订阅领域稳定技术合同。覆盖商品计费模式、渠道价格、用户当前订阅、状态计算与订单履约。
> 关联:`@tech-额度与速率档位.md` `@tech-好评赠送订阅.md` `@../011.Pricing页/tech-pricing与自动续费.md` `@../011.Pricing页/tech-实现与配置.md`

## 范围

一个用户只保存一份当前订阅,`user_subscriptions.user_id` 为主键。套餐或周期变化属于同一订阅的变化,不引入多份并行订阅。本项目配置 `free` / `unlimited`(月) / `unlimited_quarter`(季) / `unlimited_lifetime`(终生);`unlimited_year`(年) 已停售,商品保留用于存量权益。派生项目可增加其他 `product_id`,无需修改表结构或增加产品专用业务分支。

订阅域不提供升级、降级、补差价、按比例抵扣、待生效变更或客户端站内取消。普通重复购买由下单前的有效订阅检查拦截;极少数并发或跨渠道重复付款由支持处理,不增加数据库锁或独立状态机。

## 商品与渠道价格

### config_subscription_product

商品定义同一时刻唯一的销售模式、周期、默认展示价和权益。不同周期使用不同 `product_id`,不在同一商品内提供模式或周期选项:

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | `BIGINT` | 主键 |
| `product_id` | `VARCHAR(64)` | 商品标识,业务唯一 |
| `name` | `VARCHAR(128)` | 商品展示名 |
| `period` | `VARCHAR(16)` | 非空,默认 `none`;允许 `none / month / quarter / year / lifetime`,`lifetime` 为终生一次性购买,按 2400 个自然月履约 |
| `duration_days` | `INT` | 已废弃;仅用于旧版本回滚兼容,新代码不得读取 |
| `auto_renew` | `TINYINT(1)` | 非空,默认 `0`;当前销售模式,运营切换的唯一入口 |
| `display_currency` | `VARCHAR(8)` | 非空,默认 `USD`;商品卡默认展示币种 |
| `display_amount` | `BIGINT` | 非空,默认 `0`;商品卡默认展示金额,6 位精度 |
| `enabled` | `TINYINT(1)` | 是否启用 |
| `sort_order` | `INT` | 展示顺序 |
| `metadata` | `TEXT` | 权益扩展配置 JSON,可空 |
| `created_at / updated_at` | `BIGINT` | 毫秒时间戳 |

`period=none` 只用于 Free 等不可购买商品;checkout 不返回这类商品。启用的付费商品使用 `month / quarter / lifetime`;`year` 已停止新购,商品与历史周期解析保留,存量权益仍可读取。`duration_days` 仅为本次上线保留旧版本数据库兼容性,不属于业务配置;一次性权益按商品 `period` 增加自然月,自动续费权益只使用 Provider 真实账期。确认无需回滚旧版本后删除该列。

`metadata` 只保存权益扩展配置,不得重复保存 `auto_renew`。支持字段:

| 字段 | 语义 |
| --- | --- |
| `daily_limit` | 插件每日下载额度;`-1` 表示不限次数 |
| `extension_daily_download_limit` | 插件每日下载额度兼容字段 |



### config_subscription_product_price

每行价格只表达一个商品在一个支付渠道的实际结算配置:

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | `BIGINT` | 主键,渠道价格 ID |
| `product_id` | `VARCHAR(64)` | 商品 ID |
| `channel_code` | `VARCHAR(32)` | 支付渠道 |
| `auto_renew_supported` | `TINYINT(1)` | 非空,默认 `0`;是否允许该商品按自动续费模式使用此渠道 |
| `currency` | `VARCHAR(8)` | 渠道币种 |
| `amount` | `BIGINT` | 渠道金额,6 位精度 |
| `provider_sku` | `VARCHAR(128)` | 渠道商品、Plan 或 Price 标识,可空 |
| `enabled` | `TINYINT(1)` | 是否允许下单 |
| `created_at / updated_at` | `BIGINT` | 毫秒时间戳 |

唯一约束为 `(product_id,channel_code)`;同一商品和渠道只能有一条价格配置。价格行不保存 `auto_renew / period`,也不表达独立购买选项。

商品、支付渠道和价格行都必须启用。商品为一次性模式时,金额、币种合法即为可用,`auto_renew_supported` 与 `provider_sku` 被忽略。商品为自动续费模式时,渠道是否可用只由价格行 `auto_renew_supported=1` 决定。

`provider_sku` 是可空的 Provider 私有配置，通用配置层不解释其格式。PayPal 与 Clink 在创建自动续费支付时分别校验 Plan ID 与 `<productId>:<priceId>`；配置缺失或非法时由 Provider 返回明确下单错误。

商品卡使用 `display_currency / display_amount`;支付弹窗选择渠道后使用价格行 `currency / amount`。两者用途不同,渠道金额不反推商品默认展示价。



## 用户当前订阅

`user_subscriptions` 保存用户当前权益和购买实例事实:

| 字段 | 类型 | 可空 / 默认 | 语义 |
| --- | --- | --- | --- |
| `user_id` | `BIGINT` | 不可空,主键 | 用户 ID |
| `product_id` | `VARCHAR(64)` | `NULL` | 当前权益商品 |
| `product_price_id` | `BIGINT` | `NULL` | 当前生效的本地渠道价格;不建外键 |
| `auto_renew` | `TINYINT(1)` | `NULL` | 购买时的续费方式快照;取消后不改写 |
| `period` | `VARCHAR(16)` | `NULL` | 商业周期快照 |
| `payment_method` | `VARCHAR(32)` | `NULL` | 当前订阅支付渠道 |
| `original_order_no` | `VARCHAR(32)` | `NULL` | 自动续费协议的本地首单 |
| `channel_subscription_id` | `VARCHAR(256)` | `NULL` | 渠道订阅协议或取消句柄 |
| `channel_uid` | `VARCHAR(64)` | `NULL` | 渠道付款用户标识 |
| `start_at` | `BIGINT` | `NULL` | 最近一次成功推进的账期开始时间,仅供展示,不参与业务判断 |
| `cancelled_at` | `BIGINT` | `NULL` | 本站最近一次确认渠道停止后续扣款的时间,毫秒时间戳 |
| `expires_at` | `BIGINT` | 可空 | 本地最终权益到期时间,可包含赠送时长 |
| `created_at / updated_at` | `BIGINT` | 不可空 | 毫秒时间戳 |

历史有效行的实例字段允许全部为 `NULL`,读取时映射为 `unlimited / month / auto_renew=false`;不回填历史订单,不重算或修改原 `expires_at`。

新的一次性购买显式写入 `product_id / product_price_id / auto_renew=0 / period / payment_method / expires_at`,渠道协议与账期字段为空。新的自动续费购买写入完整购买实例、渠道协议和真实账期。纯赠送权益写入对应 `product_id / expires_at`;对仍有效的购买实例保留渠道事实,对已过期实例清空旧购买状态。

`expires_at` 是订阅时间的唯一业务真相。有效性、自动续费推进、跨渠道替换和回调先后都只比较该字段;`start_at` 只展示最近一次成功推进的账期开始,不得参与条件判断。状态按当前实例计算:

| 状态字段 | 计算口径 |
| --- | --- |
| `auto_renew` | `expires_at > now` 且实例 `auto_renew=1` 且 `cancelled_at` 为空;实例值为 `NULL` 时按 false |
| `cancel_at_period_end` | `expires_at > now` 且实例 `auto_renew=1` 且 `cancelled_at` 不为空;实例值为 `NULL` 时按 false |
| `cancel_available` | `auto_renew=true` 且 `payment_method/channel_subscription_id` 完整 |

`cancelled_at` 是本站最后确认的取消结果,不是渠道实时状态。重复投递旧付款事件不得清空它;只有已验证的新付款把 `expires_at` 推进到更晚时间时才清空。

无有效订阅时返回 Free 权益且不写入 Free 订阅行。权益商品配置异常时,账户摘要和插件状态接口仍返回成功响应,订阅状态为 `unavailable`;已确认处于首日的作用域仍返回不限次额度,其余额度按 0 返回,不阻断登录、Credits 或插件初始化。

## 订单履约

订阅购买统一走 `orders`。创建订单前按 `(product_id,channel_code)` 读取渠道价格,并校验请求 `auto_renew / period` 仍等于商品当前值。二者是防止用户确认后配置发生变化的陈旧同意保护,不是价格身份。`orders.extra_metadata.product_snapshot` 保存商品模式、周期和渠道价格快照:

| 字段 | 语义 |
| --- | --- |
| `product_price_id` | 本地渠道价格 ID |
| `auto_renew` | 商品下单时的销售模式 |
| `period` | 商品下单时的商业与一次性权益周期 |
| `currency / amount` | 下单金额快照 |
| `provider_sku` | 渠道商品标识 |

配置变化不影响已创建订单的履约。

- 一次性购买按快照 `period` 从当前有效 `expires_at` 或履约时间增加自然月,并显式写入一次性实例字段;`lifetime` 属于一次性购买,按 2400 个自然月履约,用超长有限期表达无限期。自然月由应用层业务时区工具计算,不依赖 MySQL 命名时区表。
- 当前有效订阅为 `lifetime` 时,后到账的有限周期订单仍按正常订单流程完成,但不覆盖当前终生订阅记录;商品身份、周期与 `expires_at` 保留。
- 自动续费只按 Provider 归一化后的 `provider_subscription.expires_at` 推进权益。PayPal 使用订阅查询返回的下次扣款时间；Clink 使用 Subscription 的 `recurringInvoiceItem.periodEnd`。各 Provider 可同时提供仅供展示的 `start_at`。
- 自动续费只在渠道确认的到期时间晚于当前 `expires_at` 时更新整条当前订阅并清空 `cancelled_at`;重复或更早的回调不改变订阅。订单渠道流水负责同一扣款的履约幂等,不再维护第二个账期游标。
- 好评赠送按活动合同在到期时间上增加 7 天:有效权益保留原商品身份与渠道字段(商品、价格行、续费方式、渠道订阅 ID、取消状态不变),已过期或无记录时从本次执行时间起算默认 Unlimited,不覆盖仍有效购买实例的渠道账期。

Checkout 只返回 `period != none` 且至少有一个可用支付渠道的启用商品;没有任何可用渠道的商品不进入 checkout 目录。权益查询不受此过滤影响,继续独立读取启用商品。

订阅订单创建前读取用户当前状态;存在未过期 `expires_at` 时拒绝新的普通订阅订单。并发 checkout、支付回调或补偿仍由订单 CAS 与履约事务收敛,不增加订阅专用锁。

## 接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/client/subscription/checkout-configs` | 可选鉴权,返回可购买商品、当前模式与周期、默认展示价、可用渠道价格和好评赠送活动开关与资格状态位 |
| `GET /api/client/subscription/status` | 插件兼容订阅状态,支持匿名设备 |
| `POST /api/client/subscription/review-reward/claim` | 登录账号领取好评赠送订阅,强制携带设备标识 |
| `POST /api/client/subscription/management` | 登录账号创建当前有效自动续费订阅的渠道管理入口,请求体为空;响应 URL 为空表示客户端使用渠道内指引 |
| `GET /api/client/auth/me` | website 登录账户摘要,包含 Credits 与订阅状态 |

好评赠送的活动开关、领取事实表、并发控制与失败语义见 `@tech-好评赠送订阅.md`。Pricing 页面消费规则见 [`011 · Pricing 页与订阅配置`](../011.Pricing页/tech-pricing与自动续费.md)。

## 插件内购买视图（extension popup）

extension popup 的内嵌购买视图与 website pricing 支付弹窗消费**同一套后端合同**（`@../004.订单系统/tech-支付与履约.md`），协议逻辑与 website-shared 的 pricing / checkout 控制器同源，字段不增不减：

- **商品配置**：`GET /api/client/subscription/checkout-configs`（匿名可访问）。客户端逐套餐运行时校验（订阅类 `product_class=1`、`period` 白名单、渠道价格字段齐全），过滤半升级或历史坏数据的套餐；展示价与渠道金额原样传递，前端不做任何价格计算。
- **下单**：`POST /api/client/order/create`，请求携带所选渠道的 `payment_method / currency / amount` 与商品的 `product_class / product_id / auto_renew / period`；默认渠道优先级与官网一致（clink → paypal，均无时取配置首个）。
- **收银台跳转**：从 `payment_data` 提取支付 URL 并做域名白名单兜底校验（paypal 限官方域名、clink 限渠道收银台域名，未知支付方式不接受任何外跳地址），新标签页打开收银台；URL 缺失或白名单外按下单失败收敛，不外跳。
- **订单轮询**：`GET /api/client/order/status/{order_no}`，2 秒间隔、最长 10 分钟；状态归类与 website-shared 逐行同源（`PAID+SUCCESS` 成功、`PAID+FAILED/MAX_RETRY` 履约失败、`EXPIRED` 过期、`CANCELLED` / `REFUNDED` 取消或失败，其余继续轮询），轮询超时按可重试失败收敛，用户可重新发起。
- **错误收敛**：价格已更新（`21005`）重新拉取商品配置整体刷新；订单不存在 / 已过期（`20001` / `20003`）提示重新下单；网关失败 / 支付方式未实现（`21001` / `21004`）按下单失败提示。未登录先经 popup 登录弹窗完成登录（登录门控复用既有弹窗，见 `@../007.用户系统/feat.md`）。
- **管理订阅**：用户菜单（仅有效订阅时出现）调 `POST /api/client/subscription/management` 创建渠道管理入口并外跳；响应 URL 为空（一次性买断等非自动续费订阅）时明确提示不可管理，不静默失败。

订阅管理由订阅域读取当前记录并通过统一 Payment Provider 能力处理。Clink 使用 `channel_uid` 对应的 `customerId` 创建 Customer Portal Session；PayPal 返回固定官方 Automatic Payments 页面。业务层和客户端不按渠道分支。

## 自动续费运维

支持人员可在 `backend/` 目录按本地订单号查询或取消渠道自动续费:

```text
uv run python scripts/query_order_auto_renew.py [order_no]
uv run python scripts/cancel_order_auto_renew.py [--yes] [order_no]
```

- 省略 `order_no` 时由终端交互输入;取消脚本默认要求再次输入 `CANCEL`,`--yes` 只供明确的自动化操作使用。
- 脚本只接受订阅订单。一次性订阅订单返回非自动续费;其他商品类别直接报错。
- PayPal 从订单支付数据提取 Billing Subscription ID,通过 Subscriptions API 查询或取消。
- 取消只停止渠道后续扣款,不修改历史订单、不退款、不修改当前 `expires_at`。
- 历史订单使用对应渠道的最新凭据;渠道配置被删除时直接报错。
