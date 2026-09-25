"""
Test UserService functionality.
"""

import pytest
from sqlalchemy import func, select

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_checkin_campaign_model import UserCheckinCampaignModel
from app.models.user_ip_register_model import UserIpRegisterModel
from app.services.user_checkin_service import CHECKIN_CONFIG_KEY, user_checkin_service
from app.services.user_credit_service import user_credit_service
from app.services.user_ip_register_service import REGISTRATION_IP_BENEFIT_GUARD_KEY
from app.services.user_service import REGISTRATION_BONUS_CREDITS, UserService
from app.utils.time import get_today_start_timestamp


@pytest.mark.asyncio
class TestUserService:
    """Test UserService functionality."""

    async def test_create_user(self, make_test_email):
        """Test creating a user."""
        service = UserService()
        email = make_test_email("create-user")
        user = await service.create_user(
            email=email,
            password="TestPassword123!",
            full_name="Test User",
            avatar_url="https://example.com/avatar.png",
        )
        assert user is not None
        assert user.email == email
        assert user.full_name == "Test User"
        assert user.is_del is False

    async def test_create_user_without_password(self, make_test_email):
        """Test creating a user without password."""
        service = UserService()
        email = make_test_email("nopass")
        user = await service.create_user_without_password(
            email=email,
            full_name="No Pass User",
            avatar_url="https://example.com/avatar.png",
        )
        assert user is not None
        assert user.email == email
        assert user.full_name == "No Pass User"
        assert user.is_del is False

    async def test_get_user_by_email(self, make_test_email):
        """Test getting user by email."""
        service = UserService()
        email = make_test_email("get-by-email")

        # Create a user
        await service.create_user(
            email=email,
            password="TestPassword123!",
        )

        user = await service.get_user_by_email(email)
        assert user is not None
        assert user.email == email

    async def test_get_user_by_email_not_found(self, make_test_email):
        """Test getting non-existent user by email."""
        service = UserService()
        user = await service.get_user_by_email(make_test_email("missing"))
        assert user is None

    async def test_update_login_info(self, make_test_email):
        """Test updating user login info."""
        service = UserService()
        email = make_test_email("login-info")

        # Create a user
        user = await service.create_user(
            email=email,
            password="TestPassword123!",
        )
        initial_count = user.login_count

        result = await service.update_login_info(user.user_id)
        assert result is True

        # Verify update
        updated_user = await service.get_user_by_email(email)
        assert updated_user.login_count == initial_count + 1
        assert updated_user.last_login_at is not None

    async def test_increment_failed_attempts(self, make_test_email):
        """Test incrementing failed login attempts (stub)."""
        service = UserService()

        # Create a user
        user = await service.create_user(
            email=make_test_email("failed-attempts"),
            password="TestPassword123!",
        )

        # This is a stub that always returns True
        result = await service.increment_failed_attempts(user.user_id)
        assert result is True

    async def test_lock_user_until(self, make_test_email):
        """Test locking user until specified time."""
        service = UserService()
        from app.utils.time import timestamp_now

        email = make_test_email("locked-user")

        # Create a user
        user = await service.create_user(
            email=email,
            password="TestPassword123!",
        )

        lock_until = timestamp_now() + (15 * 60 * 1000)  # 15 minutes from now
        result = await service.lock_user_until(user.user_id, lock_until)
        assert result is True

        # Verify lock
        updated_user = await service.get_user_by_email(email)
        assert updated_user.locked_until == lock_until

    async def test_unlock_user(self, make_test_email):
        """Test unlocking a user."""
        service = UserService()
        email = make_test_email("unlock-user")

        # Create a locked user
        user = await service.create_user(
            email=email,
            password="TestPassword123!",
        )
        await service.lock_user_until(user.user_id, 9999999999999)

        result = await service.unlock_user(user.user_id)
        assert result is True

        # Verify unlock
        updated_user = await service.get_user_by_email(email)
        assert updated_user.locked_until is None

    async def test_ip_register_guard_skips_bonus_and_blocks_checkin(
        self,
        make_test_email,
        monkeypatch,
        test_db_session,
        test_run_id,
    ):
        """同 IP 超过配置阈值后，不送注册 Credits，并写入已过期签到活动。"""

        async def fake_public_config_get(
            c_key: str,
            *,
            force_refresh: bool = False,
        ):
            if c_key == REGISTRATION_IP_BENEFIT_GUARD_KEY:
                return {"window_seconds": 86400, "max_registrations": 1}
            if c_key == CHECKIN_CONFIG_KEY:
                return {
                    "campaign_days": 14,
                    "reward_rules": [
                        {"start_day": 1, "end_day": 7, "credits": 6},
                        {"start_day": 8, "end_day": 14, "credits": 3},
                    ],
                }
            raise AssertionError(f"unexpected config key: {c_key}")

        monkeypatch.setattr(
            "app.services.user_ip_register_service.config_public_service.get",
            fake_public_config_get,
        )
        monkeypatch.setattr(
            "app.services.user_checkin_service.config_public_service.get",
            fake_public_config_get,
        )

        service = UserService()
        register_ip = f"pytest-ip-{test_run_id}"

        first_user = await service.create_user_with_registration_bonus(
            email=make_test_email("ip-guard-first"),
            password="TestPassword123!",
            register_ip=register_ip,
        )
        second_user = await service.create_user_with_registration_bonus(
            email=make_test_email("ip-guard-second"),
            password="TestPassword123!",
            register_ip=register_ip,
        )

        assert (
            await user_credit_service.get_balance(first_user.user_id)
            == REGISTRATION_BONUS_CREDITS
        )
        assert await user_credit_service.get_balance(second_user.user_id) == 0

        register_count = await test_db_session.scalar(
            select(func.count())
            .select_from(UserIpRegisterModel)
            .where(
                UserIpRegisterModel.user_id.in_(
                    [first_user.user_id, second_user.user_id]
                ),
                UserIpRegisterModel.ip_address == register_ip,
            )
        )
        assert register_count == 2

        campaign = await test_db_session.scalar(
            select(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == second_user.user_id)
            .order_by(UserCheckinCampaignModel.id.desc())
            .limit(1)
        )
        assert campaign is not None
        assert campaign.end_at < get_today_start_timestamp()

        entry = await user_checkin_service.enter_checkin_campaign(second_user.user_id)
        assert entry.campaign_ended is True
        assert entry.today_reward_credits == 0

        campaign_count_after_entry = await test_db_session.scalar(
            select(func.count())
            .select_from(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == second_user.user_id)
        )
        assert campaign_count_after_entry == 1

        with pytest.raises(AppCommonException) as exc_info:
            await user_checkin_service.claim_daily_checkin(second_user.user_id)
        assert exc_info.value.code == CommonCode.CHECKIN_CAMPAIGN_ENDED

    async def test_registration_fails_when_expired_campaign_create_fails(
        self,
        make_test_email,
        monkeypatch,
    ):
        """风控命中后的过期签到活动创建失败必须冒泡到注册请求。"""

        async def disallow_bonus(_ip_address: str | None) -> bool:
            return False

        async def fail_create_expired_campaign(user_id: int):
            raise RuntimeError(
                "test create_expired_campaign failed: " f"user_id={user_id}"
            )

        monkeypatch.setattr(
            "app.services.user_service.user_ip_register_service."
            "is_registration_bonus_allowed",
            disallow_bonus,
        )
        monkeypatch.setattr(
            "app.services.user_service.user_checkin_service.create_expired_campaign",
            fail_create_expired_campaign,
        )

        service = UserService()
        email = make_test_email("expired-campaign-fail")

        with pytest.raises(RuntimeError, match="create_expired_campaign failed"):
            await service.create_user_with_registration_bonus(
                email=email,
                password="TestPassword123!",
                register_ip="203.0.113.30",
            )

        user = await service.get_user_by_email(email)
        assert user is not None
        assert await user_credit_service.get_balance(user.user_id) == 0
