"""数据库结构同步脚本测试。"""

import pytest

from app.core.database import get_engine
from app.init.sync_database_schema import (
    ColumnDiff,
    ColumnInfo,
    IndexDiff,
    SchemaComparator,
    SchemaSync,
    TableDiff,
)
from app.models.order_model import OrderModel  # noqa: F401
from app.models.user_model import UserModel  # noqa: F401


@pytest.mark.asyncio
async def test_generate_column_sql_uses_model_nullable_for_missing_column(monkeypatch):
    """新增列 SQL 必须按模型生成 nullable 与注释。"""
    sync = SchemaSync(get_engine())

    async def no_old_primary_key(conn, table_name: str, column_name: str):
        return None

    monkeypatch.setattr(sync, "_find_old_primary_key_column", no_old_primary_key)

    not_null_sql = await sync._generate_column_sql(
        None,
        ColumnDiff(
            table_name="orders",
            column_name="amount",
            expected_type="BIGINT",
            actual_type=None,
            diff_types=("missing",),
        ),
    )
    nullable_sql = await sync._generate_column_sql(
        None,
        ColumnDiff(
            table_name="orders",
            column_name="paid_amount",
            expected_type="BIGINT",
            actual_type=None,
            diff_types=("missing",),
        ),
    )

    assert not_null_sql == (
        "ALTER TABLE orders ADD COLUMN amount BIGINT NOT NULL "
        "COMMENT '订单金额，统一 6 位精度整数'"
    )
    assert nullable_sql == (
        "ALTER TABLE orders ADD COLUMN paid_amount BIGINT "
        "COMMENT '渠道回调支付金额，统一 6 位精度整数'"
    )


@pytest.mark.asyncio
async def test_generate_column_sql_uses_model_nullable_for_nullable_mismatch():
    """修复 nullable 差异时必须按模型生成完整列定义。"""
    sync = SchemaSync(get_engine())

    sql = await sync._generate_column_sql(
        None,
        ColumnDiff(
            table_name="orders",
            column_name="amount",
            expected_type="BIGINT",
            actual_type="bigint",
            diff_types=("nullable_mismatch",),
        ),
    )

    assert sql == (
        "ALTER TABLE orders MODIFY COLUMN amount BIGINT NOT NULL "
        "COMMENT '订单金额，统一 6 位精度整数'"
    )


@pytest.mark.asyncio
async def test_generate_column_sql_handles_comment_mismatch():
    """修复注释差异时必须生成 MODIFY COLUMN。"""
    sync = SchemaSync(get_engine())

    sql = await sync._generate_column_sql(
        None,
        ColumnDiff(
            table_name="orders",
            column_name="amount",
            expected_type="BIGINT",
            actual_type="bigint",
            diff_types=("comment_mismatch",),
            expected_comment="订单金额，统一 6 位精度整数",
            actual_comment="",
        ),
    )

    assert sql == (
        "ALTER TABLE orders MODIFY COLUMN amount BIGINT NOT NULL "
        "COMMENT '订单金额，统一 6 位精度整数'"
    )


@pytest.mark.asyncio
async def test_generate_column_sql_uses_full_definition_for_primary_key_rename(
    monkeypatch,
):
    """主键列重命名时必须保留 AUTO_INCREMENT 与注释。"""
    sync = SchemaSync(get_engine())

    async def old_primary_key(conn, table_name: str, column_name: str):
        return "old_id"

    monkeypatch.setattr(sync, "_find_old_primary_key_column", old_primary_key)

    sql = await sync._generate_column_sql(
        None,
        ColumnDiff(
            table_name="orders",
            column_name="id",
            expected_type="BIGINT",
            actual_type=None,
            diff_types=("missing",),
        ),
    )

    assert sql == (
        "ALTER TABLE orders CHANGE COLUMN old_id id BIGINT NOT NULL "
        "COMMENT '订单ID' AUTO_INCREMENT"
    )


