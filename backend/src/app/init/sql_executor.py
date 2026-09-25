#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性 SQL 命令行执行工具。

所有数据库连接参数和 SQL 都由命令行传入。脚本不读取 config.yaml
或其他外部状态文件，适合部署时直接执行单条修复 SQL 或导入初始化脚本。

`config_init.sql` 这类初始化脚本包含多条语句，
PyMySQL 不支持一次提交多条语句，因此 `--file` 模式会在本地按 MySQL 语法
切分后逐条执行；切分只做语法边界识别，不改写任何 SQL 内容。
"""

import argparse
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


@dataclass(frozen=True, slots=True)
class DatabaseOptions:
    """数据库连接参数。"""

    host: str
    port: int
    user: str
    password: str
    database: str


@dataclass(frozen=True, slots=True)
class SQLExecutionResult:
    """SQL 执行结果。"""

    rows: list[dict[str, Any]]
    rowcount: int
    returns_rows: bool


def _to_execution_result(result: Any) -> SQLExecutionResult:
    """把 SQLAlchemy CursorResult 转成执行结果。"""

    if result.returns_rows:
        return SQLExecutionResult(
            rows=[dict(row._mapping) for row in result],
            rowcount=result.rowcount,
            returns_rows=True,
        )
    return SQLExecutionResult(
        rows=[],
        rowcount=result.rowcount,
        returns_rows=False,
    )


def split_sql_statements(script: str) -> list[str]:
    """按 MySQL 语法把脚本切分成单条语句。

    跳过 `-- ` 行注释、`#` 行注释与 `/* */` 块注释；单引号、双引号和
    反引号内的分号不作为语句分隔符，并正确处理反斜杠转义与成对引号。

    Args:
        script: 可能包含多条语句的 SQL 脚本。

    Returns:
        list[str]: 去空白后的非空语句，顺序与脚本一致。
    """

    statements: list[str] = []
    buffer: list[str] = []
    index = 0
    length = len(script)

    while index < length:
        char = script[index]
        following = script[index + 1] if index + 1 < length else ""

        if char == "#" or (
            char == "-"
            and following == "-"
            and (index + 2 >= length or script[index + 2].isspace())
        ):
            while index < length and script[index] != "\n":
                index += 1
            continue
        if char == "/" and following == "*":
            comment_end = script.find("*/", index + 2)
            index = length if comment_end < 0 else comment_end + 2
            continue
        if char in "'\"`":
            buffer.append(char)
            index += 1
            while index < length:
                inner = script[index]
                if inner == "\\" and char != "`":
                    buffer.append(script[index : index + 2])
                    index += 2
                    continue
                buffer.append(inner)
                index += 1
                if inner != char:
                    continue
                # 成对引号是转义后的引号字符，字符串没有结束。
                if index < length and script[index] == char:
                    buffer.append(char)
                    index += 1
                    continue
                break
            continue
        if char == ";":
            statements.append("".join(buffer).strip())
            buffer = []
            index += 1
            continue
        buffer.append(char)
        index += 1

    statements.append("".join(buffer).strip())
    return [statement for statement in statements if statement]


class SQLExecutor:
    """按命令行参数连接 MySQL 并执行一条 SQL。"""

    def __init__(self, database_options: DatabaseOptions) -> None:
        """初始化执行器。

        Args:
            database_options: MySQL 连接参数。
        """

        self.database_options = database_options

    def execute(self, sql: str) -> SQLExecutionResult:
        """执行一条 SQL。

        Args:
            sql: 要执行的 SQL 语句。

        Returns:
            SQLExecutionResult: 查询行或影响行数。
        """

        statement = sql.strip()
        if not statement:
            raise ValueError("SQL 不能为空")

        engine = self._create_engine()
        try:
            with engine.begin() as connection:
                return _to_execution_result(connection.exec_driver_sql(statement))
        finally:
            engine.dispose()

    def execute_script(self, script: str) -> list[SQLExecutionResult]:
        """在同一个连接内依次执行脚本中的每条语句。

        调用方负责保证脚本可重复执行（例如 CREATE TABLE IF NOT EXISTS 与
        INSERT IGNORE），本方法不做去重或事务补偿。

        Args:
            script: 包含一条或多条语句的 SQL 脚本。

        Returns:
            list[SQLExecutionResult]: 每条语句的执行结果，顺序与脚本一致。
        """

        statements = split_sql_statements(script)
        if not statements:
            raise ValueError("SQL 脚本没有任何可执行语句")

        engine = self._create_engine()
        try:
            with engine.begin() as connection:
                return [
                    _to_execution_result(connection.exec_driver_sql(statement))
                    for statement in statements
                ]
        finally:
            engine.dispose()

    def _create_engine(self) -> Engine:
        """创建 MySQL SQLAlchemy engine。"""

        options = self.database_options
        connection_string = (
            "mysql+pymysql://"
            f"{quote_plus(options.user)}:{quote_plus(options.password)}"
            f"@{options.host}:{options.port}/{options.database}"
            "?charset=utf8mb4"
        )
        return create_engine(connection_string)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。"""

    parser = argparse.ArgumentParser(description="执行 MySQL SQL 或 SQL 脚本文件")
    parser.add_argument("--host", required=True, help="MySQL host")
    parser.add_argument("--port", type=int, default=3306, help="MySQL port")
    parser.add_argument("--user", required=True, help="MySQL user")
    parser.add_argument("--password", required=True, help="MySQL password")
    parser.add_argument("--database", required=True, help="MySQL database")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--sql", help="要执行的单条 SQL")
    source.add_argument(
        "--file",
        type=Path,
        help="要执行的 SQL 脚本文件路径，按语句切分后逐条执行",
    )
    return parser.parse_args(argv)


def print_result(result: SQLExecutionResult) -> None:
    """打印 SQL 执行结果。"""

    if result.returns_rows:
        print(f"查询完成: rows={len(result.rows)}")
        for row in result.rows:
            print(row)
        return

    print(f"执行完成: rowcount={result.rowcount}")


def main(argv: list[str] | None = None) -> int:
    """命令行入口。"""

    args = parse_args(argv)
    options = DatabaseOptions(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        database=args.database,
    )
    try:
        executor = SQLExecutor(options)
        if args.file is not None:
            for result in executor.execute_script(
                args.file.read_text(encoding="utf-8")
            ):
                print_result(result)
            return 0
        result = executor.execute(args.sql)
        print_result(result)
        return 0
    except Exception as exc:
        print(f"执行失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
