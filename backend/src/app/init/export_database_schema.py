#!/usr/bin/env python3
"""
极简数据库结构导出脚本
直接连接数据库，获取所有表结构，导出到文件
"""

import asyncio
import os

from sqlalchemy import text

from app.core.database import get_async_session
from app.utils.time import timestamp_now_datetime


async def export_database_schema():
    """导出数据库结构"""

    # 获取数据库连接
    async with get_async_session() as db:
        # 获取所有表名
        result = await db.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result.fetchall()]

        print(f"找到 {len(tables)} 个表: {', '.join(tables)}")

        # 生成导出文件名
        timestamp = timestamp_now_datetime().strftime("%Y%m%d_%H%M%S")
        export_file = os.path.join(
            os.path.dirname(__file__), f"database_schema_{timestamp}.sql"
        )

        # 写入导出文件
        with open(export_file, "w", encoding="utf-8") as f:
            f.write("-- 数据库结构导出\n")
            f.write(
                f"-- 导出时间: {timestamp_now_datetime().strftime('%Y-%m-%d %H:%M:%S')}\n"
            )
            f.write(f"-- 总表数: {len(tables)}\n\n")

            for table in tables:
                print(f"导出表结构: {table}")

                # 获取表创建语句
                result = await db.execute(text(f"SHOW CREATE TABLE `{table}`"))
                create_table_result = result.fetchone()
                create_table_sql = create_table_result[1]

                f.write(f"-- 表: {table}\n")
                f.write(f"{create_table_sql};\n\n")

        print(f"✅ 数据库结构已导出到: {export_file}")
        print(f"📊 共导出 {len(tables)} 个表")


if __name__ == "__main__":
    asyncio.run(export_database_schema())
