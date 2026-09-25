# 004 · ClinkBill 支付渠道

> 状态：源码已实现；尚未部署，数据库渠道配置、Webhook 注册与真实 Sandbox 支付未完成。
>
> 当前外部阻塞：缺少 Sandbox Secret、尚未确认公网 callback URL、尚未生成并写入 Sandbox Catalog IDs。
>
> 本文定义 ClinkBill Hosted Checkout 对接的最终合同。Provider 同时支持一次性支付与自动续费；对商品域允许下单且已启用的商品，Clink 可用性由全局渠道配置与对应商品渠道价共同决定。

## 1. 目标与边界

### 1.1 目标

- 新增 `clink` Payment Provider，复用现有统一下单、支付回调、订单 CAS 和履约链路。
- 服务端用支付渠道配置中的 Clink Secret Key 创建 Checkout Session，对外返回 `checkoutUrl`。
- 客户在 ClinkBill Hosted Checkout 完成支付；一次性支付只由验签后的 `order.succeeded` 确认，自动续费只由验签后的 `invoice.paid` 确认。
- Provider 只读取订单创建时冻结的计费模式和渠道商品标识，不识别商品类别或商品 ID。
- 商品域先决定商品是否允许下单；Clink Provider 不参与商品规则。通过商品域校验后，全局 Clink 渠道与对应商品渠道价都启用才允许使用 Clink。
- 支持 Sandbox 首笔真实支付验收，交付本地 curl、Webhook CLI 和数据库核对步骤。

### 1.2 非目标

- 不实现退款、部分退款、争议处理或对账系统。
- 不实现用户对已生效周期协议开启或关闭自动续费。
- 不新建支付订单、支付尝试或 Webhook Inbox 表。
- 不改写现有订单状态机、履约事务或补偿任务。
- 不引入 Clink SDK 或新 Web 框架；使用项目已有 `httpx`。

## 2. 已证实的现有合同

- 商品域的 `check_product` 已从商品渠道价配置读取 `provider_sku`，并与计费模式一起通过现有 `OrderCreateParam`、`PaymentRequest` 原样传给 Provider；通用订单链路无需识别 Clink 配置。
- 创建 Clink Session 时，Provider 只读取构造参数中的渠道配置和 `PaymentRequest`，不重读商品配置。
- 自动续费回调可通过 `RecurringPaymentReference.original_order_no` 定位首单；首单已支付时，订单服务会按新的渠道扣款号创建本地续费订单。
- 一次性重复回调由现有订单状态 CAS 和履约状态 CAS 收敛；自动续费并发回调额外复用 OrderService 已有 Redis 短锁和渠道扣款号查重，不新增 Clink 专用幂等层。
- `orders.payment_data` 可保存 Clink `sessionId` 和 Checkout URL；`orders.payment_channel_order_no` 可保存本次履约的渠道幂等号。

## 3. 渠道配置

### 3.1 渠道标识

| 字段 | 值 |
| --- | --- |
| `channel_code` | `clink` |
| `channel_name` | `ClinkBill` |
| `config_json.environment` | `sandbox` / `live` |
| `config_json.request_timeout_seconds` | 正数，不在 Provider 中写死 |
| `config_json.secret_key` | 创建 Session 和调用服务端 API |
| `config_json.webhook_signing_key` | Webhook HMAC-SHA256 验签 |

Provider 根据 `environment` 选择官方固定 API 根地址，不允许从前端或下单请求覆盖：

| 环境 | API 根地址 |
| --- | --- |
| `sandbox` | `https://uat-api.clinkbill.com/api/` |
| `live` | ClinkBill 正式 API 官方根地址，上线前用当时 OpenAPI 复核 |

### 3.2 密钥与动态配置

- `secret_key` 来源于 Clink Sandbox/Live Dashboard API Key，`webhook_signing_key` 来源于 Webhook Endpoint 注册结果。
- 两个密钥统一保存在 `config_payment_channel.config_json`，与现有支付 Provider 共用同一配置模型；不新增环境变量、部署参数或密钥文件。
- 运营通过 `sql_executor.py` 修改 Clink 渠道配置。新下单读取现有渠道配置缓存，最多 3 分钟生效；Webhook 和历史订单使用非缓存渠道配置，密钥修改后下一次请求立即生效，无需重启。
- 密钥不写入源码、前端变量、日志、测试 fixture、文档示例或 API 响应。Provider 从构造参数解析完整渠道配置，不新增依赖注入。

