"""媒体执行 token 的加密完整性测试。"""

from types import SimpleNamespace
import json
import secrets
import zlib

import pytest

from app.exceptions.common_exception import AppCommonException
from app.constants.media_download import MEDIA_RESOURCE_TOKEN_MAX_LENGTH
from app.schemas.media_schema import MediaDownloadPreV2Request
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import MediaDirectDownloadIntentResponse
from app.services import media_execution_token_service as token_module
from app.services.media_execution_token_service import MediaExecutionTokenService


def _patch_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        token_module.settings,
        "download_token",
        SimpleNamespace(resource_token_secret="test-resource-secret"),
        raising=False,
    )


def test_execution_tokens_round_trip_and_reject_tampering(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """代理 token 和包含完整 direct 材料的 token 都必须加密认证。"""
    _patch_secret(monkeypatch)
    service = MediaExecutionTokenService()
    proxy_token = service.issue_proxy_token(
        link="https://vimeo.com/123", proxy_url="http://proxy.example:8080", node_id=7
    )
    assert (
        service.decode_proxy_token(proxy_token).proxy_url == "http://proxy.example:8080"
    )

    material = MediaDirectDownloadIntentResponse(
        source_id="vimeo:123:direct:1",
        platform="vimeo",
        download_mode="direct",
        download_url="https://skyfire.vimeocdn.com/video?sig=secret",
        filename="video.mp4",
        mime_type="video/mp4",
        size=123,
    )
    resource_token = service.issue_resource_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/123",
        source_id=material.source_id,
        download_mode=material.download_mode,
        filename=material.filename,
        mime_type=material.mime_type,
        size=material.size,
        material=material,
    )
    assert service.decode_resource_token(resource_token).material == material
    raw = service._fernet("resource").decrypt(resource_token.encode())
    payload = json.loads(zlib.decompress(raw))
    assert payload["v"] == 1
    assert json.loads(service._fernet("proxy").decrypt(proxy_token.encode()))["v"] == 1
    uncompressed = (
        service._fernet("resource").encrypt(json.dumps(payload).encode()).decode()
    )
    with pytest.raises(AppCommonException) as invalid_encoding:
        service.decode_resource_token(uncompressed)
    assert invalid_encoding.value.code == CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID

    tampered = f"{resource_token[:-1]}{'A' if resource_token[-1] != 'A' else 'B'}"
    with pytest.raises(AppCommonException) as exc_info:
        service.decode_resource_token(tampered)
    assert exc_info.value.code == CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID


def test_resource_token_issuance_and_receiving_share_size_limit(monkeypatch):
    _patch_secret(monkeypatch)
    service = MediaExecutionTokenService()
    material = MediaDirectDownloadIntentResponse(
        source_id="vimeo:123:direct:1",
        platform="vimeo",
        download_mode="direct",
        download_url="https://skyfire.vimeocdn.com/" + secrets.token_urlsafe(1100000),
        filename="video.mp4",
        mime_type="video/mp4",
        size=123,
    )
    with pytest.raises(AppCommonException) as too_large:
        service.issue_resource_token(
            platform="vimeo",
            canonical_link="https://vimeo.com/123",
            source_id=material.source_id,
            download_mode=material.download_mode,
            filename=material.filename,
            mime_type=material.mime_type,
            size=material.size,
            material=material,
        )
    assert too_large.value.code == CommonCode.MEDIA_PARSE_REQUIRES_CLIENT
    token = "x" * MEDIA_RESOURCE_TOKEN_MAX_LENGTH
    assert MediaDownloadPreV2Request(resource_token=token).resource_token == token
    with pytest.raises(ValueError):
        MediaDownloadPreV2Request(resource_token=token + "x")
    with pytest.raises(AppCommonException) as rejected:
        service.decode_resource_token(token + "x")
    assert rejected.value.code == CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID
