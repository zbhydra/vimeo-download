# 后端测试规范

> AI 执行者编写后端测试的**强制规范**。所有新增测试必须遵守。
> 代码模板参考现有测试：@backend/tests/integration/real/api/client/test_auth_extension_login_real.py @backend/tests/integration/real/api/client/test_vimeo_media_api_real.py @backend/tests/integration/real/redis/test_media_pre_authorization_real.py

## 1. 核心原则

1. **Real 测试优先**：real 测试必须使用本文件声明依赖的真实资源，如 MySQL、Redis、本地文件系统、OSS provider 行为。
2. **外部出口可替换**：不可控外部服务可以用明确返回值或明确异常的替身覆盖，如 SMTP、LLM、Feishu、外部 HTTP、OSS SDK 网络出口。
3. **外部出口必须测失败映射**：使用替身时必须覆盖外部服务不可用、成功返回映射、失败后的错误码与副作用。
4. **禁止依赖注入**：不要为了测试而引入依赖注入。
5. **测试即文档**：函数名必须清晰描述场景，如 `test_real_batch_recycle_rejects_non_existent_leads`。
6. **一个测试验一个行为**：长流程测试（注册→登录→操作）除外。

## 2. 目录与命名

- 新增后端测试优先放 `integration/real/` 或 `integration/redis/`。
- 新增 real 测试按 `backend/src/app` 目录镜像放置，禁止直接放在 `backend/tests/integration/real/` 根目录。
- 文件命名：`test_{源码文件名}_real.py` / `test_{业务域}_flow_real.py` / `test_redis_{模块名}.py`。
- 函数命名：`test_real_{动作}_{场景}`。

目录映射：

| 源码目录 | Real 测试目录 |
|----------|---------------|
| `backend/src/app/api/**` | `backend/tests/integration/real/api/**` |
| `backend/src/app/services/**` | `backend/tests/integration/real/services/**` |
| `backend/src/app/crons/**` | `backend/tests/integration/real/crons/**` |
| `backend/src/app/middleware/**` | `backend/tests/integration/real/middleware/**` |
| `backend/src/app/provider/**` | `backend/tests/integration/real/provider/**` |
| `backend/src/app/utils/**` | `backend/tests/integration/real/utils/**` |
| `backend/src/app/models/**` | `backend/tests/integration/real/models/**` |
| `backend/src/app/init/**` | `backend/tests/integration/real/init/**` |
| `backend/scripts/**` | `backend/tests/integration/real/scripts/**` |

业务流测试放在最接近入口的目录：

- 端到端 API 流程：`real/api/client/`
- service 事务、数据一致性：`real/services/`
- 定时任务与恢复任务：`real/crons/`
- 运维与一次性脚本：`real/scripts/`
- 真实 provider 行为：`real/provider/`
- 跨目录共享 helper：`real/support/`，禁止放测试函数

## 3. 环境检测

每个 real 测试文件必须声明并检测本文件依赖的真实资源，不可用则 `pytest.skip`。

统一 skip code：

- MySQL 不可用：`REAL_MYSQL_UNAVAILABLE`
- Redis 不可用：`REAL_REDIS_UNAVAILABLE`
- OSS/外部存储不可用：`REAL_OSS_UNAVAILABLE`
- 必要表不存在：`REAL_SCHEMA_UNAVAILABLE`

示例：

```python
pytest.skip("REAL_MYSQL_UNAVAILABLE: MySQL 不可用，跳过 real 测试")
pytest.skip(f"REAL_REDIS_UNAVAILABLE: Redis 不可用，跳过 real 测试: {exc}")
pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {table_name} 表")
```

全量 real 测试前先执行环境 smoke。目标文件为 `tests/integration/real/api/system/test_health_api_real.py`。

```bash
uv run pytest tests/integration/real/api/system/test_health_api_real.py -rs
```

执行 real 测试必须带 `-rs` 输出 skip 原因：

```bash
uv run pytest -m real -rs
```

## 4. Fixture 要求

- **数据清理**：用 `_CleanupState` dataclass 记录创建的资源，fixture teardown 中按子表→父表顺序删除。
- **数据唯一性**：所有写入 DB 的数据必须包含 `test_run_id`，确保并行运行不冲突。
- **辅助函数**：以 `_` 开头，定义在测试文件顶部；多文件共用才放 `conftest.py`；内部也要 assert 关键步骤。
- **Real fixture 命名**：real 专用 fixture 必须放在 `backend/tests/integration/real/conftest.py` 或对应子目录 `conftest.py`，名称必须带 `real_` 前缀，如 `real_async_client`、`real_mysql_ready`、`real_redis_ready`、`real_cleanup_state`。
- **全局 fixture 约束**：`backend/tests/conftest.py` 禁止暴露 fake infra fixture，如 `fake_redis`、`fake_db`、`mock_service`、`mock_current_user`、`mock_permissions`。
- fake / mock fixture 只能放在允许 mock 的测试目录内，例如 `backend/tests/test_server/`，且不得被 `backend/tests/integration/real/**` 继承。

## 5. Mock / Monkeypatch 白名单

real 测试默认禁止 mock / monkeypatch 本系统内部逻辑。

允许替换的对象只限不可控外部出口：

- SMTP
- LLM provider
- Feishu 告警发送
- 外部 HTTP API
- OSS SDK 网络出口
- 日志根目录 / 临时文件目录
- 时间窗口边界

