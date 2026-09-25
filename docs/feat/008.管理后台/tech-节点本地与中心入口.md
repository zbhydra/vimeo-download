# 008 · 节点本地与中心入口

> 覆盖 admin 域下"业务服务器中心入口"与"节点本地入口"的双路由边界、双鉴权依赖的挂载规则、admin 前端的节点直连模式。
> 关联:`@feat.md` `@tech-后台架构与认证.md` `@tech-管理模块接口.md`。本文从 admin 域视角声明节点本地与中心入口的边界与挂载事实。

## 1. 为什么有两套入口

admin 域的节点本机监控既要在业务服务器(连业务数据库)上用,也要在执行节点(无业务数据库、`download` role)上用。同一批接口需要两套鉴权:

- 中心入口:业务服务器承载,鉴权回查管理员表(`get_admin_user`)。
- 节点本地入口:执行节点承载,鉴权只验签 JWT(`get_admin_jwt_only`),不查 DB / Redis,使 `download` role 无 DB 也能安全启动。

两套入口在代码上体现为每个相关 router 文件导出两个 router:`router`(中心,`get_admin_user`)与 `node_local_router`(节点本地,`get_admin_jwt_only`),同一路径分别注册不同鉴权依赖。

## 2. 挂载事实

路由组装在 `@backend/src/app/main.py`:

- 节点本地 router（当前只有 `admin_node_monitor.node_local_router`）由 `_include_node_local_admin_routes()` 挂载，前缀 `/api/admin`，tag `admin-node-local`。`business` 与 `download` role 都挂载这批 router。
- 中心 admin router（登录 / 续签 / 验证码、Dashboard、订单、解析失败与下载详情打点、服务节点 CRUD、用户信息弹窗、数据分析、系统设置）只在 `business` role 挂载，前缀 `/api/admin`，tag `admin`。
- `download` role 不挂载任何依赖业务数据库的 router：不挂登录 / 续签 / Dashboard / 订单 / 服务节点 CRUD / 打点排查。

`@backend/src/app/api/admin/__init__.py` 明确禁止 eager import 各 router,避免 `download` role 导入节点本地 router 时顺手带入 DB 鉴权或服务节点控制面,破坏无 DB 启动边界。

## 3. 路径重名规则

当前只有节点本机监控存在"中心 + 节点本地"双形态：`/api/admin/node-monitor/network-rate` 在 `business` role 上由节点本地 JWT-only router 提供，其他 admin 路径不存在同名冲突。后续若再出现同名路径，必须由节点本地 JWT-only router 接管同一支 admin access JWT，不能在同一路径同时注册 DB 鉴权 router，避免 FastAPI 同路径路由顺序导致鉴权合同漂移。

## 4. admin 前端的节点直连模式

admin 前端只从业务服务器读：节点列表、节点配置、admin 登录、admin token 刷新。对目标节点的监控读取，前端按目标节点 `public_base_url` **直接请求目标节点本地接口，不经业务服务器代理**。

请求头:`Authorization: Bearer <admin_access_jwt>`(同一支业务服务器签发的 admin access token)。

目标节点返回 401 且前端仍持有 refresh token 时:

1. 前端只向业务服务器 `POST /api/admin/auth/refresh` 刷新。
2. 业务服务器校验 refresh token 与 Redis 状态后签发新 access token。
3. 前端用新 access token 重试原目标节点请求一次。
4. 重试仍失败跳转登录或展示节点鉴权失败。**不在执行节点上调 refresh**——执行节点不提供登录 / refresh 接口。

节点本地管理入口的可用前提:节点存在 + 最近健康状态为 healthy + 公网地址合法。`enabled=false` 只表示不参与调度,不阻止本地管理请求(管理员必须能先查看健康但停用节点的本地监控数据,再决定是否启用)。所有节点必须允许 admin 前端来源跨域访问节点本地管理接口并允许 `Authorization` header,该放行由 nginx / 部署层配置,不在应用代码新增 CORS 中间件。

## 5. 节点本地接口清单(admin 域视角)

admin 域承载的节点本地接口(完整节点本地管理契约含服务节点健康检查等属节点域):

```text
GET  <node.public_base_url>/api/admin/node-monitor/network-rate
```

规则:

- 节点本地接口只验签 JWT、校验 `type / exp / user_id / jti`,不回查业务数据库,不查 Redis;业务节点即使配了 Redis 也不通过 Redis 校验 access JWT。

## 6. 边界归属

- 服务节点 CRUD、节点本地 router 与节点健康检查的完整契约由 backend 服务节点接口提供，接口口径见 `@tech-服务节点.md`。
- admin 前端如何选择目标节点、节点列表本身的字段与调度语义见 `@feat.md`。
- 节点本地接口背后读写的网络速率缓存，采集口径见 `@tech-服务节点.md`。
- 本域只声明:admin 域的哪些接口以"中心 + 节点本地"双形态存在、双鉴权依赖如何挂载、前端如何直连节点。
