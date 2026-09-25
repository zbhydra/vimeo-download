"""客户端用户认证 API。

本文件只负责把客户端认证接口串成业务流程；具体能力复用已有 service：
- user_auth_service：校验密码、签发项目 access/refresh token 并登记白名单。
- user_token_service：token 白名单校验、撤销、refresh token 轮换。
- user_service：创建/查询用户，构建客户端用户信息。
- google_auth_service：Google ID token 和 OAuth code 协议交互。
- google_redirect_login_service：Google redirect 登录的一次性 state/code。

整体流程：
1. 常规登录（插件 popup 与 Website 共用同一入口）
   password / email-code / Google One Tap / Google redirect exchange
   -> 确认或创建用户
   -> _complete_login_flow
   -> 返回 access_token、refresh_token 和 user。
   插件在 popup 内直接调用 /send-email-code、/email-verify-login，Google 登录走
   /google/oauth/* 三段接口（background 用 browser identity 打开授权窗口），
   两者都不需要 Website 会话，也不再经过跳转网站的 PKCE 桥接。
2. Google 手动按钮登录
   /google/oauth/authorize 只创建短效 state 并跳 Google
   -> /google/oauth/callback 校验 Google code 后只回传一次性 login code
   -> /google/exchange 消费一次性 code，再走 _complete_login_flow。
   这样项目 token 不出现在 URL 里。
3. token 生命周期
   /refresh 使用 refresh token 轮换出新 token 对。
   /logout 只撤销当前 access token，不影响其他设备、Website/插件另一端。

设备可信闸门：/send-email-code 与 /email-verify-login 依赖
`require_trusted_client_device`，插件来源（显式 X-Client-Product: extension）
在依赖内豁免，原因见 app/api/device_dependencies.py。
"""

from urllib.parse import parse_qsl, urlsplit

from pydantic import ValidationError

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError

# Services
from app.api.device_dependencies import require_trusted_client_device
from app.services.email_verification_service import (
    SendResult,
    email_verification_service,
)
from app.services.google_auth_service import GoogleTokenProfile, google_auth_service
from app.services.google_redirect_login_service import (
    GOOGLE_REDIRECT_CODE_PARAM,
    GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM,
    GoogleRedirectLoginError,
    google_redirect_login_service,
)
from app.services.user_auth_service import user_auth_service
from app.services.subscription_status_service import subscription_status_service
from app.services.user_service import user_service
from app.services.user_token_service import user_token_service

# Utils
from app.utils.common import get_client_ip, get_locale
from app.utils.geoip import geoip_service
from app.utils.ip_block_manager import IPBlockManager
from app.utils.jwt import JwtUnit
from app.utils.logger import logger
from app.utils.redis_fixed_limiter import RedisFixedLimiter
from app.utils.response import ResponseUtils

# API & Models
from app.api.user_dependencies import (
    UserContext,
    get_current_user,
)
from app.constants.client_product import ClientProductEnum, normalize_client_product
from app.constants.auth import (
    HTTP_AUTH_BEARER_PREFIX,
    HTTP_AUTH_BEARER_PREFIX_LENGTH,
    IP_BLOCK_DURATION,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW,
    MESSAGE_VERIFY_CODE_SENT,
    TokenType,
    UserLoginStatus,
)
from app.exceptions.common_exception import AppCommonException, UserAuthFailedException
from app.i18n.common_code import CommonCode
from app.i18n.dependencies import SupportedLanguage
from app.models import UserModel
from app.schemas.client_user_schema import (
    CurrentUserInfoResponse,
    EmailVerifyLoginRequest,
    GoogleLoginCodeExchangeRequest,
    GoogleLoginRequest,
    RegistrationContext,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    RegisterRequest,
    SendEmailVerifyRequest,
)

router = APIRouter(prefix="/auth", tags=["用户认证"])

