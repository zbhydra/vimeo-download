# 003 · Credits 数据模型与扣费(模型 + 扣费算法 + resource token + 6 小时窗口)

> 技术实现文档。覆盖:Credits 持久化模型与注册赠送/存量补发迁移、website 下载扣费算法、resource token、6 小时免扣窗口、余额查询、extension 端保留每日次数的边界。
>
> 来源:原 `feat.051.001 Credits 数据模型与迁移` + `feat.051.002 Credits 下载扣费后端`。
>
> 关联:
> - 本域产品:`@feat.md`
> - 积分包商品配置与购买弹窗后端:`@tech-购买.md`
> - website 前端弹窗组件、旧 quota 清理、用户信息字段:`@tech-前端与清理.md`
> - 下载授权链路调用本域扣费:`@../002.下载功能/tech-链路与授权.md`
> - extension 端每日次数口径:`@../005.计数器系统/feat.md`
> - 订单履约给用户加 Credits:`@../004.订单系统/feat.md`

## 1. 数据模型

### 1.1 持久化模型

三张表,字段按 `@feat.md` 第 4 节(积分规则)与下载记录需求实现:

```text
backend/src/app/models/user_credit_account_model.py   # user_credit_accounts 余额账户
backend/src/app/models/user_credit_log_model.py       # user_credit_logs      流水(只记录每次余额变化,不承担业务幂等)
backend/src/app/models/user_download_record_model.py  # user_download_records 只记录 website Credits 下载,不记录 extension 下载
```

字段约定:

- `user_download_records.resource_key`:MD5 hex,字段类型 `char(32)`。
- `user_download_records.created_at`:6 小时免扣窗口查询条件,**不能删除**,但不放进索引。
- `(user_id, resource_key)` 不加唯一索引;同一 website 用户同一资源可以多次下载并多次记录。
- `user_credit_logs` 不保存业务幂等键;流水只记录每次余额变化。重复支付回调由订单状态控制(见 `@../004.订单系统/feat.md`)。

### 1.2 索引

只加真实查询需要的(遵循 `../../references/specs/spec-index.md`):

| 表 | 索引 | 服务查询 |
| --- | --- | --- |
| `user_credit_logs` | 无 | 流水只按写入记录审计,不承担业务幂等 |
| `user_download_records` | `idx_user_download_resource(user_id, resource_key)` | 定位同一 website 用户同一资源的历史下载记录 |

不要给 `user_id`、`reason` 单独加索引。

### 1.3 Credits service

```text
backend/src/app/services/user_credit_service.py
```

公开方法:

```python
class UserCreditService:
    async def get_balance(self, user_id: int) -> int
    async def add_balance(self, *, user_id: int, amount: int, reason: str,
                          resource_key: str | None = None, metadata_json: str | None = None) -> CreditBalanceChangeResult
    async def add_balance_in_session(self, db: AsyncSession, *, user_id: int, amount: int, reason: str,
                                     resource_key: str | None = None, metadata_json: str | None = None) -> CreditBalanceChangeResult
    async def cut_balance(self, *, user_id: int, amount: int, reason: str,
                          resource_key: str | None = None, metadata_json: str | None = None) -> CreditBalanceCutResult
    def calculate_download_credits(self, size_bytes: int | None) -> int
    def build_download_resource_key(self, *, platform: str, canonical_link: str,
                                    source_id: str, download_mode: str) -> str
    async def charge_download(self, *, user_id: int, platform: str, canonical_link: str,
                              source_id: str, download_mode: str,
                              filename: str | None, size_bytes: int | None) -> CreditChargeResult
```

规则:

- 新建余额账户时 `balance=0`,再通过流水加 10(注册赠送)。
- 公共余额方法不接收 `dedupe_key`,每调用一次就写一条流水并变更一次余额;业务幂等由对应业务表或订单状态处理。
- 不新增依赖注入,直接导出 `user_credit_service = UserCreditService()`。
- `add_balance_in_session` 供订单履约在订单事务内调用(见 `@../004.订单系统/feat.md`)。

`CreditChargeResult`:

```python
@dataclass(frozen=True, slots=True)
class CreditChargeResult:
    allowed: bool
    cost: int
    balance: int
    free_reason: str | None
```

## 2. 注册赠送与存量补发迁移

### 2.1 注册接入

修改 `backend/src/app/services/user_service.py`,位置:

- `create_user_with_registration_bonus()`
- `create_user_without_password_with_registration_bonus()`

规则:

- 用户创建成功后,由用户系统先按 IP 注册权益风控判断是否可发;可发时调用 `user_credit_service.add_balance()` 发放注册 Credits(10),不可发时不调用积分服务。
- 赠送失败只记录错误,不回滚注册;用户后续刷新 me 可见修复后的余额。
- 不赠送订阅试用,不写 `user_subscriptions`。
- IP 注册权益风控的 `user_ip_registers` 辅助表、`config_public.registration_ip_benefit_guard` 配置和签到拦截归 `@../007.用户系统/tech-账号与认证.md`;积分系统不保存风控状态。

### 2.2 存量补发一次性 SQL

执行入口:

```bash
cd backend
uv run python src/app/init/sql_executor.py --sql "<SQL>"
```

幂等 SQL 流程:

1. 创建三张表。
2. 一条补发 SQL 选出没有初始化积分流水的 `users.is_del = false` 用户。
3. 为这批用户创建账户。
4. 插入 `legacy_registration_bonus` 流水。
5. 给这批用户的账户余额加 10。

要求:

- SQL 通过命令行参数传入,可重复执行。
- 不依赖 Python 逐用户循环;补发逻辑放在一条 SQL 里,不拆成多个上线步骤。
- 重跑时以"没有 `registration_bonus` 或 `legacy_registration_bonus` 流水"为补发条件。
- 如果旧库已创建 `user_credit_logs.dedupe_key` 和唯一索引,迁移 SQL 只负责删除旧字段和旧索引,不新增唯一约束。

## 3. 下载扣费算法

### 3.1 体积阶梯(`calculate_download_credits`)

| 文件大小 | Credits |
| --- | ---: |
| `size` 未知(`None`) | 2 |
| `size < 50 MiB` | 1 |
| `50 MiB <= size < 300 MiB` | 2 |
| `300 MiB <= size < 800 MiB` | 3 |
| `800 MiB <= size < 1300 MiB` | 4 |
| `1300 MiB <= size < 1800 MiB` | 5 |
| `1800 MiB <= size < 2300 MiB` | 6 |
| `2300 MiB <= size < 2800 MiB` | 7 |
| `2800 MiB <= size < 3300 MiB` | 8 |
| `3300 MiB <= size < 3800 MiB` | 9 |
| `3800 MiB <= size < 4300 MiB` | 10 |
| `size >= 4300 MiB` | `11 + floor((size - 4300 MiB) / 500 MiB)` |

- `MiB = 1024 * 1024` 字节。
- 文件大小以 resource token claims、解析结果或授权结果中的 `size` 为准。
- 多轨合成下载使用合计大小。
- website 批量下载逐个资源计算,已免扣资源不占用积分。

### 3.2 resource_key 构造(`build_download_resource_key`)

输入:`platform / canonical_link / source_id / download_mode`。

输出:MD5 hex,长度 32。

- 不同 `download_mode`(direct / client_mux)产出不同 resource_key,direct 与 client_mux 不互相免扣。
- `download_mode` 取值只有 `direct` / `client_mux`;`proxy` 已下线,契约层不再保留该枚举,含 `proxy` 的 resource token 在 resource token 验签阶段即被拒(`resource_token_unsupported_download_mode`),不会进入本函数。免扣只按 `resource_key` 是否命中判定。
- MD5 只用于 `resource_key`,不能用于 token 防篡改。

## 4. resource token

下载授权链路(见 `@../002.下载功能/tech-链路与授权.md`)在 `parse-v2` 签发 resource token,在 `download-pre-v2` 验签,只信任 token claims 内的资源和计费字段。

### 4.1 配置

新增 `DownloadTokenSettings.resource_token_secret`,YAML 字段 `download_token.resource_token_secret`,部署环境变量 `RESOURCE_TOKEN_SECRET`。

- business 和 download role 都配置同一份 secret;download role 在 parse-v2 签发,business role 在 download-pre-v2 验签。
- secret 是服务端私密配置,不能写入任何前端环境变量或响应。
- secret 不能为空;`app.env=prod` 时不能等于 `CHANGE_ME` / `change-me` / `default` / `your-secret-key-change-in-production`。
- 配置加载失败直接启动失败;运行中签发或验签发现 secret 缺失时抛 `INTERNAL_SERVER_ERROR`,不降级信任请求体。

### 4.2 服务接口

```text
backend/src/app/services/media_execution_token_service.py
```

使用 `media_execution_token_service` 的 Fernet 加密认证，不使用 JWT 或客户端可读签名。

