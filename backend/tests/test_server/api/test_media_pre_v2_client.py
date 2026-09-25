"""媒体 V2 Pre 控制面 API 测试。

覆盖 U2 后的 parse-pre-v2、download-pre-v2 resource token 验签、
Credits 扣费编排和 media_download token 签发。
"""

import asyncio
from datetime import timedelta
from types import SimpleNamespace

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest

from app.api.client import media_pre_v2_client as pre_router_module
from app.api.user_dependencies import UserContext, get_current_user
from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.main import app
from app.services import media_download_token_service as token_module
from app.services import media_pre_authorization_service as pre_module
from app.services.device_service import DeviceTrustVerifyResult
from app.services.media_download_token_service import media_download_token_service
from app.services.media_resource_token_service import MediaResourceTokenService
from app.services.media_service import CreditChargeResult
from app.utils.jwt import JwtData, JwtUnit


def _expected_user_lock_key(user_id: int = 42) -> str:
    """构造 download-pre-v2 用户锁业务 key。"""

    return f"media:download_pre_lock:{{user:{user_id}}}"


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
    """替换 media_download/resource token 测试配置。"""

    private_pem, public_pem = _ed25519_key_pair()
    config = SimpleNamespace(
        algorithm="EdDSA",
        private_key=private_pem,
        public_keys=[public_pem],
        resource_token_secret="test-resource-token-secret",
    )
    monkeypatch.setattr(settings, "download_token", config, raising=False)
    monkeypatch.setattr(token_module.settings, "download_token", config, raising=False)


def _resource_token(
    *,
    platform: str = "vimeo",
    canonical_link: str = "https://vimeo.com/example/123",
    source_id: str = "source-video-1",
    download_mode: str = "direct",
    filename: str | None = "demo.mp4",
    mime_type: str | None = "video/mp4",
    size: int | None = None,
    extra: dict[str, object] | None = None,
) -> str:
    """签发测试用 resource token。"""

    return MediaResourceTokenService().issue_token(
        platform=platform,
        canonical_link=canonical_link,
        source_id=source_id,
        download_mode=download_mode,
        filename=filename,
        mime_type=mime_type,
        size=size,
        extra=extra,
    )


def _install_download_pre_user(user_id: int = 42) -> None:
    """让当前测试请求以登录用户身份调用 download-pre-v2。"""

    async def override_user() -> UserContext:
        return UserContext(
            user_id=user_id,
            token=f"test-token-{user_id}",
            device_id=f"test-device-{user_id}",
            ip="203.0.113.9",
        )

    app.dependency_overrides[get_current_user] = override_user


def _clear_download_pre_user() -> None:
    """清理 download-pre-v2 登录用户测试覆盖。"""

    app.dependency_overrides.pop(get_current_user, None)


def _download_pre_headers() -> dict[str, str]:
    """download-pre-v2 业务测试使用的已可信 Website 设备头。"""
    return {"X-Device-Id": "test-device-42"}


def _patch_user_lock(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """用内存替代 download-pre-v2 用户短锁。"""

    calls = {"acquire": 0, "release": 0}
    expected_key = _expected_user_lock_key()

    async def fake_acquire_user_lock(
        key: str,
        ttl: int = 30,
        timeout: int | None = None,
    ):
        calls["acquire"] += 1
        assert key == expected_key
        assert ttl == 5
        assert timeout is None
        return f"lock-token:{key}"

    async def fake_release_user_lock(key: str, _token: str):
        calls["release"] += 1
        assert key == expected_key

    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "acquire",
        fake_acquire_user_lock,
    )
    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "release",
        fake_release_user_lock,
    )
    return calls


@pytest.fixture(autouse=True)
def _patch_active_download_limit_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """download-pre-v2 测试默认不访问真实配置库和数据库。"""

    async def fake_get(_c_key: str):
        if _c_key == "dl_active_download_limit":
            return 3
        return None

    async def fake_has_recent_paid_download(**_kwargs):
        return False

    monkeypatch.setattr(pre_module.config_public_service, "get", fake_get)
    monkeypatch.setattr(
        pre_router_module.media_service,
        "has_recent_paid_download",
        fake_has_recent_paid_download,
    )