@pytest.mark.asyncio
async def test_compare_columns_reports_comment_mismatch(monkeypatch):
    """数据库注释与模型不一致时必须产生列差异。"""
    comparator = SchemaComparator(get_engine())
    result = TableDiff()

    monkeypatch.setattr(
        comparator,
        "_get_model_columns",
        lambda table_name: {
            "amount": ColumnInfo(
                name="amount",
                type="BIGINT",
                nullable=False,
                primary_key=False,
                comment="订单金额，统一 6 位精度整数",
            )
        },
    )

    async def get_db_columns(conn, table_name: str):
        return {
            "amount": ColumnInfo(
                name="amount",
                type="bigint",
                nullable=False,
                primary_key=False,
                comment="",
            )
        }

    monkeypatch.setattr(comparator, "_get_db_columns", get_db_columns)

    await comparator._compare_columns(None, "orders", result)

    assert len(result.column_diffs) == 1
    diff = result.column_diffs[0]
    assert diff.diff_type == "comment_mismatch"
    assert diff.diff_types == ("comment_mismatch",)
    assert diff.expected_comment == "订单金额，统一 6 位精度整数"
    assert diff.actual_comment == ""


@pytest.mark.asyncio
async def test_compare_columns_merges_multiple_diffs_for_one_column(monkeypatch):
    """同一列多种差异必须合并，最终只执行一次完整 MODIFY。"""
    comparator = SchemaComparator(get_engine())
    result = TableDiff()

    monkeypatch.setattr(
        comparator,
        "_get_model_columns",
        lambda table_name: {
            "amount": ColumnInfo(
                name="amount",
                type="BIGINT",
                nullable=False,
                primary_key=False,
                comment="订单金额，统一 6 位精度整数",
            )
        },
    )

    async def get_db_columns(conn, table_name: str):
        return {
            "amount": ColumnInfo(
                name="amount",
                type="int",
                nullable=True,
                primary_key=False,
                comment="",
            )
        }

    monkeypatch.setattr(comparator, "_get_db_columns", get_db_columns)

    await comparator._compare_columns(None, "orders", result)

    assert len(result.column_diffs) == 1
    assert result.column_diffs[0].diff_types == (
        "type_mismatch",
        "nullable_mismatch",
        "comment_mismatch",
    )


def test_normalize_type_treats_mysql_tinyint_one_as_bool():
    """MySQL Boolean 反射为 TINYINT(1)，不应被误报为类型差异。"""
    engine = get_engine()
    comparator = SchemaComparator(engine)
    sync = SchemaSync(engine)

    assert comparator._normalize_type("TINYINT(1)") == "BOOL"  # noqa: SLF001
    assert sync._normalize_type("TINYINT(1)") == "BOOL"  # noqa: SLF001


def test_generate_index_sql_creates_unique_index():
    """唯一索引缺失时必须生成 CREATE UNIQUE INDEX。"""
    sync = SchemaSync(get_engine())

    sqls = sync._generate_index_sql(
        IndexDiff(
            table_name="admins",
            index_name="uk_admins_api_key_hash",
            diff_type="missing",
            expected_columns=["api_key_hash"],
            expected_unique=True,
        )
    )

    assert sqls == [
        "CREATE UNIQUE INDEX uk_admins_api_key_hash ON admins (api_key_hash)"
    ]


def test_get_model_indexes_includes_unique_column_constraints():
    """列级 unique 约束也必须进入索引对比，避免漏删同列普通索引。"""
    comparator = SchemaComparator(get_engine())

    user_indexes = comparator._get_model_indexes("users")  # noqa: SLF001
    order_indexes = comparator._get_model_indexes("orders")  # noqa: SLF001

    assert user_indexes["email"] == {
        "name": "email",
        "columns": ["email"],
        "unique": True,
    }
    assert "idx_email" not in user_indexes
    assert order_indexes["order_no"] == {
        "name": "order_no",
        "columns": ["order_no"],
        "unique": True,
    }


def test_generate_index_sql_rebuilds_index_when_unique_differs():
    """同名索引 unique 属性不一致时必须重建。"""
    sync = SchemaSync(get_engine())

    sqls = sync._generate_index_sql(
        IndexDiff(
            table_name="admins",
            index_name="uk_admins_api_key_hash",
            diff_type="columns_mismatch",
            expected_columns=["api_key_hash"],
            expected_unique=True,
            actual_columns=["api_key_hash"],
            actual_unique=False,
        )
    )

    assert sqls == [
        "DROP INDEX uk_admins_api_key_hash ON admins",
        "CREATE UNIQUE INDEX uk_admins_api_key_hash ON admins (api_key_hash)",
    ]


