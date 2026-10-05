# Backend

## Python 临时文件

项目内所有 Python 相关临时产物统一收口到 `backend/.cache/`。

日常运行 Python 命令时，使用项目虚拟环境并指定缓存目录：

```bash
cd backend
PYTHONPYCACHEPREFIX=.cache/pycache ./.venv/bin/python <script> [args...]
```

常见示例：

```bash
cd backend
PYTHONPYCACHEPREFIX=.cache/pycache ./.venv/bin/pytest
PYTHONPYCACHEPREFIX=.cache/pycache ./.venv/bin/mypy --cache-dir=.cache/mypy src tests
./.venv/bin/ruff check --cache-dir=.cache/ruff .
```

启动本地业务 API：

```bash
cd backend/src
PYTHONPYCACHEPREFIX=../.cache/pycache ../.venv/bin/python -m app.main
```

## 代理输出总限速

`download.proxy_total_rate_limit_mb_per_second` 表示当前后端进程内所有代理输出流
共享的总速率上限，单位 MB/s；`0` 表示不限速。配置片段：

```yaml
download:
  proxy_total_rate_limit_mb_per_second: 0
```

## 配置校验

修改 `backend/config.yaml` 后，先校验配置：

```bash
cd backend
./.venv/bin/python scripts/check_config.py
```
