"""Google redirect 登录回跳地址校验测试。

覆盖 `return_to` 白名单形状：网站域、本地开发域、插件 chromiumapp.org 回调，
以及各类型伪装（子域后缀、长度、字符集、大小写、协议、userinfo、端口）。
"""

import pytest

from app.core.config import settings
from app.services.google_redirect_login_service import (
    GoogleRedirectLoginError,
    google_redirect_login_service,
)

WEBSITE_BASE_URL = "https://vimeodownloader.app"
# 合法扩展 ID：32 位 a-p 小写字母。
EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop"
EXTENSION_CALLBACK_URL = f"https://{EXTENSION_ID}.chromiumapp.org/google-login"


def _normalize(monkeypatch: pytest.MonkeyPatch, return_to: str) -> str:
    monkeypatch.setattr(settings.app, "public_website_base_url", WEBSITE_BASE_URL)
    return google_redirect_login_service.normalize_oauth_return_to(return_to)


@pytest.mark.parametrize(
    ("return_to", "expected"),
    [
        # 插件浏览器身份回调：路径与归因参数原样保留。
        (EXTENSION_CALLBACK_URL, EXTENSION_CALLBACK_URL),
        (
            f"{EXTENSION_CALLBACK_URL}"
            "?register_device_id=9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c"
            "&first_opened_at=1700000000000",
            f"{EXTENSION_CALLBACK_URL}"
            "?register_device_id=9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c"
            "&first_opened_at=1700000000000",
        ),
        # 网站域与本地开发域沿用既有白名单。
        (
            f"{WEBSITE_BASE_URL}/ext-pricing/?plan=month&google_login_error=old",
            f"{WEBSITE_BASE_URL}/ext-pricing/?plan=month",
        ),
        ("https://localhost:7910/ext-pricing/", "https://localhost:7910/ext-pricing/"),
        ("https://127.0.0.1:7910/ext-pricing/", "https://127.0.0.1:7910/ext-pricing/"),
        # 纯相对路径拼到网站根域名。
        ("/ext-pricing/", f"{WEBSITE_BASE_URL}/ext-pricing/"),
    ],
)
def test_normalize_oauth_return_to_accepts_allowed_targets(
    monkeypatch: pytest.MonkeyPatch,
    return_to: str,
    expected: str,
) -> None:
    """白名单内的回跳地址按原样规范化，插件回调不被改写。"""
    assert _normalize(monkeypatch, return_to) == expected


@pytest.mark.parametrize(
    "return_to",
    [
        "https://evil.example.com/ext-pricing/",
        # 插件回调的各类伪装。
        f"https://{EXTENSION_ID}.chromiumapp.org.evil.com/google-login",
        f"https://{EXTENSION_ID}.chromiumapp.com/google-login",
        "https://abcdefghijklmnopabcdefghijklmno.chromiumapp.org/google-login",
        "https://abcdefghijklmnopabcdefghijklmnopq.chromiumapp.org/google-login",
        "https://qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq.chromiumapp.org/google-login",
        "https://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP.chromiumapp.org/google-login",
        f"http://{EXTENSION_ID}.chromiumapp.org/google-login",
        f"https://user@{EXTENSION_ID}.chromiumapp.org/google-login",
        f"https://{EXTENSION_ID}.chromiumapp.org:8443/google-login",
        "https://chromiumapp.org/google-login",
        f"https://{EXTENSION_ID}.chromiumapp.org",
    ],
)
def test_normalize_oauth_return_to_rejects_disallowed_targets(
    monkeypatch: pytest.MonkeyPatch,
    return_to: str,
) -> None:
    """伪装成插件回调或超出白名单的地址一律判为 invalid_return_to。"""
    with pytest.raises(GoogleRedirectLoginError) as exc_info:
        _normalize(monkeypatch, return_to)

    assert exc_info.value.reason == "invalid_return_to"


@pytest.mark.parametrize(
    ("return_to", "expected"),
    [
        (EXTENSION_CALLBACK_URL, True),
        (f"{EXTENSION_CALLBACK_URL}?register_device_id=abc", True),
        ("", False),
        ("   ", False),
        (f"{WEBSITE_BASE_URL}/extension-login-v3/", False),
        ("https://localhost:7910/ext-pricing/", False),
        # 与规范化同源的伪装用例：必须是 https + 恰好 32 位 a-p 扩展 ID。
        (f"https://{EXTENSION_ID}.chromiumapp.org.evil.com/google-login", False),
        (
            "https://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP.chromiumapp.org/google-login",
            False,
        ),
        (f"http://{EXTENSION_ID}.chromiumapp.org/google-login", False),
        (f"https://{EXTENSION_ID}.chromiumapp.org:8443/google-login", False),
    ],
)
def test_is_extension_callback_return_to_matches_only_plugin_callback(
    return_to: str,
    expected: bool,
) -> None:
    """插件回跳识别只认插件自身回调，用于注册来源归因。"""
    assert (
        google_redirect_login_service.is_extension_callback_return_to(return_to)
        is expected
    )