def test_generate_index_sql_drops_redundant_non_unique_index():
    """同列唯一索引覆盖普通索引时必须删除普通重复索引。"""
    sync = SchemaSync(get_engine())

    sqls = sync._generate_index_sql(
        IndexDiff(
            table_name="admins",
            index_name="idx_admins_api_key_hash",
            diff_type="redundant_non_unique",
            actual_columns=["api_key_hash"],
            actual_unique=False,
        )
    )

    assert sqls == ["DROP INDEX idx_admins_api_key_hash ON admins"]


@pytest.mark.asyncio
async def test_compare_indexes_replaces_four_dimension_subscription_price_key(
    monkeypatch,
):
    """四维价格唯一键必须被二维数据完整性约束替代。"""

    comparator = SchemaComparator(get_engine())
    result = TableDiff()
    monkeypatch.setattr(
        comparator,
        "_get_model_indexes",
        lambda table_name: {
            "uk_config_subscription_product_price_product_channel": {
                "name": "uk_config_subscription_product_price_product_channel",
                "columns": ["product_id", "channel_code"],
                "unique": True,
            }
        },
    )

    class FakeInspector:
        def get_indexes(self, table_name: str):
            return [
                {
                    "name": "uk_sub_price_product_channel_renew_period",
                    "column_names": [
                        "product_id",
                        "channel_code",
                        "auto_renew",
                        "period",
                    ],
                    "unique": True,
                }
            ]

    class FakeConnection:
        async def run_sync(self, callback):
            return callback(object())

    monkeypatch.setattr(
        "app.init.sync_database_schema.inspect", lambda connection: FakeInspector()
    )

    await comparator._compare_indexes(
        FakeConnection(), "config_subscription_product_price", result
    )

    assert [(item.index_name, item.diff_type) for item in result.index_diffs] == [
        (
            "uk_config_subscription_product_price_product_channel",
            "missing",
        ),
        (
            "uk_sub_price_product_channel_renew_period",
            "obsolete_unique_extension",
        ),
    ]
    assert SchemaSync(get_engine())._generate_index_sql(result.index_diffs[1]) == [
        "DROP INDEX uk_sub_price_product_channel_renew_period "
        "ON config_subscription_product_price"
    ]


@pytest.mark.asyncio
async def test_compare_indexes_keeps_online_two_dimension_subscription_price_key(
    monkeypatch,
):
    """线上二维起点已有目标唯一键时不产生索引差异。"""

    comparator = SchemaComparator(get_engine())
    result = TableDiff()
    monkeypatch.setattr(
        comparator,
        "_get_model_indexes",
        lambda table_name: {
            "uk_config_subscription_product_price_product_channel": {
                "name": "uk_config_subscription_product_price_product_channel",
                "columns": ["product_id", "channel_code"],
                "unique": True,
            }
        },
    )

    class FakeInspector:
        def get_indexes(self, table_name: str):
            return [
                {
                    "name": "uk_config_subscription_product_price_product_channel",
                    "column_names": ["product_id", "channel_code"],
                    "unique": True,
                }
            ]

    class FakeConnection:
        async def run_sync(self, callback):
            return callback(object())

    monkeypatch.setattr(
        "app.init.sync_database_schema.inspect", lambda connection: FakeInspector()
    )

    await comparator._compare_indexes(
        FakeConnection(), "config_subscription_product_price", result
    )

    assert result.index_diffs == []


@pytest.mark.asyncio
async def test_subscription_price_duplicate_precheck_blocks_sync_before_ddl():
    """sync 必须在二维重复预检失败时不执行任何 DDL。"""

    class Result:
        def first(self):
            return ("unlimited", "paypal", 2)

    class Connection:
        def __init__(self):
            self.ddl_sqls = []

        async def execute(self, statement):
            sql = str(statement)
            if not sql.startswith("SELECT product_id, channel_code"):
                self.ddl_sqls.append(sql)
            return Result()

    class BeginContext:
        def __init__(self, connection):
            self.connection = connection

        async def __aenter__(self):
            return self.connection

        async def __aexit__(self, exc_type, exc, traceback):
            return None

    class Engine:
        def __init__(self, connection):
            self.connection = connection

        def begin(self):
            return BeginContext(self.connection)

    connection = Connection()
    sync = SchemaSync(Engine(connection))
    diff = TableDiff(
        column_diffs=[
            ColumnDiff(
                "config_subscription_product_price",
                "period",
                "",
                "varchar(16)",
                ("removed",),
            )
        ],
        index_diffs=[
            IndexDiff(
                "config_subscription_product_price",
                "uk_sub_price_product_channel_renew_period",
                "obsolete_unique_extension",
            )
        ],
    )

    with pytest.raises(RuntimeError, match="product_id=unlimited.*channel_code=paypal"):
        await sync.sync(diff)

    assert connection.ddl_sqls == []


