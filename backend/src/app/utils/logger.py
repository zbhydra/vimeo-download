"""应用日志初始化与 app.log 单备份轮转。"""

import logging
import os
import shutil

from app.core.config import settings

APP_LOG_MAX_BYTES = 100 * 1024 * 1024
APP_LOG_BACKUP_SUFFIX = ".1"


class CopyTruncateFileHandler(logging.FileHandler):
    """达到大小阈值时复制一份备份，并清空当前日志文件。"""

    def __init__(
        self,
        filename: str,
        mode: str = "a",
        encoding: str | None = None,
        delay: bool = False,
        max_bytes: int = APP_LOG_MAX_BYTES,
    ) -> None:
        self.max_bytes = max_bytes
        super().__init__(filename, mode=mode, encoding=encoding, delay=delay)

    @property
    def backup_path(self) -> str:
        """返回唯一备份文件路径，保证同一日志最多保留当前文件和备份文件。"""
        return f"{self.baseFilename}{APP_LOG_BACKUP_SUFFIX}"

    def emit(self, record: logging.LogRecord) -> None:
        """写入日志后检查大小，超过阈值就 copy-truncate。"""
        super().emit(record)
        try:
            self._copy_truncate_if_needed()
        except Exception:
            self.handleError(record)

    def _copy_truncate_if_needed(self) -> None:
        """复制当前日志到备份文件，然后清空原文件。"""
        if self.max_bytes <= 0:
            return

        self.flush()
        if not os.path.exists(self.baseFilename):
            return
        if os.path.getsize(self.baseFilename) < self.max_bytes:
            return

        shutil.copy2(self.baseFilename, self.backup_path)
        if self.stream is not None:
            self.stream.seek(0)
            self.stream.truncate(0)
            self.flush()


def setup_logger(
    name: str,
    level: str | None = None,
    log_format: str | None = None,
    log_file: str | None = None,
) -> logging.Logger:
    """设置日志记录器"""

    logger = logging.getLogger(name)

    # 如果已经设置过处理器，直接返回
    if logger.handlers:
        return logger

    # 设置日志级别
    log_level = level or settings.logging.level
    logger.setLevel(getattr(logging, log_level.upper()))

    # 设置日志格式
    formatter = logging.Formatter(log_format or settings.logging.format)

    # 创建控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 创建文件处理器
    file_path = log_file or settings.logging.file
    if file_path:
        # 确保日志目录存在
        log_dir = os.path.dirname(file_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)

        file_handler = CopyTruncateFileHandler(file_path, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


# 创建默认日志记录器
logger = setup_logger("server")
