#!/usr/bin/env python3
"""校验 backend/config.yaml 并打印关键配置字段。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.core.config_schema import (
    ConfigReloadError,
    load_settings_candidate,
)  # noqa: E402


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(description="Validate backend config.yaml")
    parser.add_argument(
        "config_path",
        nargs="?",
        default=str(PROJECT_ROOT / "config.yaml"),
        help="配置文件路径，默认 backend/config.yaml",
    )
    return parser.parse_args()


def main() -> int:
    """执行配置校验。"""
    args = parse_args()
    config_path = Path(args.config_path)
    try:
        candidate = load_settings_candidate(str(config_path))
    except ConfigReloadError as exc:
        print(f"[ERROR] config invalid: {exc.config_path}", file=sys.stderr)
        for error in exc.errors:
            print(f"- {error}", file=sys.stderr)
        return 2

    print(f"[OK] config valid: {candidate.config_path}")
    print(f"app.env: {candidate.app.env}")
    print(f"app.port: {candidate.app.port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
