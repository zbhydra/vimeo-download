# 007 · 账号与认证

> 用户账号数据模型、JWT 签发/验签/轮换、会话 Redis 存储、邮箱验证码、IP 限流、认证 API 接口规格。
> 关联:`@feat.md` `@tech-第三方登录.md`(Google OAuth 部分)
> 边界:本文只描述**客户端用户认证**(`USER_ACCESS`/`USER_REFRESH` token 类型)。admin / 管理后台的 JWT-only 认证属 `@../008.管理后台/tech-后台架构与认证.md`,使用独立的 admin 账号表与 `ADMIN_*` token 类型,本域不涉及。

## 1. 账号数据模型

### 1.1 users 表

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `user_id` | bigint PK | 自增 | 用户唯一标识 |
| `email` | varchar(64) | NULL | 登录邮箱;规范化后存(trim + 小写,不做 Gmail 点号/`+tag` 折叠);账号归属以此为准 |
| `password_hash` | varchar(64) | NOT NULL | 密码哈希(bcrypt);无密码账号(邮箱验证码/Google 创建)写魔法值 `!NOLOGIN!`,不可用密码登录 |
| `full_name` | varchar(100) | NULL | 全名 |
| `avatar_url` | varchar(255) | NULL | 头像 URL |
| `register_source` | varchar(20) | NULL | 首次注册来源(`extension` / `web`),插件回调归为 `extension`;邮箱入口沿用 `X-Client-Product`,Google 其他入口为 `web`。已有账号不覆盖 |
| `register_method` | varchar(32) | NULL | 首次注册方式(`google` / `email_code`);只在首次创建时写,后续换登录方式不覆盖;仅用于来源分析,不参与登录查询 |
| `register_user_agent` | varchar(512) | NULL | 注册时 User-Agent |
| `register_ip` | varchar(64) | NULL | 注册时 IP |
| `register_country` | varchar(8) | NULL | 注册时国家/地区(GeoIP) |
| `tg_user_id` | bigint | NULL | **已废弃**。原 Telegram 账号绑定列，绑定接口已随单平台转型删除；模型上用 `schema_sync_drop_columns` 标记，列与历史值保留惰性，等人工执行结构同步时删除。注册、登录与本域任何链路都不再读写 |
| `is_del` | tinyint(1) | `0` | 软删/注销标记;`true` 时登录被拒(按"用户不存在") |
| `last_login_at` | bigint | NULL | 最后登录时间(毫秒时间戳) |
| `last_login_ip` | varchar(64) | NULL | 最后登录 IP |
| `last_login_country` | varchar(8) | NULL | 最后登录国家/地区 |
| `last_operation_ip` | varchar(64) | NULL | 最后操作 IP |
| `last_operation_country` | varchar(8) | NULL | 最后操作国家/地区 |
| `login_count` | int | `0` | 累计登录次数(每次登录 `+1`) |
| `locked_until` | bigint | NULL | 账号锁定截止时间(毫秒时间戳);字段与判断就位,但当前失败计数为 stub,实际不触发(见 §6) |
| `created_at` | bigint | `timestamp_now()` | 创建时间(毫秒时间戳) |
| `updated_at` | bigint | `timestamp_now()` | 更新时间(毫秒时间戳) |

索引:

| 索引 | 说明 |
| --- | --- |
| `PRIMARY KEY(user_id)` | 主键 |
| `UNIQUE KEY email(email)` | 邮箱业务唯一;同一邮箱只能对应一个用户,登录/注册按邮箱查找依赖此约束 |

> **不存在 `failed_login_attempts` 列**。失败计数当前是 stub(见 §6),用户级锁定字段虽在表里但未被失败登录流程触发。

### 1.2 user_ip_registers 表

本表记录注册时看到的 IP 与用户 ID,只服务注册权益风控。它是可随时清理的辅助表,不承担审计、幂等或强一致性。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `user_id` | bigint PK | 无 | 用户 ID;每个用户最多一条注册 IP 记录 |
| `ip_address` | varchar(64) | 无 | 注册时客户端 IP,取 `get_client_ip(request)` |
| `created_at` | bigint | `timestamp_now()` | 记录创建时间(毫秒时间戳) |

索引:

| 索引 | 服务查询 |
| --- | --- |
| `PRIMARY KEY(user_id)` | 签到入口按当前用户读取自己的注册 IP 记录 |
| `idx_user_ip_registers_ip_address(ip_address)` | 注册和签到风控按 IP 统计窗口内注册数量 |

索引依据:

1. 现有 PK/UK/INDEX:新表只有 `PRIMARY KEY(user_id)` 与 `idx_user_ip_registers_ip_address(ip_address)`,不存在重复最左前缀。
2. 实际查询位置:注册权益判断会执行 `WHERE ip_address = :ip AND created_at >= :window_start`;签到入口会先按 `user_id` 取当前用户注册记录,再按 `ip_address` 回看该用户注册时窗口内的注册数量。
3. 索引服务:单列 `ip_address` 支撑高频注册/签到窗口统计;`created_at` 不放进联合索引,因为本表允许随时清理,查询不追求金融级精确。

### 1.3 用户状态判定

`UserModel.user_status()` 返回三态:

| 状态 | 条件 |
| --- | --- |
| `OK` | `is_del=false` 且未锁定 |
| `LOCKED` | `locked_until > now` |
| `DELETED` | `is_del=true` |

登录前置校验 `_ensure_user_can_login`:`LOCKED` → 账号锁定错误;`DELETED` → 用户不存在错误。

## 2. JWT 配置与签发

### 2.1 配置(`AuthSettings`,env 前缀 `AUTH_`)

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `jwt_secret_key` | `your-secret-key-change-in-production` | JWT 共享密钥(HS256);**与节点 admin JWT 共用同一份密钥配置**,但 token 类型与账号体系不同 |
| `jwt_algorithm` | `HS256` | JWT 算法 |
| `google_client_id` | 空 | Google OAuth client id(Google 登录用,见 `@tech-第三方登录.md`) |
| `google_client_secret` | 空 | Google OAuth client secret(仅后端) |
| `access_token_expire` | `86400`(24 小时) | access token TTL(秒) |
| `refresh_token_expire` | `604800`(7 天) | refresh token TTL(秒) |
| `refresh_token_remember_days` | `30` | "记住我"场景的延长天数(预留) |
| `max_login_attempts` | `5` | 用户级最大失败次数(**已加载但未实际生效**,见 §6) |
| `lock_duration_minutes` | `30` | 用户级锁定时长分钟(**已加载但未实际生效**) |
| `rate_limit_times` | `10` | 登录限流次数 |
| `rate_limit_period` | `60` | 登录限流窗口(秒) |

### 2.2 Token 类型(`TokenType`)

| 枚举值 | 用途 | 归属 |
| --- | --- | --- |
| `USER_ACCESS`(`user_access`) | 客户端用户 access token | **本域** |
| `USER_REFRESH`(`user_refresh`) | 客户端用户 refresh token | **本域** |
| `USER_REFRESH_OLD`(`user_refresh_old`) | refresh 轮换宽限期内旧 token | **本域** |
| `ADMIN_ACCESS` / `ADMIN_REFRESH` / `ADMIN_REFRESH_OLD` | admin token | 管理后台域(`@../008.管理后台/tech-后台架构与认证.md`),本域不涉及 |

### 2.3 Token claims(`JwtData`)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | int | 用户唯一标识;`USER_ACCESS` 验签时 `user_id < 1` 视为非法 |
| `email` | str | 用户邮箱 |
| `exp` | int | 过期时间(Unix 秒) |
| `type` | `TokenType` | token 类型;access 签发时强制 `USER_ACCESS`,refresh 强制 `USER_REFRESH` |
| `jti` | str(UUID) | JWT 唯一标识;每次签发生成新 UUID |

### 2.4 签发(`JwtUnit`)

- `create_access_token(data, expires_delta=None)`:exp = now + `access_token_expire`(或 `expires_delta`);type=`USER_ACCESS`;jti=新 UUID;用 `jwt_secret_key` + `jwt_algorithm` 编码。返回 `(token, expire)`。
- `create_refresh_token(data, ...)`:同上,type=`USER_REFRESH`,TTL=`refresh_token_expire`。
- `decode_token(token)`:用密钥 + `[jwt_algorithm]` 解码;重构 `JwtData`;`ADMIN_ACCESS` 类型跳过 `user_id<1` 检查,其他类型 `user_id<1` 返回 `None`;任何解码异常返回 `None`。

