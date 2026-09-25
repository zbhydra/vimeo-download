"""订单系统常量定义"""

from dataclasses import dataclass
import enum

ORDER_CLIENT_LANGUAGE_METADATA_KEY = "client_language"


class ProductClass(int, enum.Enum):
    """商品类别枚举"""

    SUBSCRIPTION = 1  # 订阅商品
    RECHARGE = 2  # 充值商品
    EXTENSION = 3  # 扩展功能
    OTHER = 4  # 其他


class OrderStatus(int, enum.Enum):
    """订单状态枚举"""

    PENDING = 1  # 待支付
    PAID = 2  # 已支付
    CANCELLED = 3  # 已取消
    REFUNDED = 4  # 已退款
    EXPIRED = 5  # 已过期


class CallbackStatus(int, enum.Enum):
    """业务回调状态枚举"""

    NOT_CALLED = 1  # 未回调
    PENDING = 2  # 待回调
    SUCCESS = 3  # 回调成功
    FAILED = 4  # 回调失败
    MAX_RETRY = 5  # 超过最大重试次数


@dataclass
class OrderCheckProductParam:
    """下单前商品校验参数。"""

    user_id: int
    product_class: int
    product_id: str
    payment_method: str
    amount: int
    currency: str
    auto_renew: bool = False
    period: str = "none"
    client_ip: str | None = None
    language: str | None = None


@dataclass
class OrderCreateParam:
    """订单创建步骤"""

    user_id: int
    product_class: int
    product_id: str
    product_name: str
    amount: int
    payment_method: str
    currency: str = "USD"
    client_ip: str | None = None
    extra_metadata: str | None = None
    language: str | None = None
    auto_renew: bool = False
    provider_sku: str | None = None
    # 续费单建单即写入渠道流水，供回调按 (payment_method, payment_channel_order_no) 查重。
    payment_channel_order_no: str | None = None


@dataclass(frozen=True, slots=True)
class PaymentCallbackResult:
    """支付回调完成订单处理后的统一结果。"""

    order_no: str
    idempotent: bool
    callback_triggered: bool
