"""媒体执行 token 的加密完整性测试。"""

from types import SimpleNamespace

import pytest

from app.exceptions.common_exception import AppCommonException
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

    tampered = f"{resource_token[:-1]}{'A' if resource_token[-1] != 'A' else 'B'}"
    with pytest.raises(AppCommonException) as exc_info:
        service.decode_resource_token(tampered)
    assert exc_info.value.code == CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID
