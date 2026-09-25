# 000 · 架构 · 数据库地基

> 后端 MySQL 数据库的现状事实：引擎、时区、表/字段约定、结构同步机制、索引规则概要。规则条文见 `@../../references/specs/spec-mysql.md` 与 `../../references/specs/spec-index.md`，本文只提炼代码现状。

## 1. 引擎与会话

- **唯一数据库引擎：MySQL**，驱动 `mysql+aiomysql`（`backend/src/app/core/database.py`）。无 SQLite、无 Postgres、无其他。
- **异步为主**：`create_async_engine` + `async_sessionmaker` + 连接池，引擎/会话工厂全局单例（`_engine` / `_session_factory` 模块级变量，懒加载）。
- **ORM 基类**：`Base = declarative_base()`（`core/database.py`）；业务模型统一继承 `BaseDBModel(Base)`（`models/base.py`，`__abstract__ = True`，带 `to_dict()`）。`Base.metadata` 是结构同步对比的唯一真相源。
- **会话获取**：service 用 `async with get_async_session() as db:` 获取；api 层用完参数判断不直接碰事务（事务在 service 层，见 `@../../references/specs/spec-mysql.md` §3）。

## 2. 时区

> 业务时间工具 `backend/src/app/utils/time.py` 把默认业务时区**有意硬编码为 `America/New_York`**，不读服务器系统时区（根 `AGENTS.md` §4 已记录此口径，这是有意为之）。

事实：
- `DEFAULT_SYSTEM_TIMEZONE_NAME = "America/New_York"`
- `system_timezone()` 返回 `ZoneInfo("America/New_York")`
- 所有 `timestamp_now()` / `timestamp_to_datetime()` / `datetime_to_timestamp()` 都按这个时区解释。naive datetime 一律按此时区看待。
- **按天 0 点**：`DAY_START_TIME = time.min`、`DAY_END_TIME = time(23,59,59,999000)`；所有计算「天数」的逻辑以 New_York 当地 0 点为日界。
- admin 看板等需要 +8 的场景，应在对应模块**显式**处理，不改公共工具默认语义（`time.py` 顶部注释明确）。

切换业务时区需改 `DEFAULT_SYSTEM_TIMEZONE_NAME` 并审全部按天逻辑；当前固定 New_York。

## 3. 表 / 字段命名与模型组织

模型目录：`backend/src/app/models/`，一域一文件：

```
backend/src/app/models/
├── base.py                       # BaseDBModel 抽象基类
├── user_model.py                 # 用户
├── user_credit_account_model.py  # 积分账户
├── user_credit_log_model.py      # 积分流水
├── user_download_record_model.py # 下载记录
├── user_checkin_record_model.py  # 签到记录
├── user_checkin_campaign_model.py# 签到活动
├── counter_user_daily_model.py    # 用户自然日 Counter
├── counter_user_monthly_model.py  # 用户自然月 Counter
├── counter_user_lifetime_model.py # 用户永久 Counter
├── order_model.py                # 订单
├── subscription_model.py         # 订阅
├── service_node_model.py         # 服务节点
├── admin_model.py                # 管理员
├── config_public_model.py        # 公共配置
├── config_credit_product_model.py + _price_model.py        # 积分商品 + 价格档
├── config_subscription_product_model.py + _price_model.py  # 订阅商品 + 价格档
├── config_payment_channel_model.py # 支付渠道配置
├── cron_task_cursor_model.py     # cron 游标（调度器用）
├── mark_log_model.py             # 前端 mark-log
├── callback_log_model.py         # 回调日志
```

约定（代码现状）：
- 文件名 `<域>_model.py`，类名 `<域>Model`（如 `UserModel`、`OrderModel`）。
- 时间戳字段多用 `int`（毫秒级 Unix 时间戳，按业务时区），见 `utils/time.py` 的 `Timestamp = int`。
- 每个 model 文件顶部有该文件用途注释，字段有注释（符合 `@../../references/specs/spec-code.md`）。

