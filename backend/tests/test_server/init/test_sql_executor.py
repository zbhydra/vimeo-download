"""SQL 命令行执行器测试。"""

from typing import Any
from typing import Literal

import pytest

from app.init import sql_executor
from app.init.sql_executor import DatabaseOptions, SQLExecutor


class _FakeRow:
    """模拟 SQLAlchemy Row。"""

    def __init__(self, data: dict[str, Any]) -> None:
        self._mapping = data


class _FakeResult:
    """模拟 SQLAlchemy Result。"""

    def __init__(
        self,
        *,
        returns_rows: bool,
        rowcount: int,
        rows: list[dict[str, Any]] | None = None,
    ) -> None:
        self.returns_rows = returns_rows
        self.rowcount = rowcount
        self._rows = rows or []

    def __iter__(self):
        """按 SQLAlchemy Row 形态迭代。"""

        return iter([_FakeRow(row) for row in self._rows])


class _FakeConnection:
    """模拟 SQLAlchemy Connection。"""

    def __init__(self, result: _FakeResult) -> None:
        self.result = result
        self.executed_sql: str | None = None
        self.executed_statements: list[str] = []

    def exec_driver_sql(self, statement: str):
        """记录 SQL 并返回预设结果。"""

        self.executed_sql = statement
        self.executed_statements.append(statement)
        return self.result


class _FakeTransaction:
    """模拟 engine.begin() context manager。"""

    def __init__(self, connection: _FakeConnection) -> None:
        self.connection = connection

    def __enter__(self) -> _FakeConnection:
        return self.connection

    def __exit__(self, exc_type, exc, traceback) -> Literal[False]:
        return False


class _FakeEngine:
    """模拟 SQLAlchemy Engine。"""

    def __init__(self, connection: _FakeConnection) -> None:
        self.connection = connection
        self.disposed = False

    def begin(self) -> _FakeTransaction:
        """返回事务上下文。"""

        return _FakeTransaction(self.connection)

    def dispose(self) -> None:
        """记录 engine 已释放。"""

        self.disposed = True


def test_execute_update_uses_cli_options_and_disposes_engine(monkeypatch):
    """执行器只使用传入的 DB 参数和 SQL。"""

    result = _FakeResult(returns_rows=False, rowcount=3)
    connection = _FakeConnection(result)
    engine = _FakeEngine(connection)
    created_urls: list[str] = []

    def fake_create_engine(url: str):
        created_urls.append(url)
        return engine

    monkeypatch.setattr(sql_executor, "create_engine", fake_create_engine)

    execution_result = SQLExecutor(
        DatabaseOptions(
            host="127.0.0.1",
            port=3307,
            user="tg user",
            password="p@ss/word",
            database="vimeo_download",
        )
    ).execute(" UPDATE demo_table SET enabled = 1 ")

    assert created_urls == [
        "mysql+pymysql://tg+user:p%40ss%2Fword@127.0.0.1:3307/vimeo_download?charset=utf8mb4"
    ]
    assert "UPDATE demo_table SET enabled = 1" in (connection.executed_sql or "")
    assert execution_result.rowcount == 3
    assert execution_result.returns_rows is False
    assert engine.disposed is True


def test_execute_select_returns_rows(monkeypatch):
    """SELECT 结果会以 dict 列表返回。"""

    result = _FakeResult(
        returns_rows=True,
        rowcount=2,
        rows=[{"id": 1, "name": "free"}, {"id": 2, "name": "unlimited"}],
    )
    connection = _FakeConnection(result)
    engine = _FakeEngine(connection)
    monkeypatch.setattr(sql_executor, "create_engine", lambda _url: engine)

    execution_result = SQLExecutor(
        DatabaseOptions(
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="vimeo_download",
        )
    ).execute("SELECT id, name FROM config_subscription_product")

    assert execution_result.returns_rows is True
    assert execution_result.rows == [
        {"id": 1, "name": "free"},
        {"id": 2, "name": "unlimited"},
    ]


def test_execute_keeps_json_colon_as_raw_sql(monkeypatch):
    """JSON 文本里的冒号不能被解析成 SQLAlchemy bind 参数。"""

    result = _FakeResult(returns_rows=False, rowcount=1)
    connection = _FakeConnection(result)
    engine = _FakeEngine(connection)
    monkeypatch.setattr(sql_executor, "create_engine", lambda _url: engine)

    SQLExecutor(
        DatabaseOptions(
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="vimeo_download",
        )
    ).execute("""INSERT INTO demo (metadata) VALUES ('{"limit":10}')""")

    assert connection.executed_sql == (
        """INSERT INTO demo (metadata) VALUES ('{"limit":10}')"""
    )


def test_execute_rejects_empty_sql():
    """空 SQL 直接报错，不连接数据库。"""

    executor = SQLExecutor(
        DatabaseOptions(
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="vimeo_download",
        )
    )

    with pytest.raises(ValueError, match="SQL 不能为空"):
        executor.execute("  ")


