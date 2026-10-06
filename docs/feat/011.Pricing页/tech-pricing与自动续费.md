# 011 · Pricing 页与订阅配置

> Pricing 页面消费订阅商品、渠道价格和账户状态的界面合同。订阅领域的数据模型、状态计算与履约不在本页重复定义。

## 事实来源

- 商品计费模式、渠道价格与验价:[`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格)。
- 用户订阅状态:[`006 · 订阅商品与状态` 的“用户当前订阅”](../006.订阅系统/tech-订阅商品与状态.md#用户当前订阅)。
- 订单快照与支付履约:[`006 · 订阅商品与状态` 的“订单履约”](../006.订阅系统/tech-订阅商品与状态.md#订单履约)。
- 好评赠送页面流程:`@tech-好评赠送.md`。

## 后端接口

| 接口 | Pricing 用途 |
| --- | --- |
| `GET /api/client/auth/me` | 读取账户与订阅状态(响应里的 Credits 余额字段网站不使用、不展示) |
| `GET /api/client/subscription/checkout-configs` | 读取商品当前模式、周期、默认展示价、渠道价格与好评赠送状态 |
| `POST /api/client/subscription/review-reward/claim` | 登录账号领取好评赠送订阅 |
| `POST /api/client/subscription/management` | 按当前登录账号的有效自动续费订阅创建渠道管理入口;请求体为空 |
| `POST /api/client/order/create` | 创建订阅订单 |
| `GET /api/client/order/status/{order_no}` | 轮询支付与履约状态 |

`/api/client/subscription/status` 保留给插件,website 不用它代替 `/api/client/auth/me`。

## 商品与渠道价格

`/ext-pricing/` 只加载订阅商品,入口与加载边界见[购买页路由合同](./tech-实现与配置.md#购买页路由合同)。页面不维护商品到支付渠道的静态白名单,只展示 checkout 接口返回的渠道。

商品卡的计费方式、周期和默认价读取商品层 `auto_renew / period / display_currency / display_amount`。页面只提供支付渠道选择;选中渠道后,支付弹窗显示该渠道的 `currency / amount`,并把商品的 `auto_renew / period` 连同商品与渠道身份提交给统一订单接口。没有 offer、商品分组或模式选择器。

无任何可用渠道的付费商品不进入 checkout 目录。Free 不进入 checkout 商品列表。

支付弹窗继续承载渠道选择、协议确认、支付 URL、订单轮询、取消等待、失败与重试。订阅订单走统一支付状态机;成功后重新请求 `/api/client/auth/me` 刷新订阅状态。

价格更新时重新加载 checkout 配置。支付失败或用户取消时留在同一弹窗内重试,不在前端复制订单或订阅状态机。

## 账户状态与购买入口

Pricing 使用 `/api/client/auth/me` 的 `subscription` 渲染账号状态:

- 无有效订阅:购买入口可用。
- 有有效订阅:购买入口使用软灰化与 `aria-disabled=true`,保留点击事件展示不可重复购买提示,不调用下单接口。
- `status=unavailable`:保留账户内容,订阅区域显示不可用状态。

后端下单检查是重复购买的最终约束。前端状态只用于减少无效操作,不承担并发互斥。

## 支付渠道订阅管理

有效订阅且 `subscription.auto_renew=true` 时,账号订阅行显示管理入口。点击后只携带登录态调用统一接口,前端不发送订阅 ID、客户 ID 或支付渠道。服务端从当前订阅读取 Provider：Clink 创建短期 Customer Portal URL；PayPal 返回官方 Automatic Payments 通用页。

前端只按 URL 是否存在选择跳转或指引,不识别 Provider。弹窗支持关闭按钮、遮罩点击和 Escape,关闭后焦点回到触发按钮。Free、已过期、一次性或非自动续费状态隐藏管理入口。

## 前端边界

- 账号状态区与套餐列表同属页面 section,互不嵌套;账号状态区使用独立卡片容器,与订阅卡片同宽对齐。
- 商品卡展示权益、商品模式、周期和默认价;支付弹窗展示渠道实际结算价。
- `utm_source=extension` 来源的曝光与“去好评”点击继续使用 Pricing 既有埋点,打点失败不阻断商品、登录或支付流程。
- 可见文案走 Pricing i18n schema,组件与 controller 不硬编码文案。