## 4. 结构同步机制：`sync_database_schema.py`

> 不维护版本化迁移脚本、版本号或 downgrade。表结构只用自研的 **models-as-truth + diff-sync** 脚本同步。

脚本：`backend/src/app/init/sync_database_schema.py`（click CLI）。

工作方式：
1. 把所有 `models/*.py` 注册进 `Base.metadata`（`model_tables = Base.metadata.tables`）。
2. 用 SQLAlchemy `inspect()` 获取表名和索引，用 `INFORMATION_SCHEMA.COLUMNS` 获取列定义及排序规则。
3. `SchemaComparator.compare()` 产出 `TableDiff`：
   - `missing_tables`：模型有、库无
   - `column_diffs`：`missing` / `type_mismatch` / `collation_mismatch` / `nullable_mismatch` / `comment_mismatch` / `removed`；类型与排序规则分别比较，仅校验模型显式指定的排序规则。
   - `index_diffs`：`missing` / `columns_mismatch`
4. `sync(diff, dry_run=False)` 按差异生成并执行 DDL（CREATE TABLE / ADD COLUMN / 修改类型 / 建索引）。
5. CLI：`--yes` / `-y` 跳过确认，默认会交互确认。

入口约定（根 `@../../../AGENTS.md` §5 要求）：**修改完 models 后，执行 `backend/src/app/init/sync_database_schema.py`** 把结构同步到库。

辅助产物（同目录）：
- `init_db.py`：初始化入口
- `export_database_schema.py`：把当前库结构导出为 SQL
- `export_config_tables.py`：把 `config_*` 配置表结构与数据导出为 SQL 快照（`--output` 必填，不写 `config_init.sql`）
- `database_schema_<时间戳>.sql`：由 `export_database_schema.py` 运行期导出的结构快照，不作为仓库文件维护
- `sql_executor.py`：SQL 执行工具
- `sql/config_init.sql`：手写维护的首次部署配置数据（只含 `INSERT IGNORE`，表结构由 `sync_database_schema.py` 先建好；部署脚本按 sync → import 顺序执行）

`export_config_tables.py` 仅用于人工导出配置表快照：
- 输出 SQL 使用 `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`，不会覆盖目标库已有配置。
- 默认拒绝导出 `config_payment_channel.config_json` 里包含 `token`、`client_secret`、`webhook_secret_token` 等敏感字段的行；只有明确生成私有产物且不提交仓库时才允许加 `--include-sensitive`。
- 配置表是开发/部署真实配置，只能由该人工导出工具读取并生成产物；业务代码和测试仍禁止写入或清理 `config_*` 表。

下载角色（`app.role=download`）**不跑结构同步、不连业务库**（见 `docs/ops/` 下的发布单）。

## 5. 索引规则（概要）

详细硬禁令与「加索引三件套」要求见 `../../references/specs/spec-index.md`，这里只列代码现状要点：
- 索引定义在 model 类上，是 `Base.metadata` 的一部分，随 `sync_database_schema.py` 同步。
- 加/改索引必须在 PR 里贴：①本表现有 PK/UK/INDEX 清单 ②grep 出的实际查询代码位置（文件:行号 + WHERE/ORDER BY）③索引行尾 `#` 注释写明服务哪个查询。缺一拒绝。
- 联合索引最左前缀能覆盖的单列索引不加；`unique=True` 列上不加普通索引；主键不放进联合索引末尾；低基数列（status/bool/≤10 枚举）不加单列索引；`LIKE '%x%'`/`'%x'` 列不加 B-tree。
- 加联合索引时必须回审同表单列索引是否要一起删。

## 6. 批量操作约束

`@../../references/specs/spec-mysql.md`：批量修改/删除禁止先 SELECT 全量加载再逐行改，必须用 SQL 层 UPDATE/DELETE（避免 O(N) 内存）。`BaseService.get_all()`（`services/base_service.py`）是带 offset/limit 的分页查询模板，**不是**全量加载入口，批量写操作不要复用它。