# 限流器和 IP 封禁管理器实例
_rate_limiter = RedisFixedLimiter(key_prefix="login_rate_limit")
_google_oauth_authorize_limiter = RedisFixedLimiter(key_prefix="google_oauth_authorize")
_ip_block_manager = IPBlockManager(key_prefix="ip_block")
_GOOGLE_OAUTH_AUTHORIZE_RATE_LIMIT_MAX = 10
_GOOGLE_OAUTH_AUTHORIZE_RATE_LIMIT_WINDOW = 60


def _extract_registration_context(
    request: Request,
) -> tuple[ClientProductEnum, str | None]:
    """提取注册时需要落库的客户端上下文。"""

    client_product = normalize_client_product(request.headers.get("X-Client-Product"))
    user_agent = request.headers.get("user-agent")
    return client_product, user_agent


def _require_client_ip(request: Request, operation: str) -> str:
    """读取必须参与风控限流的客户端 IP。"""

    ip_address = get_client_ip(request)
    if ip_address:
        return ip_address

    raise AppCommonException(
        code=CommonCode.INTERNAL_SERVER_ERROR,
        ext_msg=(
            "auth_client.client_ip: missing client ip for rate limit: "
            f"operation={operation}, path={request.url.path}"
        ),
    )


async def _complete_login_flow(user: UserModel, request: Request) -> LoginResponse:
    """完成登录后的通用流程（生成Token、创建会话、更新登录信息）.

    Args:
        user: 用户对象
        request: FastAPI 请求对象

    Returns:
        LoginResponse: 登录响应
    """
    ip_address = get_client_ip(request)
    token_bundle = await user_auth_service.issue_registered_tokens_for_user(
        user,
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
        operation="client_login",
    )

    # 更新登录信息（包含 IP 和国家）
    login_country = geoip_service.get_country(ip_address) if ip_address else None
    await user_auth_service.update_user_login_info(user, ip_address, login_country)

    return LoginResponse(
        access_token=token_bundle.access_token,
        refresh_token=token_bundle.refresh_token,
        token_type=TokenType.BEARER.value,
        expires_in=token_bundle.expires_in,
        user=await user_service.build_client_user_info(user),
    )


async def _send_email_verify_code_or_raise(
    email: str,
    language: SupportedLanguage,
) -> None:
    """发送邮箱验证码，并统一映射限流和发送失败错误。"""

    result = await email_verification_service.send_verify_code(email, language)

    if result == SendResult.RATE_LIMITED:
        raise AppCommonException(code=CommonCode.EMAIL_VERIFY_SEND_TOO_FREQUENT)
    if result == SendResult.SEND_FAILED:
        raise AppCommonException(code=CommonCode.EMAIL_VERIFY_SEND_FAILED)


def _serialize_login_response(login_response: LoginResponse) -> dict:
    """把内部登录响应模型转换为 API 信封 data。"""
    return {
        "access_token": login_response.access_token,
        "refresh_token": login_response.refresh_token,
        "token_type": login_response.token_type,
        "expires_in": login_response.expires_in,
        "user": login_response.user.model_dump(),
    }


def _ensure_user_can_login(user: UserModel) -> None:
    """检查用户当前状态是否允许登录。"""
    status_value = user.user_status()
    if status_value == UserLoginStatus.LOCKED:
        raise AppCommonException(code=CommonCode.AUTH_ACCOUNT_LOCKED)
    if status_value == UserLoginStatus.DELETED:
        raise AppCommonException(code=CommonCode.USER_NOT_FOUND)


async def _get_or_create_external_login_user(
    profile: GoogleTokenProfile,
    request: Request,
    register_method: str,
    register_source: ClientProductEnum,
    registration: RegistrationContext,
) -> UserModel:
    """按第三方可信邮箱查找或创建用户。"""
    register_ip = get_client_ip(request)
    return await user_service.get_or_create_external_login_user(
        email=profile.email,
        full_name=profile.full_name,
        avatar_url=profile.avatar_url,
        register_source=register_source,
        register_method=register_method,
        register_device_id=registration.register_device_id,
        first_opened_at=registration.first_opened_at,
        register_user_agent=request.headers.get("user-agent"),
        register_ip=register_ip,
        register_country=(
            geoip_service.get_country(register_ip) if register_ip else None
        ),
    )