## 3. 会话存储(Redis)

Token 不直接可信,服务端在 Redis 维护"未撤销 token 哈希集合"做有效性校验。member = `md5(token)`,score = `expires_at`(Unix 秒),用 Sorted Set 便于按到期时间清理。当前 access / refresh ZSet 的 key 绝对过期时间等于最近一次成功写入 token 的 `expires_at`;新 token 的绝对过期时间不早于同 key 已有 score(大于或等于),同秒签发可得到相等 `expires_at`。`auth` token 有效期配置只能保持或延长;若缩短,新 `EXPIREAT` 会让同 key 中按旧周期签发的 token 提前失效,用户需要重新登录。

### 3.1 Key 结构(`UserTokenService`,均经 `build_redis_key` 前缀化,前缀见 `spec-redis.md`)

| Key | 用途 |
| --- | --- |
| `access_token:{user_id}` | 用户当前所有有效 access token(ZSet) |
| `refresh_token:{user_id}` | 用户当前所有有效 refresh token(ZSet) |
| `refresh_token_old:{user_id}` | refresh 轮换宽限期内的旧 refresh token(ZSet,独立 TTL 30 秒) |

### 3.2 操作

| 方法 | 行为 |
| --- | --- |
| `store_token` | transaction pipeline 原子执行 `ZADD` 与 `EXPIREAT expires_at`;成功后独立删除 `score <= now` 的过期 member |
| `verify_token` | `ZSCORE` md5;缺失 → `False`;score < now → 惰性撤销并 `False`;否则 `True` |
| `revoke_token` | `ZREM` md5;登出当前 token 用 |
| `revoke_all_user_tokens(user_id)` | `DEL` 三个 ZSet;返回删除总数(**无公开入口触发**,账号注销场景预留) |
| `rotate_refresh_token(old, new, user_id, new_expires_at)` | transaction pipeline:`ZREM refresh_key old_hash` → `ZADD refresh_old_key {old_hash: now+30}` → `EXPIRE refresh_old_key 30` → `ZADD refresh_key {new_hash: new_expires_at}` → `EXPIREAT refresh_key new_expires_at`;成功后独立删除当前 ZSet 中 `score <= now` 的过期 member |
| `verify_refresh_token_with_grace_period(token, user_id)` | 先查 `refresh_token:{user_id}`;命中且未过期 → `True`;未命中再查 `refresh_token_old:{user_id}`(30 秒宽限),命中且未过期 → `True`(日志 `Accepted old refresh token in grace period`);否则 `False` |

### 3.3 宽限期常量

- `REFRESH_TOKEN_GRACE_PERIOD_SECONDS = 30` —— refresh 轮换后旧 token 还能再用 30 秒,处理并发刷新(多个请求同时发现 access 过期、都用同一 refresh 刷新,只有第一个能轮换,其余在宽限期内仍能刷新成功)。

## 4. 客户端身份解析(`get_current_user` / `get_current_user_optional`)

请求身份由 `UserContext` 表达:`user_id, token, device_id, language, ip, client_product`。

### 4.1 `get_current_user`(强制登录)

- `HTTPBearer` 取 token → 解码 → **type 必须是 `USER_ACCESS`**(否则拒绝)→ `ctx.check_strict()` 调 `verify_token` 校验 Redis → 任一失败抛认证失败(401)。
- 解析 `Accept-Language` → language;`X-Client-Id` 辅助;`X-Device-Id` 校验(长度 ≤64,正则 `^[A-Za-z0-9_-]+$`,**不能全数字**——避免与数字 user_id 命名空间冲突);IP 经 `get_client_ip`;`client_product` 经 `normalize_client_product`。
- Website 依赖严格接口的 401 清理本地过期 access token；生产反向代理必须让 401 保留 CORS 响应头，使浏览器能够读取真实状态码。普通断网仍按网络错误处理，不清登录态。

### 4.2 `get_current_user_optional`(游客兼容)

