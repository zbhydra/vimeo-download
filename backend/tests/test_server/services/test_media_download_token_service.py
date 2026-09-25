"""媒体下载 token 服务测试。

本文件覆盖 041.002 media_download JWT 的 TTL、claims、验签轮换和失败映射。
测试用 Ed25519 key 在运行时生成，避免把真实私钥写入仓库。
"""

from types import SimpleNamespace
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt
import pytest

from app.constants.media_download import (
    MEDIA_DOWNLOAD_MAX_SIZE_BYTES,
    MEDIA_DOWNLOAD_TTL_1_HOUR,
    MEDIA_DOWNLOAD_TTL_3_HOURS,
    MEDIA_DOWNLOAD_TTL_6_HOURS,
)
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services import media_download_token_service as token_module
from app.services.media_download_token_service import (
    MediaDownloadTokenService,
    media_download_token_ttl_seconds,
)


def _ed25519_key_pair() -> tuple[str, str]:
    """
    生成测试用 Ed25519 PEM key pair。

    Returns:
        (private_pem, public_pem)。
    """
    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return private_pem, public_pem


def _patch_download_token_config(
    monkeypatch: pytest.MonkeyPatch,
    *,
    private_key: str,
    public_keys: list[str],
) -> None:
    """
    替换运行态 settings.download_token。

    Args:
        monkeypatch: pytest monkeypatch。
        private_key: 签发私钥。
        public_keys: 验签公钥列表。
    """
    monkeypatch.setattr(
        token_module.settings,
        "download_token",
        SimpleNamespace(
            algorithm="EdDSA",
            private_key=private_key,
            public_keys=public_keys,
        ),
        raising=False,
    )


def test_media_download_token_ttl_buckets_and_file_size_limit() -> None:
    assert media_download_token_ttl_seconds(None) == MEDIA_DOWNLOAD_TTL_6_HOURS
    assert media_download_token_ttl_seconds(0) == MEDIA_DOWNLOAD_TTL_1_HOUR
    assert (
        media_download_token_ttl_seconds(100 * 1024 * 1024) == MEDIA_DOWNLOAD_TTL_1_HOUR
    )
    assert (
        media_download_token_ttl_seconds(100 * 1024 * 1024 + 1)
        == MEDIA_DOWNLOAD_TTL_3_HOURS
    )
    assert (
        media_download_token_ttl_seconds(500 * 1024 * 1024)
        == MEDIA_DOWNLOAD_TTL_3_HOURS
    )
    assert (
        media_download_token_ttl_seconds(500 * 1024 * 1024 + 1)
        == MEDIA_DOWNLOAD_TTL_6_HOURS
    )
    assert (
        media_download_token_ttl_seconds(MEDIA_DOWNLOAD_MAX_SIZE_BYTES)
        == MEDIA_DOWNLOAD_TTL_6_HOURS
    )

    with pytest.raises(AppCommonException) as exc_info:
        media_download_token_ttl_seconds(MEDIA_DOWNLOAD_MAX_SIZE_BYTES + 1)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE


def test_issue_and_decode_media_download_token_claims(monkeypatch) -> None:
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )

    service = MediaDownloadTokenService()
    token, claims = service.issue_token(
        platform="vimeo",
        download_mode="direct",
        link="https://vimeo.com/example/123",
        sid="source-video-1",
        size=None,
        user_id=42,
        credits_cost=2,
        issued_ip="203.0.113.9",
        active_download_limit=2,
        extra={"tg_client_ref": "client-ref-1"},
    )
    decoded = service.decode_for_download(token)

    assert decoded == claims
    assert decoded.typ == "media_download"
    assert decoded.v == 1
    assert decoded.platform == "vimeo"
    assert decoded.download_mode == "direct"
    assert decoded.link == "https://vimeo.com/example/123"
    assert decoded.sid == "source-video-1"
    assert decoded.size is None
    assert decoded.uid == 42
    assert decoded.active_download_limit == 2
    assert decoded.credits_cost == 2
    assert decoded.issued_ip == "203.0.113.9"
    assert decoded.extra == {"tg_client_ref": "client-ref-1"}
    assert decoded.exp - decoded.iat == MEDIA_DOWNLOAD_TTL_6_HOURS
    assert decoded.jti


def test_decode_accepts_previous_public_key_rotation(monkeypatch) -> None:
    current_private, current_public = _ed25519_key_pair()
    previous_private, previous_public = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=previous_private,
        public_keys=[current_public, previous_public],
    )

    service = MediaDownloadTokenService()
    token, claims = service.issue_token(
        platform="vimeo",
        download_mode="client_mux",
        link="https://www.reddit.com/r/demo/comments/abc/title/",
        sid="reddit:abc:video:1",
        size=1024,
        user_id=None,
        credits_cost=0,
        issued_ip=None,
        active_download_limit=3,
    )

    decoded = service.decode_for_download(token)
    assert decoded == claims

    _patch_download_token_config(
        monkeypatch,
        private_key=current_private,
        public_keys=[current_public],
    )
    with pytest.raises(AppCommonException) as exc_info:
        service.decode_for_download(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID


def test_decode_rejects_expired_token(monkeypatch) -> None:
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_download",
            "v": 1,
            "platform": "vimeo",
            "download_mode": "direct",
            "link": "https://vimeo.com/example/123",
            "sid": "source-video-1",
            "size": 1,
            "iat": now - 7200,
            "exp": now - 3600,
            "jti": "expired-jti",
        },
        private_pem,
        algorithm="EdDSA",
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaDownloadTokenService().decode_for_download(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_TOKEN_EXPIRED


def test_decode_rejects_header_algorithm_confusion(monkeypatch) -> None:
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )
    token = jwt.encode(
        {
            "typ": "media_download",
            "v": 1,
            "platform": "vimeo",
            "download_mode": "direct",
            "link": "https://vimeo.com/example/123",
            "sid": "source-video-1",
            "size": 1,
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "jti": "hs256-jti",
        },
        "wrong-shared-secret",
        algorithm="HS256",
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaDownloadTokenService().decode_for_download(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID


def test_decode_accepts_old_token_without_user_rate_limit_claims(monkeypatch) -> None:
    """旧 token 缺少身份、限速和并发字段时按兼容默认值解码。"""
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_download",
            "v": 1,
            "platform": "vimeo",
            "download_mode": "direct",
            "link": "https://vimeo.com/example/123",
            "sid": "source-video-1",
            "size": 1,
            "iat": now,
            "exp": now + 3600,
            "jti": "old-token-jti",
        },
        private_pem,
        algorithm="EdDSA",
    )

    decoded = MediaDownloadTokenService().decode_for_download(token)

    assert decoded.uid is None
    assert decoded.active_download_limit == 3
    assert decoded.extra == {}


def test_decode_rejects_proxy_download_mode(monkeypatch) -> None:
    """已下线的 proxy 模式 token 必须在进入 Provider 前被拒绝。"""
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_download",
            "v": 1,
            "platform": "vimeo",
            "download_mode": "proxy",
            "link": "https://vimeo.com/example/123",
            "sid": "source-video-1",
            "size": 1,
            "iat": now,
            "exp": now + 3600,
            "jti": "proxy-mode-jti",
        },
        private_pem,
        algorithm="EdDSA",
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaDownloadTokenService().decode_for_download(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID


def test_decode_rejects_missing_size_claim(monkeypatch) -> None:
    private_pem, public_pem = _ed25519_key_pair()
    _patch_download_token_config(
        monkeypatch,
        private_key=private_pem,
        public_keys=[public_pem],
    )
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_download",
            "v": 1,
            "platform": "vimeo",
            "download_mode": "direct",
            "link": "https://vimeo.com/example/123",
            "sid": "source-video-1",
            "iat": now,
            "exp": now + 3600,
            "jti": "missing-size-jti",
        },
        private_pem,
        algorithm="EdDSA",
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaDownloadTokenService().decode_for_download(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID
