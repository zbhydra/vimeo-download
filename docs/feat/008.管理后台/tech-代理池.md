# 008 · 代理池管理

> Admin 可信环境下的代理配置管理。当前只负责配置的保存、查询和人工维护，不验证代理是否可用，也不接入任何消费方。协议、地址和凭据的实际使用规则留到后续消费链路确定。

## 1. 范围与边界

包含代理池列表、筛选、批量新增、编辑、启停和物理删除。Admin 是唯一入口，使用业务服务器的 `get_admin_user()` 鉴权。

不包含动态代理提取、出口国家检测、HTTP/HTTPS/SOCKS5 强制转换、连通性检查、自动重试、定时巡检、代理分配、租约、并发协调、桌面适配器和媒体下载代理。

代理添加失败直接失败。批量新增按输入顺序写入同一事务，任意一项失败则整体回滚，由现有错误处理中间件返回错误；不返回逐项结果，不做部分成功和补偿。

## 2. 数据规格

新增 `proxy_pool_entries` 表，保存供未来消费链路使用的原始配置：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `proxy_id` | `BIGINT` | 自增主键 |
| `name` | `VARCHAR(128)` | Admin 展示名 |
| `proxy_type` | `INT` | 代理记录类型：`1=动态`、`2=静态` |
| `protocol` | `VARCHAR(32)` | 原样保存输入协议，不做 HTTP 强制或枚举转换 |
| `dynamic_url` | `TEXT NULL` | 动态来源地址，仅保存 |
| `host` | `VARCHAR(255) NULL` | 静态主机 |
| `port` | `INT NULL` | 静态端口，当前不做连通性判断 |
| `username` | `VARCHAR(255) NULL` | 静态代理用户名 |
| `password` | `TEXT NULL` | 静态代理密码 |
| `country_code` | `CHAR(2) NULL` | 可选人工填写国家码，不自动检测 |
| `enabled` | `BOOLEAN` | 是否启用 |
| `created_at` / `updated_at` | `BIGINT` | 毫秒时间戳 |

本表不增加重复指纹、代理健康状态、失败原因、锁、租约或额外索引。数据库结构通过 `sync_database_schema` 同步。

## 3. API 合同

所有接口前缀为 `/api/admin/proxy-pool`，只使用 GET / POST，响应沿用 `{code, data, msg}`。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/` | 分页列表；支持名称、类型、协议、国家码、启用状态筛选 |
| GET | `/{proxy_id}` | 返回完整编辑配置 |
| POST | `/batch-create` | 按请求顺序新增，任一项失败则整批回滚 |
| POST | `/{proxy_id}/update` | 更新名称、类型、协议、配置和启用状态 |
| POST | `/{proxy_id}/delete` | 物理删除一条记录 |

新增和更新只做 schema 的基本字段类型/必填检查。不会主动请求动态 URL，不会通过代理访问外部服务，不会因协议不是 HTTP 而拒绝保存。不存在的记录复用 `NOT_FOUND`，其他错误交给现有异常处理中间件。

## 4. Admin 页面

新增 `/proxy-pool` 菜单和页面，复用现有 Naive UI、Axios、i18n 与布局：

- 列表：ID、名称、类型、协议、主机或动态 URL、国家码、启用状态、更新时间、操作。
- 筛选：名称、类型、协议、国家码、启用状态。
- 新增：动态/静态配置表单；静态批量输入可一次提交多项，提交失败保留表单内容并提示失败。
- 编辑：完整配置和启用状态。
- 删除：二次确认后物理删除。
- 列表不展示密码；编辑详情按已登录 Admin 请求后返回凭据。

用户文案只写入 Admin 的中英文 locale。页面不增加新的组件库或依赖。

## 5. 文件边界

后端新增：

- `backend/src/app/models/proxy_pool_entry_model.py`
- `backend/src/app/schemas/admin_proxy_pool.py`
- `backend/src/app/services/proxy_pool_service.py`
- `backend/src/app/api/admin/admin_proxy_pool.py`

后端修改：

- `backend/src/app/models/__init__.py`
- `backend/src/app/main.py` 的 business 路由装配

Admin 新增：

- `admin/src/api/proxy-pool.ts`
- `admin/src/views/ProxyPoolView.vue`

Admin 修改：

- `admin/src/router/index.ts`
- `admin/src/layouts/AdminLayout.vue`
- `admin/src/i18n/zh-CN.json`
- `admin/src/i18n/en-US.json`

## 6. 验收与验证

- 未登录访问代理池接口返回鉴权失败。
- Admin 可列表查询、筛选、新增、编辑、启停和删除代理记录。
- 批量新增按顺序执行；任一项失败时数据库无本批新增残留。
- 保存任意非 HTTP 协议文本不会被后端改写或强制拒绝。
- 后端执行定向 API/service/schema 测试、`sync_database_schema`、black、ruff、mypy。
- Admin 执行 `pnpm build`，并用本地真实后端完成一次页面流程验证；不使用伪造 API 响应验收。