def _google_redirect_response(
    params: dict[str, str],
    redirect_state: str | None = None,
) -> RedirectResponse:
    """返回跳回 Website 的 303 响应。"""
    return RedirectResponse(
        google_redirect_login_service.build_redirect_url(params, redirect_state),
        status_code=status.HTTP_303_SEE_OTHER,
    )


def _google_redirect_error_response(
    reason: str,
    redirect_state: str | None = None,
) -> RedirectResponse:
    """返回 Google redirect 登录失败的 Website 回跳响应。"""
    return RedirectResponse(
        google_redirect_login_service.build_error_redirect_url(reason, redirect_state),
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, request: Request):
    """用户注册.

    1. 检查邮箱是否已存在
    2. 创建用户（自动赠送注册 Credits）
    3. 返回用户信息
    """
    register_source, register_user_agent = _extract_registration_context(request)
    register_ip = get_client_ip(request)
    register_country = geoip_service.get_country(register_ip) if register_ip else None

    # 检查邮箱是否已存在
    existing = await user_service.get_user_by_email(data.email)
    if existing:
        raise AppCommonException(code=CommonCode.USER_EMAIL_EXISTS)

    # 创建用户并赠送注册 Credits
    user = await user_service.create_user_with_registration_bonus(
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        register_source=(
            ClientProductEnum.EXTENSION
            if data.registration_entry == "extension_v3"
            else register_source
        ),
        register_device_id=data.register_device_id,
        first_opened_at=data.first_opened_at,
        register_user_agent=register_user_agent,
        register_ip=register_ip,
        register_country=register_country,
    )

    user_info = await user_service.build_client_user_info(user)
    return ResponseUtils.ok(user_info.model_dump())


@router.post("/login")
async def login(data: LoginRequest, request: Request):
    """用户登录.

    1. 检查 IP 是否被封禁
    2. 检查登录失败频率限制
    3. 验证邮箱和密码
    4. 生成 Token 并创建会话
    """
    # 获取客户端 IP，用于登录风控限流和封禁。
    ip_address = _require_client_ip(request, "password_login.rate_limit")

    # 检查 IP 是否被封禁
    if await _ip_block_manager.is_blocked(ip_address):
        remaining_time = await _ip_block_manager.get_remaining_time(ip_address)
        logger.warning(
            f"Blocked IP {ip_address} attempted login, remaining: {remaining_time}s",
        )
        raise AppCommonException(code=CommonCode.AUTH_IP_BLOCKED)

    # 验证用户凭据
    user = await user_auth_service.authenticate_user(data.email, data.password)
    if not user:
        # 检查并更新失败次数限制
        allowed = await _rate_limiter.is_allowed(
            identifier=ip_address,
            limit=LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            window=LOGIN_RATE_LIMIT_WINDOW,
        )

        if not allowed:
            # 超过限制，封禁 IP
            await _ip_block_manager.block(ip_address, IP_BLOCK_DURATION)
            logger.warning(
                f"IP {ip_address} exceeded login rate limit, "
                f"blocked for {IP_BLOCK_DURATION}s",
            )
            raise AppCommonException(code=CommonCode.AUTH_IP_BLOCKED)

        await user_auth_service.update_failed_login(data.email)
        raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

    _ensure_user_can_login(user)

    login_response = await _complete_login_flow(user, request)
    return ResponseUtils.ok(_serialize_login_response(login_response))


@router.post("/logout")
async def logout(ctx: UserContext = Depends(get_current_user), request: Request = None):
    """用户登出（只撤销当前 token，不影响其他设备）."""
    if request:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith(HTTP_AUTH_BEARER_PREFIX):
            token = auth_header[HTTP_AUTH_BEARER_PREFIX_LENGTH:]
            await user_token_service.revoke_token(
                token, ctx.user_id, TokenType.USER_ACCESS
            )

    return ResponseUtils.ok({})


