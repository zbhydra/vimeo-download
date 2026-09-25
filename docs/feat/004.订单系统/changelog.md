# 004 · 订单系统 - 变更记录

## 2026-09-19 订单列表 / 未完成订单接口标注为当前无客户端调用

**Why**：`GET /api/client/order/list` 与 `GET /api/client/order/unfinished` 在 extension / website / admin 源码中零调用方，文档却把它们与在用的下单、状态查询并列描述为客户端接口，容易被后续实现当成现行合同。

**变更**：

- `tech-支付与履约.md` §1.3 / §1.4：各加一条现状说明，标注「当前无客户端调用」（website 的支付等待与继续支付走 §1.2 单笔订单状态查询 + 前端自持的待支付记录）；两条接口本身保留为订单域通用查询能力，行为规格不变。

**已验证**：全仓 grep `order/list` / `order/unfinished` 在 extension / website / website-shared / admin 源码零命中；`/api/client/order/status` 仍被 `website-shared/src/components/order-checkout/order-checkout-api.ts` 调用。

## 2026-09-18 整仓单平台转型：Stars 支付下线与订单口径订正

**Why**：Telegram Stars 支付链路、Telegram webhook 注册与 Bot 购买成功消息已整体下线，订单系统只剩 Clink 与 PayPal 两条渠道；旧文档仍把它们描述为现状。

