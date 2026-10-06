# 004 · 支付与履约(渠道对接 + webhook 回调 + 价格校验与快照 + 履约事务 + 补偿重试 + 错误码)

> 技术实现文档。覆盖:支付渠道配置、provider 接口、PayPal Standard Checkout 与 Clink 支付、下单价格校验与订单快照、履约事务编排、履约失败补偿 cron、webhook 注册部署验收、错误码。
>
> 关联:
> - 本域产品:`@feat.md`
> - 订单数据模型、状态机、订单号、过期、幂等 CAS:`@tech-订单数据与状态机.md`
> - 金额单字段模型、6 位精度、provider 边界转换:`@tech-金额模型.md`
> - 自动续费订阅订单:`@../011.Pricing页/tech-pricing与自动续费.md`
> - 积分包商品定义与定价读取(积分包 checkout-configs、`check_product` 实现、加余额):`@../003.积分系统/feat.md`
>
> 来源:原 `feat.006.订单系统.md` 的 API / 支付回调 / 业务回调 / 支付网关 / 部署运维章节 + `feat.006.001 website 订阅购买闭环` + `feat.006.003 订单履约补偿 Cron` + `feat.051.004 Credits 积分包商品配置与订单履约` 的订单侧部分。

## 0. 域边界

本文件只描述订单系统的**支付履约事务框架**:渠道对接、webhook 回调、价格校验、履约编排、补偿重试。

具体商品的定价读取与发货实现不在本文件:

- 自动续费订阅走本订单系统。首期订单由用户点击创建,后续每次 provider 自动扣款成功时由 webhook 创建续费订单;订阅域只负责订单履约时给 `user_subscriptions` 加时间。
- 积分包商品:定价读取在积分域;履约发货(`user_credit_service.add_balance_in_session`,加 Credits 余额)在积分域。本文件只描述"订单侧 `check_product` 按积分包类别分发到积分域"的契约面。
- 下载消费积分(下载扣 Credits)与下载授权 token 不在本域,见 `@../003.积分系统/feat.md` 与 `@../002.下载功能/feat.md`。

## 1. 客户端接口规格

订单系统的客户端 API 在 `backend/src/app/api/client/order_client.py`,路由前缀 `/api/client/order`,所有接口要求登录态(`Depends(get_current_user)`)。只能用 GET 和 POST。

### 1.1 创建订单

```text
POST /api/client/order/create
```

请求(`CreateOrderRequest`):

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `product_class` | int | 是 | `1..10` | 商品类别枚举(1=订阅,2=积分包) |
| `product_id` | string | 是 | `1..64` 字符 | 商品标识(业务域定义) |
| `payment_method` | string | 是 | `1..32` 字符 | 支付方式,对应渠道配置 `channel_code` |
| `amount` | int | 是 | `>= 0` | 客户端当前看到的渠道金额,6 位精度整数(待校验) |
| `currency` | string | 是 | `1..8` 字符 | 客户端当前看到的币种(待校验) |
| `auto_renew` | boolean | 否 | 默认 `false` | 订阅请求必须提交页面所见商品模式;Credits 不适用 |
| `period` | string | 否 | 默认 `none` | 订阅请求必须提交页面所见商品周期;Credits 不适用 |

`SUBSCRIPTION` 请求的 `auto_renew / period` 是用户所见商品配置的陈旧同意保护,API 层原样传给商品校验。订阅域按 `(product_id,channel_code)` 读取渠道价格,并要求二者仍等于商品当前值;完整合同见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。Credits 请求可省略这两个字段,分别使用合法默认值 `false / none`;Credits 校验不读取二者,并将订单固定为非自动续费。

响应(`CreateOrderResponse`):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `order_no` | string | 订单号 |
| `amount` | int | 订单最终金额,6 位精度整数 |
| `currency` | string | 订单最终币种 |
| `expired_at` | int | 订单过期时间(毫秒时间戳) |
| `support_mail` | string | 反馈邮箱;空字符串表示不展示 |
| `payment_data` | object | 渠道专属 JSON；`clink` 与 `paypal` 各自返回 `{"payment_url": ..., "channel_order_id": ..., ...}` 形态，字段含义由对应 Provider 定义 |

错误码:

| code | 名称 | 触发条件 |
| --- | --- | --- |
| `21004` | `PAYMENT_UNSUPPORTED_METHOD` | 支付方式未实现 provider 或渠道未启用 |
| `21005` | `PAYMENT_PRICE_UPDATED` | 客户端价格与后端配置不一致;`data` 回最新价格 |
| `21001` | `PAYMENT_GATEWAY_ERROR` | 支付入口创建失败,或创建后保存支付入口数据失败 |
| `10001 / 10013` | `AUTH_INVALID_TOKEN / AUTH_TOKEN_EXPIRED` | 认证失效 |

编排(api 层做参数校验与编排,事务在 service 层):

```text
1. payment_service.is_supported_method(payment_method) → 不支持直接 PAYMENT_UNSUPPORTED_METHOD
2. order_service.check_product(OrderCheckProductParam) → 按商品类别分发到业务域校验,返回 OrderCreateParam 快照
3. order_service.create_order(create_param) → 独立事务落库
4. provider = payment_service.get_provider(payment_method)
5. provider.create_payment(PaymentRequest) → 渠道专属 payment_data（Clink / PayPal 各自实现）
6. order_service.save_order_payment_data(order_no, payment_data) → CAS 保存(要求订单仍 PENDING)
7. 读 config_public.support_mail → 非空字符串随响应返回
```

关键约束:

- 步骤 2-6 不是一个整体事务;支付入口创建失败时已创建订单不回滚(遵循"允许局部出错让用户重试")。
- 客户端传来的价格字段是"待校验输入";订单最终落库以 `check_product()` 返回值为准。
- `support_mail` 来自 `config_public.support_mail`;读不到字符串或为空时返回空字符串,前端不展示反馈行。

### 1.2 查询订单状态

```text
GET /api/client/order/status/{order_no}
```

响应(`OrderStatusResponse`):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `order_no` | string | 订单号 |
| `product_class` | int | 商品类别整型枚举 |
| `product_id` | string | 商品 ID |
| `product_name` | string | 商品名称快照 |
| `amount / currency` | int / string | 订单金额快照 |
| `order_status` | int | 订单状态整型枚举(1-5) |
| `callback_status` | int | 履约回调状态整型枚举(1-5) |
| `payment_method` | string \| null | 支付方式;未选择或历史订单可为空 |
| `paid_at` | int \| null | 支付完成时间(毫秒);未支付为空 |
| `created_at / expired_at` | int | 创建 / 过期时间(毫秒) |

