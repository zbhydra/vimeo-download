# 009 · 签到活动后端(活动规则 + Credits 发放 + 接口)

> 技术实现文档。覆盖:签到活动的后端数据模型、活动规则、Credits 发放接线、两个 POST 接口、时区与日切、并发与幂等。
>
> 来源:原 `feat.052 website签到活动与首页账户入口`(后端部分)+ `feat.052.001 签到后端与Credits发放`。
>
> **现状**:网站入口已于 2026-10-05 下线,网站不再调用;后端链路(接口、服务、数据、配置)保留,留待「积分 / 签到下线」任务处理(见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §8)。本文只保留后端合同。
>
> 关联:
> - 本域产品:`@feat.md`
> - 落地页/Sitemap/llms/导航:`@tech-落地页与Sitemap.md` `@tech-LLMs与增长入口.md`
> - Credits 余额账户/流水/扣费底座:`@../003.积分系统/tech-数据模型与扣费.md`
> - 后端通用规范(api 层 Depends/事务在 service 层/抛错带 msg):`@../../../AGENTS.md` `@../../references/specs/spec-code.md` `@../000.架构/tech-backend.md`

## 1. 数据模型

新增两张表(backend SQLAlchemy async 模型):

```
backend/src/app/models/user_checkin_campaign_model.py   # user_checkin_campaigns 签到活动
backend/src/app/models/user_checkin_record_model.py     # user_checkin_records  签到审计(不参与领取判断)
```

### 1.1 user_checkin_campaigns

记录用户的一轮签到活动;使用自增 ID,为后续新增活动轮次保留空间。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | BigInt PK | 自增 | 签到活动 ID |
| `user_id` | BigInt | 无 | 用户 ID |
| `start_at` | BigInt | 无 | 活动开始时间,毫秒时间戳,后端默认业务时区当天 `00:00` |
| `end_at` | BigInt | 无 | 活动结束时间,毫秒时间戳,后端默认业务时区结束日 `23:59:59.999` |
| `last_claim_at` | BigInt | `0` | 最近一次签到领取发生时间,毫秒时间戳 |
| `total_claim_days` | Int | `0` | 成功签到天数,仅用于展示/统计 |
| `created_at` | BigInt | `timestamp_now` | 创建时间 |
| `updated_at` | BigInt | `timestamp_now` | 更新时间 |

索引(遵循 `@../../references/specs/spec-index.md`,只加真实查询需要的):

| 索引 | 服务查询 |
| --- | --- |
| 主键 `id` | CAS 更新指定活动 |
| `idx_user_checkin_campaign_user_id(user_id)` | 按用户读取当前活动 |

不要新增 `start_at`、`end_at` 单列索引(低基数/查询不用)。

### 1.2 user_checkin_records

记录签到领取审计,**不参与领取状态判断**。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | BigInt PK | 自增 | 记录 ID |
| `user_id` | BigInt | 无 | 用户 ID |
| `claimed_at` | BigInt | 无 | 领取发生时间,毫秒时间戳 |
| `day_index` | Int | 无 | 活动第几天,范围 `1..14` |
| `reward_credits` | Int | 无 | 当天发放 Credits,6 或 3 |
| `created_at` | BigInt | `timestamp_now` | 创建时间 |

索引:

| 索引 | 服务查询 |
| --- | --- |
| 主键 `id` | 审计记录主键 |
| `idx_user_checkin_record_user_id(user_id)` | 按用户查看审计记录 |

不要新增 `day_index`、`reward_credits` 单列索引。

### 1.3 活动规则配置(config_public)

签到活动规则写入 `config_public`,key = `website_checkin_campaign`,后端用 Pydantic `BaseModel` 解析。配置缺失或解析失败时直接返回"签到配置异常",**不创建 campaign、不发 Credits**。

```json
{
  "campaign_days": 14,
  "reward_rules": [
    {"start_day": 1, "end_day": 7, "credits": 6},
    {"start_day": 8, "end_day": 14, "credits": 3}
  ]
}
```

- `campaign_days` 固定为 `14`;其他值视为配置异常。
- `reward_rules` 必须无遗漏、无重叠地覆盖第 1-14 天,每条规则的 `credits` 必须大于 `0`。
- `_reward_for_day_index` 匹配 `start_day <= day_index <= end_day` 的唯一规则并返回 `credits`;第 1-14 天不允许落到 `0 Credits`。
- `day_index > campaign_days` 后活动结束。

### 1.4 IP 注册权益风控联动

签到活动受用户系统 `registration_ip_benefit_guard` 影响。配置和 `user_ip_registers` 表归 `@../007.用户系统/tech-账号与认证.md`;本域只消费一个判断结果。

规则:

- 命中风控的新用户在注册阶段立即调用签到服务插入一条已过期活动,不等 `/checkin/entry`。
- 已过期活动使用普通 `user_checkin_campaigns` 记录表达,不新增字段。
- 插入已过期活动不做幂等、不做补偿;失败允许影响本次注册接口返回。
- `enter_checkin_campaign()` / `claim_daily_checkin()` 先读取用户最新一条 campaign;只要有 campaign 就按该记录返回状态或判定领取,不因为它已过期而创建新活动。
- 只有用户完全没有 campaign 时,才创建正常 14 天活动。
- `user_ip_registers` 被运营清理后,只影响后续新注册判断;已插入的过期 campaign 不依赖辅助表继续存在。

## 2. Service 层

新增三个 service(`backend/src/app/services/`):

```
user_checkin_campaign_service.py   # 活动 CRUD
user_checkin_record_service.py     # 审计 CRUD
user_checkin_service.py            # 编排 service(签到入口状态 + 签到领奖事务)
```

**不新增依赖注入**,直接导出进程级单例:

```python
user_checkin_campaign_service = UserCheckinCampaignService()
user_checkin_record_service = UserCheckinRecordService()
user_checkin_service = UserCheckinService()
```

### 2.1 user_checkin_campaign_service

```python
async def user_checkin_campaign_lists(...) -> list[UserCheckinCampaignModel]
async def user_checkin_campaign_info(user_id: int) -> UserCheckinCampaignModel | None
```

### 2.2 user_checkin_record_service

```python
async def user_checkin_record_lists(...) -> list[UserCheckinRecordModel]
async def user_checkin_record_info(record_id: int) -> UserCheckinRecordModel | None
```

### 2.3 user_checkin_service(编排)

`user_checkin_service.py` 只负责签到入口状态和签到领奖事务。

**公开方法**:

```python
async def enter_checkin_campaign(user_id: int) -> UserCheckinStatus
async def claim_daily_checkin(user_id: int) -> UserCheckinClaimResult
async def create_expired_campaign(user_id: int) -> UserCheckinCampaignModel
```

**辅助私有方法**:

```python
async def _load_checkin_config(self) -> CheckinCampaignConfig
def _today_ymd(self) -> str
def _build_campaign_times(...) -> tuple[int, int]
def _calculate_day_index(...) -> int
def _reward_for_day_index(...) -> int
def _is_campaign_ended(end_at: int, today_start_at: int) -> bool
async def _reserve_daily_claim(...) -> tuple[int, int]
async def _claim_campaign_once(...) -> bool
```

### 2.4 enter_checkin_campaign 规则

`enter_checkin_campaign()` 是普通用户首次创建正常签到活动的入口:

- 先读取用户最新一条 campaign;如果存在,直接返回这条记录的状态,即使已过期也不新建。
- 正常活动的有效结束时间取落库 `end_at` 与按当前 14 天规则计算所得结束时间中的较早值;错误存量数据不能扩展出第 15 个可领取日。
- 发现用户完全没有活动记录时**立刻创建正常活动**:
  - `start_at` = 后端默认业务时区(`America/New_York`)今日 `00:00` 的毫秒时间戳。
  - `end_at` = 后端默认业务时区第 `campaign_days` 天 `23:59:59.999` 的毫秒时间戳。
  - 老用户首次进入也给完整 14 天活动期(活动起点按首次触发日,不按注册日)。
- 今天、日切、下一次可领取时间统一由 `backend/src/app/utils/time.py` 计算。

**不要在登录接口、用户恢复接口或纯只读查询里自动创建签到记录**——避免把"登录恢复"和"首次进入签到系统"耦合。
例外:命中 IP 注册权益风控的新用户会在注册阶段创建已过期 campaign,用于明确关闭签到权益。

### 2.5 claim_daily_checkin 规则

按简单顺序执行:

1. 查询 `user_checkin_campaigns where user_id = :user_id`,按 `id desc` 取最新一条。
2. campaign 不存在时**补创建正常活动**(不能因为 campaign 不存在直接 500)。
3. 程序判断 `last_claim_at >= today_start_at`,已领过则返回明确错误"今天已签到"。
4. 按活动日计算 `day_index` 和奖励。
5. 使用 `id + last_claim_at < today_start_at` CAS 更新 `last_claim_at`、`total_claim_days`、`updated_at`。
6. CAS 成功后调用 `user_credit_service.add_balance()` 发奖励(独立事务)。
7. 最后尝试写 `user_checkin_records` 审计;**审计不参与领取逻辑**,写入失败不影响领取状态。

- 并发请求最多成功一次;重复请求返回"今天已签到"业务错误。
- 漏签不补。
- 活动结束后返回明确业务错误。

## 3. Credits 发放接线

