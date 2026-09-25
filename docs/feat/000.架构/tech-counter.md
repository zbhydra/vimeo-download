# 000 · MySQL 用户 Counter 基础设施

## 1. 目标与边界

建立一套跨业务复用的用户 Counter 基础设施：计数永久保存在 MySQL，固定 `counter_id` 在生产代码注册为自然日、自然月或永久累计周期。

本模块只回答“某个用户、某个 Counter 在当前周期累计多少”，不负责额度上限、订阅、下载、积分、匿名设备或业务事务。

现行 extension 每日下载额度继续由 `quota_service` 与 Redis 日期 key 提供，见 `@../005.计数器系统/tech-计数数据与重置.md`。订阅好评赠送使用永久 Counter 记录账号领取次数，但活动资格、锁和订阅加时仍归订阅系统，不进入 Counter 基础设施。

## 2. 方案

唯一采用“三张周期表 + 生产代码注册表 + MySQL 原子 upsert”。

不采用：

- Redis 永久计数：Redis 数据会受淘汰、重启和运维清理影响，不能作为永久事实。
- 单表可空周期列：三种周期需要不同唯一键，可空字段会增加唯一性与查询语义复杂度。
- 只建立 lifetime 表：不能形成统一的周期 Counter 基础设施。
- 流水、锁、幂等、补偿或重试：本项目允许局部失败并由调用方重试，不建设金融级记账系统。
- 把 Counter 纳入调用方事务：会扩大事务边界并迫使调用方传递 session。

## 3. 固定注册表

### 3.1 周期与定义

生产代码定义：

```text
CounterCycle: DAILY=1, MONTHLY=2, LIFETIME=3
CounterDefinition: counter_id + cycle
```

模块级静态注册表按 `counter_id` 反查固定周期。未知 ID 直接抛出 `KeyError`；周期不从请求、数据库行或业务配置读取。

### 3.2 生产 Demo ID

生产注册表永久保留以下可调用示例：

| 名称 | counter_id | 周期 | 用途 |
| --- | ---: | --- | --- |
| `DEMO_DAILY` | `9001` | `DAILY` | 自然日 Counter 接入示例与真实测试 |
| `DEMO_MONTHLY` | `9002` | `MONTHLY` | 自然月 Counter 接入示例与真实测试 |
| `DEMO_LIFETIME` | `9003` | `LIFETIME` | 永久累计 Counter 接入示例与真实测试 |

这些 ID 是生产合同，不是测试期间动态注册的夹具，不得删除、改周期或复用。未来业务 ID 进入同一注册表，但不得占用 `9001` 至 `9003`。

### 3.3 计划业务 ID

| 名称 | counter_id | 周期 | 用途 |
| --- | ---: | --- | --- |
| `SUBSCRIPTION_REVIEW_REWARD_CLAIMED` | `6001` | `LIFETIME` | **已退役**:保留注册,不再读写 |

`6001` 已注册但已退役:好评赠送的领取事实改由 `user_review_reward` 事实表按账号/设备/三方身份三维度表达,不再写 Counter。历史领取行由一次性迁移脚本从 `counter_user_lifetime` 只读回填,迁移只插入、不删原行。生产 Counter ID 是合同,不得删除或复用,注册表内保留并标注退役。活动开关、领取事实表、并发控制与订阅加时规则见 `@../006.订阅系统/tech-好评赠送订阅.md`。

## 4. MySQL 数据模型

### 4.1 `counter_user_daily`

| 字段 | 类型 | 约束 | 语义 |
| --- | --- | --- | --- |
| `id` | `BIGINT` | PK, AUTO_INCREMENT | 记录 ID |
| `user_id` | `BIGINT` | NOT NULL | 用户 ID |
| `counter_id` | `INT` | NOT NULL | 固定 Counter ID |
| `ymd` | `INT` | NOT NULL | 业务时区自然日，`YYYYMMDD` |
| `value` | `BIGINT` | NOT NULL, default 0 | 当前自然日累计值 |
| `created_at` | `BIGINT` | NOT NULL | 创建时间，毫秒时间戳 |
| `updated_at` | `BIGINT` | NOT NULL | 更新时间，毫秒时间戳 |

