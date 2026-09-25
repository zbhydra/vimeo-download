"""进程内用户活跃媒体下载计数服务。

只服务当前进程的 active-limited Provider，进程重启后自然清空。
"""

from __future__ import annotations

from dataclasses import dataclass

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode


@dataclass(slots=True)
class ActiveDownloadGuard:
    """一次活跃下载占位，release 可重复调用。"""

    _service: "MediaActiveDownloadService"
    _user_key: str
    _released: bool = False

    def release(self) -> None:
        """释放本次下载占位；重复调用安全。"""
        if self._released:
            return
        self._released = True
        self._service.release(self._user_key)


class MediaActiveDownloadService:
    """进程内用户活跃下载上限服务。"""

    def __init__(self) -> None:
        """初始化内存计数器。"""
        self._active_counts: dict[str, int] = {}

    def acquire(self, user_key: str, limit: int) -> ActiveDownloadGuard:
        """
        获取用户活跃下载 guard。

        Args:
            user_key: 用户维度 key，例如 user:123。
            limit: 已验签 token 中的活跃下载上限。

        Returns:
            幂等 release 的 guard。
        """
        count = self._active_counts.get(user_key, 0)
        if count >= limit:
            raise AppCommonException(
                CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
                ext_msg=(
                    "media_active_download.acquire: active download limit exceeded, "
                    f"user_key={user_key}, active_count={count}, "
                    f"limit={limit}"
                ),
                data={"reason": "active_download_limit_exceeded"},
            )
        self._active_counts[user_key] = count + 1
        return ActiveDownloadGuard(self, user_key)

    def release(self, user_key: str) -> None:
        """释放用户活跃下载计数；重复释放不会减成负数。"""
        count = self._active_counts.get(user_key, 0)
        if count <= 1:
            self._active_counts.pop(user_key, None)
            return
        self._active_counts[user_key] = count - 1

    def active_count(self, user_key: str) -> int:
        """返回当前进程内该用户活跃下载数，供测试和诊断使用。"""
        return self._active_counts.get(user_key, 0)

    def reset_for_test(self) -> None:
        """清空计数；仅测试使用。"""
        self._active_counts.clear()


media_active_download_service = MediaActiveDownloadService()
