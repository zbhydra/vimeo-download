"""
Admin 管理后台 API 路由包。

不要在包初始化阶段 eager import 各 router。download role 会导入
`app.api.admin.admin_node_monitor` 作为节点本地 JWT-only 管理接口；
若此处顺手导入 DB 鉴权或 service_nodes 控制面，会破坏 download role 无 DB 启动边界。
"""
