"""验证 app.log copy-truncate 单备份策略。"""

import logging
from pathlib import Path
import uuid

import pytest

from app.utils.logger import CopyTruncateFileHandler


def _build_file_logger(handler: logging.Handler) -> logging.Logger:
    """创建独立 logger，避免污染全局 server logger。"""
    file_logger = logging.getLogger(f"test-copy-truncate-{uuid.uuid4().hex}")
    file_logger.handlers.clear()
    file_logger.propagate = False
    file_logger.setLevel(logging.INFO)
    file_logger.addHandler(handler)
    return file_logger


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_copy_truncate_file_handler_keeps_one_backup(
    tmp_path: Path,
) -> None:
    """日志达到阈值后只保留 app.log 与 app.log.1。"""
    log_path = tmp_path / "app.log"
    backup_path = tmp_path / "app.log.1"
    handler = CopyTruncateFileHandler(
        str(log_path),
        encoding="utf-8",
        max_bytes=32,
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    file_logger = _build_file_logger(handler)

    try:
        file_logger.info("first line is long enough to rotate")
        handler.flush()

        assert log_path.read_text(encoding="utf-8") == ""
        assert backup_path.read_text(encoding="utf-8") == (
            "first line is long enough to rotate\n"
        )
        assert sorted(path.name for path in tmp_path.iterdir()) == [
            "app.log",
            "app.log.1",
        ]

        file_logger.info("second line is also long enough to rotate")
        handler.flush()

        assert log_path.read_text(encoding="utf-8") == ""
        assert backup_path.read_text(encoding="utf-8") == (
            "second line is also long enough to rotate\n"
        )
        assert sorted(path.name for path in tmp_path.iterdir()) == [
            "app.log",
            "app.log.1",
        ]
    finally:
        file_logger.removeHandler(handler)
        handler.close()
