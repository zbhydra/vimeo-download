"""Google ID token 验证服务测试。"""

import time

from cryptography.hazmat.primitives.asymmetric import rsa
import httpx
import jwt
import pytest

from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.google_auth_service import GOOGLE_JWKS_URL, google_auth_service


GOOGLE_TEST_CLIENT_ID = "google-test-client-id.apps.googleusercontent.com"


def _build_google_token(
    *,
    audience: str = GOOGLE_TEST_CLIENT_ID,
    email_verified: bool = True,
) -> tuple[str, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    payload = {
        "iss": "https://accounts.google.com",
        "aud": audience,
        "sub": "google-subject-123",
        "email": "owner@gmail.com",
        "email_verified": email_verified,
        "exp": int(time.time()) + 300,
    }
    token = jwt.encode(
        payload,
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    return token, private_key.public_key()


@pytest.mark.asyncio
async def test_verify_id_token_rejects_unverified_email(monkeypatch):
    """email_verified=false 必须拒绝。"""
    token, public_key = _build_google_token(email_verified=False)

    async def fake_get_public_key_for_token(_credential: str) -> object:
        return public_key

    monkeypatch.setattr(settings.auth, "google_client_id", GOOGLE_TEST_CLIENT_ID)
    monkeypatch.setattr(
        google_auth_service,
        "_get_public_key_for_token",
        fake_get_public_key_for_token,
    )

    with pytest.raises(AppCommonException) as exc_info:
        await google_auth_service.verify_id_token(token)

    assert exc_info.value.code == CommonCode.AUTH_INVALID_CREDENTIALS


@pytest.mark.asyncio
async def test_verify_id_token_rejects_mismatched_audience(monkeypatch):
    """aud 与后端 Google Client ID 不匹配必须拒绝。"""
    token, public_key = _build_google_token(audience="other-client-id")

    async def fake_get_public_key_for_token(_credential: str) -> object:
        return public_key

    monkeypatch.setattr(settings.auth, "google_client_id", GOOGLE_TEST_CLIENT_ID)
    monkeypatch.setattr(
        google_auth_service,
        "_get_public_key_for_token",
        fake_get_public_key_for_token,
    )

    with pytest.raises(AppCommonException) as exc_info:
        await google_auth_service.verify_id_token(token)

    assert exc_info.value.code == CommonCode.AUTH_INVALID_CREDENTIALS


@pytest.mark.asyncio
async def test_get_jwks_logs_empty_timeout_detail(monkeypatch, caplog):
    """JWKS 超时时必须写出异常类型和 URL，不能只剩空错误文本。"""
    request = httpx.Request("GET", GOOGLE_JWKS_URL)

    class TimeoutClient:
        """模拟 httpx.AsyncClient 在请求阶段超时。"""

        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback) -> None:
            pass

        async def get(self, url: str) -> httpx.Response:
            assert url == GOOGLE_JWKS_URL
            raise httpx.ReadTimeout("", request=request)

    monkeypatch.setattr(
        "app.services.google_auth_service.httpx.AsyncClient",
        TimeoutClient,
    )

    google_auth_service._jwks = []
    google_auth_service._jwks_expires_at = 0.0

    with caplog.at_level("ERROR", logger="server"):
        with pytest.raises(AppCommonException) as exc_info:
            await google_auth_service._get_jwks(force_refresh=True)

    assert exc_info.value.code == CommonCode.INTERNAL_SERVER_ERROR
    assert "Google login failed: JWKS request failed" in caplog.text
    assert "error_type=ReadTimeout" in caplog.text
    assert "error=<empty>" in caplog.text
    assert f"url={GOOGLE_JWKS_URL}" in caplog.text


@pytest.mark.asyncio
async def test_get_jwks_logs_http_status_and_body(monkeypatch, caplog):
    """JWKS 返回非 2xx 时日志必须带状态码和响应体片段。"""

    class StatusClient:
        """模拟 Google JWKS 返回错误状态码。"""

        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback) -> None:
            pass

        async def get(self, url: str) -> httpx.Response:
            request = httpx.Request("GET", url)
            return httpx.Response(503, request=request, text="jwks unavailable")

    monkeypatch.setattr(
        "app.services.google_auth_service.httpx.AsyncClient",
        StatusClient,
    )

    google_auth_service._jwks = []
    google_auth_service._jwks_expires_at = 0.0

    with caplog.at_level("ERROR", logger="server"):
        with pytest.raises(AppCommonException) as exc_info:
            await google_auth_service._get_jwks(force_refresh=True)

    assert exc_info.value.code == CommonCode.INTERNAL_SERVER_ERROR
    assert "error_type=HTTPStatusError" in caplog.text
    assert "status=503" in caplog.text
    assert "body=jwks unavailable" in caplog.text