### 3.3 商品渠道价配置

一次性支付使用非注册商品模式，不需要 Clink Product/Price ID。自动续费必须使用 Clink 预注册商品与 recurring Price：

- Clink recurring 渠道价使用现有 `provider_sku VARCHAR(128)` 保存 `<productId>:<priceId>`；一次性渠道价允许为空。
- `provider_sku` 对通用配置、商品和订单链路是不可解释的渠道字符串，只由 `ClinkPaymentProvider` 在 `auto_renew=true` 时拆分并校验两个非空 ID。
- 组合值超过现有字段长度或格式不合法时不写配置、不启用该商品渠道价，不扩大数据库 schema。
- 使用官方 `clink catalog validate/plan/import` 创建 Sandbox Product/Price，再用项目 `sql_executor.py` 写入渠道价配置。

## 4. Checkout Session

### 4.1 公共请求字段

| Clink 字段 | 本地来源 |
| --- | --- |
| `referenceCustomerId` | 登录用户 ID |
| `merchantReferenceId` | `orders.order_no` |
| `originalAmount` | `orders.amount` 从 6 位精度整数转为主币种单位 |
| `originalCurrency` | `orders.currency` |
| `uiMode` | `hostedPage` |
| `successUrl` / `cancelUrl` | 由服务端公开 Website 根地址生成 `/clink/success/`、`/clink/cancel/`，并携带本地订单号 |
| `metadata.order_no` | `orders.order_no` |

- 请求头使用 `X-API-Key: config_json.secret_key`、当前毫秒 `X-Timestamp` 和 `Content-Type: application/json`。
- 金额只在 Provider 边界转换一次。数量固定为 1，`originalAmount` 必须与商品单价一致。
- 价格、币种、商品名、返回 URL 和引用 ID 全部由服务端订单快照/配置决定，不接受前端覆盖。

### 4.2 一次性分支

`auto_renew=false` 发送：

```json
{
  "priceDataList": [
    {
      "name": "<order product snapshot>",
      "quantity": 1,
      "unitAmount": 12.99,
      "currency": "USD"
    }
  ]
}
```

不同时发送 `productId` / `priceId`。

### 4.3 自动续费分支

`auto_renew=true` 发送：

```json
{
  "productId": "prd_...",
  "priceId": "price_..."
}
```

不发送 `priceDataList`。两个 ID 任一缺失时，该笔订单创建支付入口失败，用户修正运营配置后重试。

### 4.4 本地返回合同

Clink 成功响应取 `data.sessionId` 和 `data.url`，保存为：

```json
{
  "sessionId": "sess_...",
  "checkoutUrl": "https://uat-checkout.clinkbill.com/pay/...",
  "payment_url": "https://uat-checkout.clinkbill.com/pay/...",
  "url": "https://uat-checkout.clinkbill.com/pay/..."
}
```

- `checkoutUrl` 是 Clink 明确合同。
- `payment_url` 供现有统一前端读取；这不是旧版兼容层，而是当前 Payment Provider 统一返回合同。
- Session 创建时还没有 Clink Order，不写 `channel_order_id`，不用 `sessionId` 伪装渠道扣款号。

## 5. Webhook

### 5.1 路由与订阅事件

```text
POST /api/callback/clink/payment
```

本期只处理两个成功事件：

- `order.succeeded`：一次性支付。
- `invoice.paid`：自动续费的首期与后续每期扣款。

Clink 可能同时发送 recurring `order.succeeded`；该事件验签、识别为 recurring 后直接返回 2xx，不触发履约。自动续费只认 `invoice.paid`，避免同一账期被 Order 和 Invoice 两种事件各履约一次。