错误码:订单不存在或不属于当前用户 → `ORDER_NOT_FOUND`(`20001`);认证失效 → `AUTH_INVALID_TOKEN` 或 HTTP 401。

### 1.3 订单列表

```text
GET /api/client/order/list?status=&offset=0&limit=20
```

> **当前无客户端调用**:website 与插件都不请求本接口(订单展示走 1.2 状态查询与 Pricing 页自持的订阅态)。保留为订单域的通用查询能力,不随客户端演进删除。

- `status`:可选,订单状态筛选;支持数字枚举值或枚举名(大小写不敏感)。
- 只返回当前用户的订单。
- 字段同 `OrderStatusResponse`,外层 `orders / total / offset / limit`。

### 1.4 未完成订单列表

```text
GET /api/client/order/unfinished
```

> **当前无客户端调用**:website 的支付等待与继续支付入口走 1.2 的单笔订单状态查询 + 前端自持的待支付记录,不使用本接口。保留为订单域的通用查询能力。

- 只返回当前用户满足以下全部条件的订单:
  - `order_status = PENDING`
  - `expired_at > now`(30 分钟可见期内)
  - `has_payment_data = True`(已保存支付入口数据)
  - `payment_data` JSON 解析成功
- 最多 10 条。
- 响应每条多一个 `payment_data` 字段(创建订单时保存的渠道入口)。
- 可见期不是支付回调有效期：回调到达时仍允许按订单快照完成支付和履约。

### 1.5 取消订单

```text
POST /api/client/order/cancel
```

请求:`{ "order_no": "ORD..." }`(非空,`1..32` 字符)。

响应:`{ "order_no", "order_status": 3 }`。

规则:只能取消当前用户自己的 `PENDING` 订单;已支付 / 已取消 / 已退款返回 `ORDER_CANNOT_CANCEL`(`20005`);并发抢占失败也返回 `ORDER_CANNOT_CANCEL`。

### 1.6 支付回跳展示页

PayPal 与 Clink 各有 success / cancel 两页，共 4 个路径（后端回跳合同，路径不变；仅英文、noindex，不进语言切换与 sitemap）：

```text
GET /paypal/success/?order_no=<local_order_no>
GET /paypal/cancel/?order_no=<local_order_no>
GET /clink/success/?order_no=<local_order_no>
GET /clink/cancel/?order_no=<local_order_no>
```

4 个页面是薄壳，共用 1 个组件 `website/src/components/payment-return/PaymentReturnPage.astro`、1 个脚本 `payment-return.ts` 与 1 份英文文案 `website/src/i18n/payment-return.ts`；不再有页内硬编码文案。

- success 页：先展示"支付已提交"等待态，通过 `BroadcastChannel` / `postMessage` 通知原结算弹窗立刻查一次订单状态，并在该页按 3 秒间隔轮询 `/api/client/order/status/{order_no}`。
  - 本地订单达到 `PAID + CALLBACK SUCCESS` 才更新为到账确认并停止轮询；后端明确的取消 / 过期 / 失败显示失败态。
  - 本页无法确认订单时显示中性「已提交」：URL 缺少 `order_no`、没有网站登录态（插件内购买的常态）、网站 token 失效（401）、订单不属于当前网站账号（后端返回订单不存在）。提示用户回到发起购买的地方查看，在插件内购买的重新打开插件即可看到套餐。
- cancel 页：展示取消提示；有 `order_no` 且有登录态时调用 `/api/client/order/cancel` 把本地 `PENDING` 订单置为 `CANCELLED`，最后通知原结算弹窗查订单状态；无登录态只通知。
- 「返回价格页」按钮固定指向 `/ext-pricing/`，不再按订单商品类别改写，也不查询订单类别。
- 回跳页版式：深色舞台页头带作背景，深色状态卡跨在页头带底边上（状态图标块、标题、说明、主按钮）；视觉规则见 `../../references/specs/spec-website.md` §4。
- success/cancel 页都不触发发货、不调用 PayPal capture；到账展示只认 `/api/client/order/status/{order_no}` 的本地订单状态。
- 原结算弹窗（`/ext-pricing/` 页的订单结算弹窗）轮询到 `PAID + CALLBACK SUCCESS` 才显示到账成功；轮询到 `CANCELLED / EXPIRED / REFUNDED / PAID + CALLBACK FAILED` 显示对应失败或取消态。

### 1.7 PayPal webhook 回调

```text
POST /api/callback/paypal/payment
```

- 无需登录态;靠 PayPal webhook 签名校验。
- 仅在业务服务器(`app.role=business`)挂载;download role 不挂载。
- 唯一可信的 PayPal 支付成功入口;处理 `CHECKOUT.ORDER.APPROVED` 时在后端内部 capture,处理 `PAYMENT.CAPTURE.COMPLETED` 时按已完成 capture 兜底。

### 1.8 自动续费 webhook 续费订单

自动续费 provider 细节见 `@../011.Pricing页/tech-pricing与自动续费.md`。订单域提供统一落单和履约约束:

- 首期订阅订单走 `/api/client/order/create`。
- 后续自动续费没有用户点击;provider webhook 验签后,服务端按本次渠道扣款号创建 `ProductClass.SUBSCRIPTION` 续费订单。
- 创建续费订单前先按 `(payment_method, payment_channel_order_no)` 查重;命中则按已有订单幂等返回。
- 新续费订单创建后立即调用 `order_success`,再由订单履约分发到订阅域加时间。
- 续费订单不进入用户未完成订单列表;它是已发生扣款的服务端记录。

### 1.9 自动续费订阅管理

订阅管理属于订阅域入口,不创建订单、不改变订单状态:

```text
POST /api/client/subscription/management
```

订阅域从当前记录选择支付 Provider 并请求统一管理动作。Clink 用 `channel_uid` 创建 Customer Portal Session，PayPal 返回 Automatic Payments 固定入口。该动作不直接取消、不修改本地状态。

## 2. 支付渠道配置

### 2.1 渠道配置表(config_payment_channel)