- 有效 access token → 返回登录身份 `UserContext(user_id>0)`;optional 场景**不校验 Redis 撤销状态**。
- 无 token,或 token 的签名、有效期、类型无效 + 有效 `X-Device-Id` → `UserContext(user_id=0)`(匿名身份,由计数器系统统计,见 `@../005.计数器系统/feat.md`)。过期登录态不能阻断允许游客访问的接口。
- 没有有效 token 且无 device_id → 抛认证失败(401),因为无法建立登录或游客身份。

## 5. 邮箱验证码

### 5.1 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `EMAIL_VERIFY_CODE_LENGTH` | `6` | 6 位数字(`secrets.choice` 从 `0123456789` 取) |
| `EMAIL_VERIFY_CODE_EXPIRE_SECONDS` | `600` | 10 分钟有效 |
| `EMAIL_VERIFY_RATE_LIMIT_WINDOW` | `60` | 发送频率窗口 60 秒 |
| `EMAIL_VERIFY_RATE_LIMIT_MAX` | `1` | 同邮箱 60 秒内最多发 1 次 |
| `EMAIL_VERIFY_MAX_ATTEMPTS` | `5` | 最多 5 次验证尝试 |

### 5.2 Redis Key(`EmailVerificationService`,经 `build_redis_key` 前缀化)

| Key | 用途 |
| --- | --- |
| `email_verify:{email}` | 验证码本身;`SET ... EX 600` |
| `email_verify_attempts:{email}` | 验证尝试计数;`INCR` 后首次 `EXPIRE 600` |

发送频率用 `RedisRateLimiter`(滑动窗口 ZSet),key = `email_verify:{email}`,limit=1,window=60。Redis 故障 fail-open(放行)。

### 5.3 行为

- `send_verify_code(email)`:先频率限制(超限返回 RATE_LIMITED)→ 生成码 → `redis.set EX=600` → 发邮件;**发邮件失败时删码并重置频率限制**(让用户立即重试)→ 返回 SUCCESS / RATE_LIMITED / SEND_FAILED。
- `verify_code(email, code)`:`INCR attempts`(首次设 600 秒 TTL)→ `attempts > 5` 删码+计数返回 `False` → `secrets.compare_digest` 比对 → 命中删码+计数返回 `True`。**计数在码缺失/过期时也会 +1**。

### 5.4 邮件文案

- 主题:`验证码登录`
- 正文:`您的验证码是: {code}\n验证码有效期为10分钟,请勿泄露给他人。`
- 发送成功响应消息:`验证码已发送`
- 发送重试:`EMAIL_SEND_RETRY_TIMES = 3`,`EMAIL_SEND_RETRY_DELAY = 1`

## 6. 登录失败保护

### 6.1 IP 级别(当前生效)

| 常量 | 值 |
| --- | --- |
| `LOGIN_RATE_LIMIT_WINDOW` | `300`(5 分钟) |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `10`(10 次失败) |
| `IP_BLOCK_DURATION` | `600`(封禁 10 分钟) |

登录接口 `login` 流程:

1. 取 IP = `request.client.host`(原始 client host,非 `get_client_ip`)。
2. 预检 `_ip_block_manager.is_blocked(ip)` → 命中抛 IP 封禁错误。
3. 凭证失败:`_rate_limiter.is_allowed(identifier=ip, limit=10, window=300)`(`RedisFixedLimiter` 固定窗口 INCR + Lua,key 前缀 `login_rate_limit`)→ 不允许则 `_ip_block_manager.block(ip, 600)`(Redis `SET ip_block:{ip} EX 600`)并抛 IP 封禁错误;允许则 `update_failed_login` + 抛凭证错误。

Redis 故障 fail-open。

### 6.2 用户级别(已就位但未生效)

- `UserAuthService.__init__` 加载了 `max_login_attempts=5` 与 `lock_duration_minutes=30`,但**登录流程未使用**。
- `user_service.increment_failed_attempts(user_id)` 是 **stub,恒返回 `True`**(函数体注释掉,注 `failed_login_attempts field is not implemented in UserModel`)。
- `locked_until` 字段、`is_locked()`、`lock_user_until/unlock_user` 方法、`UserLoginStatus.LOCKED` → 错误码映射全部就位,只差失败计数接线。
- 实际生效的失败保护是 §6.1 的 IP 级别。

