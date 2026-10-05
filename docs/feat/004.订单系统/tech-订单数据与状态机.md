# 004 · 订单数据与状态机(模型 + 状态流转 + 订单号 + 过期 + 幂等 CAS)

> 技术实现文档。覆盖:订单表结构与索引、商品类别 / 订单状态 / 履约回调状态枚举、订单状态流转图、订单号生成、订单过期机制、支付成功与履约的幂等 CAS、回调日志边界、订单 service 关键方法契约。
>
> 关联:
> - 本域产品:`@feat.md`
> - 支付渠道对接、Clink / PayPal webhook、价格校验与快照、履约事务与补偿重试、错误码:`@tech-支付与履约.md`
> - 金额单字段模型、6 位精度、provider 边界转换:`@tech-金额模型.md`
> - 订阅履约实现(加订阅时长):`@../006.订阅系统/feat.md`
> - 积分履约实现(加 Credits 余额):`@../003.积分系统/feat.md`
>
> 来源:原 `feat.006.订单系统.md` 的数据模型 / 安全性 / 订单过期机制章节 + `feat.006.003 订单履约补偿 Cron` 状态机部分。

## 0. 域边界

本文件只描述订单系统自身的**数据底座与状态机**:订单表、状态枚举、状态流转、订单号、过期、幂等 CAS。

具体商品的定价与履约实现不在本文件:订阅价格校验与加时长在 `@../006.订阅系统`;积分包价格校验与加余额在 `@../003.积分系统`。本文件只在状态机的"履约发货"节点声明"按商品类别分发到对应业务域"。

支付渠道对接、provider 接口、webhook 回调校验、Clink / PayPal 细节在 `@tech-支付与履约.md`。

## 1. 商品类别枚举(ProductClass)

```python
# backend/src/app/constants/order.py
class ProductClass(int, enum.Enum):
    SUBSCRIPTION = 1  # 订阅商品;Unlimited 首期和续费扣款都走 orders
    RECHARGE = 2      # 充值商品(积分包)
    EXTENSION = 3     # 扩展功能(预留,未接入履约)
    OTHER = 4         # 其他(预留,未接入履约)
```

- `RECHARGE` 当前有完整订单闭环(下单 + 履约)。
- `SUBSCRIPTION` 用于订阅首期和每次自动续费扣款。首期订单由用户点击创建,后续续费订单由 provider webhook 创建。
- `EXTENSION`、`OTHER` 是预留枚举;未接入履约前 `OrderService.check_product()` 直接拒绝下单,不暴露给客户端购买。
- 商品标识(`product_id`)由各商品域定义:积分包商品如 `credit_50 / credit_200 / credit_1000`(积分域),订阅商品如 `unlimited_month`(订阅域)。

## 2. 订单状态枚举

### 2.1 OrderStatus(订单状态)

```python
class OrderStatus(int, enum.Enum):
    PENDING = 1    # 待支付
    PAID = 2       # 已支付
    CANCELLED = 3  # 已取消
    REFUNDED = 4   # 已退款
    EXPIRED = 5    # 已过期
```

### 2.2 CallbackStatus(履约回调状态)

```python
class CallbackStatus(int, enum.Enum):
    NOT_CALLED = 1  # 未回调
    PENDING = 2     # 处理中(已支付,履约进行中)
    SUCCESS = 3     # 成功(履约完成)
    FAILED = 4      # 失败(履约明确失败,人工排查)
    MAX_RETRY = 5   # 历史预留(超过最大重试次数;当前不写入,客户端按失败处理)
```

- 客户端接口直接返回整数枚举值,不返回字符串。
- `MAX_RETRY` 当前不写入;前端收到 `4` 或 `5` 都按履约失败展示。

## 3. 订单表(orders)