其他事件（包括 `subscription.created`）在验签和 event 基础结构校验通过后记录原始请求，返回 HTTP 200 与 `processed=false / reason=unsupported_event`，不进入订单履约。退款、争议、取消和周期协议状态同步不在本期处理范围；续费失败不触发本地履约，因此本期不复制 Clink 周期协议状态机。

### 5.2 验签顺序

1. 读取未修改的原始 body 并写入原始回调日志，不先解析 JSON。
2. `X-Clink-SignType` 必须等于 `SHA256`。
3. `X-Clink-Timestamp` 必须是整数秒或毫秒时间戳，与当前时间前后相差不超过 300 秒。
4. 签名原文为 `timestamp + "." + raw_body`。
5. 用 `config_json.webhook_signing_key` 计算 HMAC-SHA256 hex，使用常量时间比较。
6. 验签成功后才解析 JSON，校验 `event_` ID、`object="event"`、毫秒 `created` 和非空事件类型。
7. 支持的事件继续校验 `data.object` 并执行对账；未支持事件直接确认接收。

验签、JSON 或 event 基础结构不合法时返回非 2xx，不进入订单服务。事件类型合法但当前未支持时返回 2xx，同样不进入订单服务。

原始请求按行写入 `{settings.root_path}/log/payment/clink/{YYYY-MM-DD}.log`，字段为 `received_at / path / headers / body`；写入前移除 `Authorization` 与 `X-Clink-Signature`。该文件只用于排障，不写 `callback_logs` 表。

### 5.3 一次性支付对账

`order.succeeded` 且 `data.object.type="onetime"` 时，Provider 在返回 `CallbackVerificationResult` 前完成下列核对：

1. `data.object.merchantReferenceId` 精确定位本地订单。
2. 本地订单的 `payment_method` 必须是 `clink`。
3. 本地 `payment_data.sessionId` 必须与 `data.object.sessionId` 一致。
4. 按 `priceDataList` 累加单价 × 数量，使用 Decimal 转换为项目 6 位精度整数后，必须与本地订单 `amount` 一致。条目数量须为正整数，省略时为 1。
5. 每个条目币种必须与 `originalCurrency`、本地订单 `currency` 一致。Provider 向 OrderService 输出该原币种定价金额，继续执行统一金额校验；`amountTotal/paymentCurrency` 作为实际支付信息保存在渠道元数据中，不参与原币种金额比较。商品定价不代表渠道折扣后的实付金额。

Clink 回调入口统一捕获 Provider 验证和 OrderService 处理异常，记录堆栈并发送飞书告警后重抛，让渠道收到失败响应并重试。每次异常均尝试告警；告警发送失败不覆盖原支付异常。告警发送依赖后端飞书告警配置。

项目已有 Provider 查询本地订单的先例；Clink 本地双引用核对放在 Provider 内，不给通用 OrderService 添加 Clink 专用分支。

一次性成功映射为：

```text
channel_order_no = data.object.orderId
order_no = data.object.merchantReferenceId
```

Provider 把已验证金额/币种的结果交给现有 `handle_payment_callback`。`orderId + 订单 CAS` 负责重复投递幂等，不新增 Redis 或数据库 Inbox。

### 5.4 自动续费对账与成功映射

`invoice.paid` 以 Clink 的 `subscriptionId + invoiceId` 表示订阅关系和本账期，不能套用一次性订单的 `merchantReferenceId + sessionId` 规则。Provider 按以下顺序处理：

1. 从 Invoice 事件取得 `subscriptionId`、`invoiceId`、`orderId`、金额和币种。
2. 服务端调用 `GET /subscription/{subscriptionId}`，取得该订阅的 `merchantReference`、`sessionId` 和 `customerId`。
3. 用 `merchantReference` 精确定位首笔本地订单，再比对本地 `payment_data.sessionId` 和 `payment_method=clink`。
4. 比对 Invoice 金额、币种与首单；本期不支持促销码和中途变价，因此每期金额必须与首单快照一致。
5. 任一查询或核对失败就返回非 2xx，等待 Clink 重试；不新增本地恢复任务。

核对通过后映射为：

