"""好评赠送订阅 API real 测试。

真实资源依赖：
- MySQL: users / user_review_reward / counter_user_lifetime / user_subscriptions / 订阅支付配置表
- Redis: 用户 access token 白名单与账号级领取锁

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
GET /api/client/subscription/checkout-configs | Y | optional-auth | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A
POST /api/client/subscription/review-reward/claim | Y | Y | 缺 X-Device-Id | no-body | no-body | 非法 / 超长 X-Device-Id | no-body | no-body | no-body | Y

真实入口能触达的失败路径全部落在这里：未登录、缺或非法设备标识、账号锁被占、非账号维度
重复领取，都断言不写事实行、不加时。另有两条容错分支——`checkout-configs` 的资格推导失败
按不可领返回、`claim` 的资格推导失败整请求失败——只有注入故障才能复现，而 real 合同禁止替换
本系统 service / DB / 权限依赖（spec-test-server §5/§10），因此不做自动化覆盖，由代码评审把关。

测试数据约束：领取事实行是永久行，且设备作用域跨账号，因此每个用例都用唯一
设备标识，清理按 uid 删除新表行。
"""

import asyncio
from collections.abc import Awaitable, Callable, AsyncIterator
from dataclasses import dataclass, field

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import delete, insert, select, text

from app.constants.auth import TokenType
from app.core.database import get_async_session, get_engine
from app.i18n.common_code import CommonCode
from app.models.counter_user_lifetime_model import CounterUserLifetimeModel
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_review_reward_model import UserReviewRewardModel
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.redis_lock import RedisLock
from app.utils.time import get_current_ymd, timestamp_now
from app.utils.uid import build_device_scope, build_user_scope

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_DAY_MS = 24 * 60 * 60 * 1000
_REVIEW_REWARD_DAYS = 7
_CHECKOUT_CONFIGS_PATH = "/api/client/subscription/checkout-configs"
_CLAIM_PATH = "/api/client/subscription/review-reward/claim"


