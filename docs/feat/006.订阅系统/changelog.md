# 006 · 订阅系统 - 变更记录

## 2026-09-18 整仓单平台转型：订阅 metadata 字段与 Pro 站口径订正

**Why**：服务端输出限速链路已删除，`proxy_user_rate_limit_mb_per_second` 在代码中零读取；`website-tgd-pro` / `extension-pro` 已删除。

**From → To**：
- `tech-额度与速率档位.md` / `tech-订阅商品与状态.md`：`proxy_user_rate_limit_mb_per_second` 由「展示字段 / 展示值」→「**已废弃**，代码零读取，仅为兼容历史 metadata 保留键名」。
- `tech-好评赠送订阅.md` / `feat.md`：领取资格去重口径确认为账号 + 设备两个 scope（TG 身份维度已下线）。
- `plans/001` / `plans/004` / `plans/006`：加「部分作废」标注（含 Pro 站与 TG 身份维度的条目已失效）。

## 2026-09-12 好评赠送领取资格按账号/设备/TG 身份三维度去重

**Why**: 领取事实原先只在账号维度的永久 Counter 上,同一人换一个网站账号即可再领一次 7 天 Unlimited;设备与 Telegram 身份都能提供更宽的去重面。

- 领取事实改为 `user_review_reward` 事实表,账号(`userid:`)/设备(`Device-Id:`)/TG 身份(`tguserid:`)各占一行,uid 由 `app.utils.uid` 的共用 helper 生成(与 005 首日事实表同源);判定是一次 `WHERE uid IN (...)`,任一命中即已领取,未命中才按本次可用维度插入 1-3 行(单事务),冲突由 `IntegrityError` 兜底。
- `checkout-configs` 改为可选鉴权,新增 `review_reward_enabled` 与 `review_reward_claimed_count`;**该计数是 0/1 资格状态位而非领取次数**,账号、设备、已绑定 TG 身份任一维度已有事实即返回 `1`;资格判定失败返回 `1`(按不可领)并记日志,接口本身不失败。领取响应里的同名计数恒为 `1`。
- `review-reward/claim` 强制携带设备标识,缺失或非法在入口拒绝;新增 `POST /api/client/subscription/tg-identity/bind`(登录态,`tg_user_id` 正整数),写入 `users.tg_user_id`,**已有值不覆盖**,绑定路径不写事实行。
- `CounterId.SUBSCRIPTION_REVIEW_REWARD_CLAIMED = 6001` **保留注册、已不再读写**;历史账号行由 `backend/scripts/migrations/backfill_user_review_reward.py` 幂等迁移(`INSERT IGNORE` + 分批主键核对,只跑主站部署)。
- 两个插件在 Telegram 页面采集并上报 TG 身份,失败一律静默;隐私政策与 Pro 站 legal 文案新增设备标识与 Telegram 账号标识两项。

**边界确认**:

- 三个维度都是客户端自证,只提高门槛、不防恶意用户;不跨产品线去重,主站与 Extension Pro 各自独立。
- 事实行是永久行,不清理、不重置;`users.tg_user_id` 明文存储(无 `access_hash` 取不到任何用户信息)。
- 先领奖励、后绑定 TG 的账号不会把其 TG 身份标记为已领取,是刻意取舍。

技术合同见 `@tech-好评赠送订阅.md`,执行计划见 `@plans/006.好评奖励领取资格去重.md`。

## 2026-09-12 Free 档上限改为 3 次/天并新增首日免费

**Why**: Free 档每日 5 次对新用户不友好——当天很容易撞上限,而单纯调数字既不改善首日体验,也不降低新账号的试探成本。

- Free 商品默认上限改为 `3` 次/天;作用域首次下载当天不限次,自次日起按档位上限。判定口径、事实表存储与失败降级归计数器系统,见 [`005 · 计数数据与重置` 的“首日免费”](../005.计数器系统/tech-计数数据与重置.md#9-首日免费)。
- 已配置 `metadata.daily_limit` 的 Free 商品按配置值生效、不被常量覆盖
- 订阅状态响应:Free 非首日 `extension_download.limit=3`,首日与 Unlimited 同为 `-1`。首日是独立于档位的一层,不改变 Unlimited 的任何口径。

## 2026-09-11 插件 Popup 升级按钮改为醒目 CTA

**Why**:Free 用户的 Upgrade Now 此前是白底灰边次级按钮,与头部其他控件同权重,升级动线在头部里没有视觉优先级。

- Free 用户的升级按钮改为琥珀色渐变主按钮(白字加粗),带 2.2s 循环光晕呼吸动效,悬停上浮 1px 并暂停动效;琥珀色与头部蓝色登录按钮形成互补对比。
- Unlimited 用户看到的同位置按钮保持白底灰边次级样式,避免误导已付费用户继续升级;按钮行为(打开 website pricing 页)不变。
- 动效遵循系统"减少动态效果"设置,开启时不播放光晕与上浮。

## 2026-09-10 新增 Unlimited 年卡商品

**Why**:只有月卡一种付费周期,长期用户没有更低单价的选择,运营无法做年付促销。

- 新增 `unlimited_year` 商品(`period=year`,一次性模式,展示价 $99.99),三渠道价格行与月卡同构:PayPal/Clink $99.99,Telegram Stars 8000 XTR;权益 metadata 与月卡一致(`daily_limit=-1`)。
- 商品与价格为纯配置数据,后端 checkout、下单验价与履约按既有配置驱动逻辑消费,不改代码;上线按 `011 · Pricing 实现与配置` 的订阅配置 runbook 执行。
- 本地库同步修正 `unlimited` 月卡脏数据:`period` 由 `none` 改为 `month` 并补展示价 $9.99(合同要求付费商品周期必须是 `month/quarter/year`,否则 checkout 不返回该商品)。

## 2026-09-03 修复一次性自然月到期时间为空

**Why**:测试库未加载 MySQL 命名时区表,`CONVERT_TZ(..., 'America/New_York')` 静默返回 `NULL`,导致 Telegram Stars 与 PayPal 一次性订阅订单履约成功但 `expires_at` 仍为空。

- 一次性订阅从当前有效 `expires_at` 或履约时间选择基准,使用应用层 `add_natural_months` 计算到期时间。
- 删除对 MySQL 命名时区表的依赖;订阅时间仍只由 `expires_at` 表达。
- 回归覆盖已有 `expires_at=NULL` 的旧渠道记录被一次性 Telegram Stars 购买替换。

## 2026-09-03 收敛订阅时间为单一到期字段

**Why**:`current_period_end_at` 与 `expires_at` 同时参与推进会形成两套时间真相,旧渠道账期会阻止已过期用户切换支付渠道。

- `expires_at` 成为有效性、自动续费推进、跨渠道替换和回调先后的唯一判断字段。
- `current_period_start_at` 收敛为仅展示的 `start_at`;删除 `current_period_end_at`。
- Provider 回调统一输出 `provider_subscription.start_at/expires_at`;订单渠道流水继续负责扣款幂等。

## 2026-09-03 修复 Telegram Stars 首期自动续费履约

**Why**:Telegram 自动续费成功回调虽包含 `subscription_expiration_date`,Provider 未归一化账期,导致已支付订单因缺少 `provider_period` 履约失败。

- Telegram Provider 以渠道过期时间作为账期结束,按生产或 Test DC 的订阅周期反推开始时间。
- `telegram_payment_charge_id` 作为当前渠道订阅取消句柄,与完整账期一起交给通用订阅履约。
- 缺少合法 `subscription_expiration_date` 的自动续费回调拒绝履约,一次性 Stars 支付不受影响。

## 2026-09-03 自动续费渠道完全改为配置驱动

**Why**:通用配置层解释 Provider SKU 会把不需要 SKU 的 Telegram Stars 固定排除,导致 `auto_renew_supported=1` 无法生效。

- 自动续费商品的渠道可用性只读取价格行 `auto_renew_supported`;不再按渠道名或 SKU 格式过滤。
- `provider_sku` 保持可空的 Provider 私有配置;PayPal 和 Clink 在实际下单时自行校验,Telegram Stars 不要求 SKU。
- 未修改数据库结构或接口;Telegram Stars 配置为 `auto_renew_supported=1,provider_sku=NULL` 即可参与自动续费下单。

## 2026-09-01 确认订阅计费配置与实例模型

**Why**:一次性权益、PayPal / Clink 自然账期和未来月 / 季 / 年购买选项不能继续由商品级 `metadata.auto_renew / period / duration_days` 共同表达。

- 确认渠道价格行未来新增 `auto_renew` 和 `period`,每行独立表达购买方式、商业与权益周期、金额和渠道 SKU;实施时删除商品级 `period / duration_days`。
- `period` 默认为 `none`,支持 `month / quarter / year`;Telegram Stars 当前使用 `auto_renew=0,period=month`。
- 确认一用户只保存一份当前订阅,套餐与周期变化都属于同一订阅的未来变更,不引入多份订阅模型;本项目仍只配置 `free / unlimited`,通用 `product_id` 仅为派生项目保留扩展能力。
- 用户订阅未来分开本地权益 `expires_at` 与渠道账期 `current_period_end_at`,只保存当前事实,不预埋待生效升级状态。
- `user_subscriptions` 新增列统一 `NULL DEFAULT NULL`,历史行不回填、不回放订单且保留原 `expires_at`;新履约显式写入实例事实。
- 本次只完成方案文档,未修改源码、数据库、接口或前端行为。

完整方案见 `@plans/004.订阅计费配置与实例模型.md`。

## 2026-08-14 增加订单自动续费人工运维脚本

**Why**:支持人员需要按订单号核对并停止渠道后续扣款,但客户端取消接口和本地订阅实例取消状态仍未实施。

- 新增查询与取消两个 CLI 脚本;省略订单号时支持交互输入,取消默认要求输入 `CANCEL` 二次确认。
- PayPal 查询 Billing Subscription 实时状态并通过 cancel API 停止续费;Telegram Stars 通过 `editUserStarSubscription` 取消。
- Telegram Bot API 没有订阅状态查询能力,查询脚本明确输出未知状态,不从当前商品配置推断。
- 脚本只操作渠道长期协议,不改历史订单、不退款、不改权益到期时间。
- 历史订阅使用包含已停用渠道的最新配置,避免停止新销售后无法处理存量订阅。

## 2026-08-12 增加插件反馈群公开用户名配置

**Why**:插件需要同时提供普通 `t.me` 网页入口和现有 Telegram Web 邀请入口,公开用户名不能从私有邀请链接可靠推导。

- 开发库新增字符串配置 `config_public.extension_telegram_feedback_group_username`，保存不带 `@` 的 Telegram 公开用户名。
- `/api/client/subscription/status` 在既有 `telegram_feedback_url` 外增加 `telegram_feedback_group_username`;两项配置一次读取,缺失或非字符串分别返回空字符串。
- 两个字段互不依赖,客户端可只展示当前已配置的入口。

## 2026-08-11 增加好评赠送活动开关

**Why**:运营需要在不发版的情况下同时关闭活动展示和订阅发放,不能只隐藏前端入口。

- 开发库新增 JSON 布尔配置 `config_public.subscription_review_reward=true`;只有 `true` 开启活动,其余值按关闭处理。
- `checkout-configs` 返回 `review_reward_enabled`;关闭时不读取账号永久 Counter。
- 领取接口在 Redis 锁、Counter 和订阅写入前检查开关,关闭时复用 `INVALID_REQUEST`。
- 公共配置继续使用 180 秒缓存,可由管理后台刷新当前进程。

## 2026-08-07 实现好评赠送 7 天订阅后端

**Why**：Pricing 需要用稳定后端合同读取账号领取次数，并让登录账号一次性领取 7 天 Unlimited 权益。

**实际产出**：

- `checkout-configs` 顶层增加 `review_reward_claimed_count`；无凭据、过期或无效 access token 按匿名返回 `0`，有效账号读取永久 Counter。
- 新增严格登录的 `review-reward/claim`，返回 `granted` 或 `already_claimed` 与当前次数；账号级 Redis 锁固定 TTL 5 秒、抢锁 1 秒且不续租，Redis 不可用或超时统一返回 `SUBSCRIPTION_REVIEW_REWARD_BUSY=26001`。
- 锁内按 Counter 查询、Counter `+1` 独立提交、订阅 `+7` 天独立提交；重复领取成功跳过，Counter 成功而订阅失败不回滚、不补偿。
- 订阅 service 抽出 MySQL 原子按天加时能力，支付履约与赠送共用同一 upsert 算法：有效订阅从当前到期日累加，无记录、空值或已过期从当前时间计算。
- 全部 14 个后端 locale 增加服务器繁忙文案；未新增 Model、索引、依赖、依赖注入、锁续租或恢复任务。

**已验证**：

- real health smoke `1 passed`；Counter real 测试 `9 passed`；好评赠送真实 MySQL + Redis API 流程 `6 passed`，覆盖匿名/登录配置、首次领取、有效订阅、重复领取、同账号并发、预占锁和未登录拒绝。
- real 普通与 `-m real` 两次 collect-only 均成功且数量一致；新增 6 个用例均被收集。
- 后端改动通过 Black、Ruff、限定范围 mypy、`compileall` 和全部 locale JSON 解析；全链路 mypy 被既有 `core/config_schema.py` 27 个错误阻断，不记为通过。
- business 角色在 `127.0.0.1:19600` 启动成功，`/api/system/health` 返回 200/healthy，路由装配、lifespan 启停与数据库连接无异常。

技术规格见 `@tech-好评赠送订阅.md`，执行计划见 `@plans/003.好评赠送订阅-后端.md`。

## 2026-08-07 设计好评赠送 7 天订阅

**Why**:在 Pricing 购买确认中提供一次性好评赠送,用现有永久 Counter 与订阅权益模型完成简单领取。

**设计**:

- checkout 配置响应附带账号永久领取次数,匿名固定为 0。
- 领取接口使用账号级 5 秒 Redis 短锁,抢锁最多等待 1 秒,失败返回服务器繁忙。
- 未领取时先提交 Counter +1,再独立提交订阅 +7 天;接受前者成功、后者失败且不补偿。
- 重复领取按成功跳过,不验证真实评价,不新增活动表、订单或埋点。

技术规格见 `@tech-好评赠送订阅.md`,执行计划见 `@plans/003.好评赠送订阅-后端.md`。

## 2026-08-07 删除重复的一次性商品开关

**Why**: `one_time` 与 `auto_renew` 重复表达支付方式,还能组合出前端显示一次性、渠道实际自动续费的矛盾状态。

**变更**:

- 删除订阅 metadata、API 响应和前端契约中的 `one_time`。
- `auto_renew=true` 创建渠道订阅,`auto_renew=false` 创建一次性支付。
- 权益时长继续只读取 `duration_days`。

## 2026-08-07 续费方式改为商品配置驱动

**Why**: `auto_renew` 是运营配置,不应由付费商品校验和下单代码锁死。

**变更**:

- 订阅 metadata 只校验字段类型和合法范围,不限制具体额度与续费取值。
- 下单直接读取商品 `auto_renew`;开启时创建渠道订阅,关闭时创建一次性支付。
- 既有渠道续费回调继续按原订单履约。

## 2026-07-14 暂缓确定 Telegram 取消句柄期次

**Why**:Bot API 只要求订阅的 `telegram_payment_charge_id`,没有说明自动续费后必须使用首期、最新一期或任意一期 ID;公开资料也没有可复核的取消实测。

**变更**:

- 删除“Telegram 永久保存首期 charge ID”的未证实口径。
- `channel_subscription_id` 的 Telegram 写入时机改为等待 Test DC 60 秒订阅 A/B 实验结论。
- 取消自动续费验收增加首期 ID / 最新续费 ID 的回调、请求响应和客户端状态证据。

## 2026-07-14 简化自动续费取消状态

**Why**: 扣款由支付渠道发起,且渠道后台取消不一定通知本站。维护 `auto_renew_enabled` 会把本地记录误解为渠道实时状态,并与 `cancelled_at` 重复。

**变更**:

- 删除后续方案中的 `auto_renew_enabled`,只保留渠道取消句柄、`billing_mode` 和 `cancelled_at`。
- 每一笔订阅付款成功都清空 `cancelled_at`;Telegram 以 `is_recurring=true` 为准。
- 渠道返回取消成功、已经取消或非自动续费状态时写入 `cancelled_at=now`。
- `auto_renew/cancel_at_period_end/cancel_available` 改为由 `billing_mode/cancelled_at/expires_at` 计算的本站展示状态,不承诺反映渠道实时状态。
- 有效订阅检查只减少普通重复购买;不增加并发锁或跨渠道协议状态机,极少数重复订阅由支持处理。

**边界确认**:

- 用户在渠道后台取消但本站未收到通知时,本站允许继续显示自动续费;用户可再次点击取消完成本地同步。
- 两个 checkout 都需要用户分别确认付款;两笔均成功时按正常订单履约。

## 2026-07-06 取消自动续费暂缓实现

**Why**: 站内取消自动续费已完成方案设计,但当前不进入实现。

**变更**:

- `feat.md`:标记站内取消自动续费暂不实现,当前用户仍到支付渠道侧取消。
- `tech-订阅商品与状态.md`:标记新增订阅实例字段、取消接口和状态响应字段为后续方案。
- `plans/001.*` / `plans/002.*`:标记执行计划暂缓,不得按当前计划直接开工。

## 2026-07-05 取消自动续费设计

**Why**: 用户需要在站内停止下一次订阅扣款,但当前周期 Unlimited 权益应继续可用到到期时间。

**变更**:

- `feat.md`:增加取消自动续费流程、异常和验收口径。
- `tech-订阅商品与状态.md`:补充 `user_subscriptions` 的渠道订阅引用、取消状态字段和取消接口。

**边界确认**:

- 取消只停止下一次扣款,不退款、不立即降级。
- 已取消续费但尚未到期时仍不可重复购买;到期后可重新购买。
- 到期前恢复自动续费不在本期范围。
- 用户续费状态不能从当前商品配置推断,必须保存订阅实例的 `billing_mode/auto_renew_enabled`。（该设计已于 2026-07-14 被 `billing_mode/cancelled_at` 取代。）
- 支付渠道侧已取消但未通知本站时,站内取消接口按渠道“已取消”结果幂等同步本地状态。

## 2026-06-30 有效订阅禁止重复购买

**Why**: PayPal / Telegram Stars 允许同一用户产生多条自动续费订阅。有效期内再次购买会让渠道扣款周期和站内 `expires_at` 叠加逻辑混在一起,没有业务收益。

**变更**:

- `feat.md`:购买 Unlimited 流程增加已有有效订阅时不可重复购买。
- `tech-订阅商品与状态.md`:订阅下单前检查当前用户未过期订阅,存在时拒绝创建订阅订单。

**边界确认**:

- 已过期订阅按 Free 处理,允许重新购买。
- 履约层仍保留续期逻辑,用于自动续费回调、补偿和历史订单。

## 2026-06-30 订阅状态移除 website 额度字段

**Why**: 订阅是插件权益域,website 下载与播放不属于订阅状态。

**变更**:

- `tech-订阅商品与状态.md`:移除 subscription metadata 中的 website quota 字段。
- `tech-额度与速率档位.md`:订阅状态只返回 `extension_download` 和旧插件下载标量字段。

**边界确认**:

- `/api/client/subscription/status` 不返回 `web_download` / `web_play` 或播放标量字段。
- `/api/client/subscription/checkout-configs` 不返回 website 下载或播放额度配置字段。

## 2026-06-30 订阅状态配置异常降级

**Why**: 订阅配置错误最多影响权益展示,不能阻断登录态、Credits 和插件初始化。

**变更**:

- `GET /api/client/auth/me` 和 `GET /api/client/subscription/status` 在订阅配置异常时返回 `status=unavailable` 的订阅对象。
- 状态链路只读取订阅商品配置,不扫描支付渠道和渠道价格。
- 支付 checkout/下单链路仍保留配置错误失败,避免创建错误订单。

## 2026-06-29 按已合并源码修正订阅配置口径

**Why**: 当前源码没有新增订阅权益列,订阅商品为 `free` 与 `unlimited`;商品语义由 metadata 表达。文档需要删除旧设计字段,回到源码事实。

**变更**:

- `tech-订阅商品与状态.md`:改为当前 `config_subscription_product` 字段、`user_subscriptions` 字段、订单快照和履约分发实现。
- `tech-额度与速率档位.md`:把商品标识修正为 `free/unlimited`,明确 Free=5、Unlimited=-1。

**边界确认**:

- `config_subscription_product` 业务字段只有 `product_id/name/period/duration_days/display_currency/display_amount/enabled/sort_order/metadata`。
- `metadata.auto_renew` 表达商品支付方式。
- `user_subscriptions` 只用 `user_id/expires_at` 判权,Free 不落库。
- 订阅订单快照保留 `period` 配置校验字段,履约续期只读取 `duration_days`。
- 配置修改必须直接使用 `backend/src/app/init/sql_executor.py` 执行 SQL,不得新增迁移脚本。

## 2026-06-29 订阅状态接口作为插件状态入口保留

**Why**: 插件端需要同时知道当前订阅权益和今日剩余次数。Pricing 的已登录账户摘要整合进账号信息接口,避免 website 重复请求。

**边界确认**:

- `GET /api/client/auth/me` 返回已登录用户信息、Credits 余额和订阅状态。
- `GET /api/client/subscription/status` 返回插件订阅权益和今日次数对象,并继续保留旧插件兼容标量字段。

## 2026-06-29 重新激活为插件订阅权益域

**Why**: Pricing 页需要售卖插件专属 Unlimited 月度订阅,同时 Free 档成为正式配置档位。

**边界确认**:

- website 下载仍走 Credits。
- 订单支付、webhook、订单状态机和履约事务归订单系统。
- Free 是正式权益档;Unlimited 权益由有效订阅周期和当前商品配置表达。