@pytest.mark.asyncio
async def test_subscription_price_sync_installs_two_dimension_key_before_drops(
    monkeypatch,
):
    """四维起点先建立二维唯一键，再删除四维键与身份列。"""

    class Result:
        def first(self):
            return None

    class Connection:
        def __init__(self):
            self.sqls = []

        async def execute(self, statement):
            sql = str(statement)
            if not sql.startswith("SELECT product_id, channel_code"):
                self.sqls.append(sql)
            return Result()

    class BeginContext:
        def __init__(self, connection):
            self.connection = connection

        async def __aenter__(self):
            return self.connection

        async def __aexit__(self, exc_type, exc, traceback):
            return None

    class Engine:
        def __init__(self, connection):
            self.connection = connection

        def begin(self):
            return BeginContext(self.connection)

    connection = Connection()
    sync = SchemaSync(Engine(connection))
    monkeypatch.setattr(
        sync,
        "_generate_column_sql",
        lambda conn, diff: _column_sql(diff),
    )

    async def _column_sql(diff):
        return f"ALTER TABLE {diff.table_name} DROP COLUMN {diff.column_name}"

    diff = TableDiff(
        column_diffs=[
            ColumnDiff(
                "config_subscription_product_price",
                "auto_renew",
                "",
                "tinyint(1)",
                ("removed",),
            ),
            ColumnDiff(
                "config_subscription_product_price",
                "period",
                "",
                "varchar(16)",
                ("removed",),
            ),
        ],
        index_diffs=[
            IndexDiff(
                "config_subscription_product_price",
                "uk_config_subscription_product_price_product_channel",
                "missing",
                ["product_id", "channel_code"],
                True,
            ),
            IndexDiff(
                "config_subscription_product_price",
                "uk_sub_price_product_channel_renew_period",
                "obsolete_unique_extension",
            ),
        ],
    )

    await sync.sync(diff)

    assert connection.sqls == [
        "CREATE UNIQUE INDEX uk_config_subscription_product_price_product_channel "
        "ON config_subscription_product_price (product_id, channel_code)",
        "DROP INDEX uk_sub_price_product_channel_renew_period "
        "ON config_subscription_product_price",
        "ALTER TABLE config_subscription_product_price DROP COLUMN auto_renew",
        "ALTER TABLE config_subscription_product_price DROP COLUMN period",
    ]


async def test_compare_columns_emits_drop_for_declared_users_tg_user_id(monkeypatch):
    """users 表声明删除的 tg_user_id 生成 DROP COLUMN，且模型已不再定义该列。"""

    comparator = SchemaComparator(get_engine())
    sync = SchemaSync(get_engine())
    db_columns = {
        "user_id": ColumnInfo(
            name="user_id",
            type="BIGINT",
            nullable=False,
            primary_key=True,
            comment="",
        ),
        "tg_user_id": ColumnInfo(
            name="tg_user_id",
            type="BIGINT",
            nullable=True,
            primary_key=False,
            comment="Telegram 账号 ID（明文；无 access_hash 取不到任何用户信息）",
        ),
    }

    async def fake_db_columns(conn, table_name: str) -> dict[str, ColumnInfo]:
        assert table_name == "users"
        return db_columns

    monkeypatch.setattr(comparator, "_get_db_columns", fake_db_columns)

    assert comparator._get_model_drop_columns("users") == ("tg_user_id",)
    assert "tg_user_id" not in comparator._get_model_columns("users")

    diff = TableDiff()
    await comparator._compare_columns(None, "users", diff)

    removed = [item for item in diff.column_diffs if item.column_name == "tg_user_id"]
    assert len(removed) == 1
    assert removed[0].diff_types == ("removed",)
    assert removed[0].actual_type == "BIGINT"
    assert (
        await sync._generate_column_sql(None, removed[0])
        == "ALTER TABLE users DROP COLUMN tg_user_id"
    )