```text
channel_order_no = invoice.invoiceId
transaction_id = invoice.orderId
recurring_reference.original_order_no = subscription.merchantReference
channel_uid = subscription.customerId
```

- `invoiceId` 进入现有 `(payment_method, payment_channel_order_no)` 查重与续费建单链路，保证同一账期只履约一次。
- `customerId` 沿订单成功与订阅履约链路保存到 `user_subscriptions.channel_uid`,管理订阅时用它调用 `POST /billing/session`,并传服务端生成的 Pricing `returnUrl`。
- Customer Portal URL 必须是当前环境的官方 HTTPS 主机:Sandbox 为 `uat-portal.clinkbill.com`,正式环境为 `portal.clinkbill.com`。
- Clink `subscriptionId`、`orderId`、`invoiceId`、`sessionId`、`event.id` 保存在订单支付扩展元数据中用于排查；不把它们提升为新的本地订阅状态，也不为本期新增订单字段。
- 首期支付时首单仍为 `PENDING`，现有链路直接将首单置为已支付并按订单快照履约。
- 后续扣款时首单已为 `PAID`，现有链路按新 `invoiceId` 创建本地续费订单，复制首单商品快照并调用对应商品域履约。
- 后续商品配置变化不影响已存在的 Clink 周期协议；续费订单继续使用首单快照。

Clink 针对 `order.succeeded` 的 API 文档明确允许按 `event.id` 或 `orderId` 幂等；订阅指南要求每个 `invoiceId` 只履约一次。本方案分别使用 `orderId` 和 `invoiceId` 进入现有订单幂等链路，并复用自动续费已有 Redis 短锁，不增加 Clink 专用 Redis key 或持久 Inbox 真相源。

Clink 通用 skill 推荐所有事件额外写入按 `event.id` 唯一的持久 Inbox。本项目只消费两个支付成功终态，底层业务对象已经分别有稳定的 `orderId` / `invoiceId`，且用户接受 Redis 或数据库短暂故障时由渠道重试，因此明确不引入该通用加固层。

## 6. 前端合同