@router.post("/refresh")
async def refresh_token(data: RefreshTokenRequest):
    """刷新访问令牌（带 Refresh Token 轮换）.

    流程：
    1. 验证旧的 refresh token（支持宽限期内的旧 token）
    2. 验证用户身份和状态
    3. 生成新的 access token 和 refresh token
    4. 执行 refresh token 轮换（旧 token 移入宽限期 ZSet）
    5. 返回新的 token 对

    宽限期策略：
    - 旧 refresh token 在轮换后保留 30 秒
    - 在此期间内，客户端可以使用旧 token 进行刷新（处理并发请求）
    """
    jwt_data = JwtUnit.decode_token(data.refresh_token)
    if not jwt_data:
        raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

    user = await user_service.get_by_id(jwt_data.user_id)
    if not user:
        raise AppCommonException(code=CommonCode.USER_NOT_FOUND)

    _ensure_user_can_login(user)

    ok = await user_token_service.verify_refresh_token_with_grace_period(
        data.refresh_token,
        jwt_data.user_id,
    )
    if not ok:
        raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

    new_access_token, new_refresh_token, expires_in = (
        user_auth_service.create_tokens_for_user(user)
    )

    new_access_jwt_data = JwtUnit.decode_token(new_access_token)
    new_refresh_jwt_data = JwtUnit.decode_token(new_refresh_token)
    if not new_access_jwt_data or not new_refresh_jwt_data:
        raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

    new_access_expires_at = new_access_jwt_data.exp
    new_refresh_expires_at = new_refresh_jwt_data.exp

    rotation_success = await user_token_service.rotate_refresh_token(
        old_refresh_token=data.refresh_token,
        new_refresh_token=new_refresh_token,
        user_id=jwt_data.user_id,
        new_expires_at=new_refresh_expires_at,
    )

    if not rotation_success:
        logger.error(f"Failed to rotate refresh token for user_id={jwt_data.user_id}")

    await user_auth_service.token_ops.store_token(
        new_access_token,
        jwt_data.user_id,
        TokenType.USER_ACCESS,
        new_access_expires_at,
    )

    return ResponseUtils.ok(
        {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": TokenType.BEARER.value,
            "expires_in": expires_in,
        }
    )


@router.get("/me", response_model=CurrentUserInfoResponse)
async def get_me(
    ctx: UserContext = Depends(get_current_user),
):
    """获取当前用户信息."""

    user = await user_service.get_by_id(ctx.user_id)
    if not user:
        raise UserAuthFailedException(
            f"auth.get_me: 登录用户已不存在, user_id={ctx.user_id}"
        )

    data = (await user_service.build_client_user_info(user)).model_dump()
    data["subscription"] = await subscription_status_service.build_status_data(
        user_id=ctx.user_id,
        quota_u_id=str(ctx.user_id),
        device_id=ctx.device_id,
    )
    return ResponseUtils.ok(data)


@router.post("/send-email-code")
async def send_email_verify_code(
    data: SendEmailVerifyRequest,
    request: Request,
    x_device_id: str | None = Header(None, alias="X-Device-Id"),
):
    """发送邮箱验证码.

    1. 检查发送频率限制 (1分钟1次)
    2. 生成6位数字验证码
    3. 存储到 Redis (10分钟过期)
    4. 发送邮件 (重试3次)
    """
    await require_trusted_client_device(
        request=request,
        device_id=x_device_id,
        operation="send_email_verify_code",
    )

    language = get_locale(request).language

    await _send_email_verify_code_or_raise(data.email, language)

    return ResponseUtils.ok({"message": MESSAGE_VERIFY_CODE_SENT})