依赖现有 Credits 余额/流水能力(底座见 `@../003.积分系统/tech-数据模型与扣费.md`)。**feat.052 不创建 Credits 账户表、不创建 Credits 流水表、不接入注册赠送、不做存量补发**——只保留两个明确接线点:

```python
async def _get_current_credits_balance(...) -> int    # 从 Credits 底座读最新余额
async def _grant_checkin_credits(...) -> int          # 调 Credits 底座发签到奖励,返回最新余额
```

规则:

- Credits 底座未接入时,这两个接线点必须抛 `CREDIT_UNAVAILABLE`,**不能返回假余额、不能伪造成功**。
- 签到领取权以 `user_checkin_campaigns.last_claim_at` 为准;Credits 发放失败时本次领取权已被占用,允许用户联系支持处理。
- 签到系统不关心 Credits 底座内部如何实现账户、流水、注册赠送、扣费或幂等。

### 3.1 签到流水 reason

新增 Credits 流水 reason:`checkin_reward`。

Credits 流水 metadata 最少包含:

```json
{
  "source": "website_checkin",
  "claim_date": "2026-06-18",
  "day_index": 3
}
```

### 3.2 幂等与事务

- 签到重复领取以 `user_checkin_campaigns.id + last_claim_at < today_start_at` CAS 为准。
- Credits 流水**不保存 dedupe_key**,每次发放调用只记录本次余额变化(重复支付回调由订单状态控制,不在本域)。
- 签到奖励调用 `user_credit_service.add_balance()` 用**独立事务**。
- 审计记录写入失败不影响领取状态,**不为签到链路扩大事务边界**。
- 签到系统内 Credits 余额是唯一真相源;签到状态响应**不重复保存余额**。
- `entry` 和 `claim` 都必须返回 Credits 底座给出的真实 `credits_balance`;未接入时返回明确错误。

## 4. API 设计

新增:

```
backend/src/app/api/client/checkin_client.py    # APIRouter(prefix="/checkin", tags=["签到"])
backend/src/app/schemas/checkin_schema.py
```

**只用 GET 和 POST**。

路由挂在 `/api/client` 前缀下(`backend/src/app/main.py` 约 369 行 `app_instance.include_router(checkin_router, prefix="/api/client", tags=["client"])`),完整路径:

### 4.1 POST /api/client/checkin/entry

用途:显式进入签到系统;若没有活动记录则创建,并返回完整签到入口状态。

鉴权:必须登录(`Depends(get_current_user)`)。

响应字段:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `campaign_ended` | bool | 活动是否结束 |
| `start_date` | string | 活动开始日 |
| `end_date` | string | 活动结束日 |
| `start_at` | int | 活动开始时间,毫秒时间戳 |
| `end_at` | int | 活动结束时间,毫秒时间戳 |
| `today` | string | 服务器今天日期 |
| `day_index` | int | 今天对应的活动日,响应始终限制在 `1-14`;活动结束后保持为 `14` |
| `today_reward_credits` | int | 今天若可签到可得多少 Credits;已结束时为 `0` |
| `today_claimed` | bool | 今天是否已签到 |
| `total_claim_days` | int | 已成功签到天数 |
| `credits_balance` | int | 当前 Credits 余额(真实值,不造假) |
| `next_claim_at` | string \| null | 下一次可领取时间;今天未签到且当前可领时返回 `null`,今天已签到后返回下一自然日 `00:00` 的 ISO8601 带时区偏移时间 |
| `next_claim_at_ts` | int \| null | 语义同上,毫秒时间戳 |

规则:

- 该接口是**唯一允许创建 campaign 的入口**;其他接口不应为了读取状态隐式创建 campaign。
- 未登录返回现有登录错误语义。

### 4.2 POST /api/client/checkin/claim

用途:领取今天签到奖励。

鉴权:必须登录。

请求体:空对象(`CheckinClaimRequest`,不要附加客户端传入的日期、奖励值、day_index,全部由服务端计算)。

响应字段:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `claim_date` | string | 本次签到日期 |
| `day_index` | int | 本次签到活动日 |
| `reward_credits` | int | 本次发放 Credits |
| `credits_balance` | int | 发放后最新余额 |
| `today_claimed` | bool | 固定 `true` |
| `campaign_ended` | bool | 固定 `false` |
| `next_claim_at` | string \| null | 下一次可领取时间,ISO8601 带时区偏移;第 14 天领取后为 `null` |
| `next_claim_at_ts` | int \| null | 下一次可领取时间,毫秒时间戳;第 14 天领取后为 `null` |

错误语义:

| 场景 | 行为 |
| --- | --- |
| 今天已签到 | 返回明确错误(msg 可定位) |
| 活动已结束 | 返回明确错误(msg 可定位) |
| Credits 发放失败 | 返回明确错误(msg 可定位),可重试 |

