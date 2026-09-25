"""Website 设备可信关系服务测试。"""

import pytest

from app.services.device_service import (
    DEVICE_TRUST_CONFIG_KEY,
    device_service,
)


class _FakeRedis:
    """设备可信测试用 Redis 替身，只覆盖本文件需要的 get/set。"""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def set(self, key: str, value: str, *, ex: int) -> None:
        self.values[key] = value
        self.ttls[key] = ex

    async def get(self, key: str) -> str | None:
        return self.values.get(key)


@pytest.mark.asyncio
async def test_device_trust_disabled_audits_but_allows_everything(monkeypatch) -> None:
    """配置关闭时仍审计可信关系，但最终固定放行。"""

    fake_redis = _FakeRedis()

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        assert c_key == DEVICE_TRUST_CONFIG_KEY
        return {"verify_device_id": False}

    async def fake_get_client():
        return fake_redis

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )
    monkeypatch.setattr(
        "app.services.device_service.redis_client.get_client",
        fake_get_client,
    )

    device_id = "01234567-89ab-4def-8123-456789abcdef"
    await device_service.set(device_id, "198.51.100.10")
    result = await device_service.verify_request_device(
        device_id=device_id,
        ip="203.0.113.10",
    )

    assert result.trusted is True
    assert result.reason == "config_disabled"
    assert result.logo_ip == "198.51.100.10"
    assert (
        await device_service.verify(
            "fedcba98-7654-4abc-8123-456789abcdef",
            "203.0.113.10",
        )
        is True
    )


@pytest.mark.asyncio
async def test_device_trust_enabled_trusts_device_id_and_logs_ip_only(
    monkeypatch,
) -> None:
    """配置开启时只校验 device_id 是否建立过可信关系，IP 不参与拒绝。"""

    fake_redis = _FakeRedis()

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        assert c_key == DEVICE_TRUST_CONFIG_KEY
        return {"verify_device_id": True}

    async def fake_get_client():
        return fake_redis

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )
    monkeypatch.setattr(
        "app.services.device_service.redis_client.get_client",
        fake_get_client,
    )

    device_id = "01234567-89ab-4def-8123-456789abcdef"
    await device_service.set(device_id, "198.51.100.10")

    result = await device_service.verify_request_device(
        device_id=device_id,
        ip="203.0.113.20",
    )

    assert result.trusted is True
    assert result.reason == "trusted"
    assert result.logo_ip == "198.51.100.10"
    assert result.ip == "203.0.113.20"
    assert await device_service.verify(device_id, "203.0.113.30") is True


@pytest.mark.asyncio
async def test_device_trust_enabled_rejects_missing_device_record(
    monkeypatch,
) -> None:
    """配置开启时 Redis 没有 device_id 可信记录仍会拒绝。"""

    fake_redis = _FakeRedis()

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        assert c_key == DEVICE_TRUST_CONFIG_KEY
        return {"verify_device_id": True}

    async def fake_get_client():
        return fake_redis

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )
    monkeypatch.setattr(
        "app.services.device_service.redis_client.get_client",
        fake_get_client,
    )

    result = await device_service.verify_request_device(
        device_id="01234567-89ab-4def-8123-456789abcdef",
        ip="203.0.113.20",
    )

    assert result.trusted is False
    assert result.reason == "device_not_trusted"
    assert result.logo_ip is None


@pytest.mark.asyncio
async def test_device_trust_enabled_rejects_invalid_device(
    monkeypatch,
) -> None:
    """配置开启时，非法 device_id 仍会被统一拦截。"""

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        assert c_key == DEVICE_TRUST_CONFIG_KEY
        return {"verify_device_id": True}

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )

    result = await device_service.verify_request_device(
        device_id="invalid device id",
        ip="203.0.113.10",
    )

    assert result.trusted is False
    assert result.reason == "invalid_device_id:INVALID_DEVICE_ID"


@pytest.mark.asyncio
async def test_device_trust_invalid_config_defaults_to_disabled(
    monkeypatch,
) -> None:
    """配置非法时默认关闭校验，避免发布期阻断用户主流程。"""

    async def fake_get(c_key: str, *, force_refresh: bool = False):
        assert force_refresh is False
        assert c_key == DEVICE_TRUST_CONFIG_KEY
        return ["bad-config"]

    monkeypatch.setattr(
        "app.services.device_service.config_public_service.get",
        fake_get,
    )

    result = await device_service.verify_request_device(
        device_id=None,
        ip=None,
    )

    assert result.trusted is True
    assert result.reason == "config_disabled"
