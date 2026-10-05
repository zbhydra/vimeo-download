# 004 · 金额模型(单字段 + 6 位精度 + Provider 边界转换)

> 技术实现文档。覆盖:订单/商品/支付回调金额字段的统一口径、表字段删除、API 契约、支付渠道边界转换、本地开发配置修复、验收与回滚。
>
> 关联:
> - 本域产品:`@feat.md`
> - 订单数据模型与状态机:`@tech-订单数据与状态机.md`
> - 支付渠道对接与履约:`@tech-支付与履约.md`
> - Credits 商品定价:`@../003.积分系统/tech-购买.md`
> - 订阅商品定价:`@../006.订阅系统/tech-订阅商品与状态.md`

## 0. 目标

把金额模型从「渠道原始金额 + 归一化金额」双字段收敛为「单字段 6 位精度金额」。

最终每个金额语义只保留一个 6 位精度整数单位字段。展示价、渠道收款价、实付价仍是三个不同语义,但每个语义不再同时保留 raw 与 normalized 两套字段:

```text
存储金额 = 真实货币数量 * 1_000_000
```

示例:

| 真实金额 | 存储金额 |
| --- | ---: |
| USD 1.89 | 1_890_000 |
| USD 6.30 | 6_300_000 |
| USDT 1.123456 | 1_123_456 |

## 1. 设计决策

### 1.1 最终方案

- 商品保留 `display_currency / display_amount`,渠道价格保留 `currency / amount`,订单保留 `currency / amount` 与 `paid_currency / paid_amount`。
- 删除 `amount_raw` / `display_amount_raw` / `paid_amount_raw`。
- 所有保留金额字段统一为 6 位精度整数。
- 前端、后台和 provider 都只读取一个金额字段,按币种在边界格式化。
- 不保留兼容字段,接受破坏性 API 和数据库变更。
- 商品 `display_amount` 是用户可见展示价,不参与支付金额验价;支付验价只认所选渠道的 `currency + amount`。

### 1.2 不采用的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 继续保留 `raw + amount` 双字段 | 不采用 | `raw` 在 PayPal 美分、渠道协议整数、后台展示价之间含义漂移，是本次 bug 根因 |
| 改成 2 位金额精度 | 不采用 | 当前 USD 足够,但 USDT/USDC 需要 6 位;2 位会重新引入币种特例 |
| 仅修 PayPal provider 除以 100 的问题 | 不采用 | 只能局部止血,后台、配置、API 仍会保留两套金额概念 |

## 2. 字段模型

### 2.1 商品展示价

| 表 | 保留字段 | 删除字段 | 说明 |
| --- | --- | --- | --- |
| `config_credit_product` | `display_currency`, `display_amount` | `display_amount_raw` | Credits 商品用户可见展示价 |
| `config_subscription_product` | `display_currency`, `display_amount` | `display_amount_raw` | 订阅商品卡默认展示价 |

Credits 的 `display_amount` 是用户可见价格的 6 位精度整数。前端展示时做:

```text
display_amount / 1_000_000
```

订阅商品同样保存 `display_currency / display_amount` 作为商品卡默认展示价;渠道价格行的 `currency / amount` 是支付弹窗和实际结算价。字段边界见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。

### 2.2 渠道价格

| 表 | 保留字段 | 删除字段 | 说明 |
| --- | --- | --- | --- |
| `config_credit_product_price` | `currency`, `amount` | `amount_raw` | Credits 商品在具体渠道下的收款金额 |
| `config_subscription_product_price` | `currency`, `amount` | `amount_raw` | 订阅商品在具体渠道下的收款金额 |

`amount` 是渠道收款金额,使用 6 位精度整数。订阅价格行的完整身份由订阅域维护,本金额文档只约束每行只有一个金额字段。

配置加载必须校验渠道金额可被对应 provider 无损表示:

| 支付方式 | 币种 | 约束 |
| --- | --- | --- |
| `paypal` | `USD` | `amount > 0` 且 `amount % 10_000 == 0`（两位小数） |
| `clink` | 不限 | `amount > 0` |

不满足约束是坏配置,加载 checkout 配置时抛 `PAYMENT_GATEWAY_ERROR`。provider 边界仍重复 exact 校验,禁止舍入或截断。

### 2.3 订单金额

| 表 | 保留字段 | 删除字段 | 说明 |
| --- | --- | --- | --- |
| `orders` | `currency`, `amount` | `amount_raw` | 订单创建时的最终金额快照 |
| `orders` | `paid_currency`, `paid_amount` | `paid_amount_raw` | 支付渠道确认后的实付金额快照 |

`orders` 不再保留历史金额字段;订单金额只以 `amount` 存储。

## 3. API 契约

### 3.1 下单请求

`POST /api/client/order/create` 请求金额字段改为:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `currency` | string | 是 | 当前选中支付渠道币种 |
| `amount` | int | 是 | 当前选中支付渠道金额,6 位精度整数 |

删除 `amount_raw`。

