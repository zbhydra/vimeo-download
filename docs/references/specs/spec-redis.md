# 缓存规范（Redis）

> 后端 Redis 用法**强制规范**。写/改 Redis 用法（缓存/锁/限流/队列）前必读。
> 技术栈：`redis.asyncio` + `BlockingConnectionPool`，全局单例 `redis_client`。
> 关联：[[spec-test-server]] §3/§4/§10（real 测试、FakeRedis 禁令、Redis skip code）。

## 1. client 获取

- 用全局单例 `from app.core.redis import redis_client`，`await redis_client.get_client()` 拿 `Redis` 实例。**禁止**业务代码自己 `from_url` / 建 `BlockingConnectionPool`。
- 懒加载：首次 `get_client()` 才建池（双重检查锁）。连接参数（`pool_size`/`socket_timeout`/...）走 `settings.redis`，不要硬编码。
- **`decode_responses=True`**：所有读返回 `str`（不是 `bytes`）。数值读出后**必须 `int(...)` 转换**再比较/计算。

```python
from app.core.redis import redis_client

redis = await redis_client.get_client()
raw = await redis.get(key)          # str | None
count = int(raw) if raw else 0      # 显式转 int
```

## 2. key 命名

- **一律走 `build_redis_key()`**（`app/utils/redis_key.py`），自动加全局前缀 `settings.redis.key_prefix`（默认 `vimeo-video-downloader`，见 `core/config_schema.py`）。禁止裸 key、禁止手拼前缀。
- 工具自带子前缀，最终形态 `{prefix}:{工具前缀}:{业务}:{分桶}`：
  - 锁：`vimeo-video-downloader:lock:{key}`
  - 限流：`vimeo-video-downloader:fixed_window_limit:{identifier}:{window_id}`
  - 额度：`vimeo-video-downloader:quota:{type}:{u_id}:{YYYYMMDD}`
- 新工具必须有自己的子前缀，禁止复用别的工具的前缀造成语义混淆。

## 3. 用途与工具归属

已有封装（`backend/src/app/utils/redis_*.py`），新需求**先查是否已有，禁止重复造**：

| 用途 | 工具 |
|------|------|
| 统一前缀 | `redis_key.build_redis_key` |
| 分布式锁 | `redis_lock.RedisLock` |
| 固定窗口限流 | `redis_fixed_limiter.RedisFixedLimiter` |
| 其他限流 | `redis_rate_limiter` |
| 队列（Streams） | `redis_queue` |

## 4. 生命周期

- 临时业务状态必须设置 key TTL；value、Hash field 或 ZSet score 中的过期时间只表达业务判断，不能替代 Redis key TTL。
- TTL 应与该 key 的业务生命周期一致。新增或更新临时状态时，必须在同一次写入流程中设置或刷新 TTL，不能依赖后续读取触发惰性删除。
- 固定、无条件的多命令序列需要原子提交时，使用 redis-py transaction pipeline；所有命令必须在同一个 `pipeline(transaction=True)` 中排队后执行。

## 5. Lua 脚本与事务

- 是否需要原子性由业务后果决定并在代码中说明，不能仅因存在多条 Redis 命令就默认使用 Lua 或 transaction。
- 业务要求 read-modify-write 原子执行时使用 Lua，例如锁释放（`get→del`）、额度校验+扣减；不要求原子时允许分步执行，并明确可接受的中间状态与失败语义。
- 业务要求无条件固定命令序列原子提交时使用 transaction pipeline，例如同一 key 的 `ZADD + EXPIREAT`；不要为不读取中间结果的事务增加 Lua。
- 调用：`await redis.eval(script, numkeys, *keys_and_args)`，加 `# type: ignore[misc]`（redis-py 类型桩限制）。
- 脚本抽成模块级常量（如 `_INCR_WITH_EXPIRE_SCRIPT`），顶部注释说明返回值含义。

```python
_INCR_WITH_EXPIRE_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""
result = await redis.eval(_INCR_WITH_EXPIRE_SCRIPT, 1, redis_key, window + 1)  # type: ignore[misc]
```

## 6. 分布式锁

- 默认用 `RedisLock.lock_context(key, ttl=..., timeout=...)` 上下文管理器，不要手写 Redis `set nx` / `get→del`。如果必须区分“抢不到锁”和“Redis 不可用”并映射不同业务错误，可以用 `RedisLock.acquire/release`，但仍必须走通用锁封装。

```python
from app.utils.redis_lock import RedisLock

lock = RedisLock()
async with lock.lock_context(f"order:{order_no}", ttl=30, timeout=10):
    ...  # 临界区
```

- `lock_value` 用 `uuid4()`，释放靠 Lua 校验 owner（防误删他人持有的锁）。
- **必须设 `ttl`**，禁止无过期锁（服务崩溃会永久持锁）。等待获取设 `timeout`，内部已做指数退避。
- 普通用户请求的短锁**禁止续租/心跳**：选择一个足够覆盖正常请求的固定 `ttl`，正常结束立即释放；超过 `ttl` 仍未结束视为慢请求异常，后续请求可以拿到可重试错误。只有明确的后台长任务、队列消费或外部不可拆分长流程，才允许设计续租，并必须在注释里说明为何固定 `ttl` 不够。

## 7. 故障策略（按业务语义，必须显式决定）

Redis 故障没有统一处理方式。每个用途必须按业务语义决定失败还是继续，并在代码中注释：

| 语义 | 策略 | 例子 |
|------|------|------|
| 可用性优先（故障不能拖垮主流程） | **fail-open**：记日志 + 放行 | 限流器 `is_allowed` 故障返回 `True` |
| 正确性优先（Redis 是硬依赖） | **fail-closed**：请求失败，不使用本地状态或跳过校验 | 额度扣减 `quota_service` 故障抛 `QUOTA_INVALID_REQUEST` |
| 互斥优先 | 抛 `RedisLockError` | 锁 acquire 故障 |

- 禁止「默认不处理」——每种 Redis 用途都要在最接近业务 owner 的代码中说明“Redis 挂了怎么办”。fail-closed 可以直接让异常上抛，不为记录策略强加无价值 catch；fail-open、异常映射或局部失败继续执行必须显式 catch。
- catch 后必须 `logger.error(..., exc_info=True)`，保留原始堆栈。

## 8. 测试约束

- real 测试**禁止 FakeRedis**（不能验证 Lua 脚本与 Streams 行为），见 [[spec-test-server]] §10。
- Redis 不可用用统一 skip code：`pytest.skip("REAL_REDIS_UNAVAILABLE: ...")`。
- real fixture 名带 `real_` 前缀（`real_redis_ready`），放 `tests/integration/real/conftest.py`。

## 9. checklist

- [ ] client 走 `redis_client.get_client()`，未自建连接池
- [ ] key 走 `build_redis_key()`，有工具子前缀
- [ ] 数值读出后 `int()` 转换
- [ ] 临时业务状态设置了与业务生命周期一致的 key TTL
- [ ] 已按业务后果决定原子边界；需要原子的 read-modify-write 用 Lua，固定命令序列用 transaction pipeline；不需要原子的分步操作已注释失败语义
- [ ] 锁走通用 `RedisLock` 且设 `ttl`；普通用户请求短锁没有续租/心跳
- [ ] 每种 Redis 用途已在业务 owner 处显式决定故障策略（fail-open / fail-closed）并注释
- [ ] catch 处 `logger.error(exc_info=True)`
- [ ] real 测试无 FakeRedis