允许替换外部出口时，必须同时满足：

1. 明确写出替身返回值或异常。
2. 覆盖外部服务不可用场景。
3. 覆盖外部服务成功返回映射。
4. 断言失败时 DB/Redis/文件没有错误副作用。
5. 禁止 mock 本系统 service / DB / Redis / 权限依赖 / 业务函数。

示例：

```python
class _FakeLlmProvider:
    async def complete(self, prompt: str) -> str:
        return "fixed translated text"


class _FailingLlmProvider:
    async def complete(self, prompt: str) -> str:
        raise TimeoutError("LLM timeout for real test")
```

## 6. 断言规范

- API 响应必须**同时断言** `status_code` 和 `body["code"]`
- 错误码必须用 `CommonCode` 常量，禁止硬编码数字
- 写入操作必须有**副作用断言**（再查一次确认 DB/Redis 状态变更）

## 7. 每个方法的最低用例要求

| 方法类型 | 最低用例数 | 必须包含 |
|----------|-----------|---------|
| 简单 CRUD | 2 | 正常 + 不存在/空结果 |
| 带校验的写入 | 3 | 正常 + 校验失败 + 权限拒绝 |
| 批量操作 | 4 | 正常 + 超数量限制 + 部分无效 ID + 空列表 |
| 删除/回收 | 3 | 正常 + 不存在 + 状态不允许 |
| 列表/搜索 | 3 | 有数据 + 空结果 + 过滤组合 |
| 导入/导出 | 3 | 正常流程 + 无效文件 + 重复处理 |

## 8. 输入边界覆盖矩阵

每个**写入端点**必须覆盖：正常值、min/max 边界值、越界值、XSS payload、SQL 注入字符、Unicode 控制字符、缺失必填字段、类型错误。

每个 API real 测试文件必须维护本文件覆盖的写入端点矩阵，写在文件顶部注释。
真实外部网络用例可以使用环境变量 skip，文件内仍需保留 `real` 标记、覆盖矩阵和可 collect 的权限/副作用/失败映射用例。

| Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect |
|----------|-------|------------|---------|------|---------|----------|-----|------|---------|-------------|

字段含义：

- `Happy`：正常请求。
- `Permission`：权限拒绝；认证/权限守卫已在集中测试覆盖的端点可标 `centralized`。
- `Missing`：缺必填字段。
- `Type`：字段类型错误。
- `Min/Max`：合法边界值。
- `Overflow`：越界值、超长、超数量。
- `XSS`：脚本字符串。
- `SQLi`：SQL 注入字符按字面处理或业务拒绝。
- `Unicode`：Unicode 控制字符。
- `Side Effect`：写入后的 DB/Redis/文件副作用断言。

规则：

- 新增或修改写入端点时必须更新矩阵。
- 缺项必须写明原因。
- 批量操作必须额外覆盖：空列表、超数量、部分无效 ID、重复 ID。
- 导入/导出必须额外覆盖：无效文件、重复处理、任务失败恢复。

## 9. 收集门禁

新增或调整 real 测试后，必须执行：

```bash
uv run pytest --collect-only tests/integration/real -q
uv run pytest --collect-only tests/integration/real -q -m real
```

要求：

- 两个命令必须成功。
- 新增测试必须出现在收集列表。
- `integration/real/**` 下的测试必须能被 `-m real` 收集。
- 普通 collect 与 `-m real` 的测试数量必须一致。
- 如存在非 real 测试，必须迁出 `integration/real/**`。

## 10. 禁止事项

| 禁止 | 原因 |
|------|------|
| `unit/` 下新增后端业务测试文件 | 统一用 real 测试 |
| `backend/tests/conftest.py` 暴露 `FakeRedis` | real 测试会继承 fake infra |
| `FakeRedis` 写 real 测试 | 不能验证 Lua 脚本和 Streams |
| `AsyncMock` / `monkeypatch` mock service | 不能验证真实 DB 交互（SMTP/LLM 除外） |
| 测试函数不带 `@pytest.mark.real` | 无法区分 real / unit 测试 |
| 不清理测试数据 | 污染数据库 |
| 固定 ID / email（不含 test_run_id） | 并行冲突 |
| 依赖测试执行顺序 | 每个测试必须独立可运行 |
| 断言中硬编码错误码数字 | 必须用 CommonCode 常量 |
| 测试或测试脚本写入 `config_*` 配置表 | 配置表是真实开发/部署配置，只能读取，不能由测试覆盖、禁用、删除或清理 |

## 11. Checklist

- [ ] `@pytest.mark.real` + `@pytest.mark.asyncio`
- [ ] 文件声明真实资源依赖
- [ ] 环境检测 fixture 使用统一 skip code
- [ ] 所有创建的数据注册到 cleanup_state
- [ ] cleanup 按依赖顺序清理
- [ ] 数据含 `test_run_id`
- [ ] 断言 `status_code` + `body["code"]`
- [ ] 写入有副作用断言
- [ ] 错误码用 `CommonCode`
- [ ] 外部出口替身覆盖成功返回和不可用场景
- [ ] 无本系统 service / DB / Redis / 权限依赖 mock
- [ ] 写入端点覆盖矩阵已更新
- [ ] `collect-only` 与 `collect-only -m real` 数量一致
- [ ] 可独立运行