### 3.2 下单响应和订单状态

`CreateOrderResponse`、`OrderStatusResponse`、订单列表、未完成订单列表只返回:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currency` | string | 订单币种 |
| `amount` | int | 订单金额,6 位精度整数 |

删除 `amount_raw`。

### 3.3 checkout-configs 响应

- Credits checkout 在商品层返回 `display_currency / display_amount`,并在每个渠道价格中返回 `currency / amount`。
- Subscription checkout 在商品层返回 `display_currency / display_amount`,每个渠道返回实际结算 `currency / amount`。完整响应见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。
- 两类响应均不保留 `display_amount_raw / amount_raw`。

### 3.4 价格过期错误

`PAYMENT_PRICE_UPDATED` 的 `data` 只回:

```json
{
  "product_id": "credit_200",
  "payment_method": "paypal",
  "currency": "USD",
  "amount": 15_300_000
}
```

## 4. Service 契约

### 4.1 OrderCheckProductParam

```python
@dataclass
class OrderCheckProductParam:
    user_id: int
    product_class: int
    product_id: str
    payment_method: str
    amount: int
    currency: str
    auto_renew: bool = False
    period: str = "none"
    client_ip: str | None = None
    language: str | None = None
```

字段适用范围与传递职责见 [`tech-支付与履约.md` 的“创建订单”](tech-支付与履约.md#11-创建订单);本金额专题不复制订阅商品与渠道价格规则。

### 4.2 OrderCreateParam

完整字段以 [`backend/src/app/constants/order.py`](../../../backend/src/app/constants/order.py) 中的 `class OrderCreateParam` 为准,本文不复制内部对象形状。金额模型只约束:商品域校验后返回的 `amount / currency` 是最终落单快照,后续创建订单和支付请求不得恢复客户端原值。

### 4.3 PaymentRequest

完整字段以 [`backend/src/app/provider/payment/payment_base.py`](../../../backend/src/app/provider/payment/payment_base.py) 中的 `class PaymentRequest` 为准。API 层使用订单最终 `amount / currency` 构造支付请求,并把 `OrderCreateParam.auto_renew / provider_sku` 传给 provider;PayPal / Clink 据此选择一次性或自动续费分支。

### 4.4 CallbackVerificationResult

```python
@dataclass
class CallbackVerificationResult:
    valid: bool
    amount: int | None = None
    currency: str | None = None
    ...