模型:`backend/src/app/models/order_model.py`,`__tablename__ = "orders"`。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `id` | BigInteger PK | autoincrement | 主键 |
| `order_no` | String(32) | unique,非空 | 订单号(业务唯一) |
| `user_id` | BigInteger | 非空,index | 用户 ID |
| `product_class` | Integer | 非空 | 商品类别枚举值 |
| `product_id` | String(64) | 非空 | 商品标识(业务域定义) |
| `product_name` | String(128) | 非空 | 商品名称(下单快照) |
| `amount` | BigInteger | 0 | 订单金额,统一 6 位精度整数(真实金额 × 1_000_000) |
| `currency` | String(8) | "USD" | 货币类型 |
| `order_status` | Integer | `PENDING.value` | 订单状态枚举 |
| `callback_status` | Integer | `NOT_CALLED.value` | 履约回调状态枚举 |
| `payment_method` | String(32) | null | 支付方式;未选择或历史订单允许为空 |
| `payment_data` | Text | null | 支付入口数据(JSON)；Clink 与 PayPal 各自返回 `{"payment_url": ..., "channel_order_id": ..., ...}` 形态，字段含义由对应 Provider 定义 |
| `payment_channel_order_no` | String(256) | null | 支付渠道订单标识;PayPal 一次性订单为 PayPal order id,自动续费订单为本次扣款 transaction/capture id;Clink 为渠道订单号 |
| `payment_transaction_id` | String(256) | null | 支付渠道实际交易流水 ID;渠道未提供时为空;不建索引 |
| `payment_channel_uid` | String(64) | null | 付款人渠道 UID;仅用于渠道退款等渠道操作,不参与订单归属 |
| `paid_amount` | BigInteger | null | 渠道回调支付金额,统一 6 位精度整数 |
| `paid_currency` | String(8) | null | 渠道回调支付币种 |
| `created_at` | BigInteger | `timestamp_now()` | 创建时间(毫秒时间戳) |
| `updated_at` | BigInteger | `timestamp_now()` | 更新时间(毫秒时间戳) |
| `paid_at` | BigInteger | null | 支付时间(毫秒时间戳) |
| `expired_at` | BigInteger | 非空 | 订单过期时间(毫秒时间戳) |
| `client_ip` | String(64) | null | 客户端 IP |
| `extra_metadata` | Text | null | 扩展元数据(JSON);保存商品快照、支付回调原始信息、客户端语言 |

### 3.1 索引

按 `../../references/specs/spec-index.md`,只保留真实查询需要的索引:

| 索引 | 类型 | 服务查询 |
| --- | --- | --- |
| `order_no` 上 `unique=True` | unique | 订单号查询、CAS 更新、履约抢占、订单状态轮询(全链路高频) |
| `uk_orders_payment_channel_order(payment_method, payment_channel_order_no)` | unique | 自动续费 webhook 按本次渠道扣款号去重;MySQL 允许多行 NULL,不影响待支付订单 |
| `user_id` 上 `index=True` | index | 用户订单列表、未完成订单列表、用户订单统计 |

不额外加:
- `order_status` / `callback_status` / `product_class` 单列索引(低基数枚举,订单列表查询都带 `user_id` 前缀,单列索引无收益)。
- `(user_id, order_status)` 联合索引:当前 admin 与客户端订单列表的 WHERE 是 `user_id` + 多个可选状态过滤,`user_id` 单列已能定位,联合索引最左前缀不带来额外收益。
- `expired_at` 索引:过期只用于客户端列表二次过滤(`expires_after_ms`),不作为独立查询入口。

### 3.2 不建独立支付流水表

首期不建 `payment_records`。渠道查单号(`payment_channel_order_no`)、实际交易流水 ID(`payment_transaction_id`)、付款人渠道 UID(`payment_channel_uid`)、实付金额(`paid_amount / paid_currency`)、完整支付快照(写入 `extra_metadata`)都进订单表,避免为普通订阅 / 积分包购买引入额外金融级流水模型。

PayPal 一次性订单的 `payment_channel_order_no` 保存 PayPal order id,因为 `CHECKOUT.ORDER.APPROVED` webhook 需要在本地订单仍未支付时查回订单并触发服务端 capture;`payment_transaction_id` 保存 capture id。PayPal 自动续费订单的两个字段都保存本次扣款 transaction/capture id,前者用于同一扣款 webhook 去重;长期 subscription id 写入 `extra_metadata.channel_subscription_id` 或 `user_subscriptions.channel_subscription_id`。

订阅管理入口不创建订单、不修改历史订单状态。订阅域使用当前订阅保存的渠道事实创建 Provider 管理入口,订单表继续只记录已发生的首期和续费扣款。

未来接入退款、对账、多渠道结算时再独立设计 `payment_records`,届时回审本表是否拆分。

## 4. 回调日志表(callback_logs)

