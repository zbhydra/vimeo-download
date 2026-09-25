"""金额整数工具。

订单内部统一使用 6 位精度的整数金额，避免浮点数误差。
"""

from decimal import Decimal

NORMALIZED_AMOUNT_SCALE = 6
NORMALIZED_AMOUNT_FACTOR = 10**NORMALIZED_AMOUNT_SCALE


def normalize_currency(currency: str) -> str:
    """规范化币种代码。"""
    return currency.strip().upper()


def validate_normalized_amount(amount: int) -> int:
    """校验金额已经是统一 6 位精度整数。

    Args:
        amount: 真实金额乘以 1_000_000 后的整数。

    Returns:
        原样返回的金额。
    """
    if type(amount) is not int:
        raise TypeError(f"amount must be int: type={type(amount).__name__}")
    if amount < 0:
        raise ValueError(f"amount must be non-negative: amount={amount}")
    return amount


def format_normalized_amount(amount: int) -> str:
    """把 6 位精度整数金额格式化为十进制字符串。"""
    value = Decimal(amount) / Decimal(NORMALIZED_AMOUNT_FACTOR)
    return format(value, "f")
