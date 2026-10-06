"""
Auth API Tests - Using Real Database

Tests for client authentication endpoints including:
- User registration
- User login/logout
- Token refresh
- Email verification login
- Error cases (invalid credentials, duplicate registration, etc.)

Note: This API uses a custom response format where successful endpoint returns 201,
and errors return 200 with error code in response body.
"""

from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import delete, select, text

from app.constants.auth import MESSAGE_VERIFY_CODE_SENT
from app.core.config import settings
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_first_day_model import UserFirstDayModel
from app.models.user_model import UserModel
from app.services.device_service import DEVICE_TRUST_CONFIG_KEY, device_service
from app.services.email_verification_service import SendResult
from app.services.google_auth_service import GoogleTokenProfile
from app.services.subscription_service import subscription_service
from app.services.user_auth_service import UserAuthService
from app.utils.jwt import JwtUnit
from app.utils.time import get_today_start_timestamp, timestamp_now, timestamp_to_ymd
from app.utils.uid import build_user_scope


# Test data constants
TEST_USER_PASSWORD = "Test123456!"
TEST_USER_FULL_NAME = "Test Auth User"
TEST_DEVICE_ID = "test-device-auth-api"
TEST_TRUSTED_IP = "203.0.113.10"
BRAND_LOGO_SVG_PATH = "/assets/icons/logo.svg"


def unwrap_ok(response):
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 10000
    return payload["data"]


def parse_google_redirect_response(response):
    assert response.status_code == 303
    redirect_url = response.headers["location"]
    parsed_redirect = urlsplit(redirect_url)
    return parsed_redirect, parse_qs(parsed_redirect.query)


def enable_device_trust(monkeypatch: pytest.MonkeyPatch) -> None:
    """让当前测试按开启设备可信校验执行。"""

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        if c_key == DEVICE_TRUST_CONFIG_KEY:
            return {"verify_device_id": True}
        return None

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )


async def trust_test_device(
    async_client,
    device_id: str,
    ip: str = TEST_TRUSTED_IP,
) -> dict[str, str]:
    """通过 Website 站点图标 SVG 资源为测试设备建立可信关系。"""
    response = await async_client.get(
        BRAND_LOGO_SVG_PATH,
        cookies={"client_uuid": device_id},
        headers={"X-Forwarded-For": ip},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    assert_site_icon_svg(response.text)

    return {"X-Device-Id": device_id, "X-Forwarded-For": ip}


def assert_site_icon_svg(svg_text: str) -> None:
    """断言站点图标 SVG 路径返回 32×32 透明 SVG。"""
    assert svg_text.lstrip().startswith("<svg")
    assert 'width="32"' in svg_text
    assert 'height="32"' in svg_text
    assert "fill=" not in svg_text


def _previous_ymd() -> int:
    """返回业务时区昨天的 YYYYMMDD，用于构造更早日期的首日事实行。"""

    return int(timestamp_to_ymd(get_today_start_timestamp() - 1).replace("-", ""))


async def _mark_account_non_first_day(email: str) -> str:
    """按邮箱找到已注册账号，登记更早日期的首日事实行，返回待清理的 uid。

    首日判定只认 `user_first_day` 事实表：刚注册的账号没有事实行时必然判为首日，
    降级用例会拿到首日不限次额度（`daily_limit=-1`）而不是档位额度。这里显式安排
    "更早日期的既有事实行"，让用例结论只取决于它自己安排的数据。
    """

    async with get_async_session() as db:
        user_id = await db.scalar(
            select(UserModel.user_id).where(UserModel.email == email)
        )
    assert user_id is not None, f"registered user not found, email={email}"
    uid, value = build_user_scope(user_id)
    async with get_async_session() as db:
        db.add(
            UserFirstDayModel(  # type: ignore[call-arg]
                uid=uid,
                ymd=_previous_ymd(),
                value=value,
                created_at=timestamp_now(),
            )
        )
        await db.commit()
    return uid


async def _delete_first_day_fact(uid: str) -> None:
    """删除用例自己安排的首日事实行。"""

    async with get_async_session() as db:
        await db.execute(delete(UserFirstDayModel).where(UserFirstDayModel.uid == uid))
        await db.commit()


def test_create_tokens_for_user_returns_seconds_expires_in():
    service = UserAuthService()
    user = UserModel(user_id=1, email="token-contract@example.com")

    access_token, _refresh_token, expires_in = service.create_tokens_for_user(user)
    jwt_data = JwtUnit.decode_token(access_token)

    assert 0 < expires_in <= settings.auth.access_token_expire
    assert expires_in > settings.auth.access_token_expire - 5
    assert jwt_data is not None
    assert jwt_data.exp < 10_000_000_000


@pytest.mark.asyncio
class TestAuthRegisterAPI:
    """Test user registration endpoint."""

    async def test_register_new_user_success(
        self, async_client, test_db_session, make_test_email
    ):
        """Test successful user registration."""
        email = make_test_email("new-user")
        user_agent = "Mozilla/5.0 Test Web Register"

        # Register user
        response = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
            headers={
                "User-Agent": user_agent,
                "X-Client-Product": "web",
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == 10000
        data = payload["data"]
        assert data["email"] == email
        assert data["full_name"] == TEST_USER_FULL_NAME
        assert "user_id" in data
        assert "created_at" in data

        result = await test_db_session.execute(
            text(
                "SELECT register_source, register_user_agent "
                "FROM users WHERE email = :email"
            ),
            {"email": email},
        )
        row = result.one()
        assert row.register_source == "web"
        assert row.register_user_agent == user_agent

    async def test_register_duplicate_email_fails(self, async_client, make_test_email):
        """Test registering with duplicate email returns error."""
        email = make_test_email("duplicate")

        # First registration
        response1 = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )
        unwrap_ok(response1)

        # Second registration should fail
        response = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": "AnotherPassword123!",
                "full_name": "Duplicate User",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == CommonCode.USER_EMAIL_EXISTS.value

    async def test_register_with_short_password_fails(
        self, async_client, make_test_email
    ):
        """Test registration with short password returns validation error."""
        response = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": make_test_email("short"),
                "password": "12345",
                "full_name": "Short Password",
            },
        )

        assert response.status_code == 422

    async def test_register_with_invalid_email_fails(self, async_client):
        """Test registration with invalid email returns validation error."""
        response = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": "not-an-email",
                "password": TEST_USER_PASSWORD,
                "full_name": "Invalid Email",
            },
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestAuthLoginAPI:
    """Test user login endpoint."""

    async def test_login_with_valid_credentials(self, async_client, make_test_email):
        """Test successful login with valid credentials."""
        email = make_test_email("login-valid")

        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )

        # Login
        response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": TEST_USER_PASSWORD},
        )

        data = unwrap_ok(response)
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert data["user"]["email"] == email

    async def test_login_with_wrong_password_fails(self, async_client, make_test_email):
        """Test login with wrong password returns error."""
        email = make_test_email("login-wrong")

        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )

        # Login with wrong password
        response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": "WrongPassword123!"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == CommonCode.AUTH_INVALID_CREDENTIALS.value

    async def test_login_with_nonexistent_user_fails(
        self, async_client, make_test_email
    ):
        """Test login with non-existent user returns error."""
        response = await async_client.post(
            "/api/client/auth/login",
            json={"email": make_test_email("missing"), "password": "AnyPassword123!"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == CommonCode.AUTH_INVALID_CREDENTIALS.value


@pytest.mark.asyncio
class TestAuthLogoutAPI:
    """Test user logout endpoint."""

    async def test_logout_success(self, async_client, make_test_email):
        """Test successful logout."""
        email = make_test_email("logout")

        # Register and login
        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )

        login_response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": TEST_USER_PASSWORD},
        )
        token = unwrap_ok(login_response)["access_token"]

        # Logout
        response = await async_client.post(
            "/api/client/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestAuthRefreshTokenAPI:
    """Test token refresh endpoint."""

    async def test_refresh_token_success(self, async_client, make_test_email):
        """Test successful token refresh."""
        email = make_test_email("refresh")

        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )

        login_response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": TEST_USER_PASSWORD},
        )
        refresh_token = unwrap_ok(login_response)["refresh_token"]

        # Refresh token
        response = await async_client.post(
            "/api/client/auth/refresh", json={"refresh_token": refresh_token}
        )

        data = unwrap_ok(response)
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_refresh_with_invalid_token_fails(self, async_client):
        """Test refresh with invalid token returns error."""
        response = await async_client.post(
            "/api/client/auth/refresh",
            json={"refresh_token": "invalid_refresh_token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == CommonCode.AUTH_INVALID_CREDENTIALS.value


@pytest.mark.asyncio
class TestAuthGetMeAPI:
    """Test get current user endpoint."""

    async def test_get_me_success(self, async_client, make_test_email):
        """Test getting current user info."""
        email = make_test_email("getme")

        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )

        login_response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": TEST_USER_PASSWORD},
        )
        token = unwrap_ok(login_response)["access_token"]

        # Get user info
        response = await async_client.get(
            "/api/client/auth/me", headers={"Authorization": f"Bearer {token}"}
        )

        data = unwrap_ok(response)
        assert data["email"] == email
        assert data["full_name"] == TEST_USER_FULL_NAME
        assert "user" not in data
        assert "credits_balance" in data
        assert data["subscription"]["period"] in {"free", "month"}
        # 刚注册的账号当天处于首日：与下载链路同口径展示为不限次。
        assert data["subscription"]["daily_limit"] == -1
        assert "extension_download" in data["subscription"]

    async def test_get_me_subscription_config_failure_degrades(
        self, async_client, make_test_email, monkeypatch
    ):
        """订阅配置异常只影响订阅展示，不能阻断账号和 Credits 响应。"""
        email = make_test_email("getme-subscription-config-failure")

        await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_FULL_NAME,
            },
        )
        login_response = await async_client.post(
            "/api/client/auth/login",
            json={"email": email, "password": TEST_USER_PASSWORD},
        )
        token = unwrap_ok(login_response)["access_token"]

        async def fail_get_user_subscription_config(user_id: int):
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "test_get_me_subscription_config_failure_degrades: "
                    f"broken subscription config, user_id={user_id}"
                ),
            )

        monkeypatch.setattr(
            subscription_service,
            "get_user_subscription_config",
            fail_get_user_subscription_config,
        )

        # 首日额度独立于订阅配置（配置异常只降级到档位额度 0），本用例断言的是这条
        # 降级口径，因此显式把账号安排成非首日，不依赖新账号的默认首日状态。
        first_day_uid = await _mark_account_non_first_day(email)
        try:
            response = await async_client.get(
                "/api/client/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
        finally:
            await _delete_first_day_fact(first_day_uid)

        data = unwrap_ok(response)
        assert data["email"] == email
        assert "credits_balance" in data
        assert data["subscription"]["status"] == "unavailable"
        assert data["subscription"]["period"] == "unavailable"
        assert data["subscription"]["display_name"] == "Subscription unavailable"
        assert data["subscription"]["daily_limit"] == 0

    async def test_get_me_without_token_fails(self, async_client):
        """Test getting user info without auth token returns error."""
        response = await async_client.get("/api/client/auth/me")

        # FastAPI dependency returns 401 before reaching route handler
        assert response.status_code == 401

    async def test_get_me_with_invalid_token_fails(self, async_client):
        """Test getting user info with invalid token returns error."""
        response = await async_client.get(
            "/api/client/auth/me", headers={"Authorization": "Bearer invalid_token"}
        )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestBrandLogoSvgAPI:
    """Test Website trusted SVG resource endpoint."""

    async def test_brand_logo_svg_sets_device_trust(
        self, async_client, monkeypatch, make_test_device_id
    ):
        """合法 client_uuid Cookie 会写入设备可信关系。"""
        enable_device_trust(monkeypatch)
        device_id = make_test_device_id("logo-svg")

        await trust_test_device(async_client, device_id)

        assert await device_service.verify(device_id, TEST_TRUSTED_IP)
        assert await device_service.verify(device_id, "203.0.113.11")

    async def test_brand_logo_svg_returns_logo_without_cookie(
        self,
        async_client,
        caplog,
    ):
        """Logo 路径缺少 Cookie 时仍返回站点图标 SVG。"""
        with caplog.at_level("INFO", logger="server"):
            response = await async_client.get(BRAND_LOGO_SVG_PATH)

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/svg+xml; charset=utf-8"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        assert_site_icon_svg(response.text)
        assert "device_trust_set_skipped: reason=missing_client_uuid" in caplog.text
        assert f"path={BRAND_LOGO_SVG_PATH}" in caplog.text

    async def test_legacy_credits_svg_path_is_removed(self, async_client):
        """旧 Credits 路径不再注册。"""
        response = await async_client.get("/assets/icons/credits.svg")

        assert response.status_code == 404

    async def test_brand_logo_svg_ignores_invalid_cookie_without_trust(
        self, async_client, monkeypatch, caplog, make_test_device_id
    ):
        """非法 client_uuid Cookie 仍返回 SVG，且不建立设备可信关系。"""
        enable_device_trust(monkeypatch)
        invalid_device_id = f"{make_test_device_id('invalid-cookie')} bad"

        with caplog.at_level("INFO", logger="server"):
            response = await async_client.get(
                BRAND_LOGO_SVG_PATH,
                cookies={"client_uuid": invalid_device_id},
                headers={"X-Forwarded-For": TEST_TRUSTED_IP},
            )

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/svg+xml; charset=utf-8"
        assert_site_icon_svg(response.text)
        assert not await device_service.verify(invalid_device_id, TEST_TRUSTED_IP)
        assert "device_trust_set_skipped: reason=invalid_client_uuid" in caplog.text
        assert "error_code=INVALID_DEVICE_ID" in caplog.text

    async def test_brand_logo_svg_logs_skip_when_client_ip_missing(
        self, async_client, monkeypatch, caplog, make_test_device_id
    ):
        """无法解析客户端 IP 时返回 SVG，但打印可信关系未写入原因。"""
        enable_device_trust(monkeypatch)
        device_id = make_test_device_id("missing-ip")

        def missing_client_ip(_request):
            return None

        monkeypatch.setattr(
            "app.api.client.brand_asset_client.get_client_ip",
            missing_client_ip,
        )

        with caplog.at_level("INFO", logger="server"):
            response = await async_client.get(
                BRAND_LOGO_SVG_PATH,
                cookies={"client_uuid": device_id},
            )

        assert response.status_code == 200
        assert_site_icon_svg(response.text)
        assert not await device_service.verify(device_id, TEST_TRUSTED_IP)
        assert "device_trust_set_skipped: reason=missing_client_ip" in caplog.text

    async def test_brand_logo_svg_returns_logo_when_redis_set_fails(
        self, async_client, monkeypatch, make_test_device_id
    ):
        """Redis 写入失败时 SVG 路由 fail-open。"""
        device_id = make_test_device_id("logo-redis-fail")

        async def fail_get_client():
            raise RuntimeError("test redis unavailable for device trust set")

        monkeypatch.setattr(
            "app.services.device_service.redis_client.get_client",
            fail_get_client,
        )

        response = await async_client.get(
            BRAND_LOGO_SVG_PATH,
            cookies={"client_uuid": device_id},
            headers={"X-Forwarded-For": TEST_TRUSTED_IP},
        )

        assert response.status_code == 200
        assert_site_icon_svg(response.text)

    async def test_brand_logo_svg_internal_error_returns_svg_404(
        self, async_client, monkeypatch
    ):
        """路由内部异常返回非 JSON 404，但响应体仍是 SVG 文档。"""

        async def fail_store_device_trust(_request):
            raise RuntimeError("test brand logo svg route failure")

        monkeypatch.setattr(
            "app.api.client.brand_asset_client._store_device_trust_from_cookie",
            fail_store_device_trust,
        )

        response = await async_client.get(BRAND_LOGO_SVG_PATH)

        assert response.status_code == 404
        assert response.headers["content-type"] == "image/svg+xml; charset=utf-8"
        assert_site_icon_svg(response.text)


@pytest.mark.asyncio
class TestEmailVerificationAPI:
    """Test email verification login endpoint."""

    async def test_send_email_verify_code_success(
        self, async_client, monkeypatch, make_test_email, make_test_device_id
    ):
        """Test sending email verification code."""
        email = make_test_email("verify-code")
        send_calls: list[tuple[str, str]] = []
        headers = await trust_test_device(
            async_client,
            make_test_device_id("verify-code"),
        )

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            send_calls.append((target_email, language))
            return SendResult.SUCCESS

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/send-email-code",
            json={"email": email},
            headers=headers,
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == 10000
        assert payload["data"] == {"message": MESSAGE_VERIFY_CODE_SENT}
        assert send_calls == [(email, "en-US")]

    async def test_send_email_verify_code_maps_send_failed(
        self, async_client, monkeypatch, make_test_email, make_test_device_id
    ):
        """邮件发送失败时映射为邮箱验证码发送失败错误码。"""
        email = make_test_email("verify-send-failed")
        headers = await trust_test_device(
            async_client,
            make_test_device_id("verify-send-failed"),
        )

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            return SendResult.SEND_FAILED

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/send-email-code",
            json={"email": email},
            headers=headers,
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == CommonCode.EMAIL_VERIFY_SEND_FAILED.value

    async def test_send_email_verify_code_invalid_format_fails(self, async_client):
        """Test sending verification code with invalid email format."""
        response = await async_client.post(
            "/api/client/auth/send-email-code",
            json={"email": "invalid-email"},
            headers={"X-Device-Id": TEST_DEVICE_ID},
        )

        assert response.status_code == 422

    async def test_send_email_verify_code_allows_untrusted_extension_device(
        self, async_client, monkeypatch, caplog, make_test_email, make_test_device_id
    ):
        """开关打开时插件来源不被设备可信闸门拦下：插件设备没有建立可信关系的通道。"""
        enable_device_trust(monkeypatch)
        device_id = make_test_device_id("extension-bypass")

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            return SendResult.SUCCESS

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        with caplog.at_level("INFO", logger="server"):
            response = await async_client.post(
                "/api/client/auth/send-email-code",
                json={"email": make_test_email("extension-bypass")},
                headers={
                    "X-Device-Id": device_id,
                    "X-Forwarded-For": TEST_TRUSTED_IP,
                    "X-Client-Product": "extension",
                },
            )

        # 同一设备不带产品头时已被上一条用例证明会被拒绝，差异只来自产品头。
        assert response.status_code == 200
        assert response.json()["code"] == 10000
        assert "device_trust_bypassed_for_extension" in caplog.text

    async def test_send_email_verify_code_rejects_untrusted_device_before_send(
        self, async_client, monkeypatch, make_test_email, make_test_device_id
    ):
        """未可信设备在发送邮件前被拒绝。"""
        enable_device_trust(monkeypatch)
        send_calls: list[tuple[str, str]] = []
        device_id = make_test_device_id("verify-send-reject")

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            send_calls.append((target_email, language))
            return SendResult.SUCCESS

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/send-email-code",
            json={"email": make_test_email("send-reject")},
            headers={"X-Device-Id": device_id, "X-Forwarded-For": TEST_TRUSTED_IP},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED.value
        assert payload["msg"] == "Please refresh the page and try again."
        assert send_calls == []

    async def test_send_email_verify_code_allows_untrusted_device_when_guard_disabled(
        self, async_client, monkeypatch, make_test_email, make_test_device_id
    ):
        """配置关闭时，未建立 Redis 可信关系的设备也能发送验证码。"""
        email = make_test_email("verify-guard-disabled")
        send_calls: list[tuple[str, str]] = []

        async def fake_get(c_key: str, *, force_refresh: bool = False):
            assert force_refresh is False
            if c_key == DEVICE_TRUST_CONFIG_KEY:
                return {"verify_device_id": False}
            return None

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            send_calls.append((target_email, language))
            return SendResult.SUCCESS

        monkeypatch.setattr(
            "app.services.device_service.config_public_service.get",
            fake_get,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/send-email-code",
            json={"email": email},
            headers={
                "X-Device-Id": make_test_device_id("guard-disabled"),
                "X-Forwarded-For": TEST_TRUSTED_IP,
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == 10000
        assert send_calls == [(email, "en-US")]

    async def test_email_verify_login_rejects_invalid_code_after_device_check(
        self, async_client, make_test_email, make_test_device_id
    ):
        """可信设备上的错误验证码返回明确验证码错误码。"""
        email = make_test_email("verify-login-invalid")
        headers = await trust_test_device(
            async_client,
            make_test_device_id("verify-login-invalid"),
        )

        wrong_code_response = await async_client.post(
            "/api/client/auth/email-verify-login",
            json={"email": email, "code": "000000"},
            headers=headers,
        )
        assert wrong_code_response.status_code == 200
        data = wrong_code_response.json()
        assert data["code"] == CommonCode.EMAIL_VERIFY_CODE_INVALID.value

    async def test_email_verify_login_with_invalid_code_fails(
        self, async_client, make_test_email, make_test_device_id
    ):
        """Test email verification login with invalid code."""
        headers = await trust_test_device(
            async_client,
            make_test_device_id("verify-invalid-code"),
        )

        response = await async_client.post(
            "/api/client/auth/email-verify-login",
            json={"email": make_test_email("invalid-code"), "code": "000000"},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == CommonCode.EMAIL_VERIFY_CODE_INVALID.value

    async def test_email_verify_login_registers_source_and_user_agent(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
        make_test_device_id,
    ):
        """Test email verification auto-registration stores source and user agent."""
        email = make_test_email("verify-source")
        user_agent = "Mozilla/5.0 Extension Register"
        headers = await trust_test_device(
            async_client,
            make_test_device_id("verify-source"),
        )

        async def fake_verify_code(_email: str, _code: str) -> bool:
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.verify_code",
            fake_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/email-verify-login",
            json={"email": email, "code": "123456"},
            headers={
                **headers,
                "User-Agent": user_agent,
                "X-Client-Product": "extension",
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == 10000
        data = payload["data"]
        assert data["user"]["email"] == email

        result = await test_db_session.execute(
            text(
                "SELECT register_source, register_user_agent "
                "FROM users WHERE email = :email"
            ),
            {"email": email},
        )
        row = result.one()
        assert row.register_source == "extension"
        assert row.register_user_agent == user_agent

    async def test_email_verify_login_rejects_untrusted_device_before_code_verify(
        self, async_client, monkeypatch, make_test_email, make_test_device_id
    ):
        """未可信设备不会消耗验证码校验次数。"""
        enable_device_trust(monkeypatch)
        verify_calls: list[tuple[str, str]] = []
        device_id = make_test_device_id("verify-login-reject")

        async def fake_verify_code(_email: str, _code: str) -> bool:
            verify_calls.append((_email, _code))
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.verify_code",
            fake_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/email-verify-login",
            json={"email": make_test_email("login-reject"), "code": "123456"},
            headers={"X-Device-Id": device_id, "X-Forwarded-For": TEST_TRUSTED_IP},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED.value
        assert verify_calls == []


@pytest.mark.asyncio
class TestGoogleLoginAPI:
    """Test Google login endpoint."""

    async def test_google_authoritative_first_login_creates_google_user(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
    ):
        """Google 权威邮箱首次登录会创建用户并记录首次注册方式。"""
        email = make_test_email("google-first")

        async def fake_verify_id_token(_credential: str) -> GoogleTokenProfile:
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-first",
                full_name="Google First User",
                avatar_url="https://example.com/avatar.png",
                email_is_authoritative=True,
            )

        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.verify_id_token",
            fake_verify_id_token,
        )

        response = await async_client.post(
            "/api/client/auth/google-login",
            json={"credential": "fake-google-id-token"},
            headers={"X-Client-Product": "extension"},
        )

        data = unwrap_ok(response)
        assert data["access_token"]
        assert data["user"]["email"] == email

        result = await test_db_session.execute(
            text(
                "SELECT register_source, register_method, full_name, avatar_url "
                "FROM users WHERE email = :email"
            ),
            {"email": email},
        )
        row = result.one()
        assert row.register_source == "web"
        assert row.register_method == "google"
        assert row.full_name == "Google First User"
        assert row.avatar_url == "https://example.com/avatar.png"

    async def test_google_existing_email_does_not_overwrite_register_method(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
        make_test_device_id,
    ):
        """同邮箱已有账号用 Google 登录时不覆盖首次注册方式。"""
        email = make_test_email("google-existing")
        headers = await trust_test_device(
            async_client,
            make_test_device_id("google-existing"),
        )

        async def fake_verify_code(_email: str, _code: str) -> bool:
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.verify_code",
            fake_verify_code,
        )

        first_response = await async_client.post(
            "/api/client/auth/email-verify-login",
            json={"email": email, "code": "123456"},
            headers=headers,
        )
        first_data = unwrap_ok(first_response)
        first_user_id = first_data["user"]["user_id"]

        async def fake_verify_id_token(_credential: str) -> GoogleTokenProfile:
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-existing",
                full_name="Google Existing User",
                avatar_url=None,
                email_is_authoritative=True,
            )

        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.verify_id_token",
            fake_verify_id_token,
        )

        response = await async_client.post(
            "/api/client/auth/google-login",
            json={"credential": "fake-google-id-token"},
        )

        data = unwrap_ok(response)
        assert data["user"]["user_id"] == first_user_id
        assert data["user"]["email"] == email

        result = await test_db_session.execute(
            text("SELECT register_method FROM users WHERE email = :email"),
            {"email": email},
        )
        row = result.one()
        assert row.register_method == "email_code"

    async def test_google_non_authoritative_email_requires_email_verification(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
    ):
        """非权威 Google 邮箱只发验证码，不签发项目 token。"""
        email = make_test_email("google-third-party")
        send_calls: list[tuple[str, str]] = []

        async def fake_verify_id_token(_credential: str) -> GoogleTokenProfile:
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-third-party",
                full_name="Third Party User",
                avatar_url=None,
                email_is_authoritative=False,
            )

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            send_calls.append((target_email, language))
            return SendResult.SUCCESS

        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.verify_id_token",
            fake_verify_id_token,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )

        response = await async_client.post(
            "/api/client/auth/google-login",
            json={"credential": "fake-google-id-token"},
            headers={"Accept-Language": "zh-CN"},
        )

        data = unwrap_ok(response)
        assert data == {
            "requires_email_verification": True,
            "email": email,
        }
        assert "access_token" not in data
        assert send_calls == [(email, "zh-CN")]

        result = await test_db_session.execute(
            text("SELECT COUNT(*) FROM users WHERE email = :email"),
            {"email": email},
        )
        assert result.scalar_one() == 0

    @pytest.mark.parametrize(
        ("return_to", "expected_return_to"),
        [
            (
                "https://vimeodownloader.app/ext-pricing/?plan=month&google_login_error=old",
                "https://vimeodownloader.app/ext-pricing/?plan=month",
            ),
            # 插件 browser identity 回调：设备归因参数与路径原样进入 OAuth state。
            (
                "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-login"
                "?register_device_id=9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c"
                "&first_opened_at=1700000000000",
                "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-login"
                "?register_device_id=9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c"
                "&first_opened_at=1700000000000",
            ),
        ],
    )
    async def test_google_oauth_authorize_redirects_to_google_with_safe_state(
        self,
        async_client,
        monkeypatch,
        return_to: str,
        expected_return_to: str,
    ):
        """手动 Google 按钮 authorize 只接受白名单 return_to 并创建 OAuth state。"""
        google_client_id = "google-client-id.apps.googleusercontent.com"
        created_return_to: list[str] = []

        monkeypatch.setattr(settings.auth, "google_client_id", google_client_id)
        monkeypatch.setattr(settings.auth, "google_client_secret", "google-secret")
        monkeypatch.setattr(
            settings.app,
            "public_api_base_url",
            "https://api.vimeodownloader.app",
        )
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_create_oauth_state(return_to: str) -> str:
            created_return_to.append(return_to)
            return "oauth-state-1"

        async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
            assert identifier == "127.0.0.1"
            assert limit == 10
            assert window == 60
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client._google_oauth_authorize_limiter.is_allowed",
            fake_is_allowed,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_oauth_state",
            fake_create_oauth_state,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/authorize",
            params={"return_to": return_to},
        )

        assert response.status_code == 302
        parsed_location = urlsplit(response.headers["location"])
        query = parse_qs(parsed_location.query)
        assert parsed_location.scheme == "https"
        assert parsed_location.netloc == "accounts.google.com"
        assert parsed_location.path == "/o/oauth2/v2/auth"
        assert query["client_id"] == [google_client_id]
        assert query["redirect_uri"] == [
            "https://api.vimeodownloader.app/api/client/auth/google/oauth/callback"
        ]
        assert query["response_type"] == ["code"]
        assert query["scope"] == ["openid email profile"]
        assert query["state"] == ["oauth-state-1"]
        assert created_return_to == [expected_return_to]

    async def test_google_oauth_authorize_requires_client_secret_before_state(
        self,
        async_client,
        monkeypatch,
    ):
        """OAuth authorize 缺少 secret 时不创建 state、不跳 Google。"""
        create_state_calls: list[str] = []

        monkeypatch.setattr(settings.auth, "google_client_id", "google-client-id")
        monkeypatch.setattr(settings.auth, "google_client_secret", "")
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_create_oauth_state(return_to: str) -> str:
            create_state_calls.append(return_to)
            return "should-not-be-created"

        async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
            assert identifier == "127.0.0.1"
            assert limit == 10
            assert window == 60
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client._google_oauth_authorize_limiter.is_allowed",
            fake_is_allowed,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_oauth_state",
            fake_create_oauth_state,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/authorize",
            params={"return_to": "https://vimeodownloader.app/ext-pricing/"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(response)
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert redirect_params["google_login_error"] == ["internal_server_error"]
        assert create_state_calls == []

    async def test_google_oauth_authorize_rate_limited_before_state(
        self,
        async_client,
        monkeypatch,
    ):
        """OAuth authorize 超过每分钟 10 次后不创建 state。"""
        limiter_calls: list[tuple[str, int, int]] = []
        create_state_calls: list[str] = []

        monkeypatch.setattr(settings.auth, "google_client_id", "google-client-id")
        monkeypatch.setattr(settings.auth, "google_client_secret", "google-secret")
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
            limiter_calls.append((identifier, limit, window))
            return False

        async def fake_create_oauth_state(return_to: str) -> str:
            create_state_calls.append(return_to)
            return "should-not-be-created"

        monkeypatch.setattr(
            "app.api.client.auth_client._google_oauth_authorize_limiter.is_allowed",
            fake_is_allowed,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_oauth_state",
            fake_create_oauth_state,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/authorize",
            params={"return_to": "https://vimeodownloader.app/ext-pricing/"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(response)
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert redirect_params["google_login_error"] == ["rate_limit_exceeded"]
        assert limiter_calls == [("127.0.0.1", 10, 60)]
        assert create_state_calls == []

    async def test_google_oauth_authorize_rejects_disallowed_return_to(
        self,
        async_client,
        monkeypatch,
    ):
        """OAuth authorize 不把 state 绑定到陌生域名。"""
        create_state_calls: list[str] = []

        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_create_oauth_state(return_to: str) -> str:
            create_state_calls.append(return_to)
            return "should-not-be-created"

        async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
            assert identifier == "127.0.0.1"
            assert limit == 10
            assert window == 60
            return True

        monkeypatch.setattr(
            "app.api.client.auth_client._google_oauth_authorize_limiter.is_allowed",
            fake_is_allowed,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_oauth_state",
            fake_create_oauth_state,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/authorize",
            params={"return_to": "https://evil.example.com/ext-pricing/"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(response)
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert redirect_params["google_login_error"] == ["invalid_return_to"]
        assert create_state_calls == []

    async def test_google_oauth_callback_exchanges_code_and_login_code_once(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
    ):
        """OAuth callback 用 code 换 id_token 后复用一次性 login code 兑换项目 token。"""
        email = make_test_email("google-oauth")
        exchange_calls: list[tuple[str, str]] = []
        consumed_states: list[str] = []

        monkeypatch.setattr(
            settings.app,
            "public_api_base_url",
            "https://api.vimeodownloader.app",
        )
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_consume_oauth_state(state: str) -> str:
            consumed_states.append(state)
            return "https://vimeodownloader.app/ext-pricing/?plan=unlimited"

        async def fake_exchange_oauth_code_for_profile(
            *,
            code: str,
            redirect_uri: str,
        ) -> GoogleTokenProfile:
            exchange_calls.append((code, redirect_uri))
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-oauth",
                full_name="Google OAuth User",
                avatar_url=None,
                email_is_authoritative=True,
            )

        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.consume_oauth_state",
            fake_consume_oauth_state,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.exchange_oauth_code_for_profile",
            fake_exchange_oauth_code_for_profile,
        )

        callback_response = await async_client.get(
            "/api/client/auth/google/oauth/callback",
            params={"code": "oauth-code-1", "state": "oauth-state-1"},
            headers={"X-Client-Product": "extension"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(
            callback_response
        )
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert parsed_redirect.path == "/ext-pricing/"
        assert redirect_params["plan"] == ["unlimited"]
        assert "google_login_error" not in redirect_params
        assert "access_token" not in redirect_params
        assert consumed_states == ["oauth-state-1"]
        assert exchange_calls == [
            (
                "oauth-code-1",
                "https://api.vimeodownloader.app"
                "/api/client/auth/google/oauth/callback",
            )
        ]

        login_code = redirect_params["google_login_code"][0]
        exchange_response = await async_client.post(
            "/api/client/auth/google/exchange",
            json={"code": login_code},
        )
        exchange_data = unwrap_ok(exchange_response)
        assert exchange_data["user"]["email"] == email

        second_exchange_response = await async_client.post(
            "/api/client/auth/google/exchange",
            json={"code": login_code},
        )
        second_exchange_data = second_exchange_response.json()
        assert second_exchange_data["code"] == CommonCode.AUTH_INVALID_CREDENTIALS.value

        result = await test_db_session.execute(
            text(
                "SELECT register_source, register_method FROM users WHERE email = :email"
            ),
            {"email": email},
        )
        row = result.one()
        assert row.register_source == "web"
        assert row.register_method == "google"

    async def test_google_oauth_callback_registers_extension_source_for_plugin_callback(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
    ):
        """插件 chromiumapp.org 回跳的首次注册归 extension，并按回跳参数带设备归因。"""
        email = make_test_email("google-oauth-extension")
        device_id = "9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c"

        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_consume_oauth_state(_state: str) -> str:
            return (
                "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-login"
                f"?register_device_id={device_id}&first_opened_at=1700000000000"
            )

        async def fake_exchange_oauth_code_for_profile(
            *,
            code: str,
            redirect_uri: str,
        ) -> GoogleTokenProfile:
            assert code == "oauth-code-plugin"
            assert redirect_uri.endswith("/api/client/auth/google/oauth/callback")
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-plugin",
                full_name="Plugin OAuth User",
                avatar_url=None,
                email_is_authoritative=True,
            )

        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.consume_oauth_state",
            fake_consume_oauth_state,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.exchange_oauth_code_for_profile",
            fake_exchange_oauth_code_for_profile,
        )

        callback_response = await async_client.get(
            "/api/client/auth/google/oauth/callback",
            params={"code": "oauth-code-plugin", "state": "oauth-state-plugin"},
            headers={"X-Client-Product": "extension"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(
            callback_response
        )
        assert parsed_redirect.netloc == (
            "abcdefghijklmnopabcdefghijklmnop.chromiumapp.org"
        )
        assert parsed_redirect.path == "/google-login"
        assert redirect_params["register_device_id"] == [device_id]
        assert redirect_params["first_opened_at"] == ["1700000000000"]
        assert redirect_params["google_login_code"]

        result = await test_db_session.execute(
            text(
                "SELECT register_source, register_method, register_device_id "
                "FROM users WHERE email = :email"
            ),
            {"email": email},
        )
        row = result.one()
        assert row.register_source == "extension"
        assert row.register_method == "google"
        assert row.register_device_id == device_id

    async def test_google_oauth_callback_non_authoritative_email_verification_only(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
    ):
        """OAuth callback 非权威邮箱只回跳邮箱验证码状态。"""
        email = make_test_email("google-oauth-third-party")
        send_calls: list[tuple[str, str]] = []
        create_code_calls: list[int] = []

        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_consume_oauth_state(_state: str) -> str:
            return "https://vimeodownloader.app/ext-pricing/?plan=unlimited"

        async def fake_exchange_oauth_code_for_profile(
            *,
            code: str,
            redirect_uri: str,
        ) -> GoogleTokenProfile:
            assert code == "oauth-code-third-party"
            assert redirect_uri.endswith("/api/client/auth/google/oauth/callback")
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-oauth-third-party",
                full_name="Third Party OAuth User",
                avatar_url=None,
                email_is_authoritative=False,
            )

        async def fake_send_verify_code(
            target_email: str,
            language: str,
        ) -> SendResult:
            send_calls.append((target_email, language))
            return SendResult.SUCCESS

        async def fake_create_login_code(user_id: int) -> str:
            create_code_calls.append(user_id)
            return "should-not-be-created"

        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.consume_oauth_state",
            fake_consume_oauth_state,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.exchange_oauth_code_for_profile",
            fake_exchange_oauth_code_for_profile,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.email_verification_service.send_verify_code",
            fake_send_verify_code,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_login_code",
            fake_create_login_code,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/callback",
            params={"code": "oauth-code-third-party", "state": "oauth-state-third"},
            headers={"Accept-Language": "zh-CN"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(response)
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert parsed_redirect.path == "/ext-pricing/"
        assert redirect_params["plan"] == ["unlimited"]
        assert redirect_params["google_email_verification"] == [email]
        assert "google_login_code" not in redirect_params
        assert "google_login_error" not in redirect_params
        assert send_calls == [(email, "zh-CN")]
        assert create_code_calls == []

        result = await test_db_session.execute(
            text("SELECT COUNT(*) FROM users WHERE email = :email"),
            {"email": email},
        )
        assert result.scalar_one() == 0

    async def test_google_oauth_callback_invalid_state_redirects_error_without_exchange(
        self,
        async_client,
        monkeypatch,
    ):
        """OAuth callback state 校验失败时不换 token、不生成 code。"""
        exchange_calls: list[str] = []
        create_code_calls: list[int] = []

        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_consume_oauth_state(_state: str) -> str:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        async def fake_exchange_oauth_code_for_profile(
            *,
            code: str,
            redirect_uri: str,
        ) -> GoogleTokenProfile:
            exchange_calls.append(f"{code}:{redirect_uri}")
            return GoogleTokenProfile(
                email="should-not-be-used@example.com",
                subject="should-not-be-used",
                full_name=None,
                avatar_url=None,
                email_is_authoritative=True,
            )

        async def fake_create_login_code(user_id: int) -> str:
            create_code_calls.append(user_id)
            return "should-not-be-created"

        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.consume_oauth_state",
            fake_consume_oauth_state,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.exchange_oauth_code_for_profile",
            fake_exchange_oauth_code_for_profile,
        )
        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.create_login_code",
            fake_create_login_code,
        )

        response = await async_client.get(
            "/api/client/auth/google/oauth/callback",
            params={"code": "oauth-code-1", "state": "bad-state"},
        )

        _parsed_redirect, redirect_params = parse_google_redirect_response(response)
        assert redirect_params["google_login_error"] == ["auth_invalid_credentials"]
        assert "google_login_code" not in redirect_params
        assert exchange_calls == []
        assert create_code_calls == []

    async def test_empty_google_client_secret_only_breaks_oauth_callback(
        self,
        async_client,
        monkeypatch,
        make_test_email,
    ):
        """GOOGLE_CLIENT_SECRET 留空只让新 OAuth callback 回跳错误，One Tap 仍可登录。"""
        email = make_test_email("google-empty-secret")

        monkeypatch.setattr(settings.auth, "google_client_id", "google-client-id")
        monkeypatch.setattr(settings.auth, "google_client_secret", "")
        monkeypatch.setattr(
            settings.app,
            "public_api_base_url",
            "https://api.vimeodownloader.app",
        )
        monkeypatch.setattr(
            settings.app,
            "public_website_base_url",
            "https://vimeodownloader.app",
        )

        async def fake_consume_oauth_state(_state: str) -> str:
            return "https://vimeodownloader.app/ext-pricing/?plan=month"

        async def fake_verify_id_token(_credential: str) -> GoogleTokenProfile:
            return GoogleTokenProfile(
                email=email,
                subject="google-subject-empty-secret",
                full_name="Google Empty Secret User",
                avatar_url=None,
                email_is_authoritative=True,
            )

        monkeypatch.setattr(
            "app.api.client.auth_client.google_redirect_login_service.consume_oauth_state",
            fake_consume_oauth_state,
        )

        oauth_response = await async_client.get(
            "/api/client/auth/google/oauth/callback",
            params={"code": "oauth-code-empty-secret", "state": "oauth-state-1"},
        )

        parsed_redirect, redirect_params = parse_google_redirect_response(
            oauth_response
        )
        assert parsed_redirect.netloc == "vimeodownloader.app"
        assert parsed_redirect.path == "/ext-pricing/"
        assert redirect_params["plan"] == ["month"]
        assert redirect_params["google_login_error"] == ["internal_server_error"]
        assert "google_login_code" not in redirect_params

        monkeypatch.setattr(
            "app.api.client.auth_client.google_auth_service.verify_id_token",
            fake_verify_id_token,
        )

        one_tap_response = await async_client.post(
            "/api/client/auth/google-login",
            json={"credential": "fake-google-id-token"},
            headers={"X-Client-Product": "web"},
        )

        one_tap_data = unwrap_ok(one_tap_response)
        assert one_tap_data["access_token"]
        assert one_tap_data["user"]["email"] == email


@pytest.mark.asyncio
class TestAuthIntegration:
    """Integration tests for complete auth flows."""

    async def test_complete_auth_flow(self, async_client, make_test_email):
        """Test complete registration -> login -> refresh -> logout flow."""
        email = make_test_email("integration")
        password = "Integration123!"

        # 1. Register
        register_response = await async_client.post(
            "/api/client/auth/register",
            json={
                "email": email,
                "password": password,
                "full_name": "Integration Test",
            },
        )
        user_data = unwrap_ok(register_response)
        assert user_data["email"] == email

        # 2. Login
        login_response = await async_client.post(
            "/api/client/auth/login", json={"email": email, "password": password}
        )
        assert login_response.status_code == 200
        login_data = unwrap_ok(login_response)
        access_token = login_data["access_token"]
        refresh_token = login_data["refresh_token"]
        assert access_token
        assert refresh_token

        # 3. Get user info
        me_response = await async_client.get(
            "/api/client/auth/me", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert unwrap_ok(me_response)["email"] == email

        # 4. Refresh token
        refresh_response = await async_client.post(
            "/api/client/auth/refresh", json={"refresh_token": refresh_token}
        )
        assert refresh_response.status_code == 200
        refresh_data = unwrap_ok(refresh_response)
        new_access_token = refresh_data["access_token"]
        new_refresh_token = refresh_data["refresh_token"]
        assert new_access_token != access_token
        assert new_refresh_token != refresh_token

        # 5. Use new token to get user info
        me_response2 = await async_client.get(
            "/api/client/auth/me",
            headers={"Authorization": f"Bearer {new_access_token}"},
        )
        unwrap_ok(me_response2)

        # 6. Logout
        logout_response = await async_client.post(
            "/api/client/auth/logout",
            headers={"Authorization": f"Bearer {new_access_token}"},
        )
        assert logout_response.status_code == 200