```

删除 `amount_raw`。

### 4.5 order_success

`order_service.order_success(...)` 参数改为:

```python
order_success(
    *,
    order_no: str,
    channel_order_no: str,
    channel_uid: str | None,
    payment_method: str,
    extra_metadata: str | None,
    paid_amount: int,
    paid_currency: str,
) -> dict
```

金额校验只比较:

```text
orders.currency == paid_currency
orders.amount == paid_amount
```

## 5. Provider 边界转换

内部金额统一是 6 位精度整数。外部支付渠道需要自己的协议单位时,只允许在 provider 边界转换。

### 5.1 PayPal

PayPal Orders API 需要两位小数字符串:

```text
paypal_amount_value = Decimal(amount) / Decimal(1_000_000)
```

创建 PayPal order 前必须校验:

```text
amount > 0
amount % 10_000 == 0
```

不满足说明 USD 金额无法无损表达为 PayPal 两位小数,直接抛 `PaymentProviderError`,不做四舍五入、截断或补救。

示例:

| 内部 `amount` | PayPal `amount.value` |
| ---: | --- |
| 1_890_000 | `"1.89"` |
| 15_300_000 | `"15.30"` |

PayPal capture 回包的小数字符串转回内部金额:

```text
paid_amount = Decimal(value) * Decimal(1_000_000)
```

转换结果必须是整数且满足 `paid_amount % 10_000 == 0`。否则视为 PayPal 回包金额不可被内部模型无损表达,回调失败并记录错误。

### 5.2 Clink

Clink 的 `originalAmount` / `unitAmount` / `amountTotal` 都是十进制数值，与内部 6 位精度整数一一对应。provider 边界规则：

```text
下单:originalAmount = format_normalized_amount(amount)   # 6 位精度整数 -> 十进制字符串
回调:paid_amount   = Decimal(amountTotal) * 1_000_000
```

回调还要求同一事件内 `originalCurrency == 每个 item 的 currency`，金额按 item 累加后与事件总额比对，不一致抛 `PaymentProviderError`。

## 6. 展示格式

前端 website 与 admin 后台统一用:

```text
human_amount = amount / 1_000_000
```

格式:

| 币种 | 展示 |
| --- | --- |
| USD | 固定 2 位小数,如 `USD 1.89` / `$1.89` |
| USDT / USDC | 最多 6 位小数,去尾 0 |

后台订单页列表和详情都展示 `amount` / `paid_amount`,不再展示 `amount_raw`。

## 7. 配置与结构同步

金额配置不在本页维护第二套 SQL。Credits 配置见 [`003 · Credits 购买`](../003.积分系统/tech-购买.md),订阅配置见 [`011 · Pricing 实现与配置`](../011.Pricing页/tech-实现与配置.md#订阅配置合同)。两者的金额都使用 6 位精度整数。

部署前运行 `sync_database_schema.py`;它会删除模型通过 `schema_sync_drop_columns` 明确声明的旧列。当前订阅商品的商品级计费、展示金额字段由该机制主动清理,无需本页保留手工 DDL。

## 8. 实施范围

### 8.1 后端

- Model 删除字段:
  - `ConfigCreditProductModel.display_amount_raw`
  - `ConfigCreditProductPriceModel.amount_raw`
  - `ConfigSubscriptionProductModel.display_amount_raw`
  - `ConfigSubscriptionProductPriceModel.amount_raw`
  - `OrderModel.cash`
  - `OrderModel.amount_raw`
  - `OrderModel.paid_amount_raw`
- Schema 删除字段:
  - Credits checkout configs 的 `display_amount_raw` / `amount_raw`
  - Subscription checkout configs 的 `display_amount_raw` / `amount_raw`
  - Order create/status/list 的 `amount_raw`
- 常量 dataclass 删除 `amount_raw`。
- service 价格校验改为只比较 `currency + amount`。
- provider 回调结果和回调 API 改为只传 `amount`。
- `money.py` 保留 `NORMALIZED_AMOUNT_SCALE = 6`、`NORMALIZED_AMOUNT_FACTOR = 1_000_000`、`normalize_currency`;删除按币种 raw scale 转换的概念。

### 8.2 前端与后台

- website 订阅结算类型和请求不含 `display_amount_raw` / `amount_raw`（Credits 购买入口已从网站下线，后端 Credits 商品接口仍遵循本模型）。
- 商品价展示用 `display_amount / 1_000_000`。
- admin 订单类型和订单页删除 `amount_raw` / `paid_amount_raw`。
- admin 订单页金额展示用 `amount` / `paid_amount`。

### 8.3 数据库

`sync_database_schema.py` 负责模型结构同步,并主动删除模型显式登记的旧列;它不会根据未登记的数据库多余列猜测删除意图。订阅商品当前删除列及最终字段以 [`006 · 订阅商品与状态`](../006.订阅系统/tech-订阅商品与状态.md#config_subscription_product) 为准。

## 9. 验收

- 代码中不再出现业务字段 `cash`、`amount_raw`、`display_amount_raw`、`paid_amount_raw`。
- 下单 API 请求和响应的金额字段只保留 `currency + amount`。
- Credits 与 Subscription checkout 都返回商品 `display_amount` 与渠道 `amount`;订阅商品卡和支付弹窗分别使用对应字段。
- PayPal 下单 `amount=1_890_000` 时发送给 PayPal 的值是 `"1.89"`。
- PayPal 下单 `amount=1_234_567` 时 provider 拒绝,不创建 PayPal order。
- PayPal capture `"1.89"` 回调落入订单成功入口的 `paid_amount` 是 `1_890_000`。
- Clink 下单 `amount=1_890_000` 时发送的 `originalAmount` 是 `1.89`。
- Clink 回调 `amountTotal=1.89` 时落入订单成功入口的 `paid_amount` 是 `1_890_000`。
- 订单金额校验只比较 `currency + amount`。
- 后台订单页显示 `USD 1.89`,不显示 `USD 189`。
- 本地开发配置表金额已按 6 位精度修正。

## 10. 验证命令

```bash
cd backend
uv run black --check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment src/app/utils
uv run ruff check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment src/app/utils
uv run mypy src/app/services/order_service.py src/app/services/subscription_service.py src/app/services/user_credit_service.py src/app/provider/payment/clink.py src/app/provider/payment/paypal.py src/app/utils/money.py
uv run pytest tests/test_server/utils/test_money.py -rs
uv run pytest tests/test_server/api/test_order_api.py -rs
uv run pytest tests/test_server/api/test_credit_checkout_config_api.py -rs
uv run pytest tests/test_server/api/test_subscription_checkout_config_api.py -rs
uv run pytest tests/test_server/services/test_clink_payment_service.py -rs
uv run pytest tests/test_server/services/test_paypal_payment_service.py -rs
uv run pytest tests/test_server/api/test_clink_callback_api.py -rs
uv run pytest tests/test_server/api/test_paypal_callback_api.py -rs
```

```bash
cd admin
pnpm build
```

```bash
cd website
pnpm build
```

## 11. 风险与回滚

风险:

- 这是破坏性 API 和数据库变更,旧前端/后台/测试不能兼容。
- 配置表若未修复，PayPal 会收到极小金额或直接拒绝该渠道价格行。
- 模型未显式登记的数据库旧列不会被自动删除。

回滚:

- 代码回滚到双字段模型。
- 配置表保留修复后的 6 位金额不会兼容旧双字段模型,回滚代码前需按旧口径重写配置。
- 因上线前订单表会清空,无需回滚历史订单数据。