模型:`backend/src/app/models/config_payment_channel_model.py`,`__tablename__ = "config_payment_channel"`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BigInteger PK | | 主键 |
| `channel_code` | string | unique(`uk_config_payment_channel_channel_code`) | 渠道标识,业务唯一;`payment_method` 在下单中对应此字段 |
| `channel_name` | string | | 渠道名称 |
| `enabled` | bool | | 是否启用 |
| `config_json` | string(JSON) | | 渠道配置 |
| `created_at / updated_at` | bigint | | 毫秒时间戳 |

`paypal` 渠道的 `config_json` 必须是对象,必填字段:

| config_json 字段 | 必填 | 说明 |
| --- | --- | --- |
| `client_id` | 是 | PayPal Developer App 的 Client ID |
| `client_secret` | 是 | PayPal Developer App 的 Client Secret |
| `webhook_id` | 是 | PayPal webhook 签名校验用 webhook id;PayPal webhook 注册完成后从 Dashboard 回填 |
| `request_timeout_seconds` | 是 | PayPal API HTTP 超时时间(正数) |
| `environment` | 否 | `sandbox` / `live`,默认 `sandbox`;代码据此选择 PayPal API 域名 |

约束:

- `client_secret`、`webhook_id` 必须脱敏输出,不得出现在日志、进程参数、`.env.example`。
- `paypal` 渠道实际收款币种固定 `USD`;商品域可配置其他渠道价,但 PayPal provider 创建支付时只接受 `currency == "USD"`。
- return URL 固定拼到 website:`{app.public_website_base_url}/paypal/success/?order_no=<order_no>`;cancel URL 固定拼到 website:`{app.public_website_base_url}/paypal/cancel/?order_no=<order_no>`。
- webhook URL 在 PayPal Dashboard 人工配置:`{app.public_api_base_url}/api/callback/paypal/payment`;该 URL 不写入渠道 `config_json`。
- 首次配置顺序:先创建 PayPal Developer App,在 PayPal Dashboard 注册测试服 webhook 并获取 `webhook_id`,最后把 `paypal` 渠道配置写入并启用;不要用占位 `webhook_id` 启用生产渠道。

### 2.2 商品定价配置表

各商品域自己持有定价配置表,订单系统不持有:

| 表 | 归属 | 唯一索引 | 职责 |
| --- | --- | --- | --- |
| `config_subscription_product` | 订阅域 | `uk_config_subscription_product_product_id(product_id)` | 订阅商品定义 |
| `config_subscription_product_price` | 订阅域 | `uk_config_subscription_product_price_product_channel(product_id, channel_code)` | 订阅商品的渠道实际结算价与续费能力 |
| `config_credit_product` | 积分域 | `uk_config_credit_product_product_id(product_id)` | 积分包商品定义 |
| `config_credit_product_price` | 积分域 | `uk_config_credit_product_price_product_channel(product_id, channel_code)` | 积分包 × 渠道定价 |

订单系统只通过 `check_product()` 调用对应域的 service 读取这些配置(见 §3)。

### 2.3 公共配置(config_public)

| `c_key` | 说明 |
| --- | --- |
| `support_mail` | 网站下单后等待支付界面展示的反馈邮箱;读不到字符串或为空时下单响应返回空字符串,前端不展示反馈行 |

### 2.4 配置读取与缓存

- 配置读取由 `backend/src/app/services/payment_config_service.py`(订阅)与积分域对应 service(积分包)提供。
- 缓存策略:后端内存缓存,`CONFIG_CACHE_TTL_SECONDS = 180`(3 分钟),常量在 `backend/src/app/constants/config_cache.py`。
- 每张配置表有独立 model 与 service(如 `config_payment_channel_service`、`config_subscription_product_service`、`config_subscription_product_price_service`)。
- 后台改价后,缓存过期前可能继续按旧配置下单;已创建订单不受配置变更影响(订单金额快照以 `check_product()` 返回值为准)。

## 3. 价格校验与订单快照(check_product)

`OrderService.check_product()` 是下单的价格校验与快照生成入口,按 `product_class` 分发到对应业务域:

```python
# backend/src/app/services/order_service.py
async def check_product(self, param: OrderCheckProductParam) -> OrderCreateParam:
    product_class = ProductClass(param.product_class)   # 非法枚举 → INVALID_REQUEST
    if product_class == ProductClass.SUBSCRIPTION:
        return await subscription_service.check_product(param)       # 订阅域
    if product_class == ProductClass.RECHARGE:
        return await user_credit_service.check_product(param)       # 积分域
    raise AppCommonException(CommonCode.INVALID_REQUEST, ...)       # EXTENSION/OTHER 拒绝
```

### 3.1 校验步骤(各业务域共用模式)

商品域的 `check_product(param) -> OrderCreateParam` 遵守同一校验模式。当前活跃实现是订阅域 `subscription_service.check_product` 与积分域 `user_credit_service.check_product`:

1. 校验 `product_id` 非空且商品已启用。
2. 校验 `payment_method` 已启用且 provider 已实现(`payment_service.is_supported_method`)。
3. 按商品域定义的身份读取渠道价格配置(走 3 分钟缓存);订阅域按 `(product_id,channel_code)` 读取,并校验请求模式、周期仍等于商品当前值,见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。
4. 比较客户端提交的所选渠道 `currency / amount` 是否与当前配置一致;展示价格不作为支付验价字段。
5. 不一致 → `PAYMENT_PRICE_UPDATED`(`21005`),`data` 回最新价格:

```json
{
  "product_id": "...",
  "payment_method": "paypal",
  "currency": "USD",
  "amount": 9990000
}
```

6. 一致 → 返回 `OrderCreateParam`(最终落单快照)。

### 3.2 订单快照落库规则

