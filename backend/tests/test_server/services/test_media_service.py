"""MediaService 离线结构测试。

媒体下载计费规则只属于 media_service；user_credit_service 只保留公共余额底座。
"""

from app.services.media_service import media_service


def test_calculate_download_credits_boundary_values() -> None:
    """website Credits 下载扣费阶梯必须按 MiB 边界计算。"""

    mib = 1024 * 1024
    cases = [
        (None, 2),
        (49 * mib, 1),
        (50 * mib - 1, 1),
        (50 * mib, 2),
        (299 * mib, 2),
        (300 * mib, 3),
        (799 * mib, 3),
        (800 * mib, 4),
        (4299 * mib, 10),
        (4300 * mib, 11),
        (4800 * mib, 12),
    ]

    for size_bytes, expected in cases:
        assert media_service.calculate_download_credits(size_bytes) == expected


def test_build_download_resource_key_separates_download_mode() -> None:
    """resource_key 必须绑定下载模式，direct 和 client_mux 不互相免扣。"""

    direct_key = media_service.build_download_resource_key(
        platform="vimeo",
        canonical_link="https://www.reddit.com/comments/abc/",
        source_id="reddit:abc:video:1",
        download_mode="direct",
    )
    mux_key = media_service.build_download_resource_key(
        platform="vimeo",
        canonical_link="https://www.reddit.com/comments/abc/",
        source_id="reddit:abc:video:1",
        download_mode="client_mux",
    )

    assert len(direct_key) == 32
    assert direct_key != mux_key