@router.post("/email-verify-login")
async def email_verify_login(
    data: EmailVerifyLoginRequest,
    request: Request,
    x_device_id: str | None = Header(None, alias="X-Device-Id"),
):
    """邮箱验证码登录/注册.

    1. 验证验证码 (最多5次)
    2. 如果用户不存在 -> 自动注册（赠送注册 Credits）
    3. 如果用户存在 -> 直接登录
    4. 生成 Token 并创建会话
    """
    await require_trusted_client_device(
        request=request,
        device_id=x_device_id,
        operation="email_verify_login",
    )

    # 验证验证码
    is_valid = await email_verification_service.verify_code(data.email, data.code)
    if not is_valid:
        raise AppCommonException(code=CommonCode.EMAIL_VERIFY_CODE_INVALID)

    # 获取用户，不存在则创建（带并发保护）
    user = await user_service.get_user_by_email(data.email)
    if not user:
        register_source, register_user_agent = _extract_registration_context(request)
        if data.registration_entry == "extension_v3":
            register_source = ClientProductEnum.EXTENSION
        register_ip = get_client_ip(request)
        register_country = (
            geoip_service.get_country(register_ip) if register_ip else None
        )
        try:
            user = (
                await user_service.create_user_without_password_with_registration_bonus(
                    email=data.email,
                    full_name=None,
                    register_source=register_source,
                    register_method="email_code",
                    register_device_id=data.register_device_id,
                    first_opened_at=data.first_opened_at,
                    register_user_agent=register_user_agent,
                    register_ip=register_ip,
                    register_country=register_country,
                )
            )
            logger.info(f"New user created via email verification: {data.email}")
        except IntegrityError:
            # 并发创建冲突，重新查询用户
            user = await user_service.get_user_by_email(data.email)
            if not user:
                # 理论上不应该发生，但作为保险
                logger.error(
                    f"Failed to create user after IntegrityError for {data.email}"
                )
                raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

    # 检查用户状态并完成登录
    _ensure_user_can_login(user)

    login_response = await _complete_login_flow(user, request)
    return ResponseUtils.ok(_serialize_login_response(login_response))


@router.post("/google-login")
async def google_login(data: GoogleLoginRequest, request: Request):
    """Google ID token 登录/注册.

    1. 服务端验签并校验 Google ID token
    2. Google 权威邮箱直接按 verified email 查找或创建用户
    3. 非权威第三方邮箱先发服务端确认出的邮箱验证码，不签发项目 token
    4. 直登分支复用通用登录流程生成项目 token 和会话
    """
    profile = await google_auth_service.verify_id_token(data.credential)

    if not profile.email_is_authoritative:
        await _send_email_verify_code_or_raise(
            profile.email,
            get_locale(request).language,
        )
        return ResponseUtils.ok(
            {
                "requires_email_verification": True,
                "email": profile.email,
            }
        )

    user = await _get_or_create_external_login_user(
        profile,
        request,
        "google",
        (
            ClientProductEnum.EXTENSION
            if data.registration_entry == "extension_v3"
            else ClientProductEnum.WEB
        ),
        data,
    )
    _ensure_user_can_login(user)

    login_response = await _complete_login_flow(user, request)
    return ResponseUtils.ok(_serialize_login_response(login_response))


@router.get("/google/oauth/authorize", include_in_schema=False)
async def google_oauth_authorize(request: Request, return_to: str | None = None):
    """手动 Google 登录按钮入口：校验 return_to 后跳转 Google OAuth。"""
    try:
        ip_address = _require_client_ip(request, "google_oauth_authorize.rate_limit")
        allowed = await _google_oauth_authorize_limiter.is_allowed(
            identifier=ip_address,
            limit=_GOOGLE_OAUTH_AUTHORIZE_RATE_LIMIT_MAX,
            window=_GOOGLE_OAUTH_AUTHORIZE_RATE_LIMIT_WINDOW,
        )
        if not allowed:
            logger.warning(f"Google OAuth authorize rate limited ip={ip_address}")
            raise AppCommonException(code=CommonCode.RATE_LIMIT_EXCEEDED)

        normalized_return_to = google_redirect_login_service.normalize_oauth_return_to(
            return_to
        )
        google_auth_service.require_oauth_client_config()
        state = await google_redirect_login_service.create_oauth_state(
            normalized_return_to
        )
        authorize_url = await google_auth_service.build_oauth_authorize_url(
            state=state,
        )
        return RedirectResponse(
            authorize_url,
            status_code=status.HTTP_302_FOUND,
        )
    except GoogleRedirectLoginError as exc:
        logger.warning(f"Google OAuth authorize failed reason={exc.reason}")
        return _google_redirect_error_response(exc.reason, None)
    except AppCommonException as exc:
        logger.warning(f"Google OAuth authorize failed with code={exc.code.name}")
        return _google_redirect_error_response(exc.code.name.lower(), None)
    except Exception as exc:
        logger.error(f"Google OAuth authorize failed unexpectedly: {exc}")
        return _google_redirect_error_response(
            CommonCode.INTERNAL_SERVER_ERROR.name.lower(),
            None,
        )


