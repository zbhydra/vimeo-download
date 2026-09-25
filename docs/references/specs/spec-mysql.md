# 数据访问规范（MySQL / SQLAlchemy）

> 后端数据访问层**强制规范**。写/改 Model、service 查询、事务、结构同步前必读。
> 技术栈：SQLAlchemy 2.0 async + aiomysql，自研 `sync_database_schema.py` 同步。
> 关联：[[spec-python]] §5 时区、§9 service 层；[[spec-index]] 索引；[[spec-test-server]] 配置表禁写。

## 1. Model 声明

- 继承 `BaseDBModel`（`backend/src/app/models/base.py`，提供 `to_dict()`），设 `__tablename__`。
- 列用 2.0 的 `Mapped[...]` + `mapped_column(...)`，**每列必须 `comment=`**（生成表注释，方便运维）。
- 可选类型新代码用 `Mapped[str | None]`；存量 `Mapped[Optional[str]]` 逐步迁移（与 spec-python §3 风格统一一致）。
- **时间字段一律 `BigInteger` + `default=timestamp_now` + `comment="...（毫秒时间戳）"`**，不用 `DateTime`/`DateTime(timezone=True)`。
- 索引放 `__table_args__`，规则见 [[spec-index]]（加索引前必读三件套）。

```python
class UserModel(BaseDBModel):
    """业务用户表"""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, comment="邮箱（登录用）")
    created_at: Mapped[int] = mapped_column(BigInteger, default=timestamp_now, nullable=False, comment="创建时间（毫秒时间戳）")
```

## 2. session / engine

- engine 与 session_factory 是**全局懒加载单例**（`backend/src/app/core/database.py` 的 `get_engine()` / `get_session_factory()`）。禁止在业务代码里 `create_async_engine`。
- 业务拿 session **只用上下文管理器**，不用 `Depends`（与 FastAPI 官方教程不同，这是本项目约定）：

```python
from app.core.database import get_async_session

async with get_async_session() as db:
    result = await db.execute(stmt)
    return list(result.scalars().all())
```

- `get_async_session` 已配置：`expire_on_commit=False`（提交后对象不过期，避免异步二次查询）、`pool_pre_ping=True`、`pool_recycle=3600`。不要改这些参数。
- engine URL 用 f-string 拼，**密码不 encode**——仅信任 `config.yaml` 本地配置，不对外打印（`database.py` 里 `# print(url)` 已注释，禁止解开）。

## 3. 事务

- **事务在 service 层**，api 层不碰 commit/rollback。
- 写操作显式 `await db.commit()`；**回滚由 `get_async_session` 的 except 统一负责**（已 `await session.rollback()`）。
- **禁止在 service 方法里再包一层 `try/except: rollback; raise`**——这是冗余防御。`BaseService` 旧代码（`create/update/delete`）是历史遗留，新写的 service 方法不沿用，只管 `commit`。
- **禁止为了业务互斥写「先数据库加锁、再查判断、再更新」**：不允许把 MySQL 行锁/表锁当普通请求的并发闸门，包括 `SELECT ... FOR UPDATE`、悲观锁读、显式 `LOCK TABLES` 后再做业务判断。数据库是最宝贵的资源；普通应用优先用 Redis 短锁、原子 `UPDATE ... WHERE ...`、唯一约束，或直接返回可重试错误。宁可牺牲一点用户可用性，也不要让热路径请求长时间占用 DB 锁。

```python
# ✅ 只管 commit，异常由 get_async_session 自动回滚
async with get_async_session() as db:
    db.add(instance)
    await db.commit()
    await db.refresh(instance)
    return instance
```

- **跨 service 复用同一事务**：提供 `xxx_in_session(db, ...)` 方法（接收外部 session，不自己 commit），由持有 session 的调用方统一 commit。禁止在多个 service 各开 session 拼凑一个逻辑事务。

```python
# user_credit_service.py 的跨 service 事务约定
async with get_async_session() as db:
    await self.credit_in_session(db, user_id, amount)        # 不 commit
    await order_service.order_in_session(db, ...)            # 不 commit
    await db.commit()                                         # 调用方统一提交
```

## 4. 标准 service 方法

关联 model 的 service **必须**提供这四个基础方法，且只提供基础方法（模块边界见 spec-python §9）。

**原子数据结构例外**：MySQL 用户 Counter 按固定周期路由 daily/monthly/lifetime 三表；设备 Counter 只保存 lifetime 累计值。两者只提供 `add/get/get_list`，禁止任意 `update/del/reset`，避免绕过原子累加、破坏永久累计合同。新增例外必须先更新本规范并写明为何标准 CRUD 会破坏合同，不能只在业务代码中自行绕过。

