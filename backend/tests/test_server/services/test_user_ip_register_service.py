"""用户注册 IP 权益风控服务测试。"""

import pytest

from app.services.user_ip_register_service import (
    REGISTRATION_IP_BENEFIT_GUARD_KEY,
    user_ip_register_service,
)


@pytest.mark.asyncio
async def test_registration_ip_guard_allows_when_ip_missing(monkeypatch) -> None:
    """缺少 IP 时风控直接放行，不读取配置。"""

    async def fail_get(_c_key: str, *, force_refresh: bool = False):
        raise AssertionError("missing ip should not read config_public")

    monkeypatch.setattr(
        "app.services.user_ip_register_service.config_public_service.get",
        fail_get,
    )

    assert await user_ip_register_service.is_registration_bonus_allowed(None) is True
    assert await user_ip_register_service.is_registration_bonus_allowed("   ") is True


@pytest.mark.asyncio
async def test_registration_ip_guard_allows_when_config_missing_or_invalid(
    monkeypatch,
) -> None:
    """配置缺失或非法时关闭风控，注册权益保持原行为。"""

    async def missing_get(_c_key: str, *, force_refresh: bool = False):
        return None

    monkeypatch.setattr(
        "app.services.user_ip_register_service.config_public_service.get",
        missing_get,
    )
    assert (
        await user_ip_register_service.is_registration_bonus_allowed("203.0.113.10")
        is True
    )

    async def invalid_get(c_key: str, *, force_refresh: bool = False):
        assert c_key == REGISTRATION_IP_BENEFIT_GUARD_KEY
        return {"window_seconds": 0, "max_registrations": 3}

    monkeypatch.setattr(
        "app.services.user_ip_register_service.config_public_service.get",
        invalid_get,
    )
    assert (
        await user_ip_register_service.is_registration_bonus_allowed("203.0.113.10")
        is True
    )


@pytest.mark.asyncio
async def test_record_register_best_effort_swallows_insert_error(monkeypatch) -> None:
    """注册 IP 辅助记录写入失败时不影响注册主流程。"""

    async def fail_create(*, user_id: int, ip_address: str):
        raise RuntimeError(
            "test user_ip_register_create failed: "
            f"user_id={user_id}, ip_address={ip_address}"
        )

    monkeypatch.setattr(
        user_ip_register_service,
        "user_ip_register_create",
        fail_create,
    )

    await user_ip_register_service.record_register_best_effort(
        user_id=123,
        ip_address="203.0.113.20",
    )
