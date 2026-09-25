"""Credits 购买 API - 客户端接口。"""

from fastapi import APIRouter

from app.constants.order import ProductClass
from app.schemas.credit_schema import CreditCheckoutConfigListResponse
from app.services.credit_checkout_config_service import CreditCheckoutPlanConfig
from app.services.credit_checkout_config_service import credit_checkout_config_service
from app.services.payment_service import payment_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/credit", tags=["Credits 购买"])


@router.get(
    "/checkout-configs",
    response_model=CreditCheckoutConfigListResponse,
)
async def list_credit_checkout_configs():
    """获取客户端 Credits 积分包配置列表。"""

    checkout_plans = await credit_checkout_config_service.list_credit_checkout_configs()
    return ResponseUtils.ok(
        {"checkout_configs": _serialize_checkout_plans(checkout_plans)}
    )


def _serialize_checkout_plans(
    checkout_plans: list[CreditCheckoutPlanConfig],
) -> list[dict[str, object]]:
    """序列化前端 Credits 积分包配置。

    Args:
        checkout_plans: Credits 配置服务返回的积分包快照。

    Returns:
        list[dict]: 包含启用商品；无已实现支付 provider 的渠道会被过滤。
    """

    response_plans: list[dict[str, object]] = []
    for plan in checkout_plans:
        payment_channels = [
            {
                "payment_method": item.channel.channel_code,
                "payment_method_name": item.channel.channel_name,
                "currency": item.price.currency,
                "amount": item.price.amount,
                "provider_sku": item.price.provider_sku,
            }
            for item in plan.payment_channels
            if payment_service.is_supported_method(item.channel.channel_code)
        ]
        if not payment_channels:
            continue
        response_plans.append(
            {
                "product_class": ProductClass.RECHARGE.value,
                "product_id": plan.product.product_id,
                "product_name": plan.product.name,
                "credits_amount": plan.product.credits_amount,
                "display_currency": plan.product.display_currency,
                "display_amount": plan.product.display_amount,
                "payment_channels": payment_channels,
            }
        )

    return response_plans
