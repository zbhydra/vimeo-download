# 008 · 服务节点

> 覆盖管理后台服务节点菜单在 admin 域内承载的节点本机监控展示。服务节点 CRUD 与节点本地管理完整契约属 `@feat.md`,本文件不重复。

## 范围

服务节点菜单的节点 CRUD、启用 / 停用、手动健康检查、节点本地运行态诊断由 backend 的服务节点接口提供；admin 域只保留节点本机监控接口口径，供服务节点列表展示当前节点网络速率。

## 节点本机监控

监控采集服务在每个进程内启动(业务 / 下载 role 都启动),每 5 秒读取一次本机网络累计字节(所有非 `lo` 网卡总和),用相邻采样计算最近 5 秒平均入站 / 出站速率,结果只缓存在当前进程内,有效期 10 秒。第一轮采样只建立基线,不产生速率。不写业务数据库,不依赖 `service_nodes`。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/node-monitor/network-rate` | `get_admin_jwt_only` | 返回当前节点网络速率或 null |

响应:`network_rate`(`rx_bytes_per_second`、`tx_bytes_per_second`、`sampled_at` Unix 秒)或 `null`(无有效数据)。采集失败、非 Linux、只有一轮采样、采样间隔异常或网卡字节回退时返回 `null`。容器内读到的是容器网络命名空间速率,不承诺宿主机总流量。

admin 前端在服务节点列表按节点直连读取，每 5 秒刷新速率；`GET /api/admin/service-nodes`（节点列表）本身不返回网络速率。

## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 监控 | `@backend/src/app/api/admin/admin_node_monitor.py` | `@backend/src/app/services/monitor_service.py` |