@dataclass(slots=True)
class _ReviewRewardAccount:
    """本文件创建的测试账号，以及它在这个用例中用过的领取维度。"""

    user_id: int
    email: str
    token: str
    device_id: str
    device_ids: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.device_id not in self.device_ids:
            self.device_ids.append(self.device_id)

    def headers(self, device_id: str | None = None) -> dict[str, str]:
        """构造严格鉴权请求头；显式传入设备标识时同时登记进清理范围。"""

        resolved = device_id or self.device_id
        if resolved not in self.device_ids:
            self.device_ids.append(resolved)
        return _auth_headers(self.token, resolved)


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的真实测试账号。"""

    accounts: list[_ReviewRewardAccount] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


def _auth_headers(token: str, device_id: str | None) -> dict[str, str]:
    """构造带可选设备标识的严格鉴权请求头。"""

    headers = {"Authorization": f"Bearer {token}"}
    if device_id:
        headers["X-Device-Id"] = device_id
    return headers


def _account_uids(account: _ReviewRewardAccount) -> list[str]:
    """列出该账号在本用例中可能写入的所有领取事实 uid。"""

    return [
        build_user_scope(account.user_id)[0],
        *[build_device_scope(device_id)[0] for device_id in account.device_ids],
    ]


async def _delete_review_reward_account(account: _ReviewRewardAccount) -> None:
    """按 uid 清理领取事实行，并清掉 Counter、订阅与 Redis token。

    用户行不在这里删：tests/conftest.py 的 autouse 清理已按测试邮箱删除本轮用户，
    重复删会与它的 users 读锁形成交叉锁等待（级联子表 X 锁 vs users 索引 S 锁）。
    """

    await user_token_service.revoke_all_user_tokens(account.user_id)
    async with get_async_session() as db:
        await db.execute(
            delete(UserReviewRewardModel).where(
                UserReviewRewardModel.uid.in_(_account_uids(account))
            )
        )
        await db.execute(
            delete(CounterUserLifetimeModel).where(
                CounterUserLifetimeModel.user_id == account.user_id
            )
        )
        await db.execute(
            delete(UserSubscriptionModel).where(
                UserSubscriptionModel.user_id == account.user_id  # type: ignore[arg-type]
            )
        )
        await db.commit()


async def _create_real_access_token(user_id: int, email: str) -> str:
    """创建真实 JWT，并写入 Redis token 白名单。"""

    token, expires_at = JwtUnit.create_access_token(
        JwtData(user_id=user_id, email=email)
    )
    await user_token_service.store_token(
        token,
        user_id,
        TokenType.USER_ACCESS,
        expires_at,
    )
    return token


async def _claim(
    client: AsyncClient,
    account: _ReviewRewardAccount,
    *,
    device_id: str | None = None,
    with_device_header: bool = True,
) -> Response:
    """调用领取接口；可指定设备标识或刻意不带设备头。"""

    if with_device_header:
        headers = account.headers(device_id)
    else:
        headers = _auth_headers(account.token, None)
    return await client.post(_CLAIM_PATH, headers=headers)


async def _checkout_configs(
    client: AsyncClient,
    account: _ReviewRewardAccount,
    *,
    device_id: str | None = None,
) -> Response:
    """读取订阅方案配置与好评赠送领取状态。"""

    return await client.get(_CHECKOUT_CONFIGS_PATH, headers=account.headers(device_id))


async def _seed_claim_row(
    *,
    user_id: int | None = None,
    device_id: str | None = None,
) -> None:
    """直接写一行领取事实，用于构造非账号维度已领取的场景。"""

    scopes = []
    if user_id is not None:
        scopes.append(build_user_scope(user_id))
    if device_id is not None:
        scopes.append(build_device_scope(device_id))
    async with get_async_session() as db:
        await db.execute(
            insert(UserReviewRewardModel).values(
                [
                    {
                        "uid": uid,
                        "ymd": get_current_ymd(),
                        "value": value,
                        "created_at": timestamp_now(),
                    }
                    for uid, value in scopes
                ]
            )
        )
        await db.commit()


async def _claim_row_values(account: _ReviewRewardAccount) -> list[str]:
    """读取该账号相关领取事实行的 value，按 uid 排序稳定断言。"""

    async with get_async_session() as db:
        result = await db.execute(
            select(UserReviewRewardModel.value)
            .where(UserReviewRewardModel.uid.in_(_account_uids(account)))
            .order_by(UserReviewRewardModel.value)
        )
        return [str(value) for value in result.scalars().all()]


async def _subscription_expires_at(user_id: int) -> int | None:
    """读取真实订阅到期时间。"""

    async with get_async_session() as db:
        return await db.scalar(
            select(  # type: ignore[call-overload]
                UserSubscriptionModel.expires_at
            ).where(
                UserSubscriptionModel.user_id == user_id  # type: ignore[arg-type]
            )
        )


def _claimed_count(response: Response) -> int:
    """读取配置接口返回的领取状态。"""

    return int(response.json()["data"]["review_reward_claimed_count"])


@pytest.fixture
async def real_review_reward_schema_ready(real_mysql_ready, real_redis_ready) -> None:
    """检查好评赠送 real 测试需要的真实表。"""

    required_tables = {
        "users",
        "user_review_reward",
        "counter_user_lifetime",
        "user_subscriptions",
        "config_payment_channel",
        "config_subscription_product",
        "config_subscription_product_price",
    }
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_review_reward_cleanup_state(
    real_review_reward_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实测试数据。"""

    state = _CleanupState()
    try:
        yield state
    finally:
        for account in state.accounts:
            await _delete_review_reward_account(account)


@pytest.fixture
def make_review_reward_account(
    real_review_reward_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
    make_test_device_id: Callable[[str], str],
) -> Callable[..., Awaitable[_ReviewRewardAccount]]:
    """按场景创建测试账号；默认带唯一设备标识，也可显式指定以复用设备维度。"""

    async def _create(
        label: str,
        *,
        device_id: str | None = None,
    ) -> _ReviewRewardAccount:
        email = make_test_email(label)
        device_id = device_id or make_test_device_id(label)
        user = await UserService().create_user_without_password(email=email)
        token = await _create_real_access_token(user.user_id, email)
        account = _ReviewRewardAccount(
            user_id=user.user_id,
            email=email,
            token=token,
            device_id=device_id,
        )
        real_review_reward_cleanup_state.accounts.append(account)
        return account

    return _create