唯一键：`uk_counter_user_daily_user_id_ymd_counter_id(user_id, ymd, counter_id)`。

### 4.2 `counter_user_monthly`

字段与 daily 相同，使用 `ym INT` 表示业务时区自然月 `YYYYMM`。

唯一键：`uk_counter_user_monthly_user_id_ym_counter_id(user_id, ym, counter_id)`。

### 4.3 `counter_user_lifetime`

不含周期列，其余字段与 daily 相同。

唯一键：`uk_counter_user_lifetime_user_id_counter_id(user_id, counter_id)`。

### 4.4 共同行为

- 三张表永久保留历史数据，不提供自动清理任务。
- 不增加用户外键或级联删除；Counter 基础设施不接管用户生命周期。
- 三个 Model 必须导入 `app.models` 并加入 `__all__`，由 `Base.metadata` 和 schema sync 发现。

## 5. Service 合同

`CounterService` 是直接引用三张 Model 的具体类，模块底部暴露 `counter_service = CounterService()`，不使用构造器依赖注入或 `@singleton`。

公开接口：

```text
add(user_id: int, counter_id: int, number: int) -> None
get(user_id: int, counter_id: int) -> int
get_list(user_id: int, counter_ids: list[int]) -> dict[int, int]
```

语义：

- `add` 信任内部调用的 `int` 类型合同，只额外拒绝 `number <= 0`；错误包含 `user_id / counter_id / number`，且不进入数据库。不为 Python `bool` 等违反类型注解的内部调用增加运行时类型防御。
- `add` 按注册周期只写一张表，使用单条 MySQL upsert 后 commit，不为返回新值追加查询。
- `get` 复用 `get_list`，读取当前业务时区桶；不存在返回 `0`。
- `get_list` 先校验全部 ID，再按周期分组，最多查询三张表；返回结果包含全部输入 ID，未命中补 `0`。
- 每个公开方法自行获取 session；签名不出现 `db`、`session` 或调用方事务。
- 数据库、注册表和参数错误直接向上抛，不 catch、不降级、不重试。
- 这是 spec-mysql §4 登记的跨三表原子数据结构例外；不提供会破坏只增合同的任意 CRUD。
- 不提供减计数、reset、delete、任意客户端 HTTP API 或匿名设备合并。

### 5.1 原子累加

以 monthly 为例：首次写入创建当前 `user_id + ym + counter_id` 行；命中唯一键时在数据库内执行 `value = value + 本次增量` 并刷新 `updated_at`。

每次 `add` 只有一条 upsert 和一次 commit。唯一键冲突分支由 MySQL 原子累加，成功写入不会因并发读改写而丢失增量。

## 6. 周期与业务时区

- daily：`America/New_York` 当前自然日 `YYYYMMDD`。
- monthly：`America/New_York` 当前自然月 `YYYYMM`。
- lifetime：无周期字段，不重置。

在现有 `app.utils.time` 增加 `get_current_ymd() -> int` 与 `get_current_ym() -> int`，都从 `timestamp_now_datetime()` 派生，不建立第二套时区来源。

## 7. 索引审查

### 7.1 新表初始清单

- daily：PK `(id)`；UK `(user_id, ymd, counter_id)`。
- monthly：PK `(id)`；UK `(user_id, ym, counter_id)`。
- lifetime：PK `(id)`；UK `(user_id, counter_id)`。

新表不存在其他历史索引。

### 7.2 实际查询

`counter_service.get_list` 当前只产生以下三种读取条件；`get` 复用 `get_list`，`add` 依赖同一组 UK 完成 upsert 冲突检测：

