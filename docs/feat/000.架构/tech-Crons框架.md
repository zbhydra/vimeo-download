# 000 · 架构 · 后端 Crons 框架细节

> 对应 `feat.043.后端Crons定时任务框架`。本文件补 `@tech-backend.md` §6 没写全的细节:`CronTaskSpec` 字段与校验、领取/释放语义、`cron_task_cursor` 表结构、超时常量、daily 时区口径。框架骨架(目录 / lifespan 启停 / business 专属)见 `@tech-backend.md` §6,本文不重复。
> business 角色专属,download 角色不启 cron。规则条文见根 `@../../../AGENTS.md` 与 `@../../references/specs/spec-python.md`。**本文以代码为准,feat.043 文档过时处注明。**

## 1. 注册表与任务清单(`registry.py`)

`CRON_TASKS: list[CronTaskSpec]` 是进程启动时注册到调度器的**唯一任务列表**。当前注册:

| task_key | kind | 间隔 | 任务函数 | 实现 |
| --- | --- | --- | --- | --- |
| `maintenance.cron_health_log` | `interval` | 3600s(每小时) | `log_cron_health` | `crons/task/maintenance.py` |

> `maintenance.cron_health_log` 命名动机:`maintenance` 前缀 + `health_log` 只为证明 **cron 框架本身仍在领取/执行/释放游标**,不承载任何业务链路健康判断。任务体只输出一条结构化日志,不写业务 DB、不访问外部网络,避免被误解为业务健康检查。
| `order_fulfillment.compensate_paid_pending_subscription_orders` | `interval` | 60s(每分钟) | `compensate_paid_pending_subscription_orders` | `crons/task/order_fulfillment.py` |

> 与 feat.043 文档差异:feat.043 §4.1 说第一阶段只内置 `maintenance.cron_health_log` 一个任务。**代码已追加**了订单补偿任务(`order_fulfillment.py`),以代码为准。

新增任务:在 `crons/task/` 加无参 async 函数 → 在 `registry.py` 追加 `CronTaskSpec`。**任务注册随代码发布,不支持动态在线新增**。

## 2. `CronTaskSpec` 字段与校验(`schedule.py`)

```python
class CronTaskSpec:
    task_key: str          # 全局唯一,格式 domain.action,进 DB 主键和日志
    task: Callable[[], Awaitable[None]]  # 无参 async
    kind: Literal["interval", "daily"]
    interval_seconds: int | None = None  # interval 必填
    daily_time: str | None = None         # daily 必填,格式 HH:mm:ss
```

构造时校验(`__post_init__`):
- `task_key` 长度 1–100,正则 `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`(domain.action 形态)。
- `kind="interval"` 时 `interval_seconds` 必填且不得带 `daily_time`。
- `kind="daily"` 时 `daily_time` 必填,`_parse_daily_time()` 校验时分秒。
- `task_key` 重复在调度器初始化时 fail-fast 并指出冲突 key。

`daily_time_parts` 属性返回 `(hour, minute, second)`。

## 3. `cron_task_cursor` 表(`cron_task_cursor_model.py`)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `task_key` | `varchar(100)` PK | 任务唯一键 |
| `last_claimed_trigger_at` | `bigint` | 最近一次领取的触发点(Unix 秒) |
| `is_running` | `bool` | 是否有 worker 正在执行 |
| `running_at` | `bigint` | 本次占用开始时间(Unix 秒),作占用身份 |

**不加额外索引**:`task_key` 主键覆盖单任务领取/释放;超时释放按 `is_running`/`running_at` 扫整张 cron 小表(任务数预期个位数到低两位数,全表扫可接受)。`is_running` 是低基数字段,按 `@../../references/specs/spec-index.md` 不加单列索引。

## 4. 领取 / 释放 / 超时释放语义(`cron_task_cursor_service.py`)

实现走 SQLAlchemy ORM(条件 `UPDATE`),语义等价于:

**领取**(同一触发点只允许一个进程):
```sql
UPDATE cron_task_cursor
SET last_claimed_trigger_at = :trigger_at, is_running = 1, running_at = :running_at
WHERE task_key = :task_key AND is_running = 0 AND last_claimed_trigger_at < :trigger_at
```

**释放**(本次结束时,按 `running_at` 身份释放,防旧 worker 释放新占用):
```sql
UPDATE cron_task_cursor SET is_running = 0, running_at = 0
WHERE task_key = :task_key AND is_running = 1 AND running_at = :running_at
```

**超时释放**(每轮扫描先释放过期占用):
```sql
UPDATE cron_task_cursor SET is_running = 0, running_at = 0
WHERE is_running = 1 AND running_at <= :now_minus_timeout
```

