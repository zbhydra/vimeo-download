"""用户认证和请求上下文依赖。"""

from dataclasses import dataclass
from typing import Optional

from app.utils.logger import logger

from app.constants.auth import TokenType
from app.constants.client_product import ClientProductEnum, normalize_client_product
from app.exceptions.common_exception import UserAuthFailedException
from app.i18n.dependencies import DEFAULT_LANGUAGE, SupportedLanguage
from app.services.user_token_service import user_token_service
from app.utils.common import get_client_ip
from app.utils.device_id import validate_request_device_id
from app.utils.jwt import JwtUnit
from fastapi import Header, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.requests import Request
from app.utils.common import get_locale


security = HTTPBearer()


@dataclass
class UserContext:
    """当前请求的用户、设备和客户端产品上下文。"""

    user_id: int
    token: str
    device_id: Optional[str] = None
    language: SupportedLanguage = DEFAULT_LANGUAGE
    ip: Optional[str] = None
    client_product: ClientProductEnum = ClientProductEnum.EXTENSION

    async def check_strict(self):
        # 严格验证模式
        return await user_token_service.verify_token(
            self.token, self.user_id, token_type=TokenType.USER_ACCESS
        )

    def validated_device_id(self) -> str:
        """返回已校验设备 ID，供匿名请求作为用户级标识使用。"""
        return validate_request_device_id(self.device_id)


def _create_user_context(
    token: str,
    device_id: Optional[str] = None,
    language: SupportedLanguage = DEFAULT_LANGUAGE,
    ip: Optional[str] = None,
    client_product: ClientProductEnum = ClientProductEnum.EXTENSION,
    *,
    report_decode_failure: bool = True,
) -> Optional[UserContext]:
    """验证 access token 并创建用户上下文，验证失败返回 None。

    Args:
        token: 待验证的 access token。
        device_id: 已校验的可选设备标识。
        language: 请求语言。
        ip: 客户端 IP。
        client_product: 客户端产品类型。
        report_decode_failure: 是否记录 JWT 解码失败。

    此函数只验证 token 签名、有效期和类型，不检查 Redis 中的撤销状态。
    """
    jwt_data = JwtUnit.decode_token(token, report_failure=report_decode_failure)
    if not jwt_data:
        return None

    user_id = jwt_data.user_id
    if user_id is None or not isinstance(user_id, int):
        return None

    token_type = jwt_data.type
    if token_type != TokenType.USER_ACCESS.value:
        return None

    return UserContext(
        user_id=user_id,
        token=token,
        device_id=device_id,
        language=language,
        ip=ip,
        client_product=client_product,
    )


def _create_anonymous_user_context(
    *,
    device_id: str,
    language: SupportedLanguage,
    ip: str | None,
    client_product: ClientProductEnum,
) -> UserContext:
    """用已校验的设备标识和请求元数据创建游客上下文。"""
    return UserContext(
        user_id=0,
        token="",
        device_id=device_id,
        language=language,
        ip=ip,
        client_product=client_product,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_client_product: Optional[str] = Header(None, alias="X-Client-Product"),
    request: Request = None,  # type: ignore[assignment]
) -> UserContext:
    """
    获取当前认证用户（包含 device_id 和 language）

    流程：
    1. 验证 Token 签名和过期时间
    2. 提取 userid（兼容旧的 sub）
    3. 验证 Token 是否被撤销或已过期（通过 Redis）
    4. 从 Accept-Language header 获取语言设置
    """
    token = credentials.credentials

    # 获取语言设置
    locale = get_locale(request) if request else None
    language = locale.language if locale else DEFAULT_LANGUAGE

    ip = get_client_ip(request) if request else None
    client_product = normalize_client_product(x_client_product)
    device_id: str | None = (
        validate_request_device_id(x_device_id) if x_device_id else None
    )
    ctx = _create_user_context(
        token,
        device_id=device_id,
        language=language,
        ip=ip,
        client_product=client_product,
    )
    if ctx is None:
        raise UserAuthFailedException("Invalid token")

    if not await ctx.check_strict():
        raise UserAuthFailedException("Token revoked or expired")

    return ctx


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(
        HTTPBearer(auto_error=False)
    ),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_client_product: Optional[str] = Header(None, alias="X-Client-Product"),
    request: Request = None,  # type: ignore[assignment]
) -> UserContext:
    """
    可选的用户认证依赖

    支持已登录和未登录用户：
    - 有有效 token: 返回 UserContext（已登录，user_id > 0）
    - 无 token 或 token 无效，但有 device_id: 返回 UserContext（游客，user_id = 0）
    - 既无有效 token 也无 device_id: 抛出 UserAuthFailedException

    Returns:
        - UserContext: 总是返回 UserContext（已登录或游客）

    Raises:
        UserAuthFailedException: 既没有有效 token 也没有 device_id

    注意：此函数不检查 Redis 中的 token 撤销状态，仅验证 token 签名、有效期和类型。
    签名、有效期或类型无效时按未登录处理，不让过期登录态阻断匿名接口。
    """
    # 获取语言设置
    locale = get_locale(request) if request else None
    language = locale.language if locale else DEFAULT_LANGUAGE

    ip = get_client_ip(request) if request else None
    client_product = normalize_client_product(x_client_product)

    device_id: str | None = (
        validate_request_device_id(x_device_id) if x_device_id else None
    )

    if credentials is not None:
        ctx = _create_user_context(
            credentials.credentials,
            device_id=device_id,
            language=language,
            ip=ip,
            client_product=client_product,
            # 有设备标识时，解码失败会正常降级为游客，不应记录 ERROR。
            report_decode_failure=device_id is None,
        )
        if ctx is not None:
            return ctx

    if device_id is None:
        logger.info(
            "get_current_user_optional: no valid token or device_id: "
            f"path={request.url.path if request else 'no request'}"
        )
        raise UserAuthFailedException("Either a valid token or device_id is required")

    return _create_anonymous_user_context(
        device_id=device_id,
        language=language,
        ip=ip,
        client_product=client_product,
    )


async def get_current_user_if_authenticated(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(
        HTTPBearer(auto_error=False)
    ),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
) -> UserContext | None:
    """仅在请求携带有效 access token 时返回用户上下文。

    面向本身允许完全匿名访问、但登录后需要附加账号数据的公开接口：缺少
    Authorization 时直接返回 ``None``；过期、签名无效、类型错误、已撤销或
    未登记的凭据同样按匿名处理。Redis 校验异常时记录错误并降级为匿名，避免
    可选的账号附加数据阻断公开接口。

    设备标识按与其他用户上下文依赖相同的方式解析，供需要设备维度的调用方使用。
    """

    if credentials is None:
        return None
    ctx = _create_user_context(
        credentials.credentials,
        device_id=(validate_request_device_id(x_device_id) if x_device_id else None),
        report_decode_failure=False,
    )
    if ctx is None:
        return None

    try:
        if not await ctx.check_strict():
            return None
    except Exception:
        # 公开接口以可用性优先；Redis 无法确认登录态时只隐藏账号附加数据。
        logger.error(
            "get_current_user_if_authenticated: strict token verification failed; "
            "falling back to anonymous context: user_id=%s",
            ctx.user_id,
            exc_info=True,
        )
        return None

    return ctx
