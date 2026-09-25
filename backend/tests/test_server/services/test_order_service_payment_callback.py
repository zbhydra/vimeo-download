"""OrderService.handle_payment_callback 并发收敛与 fail-open 单元测试。

验证支付回调重构的核心不变量：
1. Redis 锁故障 / 超时时 fail-open（降级无锁查重，不阻断支付主流程）。
2. 锁内查重命中（并发第二条回调 / 重复回调）时不新建续费单——这是本次修复的目标。
3. 正常续费首次在锁内建单。
4. Provider 后置 hook 仅在「用户首单 + 首次成功履约」时触发，幂等命中不触发。

这些测试 monkeypatch handle_payment_callback 的依赖方法与 RedisLock，
不连真实 DB / Redis，聚焦验证续费建单的并发收敛逻辑。
"""

from types import SimpleNamespace

import pytest

from app.constants.order import OrderStatus
from app.provider.payment.payment_base import (
    CallbackVerificationResult,
    RecurringPaymentReference,
)
from app.services.order_service import order_service
from app.utils.redis_lock import RedisLock

PAYPAL = "paypal"


async def _async_release(self, key: str, value: str) -> bool:
    """测试用：替代 RedisLock.release，避免连真实 Redis。"""

    return True


def _paid_original_order(*, order_no: str = "ORDER-ORIG") -> SimpleNamespace:
    """构造一个已支付的首期订阅订单快照，供续费派生读取。"""

    return SimpleNamespace(
        order_no=order_no,
        user_id=1001,
        product_class=1,
        product_id="unlimited",
        product_name="Unlimited",
        amount=15_300_000,
        currency="USD",
        client_ip="127.0.0.1",
        extra_metadata='{"client_language":"en-US"}',
        order_status=OrderStatus.PAID.value,
        payment_method=PAYPAL,
    )


def _recurring_callback(
    *,
    channel_order_no: str = "SALE-1",
    original_order_no: str = "ORDER-ORIG",
) -> CallbackVerificationResult:
    """构造一条 PayPal 续费 sale 的回调验签结果。"""

    return CallbackVerificationResult(
        valid=True,
        processed=True,
        event="PAYMENT.SALE.COMPLETED",
        channel_order_no=channel_order_no,
        channel_uid="PAYER-1",
        amount=15_300_000,
        currency="USD",
        transaction_id=channel_order_no,
        recurring_reference=RecurringPaymentReference(
            original_order_no=original_order_no
        ),
    )


def _stub_recurring_service(
    monkeypatch,
    *,
    existing: SimpleNamespace | None = None,
    created_order_no: str = "ORDER-RENEWAL",
    idempotent: bool = False,
    callback_triggered: bool = True,
) -> SimpleNamespace:
    """替换 handle_payment_callback 续费路径依赖的 service 方法，返回调用计数。"""

    calls = SimpleNamespace(create_order=0, order_success=0, hook=0)

    async def get_by_channel(payment_method: str, channel_order_no: str):
        return existing

    async def get_by_no(order_no: str):
        return _paid_original_order(order_no=order_no)

    async def create_order(_param):
        calls.create_order += 1
        return SimpleNamespace(order_no=created_order_no)

    async def order_success(*, order_no, **_kwargs):
        calls.order_success += 1
        return {
            "order_no": order_no,
            "idempotent": idempotent,
            "callback_triggered": callback_triggered,
        }

    async def hook(**_kwargs):
        calls.hook += 1

    monkeypatch.setattr(
        order_service, "get_order_by_payment_channel_order_no", get_by_channel
    )
    monkeypatch.setattr(order_service, "get_order_by_no", get_by_no)
    monkeypatch.setattr(order_service, "create_order", create_order)
    monkeypatch.setattr(order_service, "order_success", order_success)
    monkeypatch.setattr(order_service, "_run_after_order_success_hook", hook)
    return calls


@pytest.mark.asyncio
async def test_recurring_lock_error_fails_open_and_creates_order(monkeypatch):
    """Redis 不可用时 acquire 抛异常，fail-open 降级仍创建续费单。"""

    async def acquire_raise(self, key, ttl=30, timeout=None):
        raise RuntimeError("redis down")

    monkeypatch.setattr(RedisLock, "acquire", acquire_raise)
    monkeypatch.setattr(RedisLock, "release", _async_release)

    calls = _stub_recurring_service(monkeypatch, existing=None)
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=_recurring_callback()
    )

    assert calls.create_order == 1
    assert result.order_no == "ORDER-RENEWAL"
    assert result.idempotent is False