@router.get("/google/oauth/callback", include_in_schema=False)
async def google_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """接收 Google OAuth code flow 回调并签发一次性登录 code。"""
    redirect_state: str | None = None
    try:
        oauth_state = (state or "").strip()
        if not oauth_state:
            raise GoogleRedirectLoginError("missing_state")
        redirect_state = await google_redirect_login_service.consume_oauth_state(
            oauth_state
        )

        oauth_error = (error or "").strip()
        if oauth_error:
            logger.warning(f"Google OAuth callback returned error={oauth_error}")
            raise GoogleRedirectLoginError(oauth_error[:80])

        oauth_code = (code or "").strip()
        if not oauth_code:
            raise GoogleRedirectLoginError("missing_code")

        profile = await google_auth_service.exchange_oauth_code_for_profile(
            code=oauth_code,
            redirect_uri=google_auth_service.get_oauth_callback_uri(),
        )

        if not profile.email_is_authoritative:
            await _send_email_verify_code_or_raise(
                profile.email,
                get_locale(request).language,
            )
            return _google_redirect_response(
                {GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM: profile.email},
                redirect_state,
            )

        # 回跳地址来自已消费的 OAuth state，归因不依赖 Google 回调请求头：
        # 插件 browser identity 回调（chromiumapp.org）归 extension，其余归 web。
        register_source = (
            ClientProductEnum.EXTENSION
            if google_redirect_login_service.is_extension_callback_return_to(
                redirect_state
            )
            else ClientProductEnum.WEB
        )
        query = dict(parse_qsl(urlsplit(redirect_state).query))
        try:
            registration = RegistrationContext.model_validate(
                {
                    "registration_entry": (
                        "extension_v3"
                        if register_source == ClientProductEnum.EXTENSION
                        else None
                    ),
                    "register_device_id": query.get("register_device_id"),
                    "first_opened_at": query.get("first_opened_at"),
                }
            )
        except ValidationError:
            logger.error(
                "google_oauth_callback: 注册归因参数无效，忽略统计字段", exc_info=True
            )
            registration = RegistrationContext.model_validate({})
        user = await _get_or_create_external_login_user(
            profile, request, "google", register_source, registration
        )
        _ensure_user_can_login(user)
        login_code = await google_redirect_login_service.create_login_code(user.user_id)
        logger.info(f"Google OAuth login code created for user_id={user.user_id}")
        return _google_redirect_response(
            {GOOGLE_REDIRECT_CODE_PARAM: login_code},
            redirect_state,
        )
    except GoogleRedirectLoginError as exc:
        logger.warning(f"Google OAuth callback failed reason={exc.reason}")
        return _google_redirect_error_response(exc.reason, redirect_state)
    except AppCommonException as exc:
        logger.warning(f"Google OAuth callback failed with code={exc.code.name}")
        return _google_redirect_error_response(exc.code.name.lower(), redirect_state)
    except Exception as exc:
        logger.error(f"Google OAuth callback failed unexpectedly: {exc}")
        return _google_redirect_error_response(
            CommonCode.INTERNAL_SERVER_ERROR.name.lower(),
            redirect_state,
        )


@router.post("/google/exchange")
async def google_redirect_exchange(
    data: GoogleLoginCodeExchangeRequest,
    request: Request,
):
    """使用 Google redirect 一次性 code 换取项目 token。"""
    user_id = await google_redirect_login_service.consume_login_code(data.code)
    user = await user_service.get_by_id(user_id)
    if not user:
        raise AppCommonException(code=CommonCode.USER_NOT_FOUND)

    _ensure_user_can_login(user)
    login_response = await _complete_login_flow(user, request)
    return ResponseUtils.ok(_serialize_login_response(login_response))
