"""media_active_download_service 测试。"""

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.media_active_download_service import MediaActiveDownloadService


def test_media_active_download_acquire_limits_same_user_to_three() -> None:
    """同一用户最多 3 个 active-limited 下载。"""
    service = MediaActiveDownloadService()
    first = service.acquire("user:1", 3)
    second = service.acquire("user:1", 3)
    third = service.acquire("user:1", 3)

    with pytest.raises(AppCommonException) as exc_info:
        service.acquire("user:1", 3)

    assert exc_info.value.code == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    assert exc_info.value.data == {"reason": "active_download_limit_exceeded"}
    assert service.active_count("user:1") == 3

    first.release()
    second.release()
    third.release()
    assert service.active_count("user:1") == 0


def test_media_active_download_release_is_idempotent() -> None:
    """guard.release 和 service.release 重复调用都不会减成负数。"""
    service = MediaActiveDownloadService()
    guard = service.acquire("user:1", 3)

    guard.release()
    guard.release()
    service.release("user:1")

    assert service.active_count("user:1") == 0


def test_media_active_download_isolates_users() -> None:
    """不同用户计数互相隔离。"""
    service = MediaActiveDownloadService()
    user_1_first = service.acquire("user:1", 3)
    user_1_second = service.acquire("user:1", 3)
    user_1_third = service.acquire("user:1", 3)
    user_2_first = service.acquire("user:2", 3)
    user_2_second = service.acquire("user:2", 3)
    user_2_third = service.acquire("user:2", 3)

    assert service.active_count("user:1") == 3
    assert service.active_count("user:2") == 3

    user_1_first.release()
    user_1_second.release()
    user_1_third.release()
    user_2_first.release()
    user_2_second.release()
    user_2_third.release()
