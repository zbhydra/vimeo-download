"""客户端设备可信闸门依赖测试。"""

from collections.abc import AsyncIterator

import pytest
from starlette.requests import Request

from app.api.device_dependencies import require_trusted_client_device
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.device_service import (
    DeviceTrustVerifyResult,
    device_service,
)


def _build_request(
    *,
    path: str,
    client_product: str | None,
) -> Request:
    """构造只带路径与可选产品头的请求，避免为测试引入 ASGI 应用。"""

    headers = [(b"host", b"testserver")]
    if client_product is not None:
        headers.append((b"x-client-product", client_product.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": path,
            "query_string": b"",
            "headers": headers,
            "client": ("203.0.113.7", 51234),
        }
    )


@pytest.fixture
def fail_if_verified(monkeypatch) -> None:
    """把真实设备校验替换成必然失败，用于证明豁免分支没有调用它。"""

    async def _unexpected_verify(**kwargs) -> DeviceTrustVerifyResult:
        raise AssertionError(f"verify_request_device called with {kwargs!r}")

    monkeypatch.setattr(device_service, "verify_request_device", _unexpected_verify)


@pytest.fixture
def untrusted_verify(monkeypatch) -> AsyncIterator[None]:
    """把真实设备校验替换成固定的不可信结果。"""

    async def _untrusted_verify(**kwargs) -> DeviceTrustVerifyResult:
        return DeviceTrustVerifyResult(
            trusted=False,
            reason="device_not_trusted",
            device_id="01234567-89ab-4def-8123-456789abcdef",
            ip="203.0.113.7",
        )

    monkeypatch.setattr(device_service, "verify_request_device", _untrusted_verify)
    yield


@pytest.mark.asyncio
async def test_extension_request_skips_device_trust(fail_if_verified: None) -> None:
    """显式声明插件的请求不进入设备可信校验。"""

    await require_trusted_client_device(
        request=_build_request(
            path="/api/client/auth/send-email-code",
            client_product="extension",
        ),
        device_id="3f2a1c88-8f4a-4c5e-9d3b-4a5a0d3f9c11",
        operation="send_email_verify_code",
    )


@pytest.mark.asyncio
async def test_website_request_still_enforces_device_trust(
    untrusted_verify: None,
) -> None:
    """网站请求（显式 web 与不带产品头）仍按不可信结果拒绝。"""

    for client_product in ("web", None):
        with pytest.raises(AppCommonException) as exc_info:
            await require_trusted_client_device(
                request=_build_request(
                    path="/api/client/auth/send-email-code",
                    client_product=client_product,
                ),
                device_id="3f2a1c88-8f4a-4c5e-9d3b-4a5a0d3f9c11",
                operation="send_email_verify_code",
            )
        assert exc_info.value.code == CommonCode.AUTH_PAGE_REFRESH_REQUIRED


@pytest.mark.asyncio
async def test_unknown_extra_header_still_enforces_device_trust(
    untrusted_verify: None,
) -> None:
    """其他产品头不得被当成插件豁免。"""

    for client_product in ("unknown", "extension-pro", "extension-"):
        with pytest.raises(AppCommonException) as exc_info:
            await require_trusted_client_device(
                request=_build_request(
                    path="/api/client/media/parse-pre-v2",
                    client_product=client_product,
                ),
                device_id="3f2a1c88-8f4a-4c5e-9d3b-4a5a0d3f9c11",
                operation="parse_media_pre_v2",
            )
        assert exc_info.value.code == CommonCode.AUTH_PAGE_REFRESH_REQUIRED
