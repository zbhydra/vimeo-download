"""media_resource token 服务测试。

覆盖 U2 resource token 的签发、验签、篡改、过期和 secret 配置失败。
"""

from types import SimpleNamespace
import base64
import json
import time

import jwt
import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services import media_resource_token_service as resource_token_module
from app.services.media_resource_token_service import (
    MEDIA_RESOURCE_TOKEN_ALGORITHM,
    MEDIA_RESOURCE_TOKEN_TTL_SECONDS,
    MediaResourceTokenService,
)


def _patch_resource_secret(monkeypatch: pytest.MonkeyPatch, secret: str | None) -> None:
    """替换 resource token 测试配置。"""

    monkeypatch.setattr(
        resource_token_module.settings,
        "download_token",
        SimpleNamespace(resource_token_secret=secret),
        raising=False,
    )


def _jwt_segment(payload: dict) -> str:
    """编码 JWT header/payload 段。"""

    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def test_issue_and_decode_media_resource_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """resource token claims 必须完整保留解析结果。"""

    _patch_resource_secret(monkeypatch, "test-resource-secret")
    token = MediaResourceTokenService().issue_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/example/123",
        source_id="source-video-1",
        download_mode="direct",
        filename="demo.mp4",
        mime_type="video/mp4",
        size=None,
        extra={"tg_client_ref": "client-ref-1"},
    )
    claims = MediaResourceTokenService().decode_for_download_pre(token)
    payload = jwt.decode(
        token,
        options={"verify_signature": False},
        algorithms=[MEDIA_RESOURCE_TOKEN_ALGORITHM],
    )

    assert claims.typ == "media_resource"
    assert claims.v == 1
    assert claims.platform == "vimeo"
    assert claims.canonical_link == "https://vimeo.com/example/123"
    assert claims.source_id == "source-video-1"
    assert claims.download_mode == "direct"
    assert claims.filename == "demo.mp4"
    assert claims.mime_type == "video/mp4"
    assert payload["mime_type"] == "video/mp4"
    assert claims.size is None
    assert claims.extra == {"tg_client_ref": "client-ref-1"}
    assert MEDIA_RESOURCE_TOKEN_TTL_SECONDS == 24 * 60 * 60
    assert claims.exp - claims.iat == MEDIA_RESOURCE_TOKEN_TTL_SECONDS


def test_decode_rejects_proxy_download_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """已下线的 proxy 模式 resource token 必须验签后拒绝。"""

    _patch_resource_secret(monkeypatch, "test-resource-secret")
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_resource",
            "v": 1,
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/example/123",
            "source_id": "source-video-1",
            "download_mode": "proxy",
            "filename": "demo.mp4",
            "size": 1,
            "iat": now,
            "exp": now + 3600,
        },
        "test-resource-secret",
        algorithm=MEDIA_RESOURCE_TOKEN_ALGORITHM,
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaResourceTokenService().decode_for_download_pre(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
    assert exc_info.value.data is not None
    assert exc_info.value.data["reason"] == "resource_token_invalid_claims_shape"


def test_decode_accepts_old_media_resource_token_without_tg_client_ref(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """旧 resource token 缺 tg_client_ref 时继续可用。"""

    _patch_resource_secret(monkeypatch, "test-resource-secret")
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_resource",
            "v": 1,
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/example/123",
            "source_id": "source-video-1",
            "download_mode": "direct",
            "filename": "demo.mp4",
            "size": 1,
            "iat": now,
            "exp": now + 3600,
        },
        "test-resource-secret",
        algorithm=MEDIA_RESOURCE_TOKEN_ALGORITHM,
    )

    claims = MediaResourceTokenService().decode_for_download_pre(token)

    assert claims.extra == {}
    assert claims.mime_type is None


def test_decode_rejects_tampered_media_resource_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """篡改 payload 中 size 后必须验签失败。"""

    _patch_resource_secret(monkeypatch, "test-resource-secret")
    service = MediaResourceTokenService()
    token = service.issue_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/example/123",
        source_id="source-video-1",
        download_mode="direct",
        filename="demo.mp4",
        mime_type="video/mp4",
        size=1,
    )
    header = jwt.get_unverified_header(token)
    payload = jwt.decode(
        token,
        options={"verify_signature": False},
        algorithms=[MEDIA_RESOURCE_TOKEN_ALGORITHM],
    )
    payload["size"] = 5 * 1024 * 1024 * 1024
    tampered = (
        f"{_jwt_segment(header)}.{_jwt_segment(payload)}.{token.rsplit('.', 1)[1]}"
    )

    with pytest.raises(AppCommonException) as exc_info:
        service.decode_for_download_pre(tampered)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
    assert exc_info.value.data is not None
    assert exc_info.value.data["reason"] == "resource_token_verification_failed"
    assert exc_info.value.data["failure_reason"].startswith(
        "resource_token_verification_failed:"
    )


def test_decode_rejects_expired_media_resource_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """过期 resource token 必须拒绝。"""

    _patch_resource_secret(monkeypatch, "test-resource-secret")
    now = int(time.time())
    token = jwt.encode(
        {
            "typ": "media_resource",
            "v": 1,
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/example/123",
            "source_id": "source-video-1",
            "download_mode": "direct",
            "filename": "demo.mp4",
            "size": 1,
            "iat": now - 3600,
            "exp": now - 1,
        },
        "test-resource-secret",
        algorithm=MEDIA_RESOURCE_TOKEN_ALGORITHM,
    )

    with pytest.raises(AppCommonException) as exc_info:
        MediaResourceTokenService().decode_for_download_pre(token)
    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
    assert exc_info.value.data == {
        "reason": "resource_token_expired",
        "failure_reason": "resource_token_expired",
    }


@pytest.mark.parametrize(
    "secret",
    [None, "", "CHANGE_ME", "default", "{RESOURCE_TOKEN_SECRET}"],
)
def test_media_resource_token_requires_real_secret(
    monkeypatch: pytest.MonkeyPatch,
    secret: str | None,
) -> None:
    """RESOURCE_TOKEN_SECRET 缺失或默认值时不允许签发。"""

    _patch_resource_secret(monkeypatch, secret)
    with pytest.raises(AppCommonException) as exc_info:
        MediaResourceTokenService().issue_token(
            platform="vimeo",
            canonical_link="https://vimeo.com/example/123",
            source_id="source-video-1",
            download_mode="direct",
            filename="demo.mp4",
            mime_type="video/mp4",
            size=1,
        )
    assert exc_info.value.code == CommonCode.INTERNAL_SERVER_ERROR
