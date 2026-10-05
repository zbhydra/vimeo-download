# 003 · Credits 购买(商品配置与后端购买契约)

> 技术实现文档。覆盖:积分包商品配置与定价、与订单系统的契约面、网站侧现状。网站不再提供积分包购买入口，后端链路保留（见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §8）。
>
> 关联:
> - 本域产品:`@feat.md`
> - 余额数据模型与扣费:`@tech-数据模型与扣费.md`
> - 网站 Credits 前端下线现状:`@tech-前端与清理.md`
> - 订单创建、`check_product`、支付 provider、履约框架:`@../004.订单系统/feat.md`
> - 金额单字段模型、6 位精度、provider 边界转换:`@../004.订单系统/tech-金额模型.md`
>
> 来源:原 `feat.051.004 Credits 积分包商品配置与订单履约`。

## 0. 域边界

本文件只描述 Credits **商品侧**:积分包商品定义、档位、定价读取接口，以及作为 `RECHARGE` 商品接入订单系统的契约面。

订单创建、`check_product` 校验框架、支付 provider、订单履约与回调幂等,属于订单系统,见 `@../004.订单系统/feat.md`。本文件在涉及订单处只描述"Credits 商品作为 `RECHARGE` 商品接入订单系统的契约面",不搬订单实现。

下载扣费(下载授权时按用户口径扣减、6 小时下载记录窗口去重)见 `@tech-数据模型与扣费.md`,不在本文件。

## 1. 积分包商品配置(商品侧)

### 1.1 商品定义

Credits 积分包作为 `ProductClass.RECHARGE = 2` 接入订单系统。商品定义归本域,订单履约框架归 `@../004.订单系统`。

商品配置表职责切分:

| 表 | 归属 | 职责 |
| --- | --- | --- |
| `config_credit_product` | 本域(商品侧) | 积分包商品定义:`product_id`、`credits_amount`、`product_name`、`display_amount`、`sort_order`、启用状态 |
| `config_credit_product_price` | 本域(商品侧) | 商品 × 渠道定价:`(product_id, channel_code)` 唯一,渠道金额、币种、SKU |
| 订单 / 订单履约表 | `@../004.订单系统` | 订单创建、落库、回调抢占、补偿 |

索引要求(按 `../../references/specs/spec-index.md`):

| 表 | 索引 | 服务查询 |
| --- | --- | --- |
| `config_credit_product` | `uk_config_credit_product_product_id(product_id)` unique | 商品配置读取 |
| `config_credit_product_price` | `uk_config_credit_product_price_product_channel(product_id, channel_code)` unique | 下单验价 |

不新增无实际查询用途的索引。

### 1.2 档位与默认定价

默认 3 档积分包。每个商品有一个美元展示价,并按支付渠道维护独立渠道价:

| product_id | credits_amount | display_amount(USD × 1e6) | channel_code | channel_currency | channel_amount |
| --- | ---: | ---: | --- | --- | ---: |
| `credit_50` | 50 | 5_990_000 | `paypal` | `USD` | 5_990_000 |
| `credit_200` | 200 | 12_990_000 | `paypal` | `USD` | 12_990_000 |
| `credit_1000` | 1000 | 49_990_000 | `paypal` | `USD` | 49_990_000 |
| `credit_50` | 50 | 5_990_000 | `clink` | `USD` | 5_990_000 |
| `credit_200` | 200 | 12_990_000 | `clink` | `USD` | 12_990_000 |
| `credit_1000` | 1000 | 49_990_000 | `clink` | `USD` | 49_990_000 |

- `product_name` 建议格式 `50 Credits` / `200 Credits` / `1000 Credits`。
- Credits 购买商品同时暴露 `clink` 与 `paypal`,默认选中 `clink`；该优先级是后端合同，网站已无 Credits 购买界面，订阅购买弹窗沿用同一优先级(见 `@../004.订单系统/feat.md`)。
- `display_amount` 只用于用户可见商品价格;渠道 `amount` 只用于下单校验与创建支付入口。两者都是真实金额 × 1_000_000。
- Credits 是一次性购买余额,支付确认后发放到购买账号;不自动续费、不过期、不退款、不可转赠、不可兑换现金。
- 一次性 SQL 通过 `backend/src/app/init/sql_executor.py --sql "<SQL>"` 执行:建表 + 插入 3 档商品 + 6 档渠道价格。渠道价格为坏配置时(金额非正、PayPal 非 USD、PayPal 金额不是两位小数)加载 checkout 配置直接抛 `PAYMENT_GATEWAY_ERROR`。

### 1.3 商品读取接口

