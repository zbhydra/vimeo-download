# 011 · Pricing 实现与配置

> 技术说明。数据库配置必须直接使用 `backend/src/app/init/sql_executor.py` 执行 SQL,不得新增迁移脚本。

## 前端结构

Pricing 页全部源码在 `website/src` 下:

- `pages/pricing.astro`:英文默认路由。
- `pages/[lang]/pricing.astro`:多语言路由。
- `components/pages/PricingPage.astro`:读取 locale 文案、装配 SEO 与 FAQPage 结构化数据。
- `components/pricing/PricingPageShell.astro`:页面 DOM 壳。
- `components/pricing/pricing-page-controller.ts`:登录态、商品加载、下单与订阅管理入口状态。
- `components/pricing/pricing-entry.ts`:来源识别。
- `components/pricing/pricing-checkout.ts`:订阅 checkout、管理入口和订单协议。
- `components/pricing/pricing-auth-controller.ts` 与 `PricingAuthModal.astro`:Pricing 登录弹窗。
- `components/pricing/PricingSubscriptionConfirmModal.astro` 与 `pricing-subscription-confirm-controller.ts`:订阅安装确认、好评倒计时与领取结果专用弹窗。
- `components/order-checkout/`:订阅结算弹窗与订单协议,归 Pricing 使用。
- `i18n/pricing.ts` 与 `i18n/schema.ts`:Pricing 文案及类型。

登录弹窗与结算弹窗只服务 Pricing 页;首屏下载工作区不含登录、账户与结算。

## 购买页路由合同

`/pricing/` 只装配、加载和购买插件订阅(Unlimited)。英文根路由与全部语言路由都装配同一页面组件,浏览器不按来源切换商品或改写首屏。可见 FAQ 与结构化数据同源,canonical、hreflang 和 sitemap 跟随该路由。站点导航提供 Pricing 入口;首页的插件介绍与方案概览区块也链接到该页。

`/ext-pricing/` 与旧价格入口的转向逻辑已不存在,网站也不保留旧路径兼容。插件把 `WEBSITE.PRICING_PATH`(`/pricing/`)作为购买页路径,与网站同批发布。

来源识别:`pricing-entry.ts` 的 `readPricingEntryFlags` 以 `utm_source=extension` 或 `source=quota_counter` 判定插件来源;来源只控制来源文案、埋点和好评赠送页面入口,不决定商品类型。

语言切换保留 query。无来源也可直接登录购买:订阅页恢复原会话购买意图。支付、轮询和账号刷新沿用本链路。PayPal、Clink 回跳页的返回链接固定为 `/pricing/`,由该页在订阅付款后刷新权益;回跳页组件与文案见 `@../004.订单系统/tech-支付与履约.md`。

## 后端接口

Pricing 依赖以下客户端接口:

| 接口 | 用途 |
| --- | --- |
| `GET /api/client/auth/me` | 返回用户与订阅状态/过期时间(响应里的 Credits 余额字段网站不使用) |
| `GET /api/client/subscription/checkout-configs` | 可购买订阅商品配置,以及好评赠送活动开关与资格状态位(`0` / `1`);可选鉴权 |
| `POST /api/client/subscription/review-reward/claim` | 登录账号领取一次 7 天好评赠送订阅,强制携带设备标识 |
| `POST /api/client/subscription/management` | 登录态、空请求体;返回当前自动续费订阅的渠道管理 URL或空 URL 指引动作 |
| `POST /api/client/order/create` | 创建订阅订单 |
| `GET /api/client/order/status/{order_no}` | 支付后轮询订单状态 |

`/api/client/subscription/status` 保留给插件,网站不用它代替 `/api/client/auth/me`。网站不再调用 Credits 商品配置接口(见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §8)。

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