async def test_real_review_reward_checkout_configs_returns_derived_claim_state(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """公开配置匿名返回零，账号维度已领取时返回不可领。"""

    anonymous_response = await real_async_client.get(_CHECKOUT_CONFIGS_PATH)
    invalid_token_response = await real_async_client.get(
        _CHECKOUT_CONFIGS_PATH,
        headers=_auth_headers("invalid-review-reward-token", None),
    )
    account = await make_review_reward_account("review-config")
    fresh_response = await _checkout_configs(real_async_client, account)
    await _seed_claim_row(user_id=account.user_id)
    claimed_response = await _checkout_configs(real_async_client, account)

    assert anonymous_response.status_code == 200
    assert anonymous_response.json()["code"] == 10000
    assert anonymous_response.json()["data"]["review_reward_enabled"] is True
    assert _claimed_count(anonymous_response) == 0
    assert invalid_token_response.status_code == 200
    assert invalid_token_response.json()["code"] == 10000
    assert _claimed_count(invalid_token_response) == 0
    assert fresh_response.status_code == 200
    assert fresh_response.json()["code"] == 10000
    assert _claimed_count(fresh_response) == 0
    assert claimed_response.status_code == 200
    assert claimed_response.json()["code"] == 10000
    assert _claimed_count(claimed_response) == 1


async def test_real_review_reward_checkout_configs_hides_entry_for_claimed_device(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """设备维度已有领取事实时，同设备上的新账号也返回不可领。"""

    account = await make_review_reward_account("review-config-device")
    await _seed_claim_row(device_id=account.device_id)

    response = await _checkout_configs(real_async_client, account)

    assert response.status_code == 200
    assert response.json()["code"] == 10000
    assert _claimed_count(response) == 1


async def test_real_review_reward_claim_writes_account_and_device_facts(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """全新账号首次领取写账号与设备两行，并从当前时间增加七天。"""

    account = await make_review_reward_account("review-first")
    before_ms = timestamp_now()
    response = await _claim(real_async_client, account)
    after_ms = timestamp_now()

    assert response.status_code == 200
    assert response.json()["code"] == 10000
    assert response.json()["data"] == {
        "result": "granted",
        "review_reward_claimed_count": 1,
    }
    assert await _claim_row_values(account) == sorted(
        [
            build_user_scope(account.user_id)[1],
            build_device_scope(account.device_id)[1],
        ]
    )
    expires_at = await _subscription_expires_at(account.user_id)
    assert expires_at is not None
    assert before_ms + _REVIEW_REWARD_DAYS * _DAY_MS <= expires_at
    assert expires_at <= after_ms + _REVIEW_REWARD_DAYS * _DAY_MS


async def test_real_review_reward_claim_requires_device_id(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """缺少 X-Device-Id 时领取被拒绝，且不写事实行、不加时。"""

    account = await make_review_reward_account("review-no-device")
    response = await _claim(real_async_client, account, with_device_header=False)

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.INVALID_DEVICE_ID
    assert await _claim_row_values(account) == []
    assert await _subscription_expires_at(account.user_id) is None


async def test_real_review_reward_claim_rejects_illegal_device_id(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """设备标识含非法字符或超长时领取被拒绝，且不写事实行、不加时。"""

    account = await make_review_reward_account("review-illegal-device")
    illegal_device_ids = ["review reward device", "x" * 65]

    responses = [
        await _claim(real_async_client, account, device_id=device_id)
        for device_id in illegal_device_ids
    ]

    for response in responses:
        assert response.status_code == 200
        assert response.json()["code"] == CommonCode.INVALID_DEVICE_ID
    assert await _claim_row_values(account) == []
    assert await _subscription_expires_at(account.user_id) is None


async def test_real_review_reward_claim_rejects_second_account_on_same_device(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """同一浏览器第二个账号无法再领，且不新增任何领取事实行。"""

    first = await make_review_reward_account("review-device-first")
    shared_device_id = first.device_id
    second = await make_review_reward_account(
        "review-device-second",
        device_id=shared_device_id,
    )

    first_response = await _claim(real_async_client, first)
    rows_before = await _claim_row_values(first)
    second_response = await _claim(real_async_client, second)

    assert first_response.json()["data"]["result"] == "granted"
    assert second_response.status_code == 200
    assert second_response.json()["code"] == 10000
    assert second_response.json()["data"] == {
        "result": "already_claimed",
        "review_reward_claimed_count": 1,
    }
    assert await _claim_row_values(first) == rows_before
    # 第二个账号自己维度一行都不写，能查到的只有第一个账号领取时写下的设备事实。
    assert await _claim_row_values(second) == [build_device_scope(shared_device_id)[1]]
    assert await _subscription_expires_at(second.user_id) is None


async def test_real_review_reward_claim_extends_active_subscription_once(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """有效订阅从原到期时间精确加七天，重复领取不再修改。"""

    account = await make_review_reward_account("review-active")
    original_expires_at = timestamp_now() + 3 * _DAY_MS
    async with get_async_session() as db:
        db.add(
            UserSubscriptionModel(  # type: ignore[call-arg]
                user_id=account.user_id,
                expires_at=original_expires_at,
            )
        )
        await db.commit()

    first_response = await _claim(real_async_client, account)
    rows_after_first = await _claim_row_values(account)
    second_response = await _claim(real_async_client, account)

    expected_expires_at = original_expires_at + _REVIEW_REWARD_DAYS * _DAY_MS
    assert first_response.status_code == 200
    assert first_response.json()["code"] == 10000
    assert first_response.json()["data"]["result"] == "granted"
    assert second_response.status_code == 200
    assert second_response.json()["code"] == 10000
    assert second_response.json()["data"] == {
        "result": "already_claimed",
        "review_reward_claimed_count": 1,
    }
    assert await _subscription_expires_at(account.user_id) == expected_expires_at
    assert await _claim_row_values(account) == rows_after_first


async def test_real_review_reward_claim_keeps_lifetime_identity(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """有效终生订阅领取赠送只延长到期时间，商品身份与周期不降级。"""

    account = await make_review_reward_account("review-lifetime")
    original_expires_at = timestamp_now() + 365 * _DAY_MS
    async with get_async_session() as db:
        db.add(
            UserSubscriptionModel(  # type: ignore[call-arg]
                user_id=account.user_id,
                product_id="unlimited_lifetime",
                product_price_id=999_011,
                auto_renew=False,
                period="lifetime",
                payment_method="paypal",
                expires_at=original_expires_at,
            )
        )
        await db.commit()

    response = await _claim(real_async_client, account)

    assert response.status_code == 200
    assert response.json()["code"] == 10000
    assert response.json()["data"]["result"] == "granted"
    async with get_async_session() as db:
        subscription = await db.get(UserSubscriptionModel, account.user_id)
    assert subscription is not None
    assert subscription.product_id == "unlimited_lifetime"
    assert subscription.period == "lifetime"
    assert (
        subscription.expires_at == original_expires_at + _REVIEW_REWARD_DAYS * _DAY_MS
    )


async def test_real_review_reward_concurrent_claims_only_extend_once(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """同账号并发领取最多一个 granted，事实行与加时都只落一次。"""

    account = await make_review_reward_account("review-concurrent")
    before_ms = timestamp_now()
    responses = await asyncio.gather(
        *(_claim(real_async_client, account) for _ in range(2))
    )
    after_ms = timestamp_now()

    bodies = [response.json() for response in responses]
    assert all(response.status_code == 200 for response in responses)
    assert all(
        body["code"] in {10000, CommonCode.SUBSCRIPTION_REVIEW_REWARD_BUSY.value}
        for body in bodies
    )
    assert (
        sum(
            body["code"] == 10000 and body["data"].get("result") == "granted"
            for body in bodies
        )
        == 1
    )
    assert await _claim_row_values(account) == sorted(
        [
            build_user_scope(account.user_id)[1],
            build_device_scope(account.device_id)[1],
        ]
    )
    expires_at = await _subscription_expires_at(account.user_id)
    assert expires_at is not None
    assert before_ms + _REVIEW_REWARD_DAYS * _DAY_MS <= expires_at
    assert expires_at <= after_ms + _REVIEW_REWARD_DAYS * _DAY_MS


async def test_real_review_reward_preoccupied_lock_has_no_side_effect(
    real_async_client: AsyncClient,
    make_review_reward_account: Callable[..., Awaitable[_ReviewRewardAccount]],
) -> None:
    """预占账号锁时返回繁忙，领取事实行与订阅都不写入。"""

    account = await make_review_reward_account("review-busy")
    lock = RedisLock()
    lock_key = f"subscription_review_reward:{account.user_id}"
    lock_value = await lock.acquire(lock_key, ttl=5)
    assert lock_value is not None
    try:
        response = await _claim(real_async_client, account)
    finally:
        await lock.release(lock_key, lock_value)

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.SUBSCRIPTION_REVIEW_REWARD_BUSY
    assert await _claim_row_values(account) == []
    assert await _subscription_expires_at(account.user_id) is None


async def test_real_review_reward_claim_requires_login(
    real_async_client: AsyncClient,
    real_review_reward_schema_ready,
) -> None:
    """无登录态不能调用领取接口。"""

    response = await real_async_client.post(_CLAIM_PATH)

    # HTTPBearer 在进入业务 handler 前直接拒绝，响应不经过业务错误信封。
    assert response.status_code == 401
