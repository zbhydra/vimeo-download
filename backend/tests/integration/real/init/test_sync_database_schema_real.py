"""结构同步排序规则回归测试，依赖真实 MySQL，仅操作本次测试创建的表。"""

import pytest
from sqlalchemy import Column, Integer, String, Table, text

from app.core.database import Base, get_engine
from app.init.sync_database_schema import (
    SchemaComparator,
    SchemaSync,
    TableDiff,
    print_diff,
)


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_collation_compare_and_sync(
    real_mysql_ready, test_run_id: str, capsys: pytest.CaptureFixture[str]
) -> None:
    """相同排序规则不误报，真实差异可修复，未指定排序规则的列不受影响。"""
    table = Table(
        f"pytest_schema_collation_{test_run_id}",
        Base.metadata,
        Column("id", Integer, primary_key=True),
        Column("uid", String(32, collation="utf8mb4_bin"), nullable=False),
        Column("device_id", String(64, collation="utf8mb4_bin")),
        Column("label", String(32)),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_general_ci",
    )
    engine = get_engine()
    comparator = SchemaComparator(engine)
    sync = SchemaSync(engine)
    try:
        async with engine.begin() as conn:
            try:
                await conn.run_sync(table.create)
                result = TableDiff()
                await comparator._compare_columns(conn, table.name, result)
                assert result.column_diffs == []
                assert isinstance(table.c.uid.type, String)
                assert table.c.uid.type.collation == "utf8mb4_bin"

                await conn.execute(
                    text(
                        f"ALTER TABLE {table.name} MODIFY COLUMN uid "
                        "VARCHAR(32) COLLATE utf8mb4_general_ci NOT NULL"
                    )
                )
                await comparator._compare_columns(conn, table.name, result)
                assert len(result.column_diffs) == 1
                diff = result.column_diffs[0]
                assert diff.column_name == "uid"
                assert diff.diff_types == ("collation_mismatch",)
                assert diff.expected_collation == "utf8mb4_bin"
                assert diff.actual_collation == "utf8mb4_general_ci"
                print_diff(result)
                output = capsys.readouterr().out
                assert "排序规则不匹配" in output
                assert "类型不匹配" not in output

                sql = await sync._generate_column_sql(conn, diff)
                assert sql is not None
                assert "COLLATE utf8mb4_bin NOT NULL" in sql
                await conn.execute(text(sql))
                repaired = TableDiff()
                await comparator._compare_columns(conn, table.name, repaired)
                assert repaired.column_diffs == []
            finally:
                await conn.run_sync(
                    lambda connection: table.drop(connection, checkfirst=True)
                )
    finally:
        Base.metadata.remove(table)
