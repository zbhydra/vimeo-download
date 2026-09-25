"""支付渠道、币种与金额单位常量。

支付 provider、配置表校验和回调入口共用这里的定义，避免同一渠道编码散落多处。
"""

import re

from app.utils.money import NORMALIZED_AMOUNT_FACTOR

DISPLAY_PRICE_CHANNEL_CODE = "display"
CLINK_PAYMENT_METHOD = "clink"
PAYPAL_PAYMENT_METHOD = "paypal"
PAYPAL_CURRENCY = "USD"
PAYPAL_USD_AMOUNT_UNIT = NORMALIZED_AMOUNT_FACTOR // 100

_PAYPAL_PLAN_ID_PATTERN = re.compile(r"P-[A-Z0-9]{24}")


def payment_currency_matches_channel(channel_code: str, currency: str) -> bool:
    """判断渠道结算币种是否满足当前 Provider 合同。

    PayPal 仅售 USD 是项目约束。
    """

    if channel_code == PAYPAL_PAYMENT_METHOD:
        return currency == PAYPAL_CURRENCY
    return True


def recurring_provider_sku_parts(
    channel_code: str,
    provider_sku: str | None,
) -> tuple[str, ...] | None:
    """解析自动续费 SKU；返回 None 表示不符合当前渠道合同。"""

    value = provider_sku.strip() if provider_sku else ""
    # PayPal OpenAPI 对创建订阅的 Plan ID 定义为 26 位 P- 前缀大写标识。
    if channel_code == PAYPAL_PAYMENT_METHOD:
        return (value,) if _PAYPAL_PLAN_ID_PATTERN.fullmatch(value) else None
    # Clink API 使用两个独立 ID，冒号仅是本项目单列存储约定。
    if channel_code == CLINK_PAYMENT_METHOD:
        parts = tuple(part.strip() for part in value.split(":"))
        return parts if len(parts) == 2 and all(parts) else None
    return None