**From → To**：
- `tech-支付与履约.md`：删除 §1.6 Telegram webhook 回调、Telegram Stars provider 整章、Bot 购买成功消息、Telegram webhook 注册与 Test DC 章节，章节号重排；webhook 注册只剩 PayPal Dashboard 人工配置；错误码 `21001` 示例与「不重复发 Bot 消息」等表述订正；验证命令改为现存测试文件。
- `tech-金额模型.md`：§5.2 Telegram Stars → Clink；渠道约束表改为 `paypal`(USD，两位小数)`/ `clink`(币种不限,金额为正)；验收示例改为 Clink 十进制金额。
- `tech-订单数据与状态机.md`：`payment_data` / `payment_channel_order_no` 的 Telegram 形态与 `pre_checkout_query` 过期豁免表述订正为渠道通用口径。
- `feat.md`：默认渠道优先级改为 `clink` → `paypal`；删除 Bot 购买成功消息、Telegram webhook 注册与 `bot token` 表述。
- `plans/001.ClinkBill支付渠道接入.md`：加「部分作废」标注（Pro 站侧条目已随目录删除失效）。

## 2026-09-10 回跳页按商品类别区分返回价格页链接

- PayPal / ClinkBill 的 success 与 cancel 回跳页用订单状态响应的 `product_class` 改写「返回价格页」按钮:订阅指向 `/ext-pricing/`,积分或查询失败保持 `/pricing/`。
- cancel 页在取消本地订单前先查一次订单状态识别商品类别;查询失败不阻断取消流程。
- 合同更新见 [`tech-支付与履约.md`](./tech-支付与履约.md) §1.7。

## 2026-09-01 ClinkBill 支付渠道源码实现

- ClinkBill 一次性与自动续费的后端支付、回调及网站 Checkout URL 接入已完成源码实现；合同与当前验收状态见 [`tech-ClinkBill支付.md`](./tech-ClinkBill支付.md)。

## 2026-08-31 记录支付交易流水 ID

- 订单新增可空的支付交易流水 ID,统一保存 Provider 回调提供的实际交易标识。
- Admin 订单页支持按流水 ID 查询,订单详情支持查看和复制流水 ID。
- 流水 ID 不建索引;渠道未提供时保持为空。

## 2026-08-10 统一 Telegram Terms Website 配置

- Telegram Bot `/terms` 不再使用代码内固定域名，统一读取 `config.yaml` 的 `app.public_website_base_url`。

## 2026-07-14 增加 Telegram Test DC 订阅环境

**Why**:正式 Telegram Stars 订阅周期为 30 天,无法及时验证续费回调和 `editUserStarSubscription` 应使用哪一期 `telegram_payment_charge_id`。

**变更**:

- Telegram 渠道配置新增必填 `environment=production/test`;环境统一决定 Bot API 路径和订阅周期。
- 正式环境保持 `/bot<TOKEN>/<METHOD>` 与 30 天周期;Test DC 使用 `/bot<TOKEN>/test/<METHOD>` 与 60 秒周期。
- provider 与 webhook 注册脚本共用同一 URL 构造,避免支付和 webhook 进入不同 DC。
- 新增 Test DC 真实 `createInvoiceLink` smoke 和首期 ID / 最新续费 ID 的 A/B 取消实验步骤。

**边界确认**:

- 测试环境使用独立 Test DC 用户、Bot、业务实例和数据库,不复用正式渠道配置。
- Bot API 未规定取消必须使用哪一期 ID;真实 A/B 实验完成前不把首期或最新 ID 当作已确认契约。

## 2026-07-14 对齐 PayPal webhook 全事件注册

**Why**:生产环境 PayPal webhook 实际订阅 All Events,原部署文档只列出两个一次性订单事件,遗漏订阅履约依赖的 `PAYMENT.SALE.COMPLETED`,无法指导环境重建。

**变更**:

- `tech-支付与履约.md`:明确 Dashboard 选择 All Events,区分当前支付履约事件与后续订阅生命周期事件。
- PayPal 上线验收增加订阅首期付款,确认 `PAYMENT.SALE.COMPLETED` 能完成履约。

## 2026-07-14 修复 Telegram 自动续费识别

**Why**:Telegram Bot API 的 `is_first_recurring` 是 Optional True 字段,后续自动续费会省略该字段。原判断和测试错误地要求显式 false,导致真实续费无法派生本地续费订单。

**变更**:

- `telegram_callback.py`:后续续费改为按 `is_recurring=true` 且 `is_first_recurring` 不是 true 识别。
- `telegram_callback_schema.py`:用 Optional True 类型约束两个 recurring 标记。
- Telegram provider 与 API 测试改用真实字段形态,并分别覆盖首期与后续续费。
- `tech-支付与履约.md`:记录 Telegram recurring 字段契约。

**边界确认**:

- 首期订阅付款仍履约原订单。
- 后续自动续费按新的 `telegram_payment_charge_id` 派生本地续费订单。

## 2026-07-06 订单履约 Feishu 告警

**Why**: 充值/付费订单成功和履约失败都需要即时通知运维,方便确认收入和排查发货异常。

**变更**:

- `feat.md`:补充履约成功与履约失败 Feishu 告警的产品验收口径。
- `tech-支付与履约.md`:新增订单 Feishu 告警实现边界,明确异步调度、告警字段和按订单去重。

**边界确认**:

- 告警不影响支付、履约和补偿任务主链路。
- 告警字段以订单快照和用户表为准;用户记录缺失时仍保留 `user_id`。

## 2026-07-06 取消自动续费暂缓实现

**Why**: 站内取消自动续费已完成边界设计,但当前不进入实现。

**变更**:

- `tech-支付与履约.md`:标记取消自动续费接口和 provider 取消方法为后续方案。
- `tech-订单数据与状态机.md`:标记取消自动续费不进订单状态机为后续实现边界。

## 2026-07-05 取消自动续费边界

**Why**: 取消自动续费是长期订阅管理动作,不是一次新的扣款事件,不应进入订单状态机。

**变更**:

- `tech-支付与履约.md`:补充取消自动续费入口归订阅域、provider 只做渠道取消。
- `tech-订单数据与状态机.md`:明确取消自动续费不创建订单、不修改历史订单状态。

**边界确认**:

- 订单表继续只记录已发生扣款。
- 当前周期权益保留到 `user_subscriptions.expires_at`。

## 2026-06-29 统一订单承载 Credits 与订阅扣款

**Why**: 新 pricing 页同时出售 Credits 一次性积分包和 Unlimited Download 月度自动续费订阅。订单表应承载每一次真实扣款事件;自动续费协议本身在 provider 侧,本地不另建订阅账单表。

**变更**:

- `feat.md`:订单系统定位改为“统一付费履约事务框架”。
- `feat.md`:`pricing_*` 事件重新启用,完整定义指向 `@../011.Pricing页/feat.md`。
- `feat.md` / `tech-*.md`:明确 Credits、订阅首期、订阅续费都走 `orders`;订阅续费由 provider webhook 创建续费订单。

**边界确认**:

- Credits 继续走订单。
- Unlimited 首期和后续自动续费扣款都走订单。
- 不新增 `user_billing_subscriptions` / `user_subscription_events`;幂等复用订单状态与渠道扣款号。

## 2026-06-26 单字段 6 位金额模型

**Why**: PayPal 侧金额被显示为 `189` 而非 `USD 1.89`,根因是 `amount_raw` 在不同渠道与展示场景中含义漂移。订单系统需要统一为一个金额字段,避免展示、校验和 provider 转换各自解释金额单位。

**变更**:

- 新增 `tech-金额模型.md`:定义 `amount/display_amount/paid_amount = 真实金额 * 1_000_000` 的唯一金额口径,PayPal 与 Telegram Stars 只在 provider 边界转换。
- `tech-订单数据与状态机.md`:订单表和订单 service 契约删除 `amount_raw/paid_amount_raw`,金额校验只比较 `currency + amount`。
- `tech-支付与履约.md`:下单、状态查询、支付回调、履约入口统一为单字段金额;PayPal 下单使用 `amount / 1_000_000`,capture 使用小数字符串乘 `1_000_000`;Telegram Stars 使用 Stars 整数与 6 位金额互转。
- `feat.md`:通用购买埋点字段从 `amount_raw` 改为 `amount`。

**边界确认**:

- 接受破坏性 DB/API 变更,不保留兼容字段。
- 不迁移历史订单;上线前清空订单表。
- 本地开发配置表直接修数据,不提交配置修复脚本。

## 2026-06-24 PayPal Standard Checkout 接入设计

**Why**: Credits 一次性积分包需要新增 PayPal 支付渠道,并与现有 Telegram Stars 共用订单、价格校验、履约和补偿框架。

**变更**:

- `feat.md`:支付渠道从"首期只接 Telegram Stars"改为支持 `telegram_stars` 与 `paypal`;website Credits 购买默认 PayPal,不涉及 extension。
- `tech-支付与履约.md`:新增 PayPal 渠道配置、Orders API create order、approval URL、capture、webhook 签名校验、success/cancel 回跳和部署验收。
- `tech-订单数据与状态机.md`:补充 PayPal `payment_data` 与渠道流水号含义。

## 2026-06-23 文档结构迁移

**Why**: 订单系统是"通用支付履约事务框架",与订阅商品定义(006)、积分包商品定义与下载扣费(003)、节点(001)、用户(001)都是不同系统,各自独立成域。原 `feat.006.订单系统.md` 是一篇技术细节混编(表结构、API、webhook、provider、部署、安全全揉一起),迁移时按"产品需求 vs 技术实现"拆分,技术再按"数据/状态机"与"支付/履约"切两份。

**From → To**:

- `docs/feat/feat.006.订单系统.md` → `docs/feat/004.订单系统/feat.md`(产品需求,剔除 API 路径 / 表名 / 字段名 / 类名 / 错误码 / YAML)+ `docs/feat/004.订单系统/tech-订单数据与状态机.md` + `docs/feat/004.订单系统/tech-支付与履约.md`。
- 原 plan feat.006.001.website订阅购买闭环 → 订阅购买闭环的前端动线归订阅域(`@../006.订阅系统`);订单事务相关(下单接口、状态轮询、未完成订单、取消订单)并入 `tech-支付与履约.md`。
- 原 plan feat.006.002.TelegramWebhook注册与部署验收 → `tech-支付与履约.md` §11(webhook 注册与部署验收)。
- 原 plan feat.006.003.订单履约补偿Cron → `tech-支付与履约.md` §9(履约补偿重试 cron)+ `tech-订单数据与状态机.md` §5.2(履约回调状态流转)。
- 原 plan feat.051.004.Credits积分包商品配置与订单履约 的订单侧部分(`RECHARGE` 接入订单 `check_product`、履约加余额的契约面)→ `tech-支付与履约.md` §3;积分包商品定义与 `check_product` 实现留在积分域(`@../003.积分系统`)。

**边界确认**:

- 订单系统只管"付钱 + 履约的事务"。订阅商品定义(周期、额度档位)在 `@../006.订阅系统`;积分包商品定义(到账 Credits、档位)在 `@../003.积分系统`;本域只通过 `product_class` 接入。
- 履约给用户加 Credits 时调积分域的 `add_balance_in_session`,不实现 Credits 模型;加订阅时长时调订阅域的 `fulfill_paid_order`,不实现订阅商品定义。
- 下载不触发订单,订单不碰下载链路。

## 与源文档的关键差异(以代码为准)

下列点文档与代码不一致,迁移时已按代码修正:

1. **履约补偿 cron 扫描范围**:源 `feat.006.003` 写"只扫 `callback_status=PENDING`、只覆盖订阅类";代码实际同时扫 `PENDING` 与 `FAILED`,且覆盖 `SUBSCRIPTION` 与 `RECHARGE` 两类。已按代码改为同时扫两状态、两类商品(`tech-支付与履约.md` §9.2)。
2. **补偿任务函数名**:源写 `compensate_paid_pending_subscription_orders` 只处理订阅;代码实际入口 `compensate_paid_pending_orders`(订阅 + 积分包),注册表保留旧函数名 `compensate_paid_pending_subscription_orders` 做兼容转发。已按代码记录。
3. **Bot 购买成功消息回跳**:源 `feat.006` 写"消息按钮跳 `/pricing/?order_no=...`";代码已改为跳网站首页、不带 `order_no`(feat.051.004 调整,配合积分域退出 pricing 依赖)。已按代码记录(`tech-支付与履约.md` §10)。
4. **`callback_logs` 表用途**:源 `feat.006` 写此表记 `retry_count / error_message` 等回调日志;代码实际未作为业务回调日志写入,Telegram webhook 原始请求只落文件日志(`log/payment/telegram/{date}.log`)。模型保留但当前不被业务逻辑依赖,订单履约状态以 `orders.callback_status` 整数枚举为准(`tech-订单数据与状态机.md` §4)。
5. **`orders.cash` 字段**:已删除。订单不保留历史金额字段,金额判断只使用 `currency + amount`。
6. **`config_subscription_product_price` 唯一索引名**:源未注索引名;代码为 `uk_config_subscription_product_price_product_channel(product_id, channel_code)`。已按代码记录(`tech-支付与履约.md` §2.2)。
7. **金额归一化精度**:源 `feat.006` 提到 6 位精度但未列币种;代码 `NORMALIZED_AMOUNT_SCALE = 6`,支持 `XTR(0)/CNY(2)/USD(2)/USDT(6)/USDC(6)`。已补全(`tech-订单数据与状态机.md` §11)。
8. **订单履约超时**:源未提;代码履约有 `ORDER_FULFILLMENT_TIMEOUT_SECONDS = 10` 秒 `asyncio.wait_for` 包裹,超时不主动标 FAILED。已补(`tech-订单数据与状态机.md` §8.2、`tech-支付与履约.md` §8)。

## 2026-06-23 补数据埋点章节

**Why**: `feat.md` 缺 `数据埋点` 章节(project-rule 要求 feat 必备段)。源 `feat.006 数据埋点` 的 10 个 `pricing_*` 事件口径在迁移时未带入产品文档。

**From → To**: `feat.006 数据埋点` → 本域 `feat.md` 新增「数据埋点」小节。口径调整:因 006 订阅已停售、website 定价页 301,这些 `pricing_*` 事件随订阅购买入口下线而失效,标注为"失效但作通用购买闭环口径保留参考";积分包等新付费商品接入时复用同套字段约定,事件名按商品域自洽命名(积分包用 `credit_purchase_*`,见 `@../003.积分系统/feat.md`)。