```text
GET /api/client/credit/checkout-configs
```

只服务前端展示与下单原样回传,不是订单最终落单快照。后端在 `check_product()` 内重新校验价格(订单侧职责,见 `@../004.订单系统`)。

#### 顶层 `checkout_configs[]`

| 字段 | 类型 | 必填 | 说明 | 前端用途 |
| --- | --- | --- | --- | --- |
| `product_class` | int | 是 | 固定 `2`(`RECHARGE`) | 下单时原样提交 |
| `product_id` | string | 是 | 商品标识,例如 `credit_200` | 选中商品、下单时原样提交 |
| `product_name` | string | 是 | 商品名称快照,例如 `200 Credits` | 卡片标题或辅助说明 |
| `credits_amount` | int | 是 | 支付成功到账 Credits 数量 | 卡片主信息、success 态文案 |
| `display_currency` | string | 是 | 展示币种,固定 `USD` | 价格展示 |
| `display_amount` | int | 是 | 展示金额,统一 6 位精度整数,如 `15300000` | 前端格式化展示价 |
| `payment_channels` | array | 是 | 当前商品可用支付渠道列表 | 支付方式确认页展示渠道,下单时回传所选渠道 |

规则:

- `checkout_configs` 必须按 `sort_order` 升序返回。
- `display_*` 字段只服务前端展示,不表示最终落单快照。
- `credits_amount` 必须来自商品表,不从 `metadata` 临时解析。

#### `payment_channels[]`

| 字段 | 类型 | 必填 | 说明 | 前端用途 |
| --- | --- | --- | --- | --- |
| `payment_method` | string | 是 | 渠道标识,`clink` / `paypal` | 下单时原样提交 |
| `payment_method_name` | string | 否 | 渠道显示名 | 支付方式确认页展示名称 |
| `currency` | string | 是 | 渠道币种,PayPal 固定 `USD`;Clink 不限定 | 下单时原样提交 |
| `amount` | int | 是 | 渠道金额,统一 6 位精度整数 | 下单时原样提交 |
| `provider_sku` | string | 否 | 渠道 SKU | 前端不使用,仅服务排查和后端透传 |

规则:

- `payment_channels` 至少包含一个已启用且 provider 已实现的渠道;没有可用渠道的商品不允许下单。
- 前端只展示 `payment_method_name` 和渠道说明,不展示 `currency / amount / provider_sku`。
- 前端必须把选中的渠道价格原样带回 `/api/client/order/create`。
- 同一商品在不同渠道下允许不同渠道价;用户只看到顶层美元展示价。

#### 响应示例

```json
{
  "code": 10000,
  "data": {
    "checkout_configs": [
      {
        "product_class": 2,
        "product_id": "credit_200",
        "product_name": "200 Credits",
        "credits_amount": 200,
        "display_currency": "USD",
        "display_amount": 15300000,
        "payment_channels": [
          {
            "payment_method": "paypal",
            "payment_method_name": "PayPal",
            "currency": "USD",
            "amount": 15300000,
            "provider_sku": "credit-200-paypal"
          },
          {
            "payment_method": "clink",
            "payment_method_name": "Clink",
            "currency": "USD",
            "amount": 15300000,
            "provider_sku": "credit-200-clink"
          }
        ]
      }
    ]
  },
  "msg": "success"
}
```

### 1.4 商品读取服务

```text
backend/src/app/services/credit_checkout_config_service.py
```

职责:

- 从 `config_credit_product`、`config_credit_product_price`、`config_payment_channel` 读取启用配置。
- 组装客户端需要的积分包列表。
- 提供 `get_credit_checkout_config(product_id, channel_code)` 供订单侧 `check_product` 生成订单快照(订单侧调用,本域不实现 `check_product`)。
- 缓存策略与现有支付配置一致,内存 TTL 3 分钟。

## 2. 与订单系统的契约面

订单创建、`check_product` 校验、provider 创建支付、订单落库、履约加积分、回调幂等,均属 `@../004.订单系统`。本节只记录 Credits 商品接入订单系统的接口契约,便于商品侧与订单侧对齐。

### 2.1 下单请求字段(Credits 商品)

下单走统一 `/api/client/order/create`(订单侧接口,不新建专用接口):

| 字段 | 类型 | 必填 | 来源 | 作用 |
| --- | --- | --- | --- | --- |
| `product_class` | int | 是 | 前端写死 `2` | 声明本次下单是 Credits 充值商品 |
| `product_id` | string | 是 | 当前选中的积分包 | 定位商品配置 |
| `payment_method` | string | 是 | 当前选中渠道,`clink` 或 `paypal` | 定位渠道配置和 provider |
| `currency` | string | 是 | `checkout-configs` 返回值 | 参与价格校验(订单侧) |
| `amount` | int | 是 | `checkout-configs` 返回值 | 参与价格校验(订单侧) |