def test_main_executes_sql_from_cli(monkeypatch, capsys):
    """main 从命令行参数构造执行器并打印结果。"""

    received_options: list[DatabaseOptions] = []
    received_sql: list[str] = []

    class FakeExecutor:
        """替换真实执行器，避免测试连接数据库。"""

        def __init__(self, options: DatabaseOptions) -> None:
            received_options.append(options)

        def execute(self, sql: str):
            received_sql.append(sql)
            return sql_executor.SQLExecutionResult(
                rows=[],
                rowcount=1,
                returns_rows=False,
            )

    monkeypatch.setattr(sql_executor, "SQLExecutor", FakeExecutor)

    exit_code = sql_executor.main(
        [
            "--host",
            "db.example.com",
            "--port",
            "3308",
            "--user",
            "vimeo_download",
            "--password",
            "secret",
            "--database",
            "vimeo_download",
            "--sql",
            "SELECT 1",
        ]
    )

    assert exit_code == 0
    assert received_options == [
        DatabaseOptions(
            host="db.example.com",
            port=3308,
            user="vimeo_download",
            password="secret",
            database="vimeo_download",
        )
    ]
    assert received_sql == ["SELECT 1"]
    assert "执行完成: rowcount=1" in capsys.readouterr().out


def test_split_sql_statements_ignores_comments_and_quoted_semicolons():
    """注释与引号内的分号不得被当成语句分隔符。"""

    script = """
    -- 行注释里的分号 ; 无效
    CREATE TABLE IF NOT EXISTS `config_public` (
      `c_key` varchar(64) NOT NULL
    );
    # 井号注释里的分号 ; 也无效
    INSERT IGNORE INTO `config_public` (`c_key`, `g_value`) VALUES
    ('a', 'x;y'),
    ('b', 'it\\'s ok'),
    ('c', 'quote''d'),
    /* 块注释里的分号 ; 依然无效 */
    ('d', 'back `tick`');
    """

    statements = sql_executor.split_sql_statements(script)

    assert len(statements) == 2
    assert statements[0].startswith("CREATE TABLE IF NOT EXISTS")
    assert statements[1].startswith("INSERT IGNORE INTO")
    assert "'x;y'" in statements[1]
    assert "'it\\'s ok'" in statements[1]
    assert "'quote''d'" in statements[1]


def test_split_sql_statements_drops_empty_and_unterminated_tail():
    """空脚本返回空列表；末句没有分号时仍作为一条语句返回。"""

    assert sql_executor.split_sql_statements("  \n-- 只有注释 ;\n") == []
    assert sql_executor.split_sql_statements("SELECT 1") == ["SELECT 1"]


def test_execute_script_runs_each_split_statement_on_one_connection(monkeypatch):
    """脚本按语句逐条执行，并复用同一个连接。"""

    result = _FakeResult(returns_rows=False, rowcount=0)
    connection = _FakeConnection(result)
    engine = _FakeEngine(connection)
    monkeypatch.setattr(sql_executor, "create_engine", lambda _url: engine)

    results = SQLExecutor(
        DatabaseOptions(
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="vimeo_download",
        )
    ).execute_script("SELECT 1;\nSELECT 2;")

    assert connection.executed_statements == ["SELECT 1", "SELECT 2"]
    assert len(results) == 2
    assert engine.disposed is True


def test_execute_script_rejects_script_without_statement():
    """只有注释的脚本直接报错，不连接数据库。"""

    executor = SQLExecutor(
        DatabaseOptions(
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="vimeo_download",
        )
    )

    with pytest.raises(ValueError, match="没有任何可执行语句"):
        executor.execute_script("-- 无语句 ;\n")


def test_main_executes_sql_file_from_cli(monkeypatch, capsys, tmp_path):
    """main 在 --file 模式读取脚本并逐条执行。"""

    received_sql: list[str] = []
    script_file = tmp_path / "config_init.sql"
    script_file.write_text("SELECT 1;\nSELECT 2;\n", encoding="utf-8")

    class FakeExecutor:
        """替换真实执行器，避免测试连接数据库。"""

        def __init__(self, options: DatabaseOptions) -> None:
            assert options.database == "vimeo_download"

        def execute_script(self, script: str):
            received_sql.append(script)
            return [
                sql_executor.SQLExecutionResult(
                    rows=[],
                    rowcount=1,
                    returns_rows=False,
                )
            ]

    monkeypatch.setattr(sql_executor, "SQLExecutor", FakeExecutor)

    exit_code = sql_executor.main(
        [
            "--host",
            "db.example.com",
            "--user",
            "root",
            "--password",
            "secret",
            "--database",
            "vimeo_download",
            "--file",
            str(script_file),
        ]
    )

    assert exit_code == 0
    assert received_sql == ["SELECT 1;\nSELECT 2;\n"]
    assert "执行完成: rowcount=1" in capsys.readouterr().out
