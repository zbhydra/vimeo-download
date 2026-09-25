"""插件端（`extension/`，Chrome MV3）登录与注册归因的 real API 测试。

真实资源依赖：
- MySQL: users / user_credit_accounts / user_subscriptions 表
- Redis: 邮箱验证码与用户 token 白名单

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/auth/email-verify-login | Y | public | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | Y
POST /api/client/auth/google-login | Y | public | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | plan-excluded | Y

注册归因覆盖：邮箱、One Tap、OAuth 各验证 web / extension 首次落库、失败不建号、再次登录不覆盖。
registration_entry 的缺省值与合法值走真实请求；非法字符串、类型、注入内容由 Literal 校验。
原登录凭据边界沿用认证 API 测试，本文件只验证新增归因合同。
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
import secrets
import json
import time
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient, AsyncHTTPTransport, Request, Response
import jwt
import pytest
from sqlalchemy import delete, select, text

from app.constants.auth import TokenType
from app.core.config import settings
from app.core.database import get_async_session, get_engine
from app.core.redis import redis_client
from app.i18n.common_code import CommonCode
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.models.user_model import UserModel
from app.models.user_ip_register_model import UserIpRegisterModel
from app.services.email_verification_service import email_verification_service
from app.services.google_auth_service import GOOGLE_JWKS_URL, GOOGLE_OAUTH_TOKEN_URL
from app.services.google_redirect_login_service import google_redirect_login_service
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

# 插件 browser identity 回调域名形状：32 位小写 a-p 扩展 ID + chromiumapp.org。
EXTENSION_CALLBACK_URL = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org"


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的真实测试用户。"""

    emails: list[str]


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _delete_extension_login_user(email: str) -> None:
    """删除本文件创建的用户及其 Redis token。"""
    async with get_async_session() as db:
        user_id = await db.scalar(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        if user_id is None:
            return

        await user_token_service.revoke_all_user_tokens(user_id)
        await db.execute(
            delete(UserCreditLogModel).where(UserCreditLogModel.user_id == user_id)
        )
        await db.execute(
            delete(UserCreditAccountModel).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
        await db.execute(
            delete(UserSubscriptionModel).where(
                UserSubscriptionModel.user_id == user_id
            )
        )
        await db.execute(
            delete(UserIpRegisterModel).where(UserIpRegisterModel.user_id == user_id)
        )
        await db.execute(delete(UserModel).where(UserModel.user_id == user_id))
        await db.commit()


async def _create_real_user_with_web_token(email: str) -> tuple[UserModel, str]:
    """创建真实用户及已登记的 Website access token。"""
    user = await UserService().create_user_without_password(email=email)
    token, expires_at = JwtUnit.create_access_token(
        JwtData(user_id=user.user_id, email=email)
    )
    await user_token_service.store_token(
        token,
        user.user_id,
        TokenType.USER_ACCESS,
        expires_at,
    )
    return user, token


@pytest.fixture
async def real_extension_login_schema_ready(
    real_mysql_ready: None,
    real_redis_ready: None,
) -> None:
    """检查 v3 登录 real 测试依赖的真实表。"""
    required_tables = {
        "users",
        "user_credit_accounts",
        "user_credit_logs",
        "user_subscriptions",
    }
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_extension_login_cleanup_state(
    real_extension_login_schema_ready: None,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实测试用户。"""
    state = _CleanupState(emails=[])
    try:
        yield state
    finally:
        for email in state.emails:
            await _delete_extension_login_user(email)


@pytest.fixture
def make_extension_login_real_email(
    real_extension_login_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], str]:
    """生成并登记本文件可清理的测试邮箱。"""

    def _make_email(label: str) -> str:
        email = make_test_email(label)
        real_extension_login_cleanup_state.emails.append(email)
        return email

    return _make_email


@pytest.mark.parametrize("method", ["email", "one_tap", "oauth"])
@pytest.mark.parametrize("entry", [None, "extension_v3"])
async def test_real_v3_registration_source_is_preserved(
    real_async_client: AsyncClient,
    make_extension_login_real_email: Callable[[str], str],
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    entry: str | None,
) -> None:
    """三条真实登录链按入口归因；验证失败不建号，老用户来源不被覆盖。"""
    email = make_extension_login_real_email(f"source-{method}-{entry}")
    device_id = secrets.token_hex(16)
    headers = {"X-Client-Product": "web", "X-Device-Id": device_id}
    registration_device_id = str(uuid4())
    first_opened_at = int(time.time() * 1000) - 86400000
    external_available = False
    credential = ""
    if method != "email":
        if not settings.auth.google_client_id:
            pytest.skip("Google 测试需要本地已有客户端配置（只需 client id 充当 aud）")
        # 本链路自签 id_token（下面生成 RSA key）并把 Google 端点整体拦截，不需要真实 secret；
        # 但 OAuth code flow 的换码有「id 与 secret 都非空」前置校验，故就地注入测试值，
        # 让用例不依赖部署配置里是否填了 GOOGLE_CLIENT_SECRET。
        monkeypatch.setattr(
            settings.auth, "google_client_secret", "test-google-client-secret"
        )
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        kid = secrets.token_hex(16)
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
        jwk["kid"] = kid
        credential = jwt.encode(
            {
                "iss": "https://accounts.google.com",
                "aud": settings.auth.google_client_id,
                "sub": kid,
                "email": email,
                "email_verified": True,
                "hd": "example.com",
                "exp": int(time.time()) + 300,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": kid},
        )
        original_send = AsyncHTTPTransport.handle_async_request

        async def google_http(
            transport: AsyncHTTPTransport, request: Request
        ) -> Response:
            if str(request.url) not in {GOOGLE_JWKS_URL, GOOGLE_OAUTH_TOKEN_URL}:
                return await original_send(transport, request)
            if not external_available:
                return Response(503, request=request, json={"error": "unavailable"})
            payload = (
                {"keys": [jwk]}
                if str(request.url) == GOOGLE_JWKS_URL
                else {"id_token": credential}
            )
            return Response(200, request=request, json=payload)

        monkeypatch.setattr(AsyncHTTPTransport, "handle_async_request", google_http)
    else:
        icon = await real_async_client.get(
            "/assets/icons/logo.svg", cookies={"client_uuid": device_id}
        )
        assert icon.status_code == 200

    async def login(registration_entry: str | None) -> Response:
        registration = {
            "register_device_id": registration_device_id,
            "first_opened_at": first_opened_at,
        }
        if method == "oauth":
            # 插件 Google 登录由 background 的 launchWebAuthFlow 直接打开后端 authorize，
            # 回跳地址是运行时扩展 ID 的 chromiumapp.org 回调；网站入口仍是网站自身页面。
            # 归因只看回跳地址，查询串只带设备身份（见 tech-第三方登录 §4）。
            website_base_url = settings.app.public_website_base_url.rstrip("/")
            return_to = (
                f"{EXTENSION_CALLBACK_URL}/google-login"
                if registration_entry
                else f"{website_base_url}/pricing/"
            )
            state = await google_redirect_login_service.create_oauth_state(
                f"{return_to}?{urlencode(registration)}"
            )
            return await real_async_client.get(
                "/api/client/auth/google/oauth/callback",
                params={"state": state, "code": "test-oauth-code"},
            )
        body = {"registration_entry": registration_entry, **registration}
        if method == "email":
            redis = await redis_client.get_client()
            await redis.set(
                email_verification_service._build_key(email), "123456", ex=60
            )
            body.update(email=email, code="123456" if external_available else "000000")
            endpoint = "email-verify-login"
        else:
            body.update(credential=credential)
            endpoint = "google-login"
        return await real_async_client.post(
            f"/api/client/auth/{endpoint}", json=body, headers=headers
        )

    failed = await login(entry)
    if method == "oauth":
        assert failed.status_code == 303
        assert "google_login_error" in parse_qs(
            urlsplit(failed.headers["location"]).query
        )
    else:
        assert failed.status_code == (500 if method == "one_tap" else 200)
        expected = (
            CommonCode.INTERNAL_SERVER_ERROR
            if method == "one_tap"
            else CommonCode.EMAIL_VERIFY_CODE_INVALID
        )
        assert failed.json()["code"] == expected.value
    async with get_async_session() as db:
        assert (
            await db.scalar(select(UserModel.user_id).where(UserModel.email == email))
            is None
        )

    external_available = True
    original_device_id = registration_device_id
    original_first_opened_at = first_opened_at
    for next_entry in [entry, None if entry else "extension_v3"]:
        response = await login(next_entry)
        if method == "oauth":
            assert response.status_code == 303
            params = parse_qs(urlsplit(response.headers["location"]).query)
            response = await real_async_client.post(
                "/api/client/auth/google/exchange",
                json={"code": params["google_login_code"][0]},
            )
        assert response.status_code == 200
        assert response.json()["code"] == 10000
        async with get_async_session() as db:
            stored = (
                await db.execute(
                    select(
                        UserModel.register_source,
                        UserModel.register_device_id,
                        UserModel.first_opened_at,
                    ).where(UserModel.email == email)
                )
            ).one()
            assert stored == (
                "extension" if entry else "web",
                original_device_id,
                original_first_opened_at,
            )
        registration_device_id = str(uuid4())
        first_opened_at += 1000


async def test_real_deleted_user_session_returns_unauthorized(
    real_async_client: AsyncClient,
    make_extension_login_real_email: Callable[[str], str],
) -> None:
    """账号被删除但 token 仍在白名单时，返回 401 让客户端清除旧会话。"""
    email = make_extension_login_real_email("deleted-session")
    user, token = await _create_real_user_with_web_token(email)
    try:
        async with get_async_session() as db:
            await db.execute(delete(UserModel).where(UserModel.user_id == user.user_id))
            await db.commit()
        response = await real_async_client.get(
            "/api/client/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.content == b""
    finally:
        await user_token_service.revoke_all_user_tokens(user.user_id)
