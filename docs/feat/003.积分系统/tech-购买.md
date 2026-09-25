# 003 · Credits 购买(商品 + 双渠道支付确认 + 下载弹窗 + pricing 入口)

> 技术实现文档。覆盖:积分包商品配置与定价、Clink / PayPal 支付方式确认、积分不足购买弹窗交互、pricing 页主动购买入口与支付回跳。
>
> 关联:
> - 本域产品:`@feat.md`
> - 余额数据模型与扣费:`@tech-数据模型与扣费.md`
> - 前端 Credits 展示与旧额度清理:`@tech-前端与清理.md`
> - 订单创建、`check_product`、支付 provider、履约框架:`@../004.订单系统/feat.md`
> - 金额单字段模型、6 位精度、provider 边界转换:`@../004.订单系统/tech-金额模型.md`
>
> 来源:原 `feat.051.004 Credits 积分包商品配置与订单履约` + `feat.051.005 website 积分不足购买弹窗` + `feat.051.006 website 旧 pricing 退出与支付回跳`。

## 0. 域边界

本文件只描述 Credits **商品侧**:积分包商品定义、档位、定价读取接口、website 购买弹窗、pricing 页购买入口与支付方式确认。

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
- website Credits 购买同时暴露 `clink` 与 `paypal`,默认选中 `clink`(`DEFAULT_ORDER_PAYMENT_METHODS = ['clink', 'paypal']`)。
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

订单创建、`check_product` 校验、provider 创建支付、订单落库、履约加积分、回调幂等,均属 `@../004.订单系统`。本节只记录 Credits 商品接入订单系统的接口契约,便于商品侧与弹窗侧对齐。

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
- `display_amount` 只用于弹窗展示和埋点,不随下单请求提交,也不参与支付验价。
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
- 必须重新请求 `/api/client/credit/checkout-configs`,以最新商品配置整体刷新弹窗。

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

## 3. 积分不足购买弹窗(website)

把 Credits 购买能力做成独立可复用组件;`workspace` 只作为首个触发入口,在 Credits 不足时拉起弹窗,完成下单、支付、轮询、成功刷新余额的完整前端闭环。

### 3.1 组件目录与责任划分

```text
website-shared/src/components/credit-purchase/
  CreditPurchaseModal.astro
  credit-purchase-controller.ts
  credit-purchase-elements.ts
  credit-purchase-state.ts
  credit-checkout.ts
  credit-purchase-types.ts
```

| 文件 | 职责 |
| --- | --- |
| `CreditPurchaseModal.astro` | 只负责 DOM、data attributes、脚本挂载、样式壳 |
| `credit-purchase-elements.ts` | 查询和维护组件内部 DOM 引用 |
| `credit-purchase-state.ts` | 管理组件内部状态类型 |
| `credit-checkout.ts` | Credits 商品接口、订单创建、渠道支付入口读取、状态轮询接口 |
| `credit-purchase-controller.ts` | open/close、商品选择、支付方式选择、协议勾选、下单、轮询、success 收口 |
| `credit-purchase-types.ts` | 对外暴露组件事件和 open 参数 |

规则:

- 弹窗组件自己维护购买状态机。
- `workspace` 不持有订单轮询和支付细节,只持有"是否请求打开弹窗"的轻状态。
- 弹窗组件通过公开方法暴露:`openCreditPurchaseModal(options)` / `closeCreditPurchaseModal()` / `refreshCreditPurchaseBalance()`。

### 3.2 对外类型

```ts
export interface CreditPurchaseOpenOptions {
  source: 'workspace_download' | 'workspace_batch_download' | string
  reason: 'credits_insufficient'
  requiredCredits?: number | null
  productHintId?: string | null
}

export interface CreditPurchaseSuccessPayload {
  orderNo: string
  purchasedCredits: number
  latestBalance: number
}

export interface CreditPurchaseController {
  open(options: CreditPurchaseOpenOptions): Promise<void>
  close(): void
  isOpen(): boolean
}
```

- `requiredCredits` 用于未来做"还差多少 Credits"引导文案,本期可选。
- `productHintId` 用于未来高亮推荐档位,本期不强依赖。

### 3.3 DOM / data-attr 契约

`CreditPurchaseModal.astro` 提供以下 data attributes:

| selector | 元素 | 说明 |
| --- | --- | --- |
| `[data-credit-purchase-modal]` | 根节点 | 组件挂载根 |
| `[data-credit-purchase-close]` | 按钮 | header `X` 关闭入口;遮罩只做聚焦,不点击关闭 |
| `[data-credit-purchase-title]` | 文本 | 弹窗标题 |
| `[data-credit-purchase-status]` | 文本 | 当前状态文案 |
| `[data-credit-purchase-error]` | 文本 | 错误提示 |
| `[data-credit-purchase-list]` | 容器 | 商品卡片列表容器 |
| `[data-credit-purchase-card]` | 容器 | 单个商品卡 |
| `[data-credit-purchase-product-id]` | dataset | 商品标识 |
| `[data-credit-purchase-price]` | 文本 | 展示美元价 |
| `[data-credit-purchase-credits]` | 文本 | 展示 Credits 数量 |
| `[data-credit-purchase-buy]` | 按钮 | 商品卡片 Buy Now,进入支付方式确认界面 |
| `[data-credit-purchase-payment-dialog]` | 容器 | 支付方式确认界面 |
| `[data-credit-purchase-payment-title]` | 文本 | 支付方式确认界面标题 |
| `[data-credit-purchase-payment-error]` | 文本 | 支付方式确认界面错误提示 |
| `[data-credit-purchase-selected-summary]` | 容器 | 已选商品摘要 |
| `[data-credit-purchase-selected-price]` | 文本 | 已选商品美元展示价 |
| `[data-credit-purchase-selected-credits]` | 文本 | 已选商品 Credits 数量 |
| `[data-credit-purchase-channel-list]` | 容器 | 支付方式列表 |
| `[data-credit-purchase-payment-method]` | radio 行按钮 + dataset | 单个支付方式,值为支付方式标识 |
| `[data-credit-purchase-back-to-products]` | 按钮 | 从支付方式确认界面返回商品列表 |
| `[data-credit-purchase-payment-submit]` | 按钮 | Continue to payment,创建订单并拉起支付入口 |
| `[data-credit-purchase-agreement]` | checkbox | 协议勾选框 |
| `[data-credit-purchase-terms]` | 链接 | 服务条款 |
| `[data-credit-purchase-privacy]` | 链接 | 隐私政策 |
| `[data-credit-purchase-success-panel]` | 容器 | success 态到账信息面板 |
| `[data-credit-purchase-success-balance]` | 文本 | success 态余额 |
| `[data-credit-purchase-success-credits]` | 文本 | success 态到账 Credits |
| `[data-credit-purchase-order-close]` | 按钮 | 订单弹窗底部关闭按钮,pending / failed / success 都只关闭弹窗并停止轮询,不取消后端订单 |
| `[data-credit-purchase-order-support]` | 容器 | 反馈邮箱行,含 `mailto:` 链接 |

DOM 结构约束:

- 商品列表界面、支付方式确认界面、订单等待界面是三个互斥视图。
- 商品列表界面包含 `header + 安装引导栏 + middle`,不包含协议 footer；引导栏合同见下节。
- 支付方式确认界面包含 `header + middle + footer`;协议和 Continue to payment 只在这一层出现。
- `middle` 是唯一可滚动区。
- 关闭按钮和协议勾选不能放进滚动区。
- 所有可点击按钮都要能通过 `data-*` 单独查询,方便无框架测试和后续 E2E。

#### 积分不足安装引导

在积分不足购买弹窗标题下、套餐列表上方展示轻量引导栏，沿用套餐选择与购买支付流程；不新增前置选择页或第四张套餐卡。

- 引导栏由简短说明和一个动作组成，位于套餐滚动区域外；动作是紧跟说明右侧的实心按钮；移动端自然换行，高度随内容撑开。字号、颜色、间距和焦点样式复用现有样式，长文案不得遮挡标题、关闭按钮或套餐。
- 动作仅在用户点击时导航；关闭弹窗不跳转，用户仍可直接选择套餐并继续购买。引导栏不进入支付渠道和支付结果视图。
- 动作文字使用“安装插件”语义，指向插件安装页；文案纳入 i18n，不承诺未经核实的无限下载权益。
- 引导栏在弹窗与控制器内实现，复用安装 URL 与 i18n；不新增后端接口、数据库变更、依赖、组件或持久状态。

规则：

- 说明文本取 `creditCopy.installGuide`，动作链接文本取 `creditCopy.installExtension`，去向为弹窗入参 `installUrl`（由页面传入的扩展安装地址）。
- 动作仅在用户点击时导航；关闭弹窗不跳转，用户仍可直接选择套餐并继续购买。引导栏不进入支付渠道和支付结果视图。
- 单项下载不足、批量下载不足，以及余额为零且不可签到的入口统一进入本弹窗；可签到时继续优先签到。

