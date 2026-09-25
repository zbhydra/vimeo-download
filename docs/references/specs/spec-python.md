# Python 工程规范

> 后端（`backend/`）Python 代码的**强制规范**。写/改后端 Python 前必读。
> 以源码为唯一真相：本规范条款来自 `backend/src/app/` 现有写法，不是通用 PEP8 摘抄。
> 关联规范：数据访问见 [[spec-mysql]]，缓存见 [[spec-redis]]，索引见 [[spec-index]]，测试见 [[spec-test-server]]。

## 1. 工程与依赖

- 用 **uv** 管理依赖与虚拟环境，禁止 `pip install` / `requirements.txt` / `pdm`。增减依赖必须经 hydra 同意。
- **Python 版本三处对齐为 3.11**：`pyproject.toml` 的 `requires-python`、`[tool.black].target-version`、`[tool.ruff].target-version`。
  > 现状：`requires-python = ">=3.11"` 但 black/ruff `target-version = "py313"`，不一致。新代码禁止用 3.12+ 语法（如 `type X = ...` 别名、`except*`），统一锁 3.11。
- 依赖版本由 `uv.lock` 锁定，提交时一并提交 lockfile。

## 2. 代码风格

- **black** `line-length=88`；**isort** `profile="black"`。提交前必跑 `black` + `ruff`。
- **ruff** 当前忽略 `E402`（module level import not at top of file）。仅允许在「运行时条件 import / 动态分表」等确有必要的场景下沉 import，且必须注释原因；其余 import 一律顶部。
- **禁止方法体内 `import`** 作为习惯。`base_service.py` 里 `import sys` / `import asyncio` 写在方法内是历史遗留，新代码不沿用。

## 3. 类型注解（第二档标准）

后端不追求 mypy strict 通过（配置保持宽松），但**注解必须有且风格统一**：

| 要求 | 说明 |
|------|------|
| Model 字段 | 必须 `Mapped[...]` 注解（见 spec-mysql） |
| 公开函数/方法签名 | 必须有参数与返回值注解 |
| 私有辅助函数 | 鼓励注解，不强制 |
| 可选类型 | **统一用 PEP 604 `X \| None`**，新代码禁止 `typing.Optional[X]` / `typing.Union[X, Y]`（存量逐步迁移） |
| `Any` | 禁止；需要「任意对象」用 `object`，需要容器用泛型/`TypeVar` |
| ORM 实例化 | `Model(field=...)` 处允许 `# type: ignore[call-arg]`（SQLAlchemy mypy 插件的已知限制） |

- `**kwargs` 若对外开放，应尽量改成显式参数；内部透传场景可保留但补注释说明传什么。

```python
# ✅ 新代码风格
async def get_user_by_email(self, email: str) -> UserModel | None: ...

# ❌ 禁止（新代码）
async def get_user_by_email(self, email: str) -> Optional[UserModel]: ...
async def update(self, id: int, **kwargs) -> bool: ...   # **kwargs 无类型且对外开放
```

## 4. async 规范

- 全链路异步：FastAPI + SQLAlchemy async + `redis.asyncio` + `httpx`。
- **禁止在 async 函数内调用同步阻塞 IO**：`requests`、`time.sleep`、同步 `open()` 读写大文件、同步 DB 驱动。
  - HTTP：`httpx.AsyncClient`
  - 睡眠：`await asyncio.sleep(...)`
  - 文件：`aiofiles`（或确无大文件时 `pathlib` 小量同步读取可接受）
- `pytest` 用 `asyncio_mode=auto`，real 测试加 `@pytest.mark.real` + `@pytest.mark.asyncio`（见 spec-test-server）。

## 5. 时区与时间

- **所有时间以毫秒整数时间戳存库**（`BigInteger` 列 + `comment="创建时间（毫秒时间戳）"`），不用 `DateTime` 列。
- 按天逻辑以业务时区 **0 点为界**，统一用 `app.utils.time` 工具，禁止自己拼时间。

| 需求 | 用 |
|------|----|
| 当前毫秒时间戳 | `timestamp_now()` |
| 当前秒级时间戳 | `timestamp_now_seconds()` |
| 今日/明日 0 点毫秒时间戳 | `get_today_start_timestamp()` / `get_tomorrow_start_timestamp()` |
| 某自然日起止 | `get_day_start_timestamp(value)` / `get_day_end_timestamp(value)` |
| 时间戳 → 可读串 | `timestamp_to_datetime_str(ts)` |

- **禁止** `datetime.now()` 不带 tz；naive datetime 一律按业务时区解释（`datetime.now(system_timezone())`）。

## 6. 错误处理

### 6.1 业务异常统一用 AppCommonException

```python
class AppCommonException(Exception):
    def __init__(self, code: CommonCode, ext_msg: str = "", *, data: dict | None = None): ...
```

- 业务错误**一律** `raise AppCommonException(code, ext_msg, *, data=...)`。
  - `code`：`CommonCode` 枚举（`backend/src/app/i18n/common_code.py`，`IntEnum`）。
  - `ext_msg`：**三要素**——① 哪里（`函数名/操作:` 前缀）② 错的是什么 ③ 请求上下文（关键 id / 入参 / 上游返回）。拒绝泛化。
  - `data`：keyword-only，携带 `wait_seconds`、`active_request_count` 等结构化附加数据。
- **禁止** `raise Exception(...)` / `raise ValueError(...)` 表达业务错误（参数防御性校验除外）。

```python
# ✅ 三要素齐全
raise AppCommonException(
    CommonCode.ORDER_CREATE_FAILED,
    ext_msg=(
        "order_create: payment data save failed after gateway success: "
        f"order_no={order.order_no}, payment_method={payment_method}"
    ),
)
```

