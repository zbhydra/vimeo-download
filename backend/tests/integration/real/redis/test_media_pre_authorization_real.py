"""media download-pre-v2 resource token 与 Redis 用户短锁 real 测试。

依赖真实 Redis，不依赖真实 MySQL。覆盖：
- download-pre-v2 只信任 resource token claims。
- 篡改 token 拒绝。
- 用户级短锁忙时拒绝，避免并发重复授权。
"""

from types import SimpleNamespace
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest

from app.api.user_dependencies import UserContext
from app.core.config import settings
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services import media_pre_authorization_service as pre_module
from app.services import media_download_token_service as token_module
from app.services import media_resource_token_service as resource_token_module
from app.services.media_download_token_service import media_download_token_service
from app.services.media_pre_authorization_service import (
    media_pre_authorization_service,
)
from app.services.media_resource_token_service import MediaResourceTokenService
from app.utils.redis_key import build_redis_key


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


def _ed25519_key_pair() -> tuple[str, str]:
    """生成测试用 Ed25519 PEM key pair。"""

    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return private_pem, public_pem


def _patch_token_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """替换 download/resource token 测试配置。"""

    private_pem, public_pem = _ed25519_key_pair()
    config = SimpleNamespace(
        algorithm="EdDSA",
        private_key=private_pem,
        public_keys=[public_pem],
        resource_token_secret="real-resource-token-secret",
    )
    monkeypatch.setattr(settings, "download_token", config, raising=False)
    monkeypatch.setattr(token_module.settings, "download_token", config, raising=False)
    monkeypatch.setattr(
        resource_token_module.settings,
        "download_token",
        config,
        raising=False,
    )


def _resource_token(
    *,
    size: int | None = 1024,
    mime_type: str | None = "video/mp4",
) -> str:
    """签发 real 测试用 resource token。"""

    return MediaResourceTokenService().issue_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/example/123",
        source_id="source-video-1",
        download_mode="direct",
        filename="demo.mp4",
        mime_type=mime_type,
        size=size,
    )


def _lock_key(user_id: int) -> str:
    """构建通用 RedisLock 存储的 download-pre-v2 用户级短锁 key。"""

    return build_redis_key(f"lock:media:download_pre_lock:{{user:{user_id}}}")


@pytest.fixture(autouse=True)
def _patch_active_download_limit_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Redis real 测试不依赖 MySQL config_public。"""

    async def fake_get(_c_key: str):
        if _c_key == "dl_active_download_limit":
            return 3
        return None

    monkeypatch.setattr(pre_module.config_public_service, "get", fake_get)


async def test_real_download_pre_uses_resource_token_claims(
    real_redis_ready,
    monkeypatch,
) -> None:
    """download-pre-v2 从 resource token claims 签发 media_download token。"""

    _patch_token_config(monkeypatch)
    user_id = int(f"9{uuid.uuid4().hex[:8]}", 16)
    user_context = UserContext(user_id=user_id, token="real-pre-token")
    redis = await redis_client.get_client()
    lock_key = _lock_key(user_id)
    await redis.delete(lock_key)

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    monkeypatch.setattr(
        media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )

    try:
        async with media_pre_authorization_service.download_pre_v2_user_lock(
            user_context=user_context
        ):
            payload = media_pre_authorization_service.validate_download_pre_payload(
                {
                    "resource_token": _resource_token(size=2048),
                    "preferred_node_id": 2,
                }
            )
            result = (
                await media_pre_authorization_service.create_download_authorization(
                    payload=payload,
                    user_context=user_context,
                    credits_cost=2,
                    issued_ip="203.0.113.9",
                )
            )
        claims = media_download_token_service.decode_for_download(result.token)

        assert result.token
        assert result.nodes[0].url.endswith("/api/client/media/download-v2")
        assert claims.link == "https://vimeo.com/example/123"
        assert claims.sid == "source-video-1"
        assert claims.size == 2048
        assert claims.uid == user_id
        assert claims.credits_cost == 2
        assert claims.issued_ip == "203.0.113.9"
        assert await redis.get(lock_key) is None
    finally:
        await redis.delete(lock_key)


async def test_real_download_pre_rejects_tampered_resource_token(
    real_redis_ready,
    monkeypatch,
) -> None:
    """resource token 篡改后拒绝授权。"""

    _patch_token_config(monkeypatch)
    user_context = UserContext(user_id=42, token="real-pre-token")

    with pytest.raises(AppCommonException) as exc_info:
        async with media_pre_authorization_service.download_pre_v2_user_lock(
            user_context=user_context
        ):
            media_pre_authorization_service.validate_download_pre_payload(
                {
                    "resource_token": "payload.md5.fake",
                    "preferred_node_id": 2,
                }
            )

    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST


async def test_real_download_pre_user_lock_busy_returns_retry_error(
    real_redis_ready,
    monkeypatch,
) -> None:
    """用户级 Redis 短锁忙时返回可重试错误，不签发 token。"""

    _patch_token_config(monkeypatch)
    user_id = int(f"8{uuid.uuid4().hex[:8]}", 16)
    user_context = UserContext(user_id=user_id, token="real-pre-token")
    redis = await redis_client.get_client()
    lock_key = _lock_key(user_id)
    await redis.set(lock_key, "busy", ex=4)

    async def fail_select_download_nodes(_preferred_node_id):
        raise AssertionError("lock busy must not select nodes")

    monkeypatch.setattr(
        media_pre_authorization_service,
        "_select_download_nodes",
        fail_select_download_nodes,
    )

    try:
        with pytest.raises(AppCommonException) as exc_info:
            async with media_pre_authorization_service.download_pre_v2_user_lock(
                user_context=user_context
            ):
                payload = media_pre_authorization_service.validate_download_pre_payload(
                    {
                        "resource_token": _resource_token(size=None),
                        "preferred_node_id": 2,
                    }
                )
                await media_pre_authorization_service.create_download_authorization(
                    payload=payload,
                    user_context=user_context,
                    credits_cost=2,
                    issued_ip="203.0.113.9",
                )
        assert exc_info.value.code == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    finally:
        await redis.delete(lock_key)