`running_at` 是本次占用的**身份标识**,防止旧 wrapper 误释放新 worker 的占用。

## 5. 超时与关闭常量(`schedule.py`)

| 常量 | 默认 | 说明 |
| --- | --- | --- |
| `CRON_CHECK_INTERVAL_SECONDS` | 30 | 扫描周期 |
| `CRON_TASK_TIMEOUT_SECONDS` | 300 | 单任务最长执行时间 |
| `CRON_SCAN_SHUTDOWN_GRACE_SECONDS` | 5 | shutdown 等待扫描任务退出 |
| `CRON_TASK_SHUTDOWN_GRACE_SECONDS` | 30 | shutdown 等待执行 wrapper 结束 |
| `CRON_TASK_CANCEL_GRACE_SECONDS` | 5 | cancel 后等待收尾 |

执行器(`executor.execute_claimed_task`)用 `asyncio.wait_for(asyncio.shield(business_task), timeout)`;超时/取消后异步消费残留 task 并释放游标。**shutdown 顺序**:`cron_scheduler.stop()` 先于 `close_engine()`(避免 DB 先关导致释放失败)。

## 6. 时区口径(以代码为准)

> **feat.043 文档 §4.4 过时**:feat.043 写「默认用部署服务器 IANA 时区,通过 `TZ` 解析,回退 UTC」。

**代码现状**(`backend/src/app/utils/time.py`):
- `DEFAULT_SYSTEM_TIMEZONE_NAME = "America/New_York"`(**硬编码**,不读 `TZ` / `/etc/timezone`)。
- `system_timezone()` 返回 `ZoneInfo("America/New_York")`。
- 所有 `timestamp_now()` / `timestamp_now_seconds()` / `datetime_to_timestamp()` / `timestamp_to_datetime()` / `get_today_date()` 都基于 NY 时区。

**因此 cron 的 daily 任务按 `America/New_York` 本地日历日计算触发点**,不是服务器系统时区。这与全仓业务时区口径一致(见 `@tech-数据库.md` §2)。如需切换业务时区,改 `DEFAULT_SYSTEM_TIMEZONE_NAME` 并审全部按天逻辑。

> daily 锚点计算(`scheduler._build_daily_anchor_timestamp` / `_resolve_daily_due_trigger_at`)仍按「服务器本地日历日最近 `daily_time` 锚点」推进(非固定 24×60×60 秒),避免夏令时漂移——只是「服务器本地」实际固定为 NY。

**daily 到期判定流程**(`scheduler.py:282 _resolve_daily_due_trigger_at`,以代码为准):

1. `now_sec` 经 `system_timezone()` 转成本地 `local_now`,取 `local_now.date()` 得到今日本地日期。
2. 用今日日期 + `daily_time` 构造 `today_anchor`(`_build_daily_anchor_timestamp`)。
3. 若 `today_anchor <= now_sec`:候选触发点 `candidate = today_anchor`(今天的锚点已到)。
4. 否则:`candidate` 取**昨日** `daily_time` 锚点(`local_now.date() - timedelta(days=1)`)。
5. `candidate > last_claimed_trigger_at` 才领取;否则不到期返回 `None`。

该流程在 IANA 时区下保证每天本地 `HH:mm:ss` 触发,夏令时切换日不靠固定 86400 秒推进,从而不产生漂移。游标缺失时初始化锚到昨日 `daily_time`(`_build_initial_cursors` → `_build_daily_anchor_timestamp`)。

## 7. 任务编写约束

- 无参 async 函数;内部自调 service,**不新增依赖注入**(根 `@../../../AGENTS.md` §3 红线 4)。
- 必须幂等,重复执行不破坏数据。
- 批量任务**禁止 SELECT 全量加载后逐行处理**,必须按 SQL 条件更新或分页(`@../../references/specs/spec-mysql.md`)。
- 外部出口失败只影响当前任务,不能让扫描循环退出。
- 任务异常由 executor 捕获并记录日志。
- 任务需要事务时,事务放 service 层。

## 8. 与源文档差异

| feat.043 文档 | 代码现状 | 处理 |
| --- | --- | --- |
| §4.1 只内置 `maintenance.cron_health_log` | 已追加 `order_fulfillment.compensate_paid_pending_subscription_orders`(每分钟) | 以代码为准(见 §1) |
| §4.4 时区用服务器 IANA(`TZ`),回退 UTC | `time.py` 硬编码 `America/New_York` | 以代码为准,标注 feat.043 过时(见 §6) |
| §3 CAS 参考结构 | 已落地同构结构 `backend/src/app/crons/` | 一致 |
| §4.3 领取/释放裸 SQL | 实现为 SQLAlchemy ORM 条件 UPDATE,语义等价 | 一致 |