相关实现：`CreditPurchaseModal.astro`、`credit-purchase-controller.ts` 及必要的元素和用户类型接线、主站 i18n；入口核对 [workspace.ts](../../../website-shared/src/download/scripts/workspace.ts) 的 `creditPurchaseController.open`。

### 3.4 UI 规格

#### Header

- 高度:`72px`
- 内容:左侧标题 + 右侧 `X` 按钮
- 固定不滚动

#### Middle

- 自适应高度
- `overflow-y: auto`
- 商品列表视图:只展示商品卡片,桌面端三张卡片横向排列;移动端卡片纵向排列
- 支付方式确认视图:支付方式行纵向排列,参考"radio 行 + 右侧图标 + 底部继续按钮"的逻辑,不复用外部截图色调,不渲染截图里的 `Current total` 价格区

#### Footer

- 商品列表视图无 footer。
- 支付方式确认视图 footer 高度:`88px` 起,左侧协议勾选,右侧返回 / Continue to payment。
- 固定不滚动

#### 卡片规格

| 元素 | 桌面 | 移动 |
| --- | --- | --- |
| 卡片宽度 | `minmax(0, 1fr)` 三列 | `100%` 单列 |
| 卡片最小高度 | `252px` | `220px` |
| 价格字号 | `48px` | `36px` |
| 商品按钮高度 | `52px` | `52px` |
| 支付方式行高度 | `96px` | `84px` |
| Continue to payment 按钮高度 | `56px` | `56px` |

展示约束:

- 商品列表和支付方式确认页都只显示美元展示价(`display_currency + display_amount`)。
- 支付方式确认页展示可用支付渠道的名称和短说明,不显示 `currency / amount / provider_sku` 等渠道价信息。
- 支付方式确认页底部只放返回 / 确认支付等操作按钮和必要状态,不额外放总价区,避免把渠道价误展示给用户。
- 默认选择遵循[订单支付渠道规则](../004.订单系统/feat.md#现状说明):`DEFAULT_ORDER_PAYMENT_METHODS = ['clink', 'paypal']`,均不可用时回落到配置中的首个渠道。

### 3.5 前端接口层

```text
website-shared/src/components/credit-purchase/credit-checkout.ts
```

建议接口函数:

```ts
listCreditCheckoutConfigs(context): Promise<CreditCheckoutPlan[]>
formatCreditDisplayPrice(currency, amount): string
formatCreditUnitLabel(template): string
formatCreditDisplayUnitPrice(currency, amount, creditsAmount): string
```

规则:

- Credits 购买流程不直接耦合下载工作区。
- 购买弹窗只依赖 Credits 购买接口与公共 OrderCheckout 协议,不依赖订阅接口。
- `workspace` 不直接调用订单接口;由购买弹窗组件内部完成。
- 订单创建、订单状态轮询、支付入口 URL 读取与校验统一在公共模块 `website-shared/src/components/order-checkout/`(`order-checkout-api.ts` 的 `readPaymentUrl`):按 `payment_method` 校验协议与域名白名单——`paypal` 只允许 `https:` 且 host 为 `paypal.com` 或其子域;`clink` 只允许 `https:` 且 host 为 `checkout.clinkbill.com` 或 `uat-checkout.clinkbill.com`;候选字段依次取 `checkoutUrl` / `payment_url` / `url` / `approval_url`。
- PayPal success/cancel 回跳页 URL 包含本地 `order_no`;页面只作为用户收口和同源通知入口。success 页不触发发货,cancel 页调用现有订单取消接口后通知原购买弹窗;最终展示只按本地订单状态判断。

`CreateOrderResponse` 包含 `support_mail: string`,来自后端 `config_public.support_mail`;空字符串表示等待支付界面不展示反馈邮箱。

### 3.6 下载错误到购买弹窗的映射

`workspace` 捕获下载错误并决定是否拉起购买弹窗:

| 后端 code | 前端行为 |
| --- | --- |
| `10201 QUOTA_EXCEEDED` | 已登录用户打开购买弹窗;未登录用户只打开登录弹窗,不自动续购买流程 |
| 其他下载错误 | 不拉起购买弹窗 |

批量下载规则:某个资源开始前收到 Credits 不足时,停止剩余资源、保留已完成结果、调用独立购买弹窗组件。

接线方式:

- `workspace` 只依赖 `CreditPurchaseController` 接口,不依赖组件内部状态字段。
- 购买成功后,组件通过自定义事件通知外部刷新用户信息。

```ts
'credit-purchase:success'   // payload: { orderNo, purchasedCredits, latestBalance }
'credit-purchase:close'
```

### 3.7 状态机

```text
idle
  -> loading_configs
  -> ready
  -> selecting_payment_method
  -> creating_order
  -> pending_payment
  -> success
  -> failed
```

状态切换规则:

- `open()`:没有缓存商品则 `loading_configs`,成功后 `ready`。
- 点击商品卡片内 `Buy Now`:`selecting_payment_method`,默认选中 `DEFAULT_ORDER_PAYMENT_METHODS` 中的首个可用渠道(`clink`,不可用回落 `paypal`)。点击卡片空白不切换视图。
- 在支付方式确认界面点击返回:`ready`。
- 点击 `Continue to payment`:`creating_order`,成功后 `pending_payment`。
- 轮询成功:`success`。
- 下单失败:停留在 `selecting_payment_method` 并展示错误,允许换渠道或重试。
- 轮询失败 / 取消 / 过期:`failed`。
- 点击关闭:直接回到 `idle`。

按钮可用性:

| 状态 | 商品按钮 | Continue to payment | 刷新按钮 | 关闭按钮 |
| --- | --- | --- | --- |
| `loading_configs` | 禁用 | 禁用 | 禁用 | 可用 |
| `ready` | 可用 | 禁用 | 禁用 | 可用 |
| `selecting_payment_method` | 禁用 | 协议勾选且有可用渠道时可用 | 禁用 | 可用 |
| `creating_order` | 禁用 | 禁用 | 禁用 | 可用 |
| `pending_payment` | 禁用 | 禁用 | 可用 | 可用 |
| `success` | 禁用 | 禁用 | 禁用 | 可用 |
| `failed` | 可重新选商品 | 禁用 | 禁用 | 可用 |

下单与轮询规则:

- 每次点击 `Continue to payment` 都调用 `/api/client/order/create` 新建订单。
- 下单参数必须来自"已选商品 + 已选支付渠道",不使用商品默认渠道隐式下单。
- 第一层商品列表不创建订单,不读取默认渠道隐式下单。
- 下单响应 `support_mail` 非空时,`pending_payment` 和 `failed` 状态在 middle 中展示一行支持邮箱。
- 不查询 `/api/client/order/unfinished`,不展示未完成订单列表。
- 自动轮询间隔沿用现有订单状态轮询常量(订单侧)。
- PayPal 订单在前端轮询超时前仍未成功时保持 `pending_payment`,提示用户可手动刷新;不因 success 回跳页未打开就判失败。
- 保留"我已支付,刷新结果"按钮。
- PayPal success/cancel 回跳页通过 `BroadcastChannel("credit_purchase_paypal_return")` 或 `window.opener.postMessage` 通知原页面 `{ provider: "paypal", orderNo, status: "success" | "cancel" }`;原页面收到后立即触发一次订单状态刷新,仍以轮询到本地 `PAID + SUCCESS` / `CANCELLED` 为准。
- 用户主动关闭弹窗时,组件内部停止轮询,不保留恢复状态,不调用 `/api/client/order/cancel`。

### 3.8 支付成功态

进入条件:`order_status=PAID && callback_status=SUCCESS`。

- success 态展示:购买成功标题、当前到账 Credits 数量、刷新后的最新余额。
- success 态使用紧凑成功面板:左侧非交互 check 图标,右侧到账数量和当前余额;桌面订单弹窗宽度控制在约 `700px`,避免全屏感。
- 成功后调用 `/api/client/auth/me` 刷新 `credits_balance`。
- 弹窗不自动关闭,用户自己点 `X` 关闭;success 态底部按钮文案使用关闭语义,不再显示取消支付。
- 关闭后用户自己重新点击下载。
- 余额刷新结果通过组件事件或回调通知 `workspace` 更新 UI,不能反向耦合读取 `workspace` 内部状态。

### 3.9 错误码与前端状态映射

| 后端 code | 前端状态 | 用户可见行为 |
| --- | --- | --- |
| `10201 QUOTA_EXCEEDED` | 不属于组件内部状态 | `workspace` 捕获后打开购买弹窗 |
| `21005 PAYMENT_PRICE_UPDATED` | `failed` | 提示价格已更新,重新拉取 configs,允许重试 |
| `21001 PAYMENT_GATEWAY_ERROR` | `failed` | 提示支付网关失败,不打开外部支付页 |
| `21004 PAYMENT_UNSUPPORTED_METHOD` | `failed` | 提示当前支付方式不可用,允许返回支付方式确认页切换渠道 |
| `20001 ORDER_NOT_FOUND` | `failed` | 提示订单不存在,允许重新下单 |
| `20003 ORDER_EXPIRED` | `failed` | 提示订单已过期,允许重新下单 |
| `10001/10013 AUTH_INVALID_TOKEN/AUTH_TOKEN_EXPIRED` | 组件关闭 | 清理登录态,弹登录框 |
| 其他未知错误 | `failed` | 展示通用失败文案,允许关闭或重试 |

前端映射规则:

- `ORDER_EXPIRED` 是创建支付入口 / 订单校验时可能返回的错误码,不表示后端会把订单状态自动改成 `EXPIRED`。
- `PAYMENT_PRICE_UPDATED` 时必须重新请求 `/api/client/credit/checkout-configs`。
- `AUTH_*` 失败不保留购买中间态,直接退回登录。
- `ORDER_STATUS=PAID && CALLBACK_STATUS=PENDING` 时仍显示 `pending_payment`,不要误判成功。
- `ORDER_STATUS=PAID && CALLBACK_STATUS=FAILED` 时显示 `failed`,提示联系客服或稍后重试,不自动加积分。

### 3.10 反馈邮箱展示

- 数据源:`/api/client/order/create` 响应里的 `support_mail`。
- DOM:`[data-credit-purchase-order-support]`,包含前缀文本和 `mailto:` 链接。
- 展示状态:`pending_payment`、`failed`。
- 隐藏状态:`success`、`ready`、`creating_order`、`loading_configs`。
- 空字符串:整行隐藏。

## 4. Pricing 入口与支付回跳

新 pricing 页重新成为主动购买入口。Credits 购买有两个入口:下载工作区积分不足弹窗、pricing 页主动购买卡片。两个入口必须复用同一套 Credits 商品配置、订单创建、支付回跳和状态轮询能力。

### 4.1 下载工作区去 pricing 依赖

修改:

```text
website-shared/src/download/components/SharedDownloadWorkspace.astro
website-shared/src/download/scripts/workspace-state.ts
website-shared/src/download/scripts/workspace.ts
```

规则:

- 删除 `pricingPath` 在下载购买场景中的职责。
- Credits 不足不再 `window.location.assign(state.pricingPath)`。
- 下载工作区内部直接打开购买弹窗(见 §3)。

### 4.2 PayPal / Clink 回跳页

修改:

```text
website/src/pages/paypal/success.astro
website/src/pages/paypal/cancel.astro
website/src/pages/clink/success.astro
website/src/pages/clink/cancel.astro
website-shared/src/components/credit-purchase/paypal-return.ts
```

规则:

- 回跳页只用于展示状态与通知原购买弹窗,不发货;积分到账只认后端订单状态。
- cancel 页可调用现有订单取消接口把本地待支付订单置为取消。
- 回跳页带 `order_no`,并按订单状态响应的 `product_class` 决定「返回价格页」指向 `/ext-pricing/`(订阅)或 `/pricing/`(积分)。

### 4.3 website pricing 路由

修改:

```text
website/src/pages/pricing.astro
website/src/pages/[lang]/pricing.astro
website/src/components/pages/PricingPage.astro
website/src/scripts/pricing/page.ts
website/tests/module-scripts.test.js
website/e2e/website.spec.ts
website/public/robots.txt
website/src/sitemap/languageSitemap.mjs
website/deploy/vimeo-web.conf
website/deploy/vimeo-web-test.conf
```

规则:

- pricing 页展示 50 / 200 / 1000 Credits,并可直接购买。
- pricing 页不复制商品定价;必须读取后端 Credits checkout 配置。
- pricing 页的 Credits 购买仍创建一次性订单,履约到账逻辑与下载弹窗一致。
- 与 SEO 相关的 `/pricing/` 规则按公开购买页处理:主站 pricing 可进入 sitemap,但不进入 LLM 索引。

### 4.4 代码复用与删除

- 把 pricing 页与下载弹窗共用的订单创建、支付入口读取、状态轮询工具放到共享模块。
- 删除 website 侧仅服务旧订阅 pricing 的残留状态和测试数据。
- Credits 一次性订单不恢复很久以前的 pending 订单;用户关闭页面后可重新购买。

## 5. i18n

修改 `website/src/i18n/lang/*.ts` 与 `website/src/i18n/schema.ts`。

新增文案:购买弹窗标题/描述/按钮、Credits 不足错误、协议文案、支付中/支付成功/支付失败状态、支付等待页反馈邮箱前缀、手动刷新文案。

删除或停用文案:Website 订阅升级 CTA、跳 pricing 文案、Website 订阅套餐购买文案。

## 6. 验收标准

商品与订单:

- [ ] 后端可以返回 3 档 Credits 商品配置。
- [ ] `RECHARGE` 商品下单时,客户端提交的价格字段会被校验。
- [ ] `RECHARGE` 商品下单时,订单金额和币种最终以 `check_product()` 返回结果为准。
- [ ] Clink 支付成功后能给当前用户到账 Credits。
- [ ] PayPal 支付成功后能给当前用户到账 Credits。
- [ ] webhook 重复回调不重复加积分。
- [ ] 履约失败时订单能进入补偿链路(订单侧)。

购买弹窗:

- [ ] Credits 不足时在下载页弹购买弹窗。
- [ ] 未登录时只弹登录,不自动接着弹购买。
- [ ] 第一层购买弹窗只显示商品列表,不显示支付方式、协议或渠道价。
- [ ] 桌面端卡片横向,移动端卡片纵向,header 固定,中间滚动。
- [ ] 点击商品包内 `Buy Now` 后进入支付方式确认界面,默认选中首个可用渠道(`clink` 优先,不可用回落 `paypal`)。
- [ ] 未勾选协议前 `Continue to payment` 不可点击,但第一层商品 `Buy Now` 仍可进入支付方式确认界面。
- [ ] 支付方式确认界面展示全部可用渠道(当前是 `Clink` 与 `PayPal`),且不展示渠道价、币种金额或 provider SKU。
- [ ] Clink / PayPal 都在新窗口或新标签页打开支付入口,原弹窗保留等待态并轮询订单状态。
- [ ] PayPal success/cancel 回跳页不会直接给用户加积分;积分到账只认后端订单状态。
- [ ] PayPal cancel 回跳页能调用现有取消订单接口,原购买弹窗轮询到 `CANCELLED` 后切取消 / 失败态。
- [ ] PayPal success 回跳页未打开时,原购买弹窗不会立刻失败,可等待 `CHECKOUT.ORDER.APPROVED` webhook 触发服务端 capture 兜底。
- [ ] 购买弹窗只显示商品美元展示价,不显示渠道价、渠道币种金额或 provider SKU。
- [ ] 创建订单返回 `support_mail` 非空时,等待支付界面展示反馈邮箱;为空时不展示。
- [ ] 支付成功后刷新余额,并显示 success 状态。
- [ ] 用户关闭弹窗后不会恢复 pending 订单。
- [ ] 批量下载遇到 Credits 不足时会停止剩余下载并弹窗。
- [ ] 购买弹窗组件可以脱离 `workspace` 单独挂载和运行。

Pricing 入口:

- [ ] 下载工作区购买不依赖 pricing 跳转。
- [ ] pricing 页可以主动购买 50 / 200 / 1000 Credits。
- [ ] 旧订阅 pricing 状态机不再承载 Credits 购买逻辑。
- [ ] 代码里没有 website 下载不足后跳 `/pricing/` 的动线。
- [ ] 下载弹窗与 pricing 页价格来自同一后端配置。

## 7. 验证命令

```bash
cd backend
uv run black --check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment
uv run ruff check src/app/models src/app/services src/app/api/client src/app/api/callback src/app/provider/payment
uv run mypy src/app/services/order_service.py src/app/services/user_credit_service.py src/app/services/credit_checkout_config_service.py
uv run pytest tests/test_server/api/test_order_api.py -rs
uv run pytest tests/test_server/api/test_clink_callback_api.py -rs
uv run pytest tests/test_server/services/test_order_service_admin_queries.py -rs
uv run pytest tests/integration/real/crons/test_order_fulfillment_real.py -rs

cd website
pnpm build
pnpm exec playwright test e2e/download-workspace.spec.ts
pnpm exec playwright test e2e/website.spec.ts
```

修改 models 后执行:

```bash
cd backend
uv run python src/app/init/sync_database_schema.py --dry-run
```

## 8. 回滚

- 停用 `config_credit_product*` 默认配置,保留表结构;购买入口前端同时下线。
- website 前端重新读取旧下载额度字段、恢复 pricing 跳转(后端兼容字段保留一版)。
- 购买弹窗下线,Credits 不足退回普通错误提示。