```python
@dataclass(frozen=True, slots=True)
class ResourceMaterialClaims:
    platform: str
    canonical_link: str
    source_id: str
    download_mode: str
    filename: str | None
    mime_type: str | None
    size: int | None
    material: DownloadMaterial
    iat: int
    exp: int

class MediaExecutionTokenService:
    def issue_resource_token(self, *, platform, canonical_link, source_id,
                             download_mode, filename: str | None,
                             mime_type: str | None, size: int | None,
                             material: DownloadMaterial) -> str
    def decode_resource_token(self, token: str) -> ResourceMaterialClaims
```

### 4.3 语义与约束

- TTL 24 小时;前端 workspace snapshot 保留时间不超过 24 小时,避免恢复出已过期的解析结果 token。
- `parse-v2` 构造每个资源响应时签发 `resource_token`;签发失败整个 parse-v2 返回错误,不返回缺 token 的资源。
- `MediaSourceResponse` 新增 `resource_token: str`。
- `MediaDownloadPreV2Request` 必须携带 `resource_token / preferred_node_id`;download-pre-v2 验签 resource token,**只使用** claims 中的 `platform / canonical_link / source_id / download_mode / filename / size` 扣 Credits 并返回 material,不再从请求体直接读取这些字段。
- `size=null` 时按未知大小扣 2 Credits。
- resource token 过期或验签失败时返回请求非法错误。
- 禁止接受 `payload + md5(payload)` 这类无 secret 签名方案。
- resource token 只能交给材料预授权入口；服务端下载执行节点已移除。
- download-pre-v2 返回扣费后的 `credits_balance`。

## 5. 6 小时免扣窗口与扣费流程(`charge_download`)

### 5.1 并发边界

- `charge_download()` 不再创建自己的 Redis 资源锁,避免扣费服务因为内部锁故障不可用。
- 并发双击由 download-pre-v2 的用户短锁处理;同一登录用户同一时刻最多一个下载授权请求进入签发和扣费。
- 扣费服务只负责 DB 内的 6 小时窗口判断、条件扣减和下载记录写入。

### 5.2 免扣窗口判断

- 用 `user_id + resource_key` 定位历史下载记录,再用 `created_at >= now - 6h` 判断是否命中免扣窗口。
- 命中(6 小时内已有下载记录)时写新下载记录,`cost=0`,不扣余额,`free_reason` 标注命中免扣。
- 未命中时按阶梯计算本次消耗。

### 5.3 条件 UPDATE 扣减

```sql
UPDATE user_credit_accounts
   SET balance = balance - :cost, updated_at = :now
 WHERE user_id = :user_id AND balance >= :cost
```

- UPDATE 影响 0 行 → `allowed=False`,**不写扣费流水和下载记录**,按积分不足处理。
- UPDATE 成功后写下载记录和流水(`reason=download_cost`)。
- 数据库异常直接抛错,让用户重试。

### 5.4 旧 marker / 资源锁移除

旧的"同一用户同一资源 60 秒 marker"(原 download-pre-v2 的 `media:download_pre_charged:*` key)删除,改用下载记录表的 6 小时窗口。`charge_download()` 内部的 `credit:download:lock:*` 资源锁也删除,避免重复加锁放大 Redis 故障影响。

浏览器消费已预授权的 material，不在消费阶段扣 Credits。

## 6. 用户信息与余额查询

修改:

```text
backend/src/app/api/client/auth_client.py
backend/src/app/schemas/client_user_schema.py
```

`GET /api/client/auth/me` 返回:

```json
{ "user_id": 1, "email": "user@example.com", "credits_balance": 8 }
```

规则:

- `UserInfo` 新增 `credits_balance: int`,默认 0。
- `/api/client/auth/me` 查询 `user_credit_service.get_balance(ctx.user_id)` 写入 `credits_balance`。
- 登录、注册等返回 `UserInfo` 的接口也带 `credits_balance`;注册赠送失败时返回 0,用户后续刷新 me 可见修复后的余额。
- `/api/client/subscription/status` 不返回 `credits_balance`,前端不再通过订阅接口读取 Credits 余额。

## 7. extension 端边界(保留每日次数,不并入本域)

extension 下载的每日次数口径由计数器系统提供(`@../005.计数器系统/feat.md`),本域**只**描述与 Credits 的边界切割:

- extension `/api/client/quota/check` 继续只接收 `count`,继续按 `QuotaTypeEnum.EXTENSION_DOWNLOAD` 扣每日次数。
- extension 下载**不扣 Credits、不写 `user_credit_logs`、不写 `user_download_records`**。
- `QuotaTypeEnum.EXTENSION_DOWNLOAD` 的每日上限由计数器系统读取订阅配置:Free=3 次/天,Unlimited=-1 不限;作用域首次下载当天不限次(首日免费,见 `@../005.计数器系统/tech-计数数据与重置.md`)。
- `/api/client/quota/check` 扣除与 `extension_download` 展示共用当前订阅上限。
- 匿名 `device_id` 下载规则不改。
- `/api/client/subscription/status` 不返回 website 下载或播放额度字段(`web_download` / `web_play` / `daily_play_limit` / `play_used` / `play_remaining`);`extension_download` 字段继续表示 extension 每日次数,旧下载标量字段只镜像 extension 额度。
- `/api/client/subscription/checkout-configs` 不返回 website 下载或播放额度配置字段。

## 8. 旧 quota 清理与播放入口屏蔽

### 8.1 删除 website 旧下载 quota 扣费

扫描并删除/停用:

```bash
rg -n "QuotaTypeEnum\.WEB_DOWNLOAD|quota_service\.set" backend/src/app backend/tests
```

要求:

- website 下载扣费不再命中旧 quota(`quota_service.set(... WEB_DOWNLOAD ...)`)。
- extension 下载继续命中 `QuotaTypeEnum.EXTENSION_DOWNLOAD`,上限由订阅配置提供。
- 播放 API 只保留屏蔽端点契约,后端播放流/session/token 旧 service 删除,不创建 session,不扣 `WEB_PLAY`。

### 8.2 播放 API 屏蔽

改造 `backend/src/app/api/client/media_v2_client.py` 的播放相关入口:

- 创建播放会话入口直接返回功能不可用错误。
- 不调用 `quota_service.set(... WEB_PLAY ...)`。
- 不创建播放 session。
- Range 播放流入口直接返回播放不可用。

> website 前端弹窗组件与 UI 层清理细节见 `@tech-前端与清理.md`,不在本文件范围。

## 9. 错误码

修改 `backend/src/app/i18n/common_code.py` 与 `backend/src/app/i18n/locales/*.json`:

```text
CREDIT_INSUFFICIENT   = 10201
CREDIT_INVALID_REQUEST = 10202
```

可以复用原 quota 数字,前端只依赖 code,不保留 quota 命名。抛错时必须附详细 msg,能定位到 `user_id` / `resource_key`。

## 10. 验收

- 三个 model 被 `Base.metadata` 收集;`sync_database_schema.py` 能识别三张表。
- 新注册用户拿到 10 Credits;注册赠送失败不影响注册成功。
- 存量补发 SQL 重复执行不重复加余额;覆盖所有没有初始化积分流水的未注销用户。
- website 单资源下载按体积扣 Credits;阶梯边界 `49/50/299/300/799/800/4299/4300 MiB` 命中预期档位。
- `parse-v2` 返回的每个可下载资源都有 `resource_token`;`RESOURCE_TOKEN_SECRET` 缺失或生产默认值时启动失败或签发/验签返回配置错误。
- download-pre-v2 只使用 resource token claims 中的 `size` 计费;篡改 token payload 中的 `size` 验签失败。
- resource token `size=null` 时按未知大小扣 2 Credits;只提交 `payload + md5(payload)` 不能通过。
- material 只能由预授权入口在验签和扣费后返回，浏览器不提交旧下载 token。
- 6 小时内同一用户同一下载产物重复下载不扣积分;direct 与 client_mux 不同下载模式不互相免扣。
- download-pre-v2 用户短锁覆盖 token 签发和扣费;双击并发不会重复调用 `charge_download()`。
- 缺积分账户或余额不足时条件 UPDATE 影响 0 行,下载失败且不写扣费流水;下载执行入口不重复扣积分。
- 旧每日下载 quota 不再拦截 website 下载。
- extension `/api/client/quota/check` 继续只接收 `count`,不扣 Credits、不写积分流水、不写下载记录;每日上限由订阅配置提供。
- `/api/client/auth/me` 返回 `credits_balance`;`/api/client/subscription/status` 不返回 `credits_balance`。
- 订阅状态与订阅方案列表不返回 website 下载或播放额度字段;播放入口返回不可用,不创建 session,不扣 `WEB_PLAY`。
- 索引符合 `../../references/specs/spec-index.md`。

## 11. 回滚

- 停止调用 `user_credit_service.add_balance()` 发注册 Credits;三张新表保留,不影响旧业务。
- 恢复 website 下载入口调用 `quota_service.set(... WEB_DOWNLOAD ...)`。
