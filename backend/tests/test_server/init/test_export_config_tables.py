"""配置表导出脚本测试。

导出工具只在人工运维时连接真实数据库；单元测试只覆盖 SQL 渲染、
敏感字段拦截等纯函数逻辑，避免污染 config_* 真实配置。
"""

from datetime import date, datetime
from decimal import Decimal

import pytest

from app.init.export_config_tables import (
    ConfigTableDump,
    _assert_sensitive_export_allowed,
    _escape,
    _normalize_create_table,
    _render_insert,
)


def test_escape_mysql_literals() -> None:
    """Python 值会被渲染成可写入 MySQL 的字面量。"""

    assert _escape(None) == "NULL"
    assert _escape(True) == "1"
    assert _escape(False) == "0"
    assert _escape(Decimal("12.34")) == "12.34"
    assert _escape(datetime(2026, 1, 2, 3, 4, 5)) == "'2026-01-02 03:04:05'"
    assert _escape(date(2026, 1, 2)) == "'2026-01-02'"
    assert _escape(b"\x00\xff") == "0x00ff"
    assert _escape("") == "''"
    assert _escape("a\\b'c\x00") == "'a\\\\b\\'c\\0'"


def test_normalize_create_table_removes_auto_increment() -> None:
    """导出的建表 SQL 不携带环境相关 AUTO_INCREMENT 值。"""

    create_sql = (
        "CREATE TABLE `config_public` ("
        "`c_key` varchar(100) NOT NULL"
        ") ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4"
    )

    assert _normalize_create_table(create_sql) == (
        "CREATE TABLE IF NOT EXISTS `config_public` ("
        "`c_key` varchar(100) NOT NULL"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    )


def test_render_insert_uses_ignore_and_escaped_values() -> None:
    """数据行用 INSERT IGNORE 渲染，已存在配置不被覆盖。"""

    sql = _render_insert(
        "config_public",
        ["c_key", "g_value"],
        [("site_name", '{"name":"Hydra"}'), ("quote", "it's ok")],
    )

    assert sql == (
        "INSERT IGNORE INTO `config_public` (`c_key`, `g_value`) VALUES\n"
        "('site_name', '{\"name\":\"Hydra\"}'),\n"
        "('quote', 'it\\'s ok');\n"
    )


def test_render_insert_empty_rows() -> None:
    """空表只输出提示注释。"""

    assert _render_insert("config_public", ["c_key"], []) == (
        "-- 表 `config_public` 无数据\n"
    )


def test_sensitive_payment_channel_config_rejected_by_default() -> None:
    """支付渠道 JSON 含密钥字段时默认拒绝落盘。"""

    dump = ConfigTableDump(
        table="config_payment_channel",
        create_sql="CREATE TABLE `config_payment_channel` (`id` bigint)",
        columns=["channel_code", "config_json"],
        rows=[
            (
                "clink",
                '{"token":"bot-token","nested":{"webhook_secret_token":"secret"}}',
            )
        ],
    )

    with pytest.raises(RuntimeError, match="sensitive payment channel config"):
        _assert_sensitive_export_allowed(dump, include_sensitive=False)


def test_sensitive_payment_channel_config_can_be_explicitly_allowed() -> None:
    """私有产物场景可显式允许导出敏感渠道配置。"""

    dump = ConfigTableDump(
        table="config_payment_channel",
        create_sql="CREATE TABLE `config_payment_channel` (`id` bigint)",
        columns=["channel_code", "config_json"],
        rows=[("clink", '{"token":"bot-token"}')],
    )

    _assert_sensitive_export_allowed(dump, include_sensitive=True)
