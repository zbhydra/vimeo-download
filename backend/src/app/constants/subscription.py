"""订阅周期常量和商品 metadata 配置。"""

import enum
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode


class SubscriptionPeriodEnum(str, enum.Enum):
    """订阅周期枚举"""

    NONE = "none"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"
    # 终生按 2400 个自然月一次性履约，用超长有限期表达无限期。
    LIFETIME = "lifetime"


FREE_SUBSCRIPTION_PRODUCT_ID = "free"
UNLIMITED_SUBSCRIPTION_PRODUCT_ID = "unlimited"
FREE_EXTENSION_DAILY_DOWNLOAD_LIMIT = 3


class SubscriptionProductMetadata(BaseModel):
    """订阅商品 metadata 配置。"""

    model_config = ConfigDict(extra="ignore")

    daily_limit: int = Field(description="插件端每日下载额度，-1 表示不限次数")
    extension_daily_download_limit: int = Field(description="插件端每日下载额度")

    @classmethod
    def from_metadata(
        cls,
        metadata: dict[str, Any],
        *,
        product_id: str,
    ) -> "SubscriptionProductMetadata":
        """解析订阅商品 metadata，错误信息带商品 ID。"""
        try:
            return cls.model_validate({**metadata, "_product_id": product_id})
        except ValidationError as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "subscription metadata invalid: "
                    f"product_id={product_id}, "
                    f"errors={_format_metadata_errors(exc)}"
                ),
            ) from exc

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_fields(cls, value: object) -> object:
        """Free 补齐默认值，其余商品直接使用配置的权益和计费方式。"""
        if not isinstance(value, dict):
            return value

        metadata = dict(value)
        product_id = str(metadata.pop("_product_id", "")).strip().lower()
        is_free = product_id == FREE_SUBSCRIPTION_PRODUCT_ID

        if (
            "daily_limit" not in metadata
            and "extension_daily_download_limit" in metadata
        ):
            metadata["daily_limit"] = metadata["extension_daily_download_limit"]

        if is_free:
            if "daily_limit" not in metadata:
                metadata["daily_limit"] = FREE_EXTENSION_DAILY_DOWNLOAD_LIMIT
        if "extension_daily_download_limit" not in metadata:
            metadata["extension_daily_download_limit"] = metadata.get("daily_limit")

        return metadata

    @field_validator(
        "daily_limit",
        "extension_daily_download_limit",
        mode="before",
    )
    @classmethod
    def _validate_daily_limit(cls, value: object) -> int:
        """每日额度必须是 int，且 -1 表示不限次数。"""
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"must be integer, value={value!r}")
        if value < -1:
            raise ValueError(f"must be greater than or equal to -1, value={value}")
        return value


def _format_metadata_errors(exc: ValidationError) -> str:
    """把 metadata 校验错误压成可定位字段。"""
    return "; ".join(
        f"{'.'.join(str(part) for part in error.get('loc', ()))}: "
        f"{error.get('msg', str(exc))}"
        for error in exc.errors()
    )