补充规则:

- 若用户未先调用 `/checkin/entry` 就直接调用 `/checkin/claim`,后端必须**自动补创建** campaign,再继续领取流程;不能因为 campaign 不存在直接 500。

## 5. 用户信息余额刷新

修改 `backend/src/app/api/client/auth_client.py` 与 `backend/src/app/schemas/client_user_schema.py`:在用户信息接口新增 `credits_balance: int` 字段。

规则:

- 登录用户通过 `/api/client/auth/me` 返回真实 Credits 余额。
- 登录、注册等返回用户信息的接口保持与 Credits 域一致,`credits_balance` 由用户信息接口承载。
- **本阶段不把签到状态或 Credits 余额塞进 `/subscription/status`**,签到单独走 `/checkin/entry`。

非目标:

- 不改造 `/subscription/status`。
- 不复用 subscription 概念承载 Credits 或签到。

## 6. 算法细节

### 6.1 活动日计算

```text
day_index = (today_date - start_date).days + 1
```

- `day_index <= 0` 理论上不出现。
- 奖励按 `config_public.website_checkin_campaign.reward_rules` 命中。
- `day_index > campaign_days` 后活动结束。
- 对外响应的 `day_index` 封顶为 `campaign_days`,不向客户端暴露第 15 天活动态。

### 6.2 结束日判断

活动在 `end_at` 前仍有效。后端默认业务时区(`America/New_York`)进入 `end_at` 后的下一自然日 `00:00` 后,活动结束。

### 6.3 下一次可领取时间

```text
今天未签到且当前可领:  next_claim_at = null          # 明确表示"现在可领取",不是缺字段
今天已签到且还有后续活动日: next_claim_at = 服务器时区 America/New_York 下"明天 00:00:00"的绝对时间
第 14 天已签到:            next_claim_at = null
```

- `entry` 和 `claim` 都返回 `next_claim_at` 与 `next_claim_at_ts`。

## 7. 时区口径

- 统一用后端服务器时区 **`America/New_York`**,按该时区本地 `00:00` 切天。
- 本功能上线口径统一使用此后端业务时区;所有按天计算逻辑都以该时区的 `00:00` 切天。
- 第 1 天到第 14 天按"活动开始后的自然日区间"判断,**不按累计签到次数判断**。

## 8. 边界和异常

| 场景 | 行为 |
| --- | --- |
| 老用户首次进入签到系统 | 创建活动记录,从当天开始算第 1 天 |
| 命中 IP 注册权益风控的新用户注册 | 注册阶段插入已过期活动,不发注册 Credits |
| 命中 IP 注册权益风控的用户首次进入签到系统 | 读取注册阶段已插入的过期活动,返回活动已结束,不发 Credits |
| 命中 IP 注册权益风控的用户直接 claim | 读取注册阶段已插入的过期活动后返回活动已结束错误 |
| 活动第 14 天签到 | 允许签到 |
| 漏掉某一天 | 直接错过,不补签 |
| 多标签页同时签到 | 后端只允许成功一次,另一请求返回今日已签到(CAS 保证) |
| Credits 发放失败 | 本次签到失败,不写签到成功记录,用户可重试 |
| 未先 entry 直接 claim | 后端自动补创建 campaign 后继续领取,不 500 |

## 9. 验收/验证命令

```bash
cd backend
uv run black --check src/app/models src/app/services src/app/api/client src/app/schemas
uv run ruff check src/app/models src/app/services src/app/api/client src/app/schemas
uv run mypy src/app/services src/app/api/client
uv run pytest tests/integration/real/services -k checkin -rs
uv run pytest tests/integration/real/api/client -k checkin -rs
uv run python src/app/init/sync_database_schema.py --dry-run
```

重点测试:

- 第 1 天、第 7 天、第 8 天、第 14 天、第 15 天边界。
- 同一天重复领取。
- 多并发重复领取(CAS 只成功一次)。
- 老用户首次进入签到系统创建。
- 多标签页首次同时进入签到系统不会 500。
- 不先 `entry` 直接 `claim` 的自动补创建路径。
- Credits 发放成功与失败。
- `next_claim_at` 在 `America/New_York` 夏令时与冬令时切换时仍指向正确的下一个本地零点。
- 更新对应 real 测试文件顶部的写入端点覆盖矩阵。

## 10. 风险与回滚

风险:

- Credits 账户/流水表或迁移如果未执行,`entry` 与 `claim` 会因无法读取真实余额或写入真实流水而失败(接线点抛 `CREDIT_UNAVAILABLE`)。
- 服务器时区如果配置错误,会直接影响签到日切。

回滚:

- 下线 `/api/client/checkin/*` 路由入口。
- 保留签到历史表,不影响其他业务。
