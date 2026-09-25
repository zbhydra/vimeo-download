"""客户端 API 端点包。

本包不 re-export 具体 router，避免导入任一客户端子模块时提前加载 auth、
用户服务和业务数据库。路由统一由 `app.main` 按 app.role 显式装配。
"""

__all__: list[str] = []