> 这是已知 TODO;若需用户级锁定,要在 users 表加 `failed_login_attempts` 列并实现 `increment_failed_attempts`。

## 7. 注册赠送与 IP 注册权益风控

| 注册路径 | 赠送内容 | 说明 |
| --- | --- | --- |
| 邮箱验证码(`create_user_without_password_with_registration_bonus`) | 0 或 10 Credits | 未命中 IP 注册权益风控时走积分系统 `_add_registration_credits`;命中时跳过;不写订阅权益行 |
| Google 无密码权威邮箱(同上方法) | 0 或 10 Credits | 同上 |
| 密码注册(`create_user_with_registration_bonus`) | 0 或 10 Credits | 同上 |

`REGISTRATION_BONUS_CREDITS = 10`,`REGISTRATION_BONUS_REASON = "registration_bonus"`。赠送失败只记日志,不影响注册成功。

IP 注册权益风控配置写在 `config_public`,key = `registration_ip_benefit_guard`:

```json
{
  "window_seconds": 86400,
  "max_registrations": 3
}
```

上线时必须写入公共配置表:

```sql
INSERT IGNORE INTO config_public (c_key, g_value)
VALUES ('registration_ip_benefit_guard', '{"window_seconds":86400,"max_registrations":3}');
```

语义:

- `window_seconds`:回看窗口秒数。
- `max_registrations`:同一 IP 在窗口内仍可获得注册权益的最大注册数。例如值为 `3` 时,同 IP 第 4 个及之后新账号不送注册 Credits,也不给可领取签到活动。
- 配置缺失、类型非法、`window_seconds <= 0` 或 `max_registrations <= 0` 时,风控视为关闭,不影响注册赠送和签到。

注册流程:

1. 创建用户前按 `register_ip` 统计 `user_ip_registers` 中窗口内同 IP 记录数。
2. 记录数 `>= max_registrations` 时,本次新账号标记为本次注册权益不可发;账号仍正常创建。
3. 用户创建成功后 best-effort 插入 `user_ip_registers(user_id, ip_address, created_at)`;插入失败只打印日志,不回滚用户、不重试、不阻断后续登录。
4. 未命中风控时调用 `_add_registration_credits`;命中风控时跳过 `_add_registration_credits`。
5. 命中风控时,注册流程立即调用签到服务插入一条已过期的 `user_checkin_campaigns`,不等用户首次进入签到系统。该插入不做幂等、不做补偿;插入失败允许影响本次注册接口返回。
6. 不做补发、不做人工恢复接口;如果运营清理 `user_ip_registers`,只影响清理后的新判断。

配置读取:

- `user_ip_register_service` 调 `config_public_service.get("registration_ip_benefit_guard")` 读取配置。`config_public_service` 已经把 `g_value` 从 JSON 字符串解析成 Python 值,业务 service 不直接查 `config_public` 表。
- 用一个本模块内的 Pydantic model 校验 `window_seconds` 和 `max_registrations`;校验失败按风控关闭处理,记录日志即可。
- 不新增依赖注入,直接 import 现有 `config_public_service` 模块级实例。

签到联动:

- 命中风控的账号在注册阶段已经有一条过期 campaign。
- `user_checkin_service` 进入或领取签到时先读取用户最新一条 campaign;只要存在 campaign,就按该 campaign 计算状态,不再因为它已过期而创建新活动。
- 只有用户完全没有 campaign 时,才按原流程创建正常活动。
- 该逻辑不新增用户表字段,不追求强一致;辅助表被清理后,只影响后续新注册判断。

## 8. 接口规格

所有客户端认证接口挂载在 `/api/client/auth/...`(router prefix `/auth`,父 `/api/client`)。方法只用 GET / POST。

### 8.1 邮箱验证码登录

#### `POST /api/client/auth/send-email-code`

发送验证码。Body:`{ email }`。可选登录(已登录则用用户语言,否则默认)。响应:`{ message: "验证码已发送" }`。

#### `POST /api/client/auth/email-verify-login`