@pytest.fixture(autouse=True)
def _patch_device_trust(monkeypatch: pytest.MonkeyPatch) -> None:
    """媒体 pre-v2 业务测试默认使用已可信 Website 设备。"""

    async def fake_verify_request_device(
        *,
        device_id: str | None,
        ip: str | None,
    ) -> DeviceTrustVerifyResult:
        if not device_id or " " in device_id:
            return DeviceTrustVerifyResult(
                trusted=False,
                reason="invalid_device_id:INVALID_DEVICE_ID",
                device_id=device_id,
                ip=ip,
            )
        return DeviceTrustVerifyResult(
            trusted=True,
            reason="test_trusted",
            device_id=device_id,
            ip=ip,
        )

    monkeypatch.setattr(
        "app.api.device_dependencies.device_service.verify_request_device",
        fake_verify_request_device,
    )


@pytest.mark.asyncio
async def test_parse_pre_v2_returns_ordered_nodes(async_client, monkeypatch) -> None:
    """parse-pre-v2 返回有序 parse-v2 URL。"""

    async def fake_select_parse_nodes():
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            ),
            SimpleNamespace(
                node_id=1,
                api_url=lambda path: f"https://api.example.com{path}",
            ),
        ]

    monkeypatch.setattr(
        pre_module.service_node_service,
        "select_parse_nodes",
        fake_select_parse_nodes,
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://unknown.example/path"},
        headers={"X-Device-Id": "test-device"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["nodes"] == [
        {"node_id": 2, "url": "https://dl.example.com/api/client/media/parse-v2"},
        {"node_id": 1, "url": "https://api.example.com/api/client/media/parse-v2"},
    ]


@pytest.mark.asyncio
async def test_parse_pre_v2_treats_expired_optional_token_as_anonymous(
    async_client,
    monkeypatch,
) -> None:
    """parse-pre-v2 的过期可选登录态降级为游客，不阻断匿名解析。"""

    async def fake_select_parse_nodes():
        return [
            SimpleNamespace(
                node_id=1,
                api_url=lambda path: f"https://api.example.com{path}",
            )
        ]

    monkeypatch.setattr(
        pre_module.service_node_service,
        "select_parse_nodes",
        fake_select_parse_nodes,
    )
    expired_token, _ = JwtUnit.create_access_token(
        JwtData(user_id=42, email="expired-optional@example.com"),
        expires_delta=timedelta(seconds=-1),
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://unknown.example/path"},
        headers={
            "Authorization": f"Bearer {expired_token}",
            "X-Device-Id": "test-expired-optional-token-device",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["nodes"] == [
        {"node_id": 1, "url": "https://api.example.com/api/client/media/parse-v2"}
    ]


@pytest.mark.asyncio
async def test_parse_pre_v2_rejects_untrusted_device_before_rate_limit(
    async_client,
    monkeypatch,
) -> None:
    """parse-pre-v2 未可信设备在 IP 限流和节点选择前被拒绝。"""

    async def fake_verify_request_device(
        *,
        device_id: str | None,
        ip: str | None,
    ) -> DeviceTrustVerifyResult:
        return DeviceTrustVerifyResult(
            trusted=False,
            reason="device_not_trusted",
            device_id=device_id,
            ip=ip,
        )

    async def fail_is_allowed(*_args, **_kwargs):
        raise AssertionError("untrusted device must not reach parse-pre-v2 limiter")

    monkeypatch.setattr(
        "app.api.device_dependencies.device_service.verify_request_device",
        fake_verify_request_device,
    )
    monkeypatch.setattr(
        pre_router_module._parse_pre_v2_ip_limiter,
        "is_allowed",
        fail_is_allowed,
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://unknown.example/path"},
        headers={"X-Device-Id": "untrusted-parse-device"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED


@pytest.mark.asyncio
async def test_parse_pre_v2_rejects_missing_device_before_optional_user_context(
    async_client,
    monkeypatch,
) -> None:
    """parse-pre-v2 缺设备头时不落到匿名用户依赖的 401。"""

    async def fail_is_allowed(*_args, **_kwargs):
        raise AssertionError("missing device must not reach parse-pre-v2 limiter")

    monkeypatch.setattr(
        pre_router_module._parse_pre_v2_ip_limiter,
        "is_allowed",
        fail_is_allowed,
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://unknown.example/path"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED


@pytest.mark.asyncio
async def test_download_pre_v2_uses_resource_token_claims_not_body_size(
    async_client,
    monkeypatch,
) -> None:
    """download-pre-v2 只按 resource token claims 扣费和签发下载 token。"""

    _patch_token_config(monkeypatch)
    lock_calls = _patch_user_lock(monkeypatch)
    charge_calls: list[dict[str, object]] = []

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_charge_download(**kwargs):
        charge_calls.append(kwargs)
        return CreditChargeResult(
            allowed=True,
            cost=2,
            balance=8,
            free_reason=None,
            resource_key="resource-key-1",
            record_id=1,
        )

    async def fake_has_recent_paid_download(**kwargs):
        assert kwargs["user_id"] == 42
        assert len(kwargs["resource_key"]) == 32
        return False

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "has_recent_paid_download",
        fake_has_recent_paid_download,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    token = _resource_token(size=None, extra={"tg_client_ref": "client-ref-1"})
    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": token,
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["credits_balance"] == 8
    assert body["data"]["nodes"][0]["url"].endswith("/api/client/media/download-v2")
    claims = media_download_token_service.decode_for_download(body["data"]["token"])
    assert claims.uid == 42
    assert claims.size is None
    assert claims.credits_cost == 2
    assert claims.issued_ip == "203.0.113.9"
    assert claims.extra == {"tg_client_ref": "client-ref-1"}
    assert charge_calls == [
        {
            "user_id": 42,
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/example/123",
            "source_id": "source-video-1",
            "download_mode": "direct",
            "filename": "demo.mp4",
            "size_bytes": None,
        }
    ]
    assert lock_calls == {"acquire": 1, "release": 1}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [
        ("report.pdf", None),
        (
            "document",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        ("slides.pptx", None),
        (
            "sheet",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ],
)
async def test_download_pre_v2_accepts_allowlisted_document_types(
    async_client,
    monkeypatch,
    filename: str,
    mime_type: str | None,
) -> None:
    """PDF 和 Office 文档类型属于网站下载白名单。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)
    charge_calls = 0

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_has_recent_paid_download(**_kwargs):
        return False

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        return CreditChargeResult(
            allowed=True,
            cost=1,
            balance=9,
            free_reason=None,
            resource_key="resource-key-1",
            record_id=1,
        )

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "has_recent_paid_download",
        fake_has_recent_paid_download,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(
                    filename=filename,
                    mime_type=mime_type,
                    size=1,
                ),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["token"]
    assert charge_calls == 1


@pytest.mark.asyncio
async def test_download_pre_v2_rejects_untrusted_device_before_user_lock(
    async_client,
    monkeypatch,
) -> None:
    """download-pre-v2 未可信设备在用户短锁和 token 验签前被拒绝。"""

    async def fake_verify_request_device(
        *,
        device_id: str | None,
        ip: str | None,
    ) -> DeviceTrustVerifyResult:
        return DeviceTrustVerifyResult(
            trusted=False,
            reason="device_not_trusted",
            device_id=device_id,
            ip=ip,
        )

    def fail_user_lock(*_args, **_kwargs):
        raise AssertionError("untrusted device must not acquire download-pre-v2 lock")

    monkeypatch.setattr(
        "app.api.device_dependencies.device_service.verify_request_device",
        fake_verify_request_device,
    )
    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "download_pre_v2_user_lock",
        fail_user_lock,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": "payload.md5.fake",
                "preferred_node_id": 2,
            },
            headers={"X-Device-Id": "untrusted-download-device"},
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED


@pytest.mark.asyncio
async def test_download_pre_v2_rejects_invalid_device_before_auth_dependency(
    async_client,
) -> None:
    """download-pre-v2 非法设备头不被登录依赖抢先转成设备 ID 错误。"""

    response = await async_client.post(
        "/api/client/media/download-pre-v2",
        json={
            "resource_token": "payload.md5.fake",
            "preferred_node_id": 2,
        },
        headers={"X-Device-Id": "invalid device id"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.AUTH_PAGE_REFRESH_REQUIRED


@pytest.mark.asyncio
async def test_download_pre_v2_token_cost_is_zero_for_recent_paid_download(
    async_client,
    monkeypatch,
) -> None:
    """同一资源处于免扣窗口时，download token 记录实际扣除 0 Credits。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_has_recent_paid_download(**_kwargs):
        return True

    async def fake_charge_download(**_kwargs):
        return CreditChargeResult(
            allowed=True,
            cost=0,
            balance=8,
            free_reason="recent_download",
            resource_key="resource-key-1",
            record_id=2,
        )

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "has_recent_paid_download",
        fake_has_recent_paid_download,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=1),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    claims = media_download_token_service.decode_for_download(body["data"]["token"])
    assert claims.credits_cost == 0
    assert claims.issued_ip == "203.0.113.9"


@pytest.mark.asyncio
async def test_download_pre_v2_token_contains_predicted_actual_cost(
    async_client,
    monkeypatch,
) -> None:
    """download-pre-v2 在用户锁内预判实际扣费并写入下载 token。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)
    events: list[str] = []

    async def fake_select_download_nodes(_preferred_node_id):
        events.append("select_nodes")
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_charge_download(**_kwargs):
        events.append("charge")
        return CreditChargeResult(
            allowed=True,
            cost=1,
            balance=9,
            free_reason=None,
            resource_key="resource-key-1",
        )

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=1),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["token"]
    assert body["data"]["credits_balance"] == 9
    claims = media_download_token_service.decode_for_download(body["data"]["token"])
    assert claims.credits_cost == 1
    assert claims.issued_ip == "203.0.113.9"
    assert events == ["select_nodes", "charge"]


@pytest.mark.asyncio
async def test_download_pre_v2_ignores_legacy_size_body(
    async_client,
    monkeypatch,
) -> None:
    """download-pre-v2 忽略旧 size/source 请求体字段，只信 resource token。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_charge_download(**kwargs):
        assert kwargs["size_bytes"] == 1
        return CreditChargeResult(
            allowed=True,
            cost=1,
            balance=9,
            free_reason=None,
            resource_key="resource-key-1",
        )

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )
    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=1),
                "preferred_node_id": 2,
                "size": 999,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    assert response.json()["code"] == 10000


@pytest.mark.asyncio
async def test_download_pre_v2_invalid_resource_token_rejected(
    async_client,
    monkeypatch,
) -> None:
    """resource token 篡改或伪造时拒绝且不扣 Credits。"""

    _patch_token_config(monkeypatch)
    lock_calls = _patch_user_lock(monkeypatch)
    charge_calls = 0

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        raise AssertionError("invalid token must not charge")

    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": "payload.md5.fake",
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
    assert body["data"]["reason"] == "resource_token_verification_failed"
    assert body["data"]["failure_reason"].startswith(
        "resource_token_verification_failed:"
    )
    assert charge_calls == 0
    assert lock_calls == {"acquire": 1, "release": 1}


@pytest.mark.asyncio
async def test_download_pre_v2_rejects_non_allowlisted_media_before_charge(
    async_client,
    monkeypatch,
) -> None:
    """非白名单资源在扣 Credits 和签发 media_download token 前被拒绝。"""

    _patch_token_config(monkeypatch)
    lock_calls = _patch_user_lock(monkeypatch)
    events: list[str] = []

    async def fake_has_recent_paid_download(**_kwargs):
        events.append("has_recent_paid_download")
        raise AssertionError("non-allowlisted media must not query recent downloads")

    async def fake_select_download_nodes(_preferred_node_id):
        events.append("select_nodes")
        raise AssertionError("non-allowlisted media must not select nodes")

    async def fake_charge_download(**_kwargs):
        events.append("charge")
        raise AssertionError("non-allowlisted media must not charge")

    monkeypatch.setattr(
        pre_router_module.media_service,
        "has_recent_paid_download",
        fake_has_recent_paid_download,
    )
    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(
                    filename="payload.bin",
                    mime_type="application/octet-stream",
                    size=1,
                ),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == CommonCode.MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED
    assert body["data"] == {}
    assert "token" not in body["data"]
    assert events == []
    assert lock_calls == {"acquire": 1, "release": 1}


@pytest.mark.asyncio
async def test_download_pre_v2_credit_insufficient_returns_credit_code(
    async_client,
    monkeypatch,
) -> None:
    """Credits 余额不足返回 CREDIT_INSUFFICIENT，不返回下载 token。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)
    select_calls = 0
    charge_calls = 0

    async def fake_select_download_nodes(_preferred_node_id):
        nonlocal select_calls
        select_calls += 1
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        return CreditChargeResult(
            allowed=False,
            cost=2,
            balance=1,
            free_reason=None,
            resource_key="resource-key-1",
        )

    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=50 * 1024 * 1024),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == CommonCode.CREDIT_INSUFFICIENT
    assert body["data"] == {
        "credits_cost": 2,
        "credits_balance": 1,
        "resource_key": "resource-key-1",
    }
    assert "token" not in body["data"]
    assert select_calls == 1
    assert charge_calls == 1


@pytest.mark.asyncio
async def test_download_pre_v2_user_lock_covers_credit_charge(
    async_client,
    monkeypatch,
) -> None:
    """同一用户短锁覆盖 Credits 扣费，双击不会重复调用扣费。"""

    _patch_token_config(monkeypatch)
    charge_started = asyncio.Event()
    release_charge = asyncio.Event()
    lock_owner: str | None = None
    lock_tokens = 0
    charge_calls = 0

    async def fake_acquire_user_lock(
        key: str,
        ttl: int = 30,
        timeout: int | None = None,
    ):
        nonlocal lock_owner, lock_tokens
        assert key == _expected_user_lock_key()
        assert ttl == 5
        assert timeout is None
        if lock_owner is not None:
            return None
        lock_tokens += 1
        lock_owner = f"lock-token-{lock_tokens}"
        return lock_owner

    async def fake_release_user_lock(key: str, token: str):
        nonlocal lock_owner
        assert key == _expected_user_lock_key()
        if lock_owner == token:
            lock_owner = None

    async def fake_select_download_nodes(_preferred_node_id):
        return [
            SimpleNamespace(
                node_id=2,
                api_url=lambda path: f"https://dl.example.com{path}",
            )
        ]

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        if charge_calls > 1:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg="test: second request reached Credits charge",
            )
        charge_started.set()
        await release_charge.wait()
        return CreditChargeResult(
            allowed=True,
            cost=1,
            balance=9,
            free_reason=None,
            resource_key="resource-key-1",
        )

    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "acquire",
        fake_acquire_user_lock,
    )
    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "release",
        fake_release_user_lock,
    )
    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    first_payload = {
        "resource_token": _resource_token(size=1),
        "preferred_node_id": 2,
    }
    second_payload = {
        "resource_token": _resource_token(size=1),
        "preferred_node_id": 2,
    }

    _install_download_pre_user()
    try:
        first_task = asyncio.create_task(
            async_client.post(
                "/api/client/media/download-pre-v2",
                json=first_payload,
                headers=_download_pre_headers(),
            )
        )
        await asyncio.wait_for(charge_started.wait(), timeout=1)

        second_response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json=second_payload,
            headers=_download_pre_headers(),
        )
        release_charge.set()
        first_response = await first_task
    finally:
        release_charge.set()
        _clear_download_pre_user()

    assert first_response.status_code == 200
    assert first_response.json()["code"] == 10000
    assert second_response.status_code == 200
    assert second_response.json()["code"] == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    assert second_response.json()["code"] != CommonCode.CREDIT_INVALID_REQUEST
    assert charge_calls == 1


@pytest.mark.asyncio
async def test_download_pre_v2_node_failure_does_not_charge(
    async_client,
    monkeypatch,
) -> None:
    """节点选择失败时不扣 Credits。"""

    _patch_token_config(monkeypatch)
    _patch_user_lock(monkeypatch)
    charge_calls = 0

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        raise AssertionError("node failure must not charge")

    async def fake_select_download_nodes(_preferred_node_id):
        raise AppCommonException(CommonCode.MEDIA_SERVICE_NODE_UNAVAILABLE)

    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )
    monkeypatch.setattr(
        pre_module.media_pre_authorization_service,
        "_select_download_nodes",
        fake_select_download_nodes,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=1),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.MEDIA_SERVICE_NODE_UNAVAILABLE
    assert charge_calls == 0


@pytest.mark.asyncio
async def test_download_pre_v2_user_lock_busy_does_not_charge(
    async_client,
    monkeypatch,
) -> None:
    """用户锁忙时不扣 Credits。"""

    _patch_token_config(monkeypatch)
    charge_calls = 0

    async def fake_acquire_user_lock(
        _key: str,
        ttl: int = 30,
        timeout: int | None = None,
    ):
        assert ttl == 5
        assert timeout is None
        return None

    async def fake_release_user_lock(_key: str, _token: str):
        raise AssertionError("lock not acquired must not release")

    async def fake_charge_download(**_kwargs):
        nonlocal charge_calls
        charge_calls += 1
        raise AssertionError("lock busy must not charge")

    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "acquire",
        fake_acquire_user_lock,
    )
    monkeypatch.setattr(
        pre_module._download_pre_user_lock,
        "release",
        fake_release_user_lock,
    )
    monkeypatch.setattr(
        pre_router_module.media_service,
        "charge_download",
        fake_charge_download,
    )

    _install_download_pre_user()
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={
                "resource_token": _resource_token(size=1),
                "preferred_node_id": 2,
            },
            headers=_download_pre_headers(),
        )
    finally:
        _clear_download_pre_user()

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    assert charge_calls == 0