### `xxxx_lists` —— 全能查询

- 条件与排序**支持该 model 所有数据库字段**；每个过滤字段 `Sequence[X] | None`，`None` 跳过，**数值型过滤必须是数组**。
- **直接返回 model 列表，不做 DTO / 字段裁剪**——暴露完整 model 是优点，调用方各取所需。
- 过滤条件抽 `_apply_xxx_filters` helper，供 `xxxx_lists` 与 `count_xxxx` 复用，禁止两处分别手写 where 漂移。

```python
async def order_lists(
    self, *,
    ids: Sequence[int] | None = None,
    order_statuses: Sequence[OrderStatus | int] | None = None,
    created_after_ms: int | None = None,
    offset: int = 0,
    limit: int = 20,
    order_by: OrderListOrder = "created_at_desc",
) -> list[OrderModel]:
    stmt = self._apply_order_list_filters(
        select(OrderModel), ids=ids, order_statuses=order_statuses, created_after_ms=created_after_ms,
    )
    async with get_async_session() as db:
        result = await db.execute(stmt.order_by(*self._order_clauses(order_by)).offset(offset).limit(limit))
        return list(result.scalars().all())   # 直接返回 model
```

### `xxxx_info(id)`

内部调 `xxxx_lists(ids=[id])` 取首条，禁另写查询。

### `xxxx_update(id, fields: dict)`

- 可更新任意字段。**值为 `None` 的字段跳过不更新**（区分「不更新」与「置空」——置空传空串 / 0 等非 None 值）。
- 走 SQL 层 `UPDATE`，禁先 SELECT 加载再逐字段改。

```python
# None 字段过滤掉
await db.execute(
    update(M).where(M.id == id).values(**{k: v for k, v in fields.items() if v is not None})
)
```

### `xxxx_del(ids)`

批量删除，接收 id 数组，走 SQL 层 `DELETE`。

## 5. 禁止子查询

- service 查询**禁止** `.subquery()` / 嵌套 `EXISTS` / 相关子查询。用 JOIN 或拆成多次查询在 service 内组装。
- 例外：分表跨表查询（`ShardedService.query_all_shards`）等少数场景，必须注释说明为何无法避免。

## 6. 批量操作

批量改/删**必须用 SQL 层 `UPDATE`/`DELETE`**（见 §4 `xxxx_update` / `xxxx_del`），禁止先 `SELECT` 全量加载到内存再逐行改（O(N) 内存 + N 次往返）。

```python
# ❌ 禁止：先全量加载再逐行改
orders = await self.order_lists(user_ids=user_ids, limit=10_000_000)
for o in orders:
    o.status = "closed"
    await db.commit()
```

导入/导出等确需逐行的批量任务除外，但仍须分批（`offset/limit` 循环）。

## 7. schema 同步

- **只使用 `sync_database_schema.py`，不维护版本化迁移脚本、版本号或 downgrade**。改/加 model 后手动跑自研同步脚本：

```bash
uv run python -m app.init.sync_database_schema --yes
# 或 cd backend && python src/app/init/sync_database_schema.py --yes
```

- 脚本对比 `Base.metadata` 与 `information_schema`，生成并执行 `ALTER TABLE`。**不在 lifespan 自动跑**（`main.py` 里 `init_db()` 已注释）。
- 改 model 是交付前必做项（见 spec-python checklist）。

## 8. 时区字段

时间字段的取值/比较见 [[spec-python]] §5：用 `app.utils.time` 的 `timestamp_now()` / `get_day_start_timestamp()` 等，存毫秒时间戳。禁止在查询里手算时区边界。

## 9. 配置表只读

`config_*` 配置表是真实开发/部署配置，**只能读，不能由业务代码或测试覆盖/禁用/删除/清理**（见 [[spec-test-server]] §10）。

## 10. checklist

- [ ] Model 每列有 `comment`，时间字段是 `BigInteger` 毫秒时间戳
- [ ] session 走 `async with get_async_session() as db`，不用 `Depends`
- [ ] service 方法只 `commit`，未重复包 `try/except rollback`
- [ ] 跨 service 事务用 `xxx_in_session(db, ...)`
- [ ] 提供 `lists/info/update/del` 四标准方法，或属于 §4 已登记的原子数据结构例外
- [ ] 数值型过滤条件是数组，过滤抽 helper 复用
- [ ] 无普通请求 DB 悲观锁/表锁；没有「先 DB 加锁、再查判断、再更新」
- [ ] 无子查询（或已注释说明例外）
- [ ] 批量改/删走 SQL 层 `UPDATE`/`DELETE`
- [ ] 改了 model → 跑 `sync_database_schema.py`
