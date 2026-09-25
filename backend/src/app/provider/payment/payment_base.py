"""支付 provider 抽象基类。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from fastapi import Request


@dataclass
class PaymentRequest:
    """支付请求"""

    order_no: str
    payment_method: str
    order_status: int
    amount: int
    currency: str
    product_name: str
    expired_at: int
    callback_url: str | None = None
    client_ip: str | None = None
    user_id: int | None = None
    auto_renew: bool = False
    provider_sku: str | None = None


@dataclass(frozen=True, slots=True)
class RecurringPaymentReference:
    """支付渠道回调携带的统一续费引用。"""

    original_order_no: str | None = None


@dataclass
class CallbackVerificationResult:
    """回调验证结果"""

    valid: bool
    processed: bool = False
    event: str | None = None
    order_no: str | None = None
    channel_order_no: str | None = None
    channel_uid: str | None = None
    amount: int | None = None
    currency: str | None = None
    transaction_id: str | None = None
    extra_metadata: str | None = None
    provider_data: dict[str, object] | None = None
    # 渠道续费引用：订阅类回调由 Provider 填充首期本地订单号，
    # 供 OrderService 定位续费单；非续费或主动付款回调为空引用。
    recurring_reference: RecurringPaymentReference = field(
        default_factory=RecurringPaymentReference
    )
    error_message: str | None = None


@dataclass(frozen=True, slots=True)
class AfterOrderSuccessContext:
    """订单首次同步履约成功后的统一 Provider 上下文。"""

    order_no: str
    payment_method: str
    channel_order_no: str
    channel_uid: str | None
    language: str | None


@dataclass(frozen=True, slots=True)
class AfterOrderSuccessResult:
    """Provider 后置动作的统一处理结果。"""

    processed: bool = False


class PaymentProviderError(RuntimeError):
    """支付 provider 创建支付或校验回调失败。"""


class PaymentBase(ABC):
    """支付提供者抽象基类"""

    provider_name: str = ""

    def __init__(self, config: dict | None = None) -> None:
        pass

    def recurring_payment_reference(
        self,
        *,
        order_no: str | None,
        is_recurring: bool,
    ) -> RecurringPaymentReference:
        """把渠道续费字段转换为统一引用，非续费 Provider 默认返回空引用。"""

        return RecurringPaymentReference()

    async def after_order_success(
        self,
        context: AfterOrderSuccessContext,
    ) -> AfterOrderSuccessResult:
        """执行订单首次同步履约后的渠道动作，默认无需处理。"""

        return AfterOrderSuccessResult()

    async def create_subscription_management_url(
        self,
        *,
        channel_uid: str | None,
        return_url: str,
    ) -> str | None:
        """创建渠道订阅管理入口；无 Web 管理页的渠道返回 None。"""

        raise PaymentProviderError(
            f"{self.provider_name}.create_subscription_management_url: "
            "subscription management is unsupported"
        )

    @abstractmethod
    async def create_payment(self, request: PaymentRequest) -> dict[str, object]:
        """创建支付

        Args:
            request: 支付请求

        Returns:
            dict[str, object]: 支付方式自己的返回数据，API 原样放入 payment_data。
        """
        pass

    @abstractmethod
    async def verify_callback(self, request: Request) -> CallbackVerificationResult:
        """验证支付回调签名和数据

        Args:
            request: FastAPI Request 对象

        Returns:
            CallbackVerificationResult: 验证结果
        """
        pass
