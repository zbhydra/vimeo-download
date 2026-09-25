"""Media 平台识别、网络安全和文件名工具测试。"""

import socket
from unittest.mock import patch

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.contracts.media_platform import detect_platform
from app.utils.filename import sanitize_filename
from app.utils.network import assert_public_host


class TestPlatformDetection:
    """平台识别测试。"""

    def test_youtube_link_returns_unsupported(self) -> None:
        """非支持平台链接返回 MEDIA_PLATFORM_UNSUPPORTED。"""
        with pytest.raises(AppCommonException) as exc_info:
            detect_platform("https://www.youtube.com/watch?v=xxx")
        assert exc_info.value.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED

    def test_random_link_returns_unsupported(self) -> None:
        """随机域名返回 MEDIA_PLATFORM_UNSUPPORTED。"""
        with pytest.raises(AppCommonException) as exc_info:
            detect_platform("https://example.com/some/path")
        assert exc_info.value.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED

    def test_supported_platform_hosts_detected(self) -> None:
        """Vimeo host 能正确识别。"""
        assert detect_platform("https://vimeo.com/1194296700") == "vimeo"
        assert detect_platform("https://www.vimeo.com/1194296700") == "vimeo"
        assert detect_platform("https://player.vimeo.com/video/1194296700") == "vimeo"

    def test_removed_platform_hosts_return_unsupported(self) -> None:
        """已下线平台链接不再被识别。"""
        for link in (
            "https://www.tiktok.com/@user/video/123",
            "https://x.com/yetone/status/2059751448108507277",
            "https://www.instagram.com/reel/Chunk8-jurw/",
            "https://threads.net/@instagram/post/C5EHLM0LZoR",
            "https://www.reddit.com/r/all/comments/1tr9mc4/actual_footage/",
            "https://v.douyin.com/K1KxA0nxPTA/",
        ):
            with pytest.raises(AppCommonException) as exc_info:
                detect_platform(link)
            assert exc_info.value.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED

    def test_host_normalization_edges(self) -> None:
        """host 大小写和 FQDN 尾点不影响白名单识别。"""
        assert detect_platform("https://www.vimeo.com./1194296700") == "vimeo"
        assert detect_platform("HTTPS://WWW.VIMEO.COM/1194296700") == "vimeo"

    def test_similar_host_not_supported(self) -> None:
        """相似恶意域名不应命中平台白名单。"""
        with pytest.raises(AppCommonException) as exc_info:
            detect_platform("https://www.vimeo.com.evil.example/1194296700")
        assert exc_info.value.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED

    def test_empty_link_returns_unsupported(self) -> None:
        """空链接返回 MEDIA_PLATFORM_UNSUPPORTED。"""
        with pytest.raises(AppCommonException) as exc_info:
            detect_platform("")
        assert exc_info.value.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED


class TestAssertPublicHost:
    """SSRF 防护 assert_public_host 测试。"""

    def test_ip_literals_rejected(self) -> None:
        """IP 字面量直接拒绝。"""
        for host in ("127.0.0.1", "10.0.0.1", "::1"):
            with pytest.raises(AppCommonException) as exc_info:
                assert_public_host(host)
            assert exc_info.value.code == CommonCode.SOURCE_FORBIDDEN

    def test_dns_resolves_to_forbidden_ranges_rejected(self) -> None:
        """域名解析到内网、metadata 或 CGNAT 地址时拒绝。"""
        for ip in ("192.168.1.1", "169.254.169.254", "100.64.0.1"):
            fake_result = [(socket.AF_INET, 0, 0, "", (ip, 0))]
            with patch("socket.getaddrinfo", return_value=fake_result):
                with pytest.raises(AppCommonException) as exc_info:
                    assert_public_host("blocked.example.com")
                assert exc_info.value.code == CommonCode.SOURCE_FORBIDDEN

    def test_dns_failure_rejected(self) -> None:
        """DNS 解析失败时拒绝。"""
        with patch("socket.getaddrinfo", side_effect=socket.gaierror("NXDOMAIN")):
            with pytest.raises(AppCommonException) as exc_info:
                assert_public_host("nonexistent.example.invalid")
            assert exc_info.value.code == CommonCode.SOURCE_FORBIDDEN

    def test_public_host_passes(self) -> None:
        """公网域名通过。"""
        fake_result = [(socket.AF_INET, 0, 0, "", ("93.184.216.34", 0))]
        with patch("socket.getaddrinfo", return_value=fake_result):
            assert_public_host("example.com")


class TestSanitizeFilename:
    """sanitize_filename 工具函数测试。"""

    def test_nfc_normalization(self) -> None:
        """NFD 输入被归一化为 NFC。"""
        import unicodedata

        nfd_name = unicodedata.normalize("NFD", "cafe\u0301.mp4")
        nfc_name = unicodedata.normalize("NFC", "cafe\u0301.mp4")
        assert sanitize_filename(nfd_name) == nfc_name

    def test_control_chars_fallback(self) -> None:
        """仅含控制字符时回退到默认 media。"""
        assert sanitize_filename("\x00\x01\x02\x03") == "media"

    def test_long_utf8_truncation(self) -> None:
        """超长 UTF-8 字符串截断到不超过 100 bytes 主名。"""
        result = sanitize_filename("中" * 50 + ".mp4")
        stem, ext = result.rsplit(".", 1)
        assert len(stem.encode("utf-8")) <= 100
        assert ext == "mp4"

    def test_path_separator_replaced(self) -> None:
        """路径分隔符被替换为连字符。"""
        result = sanitize_filename("path/to\\file:name.mp4")
        assert "/" not in result
        assert "\\" not in result
        assert ":" not in result
        assert "-" in result

    def test_normal_filename_unchanged(self) -> None:
        """正常文件名不被改变。"""
        assert sanitize_filename("video.mp4") == "video.mp4"

    def test_extension_truncation(self) -> None:
        """超长扩展名截断到不超过 20 bytes。"""
        result = sanitize_filename(f"file.{'a' * 30}")
        _, ext = result.rsplit(".", 1)
        assert len(ext.encode("utf-8")) <= 20

    def test_whitespace_normalized(self) -> None:
        """连续空白合并为单个空格。"""
        assert sanitize_filename("hello   world.mp4") == "hello world.mp4"