- 订单最终金额 / 币种 / 商品名以 `check_product()` 返回值为准,**不信任客户端传值**。
- `SUBSCRIPTION` 的订单快照和 Provider 账期由订阅域写入并解释;字段与履约规则见 [`006 · 订阅商品与状态` 的“订单履约”](../006.订阅系统/tech-订阅商品与状态.md#订单履约)。
- `RECHARGE` 商品的 `credits_amount` 由积分域 `check_product` 写入 `OrderCreateParam.extra_metadata` 的商品快照(`product_snapshot.credits_amount`),履约时从订单快照读取(见 `@tech-订单数据与状态机.md` §8.3),不从当前积分配置重读,避免改价后到账数量漂移。
- 订单创建后,后续支付、回调、履约全部以订单表中的快照为准,不再用当前配置表价格判断旧订单。

### 3.3 客户端价格刷新契约

- 收到 `PAYMENT_PRICE_UPDATED` 后**不局部修补 UI**;必须重新请求对应域的 checkout-configs(订阅:`/api/client/subscription/checkout-configs`;积分包:`/api/client/credit/checkout-configs`,仅后端合同,网站与插件当前都不调用),以最新商品配置整体刷新界面。
- 商品卡使用商品默认展示价(网站只有订阅商品卡,Credits 商品卡已随购买入口下线);只有订阅支付弹窗在选择渠道后显示渠道实际结算价。前端必须通过重新拉取 checkout-configs 刷新完整配置。

## 4. 支付 provider 接口

```python
# backend/src/app/provider/payment/payment_base.py
class PaymentBase(ABC):
    provider_name: str = ""

    @abstractmethod
    async def create_payment(self, request: PaymentRequest) -> dict[str, object]:
        """创建支付,返回值原样放入下单响应的 payment_data"""

    @abstractmethod
    async def verify_callback(self, request: Request) -> CallbackVerificationResult:
        """验证回调"""
```

- provider 创建入口:`payment_service.get_provider(payment_method) -> PaymentBase`(`backend/src/app/services/payment_service.py`)。
- `payment_service` 从启用的渠道配置读取 `config_json`,用构造方式传给 provider;`is_supported_method` 判断是否已有 provider 实现。
- provider 实现:
  - `paypal` → `PayPalPaymentProvider`
- PayPal 的 capture 是 PayPal 专属确认动作,不放进 `PaymentBase` 抽象;只由 PayPal webhook provider 内部调用 `PayPalPaymentProvider.capture_order(...)`,成功后统一进入 `order_service.order_success(...)`。
- 长期订阅管理不进入 `order_success`;由 `PaymentBase` 暴露统一管理入口能力,订阅 service 只选择当前支付 Provider。

## 5. PayPal provider

实现:`backend/src/app/provider/payment/paypal.py`,常量 `PAYPAL_PAYMENT_METHOD = "paypal"`、`PAYPAL_CURRENCY = "USD"`。

官方参考:

- PayPal Standard Checkout 集成流程:`https://developer.paypal.com/studio/checkout/standard/integrate`
- PayPal Orders API v2:`https://developer.paypal.com/docs/api/orders/v2/`
- PayPal Webhook 签名校验:`https://developer.paypal.com/api/rest/webhooks/`

### 5.1 provider 构造配置

`PayPalPaymentProvider(config)` 在构造时解析渠道 `config_json` 为 `PayPalProviderConfig`(frozen dataclass):

- `config` 必须是 dict,否则 `PaymentProviderError`。
- 必填字段:`client_id / client_secret / webhook_id / request_timeout_seconds`;任一为空或非法类型 → `PaymentProviderError`。
- 可选字段:`environment`,允许 `sandbox` / `live`,默认 `sandbox`;PayPal API 根地址由代码根据环境选择,不放入渠道配置。
- `request_timeout_seconds`:正数。
- provider 只从 `settings.app.public_website_base_url` 生成 success/cancel URL,不从渠道配置读取 website/API 公网地址。
- 日志与错误输出对 `client_secret` 与 `webhook_id` 做脱敏。

### 5.2 创建支付(Orders API create order)

`create_payment(request: PaymentRequest) -> {"paypal_order_id": str, "approval_url": str}`。

校验请求快照:

- `payment_method` 必须是 `paypal`。
- `currency` 必须是 `USD`。
- `order_status` 必须是 `PENDING`。
- `expired_at > now`(过期订单不创建 PayPal order)。
- `amount` 必须是 6 位精度金额且与 `currency` 组成订单金额快照。

请求 PayPal:

```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "<order_no>",
      "custom_id": "<order_no>",
      "description": "<product_name>",
      "amount": {
        "currency_code": "USD",
        "value": "15.30"
      }
    }
  ],
  "payment_source": {
    "paypal": {
      "experience_context": {
        "return_url": "<website>/paypal/success/?order_no=<order_no>",
        "cancel_url": "<website>/paypal/cancel/?order_no=<order_no>",
        "user_action": "PAY_NOW",
        "shipping_preference": "NO_SHIPPING"
      }
    }
  }
}
```

规则:

- `reference_id` 与 `custom_id` 都写本地 `order_no`,用于回调找回订单。
- 同时写 `reference_id` 与 `custom_id` 是为了覆盖 PayPal 不同事件 payload 的差异:`reference_id` 常出现在 `purchase_units[].reference_id`, `custom_id` 常出现在 `purchase_units[].payments.captures[].custom_id`。
- `user_action=PAY_NOW`:Credits 是一次性虚拟商品,创建订单时最终金额已确定;该值让 PayPal 结账按钮使用立即付款语义,避免用户误以为还会回商户页二次确认。
- `shipping_preference=NO_SHIPPING`:Credits 不需要物流地址,避免 PayPal 侧出现无关收货信息。
- `amount.value` 由 6 位精度 `amount` 转成两位小数字符串,不从前端传来的展示文本解析;例如 `15300000` 必须格式化为 `"15.30"`。实现时使用 `Decimal` 或整数除法格式化,禁止浮点运算。
- provider 从 PayPal 返回的 links 中取 `rel=payer-action` 或兼容旧形态 `rel=approve` 的 HTTPS URL,放入 `payment_data.payment_url / approval_url`。
- provider 必须校验 `approval_url` 来自 PayPal 官方域名(`paypal.com` 或其子域名);前端也做同样的官方域名兜底校验。
- `payment_data.channel_order_id / paypal_order_id` 保存 PayPal order id;同时在保存 payment_data 时把 `orders.payment_channel_order_no` 预写为 PayPal order id,供 `CHECKOUT.ORDER.APPROVED` webhook 在本地订单仍未支付时查回订单。
- success/cancel 回跳页 URL 中的 `order_no` 只用于通知原页面和取消本地待支付订单;支付成功只认 PayPal webhook 验签通过后的后端 capture / completed 结果。

### 5.3 capture_order

`capture_order(order) -> CallbackVerificationResult` 是 PayPal 专属方法,不进入 `PaymentBase`。

输入:

- 本地订单必须属于当前登录用户。
- `payment_method == paypal`。
- `order_status ∈ {PENDING, PAID}`。
- `payment_data.paypal_order_id` 非空。

处理:

1. 调 PayPal `POST /v2/checkout/orders/{paypal_order_id}/capture`。
2. 校验 PayPal order id 与本地 `payment_data.paypal_order_id` 一致。
3. 校验 capture 状态为完成态,并取第一个 completed capture。
4. 校验 `purchase_units[].reference_id/custom_id` 至少一个等于本地 `order_no`。
5. 校验 capture 金额 `currency_code == order.currency` 且归一化金额等于 `order.amount`。
6. 返回 `CallbackVerificationResult(valid=True, order_no, channel_order_no, channel_uid, amount, currency, transaction_id, extra_metadata)`。

`channel_order_no` 使用 PayPal order id,保持和创建支付时预写入的 `orders.payment_channel_order_no` 一致;PayPal capture id 写入 `orders.payment_transaction_id` 和原始支付快照,不覆盖查单键。`channel_uid` 优先使用 payer id;capture 响应常见路径为 `payer.payer_id`,webhook 事件常见路径为 `resource.payer.payer_id`;缺失时允许为空,不影响履约。

幂等:

- 如果 PayPal 返回 order 已经 captured,按查询到的 capture 结果构造同样的 `CallbackVerificationResult`。
- 如果本地订单已经是 `PAID + SUCCESS`,webhook 重复到达仍调用 `order_success`,由订单 CAS 返回幂等成功。

### 5.4 webhook 校验(verify_callback)

PayPal webhook 入口必须验证签名后才处理。签名校验使用 PayPal 官方 verify-webhook-signature 接口,请求字段来自 PayPal webhook headers 与原始 body:

- `paypal-auth-algo`
- `paypal-cert-url`
- `paypal-transmission-id`
- `paypal-transmission-sig`
- `paypal-transmission-time`
- `webhook_id`
- `webhook_event`

签名校验失败 → `PaymentProviderError`,不触发 `order_success`。

支持事件:

| PayPal 事件 | 处理 |
| --- | --- |
| `CHECKOUT.ORDER.APPROVED` | 用 PayPal order id 查本地订单并触发服务端 capture;capture 成功后进入 `order_success` |
| `PAYMENT.CAPTURE.COMPLETED` | 校验本地订单、金额、币种后触发 `order_success` |
| 其他事件 | 忽略并记录事件类型 |

webhook 找回本地订单:

- 优先从 `resource.purchase_units[].reference_id`、`resource.purchase_units[].payments.captures[].custom_id`、`resource.custom_id` 中读取本地 `order_no` 并按 `orders.order_no` 查询。
- 读不到本地 `order_no` 时,从 `resource.id` 或 `resource.supplementary_data.related_ids.order_id` 读取 PayPal order id,按 `orders.payment_channel_order_no == paypal_order_id` 兜底查询。PayPal webhook 是低频回调,本期不为该兜底查询新增索引;若上线后成为高频路径,按 `docs/references/specs/spec-index.md` 提供实际查询位置和数据量后再补索引。
- 找到订单后,必须用订单 `payment_data.paypal_order_id` 与事件 PayPal order id 交叉校验。
- 找不到本地订单时记录日志并返回 processed,不抛给 PayPal 无限重试。

### 5.5 PayPal OAuth token 缓存与耗时日志

- PayPal provider 获取 access token 时先读 Redis key `payment:paypal:access_token:{environment+client_id摘要}`;命中则不再请求 PayPal OAuth。
- OAuth 成功后按 PayPal `expires_in - 60s` 写 Redis TTL,供多进程/多节点共享。
- Redis 读写失败采用 fail-open:记录错误日志,退回实时 PayPal OAuth,不影响支付主链路。
- PayPal webhook 处理链路记录阶段耗时日志:`paypal_oauth_token_ready`、`paypal_api_post_finished`、`paypal_webhook_signature_verified`、`paypal_order_capture_finished`、`paypal_payment_callback_finished`。
- `paypal_payment_callback_finished` 必须包含 `event / order_no / verify_duration_ms / handle_payment_callback_duration_ms / total_duration_ms`,用于区分 PayPal 外部 API 慢与本地回调处理慢。

### 5.6 PayPal 原始回调日志

`_write_raw_callback_log`:把每个 PayPal webhook 的 `received_at / path / headers(去掉签名敏感字段可保留摘要) / body` 追加写入 `{settings.root_path}/log/payment/paypal/{YYYY-MM-DD}.log`(每行一个 JSON)。

这是排障用原始日志,不是业务回调日志;不写 `callback_logs` 表。

## 6. webhook / capture 编排

### 6.1 PayPal webhook capture 编排

唯一后端入口:`backend/src/app/api/callback/paypal_callback.py`,`POST /api/callback/paypal/payment`。

调用边界:

- website 回跳页只做展示和通知原结算弹窗,不调用 PayPal capture。
- PayPal `CHECKOUT.ORDER.APPROVED` webhook 在入口验签通过后调用 provider 内部 capture;该流程用 PayPal order id 查回本地订单,不要求用户登录。
- PayPal `PAYMENT.CAPTURE.COMPLETED` webhook 按已完成 capture 结果进入同一个 `order_success` 收口。

```text
1. 校验 PayPal webhook 签名
2. CHECKOUT.ORDER.APPROVED:读取 resource.id 作为 PayPal order id
3. provider = payment_service.get_provider(paypal)
4. verified = provider.capture_order(paypal_order_id)
5. verified.valid == True → order_service.order_success(order_no, channel_order_no, channel_uid, payment_method, extra_metadata, paid_amount, paid_currency)
6. 返回 {processed, event, order_no, idempotent}
```

capture 失败:

- PayPal 仍未完成支付或用户取消 → webhook 入口返回失败响应并记录原始日志;原结算弹窗继续按本地订单状态展示。
- PayPal API 超时 / 连接失败 → webhook 入口抛支付网关错误,依赖 PayPal 后续 webhook 或用户重试购买。
- 本地订单已成功履约 → `order_success` 返回幂等成功。

### 6.2 PayPal webhook 入口

入口:`backend/src/app/api/callback/paypal_callback.py`,`POST /api/callback/paypal/payment`。

```text
1. 读 body,_write_raw_callback_log 把原始请求追加到 log/payment/paypal/{date}.log
2. provider = payment_service.get_provider(paypal)
3. verified = provider.verify_callback(request)
4. event == CHECKOUT.ORDER.APPROVED 且 verified.order_no 存在 → provider 内部完成 PayPal capture,再进入 order_success
5. event == PAYMENT.CAPTURE.COMPLETED 且 verified.valid == True → order_service.order_success(...)
6. verified.valid == False → 返回 {processed, event, order_no, payment_valid: false}(不触发 order_success)
7. 返回 {processed, event, order_no, idempotent}
```

PayPal webhook 与 capture 都可能先到;统一靠 `order_success` 的订单状态 CAS 和履约 CAS 保证不重复发货。

### 6.3 ClinkBill webhook 入口

入口:`backend/src/app/api/callback/clink_callback.py`,`POST /api/callback/clink/payment`。

```text
1. 读 body,把移除 Authorization 与 X-Clink-Signature 后的原始请求追加到 log/payment/clink/{date}.log
2. provider = payment_service.get_provider_for_existing_payment(clink)
3. verified = provider.verify_callback(request)
4. order.succeeded / invoice.paid 且 processed == true → order_service.handle_payment_callback(...)
5. 已验签但未支持的事件 → 返回 {processed: false, event, reason: unsupported_event},不进入订单服务
6. 返回处理结果
```

### 6.4 原始回调日志

`_write_raw_callback_log`:把每个渠道 webhook 的 `received_at / path / headers(去掉 secret 头) / body` 追加写入 `{settings.root_path}/log/payment/{channel}/{YYYY-MM-DD}.log`(每行一个 JSON)。这是排障用的原始日志,不是业务回调日志(不写 `callback_logs` 表)。

PayPal 原始回调日志见 §6.6。

ClinkBill 原始回调日志写入 `{settings.root_path}/log/payment/clink/{YYYY-MM-DD}.log`；签名或结构错误也保留原始请求供排障，日志不包含 `Authorization` 与 `X-Clink-Signature`。

## 7. 履约事务编排

`order_success` 的完整流程见 `@tech-订单数据与状态机.md` §8。履约事务编排(`_trigger_order_success_callback` → `fulfill_paid_order` → `_fulfill_paid_order_once`):

```text
order_success (PENDING -> PAID, CAS, 独立事务)
  └─ _trigger_order_success_callback
       └─ fulfill_paid_order (10 秒超时包裹)
            └─ _fulfill_paid_order_once (独立事务):
                 1. _claim_order_callback_success: CAS
                    WHERE order_status=PAID AND callback_status IN (PENDING, FAILED)
                    SET callback_status=SUCCESS
                    ├─ 影响 0 行 → 查 _is_order_callback_success,幂等返回
                    └─ 影响 1 行 → 继续
                 2. _fulfill_order_product(db, order): 按商品类别发货(同事务)
                    └─ RECHARGE → user_credit_service.add_balance_in_session(db, ...)
                 3. db.commit()
```

- 业务发货与 `callback_status=SUCCESS` 必须在同一事务内提交。
- 发货抛确定性异常 → 整事务回滚,`fulfill_paid_order` 捕获后 `mark_callback_failed`(CAS `PENDING -> FAILED`),返回 `False`;`_trigger_order_success_callback` 抛 `OrderSuccessError`。
- 发货抛运行时异常(锁、连接、网络抖动等)→ 整事务回滚,不主动标 `FAILED`,保留 `PENDING` 等补偿任务下轮重试。
- 履约超时(> 10 秒)→ `asyncio.TimeoutError`,返回 `False`,不主动标 FAILED(留给补偿任务下轮重试)。

### 7.1 履约失败时的补偿兜底

`order_success` 在履约失败时抛 `OrderSuccessError`;此时订单已 `PAID + callback_status ∈ {PENDING, FAILED}`。由补偿任务在下一轮重试(见 §9)。**webhook 回调本身不重试履约**：PayPal webhook/capture 等只负责确认付款，履约重试靠补偿任务。

### 7.2 订单 Feishu 告警

工具:`backend/src/app/utils/order_alarm_utils.py`。

- `schedule_order_purchase_success_alarm(order)`:仅在 `_fulfill_paid_order_once` 完成履约事务 `commit` 后调度。告警标题为"付费订单履约成功",领域正文包含用户(`user_id/email/name`)、支付时间、履约时间、商品(`product_name/product_class/product_id`)、金额、支付渠道、订单号、渠道订单号和渠道用户。
- `schedule_order_fulfillment_failed_alarm(order, reason, error_message)`:在履约超时、履约异常、`fulfill_paid_order` 返回失败时调度。告警标题为"付费订单履约失败",正文包含同一组订单上下文,并追加失败原因、错误信息和处理建议。
- 调度方式统一使用 `asyncio.get_running_loop().create_task`,不阻塞 webhook、下单轮询或 cron。
- 告警出口复用 `send_feishu_alarm`,由统一出口追加应用名;Feishu 配置缺失、Redis 去重异常或 webhook 发送失败都 fail-open,只写日志。
- 成功告警和失败告警均按 `order_no` 做 24 小时去重,避免补偿任务每分钟重复推送同一订单。

## 8. 履约补偿重试 cron

任务文件:`backend/src/app/crons/task/order_fulfillment.py`。

### 8.1 注册

```python
# backend/src/app/crons/registry.py
CronTaskSpec(
    task_key=ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,   # "order.fulfillment_compensation"
    task=compensate_paid_pending_subscription_orders,   # 兼容旧注册名,内部调用 compensate_paid_pending_orders
    kind="interval",
    interval_seconds=60,                                # _ONE_MINUTE_SECONDS
)
```

- task key:`order.fulfillment_compensation`。
- 调度类型:`interval`,执行间隔 60 秒。
- 任务函数无参 async,不新增依赖注入。
- 注册表在进程启动时加载到调度器;领取由现有 `cron_task_cursor` 保证同一时刻只有一个 worker 执行该 task。

### 8.2 扫描条件(SQL 层过滤,不全量加载)

```python
orders = await order_service.order_lists(
    order_statuses=[OrderStatus.PAID],
    callback_statuses=[CallbackStatus.PENDING, CallbackStatus.FAILED],   # 注意:同时扫 PENDING 和 FAILED
    product_classes=[ProductClass.SUBSCRIPTION, ProductClass.RECHARGE],    # 订阅与积分包都走 orders
    updated_before_ms=timestamp_now() - 60_000,                           # 滞留 60 秒以上
    limit=20,                                                             # 每轮最多 20 单
    order_by="updated_at_asc",                                            # 最旧优先
)
```

**与旧文档(006.003)的关键差异**:补偿任务覆盖所有已支付但未履约完成的订单,包括 Credits 与 Unlimited 订阅首期/续费订单。

`updated_before_ms` 用 `updated_at` 判断滞留(而非 `created_at`),避免订单创建很久但刚支付成功时被提前补偿。

### 8.3 处理算法

```text
for order in orders:
    try:
        fulfilled = await order_service.fulfill_paid_order(order)
    except Exception as exc:           # 运行时异常(锁、连接、超时)
        runtime_error_count += 1
        logger.error(... order_no, user_id, product_id, callback_status, error ...)
        continue                       # 不标 FAILED,保留 PENDING,等下轮
    if fulfilled:
        success_count += 1
    else:
        skipped_count += 1             # CAS 未抢到或已被其他路径处理
```

- 确定性业务错误(`ValueError` / `LookupError`,如商品快照损坏、订阅 product_id 不支持)在 `fulfill_paid_order` 内部被捕获并 `mark_callback_failed`(CAS `PENDING -> FAILED`),计入 `failed_count` 路径(由 `fulfill_paid_order` 返回 `False` 体现为 `skipped_count`)。
- 数据库锁、连接中断、超时等运行时异常只记录日志,不标 `FAILED`,订单保持原状态,等待下轮补偿。
- 单订单异常不中断本轮其他订单处理。
- 整轮扫描查询失败直接记录错误并结束本轮。

并发控制:

- 领取由 `cron_task_cursor` 保证单 worker。
- 履约内部用 `callback_status` CAS 保证不重复发货。
- cron 框架单任务运行上限 300 秒;超时释放后可能被下一轮重入,仍靠 CAS 保证不重复发货。

### 8.4 日志

每轮输出结构化日志:`task_key / scanned_count / success_count / failed_count / skipped_count / runtime_error_count`。单订单失败日志必须含 `order_no / user_id / product_id / callback_status / error`。

## 9. webhook 注册与部署验收

### 9.1 PayPal webhook 注册

PayPal webhook 在 PayPal Developer Dashboard 人工配置:

- Webhook URL:`${public_api_base_url}/api/callback/paypal/payment`。
- Event types 选择 `All Events`,避免新增 PayPal 订阅生命周期能力时因 Dashboard 白名单未同步而收不到事件。
- 当前支付履约消费 `CHECKOUT.ORDER.APPROVED`、`PAYMENT.CAPTURE.COMPLETED`、`PAYMENT.SALE.COMPLETED`:前两个负责一次性订单 capture 与 completed 兜底,`PAYMENT.SALE.COMPLETED` 负责 PayPal 订阅首期和后续续费扣款。
- 其他已验签事件当前按未处理事件确认接收;本期不复制 PayPal 订阅生命周期状态机。
- 注册完成后把 PayPal 返回的 `webhook_id` 写入 `config_payment_channel.config_json.webhook_id`。
- 上线验收必须用 sandbox 分别完成一笔 PayPal 一次性支付和一笔订阅支付,确认 capture/completed 兜底不会重复发货,订阅 `PAYMENT.SALE.COMPLETED` 能完成首期履约。

## 10. 错误码

定义在 `backend/src/app/i18n/common_code.py` 与 `backend/src/app/i18n/locales/*.json`。

### 10.1 订单错误码

| code | 名称 | 说明 |
| --- | --- | --- |
| `20001` | `ORDER_NOT_FOUND` | 订单不存在或不属于当前用户 |
| `20002` | `ORDER_INVALID_STATUS` | 订单状态不允许当前操作 |
| `20003` | `ORDER_EXPIRED` | 订单已过期 |
| `20004` | `ORDER_ALREADY_PAID` | 订单已支付,不能重复支付 |
| `20005` | `ORDER_CANNOT_CANCEL` | 订单不可取消 |

### 10.2 支付错误码

| code | 名称 | 说明 |
| --- | --- | --- |
| `21001` | `PAYMENT_GATEWAY_ERROR` | 支付网关请求失败(Clink 下单 / PayPal create/capture / 保存 payment_data 失败等) |
| `21002` | `PAYMENT_VERIFICATION_FAILED` | 支付回执验签或核验失败 |
| `21003` | `PAYMENT_AMOUNT_MISMATCH` | 支付金额与订单金额不一致 |
| `21004` | `PAYMENT_UNSUPPORTED_METHOD` | 不支持的支付方式(无 provider 实现或渠道未启用) |
| `21005` | `PAYMENT_PRICE_UPDATED` | 支付价格配置已更新;`data` 回最新价格 |

抛错约束:必须附详细可定位 `msg`,能定位到 `user_id` / `order_no` / `product_id` / `payment_method` / `channel_order_no`。例:

```python
raise AppCommonException(
    CommonCode.PAYMENT_UNSUPPORTED_METHOD,
    ext_msg=(
        "order_create: unsupported payment method before order creation: "
        f"payment_method={payment_method}, product_class={data.product_class}, "
        f"product_id={data.product_id}"
    ),
    data={"payment_method": payment_method},
)
```

### 10.3 前端状态映射(订单事务)

| 后端 code | 前端行为 |
| --- | --- |
| `21005 PAYMENT_PRICE_UPDATED` | 重新拉对应域 checkout-configs 整体刷新,提示价格已更新 |
| `21001 PAYMENT_GATEWAY_ERROR` | 不打开外部支付页,提示支付网关失败 |
| `21004 PAYMENT_UNSUPPORTED_METHOD` | 提示当前支付方式不可用 |
| `20001 ORDER_NOT_FOUND` | 停止轮询,提示重新创建订单 |
| `20003 ORDER_EXPIRED` | 提示订单已过期,允许重新下单 |
| `10001 / 10013 AUTH_*` | 停止轮询,清理登录态,打开登录弹窗 |

`ORDER_EXPIRED` 是创建支付入口 / 订单校验时可能返回的错误码,不表示系统会把订单状态自动写成 `EXPIRED`;当前自动过期只影响未完成订单列表可见性。

订单状态组合(`order_status` + `callback_status`):

| 组合 | 含义 | 前端行为 |
| --- | --- | --- |
| `PAID + SUCCESS` | 支付成功且履约成功 | 停止轮询,刷新对应域状态(订阅 / 积分余额),当前方案高亮 |
| `PAID + PENDING` | 支付已确认,履约进行中 | 继续短时间轮询,提示"正在开通" |
| `PAID + FAILED / MAX_RETRY` | 履约失败 | 停止轮询,提示联系支持,保留订单号 |
| `PENDING` | 等待支付 | 继续轮询,直到超时或状态变化 |
| `CANCELLED / REFUNDED` | 已取消 / 已退款 | 停止轮询,刷新列表,允许重新购买 |

## 11. 安全约束

- **订单号生成**:时间戳(毫秒)+ 4 位随机数,`order_no` 上有 unique 约束兜底。
- **webhook 密钥校验**：PayPal webhook 必须通过 PayPal 签名校验；Clink 回调按渠道密钥校验；缺失或不一致拒绝处理。
- **回调幂等**:首次 `PENDING -> PAID` CAS;履约 `callback_status` CAS;重复回调按幂等成功处理,不重复发货。
- **发货只认后端确认**：PayPal 只认后端 capture 或签名通过的 webhook；不认前端回跳页本身。
- **渠道 UID 不参与订单归属**:`payment_channel_uid` 只用于后续渠道退款操作;订单归属只认本系统 `orders.user_id`。
- **密钥保护**：Clink 与 PayPal 的 client secret、webhook id 不出现在服务启动脚本、`deploy.sh`、`init.sh`、`.env.example`、日志、进程参数、错误输出里；provider 日志对 secret 做 `***` 脱敏。
- **金额判断**:只用 `currency + amount`(6 位精度整数),避免浮点误差与历史字段污染。

## 12. 验收(支付与履约层)

- 客户端下单只提交商品标识、支付方式、当前看到的价格;商品名与最终金额快照由后端配置确认后写入订单。
- 订单状态与履约回调状态在接口里返回整数枚举,不是字符串。
- `payment_data` 是渠道专属对象；`payment_url` 缺失时前端不打开支付页，按失败展示。
- `payment_data` 是渠道专属对象;`paypal` 分支要求 `payment_data.paypal_order_id` 和 `payment_data.approval_url` 是非空字符串,不满足时不打开 PayPal。
- 下单时客户端价格与后端配置不一致返回 `PAYMENT_PRICE_UPDATED`,`data` 回最新价格;前端整体刷新 checkout-configs。
- 支付入口创建失败时已创建订单不回滚,前端提示支付网关失败。
- `expired_at` 只影响客户端未完成订单列表可见性；PayPal capture / webhook 与 Clink 回调不因订单超过 30 分钟而拒绝。
- 支付回调只用 `orders.currency + orders.amount` 校验金额,不查当前价格配置。
- PayPal webhook capture 成功、PayPal `PAYMENT.CAPTURE.COMPLETED` 与 Clink 回调都统一进入 `order_success`；重复到达不重复加 Credits。
- PayPal `CHECKOUT.ORDER.APPROVED` webhook 能触发服务端 capture。
- PayPal cancel 回跳页调用现有 `/api/client/order/cancel` 取消本地待支付订单;原结算弹窗通过订单状态看到 `CANCELLED` 后显示取消态。
- 支付成功履约在同事务内完成 `callback_status=SUCCESS` 与业务发货(积分加余额)。
- 履约成功后异步发送 Feishu 成功告警,内容包含应用名、用户、时间、商品、金额、渠道与订单号。
- 重复 webhook 不重复发货。
- 履约失败的订单(`PAID + PENDING/FAILED`)会被补偿任务在 60 秒级别内重新处理;覆盖积分包与订阅订单。
- 履约失败或超时后异步发送 Feishu 失败告警,内容包含失败原因和错误信息;重复补偿不重复刷屏。
- 补偿任务查询在 SQL 层过滤,按 `updated_at ASC` 最旧优先,每轮最多 20 单。
- 履约超时(> 10 秒)返回失败,不主动标 `FAILED`,由补偿任务下轮重试。
- webhook 请求头密钥缺失或不一致时验签失败,不触发 `order_success`;PayPal 签名校验失败同样不触发。
- 渠道密钥只存在数据库渠道配置与后端环境配置里,不写入前端公开配置、日志或错误输出。
- PayPal success 回跳页按 3 秒间隔轮询本地订单状态;必须由 webhook 让本地订单进入 `PAID + SUCCESS` 后,前端才显示到账确认。

## 13. 验证命令

```bash
cd backend
uv run black --check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment src/app/utils
uv run ruff check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment src/app/utils
uv run mypy src/app/services/order_service.py src/app/services/payment_service.py src/app/provider/payment/clink.py src/app/provider/payment/paypal.py src/app/utils/order_alarm_utils.py
uv run pytest tests/test_server/api/test_order_api.py -rs
uv run pytest tests/test_server/api/test_clink_callback_api.py -rs
uv run pytest tests/test_server/api/test_paypal_callback_api.py -rs
uv run pytest tests/test_server/services/test_clink_payment_service.py -rs
uv run pytest tests/test_server/services/test_paypal_payment_service.py -rs
uv run pytest tests/test_server/services/test_order_service_admin_queries.py -rs
uv run pytest tests/test_server/crons/test_order_fulfillment.py -rs
uv run pytest tests/test_server/utils/test_order_alarm_utils.py -rs
uv run pytest tests/test_server/scripts/test_order_auto_renew_scripts.py -rs
```

修改 models 后执行:

```bash
cd backend
uv run python src/app/init/sync_database_schema.py --dry-run
```

## 14. 回滚

- 停用对应商品配置(订阅商品 / 积分包商品),保留表结构;前端购买入口同时下线。
- 单独回滚 PayPal 时,停用 `config_payment_channel.channel_code = "paypal"` 与对应 `config_credit_product_price` 行;前端 checkout-configs 将只剩 Clink。
- 从 `CRON_TASKS` 移除补偿任务;已成功履约的订单不回滚。