| 周期 | 实际 WHERE | 当前源码位置 |
| --- | --- | --- |
| daily | `user_id = ? AND ymd = ? AND counter_id IN (...)` | `backend/src/app/services/counter_service.py:108-112` |
| monthly | `user_id = ? AND ym = ? AND counter_id IN (...)` | `backend/src/app/services/counter_service.py:123-127` |
| lifetime | `user_id = ? AND counter_id IN (...)` | `backend/src/app/services/counter_service.py:138-141` |

索引三件套审查完成：§7.1 已列出三张新表的完整 PK/UK 清单；上述真实 WHERE 均被对应 UK 的完整列序覆盖；daily、monthly、lifetime Model 的 UK 行尾分别在 `counter_user_daily_model.py:20`、`counter_user_monthly_model.py:20`、`counter_user_lifetime_model.py:19` 注明服务 `counter_service.add/get_list`。三条 UK 同时承担 upsert 冲突检测，不增加 `user_id`、周期或 `counter_id` 单列索引。

## 8. 旧 Redis Counter 清理

实施前，通用 Redis `CounterService` 只由 `/api/client/counter/**` 路由静态引用；Extension 的 `counterApi` 也只有 wrapper、endpoint 和公共导出，没有业务调用。

本次实施已删除：

- 旧 Redis Counter 的类型、TTL 配置、increment/get/get-all、匿名合并与 reset。
- `/api/client/counter/increment|get|get-all` 路由及 Backend route 注册。
- Extension `core/api/counter/`、三个 Counter endpoint 常量以及公共导出。

`quota_service`、`/api/client/quota/check`、`/api/client/subscription/status` 及 Extension 对应调用仍保持不变：下载链路继续使用 quota API，额度展示继续使用 subscription API。

## 9. 文件责任

```text
backend/src/app/constants/counter.py
backend/src/app/models/counter_user_daily_model.py
backend/src/app/models/counter_user_monthly_model.py
backend/src/app/models/counter_user_lifetime_model.py
backend/src/app/models/__init__.py
backend/src/app/services/counter_service.py
backend/src/app/utils/time.py
backend/src/app/main.py
extension/src/core/api/config.ts
extension/src/core/api/index.ts
extension/src/core/api/counter/              # 删除
backend/src/app/api/client/counter_client.py  # 删除
```

## 10. 测试与验收

- 真实 MySQL 测试直接使用三个生产 Demo ID，不动态修改注册表、不 mock 数据库。
- 覆盖不存在返回 `0`、三周期各连续 add 两次、`get` 与混合周期 `get_list`。
- 覆盖 `number=0` 与负数在写库前失败，既有值保持不变。
- 覆盖未知 ID、空 `counter_ids`、重复 ID；`get_list` 不设置人为数量上限。
- 覆盖同一用户、同一桶和同一 Counter ID 的并发正增量，最终总和必须精确且只有一行。
- 覆盖同一用户、同一桶、同一 Counter ID 只有一行且累计值正确。
- schema sync 创建三张表；通过 `information_schema` 核对字段、comment、PK 与 UK，不存在额外索引。
- 检索确认旧 Counter API、路由、Extension wrapper 与导出全部消失，quota/subscription 调用仍存在。
- Black、Ruff、`compileall`、Counter 相关文件限定范围 mypy、后端 Counter real 测试、Extension 类型检查与构建通过；Backend business 角色启动无异常。全量 `mypy src/app` 被既有 `core/config_schema.py` 27 个错误阻断，不记为通过。

## 11. 失败语义

- 单次 MySQL 读写失败：本次调用报错，由未来调用方决定是否重试。
- upsert 已 commit 但上层失败：重试可能重复累计，接受。
- 业务成功但 Counter 调用失败：可能少记，接受。
- Counter 成功但业务失败：可能多记，接受；好评赠送订阅明确采用该口径。
- 不为这些允许的偏差增加锁、幂等、补偿、对账或跨模块事务。