验证码登录/注册。Body:`{ email, code(=6) }`。校验验证码:未注册则创建无密码账号(`register_method=email_code`)并按 IP 注册权益风控决定是否赠送 10 Credits;已注册则登录;并发创建冲突按 IntegrityError 处理。响应:`{ access_token, refresh_token, token_type:"bearer", expires_in, user: UserInfo }`。

插件 `LoginModal` 负责收集邮箱、发送验证码和展示结果；提交经仅允许 popup 调用的 `loginWithEmailCode` RPC 交给 `BackgroundMessageRouter`。background 完成兑换并保存 access、refresh 与用户信息三键后返回，popup 关闭不结束这段工作；重开由 `authStore.initialize()` 读取并校验存储身份。网站仍由自己的认证上下文完成登录，设备可信闸门见 [Website 设备可信校验](./tech-邮箱登录设备校验.md)。

### 8.2 密码注册/登录(历史接口,前端未暴露 UI)

#### `POST /api/client/auth/register`

Body:`{ email, password(min6/max100), full_name? }`。邮箱已存在则报错;否则 `create_user_with_registration_bonus`(按 IP 注册权益风控决定是否送 10 Credits)。响应:`UserInfo`(含 credits_balance)。

#### `POST /api/client/auth/login`

Body:`{ email, password }`。IP 封禁 + 限流预检 → `authenticate_user`(bcrypt 校验)→ 失败更新失败计数并抛错;成功走登录流程。响应:`LoginResponse`。

> website/extension 当前不暴露密码登录 UI,主路径是邮箱验证码与 Google;这两个接口保留供历史/兼容。

### 8.3 Token 管理

#### `POST /api/client/auth/refresh`

Body:`{ refresh_token }`。解码 → 加载用户 → `_ensure_user_can_login` → `verify_refresh_token_with_grace_period`(含 30 秒宽限)→ 签新 access + 新 refresh → `rotate_refresh_token`(旧 refresh 进宽限期)→ 存新 access。响应:`{ access_token, refresh_token, token_type:"bearer", expires_in }`。

> 新 refresh 的存储由 `rotate_refresh_token` pipeline 内的 `ZADD` 完成,接口本身不再单独 `store_token` 新 refresh。

Extension 对 refresh 响应采用结果判定:HTTP 200 必须同时满足成功业务码且含非空 `access_token + refresh_token`,否则视为永久失败并清除插件本地认证状态;HTTP 200 响应不可解析同样等价于没有 token。网络异常和非认证类非 200 响应只视为临时故障,保留现有登录态供后续重试。

插件 `interceptors.ts` 的单飞 refresh Promise 覆盖 fetch 与响应体解析，使用有界 AbortSignal；失败后允许下一次请求重试。Popup 根组件在首次 await 前订阅业务事件，认证初始化不延迟额度和成功通知订阅。

#### `POST /api/client/auth/logout`

需 `get_current_user`。读当前 Bearer → `revoke_token(token, user_id, USER_ACCESS)`(**只撤销当前 access token**)。响应:`{}`。

> 不撤销 refresh token、不影响其他设备(多设备登录保留)。完整撤销 `revoke_all_user_tokens` 存在但无公开入口触发。

### 8.4 账号信息

#### `GET /api/client/auth/me`

需 `get_current_user`。未登录、token 无效或 token 对应的用户记录已删除时返回 401,使客户端清除旧登录态并重新登录;不支持匿名调用。

Website Pro 恢复登录态时，HTTP 401 与 HTTP 200 但业务码非 10000 都表示服务端未确认当前用户，必须清除本地 access token 并回到游客态。网络异常和 5xx 属于瞬时故障，保留 token 供刷新重试。

按 `ctx.user_id` 取账号 → `_build_user_info`(资料 + Credits 余额 + 当前订阅摘要)。Credits 余额走积分系统;当前订阅摘要走订阅系统的当前权益读取能力,不调用旧兼容状态接口。响应:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | int | 用户 ID |
| `email` | str\|null | 邮箱 |
| `full_name` | str\|null | 全名 |
| `avatar_url` | str\|null | 头像 |
| `created_at` | int | 创建时间(毫秒) |
| `credits_balance` | int | Credits 余额(默认 0,积分系统读) |
| `current_subscription` | object | 当前订阅与插件次数摘要;Free 也返回结构化对象 |

