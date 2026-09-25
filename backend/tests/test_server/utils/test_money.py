"""金额整数工具测试。"""

import pytest

from app.utils.money import (
    NORMALIZED_AMOUNT_FACTOR,
    NORMALIZED_AMOUNT_SCALE,
    format_normalized_amount,
    normalize_currency,
    validate_normalized_amount,
)


def test_normalize_currency_uppercases_and_strips_code():
    """币种代码统一按大写无空白处理。"""
    assert normalize_currency(" usdt ") == "USDT"


def test_normalized_amount_constants_use_six_decimal_integer():
    """统一金额精度固定为 6 位。"""
    assert NORMALIZED_AMOUNT_SCALE == 6
    assert NORMALIZED_AMOUNT_FACTOR == 1_000_000


def test_validate_normalized_amount_returns_integer_amount():
    """已是 6 位精度整数的金额原样通过。"""
    assert validate_normalized_amount(1_890_000) == 1_890_000


def test_format_normalized_amount_returns_decimal_string():
    """6 位精度整数金额转十进制字符串。"""
    assert format_normalized_amount(0) == "0"
    assert format_normalized_amount(12_345_678) == "12.345678"
    assert format_normalized_amount(15_300_000) == "15.3"


def test_validate_normalized_amount_rejects_negative_amount():
    """金额不能为负数。"""
    with pytest.raises(ValueError, match="non-negative"):
        validate_normalized_amount(-1)


def test_validate_normalized_amount_rejects_bool_amount():
    """布尔值不能被当作整数金额。"""
    with pytest.raises(TypeError, match="amount must be int"):
        validate_normalized_amount(True)
