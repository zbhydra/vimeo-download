# Backend

## Python 临时文件

项目内所有 Python 相关临时产物统一收口到 `backend/.cache/`。

日常运行 Python 命令时，统一通过：

```bash
cd backend
./scripts/with-python-cache.sh <command> [args...]
```

常见示例：

```bash
cd backend
./scripts/with-python-cache.sh ./.venv/bin/pytest
./scripts/with-python-cache.sh ./.venv/bin/mypy src tests
./scripts/with-python-cache.sh ./.venv/bin/ruff check .
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