规则:

- `product_class != RECHARGE` 时,Credits 购买分支直接拒绝。
- `currency/amount` 必须来自最新 checkout config 中所选支付渠道,前端不能本地计算。
- `display_amount` 只用于展示和埋点,不随下单请求提交,也不参与支付验价。
- 这些金额字段是"待校验输入",不是最终落单快照;订单最终落库以 `check_product()` 返回值为准。

### 2.2 价格过期错误

订单侧 `check_product()` 比较客户端提交的 `currency/amount` 与后端当前配置,不一致时返回 `PAYMENT_PRICE_UPDATED`(code `21005`),并把最新价格回给前端:

```json
{
  "product_id": "credit_200",
  "payment_method": "paypal",
  "currency": "USD",
  "amount": 15300000
}
```

前端规则:

- 收到 `PAYMENT_PRICE_UPDATED` 后不局部修补 UI。
- 必须重新请求 `/api/client/credit/checkout-configs`,以最新商品配置整体刷新。

### 2.3 履约加积分(Credits 侧契约)

支付成功履约由订单侧 `OrderService` 解析订单商品快照,在订单事务内调用 Credits 侧的加余额方法。Credits 侧只提供加余额能力,不实现订单履约编排:

```python
class UserCreditService:
    async def check_product(self, param: OrderCheckProductParam) -> OrderCreateParam
    async def add_balance_in_session(self, db: AsyncSession, *, user_id: int, amount: int, reason: str, resource_key: str | None = None, metadata_json: str | None = None) -> CreditBalanceChangeResult
```

规则:

- `OrderService.check_product()` 遇到 `RECHARGE` 时调用 `user_credit_service.check_product()`。
- 充值履约在订单事务内调用 `user_credit_service.add_balance_in_session()`。
- 到账成功后 `user_credit_accounts.balance += credits_amount`;账户缺失时在履约内补建再加积分。
- `user_credit_logs` 只记录本次余额变化,不保存 `dedupe_key`。
- 订单回调重复到达由 `orders.callback_status` 抢占保证不重复加积分(订单侧机制)。

> 余额表、流水表、`add_balance_in_session` 的内部实现见 `@tech-数据模型与扣费.md`,本文件只记录"商品侧提供这个能力、订单侧在履约事务里调用"的契约面。

## 3. 网站现状

网站没有积分包购买入口：积分不足购买弹窗、Pricing 积分模式、下载工作区内的订单结算弹窗均已删除，网站不再调用商品读取接口。`/pricing/` 只销售插件订阅，其结算弹窗归 Pricing 所有，见 `@../011.Pricing页/tech-实现与配置.md`。

支付回跳页（PayPal 与 Clink 共 4 个路径）不区分商品类别，统一返回 `/pricing/`，说明见 `@../004.订单系统/tech-支付与履约.md`。

本文 §1、§2 的后端链路（商品配置读取、下单校验、履约加积分）保留，等待独立的「积分 / 签到下线」任务统一处理。

## 4. 验收标准

商品与订单（后端）:

- [ ] 后端可以返回 3 档 Credits 商品配置。
- [ ] `RECHARGE` 商品下单时,客户端提交的价格字段会被校验。
- [ ] `RECHARGE` 商品下单时,订单金额和币种最终以 `check_product()` 返回结果为准。
- [ ] Clink / PayPal 支付成功后能给当前用户到账 Credits。
- [ ] webhook 重复回调不重复加积分。
- [ ] 履约失败时订单能进入补偿链路(订单侧)。

网站:

- [ ] 网站代码与文案中没有 Credits 购买入口、积分购买弹窗与对应脚本。

## 5. 验证命令

```bash
cd backend
uv run black --check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment
uv run ruff check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment
uv run mypy src/app/services/order_service.py src/app/services/user_credit_service.py src/app/services/credit_checkout_config_service.py
uv run pytest tests/test_server/api/test_order_api.py -rs
uv run pytest tests/test_server/api/test_clink_callback_api.py -rs
uv run pytest tests/test_server/services/test_order_service_admin_queries.py -rs
uv run pytest tests/integration/real/crons/test_order_fulfillment_real.py -rs
```

修改 models 后执行:

```bash
cd backend
uv run python src/app/init/sync_database_schema.py --dry-run
```

## 6. 回滚

- 停用 `config_credit_product*` 默认配置,保留表结构。
