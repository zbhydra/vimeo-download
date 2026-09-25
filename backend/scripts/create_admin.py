#!/usr/bin/env python3
"""
CLI 工具：创建管理员账号。

用法：
    cd backend && uv run python scripts/create_admin.py --username <用户名> --password <密码>

密码使用 bcrypt 哈希后存入 admins 表。
如果用户名已存在则报错退出。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.services.admin_service import admin_service  # noqa: E402


async def main(username: str, password: str) -> None:
    """创建管理员账号。"""
    existing = await admin_service.get_by_username(username)
    if existing:
        print(
            f"错误：用户名 '{username}' 已存在 (admin_id={existing.admin_id})",
            file=sys.stderr,
        )
        sys.exit(1)

    admin = await admin_service.create_admin(username, password)
    print(f"管理员创建成功：{admin.username} (admin_id={admin.admin_id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="创建管理后台管理员账号")
    parser.add_argument("--username", required=True, help="管理员用户名")
    parser.add_argument("--password", required=True, help="管理员密码")
    args = parser.parse_args()

    asyncio.run(main(args.username, args.password))
