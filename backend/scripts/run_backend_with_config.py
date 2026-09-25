#!/usr/bin/env python3
"""使用指定 config.yaml 启动一个本地后端进程。

该脚本只给本地 smoke/诊断使用：
1. 在导入 app.main 前把 app.core.config.settings 替换为指定配置。
2. 用当前配置里的 app.host/app.port/app.role 创建并启动 FastAPI app。
3. 不修改 backend/config.yaml，也不改变线上 supervisor/uvicorn 入口。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.core.config_schema import Settings  # noqa: E402


def _parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="Run backend with an explicit config file.",
    )
    parser.add_argument(
        "--config",
        required=True,
        help="要加载的 config.yaml 路径。",
    )
    return parser.parse_args()


def main() -> None:
    """加载指定配置并启动 uvicorn。"""
    args = _parse_args()
    config_path = Path(args.config).resolve()
    if not config_path.exists():
        raise FileNotFoundError(
            f"run_backend_with_config: config not found: {config_path}"
        )

    import app.core.config as config_module

    config_module.settings = Settings(str(config_path))

    import app.main as main_module
    import uvicorn

    settings = config_module.settings
    uvicorn.run(
        main_module.app,
        host=settings.app.host,
        port=settings.app.port,
        reload=False,
        log_level=settings.logging.level.lower(),
        access_log=settings.app.env == "prod",
        timeout_graceful_shutdown=(main_module.GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS),
    )


if __name__ == "__main__":
    main()