### 6.2 错误码

- 命名 `{模块}_{类别}_{具体}`，值即 HTTP 状态码（400/403/404/500）或业务码（10000+）。
- **新增码值必须全局唯一**。现状 `CREDIT_INSUFFICIENT` 与 `QUOTA_EXCEEDED` 同为 `10201` 是历史冲突，新增码禁止撞既有值；发现旧冲突须标记 deprecated 并排期删除。
- 错误码翻译：中间件按 `code.name` 去.yaml `resp_code.{name}` 取 i18n 文案。

### 6.3 try/except 约束

错误中间件（`backend/src/app/middleware/error_handling.py`）统一兜底，**不要乱加 try/except**。仅以下三种情况才 catch，且 catch 后**必须** `logger.error(..., exc_info=True)`：

1. 释放资源（文件/连接）。
2. 储存运行结果（部分成功也要落库的场景）。
3. 即使出错也要继续往下执行。

其余一律让异常上抛，由中间件统一转响应。

## 7. 日志

- 用 `from app.utils.logger import logger`（单例，名 `server`），不要自己 `logging.getLogger(...)`。
- catch 住异常后**必须**打印：`logger.error("xxx failed: ...", exc_info=True)`。
- 级别走 `settings.logging.level`；`debug=True` 只影响 SQLAlchemy `echo`，与日志级别解耦。

## 8. API 层

- **只用 GET 和 POST**，禁止 PUT/DELETE/PATCH。
- router 双层 prefix：`main.py` 里 `include_router(xxx_router, prefix="/api/client|admin|internal")`，router 文件内再带业务 `prefix="/xxx"`。
- 鉴权/上下文：`Security(HTTPBearer)` + `Depends(get_current_user)`（client）/ `Depends(get_admin_user)`（admin）。**session 不走 Depends**——在 service 内自取（见 spec-mysql）。
- **参数校验与处理在 api 层完成**：pydantic v2 schema 校验 + 参数清洗，service 层不做参数校验。schema 放 `app/schemas/`（admin 可就近放 api 目录，保持一致性即可）。
- 统一响应：`ResponseUtils.ok(data)` / `ResponseUtils.error(...)`，结构固定 `{code, data, msg}`，成功 `code=10000`。HTTP 状态由错误码值在 400–599 区间透传，否则 200。

## 9. Service 层

- service **必须是类**（继承 `BaseService[ModelType]` 或独立类），函数不写在类外；通用函数进 `app/utils/`。
- **模块边界：service 只提供本模块的基础原子方法**，禁把其他模块的场景耦合进来。如 `user_coin_service` 只该有 `get/add/cut`，由 `user_service` 在注册流程里调用 `add`；`signup_add` 这种把注册场景写进 coin service 的写法是坏味道。
- service 单例默认使用 **Python 模块级实例**：类保持原名，模块底部暴露唯一实例 `xxx_service = XxxService(...)`，调用方只 import 该实例。
- `@singleton` 装饰器已废弃：新 service 禁止新增使用；改动存量 `@singleton` service 时应顺手迁移为模块级实例。当前 `app/core/singleton.py` 的装饰器会把类名替换成工厂函数，破坏类名静态调用、类型检查与反射语义。
- session 获取与事务见 spec-mysql（`async with get_async_session() as db` + 显式 commit）。
- 关联 model 的 service **必须**提供四个标准方法 `xxxx_lists` / `xxxx_info` / `xxxx_update` / `xxxx_del`；已在 spec-mysql §4 登记的原子数据结构例外按其专用合同执行。
- 禁止在 service 里写子查询（`.subquery()` / `EXISTS` 嵌套）；仅分表跨表查询等少数场景例外并注释。

## 10. i18n

- 用户可见文案（响应 msg、邮件、告警）支持 i18n；错误码翻译走 `resp_code.{code.name}`。
- 不直接把中文写死进面向用户的响应，用错误码 + 翻译表。

## 11. 防御与包容

程序应当包容，不是一味防御、拒绝——过度防御会造成巨大隐患（前端正常演进被后端卡死）。

- **Pydantic schema 禁用 `extra="forbid"`**：默认忽略未知字段，让前端多传字段不报错。仅确需严格拒绝的内部契约才用 forbid 且注释原因。
- **不过度防御性编程**：不预先假设调用方传错而层层校验抛错。参数校验集中在 API 入口（见 §8），service 内部调用信任类型契约。
- 不为「以防万一」加 try/except（见 §6.3 三条件）。

## 12. 注释与文档

复用公共注释规范（聚焦「为何」、文件顶部说明用途、函数/字段注释、权宜标 `TODO/FIXME`），见 [[spec-code]]。本文件不重复。


## 13. 交付前 checklist

- [ ] `uv run black` + `uv run ruff check` 通过
- [ ] 新代码类型注解齐全，可选类型用 `X | None`
- [ ] 无同步阻塞 IO 进 async 函数
- [ ] 时间用 `app.utils.time` 工具，存毫秒时间戳
- [ ] 业务异常用 `AppCommonException`，`ext_msg` 三要素
- [ ] 新增错误码全局唯一
- [ ] catch 处满足三条件之一且打印 `logger.error(exc_info=True)`
- [ ] service 是类，提供 `lists/info/update/del` 四个标准方法或符合 spec-mysql 已登记例外
- [ ] service 只提供本模块基础方法，无跨模块耦合
- [ ] Pydantic schema 无 `extra="forbid"`
- [ ] 改了 model → 执行 `sync_database_schema.py`（见 spec-mysql）