`current_subscription` 字段:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `product_id` | str | 当前权益商品;Free 返回 `free` |
| `display_name` | str | 订阅展示名 |
| `auto_renew` | bool | 当前是否仍会自动续费 |
| `period` | str\|null | 当前订阅实例的商业周期快照 |
| `payment_method` | str\|null | 最近成功扣款渠道 |
| `cancel_at_period_end` | bool | 本站是否已确认到期停止续费;可能晚于渠道后台状态 |
| `expires_at` | int\|null | 到期时间(毫秒);Free 为 null |
| `extension_download` | object | 插件今日下载次数对象 |

`current_subscription.extension_download` 字段:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `use` | int | 今日已用次数;不限次数时返回 0 |
| `remaining` | int | 今日剩余次数;Unlimited 返回 -1 |
| `limit` | int | 今日上限;Free 非首日为 3,Unlimited 与首日为 -1 |

这个字段服务 website pricing、账号入口和已登录 website 展示。插件端和匿名设备的订阅权益与今日次数状态仍读取订阅系统状态接口。

### 8.5 响应 schema(`UserInfo` / `LoginResponse`)

`LoginResponse`:`{ access_token, refresh_token, token_type:"bearer", expires_in, user: UserInfo }`。`UserInfo` 即 §8.4 字段集。邮箱验证码登录、密码注册、Google 登录、exchange 均返回 `LoginResponse` 或 `UserInfo`。

插件登录不修改通用 `LoginResponse`。插件通过后端 OAuth authorize + Google 授权窗口拿到一次性 code,再调 `/api/client/auth/google/exchange`(公开端点,无需 Website 登录态)换取插件 token,响应字段与通用登录一致。协议细节见 `tech-第三方登录.md` §9。

## 9. 实现代码索引

- users 表模型:`@backend/src/app/models/user_model.py`
- 用户 service(创建/查询/登录信息更新/锁定):`@backend/src/app/services/user_service.py`
- 认证 service(密码校验/会话存储/登录信息):`@backend/src/app/services/user_auth_service.py`
- Token service(Redis 存储/校验/轮换/撤销):`@backend/src/app/services/user_token_service.py`
- JWT 工具(签发/解码/JwtData):`@backend/src/app/utils/jwt.py`
- 认证常量(TTL/限流/验证码/宽限期):`@backend/src/app/constants/auth.py`
- 邮箱验证码 service:`@backend/src/app/services/email_verification_service.py`
- IP 封禁 / 限流:`@backend/src/app/utils/ip_block_manager.py` `@backend/src/app/utils/redis_rate_limiter.py`
- 当前用户依赖(`get_current_user` / `get_current_user_optional` / `UserContext`):`@backend/src/app/api/user_dependencies.py`
- 认证 API:`@backend/src/app/api/client/auth_client.py`
- 响应 schema:`@backend/src/app/schemas/client_user_schema.py`
- 认证配置:`@backend/src/app/core/config_schema.py`(`AuthSettings`)
- 注册赠送 Credits:见 `@../003.积分系统/feat.md`

## 10. 非功能要求

- 不新增第三方依赖;不新增依赖注入(`user_service` / `user_auth_service` / `user_token_service` / `email_verification_service` 均为进程级单例,api 层可用 `Depends`)。
- 接口只用 GET / POST。
- token 校验走 Redis Sorted Set,校验时仍惰性撤销命中的过期 token;当前 token ZSet 同时依靠 key TTL 最终整体回收,不允许加载全量 member 再逐项处理。
- 批量撤销用 `DEL` 三个 ZSet 一次完成。
- 错误信息带 `user_id` / `email` / `ip` 等可定位字段;抛 `AppCommonException` 必须带详细 msg(哪里的错误/错什么/请求哪个接口)。
- token 注册表事务写入失败采用 fail-closed 并保留原始堆栈;写入成功后的过期 member 清理失败只记录日志。限流、封禁与频率控制继续采用 fail-open。
- 修改 users 表后执行 `@backend/src/app/init/sync_database_schema.py`。