模型:`backend/src/app/models/callback_log_model.py`,`__tablename__ = "callback_logs"`。

字段:`id / order_id / order_no / callback_url / request_body / response_body / http_status / callback_status / error_message / created_at`。

**重要现状(与旧文档差异)**:此表当前**未作为业务回调日志被写入**。`order_success` / 履约事务不写此表;渠道 webhook 的原始请求只落文件日志(`log/payment/{channel}/{date}.log`,见 `@tech-支付与履约.md`),不落此表。

- 模型保留是为未来接通用回调日志预留,当前订单履约状态以 `orders.callback_status` 整数枚举为准。
- 此表的 `callback_status` 是字符串排障字段,与 `orders.callback_status` 整数枚举是两回事。
- 不要在本期向此表写入业务逻辑依赖;订单幂等只靠 `orders.order_status / callback_status` 的 CAS。

## 5. 订单状态流转图

### 5.1 订单状态(OrderStatus)

```text
                 创建订单
                    │
                    ▼
              ┌───────────┐
              │  PENDING  │  (待支付,默认 30 分钟过期)
              └─────┬─────┘
        ┌───────────┼────────────┬──────────────┐
        │           │            │              │
   用户取消      支付回调      可见期超时     (系统不主动改)
        │        successful     (仅前端列表     expired)
        │         _payment       隐藏,不阻止
        │           │            回调完成)
        ▼           ▼
  ┌──────────┐  ┌───────┐
  │CANCELLED │  │ PAID  │
  └──────────┘  └───┬───┘
                      │
                (退款,人工,
                 当前不自动触发)
                      ▼
                 ┌──────────┐
                 │ REFUNDED │
                 └──────────┘
```

规则:

- 订单创建即 `PENDING`,过期时间默认 30 分钟。
- `PENDING → PAID`:支付回调成功时 CAS(`order_service.order_success`)。
- `PENDING → CANCELLED`:用户主动取消(`order_service.cancel_user_order`)。
- `PAID → REFUNDED`:退款流程,当前不自动触发,本期不实现退款。
- **系统不依赖自动过期任务把订单改成 `EXPIRED`**:过期只影响客户端未完成订单列表可见性,不改订单状态。已进入支付流程的回调即使超过 30 分钟也允许完成。

### 5.2 履约回调状态(CallbackStatus)

```text
  创建订单
     │
     ▼
┌───────────┐
│ NOT_CALLED│  (未回调,订单未支付)
└─────┬─────┘
      │ 支付回调成功,CAS 置 PAID
      ▼
┌───────────┐
│  PENDING  │  (处理中,履约进行中)
└─────┬─────┘
      │ 履约事务内 CAS 抢占
      ├──────────────┬─────────────────┐
      ▼              ▼                 ▼
┌──────────┐   ┌─────────┐      ┌────────────┐
│ SUCCESS  │   │ FAILED  │      │ (CAS 未抢到) │
└──────────┘   └─────────┘      └──────┬─────┘
               确定性失败              │ 已被其他处理者置 SUCCESS
               人工排查                │ 幂等成功,不重复发货
                                      ▼
                                 保持 SUCCESS
```

规则:

- `NOT_CALLED → PENDING`:`order_success` 在 `PENDING → PAID` 的同一次 CAS 里一并写入。
- `PENDING → SUCCESS`:履约事务内 CAS 抢占(`_claim_order_callback_success`),在同事务内完成发货。
- `PENDING → FAILED`:`mark_callback_failed` CAS;履约确定性业务错误时设置。
- 补偿任务同时扫描 `PENDING` 与 `FAILED`,重新调用履约入口(`@tech-支付与履约.md`);CAS 保证不重复发货。

## 6. 订单号生成

```python
# OrderService._generate_order_no
import random, time
timestamp = int(time.time() * 1000)
random_part = random.randint(0, 9999)
return f"ORD{timestamp}{random_part:04d}"
```

- 格式:`ORD` + 毫秒时间戳 + 4 位随机数(`0-9999`,零填充)。
- 字段长度 `String(32)`,足够容纳毫秒时间戳 + 4 位随机。
- 唯一性靠时间戳精度 + 随机数;`order_no` 上有 unique 约束兜底。

## 7. 订单过期机制

