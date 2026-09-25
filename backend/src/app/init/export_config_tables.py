#!/usr/bin/env python3
"""导出 config_* 配置表的结构与数据快照。

用途：
1. 从当前数据库读取所有 config_* 表。
2. 生成可重复执行的 CREATE TABLE IF NOT EXISTS 与 INSERT IGNORE SQL。
3. 写入 `--output` 指定的路径（必填）；首次部署用的
   src/app/init/sql/config_init.sql 是手写数据初始化文件（表结构由
   sync_database_schema.py 负责），本脚本不写它。

包含敏感支付渠道配置时默认拒绝导出，避免把 bot token、client_secret
等真实密钥写入仓库。
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import json
from pathlib import Path
import re
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import close_engine, get_async_session

CONFIG_TABLE_PATTERN = "config\\_%"
CONFIG_TABLE_NAME_RE = re.compile(r"^config_[0-9A-Za-z_]+$")
IDENTIFIER_RE = re.compile(r"^[0-9A-Za-z_]+$")
SENSITIVE_CONFIG_TABLE = "config_payment_channel"
SENSITIVE_CONFIG_COLUMN = "config_json"
SENSITIVE_CONFIG_KEYS = frozenset(
    {
        "access_token",
        "api_key",
        "api_secret",
        "bot_token",
        "client_secret",
        "private_key",
        "refresh_token",
        "secret",
        "secret_key",
        "token",
        "webhook_id",
        "webhook_secret_token",
    }
)


SQLRow = tuple[object, ...]


@dataclass(frozen=True, slots=True)
class ConfigTableDump:
    """单张配置表的导出内容。"""

    #: 表名。
    table: str
    #: SHOW CREATE TABLE 返回的建表 SQL。
    create_sql: str
    #: SELECT * 返回的列名，顺序与 rows 对齐。
    columns: list[str]
    #: SELECT * 返回的数据行。
    rows: list[SQLRow]


@dataclass(frozen=True, slots=True)
class ConfigExport:
    """配置表导出结果。"""

    #: 导出的完整 SQL 内容。
    sql: str
    #: 导出的表数量。
    table_count: int
    #: 导出的数据行总数。
    row_count: int


def _quote_identifier(identifier: str) -> str:
    """把已校验的 MySQL 标识符包成反引号形式。"""

    if not IDENTIFIER_RE.fullmatch(identifier):
        raise RuntimeError(
            "export_config_tables: invalid mysql identifier from database: "
            f"identifier={identifier!r}"
        )
    return f"`{identifier}`"


def _quote_config_table(table: str) -> str:
    """校验并引用 config_* 表名。"""

    if not CONFIG_TABLE_NAME_RE.fullmatch(table):
        raise RuntimeError(
            "export_config_tables: invalid config table name from database: "
            f"table={table!r}"
        )
    return _quote_identifier(table)


def _escape(value: object) -> str:
    """把 Python 值转成 MySQL 字面量。"""

    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value.isoformat(sep=' ')}'"
    if isinstance(value, date):
        return f"'{value.isoformat()}'"
    if isinstance(value, bytes):
        return "0x" + value.hex() if value else "''"

    rendered = str(value)
    escaped = rendered.replace("\\", "\\\\").replace("'", "\\'").replace("\x00", "\\0")
    return f"'{escaped}'"


async def _fetch_config_tables(db: AsyncSession) -> list[str]:
    """读取当前库中所有 config_* 表名。"""

    result = await db.execute(
        text("SHOW TABLES LIKE :pattern"),
        {"pattern": CONFIG_TABLE_PATTERN},
    )
    return sorted(str(row[0]) for row in result.fetchall())


async def _fetch_create_table(db: AsyncSession, table: str) -> str:
    """读取单张表的 CREATE TABLE SQL。"""

    result = await db.execute(text(f"SHOW CREATE TABLE {_quote_config_table(table)}"))
    row = result.fetchone()
    if row is None:
        raise RuntimeError(
            "export_config_tables: show create table returned empty result: "
            f"table={table}"
        )
    return str(row[1])


async def _fetch_rows(db: AsyncSession, table: str) -> tuple[list[str], list[SQLRow]]:
    """读取单张表的全部数据。"""

    result = await db.execute(text(f"SELECT * FROM {_quote_config_table(table)}"))
    columns = [str(column) for column in result.keys()]
    rows = [tuple(row) for row in result.fetchall()]
    return columns, rows


def _normalize_create_table(create_sql: str) -> str:
    """去掉环境相关 AUTO_INCREMENT，并改成幂等建表语句。"""

    normalized = re.sub(r"\s+AUTO_INCREMENT=\d+", "", create_sql)
    return normalized.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1)


def _render_insert(table: str, columns: Sequence[str], rows: Sequence[SQLRow]) -> str:
    """渲染单表 INSERT IGNORE，避免初始化时覆盖已有配置。"""

    if not rows:
        return f"-- 表 {_quote_config_table(table)} 无数据\n"

    col_sql = ", ".join(_quote_identifier(column) for column in columns)
    value_lines = [
        "(" + ", ".join(_escape(value) for value in row) + ")" for row in rows
    ]
    return (
        f"INSERT IGNORE INTO {_quote_config_table(table)} ({col_sql}) VALUES\n"
        + ",\n".join(value_lines)
        + ";\n"
    )


def _find_sensitive_json_paths(value: object, prefix: str = "") -> list[str]:
    """递归找出 JSON 对象中的敏感字段路径。"""

    paths: list[str] = []
    if isinstance(value, dict):
        for raw_key, raw_child in value.items():
            key = str(raw_key)
            child_prefix = f"{prefix}.{key}" if prefix else key
            if key.lower() in SENSITIVE_CONFIG_KEYS:
                paths.append(child_prefix)
            paths.extend(_find_sensitive_json_paths(raw_child, child_prefix))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_prefix = f"{prefix}[{index}]" if prefix else f"[{index}]"
            paths.extend(_find_sensitive_json_paths(child, child_prefix))
    return paths


def _sensitive_channel_config_rows(
    columns: Sequence[str],
    rows: Sequence[SQLRow],
) -> list[str]:
    """返回支付渠道配置中包含敏感 JSON 字段的行说明。"""

    if SENSITIVE_CONFIG_COLUMN not in columns:
        return []

    config_index = columns.index(SENSITIVE_CONFIG_COLUMN)
    channel_index = columns.index("channel_code") if "channel_code" in columns else -1
    sensitive_rows: list[str] = []

    for row_number, row in enumerate(rows, start=1):
        raw_config = row[config_index]
        if not isinstance(raw_config, str) or not raw_config.strip():
            continue
        try:
            parsed: object = json.loads(raw_config)
        except json.JSONDecodeError:
            continue

        sensitive_paths = _find_sensitive_json_paths(parsed)
        if not sensitive_paths:
            continue

        channel = (
            str(row[channel_index])
            if channel_index >= 0 and row[channel_index] is not None
            else f"row#{row_number}"
        )
        sensitive_rows.append(
            f"channel_code={channel}: {', '.join(sorted(sensitive_paths))}"
        )

    return sensitive_rows


def _assert_sensitive_export_allowed(
    dump: ConfigTableDump,
    *,
    include_sensitive: bool,
) -> None:
    """默认阻止把真实渠道密钥导出到 SQL 文件。"""

    if include_sensitive or dump.table != SENSITIVE_CONFIG_TABLE:
        return

    sensitive_rows = _sensitive_channel_config_rows(dump.columns, dump.rows)
    if not sensitive_rows:
        return

    details = "; ".join(sensitive_rows)
    raise RuntimeError(
        "export_config_tables: sensitive payment channel config detected; "
        "refuse to export by default. "
        "Use --include-sensitive only for a private artifact that will not be committed. "
        f"table={dump.table}, rows={details}"
    )


def _render_dump(dump: ConfigTableDump) -> str:
    """渲染单张表的 SQL 段落。"""

    return (
        f"-- ===== {dump.table} =====\n"
        + _normalize_create_table(dump.create_sql)
        + ";\n"
        + _render_insert(dump.table, dump.columns, dump.rows)
        + "\n"
    )


async def build_config_export(*, include_sensitive: bool = False) -> ConfigExport:
    """从数据库读取 config_* 表并构建导出 SQL。

    Args:
        include_sensitive: 是否允许导出支付渠道配置中的敏感字段。

    Returns:
        ConfigExport: 完整 SQL 与导出统计。
    """

    async with get_async_session() as db:
        tables = await _fetch_config_tables(db)
        if not tables:
            raise RuntimeError("export_config_tables: no config_* tables found")

        sections = [
            "-- 自动生成：config_* 表初始化数据\n",
            "-- 由 src/app/init/export_config_tables.py 导出；请勿手工编辑\n",
            "-- 用于单次导出的配置数据快照，不应包含真实密钥\n\n",
        ]

        total_rows = 0
        for table in tables:
            create_sql = await _fetch_create_table(db, table)
            columns, rows = await _fetch_rows(db, table)
            dump = ConfigTableDump(
                table=table,
                create_sql=create_sql,
                columns=columns,
                rows=rows,
            )
            _assert_sensitive_export_allowed(
                dump,
                include_sensitive=include_sensitive,
            )
            total_rows += len(rows)
            sections.append(_render_dump(dump))
            print(f"  {table}: {len(rows)} 行")

    sql = "".join(sections).rstrip("\n") + "\n"
    return ConfigExport(sql=sql, table_count=len(tables), row_count=total_rows)


def write_config_export(export: ConfigExport, output_file: Path) -> None:
    """把导出结果写入目标 SQL 文件。"""

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(export.sql, encoding="utf-8")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。"""

    parser = argparse.ArgumentParser(description="导出 config_* 配置表初始化 SQL")
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help=(
            "输出 SQL 文件路径（必填）；不要指向 src/app/init/sql/config_init.sql，"
            "该文件是手写数据初始化文件"
        ),
    )
    parser.add_argument(
        "--include-sensitive",
        action="store_true",
        help="允许导出支付渠道 config_json 中的 token/client_secret 等敏感字段",
    )
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace) -> ConfigExport:
    """执行数据库读取部分，便于 main 统一处理退出码。"""

    try:
        return await build_config_export(include_sensitive=args.include_sensitive)
    finally:
        await close_engine()


def main(argv: Sequence[str] | None = None) -> int:
    """命令行入口。"""

    args = parse_args(argv)
    try:
        export = asyncio.run(_run(args))
        write_config_export(export, args.output)
        print(
            "导出完成: "
            f"{args.output} ({export.table_count} 表 / {export.row_count} 行)"
        )
        return 0
    except Exception as exc:
        print(f"导出失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