@pytest.mark.asyncio
async def test_recurring_lock_timeout_fails_open_and_creates_order(monkeypatch):
    """抢锁超时（acquire 返回 None）同样 fail-open 创建续费单。"""

    async def acquire_timeout(self, key, ttl=30, timeout=None):
        return None

    monkeypatch.setattr(RedisLock, "acquire", acquire_timeout)

    calls = _stub_recurring_service(monkeypatch, existing=None)
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=_recurring_callback()
    )

    assert calls.create_order == 1
    assert result.order_no == "ORDER-RENEWAL"


@pytest.mark.asyncio
async def test_recurring_duplicate_callback_reuses_existing_order(monkeypatch):
    """锁内查重命中（并发第二条回调）时不新建续费单，复用已建订单。"""

    async def acquire_ok(self, key, ttl=30, timeout=None):
        return "lock-value"

    monkeypatch.setattr(RedisLock, "acquire", acquire_ok)
    monkeypatch.setattr(RedisLock, "release", _async_release)

    existing = SimpleNamespace(
        order_no="ORDER-EXISTING",
        payment_method=PAYPAL,
        order_status=OrderStatus.PAID.value,
    )
    calls = _stub_recurring_service(monkeypatch, existing=existing)
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=_recurring_callback()
    )

    assert calls.create_order == 0
    assert result.order_no == "ORDER-EXISTING"


@pytest.mark.asyncio
async def test_recurring_first_callback_creates_order_without_provider_hook(
    monkeypatch,
):
    """续费派生单（user_created_order=False）建单成功但不触发 Provider 后置 hook。"""

    async def acquire_ok(self, key, ttl=30, timeout=None):
        return "lock-value"

    monkeypatch.setattr(RedisLock, "acquire", acquire_ok)
    monkeypatch.setattr(RedisLock, "release", _async_release)

    calls = _stub_recurring_service(monkeypatch, existing=None)
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=_recurring_callback()
    )

    assert calls.create_order == 1
    assert calls.hook == 0
    assert result.order_no == "ORDER-RENEWAL"


@pytest.mark.asyncio
async def test_user_created_first_success_runs_provider_hook(monkeypatch):
    """主动付款首单首次成功履约时触发 Provider 后置 hook；幂等命中不触发。"""

    active = SimpleNamespace(
        order_no="ORDER-ACTIVE",
        payment_method=PAYPAL,
        order_status=OrderStatus.PENDING.value,
    )
    calls = SimpleNamespace(create_order=0, order_success=0, hook=0)

    async def get_by_channel(payment_method: str, channel_order_no: str):
        return active

    async def order_success(*, order_no, **_kwargs):
        calls.order_success += 1
        return {
            "order_no": order_no,
            "idempotent": False,
            "callback_triggered": True,
        }

    async def hook(**_kwargs):
        calls.hook += 1

    monkeypatch.setattr(
        order_service, "get_order_by_payment_channel_order_no", get_by_channel
    )
    monkeypatch.setattr(order_service, "order_success", order_success)
    monkeypatch.setattr(order_service, "_run_after_order_success_hook", hook)

    callback = CallbackVerificationResult(
        valid=True,
        processed=True,
        event="successful_payment",
        order_no="ORDER-ACTIVE",
        channel_order_no="CHARGE-1",
        channel_uid="PAYER-1",
        amount=15_300_000,
        currency="USD",
        # recurring_reference 留空 → original_order_no=None → 主动付款分支。
    )
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=callback
    )

    assert result.callback_triggered is True
    assert calls.hook == 1


@pytest.mark.asyncio
async def test_idempotent_duplicate_does_not_run_provider_hook(monkeypatch):
    """重复回调幂等命中（idempotent=True）时不触发 Provider 后置 hook。"""

    active = SimpleNamespace(
        order_no="ORDER-ACTIVE",
        payment_method=PAYPAL,
        order_status=OrderStatus.PAID.value,
    )
    calls = SimpleNamespace(hook=0)

    async def get_by_channel(payment_method: str, channel_order_no: str):
        return active

    async def order_success(*, order_no, **_kwargs):
        return {
            "order_no": order_no,
            "idempotent": True,
            "callback_triggered": False,
        }

    async def hook(**_kwargs):
        calls.hook += 1

    monkeypatch.setattr(
        order_service, "get_order_by_payment_channel_order_no", get_by_channel
    )
    monkeypatch.setattr(order_service, "order_success", order_success)
    monkeypatch.setattr(order_service, "_run_after_order_success_hook", hook)

    callback = CallbackVerificationResult(
        valid=True,
        processed=True,
        event="successful_payment",
        order_no="ORDER-ACTIVE",
        channel_order_no="CHARGE-1",
        channel_uid="PAYER-1",
        amount=15_300_000,
        currency="USD",
    )
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL, callback=callback
    )

    assert result.idempotent is True
    assert calls.hook == 0