- 订单创建时 `expired_at = now + 30 * 60 * 1000`(毫秒)。
- `expired_at` 只用于:
  - 客户端未完成订单列表可见性过滤(`order_service.order_lists(expires_after_ms=now)`)。
  - 创建支付入口时的订单快照校验(provider 拒绝为已过期订单创建 invoice)。
- `expired_at` **不用于**:
  - 拒绝渠道 webhook 回调：已进入支付流程的回调即使过期也允许完成。
  - 拒绝履约。
- **系统不依赖自动过期任务**:没有任何 cron 把订单状态改成 `EXPIRED`;`EXPIRED` 当前不写入。

## 8. 幂等与并发控制(CAS)

订单系统的并发安全完全靠 SQL 层 CAS(`UPDATE ... WHERE order_status = expected`),不引入分布式锁。

### 8.1 支付回调幂等(`order_success`)

```text
order_success(order_no, channel_order_no, channel_uid, payment_method, paid_*)
  │
  ├─ 订单不存在 → OrderSuccessError(不履约)
  ├─ 校验 paid_amount / paid_currency 与订单一致 → 不一致 OrderSuccessError
  │
  ├─ 订单已 PAID → _handle_paid_order_success (重复回调幂等成功)
  │     ├─ channel_order_no / channel_uid / payment_method 不一致 → OrderSuccessError
  │     └─ 一致 → 返回 idempotent=True, callback_triggered=False(不重复发货)
  │
  ├─ 订单非 PENDING 且非 PAID → OrderSuccessError(不可支付)
  │
  └─ 订单 PENDING:
        CAS UPDATE order_status PENDING -> PAID, 写入支付快照与 callback_status=PENDING
        ├─ CAS 影响 0 行(被并发抢占)→ 重新读订单,按已 PAID 幂等处理
        └─ CAS 影响 1 行 → 触发履约 _trigger_order_success_callback
```

关键点:

- 金额判断只用 `currency + amount`(6 位精度整数),避免浮点误差。
- 不再保存渠道原始金额字段;渠道协议单位只在 provider 边界转换。
- 不保留历史金额字段;新订单金额判断只使用 `amount`。
- 已 PAID 订单的重复回调:校验 `channel_order_no` / `payment_method` 一致后返回幂等成功,不重复发货、不重复发 Bot 消息。PayPal 一次性订单的 `channel_order_no` 使用 PayPal order id;PayPal 自动续费订单的 `channel_order_no` 使用本次扣款 transaction/capture id。
- Bot 购买成功消息只在 `idempotent=False`(首次成功)时发送(`@tech-支付与履约.md`)。

### 8.2 履约幂等(`_fulfill_paid_order_once`)

```python
async with get_async_session() as db:
    claimed = await _claim_order_callback_success(db, order_no)
    # CAS: WHERE order_status=PAID AND callback_status IN (PENDING, FAILED)
    #      SET callback_status=SUCCESS
    if not claimed:
        return await _is_order_callback_success(order_no)  # 已被其他处理者成功
    await _fulfill_order_product(db, order)  # 按商品类别发货(同事务)
    await db.commit()
    return True
```

- 同事务内先 CAS 抢占 `callback_status` 为 `SUCCESS`,再执行业务发货,最后 `commit`。
- CAS 影响 0 行说明已被其他处理者(webhook / 并发补偿)抢占,查询确认是 `SUCCESS` 后返回幂等成功,不重复发货。
- 业务发货异常 → 整事务回滚,`callback_status` 回到 `PENDING` 或 `FAILED`,等待下轮补偿或人工排查。
- 整个履约被 `ORDER_FULFILLMENT_TIMEOUT_SECONDS = 10` 秒 `asyncio.wait_for` 包裹;超时返回 `False`(不主动标 `FAILED`,由补偿任务下轮重试)。
- 履约抛确定性异常时 `mark_callback_failed` 把 `callback_status` CAS 为 `FAILED`(从 `PENDING` 抢占);运行时异常(锁、连接、超时)不标 `FAILED`,保留 `PENDING`。

### 8.3 履约发货分发(`_fulfill_order_product`)

