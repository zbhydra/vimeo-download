# 011 · Pricing 实现与配置

> 技术说明。数据库配置必须直接使用 `backend/src/app/init/sql_executor.py` 执行 SQL,不得新增迁移脚本。

## 前端结构

Pricing 页面在 `website` 与 `website-shared` 中拆分:

- `website/src/pages/pricing.astro`:英文默认路由。
- `website/src/pages/[lang]/pricing.astro`:多语言路由。
- `website/src/pages/ext-pricing.astro` 与 `website/src/pages/[lang]/ext-pricing.astro`:插件订阅购买路由。
- `website/src/components/pages/PricingPage.astro`:读取 locale 文案并装配页面。
- `website-shared/src/components/pricing/PricingPageShell.astro`:页面 DOM 壳。
- `website-shared/src/components/pricing/pricing-page-controller.ts`:登录态、商品加载、下单与订阅管理入口状态。
- `website-shared/src/components/pricing/pricing-entry.ts`:来源识别。
- `website-shared/src/components/pricing/pricing-checkout.ts`:订阅 checkout、管理入口和订单协议。
- `website-shared/src/components/pricing/PricingSubscriptionConfirmModal.astro`:订阅安装确认、好评倒计时与领取结果专用弹窗。
- `website-shared/src/components/pricing/PricingAuthModal.astro`:Pricing 登录弹窗。

Credits 商品配置读取复用 `website-shared/src/components/credit-purchase/credit-checkout.ts`,两类购买均交给 `OrderCheckoutModal`。

## 购买页路由合同

`/pricing/` 只装配、加载和购买积分，`/ext-pricing/` 只装配、加载和购买插件订阅。英文根路由与全部语言路由显式传入商品模式，浏览器不按来源切换商品或改写首屏。可见 FAQ 与结构化数据同源，canonical、hreflang 和 sitemap 跟随各自路由。通用导航只提供积分页入口，不提供订阅页导航入口（订阅页仅经插件内购买入口与旧链接跳转抵达），不增加其他交叉销售入口；页脚积分入口保持指向积分页。

`extension/` 直接打开 `/ext-pricing/`，保留原来源参数。旧插件的 `/pricing/` 链接继续由网站兼容。`pricing-entry.ts` 的 `readPricingEntryFlags` 保留 `utm_source=extension` 或 `source=quota_counter` 判定；命中旧入口时只替换 pathname 为订阅路由，用 `location.replace` 保留同站、语言、完整 query 和 hash。来源不决定商品类型，只控制来源文案与埋点。两页都保留账号摘要及订阅管理；积分页不装配订阅购买确认和好评入口，不读取或消费订阅购买意图。

语言切换保留当前购买页类型，query 按原有规则处理。直接订阅页无需来源也可登录购买：在订阅页恢复原会话购买意图。支付、轮询和账号刷新沿用本链路。PayPal、Clink 返回页的通用返回链接仍指向 `/pricing/`，原购买页负责订阅付款后刷新权益。

转向依赖 JavaScript；禁用时旧积分路由保留积分静态内容。不新增接口、持久状态、支付状态机或依赖。

## 后端接口

Pricing 依赖以下客户端接口:

| 接口 | 用途 |
| --- | --- |
| `GET /api/client/auth/me` | 返回用户、Credits 余额、订阅状态/过期时间 |
| `GET /api/client/credit/checkout-configs` | Credits 一次性购买套餐 |
| `GET /api/client/subscription/checkout-configs` | 可购买订阅商品配置,以及好评赠送活动开关与资格状态位(`0` / `1`);可选鉴权 |
| `POST /api/client/subscription/review-reward/claim` | 登录账号领取一次 7 天好评赠送订阅,强制携带设备标识 |
| `POST /api/client/subscription/management` | 登录态、空请求体;返回当前自动续费订阅的渠道管理 URL或空 URL 指引动作 |
| `POST /api/client/order/create` | Credits 和订阅统一创建订单 |
| `GET /api/client/order/status/{order_no}` | 支付后轮询订单状态 |

`/api/client/subscription/status` 继续保留给插件兼容,不作为 website 下载额度来源。

好评赠送专用弹窗、倒计时和领取结果见 `@tech-好评赠送.md`;不扩展全站通用确认框。

Pricing 账户摘要中的 `subscription.expires_at` 用于判断订阅按钮状态。已有有效 Unlimited 时按钮软灰化,点击后提示不可重复购买;按钮不使用原生 `disabled`,否则无法响应点击提示。

管理入口同时读取 `subscription.expires_at` 与 `subscription.auto_renew`：仅未过期且自动续费的订阅在顶部账号状态区显示“管理订阅”按钮。点击后只带登录态请求统一接口；返回 URL 时跳转。前端不发送或识别支付渠道、订阅 ID、客户 ID，也不修改订阅状态。

目标订阅页检测到 `utm_source=extension` 时,异步上报 `web_pricing_open_from_extension`:同时写 SLS 与后端 `mark_logs`,`mark_msg` 保存实际 `utm_source` 和 `source`,缺少 `source` 时保存 null。每次目标页加载和刷新都新增一条,旧入口中转页不记录;打点失败不阻断账号与商品加载。仅有 `source=quota_counter` 而没有 `utm_source=extension` 时不写该类型。

订阅确认弹窗点击“去好评”时,通过同一 `recordHomepageMark()` 双写 `web_extension_store_review_click`,`mark_msg` 为空。每次真实点击都发起一次,上报不等待结果;失败只记录前端错误,不阻断 Chrome Web Store 新标签页和 30 秒倒计时。

## 订阅配置合同

字段、可用性、checkout 和快照以 [`006 · 订阅商品与状态` 的“商品与渠道价格”](../006.订阅系统/tech-订阅商品与状态.md#商品与渠道价格) 为唯一合同。


> 已迁出:2026-09 双插件订阅调价基线见 `docs/ops/archive/` 的历史发布单（已归档）(2026-09-11 发布完成归档)。

## 订单快照与履约检查

新订单快照、一次性自然月计算、自动续费渠道账期归一化与订阅实例写入以 [`006 · 订阅商品与状态` 的“订单履约”](../006.订阅系统/tech-订阅商品与状态.md#订单履约) 为唯一合同。配置验收必须确认快照中的模式和周期来自商品、金额和 SKU 来自渠道价格;履约不读取后来修改的商品模式。
