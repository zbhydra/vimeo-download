# 006 · 好评赠送订阅

> 技术规格。定义领取资格、领取事实表、Redis 短锁、订阅加时与客户端接口。Pricing 交互见 `@../011.Pricing页/tech-好评赠送.md`。
> 实现状态:已实现。

## 1. 目标与边界

为登录账号提供一次 7 天 Unlimited 赠送。系统只用 30 秒前端等待降低直接点击领取的概率,不验证 Chrome Web Store 评价、商店账号或评价内容。

领取资格按**两个维度**去重：网站账号与设备标识。两个维度都是客户端自证，只提高门槛、不防恶意用户。插件不参与领取与加时。

不新增订单、补偿任务、对账、锁续租、版本号、session token 或依赖注入。

## 2. 唯一方案与已放弃方案

采用“`config_public` 活动开关 + 现有 checkout 配置返回开关与资格状态 + 独立领取接口 + 账号/设备两维度领取事实表 + 账号级 Redis 短锁 + 订阅统一加时”。

不采用:

- 独立领取状态 GET:资格状态已经随订阅购买配置加载,避免第二次状态请求。
- 把活动字段写入 `auth/me`:账号摘要不应长期绑定一次性增长活动。
- 领取流水表:活动只允许领一次,事实表只表达"该维度是否已领取",没有流水可查的需求。
- MySQL 行锁或跨库事务:该活动允许部分失败,不扩大事务边界。
- 前端凭证或后端倒计时:不验证等待过程,不建立可伪装的安全协议。

## 3. 活动开关

公共配置使用以下结构:

```text
c_key = subscription_review_reward
g_value = true
```

初始化配置:

```sql
INSERT IGNORE INTO config_public (c_key, g_value)
VALUES ('subscription_review_reward', 'true');
```

运营关闭活动时把值改为 JSON 布尔值 `false`;重新开放时改回 `true`。只有值严格等于 JSON 布尔值 `true` 才开启活动,其余值统一按关闭处理。数据库读取失败由请求统一失败。

`config_public_service` 内存缓存 TTL 为 180 秒。修改后可以在管理后台“系统设置 → 刷新配置缓存”重载当前业务进程;多进程或多实例需要逐实例刷新或等待 TTL 到期。

## 4. 领取事实表

两个作用域各占一行,表 `user_review_reward`:

| 列 | 类型 | 约束 | 语义 |
| --- | --- | --- | --- |
| `uid` | `VARCHAR(32)`,`collation=utf8mb4_bin` | PK | 作用域 uid |
| `ymd` | `INT` | NOT NULL | 领取日的业务时区 `YYYYMMDD`,仅供审计,不参与判定 |
| `value` | `VARCHAR(128)` | NOT NULL | 带前缀原值（`userid:123` / `Device-Id:xxx`），供人工排查与迁移核对，不建索引、不参与业务查询 |
| `created_at` | `BIGINT` | NOT NULL | 创建时间(毫秒时间戳) |

- uid 由唯一 helper 构造:`sha256("<作用域前缀>:<原值>")` 取前 32 位小写 hex;前缀大小写必须与迁移 SQL 完全一致。与计数器系统的首日事实表共用同一套算法与同一份 helper。
- `collation=utf8mb4_bin` 是硬要求:默认 `_ci` 排序规则下 `abc` 与 `ABC` 相等,会让两个不同作用域碰撞,也会掩盖 Python 与 MySQL 侧的哈希大小写漂移。
- **资格判定是一次 `WHERE uid IN (...)`**,任一命中即已领取。维度组成 = 账号(必选)+ 本次设备标识(有则加,claim 入口强制要求)。
- 命中时**不写任何行**;未命中时按本次可用维度插入 1-2 行,**单事务**,要么全成要么全滚。
- 冲突判定用普通 `INSERT` + 捕获唯一键冲突,**不用**受影响行数:MySQL affected-rows 受 `CLIENT_FOUND_ROWS` 影响,会把"行已存在"报成 1 行,代码就会把"已领取"当成"写入成功"并给已领取的账号再加 7 天。
- 事实行是**永久行**,不清理、不重置,不提供运营重置入口。

### 4.1 6001 退役