```python
if order.product_class == ProductClass.SUBSCRIPTION.value:
    await subscription_service.fulfill_paid_order(db, order)  # 订阅域:给 user_subscriptions 加时间
elif order.product_class == ProductClass.RECHARGE.value:
    credits_amount = self._recharge_order_credits_amount(order) # 从订单快照读 credits_amount
    await user_credit_service.add_balance_in_session(...)       # 积分域:加 Credits 余额
else:
    raise ValueError(f"No fulfillment handler for product_class: {order.product_class}")
```

- 订单侧只负责"按商品类别分发到对应业务域的发货能力 + 同事务抢占状态";具体发货实现不在订单域。
- `SUBSCRIPTION` 的快照与渠道账期由订阅域解释,订单域不重读当前订阅配置;字段与履约规则见 [`006 · 订阅商品与状态` 的“订单履约”](../006.订阅系统/tech-订阅商品与状态.md#订单履约)。
- `RECHARGE` 的 `credits_amount` 从订单 `extra_metadata.product_snapshot.credits_amount` 读取(下单时由积分域 `check_product` 写入快照),不从当前积分配置重读,避免改价后到账数量漂移。

### 8.4 取消订单幂等(`cancel_user_order`)

- 只能取消当前用户自己的 `PENDING` 订单。
- 已支付 / 已取消 / 已退款订单返回 `ORDER_CANNOT_CANCEL`,不取消。
- 取消用 CAS(`PENDING → CANCELLED`);并发抢占失败返回 `ORDER_CANNOT_CANCEL`。

## 9. 订单 service 关键方法契约

`backend/src/app/services/order_service.py`,`@singleton class OrderService(BaseService[OrderModel])`,全局实例 `order_service = OrderService()`。

### 9.1 下单参数对象

```python
@dataclass
class OrderCheckProductParam:   # 下单前校验输入(api 层组装,service 层校验)
    user_id: int
    product_class: int
    product_id: str
    payment_method: str
    amount: int                 # 客户端当前看到的渠道金额,6 位精度整数(待校验)
    currency: str
    auto_renew: bool = False
    period: str = "none"
    client_ip: Optional[str] = None
    language: Optional[str] = None
```

规则:

- `OrderCheckProductParam` 的金额字段是"待校验输入",不直接落库。
- API 层把请求中的 `auto_renew / period` 原样写入 `OrderCheckProductParam`。订阅域用二者校验商品模式和周期未在用户确认后变化,渠道价格按 `(product_id,channel_code)` 定位;详细合同见 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。Credits 域不读取二者,并固定返回 `auto_renew=false` 的 `OrderCreateParam`。
- `OrderCreateParam` 的当前完整字段以 [`backend/src/app/constants/order.py`](../../../backend/src/app/constants/order.py) 中的 `class OrderCreateParam` 为准,本文不复制快速变化的内部对象形状。
- `OrderCreateParam` 是商品域校验后生成的最终落单快照;`create_order`、provider 创建支付、订单落库都只认它。API 层把其中的 `auto_renew / provider_sku` 传给支付 provider。

### 9.2 关键方法

| 方法 | 职责 |
| --- | --- |
| `check_product(param) -> OrderCreateParam` | 按 `product_class` 分发到订阅域 / 积分域校验,返回落单快照 |
| `create_order(param) -> OrderModel` | 生成订单号、算过期、归一化金额、合并客户端语言到 `extra_metadata`,落库 |
| `order_lists(*filters) -> list[OrderModel]` | 通用条件查询(支持订单号、用户、状态、商品类别、支付方式、时间窗、是否有支付入口数据等),SQL 层过滤,不在 Python 里全量过滤 |
| `count_orders(*filters) -> int` | 同 `order_lists` 条件的计数 |
| `get_order_by_no(order_no) -> OrderModel \| None` | 按订单号查单(走 `order_lists` 复用过滤) |
| `save_order_payment_data(order_no, payment_data) -> bool` | CAS 保存支付入口数据(要求订单仍为 `PENDING`) |
| `cancel_user_order(order_no, user_id) -> OrderModel` | 用户取消自己的 `PENDING` 订单,CAS 置 `CANCELLED` |
| `decode_order_payment_data(raw, *, context) -> dict \| None` | 解析订单 `payment_data` JSON,坏数据返回 None 并记录上下文日志 |
| `order_success(*, order_no, channel_order_no, channel_uid, payment_method, extra_metadata, paid_amount, paid_currency) -> dict` | 支付渠道确认成功后的统一入口:校验金额、CAS 置 PAID、触发履约、返回 `{order_no, idempotent, callback_triggered}` |
| `mark_callback_failed(order_no) -> bool` | 把 `callback_status` 从 `PENDING` CAS 为 `FAILED`(履约确定性失败时) |
| `fulfill_paid_order(order) -> bool` | 履约入口:10 秒超时包裹,内部同事务 CAS + 发货;成功 True / CAS 未抢到或已被处理 False / 确定性业务错误 `mark_callback_failed` 后 False / 运行时异常或超时保留 `PENDING` 后 False |

### 9.3 订单列表查询过滤实现

`order_lists` / `count_orders` 共用 `_apply_order_list_filters`,所有过滤条件在 SQL `WHERE` 完成,禁止先 SELECT 全量再在 Python 里逐行过滤(遵循项目规范)。支持过滤:`ids / order_nos / order_no_like / user_ids / order_statuses / callback_statuses / product_classes / product_ids / payment_methods / payment_channel_order_no_like / payment_transaction_id_like / created_before_ms / created_after_ms / updated_before_ms / updated_after_ms / expires_after_ms / has_payment_data`。

排序 `order_by` 支持枚举:`created_at_asc / created_at_desc / updated_at_asc / updated_at_desc / id_asc / id_desc`,每个枚举映射到带 `id` 次级排序的元组,保证分页稳定。

### 9.4 插件订单定位与恢复

`extension/src/background/services/orderCheckout.ts` 的 `createCheckoutOrder` 在返回收银台前保存唯一 `{userId, orderNo}` 定位到 `latest_order_reference`；不在客户端保存交易阶段。`PremiumView.enterView` 重开时只取当前用户引用并查询服务端 status，轮询仅在 popup 存活期间运行。其他账号的引用不返回，也不因此删除。

仅服务端终态或订单不存在时，按当前用户与订单号匹配清除引用；网络错误、超时、关闭视图或取消等待保留引用，用户可重开再查。价格更新拒绝经 background typed 结果保留为 `priceUpdated`，视图重新读取 checkout 配置。支付与履约仍由原服务端链路完成。

## 10. 事务边界

- **api 层不直接调事务**:api 入口只做参数校验与编排(`order_client.py`),事务全在 service 层。
- **下单不是一个大事务**:`check_product` → `create_order`(独立事务落库)→ `provider.create_payment`(无事务,HTTP 调用)→ `save_order_payment_data`(独立 CAS 事务)。支付入口创建失败时已创建订单不回滚,用户重试即可(遵循"允许局部出错"原则)。
- **支付成功 + 履约是同一事务**:`order_success` 先 CAS 置 PAID(独立事务),再触发履约 `_fulfill_paid_order_once`(独立事务:CAS 抢占 `callback_status=SUCCESS` + 业务发货 + commit)。履约事务回滚时 `callback_status` 不变(回到抢占前的 `PENDING` / `FAILED`)。
- **每个事务用独立 async session**;更新操作在事务内重新查询对象,避免 detached instance 问题。

## 11. 金额归一化

金额模型见 `@tech-金额模型.md`。本域只保留单字段 `amount / paid_amount`，均为 6 位精度整数（真实金额 × 1_000_000）。PayPal 美分与字符串、Clink 十进制数值等渠道协议单位只在 provider 边界转换。

## 12. 验收(数据与状态机层)

- `orders` 表字段、索引符合本文约定;`order_no` unique、`user_id` index,无低基数单列索引。
- 订单状态 / 履约回调状态是整数枚举,客户端接口返回整数。
- 订单创建即 `PENDING`,过期 30 分钟;系统不主动把订单改成 `EXPIRED`。
- 支付回调并发到达同一订单时只有一个能 CAS 成功置 PAID;重复回调幂等成功,不重复发货。
- 履约 CAS 保证同一订单只有一个处理者能发货;并发 webhook 与补偿任务不会重复加积分或重复延长订阅。
- 自动续费同一渠道扣款号只能对应一条订单,重复 webhook 不重复创建续费订单。
- 订单列表查询在 SQL 层过滤,不在 Python 里全量加载逐行过滤。
- 订单金额判断只用 `currency + amount`(6 位精度整数)。
- `callback_logs` 表当前不被业务逻辑写入;订单履约状态以 `orders.callback_status` 为准。