- Checkout 客户端直接展示后端商品配置返回的渠道集合，不维护商品到 Clink 的静态允许名单。
- Clink 支付行名称下方通过 i18n 展示 `Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover`，窄屏自动换行。
- website 的 Clink 支付行左侧使用灰色银行卡图标，跨名称和说明两行垂直居中；右侧不展示品牌图标。本地 `payment-icons/bank-card.svg` 使用 [Ant Design Icons Credit Card](https://github.com/ant-design/ant-design-icons/blob/master/packages/icons-svg/svg/outlined/credit-card.svg)，同目录保留 MIT 许可证。
- 渠道展示名从后端 `payment_method_name` 读取，不在组件中写死。
- 读取 URL 顺序包含 `checkoutUrl`、`payment_url`、`url`，最终只允许 HTTPS 且 host 为 ClinkBill 官方 Checkout 域名：Sandbox `uat-checkout.clinkbill.com`，正式 `checkout.clinkbill.com`。
- 用户点击支付后在新标签页打开 Hosted Checkout，原页继续轮询本地订单状态。
- Clink `successUrl` 返回 `/clink/success/` 结算结果页；该页按 3 秒间隔轮询本地订单，并通过同源消息触发原购买页立即查一次状态。只有本地订单达到 `PAID + CALLBACK SUCCESS` 才展示确认成功，不以 Clink 前端回跳本身作为支付依据。`cancelUrl` 返回取消结果页并取消本地待支付订单。
- Clink / PayPal 成功与取消结果页均在说明下方提供返回 Pricing 的按钮；多语言 PayPal 页面保留当前语言。Clink 结果页品牌名称显示为 `Clink`。

## 7. 错误语义

- Session 创建网络失败、超时、Clink 非 2xx、响应结构错误：抛出包含本地订单号、请求路径、HTTP 状态和 Clink 错误码的 `PaymentProviderError`，用户重试创建新订单。
- Webhook 验签失败：非 2xx，不查订单、不履约。
- Webhook 已验签但事件未支持：记录原始请求并返回 2xx，响应包含 `processed=false / reason=unsupported_event`，不查订单、不履约。
- Webhook 对账不一致：非 2xx，错误必须包含 event ID、Clink order/invoice/session ID 和本地订单号，不自动修正。
- 重复 Webhook：返回 2xx 幂等结果，不重复履约。
- 密钥缺失：`clink` 渠道创建 Provider 失败，其他支付渠道不受影响。
- 日志不输出 Secret Key、Webhook 签名、完整 Checkout URL token 或完整原始支付方式信息。

## 8. 配置与首笔支付验收

### 8.1 Webhook 注册

Sandbox 使用与当前 skill 一起发布的 CLI，不使用另一个 customer wallet `clink-cli`：

```bash
clink webhook endpoint ensure \
  --url https://<public-api>/api/callback/clink/payment \
  --events order.succeeded,invoice.paid \
  --save-secret \
  --json
```

命令成功后，使用 `sql_executor.py` 把返回的签名密钥写入 Clink 渠道的 `config_json.webhook_signing_key`；下一次 Webhook 立即读取新值，无需重启。

### 8.2 可执行验收命令

以下命令只读取操作者本地值，不包含真实密钥、用户 token 或固定线上商品价格。先准备：

- `PROJECT_AUTH_HEADER_FILE`：权限为 `0600`，仅包含当前测试用户的 `Authorization: Bearer ...` 请求头。
- `CLINK_HEADERS_FILE`：权限为 `0600`，仅包含 Sandbox `X-API-Key: ...` 请求头。
- `CLINK_WEBHOOK_BODY_FILE`：权限为 `0600`，保存与本地待支付订单匹配的 canonical `order.succeeded` JSON；不得包含签名密钥。
- `BACKEND_CONFIG_FILE`：本地业务后端配置文件路径。
- 项目下单变量：`PROJECT_API_BASE_URL`、`PROJECT_TEST_PRODUCT_CLASS`、`PROJECT_TEST_PRODUCT_ID`、`PROJECT_TEST_AMOUNT`、`PROJECT_TEST_CURRENCY`、`PROJECT_TEST_AUTO_RENEW`、`PROJECT_TEST_PERIOD`。订阅测试的金额和币种来自所选渠道,后两项来自商品当前模式与周期;合同见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。Credits 测试分别使用 `false`、`none`。
- 直连排查变量：`CLINK_TEST_CUSTOMER_ID`、`CLINK_TEST_ORDER_NO`、`CLINK_TEST_AMOUNT`、`CLINK_TEST_CURRENCY`、`CLINK_TEST_PRODUCT_NAME`、`CLINK_TEST_SUCCESS_URL`、`CLINK_TEST_CANCEL_URL`。
- Webhook 模拟从当前 shell 的 `CLINK_WEBHOOK_SIGNING_KEY` 读取签名密钥。命令不会输出密钥、用户 token 或完整 Checkout URL。

项目下单：

```bash
ORDER_RESPONSE="$(curl --fail-with-body --silent --show-error \
  -H "@${PROJECT_AUTH_HEADER_FILE}" \
  -H 'Content-Type: application/json' \
  --data "$(jq -nc \
    --argjson product_class "${PROJECT_TEST_PRODUCT_CLASS}" \
    --arg product_id "${PROJECT_TEST_PRODUCT_ID}" \
    --argjson amount "${PROJECT_TEST_AMOUNT}" \
    --arg currency "${PROJECT_TEST_CURRENCY}" \
    --argjson auto_renew "${PROJECT_TEST_AUTO_RENEW}" \
    --arg period "${PROJECT_TEST_PERIOD}" \
    '{product_class: $product_class, product_id: $product_id, payment_method: "clink", amount: $amount, currency: $currency, auto_renew: $auto_renew, period: $period}')" \
  "${PROJECT_API_BASE_URL}/api/client/order/create")"
jq '{code, order_no: .data.order_no, has_checkout_url: (.data.payment_data.checkoutUrl != null)}' <<<"${ORDER_RESPONSE}"
CLINK_CHECKOUT_URL="$(jq -er '.data.payment_data.checkoutUrl' <<<"${ORDER_RESPONSE}")"
```

直连 Sandbox 排查，仅用于区分项目映射问题与 Clink API 问题：

```bash
CLINK_RESPONSE="$(curl --fail-with-body --silent --show-error \
  -H "@${CLINK_HEADERS_FILE}" \
  -H "X-Timestamp: $(date +%s000)" \
  -H 'Content-Type: application/json' \
  --data "$(jq -nc \
    --arg customer_id "${CLINK_TEST_CUSTOMER_ID}" \
    --arg order_no "${CLINK_TEST_ORDER_NO}" \
    --argjson amount "${CLINK_TEST_AMOUNT}" \
    --arg currency "${CLINK_TEST_CURRENCY}" \
    --arg product_name "${CLINK_TEST_PRODUCT_NAME}" \
    --arg success_url "${CLINK_TEST_SUCCESS_URL}" \
    --arg cancel_url "${CLINK_TEST_CANCEL_URL}" \
    '{referenceCustomerId: $customer_id, merchantReferenceId: $order_no, originalAmount: $amount, originalCurrency: $currency, uiMode: "hostedPage", successUrl: $success_url, cancelUrl: $cancel_url, metadata: {order_no: $order_no}, priceDataList: [{name: $product_name, quantity: 1, unitAmount: $amount, currency: $currency}]}')" \
  'https://uat-api.clinkbill.com/api/checkout/session')"
jq '{code, session_id: .data.sessionId, has_checkout_url: (.data.url != null)}' <<<"${CLINK_RESPONSE}"
CLINK_CHECKOUT_URL="$(jq -er '.data.url' <<<"${CLINK_RESPONSE}")"
```

官方 CLI 本地签名模拟；它只验证本地合同，不代表真实 Clink Webhook：

```bash
clink --json webhook simulate order.succeeded \
  --secret env:CLINK_WEBHOOK_SIGNING_KEY \
  --body-file "${CLINK_WEBHOOK_BODY_FILE}" \
  --forward-to "${PROJECT_API_BASE_URL}/api/callback/clink/payment"
```

使用显式本地配置启动业务后端：

```bash
cd backend
uv run python scripts/run_backend_with_config.py \
  --config "${BACKEND_CONFIG_FILE}"
```

### 8.3 真实 Sandbox 验收

1. 确认后端渠道开启，创建一笔 Clink 订单。
2. 检查返回包含 `sessionId` 和 HTTPS `checkoutUrl`，数据库订单仍为待支付。
3. 由人在 Hosted Checkout 完成 Sandbox 支付。
4. 确认真实 Clink Webhook 命中公网端点并返回 2xx，不以本地 simulate 代替。
5. 核对本地订单为已支付且订单快照对应的履约结果已实际生效。
6. 重放同一一次性事件和同一 Invoice 事件，确认本地订单幂等返回，权益不再增加。
7. 分别用 `auto_renew=false` 和 `auto_renew=true` 的测试配置创建新订单，确认前者发送 `priceDataList`，后者发送 `productId + priceId`，两者均能完成首期履约。
8. 对自动续费 Sandbox 协议使用 Clink Test Clock 推进一个周期，确认新 `invoiceId` 产生一条本地续费订单且只履约一次；后续商品配置变化不改变该结果。

## 9. 官方证据

- [ClinkBill Integration Skill](https://github.com/clinkbillcom/clink-integ-skills)
- [API Introduction](https://docs.clinkbill.com/api-reference/introduction)
- [OpenAPI](https://docs.clinkbill.com/api-reference/openapi.json)
- [Hosted Checkout](https://docs.clinkbill.com/build-integration)
- [Checkout Session](https://docs.clinkbill.com/guides/payments/checkout_session)
- [Subscriptions](https://docs.clinkbill.com/subscriptions)
- [Order Webhook](https://docs.clinkbill.com/api-reference/webhook/order)

本次设计使用的 skill 仓库版本已于 2026-08-20 刷新官方文档缓存，捆绑 `clink-integ-cli 0.2.1`。实施和上线前必须重跑 freshness gate，不使用本文代替当时官方合同。
