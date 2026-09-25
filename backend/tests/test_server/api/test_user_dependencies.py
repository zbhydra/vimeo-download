"""客户端用户身份依赖测试。

覆盖可选用户依赖在有效登录态、游客态和无效登录态之间的统一映射。
"""

from datetime import timedelta

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from app.api.user_dependencies import UserContext, get_current_user_optional
from app.constants.client_product import ClientProductEnum
from app.exceptions.common_exception import UserAuthFailedException
from app.utils.jwt import JwtData, JwtUnit


# 所有游客上下文测试共用的合法设备标识。
TEST_DEVICE_ID = "test-optional-user-device"


def _bearer_credentials(token: str) -> HTTPAuthorizationCredentials:
    """构造直接调用身份依赖所需的 Bearer 凭据。"""
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


async def _resolve_optional_user(
    credentials: HTTPAuthorizationCredentials | None,
    device_id: str | None,
) -> UserContext:
    """使用 Website 请求头语义解析可选用户上下文。"""
    return await get_current_user_optional(
        credentials=credentials,
        x_device_id=device_id,
        x_client_product="web",
        request=None,
    )


@pytest.mark.asyncio
async def test_optional_user_returns_authenticated_user_for_valid_token() -> None:
    """有效 access token 保留登录用户身份。"""
    token, _ = JwtUnit.create_access_token(
        JwtData(user_id=42, email="valid-optional@example.com")
    )

    context = await _resolve_optional_user(_bearer_credentials(token), TEST_DEVICE_ID)

    assert context.user_id == 42
    assert context.token == token
    assert context.device_id == TEST_DEVICE_ID
    assert context.client_product == ClientProductEnum.WEB


@pytest.mark.asyncio
async def test_optional_user_returns_anonymous_context_without_token() -> None:
    """没有 token 时使用设备标识建立游客身份。"""
    context = await _resolve_optional_user(None, TEST_DEVICE_ID)

    assert context.user_id == 0
    assert context.token == ""
    assert context.device_id == TEST_DEVICE_ID
    assert context.client_product == ClientProductEnum.WEB


@pytest.mark.asyncio
async def test_optional_user_treats_expired_access_token_as_anonymous() -> None:
    """过期 access token 不阻断允许游客访问的接口。"""
    token, _ = JwtUnit.create_access_token(
        JwtData(user_id=42, email="expired-optional@example.com"),
        expires_delta=timedelta(seconds=-1),
    )

    context = await _resolve_optional_user(_bearer_credentials(token), TEST_DEVICE_ID)

    assert context.user_id == 0
    assert context.token == ""
    assert context.device_id == TEST_DEVICE_ID


@pytest.mark.asyncio
async def test_optional_user_treats_malformed_token_as_anonymous() -> None:
    """无法验签的 token 按未登录处理。"""
    context = await _resolve_optional_user(
        _bearer_credentials("not-a-valid-jwt"),
        TEST_DEVICE_ID,
    )

    assert context.user_id == 0
    assert context.token == ""
    assert context.device_id == TEST_DEVICE_ID


@pytest.mark.asyncio
async def test_optional_user_treats_refresh_token_as_anonymous() -> None:
    """错误 token 类型不能建立登录身份，但可降级为游客。"""
    token, _ = JwtUnit.create_refresh_token(
        JwtData(user_id=42, email="refresh-optional@example.com")
    )

    context = await _resolve_optional_user(_bearer_credentials(token), TEST_DEVICE_ID)

    assert context.user_id == 0
    assert context.token == ""
    assert context.device_id == TEST_DEVICE_ID


@pytest.mark.asyncio
async def test_optional_user_rejects_invalid_token_without_device_id() -> None:
    """无有效 token 且无设备标识时无法建立任何用户上下文。"""
    with pytest.raises(
        UserAuthFailedException,
        match="Either a valid token or device_id is required",
    ):
        await _resolve_optional_user(
            _bearer_credentials("not-a-valid-jwt"),
            None,
        )


@pytest.mark.asyncio
async def test_optional_user_rejects_missing_token_and_device_id() -> None:
    """同时缺少 token 和设备标识时拒绝请求。"""
    with pytest.raises(
        UserAuthFailedException,
        match="Either a valid token or device_id is required",
    ):
        await _resolve_optional_user(None, None)