`CounterId.SUBSCRIPTION_REVIEW_REWARD_CLAIMED = 6001` **保留注册、已不再读写**:生产 Counter ID 是合同,不得删除或复用,注册表内标注退役。历史领取数据由一次性迁移脚本从 `counter_user_lifetime` 只读回填到事实表;迁移只插入、不删原行,可重复执行。

## 5. 接口合同

### 5.1 获取订阅购买配置

```text
GET /api/client/subscription/checkout-configs
```

接口改为可选鉴权,响应 `data` 顶层增加:

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `checkout_configs` | array | 现有 Unlimited 购买配置 |
| `review_reward_enabled` | bool | 当前好评赠送活动是否开放 |
| `review_reward_claimed_count` | int | 资格状态位:`0` 未领取 / `1` 已领取;匿名与活动关闭时固定 `0` |

`review_reward_claimed_count` 是**资格状态位**而非领取次数:账号、设备任一维度已有领取事实即返回 `1`,前端据此隐藏入口。

缺少、过期或无效登录态按匿名公开配置处理,不阻断商品展示。活动关闭时返回 `0`。**资格判定失败时返回 `1`(按已领取)并记日志,不向上抛异常**——该接口同时承载商品与渠道配置,不能因资格判定失败整体失败;选"不可领"而不是"可领",是因为两个入口共用同一份数据源,判定失败时领取也必然失败,显示可领只会让用户白点一次。

### 5.2 领取赠送

```text
POST /api/client/subscription/review-reward/claim
```

要求有效登录态,**并强制携带设备标识**(缺失或非法时在入口拒绝,不进入领取编排),无请求体。成功响应 `data`:

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `result` | `granted` \| `already_claimed` | 本次成功加时或任一维度此前已领取 |
| `review_reward_claimed_count` | int | 领取成功后恒为 `1` |

`already_claimed` 是成功结果,不返回业务错误,不写事实行、不修改订阅。

Redis 锁不可用或 1 秒内抢不到锁返回 `SUBSCRIPTION_REVIEW_REWARD_BUSY = 26001`。活动关闭、配置缺失或非法时复用通用 `INVALID_REQUEST`,不增加活动专用错误码。

数据库读写失败由统一异常处理中间件返回服务端错误,不在业务层吞掉。

## 6. 领取流程

```text
鉴权 + 校验设备标识
  -> 读取活动开关
  -> 开关关闭:返回 INVALID_REQUEST
  -> 获取账号级 Redis 锁
  -> 读取账号、设备两个维度的领取事实
  -> 任一命中: 返回 already_claimed(不写任何行)
  -> 插入本次可用维度的事实行并提交(单事务)
  -> 订阅 +7 天并单独提交
  -> 返回 granted 与资格状态
  -> finally 释放锁
```

订阅加时规则复用统一到期时间算法:

- 当前 `expires_at > now`:新到期时间为原 `expires_at + 7 天`。
- 无记录、已过期或到期时间为空:新到期时间为 `now + 7 天`。
- 用 MySQL upsert 在数据库表达式内计算,避免普通读改写覆盖并发的支付续期。

订阅 service 抽出可复用的“按天数延长权益”原子能力。支付订单履约和好评赠送都调用同一算法;好评场景自行开启并提交 session,支付履约继续使用订单 service 已持有的 session。

跨事实表、Redis 锁和订阅的活动编排放在独立 `SubscriptionReviewRewardService`。模块底部暴露单例,内部直接引用 `subscription_service`、`user_service` 与模块级 `RedisLock`,不使用构造器依赖注入。`SubscriptionService` 只保留订阅读取和加时原子能力,API 只处理鉴权与响应。

## 7. Redis 锁

使用现有 `RedisLock`,不手写 `SET NX`:

| 项 | 值 |
| --- | --- |
| 业务 key | `subscription_review_reward:{user_id}` |
| 最终前缀 | 由 `RedisLock` 与 `build_redis_key` 统一生成 |
| TTL | 5 秒 |
| 获取超时 | 1 秒 |
| 释放 | 正常或异常结束时校验 owner 后释放 |
| 续租 | 无 |
| 降级 | fail-closed,返回 `SUBSCRIPTION_REVIEW_REWARD_BUSY` |

5 秒内未完成视为慢请求异常。锁到期后允许下一次请求重试;不增加心跳或租约协议。

该短锁只收敛正常请求并发,**真正的重复保护由事实表唯一键兜底**:并发请求或锁过期后的重入请求会在插入事实行时命中唯一键冲突,按已领取处理,不会二次加时。因此不需要心跳或租约协议。

## 8. 事务与失败语义

领取事实行和订阅使用两个独立 MySQL 事务,顺序固定为先事实行后订阅:

| 失败位置 | 结果 |
| --- | --- |
| 活动关闭、配置缺失或非法 | 无事实行、订阅或 Redis 写入,返回请求无效 |
| 设备标识缺失或非法 | 无数据库写入,返回参数错误 |
| 锁获取失败 | 无数据库写入,返回服务器繁忙 |
| 事实行判定读取失败 | 无数据库写入,请求失败 |
| 事实行插入失败(非唯一键冲突) | 订阅不加时,请求失败 |
| 唯一键冲突(并发或锁过期重入) | 按已领取处理,不加时,不写新行 |
| 事实行已提交、订阅加时失败 | 事实行保留为已领取,请求失败,不补偿 |
| 客户端未收到成功响应 | 后续重试按事实行返回 `already_claimed` |

明确接受“事实行已领取但未获得 7 天”的小概率部分失败。不回滚事实行,不自动或人工补发,不建立恢复任务。

## 9. 文件责任

```text
backend/src/app/constants/counter.py                          # 6001 保留注册并标注退役
backend/src/app/i18n/common_code.py                           # 服务器繁忙错误码
backend/src/app/models/user_review_reward_model.py            # 领取事实表
backend/src/app/utils/uid.py                                  # 两维度 uid 构造 helper(与 005 共用)
backend/src/app/schemas/subscription_schema.py                # 配置与领取请求合同
backend/src/app/api/client/subscription_client.py             # 配置与领取端点
backend/src/app/services/subscription_service.py              # 统一订阅加时原子能力
backend/src/app/services/subscription_review_reward_service.py # 资格推导与领取编排
backend/scripts/migrations/backfill_user_review_reward.py     # 6001 历史行迁移(幂等,只跑主站)
backend/scripts/e2e_seed_user.py                              # E2E 账号的领取事实清理与回读
backend/tests/integration/real/api/client/                    # 两维度真实 API 流程
backend/tests/integration/real/scripts/                       # 迁移核对真实测试
```

不新增第三方依赖。`config_public` 只新增一条人工维护的活动配置,业务代码和测试不写配置表。

## 10. 测试与验收

后端只写真实 MySQL + Redis 测试,不 mock service、数据库、Redis 或鉴权:

- 匿名配置返回活动开关与资格状态 `0`,商品配置保持可用。
- 已登录未领取账号返回 `0`;账号或设备任一维度已有事实时返回 `1`。
- 活动关闭时配置接口返回 `review_reward_enabled=false`;人工验证领取接口不写事实行、订阅或 Redis 锁,不为配置表开关增加写库测试。
- 首次领取写入账号与设备两行。无订阅时从当前时间增加约 7 天。
- 有效订阅首次领取从原到期时间精确增加 7 天;终生等既有周期语义不变。
- 重复领取返回 `already_claimed`,事实行与到期时间都不变。
- 同一浏览器第二个账号无法再领。
- 两个并发领取只有一个 `granted`,另一个为 `already_claimed` 或服务器繁忙,最终只增加 7 天;唯一键冲突按已领取处理。
- 预占同账号锁后领取返回 `SUBSCRIPTION_REVIEW_REWARD_BUSY`,数据库无副作用。
- 领取缺设备标识或设备标识非法被拒绝;无登录态调用领取接口被拒绝。
- 设备标识缺失或非法时在入口拒绝；账号与设备两个作用域任一命中即视为已领取。
- 迁移核对成立:旧表源账号全部命中,Python helper 与 MySQL `SHA2` 对同一输入输出一致。
- 测试数据使用唯一 `test_run_id`,结束后清理事实行、订阅与用户数据。

新增 Model 与 `users` 列,交付验证包含 schema sync。完整交付验证为 Black、Ruff、限定范围 mypy、real health smoke、目标 real 测试、real collect-only 与 Backend business 启动。

> 本次发布步骤已迁出:见按次发布单 `docs/ops/` 的历史发布单（已归档）(Free 每日 3 次 + 首日免费 + 好评奖励按账号 / 设备 / TG 三维度去重)。**该括号是发布当时的去重口径,其中 TG 身份维度已随单平台转型删除,现行口径只有账号与设备两个维度。**
