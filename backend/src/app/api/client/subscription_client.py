"""订阅管理 API - 客户端接口。"""

from fastapi import APIRouter, Depends

from app.api.user_dependencies import (
    UserContext,
    get_current_user,
    get_current_user_if_authenticated,
    get_current_user_optional,
)
from app.constants.order import ProductClass
from app.constants.subscription import SubscriptionProductMetadata
from app.schemas.subscription_schema import (
    SubscriptionCheckoutConfigListResponse,
    SubscriptionManagementResponse,
    SubscriptionReviewRewardClaimResponse,
    SubscriptionStatusResponse,
)
from app.services.payment_config_service import (
    SubscriptionCheckoutPlanConfig,
    payment_config_service,
)
from app.services.payment_service import payment_service
from app.services.subscription_review_reward_service import (
    subscription_review_reward_service,
)
from app.services.subscription_status_service import subscription_status_service
from app.services.subscription_service import subscription_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/subscription", tags=["订阅管理"])


@router.get(
    "/checkout-configs",
    response_model=SubscriptionCheckoutConfigListResponse,
)
async def list_subscription_checkout_configs(
    current_user: UserContext | None = Depends(get_current_user_if_authenticated),
):
    """获取客户端订阅方案配置列表。"""
    checkout_plans = await payment_config_service.list_subscription_checkout_configs()
    review_reward_enabled = await subscription_review_reward_service.is_enabled()

    claimed_count = 0
    if review_reward_enabled and current_user is not None:
        claimed_count = (
            await subscription_review_reward_service.claimed_count_for_display(
                user_id=current_user.user_id,
                device_id=current_user.device_id,
            )
        )

    return ResponseUtils.ok(
        {
            "checkout_configs": _serialize_checkout_plans(checkout_plans),
            "review_reward_enabled": review_reward_enabled,
            "review_reward_claimed_count": claimed_count,
        }
    )


@router.post(
    "/review-reward/claim",
    response_model=SubscriptionReviewRewardClaimResponse,
)
async def claim_subscription_review_reward(
    current_user: UserContext = Depends(get_current_user),
):
    """为严格登录账号领取一次 7 天好评赠送订阅。

    设备标识是领取事实的两个维度之一，缺失或非法时在入口拒绝，不进入领取编排。
    """

    result = await subscription_review_reward_service.claim(
        user_id=current_user.user_id,
        device_id=current_user.validated_device_id(),
    )
    return ResponseUtils.ok(
        {
            "result": result.result,
            "review_reward_claimed_count": result.review_reward_claimed_count,
        }
    )


@router.post(
    "/management",
    response_model=SubscriptionManagementResponse,
)
async def create_subscription_management(
    current_user: UserContext = Depends(get_current_user),
):
    """创建当前登录账号的自动续费订阅管理入口。"""

    url = await subscription_service.create_management_url(current_user.user_id)
    return ResponseUtils.ok({"url": url})


def _serialize_checkout_plans(
    checkout_plans: list[SubscriptionCheckoutPlanConfig],
) -> list[dict[str, object]]:
    """序列化前端订阅方案配置。

    Args:
        checkout_plans: 支付配置服务返回的订阅方案快照。

    Returns:
        list[dict]: 包含启用商品；无可用渠道的方案已在配置服务层过滤，不会返回。
    """

    response_plans: list[dict[str, object]] = []
    for plan in checkout_plans:
        metadata = SubscriptionProductMetadata.from_metadata(
            plan.product.metadata,
            product_id=plan.product.product_id,
        )
        payment_channels = [
            {
                "payment_method": item.channel.channel_code,
                "payment_method_name": item.channel.channel_name,
                "product_price_id": item.price.id,
                "currency": item.price.currency,
                "amount": item.price.amount,
            }
            for item in plan.payment_channels
            if payment_service.is_supported_method(item.channel.channel_code)
        ]
        response_plans.append(
            {
                "product_class": ProductClass.SUBSCRIPTION.value,
                "product_id": plan.product.product_id,
                "product_name": plan.product.name,
                "period": plan.product.period,
                "auto_renew": plan.product.auto_renew,
                "display_currency": plan.product.display_currency,
                "display_amount": plan.product.display_amount,
                "daily_limit": metadata.daily_limit,
                "extension_daily_download_limit": (
                    metadata.extension_daily_download_limit
                ),
                "payment_channels": payment_channels,
            }
        )

    return response_plans


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    current_user: UserContext = Depends(get_current_user_optional),
):
    """获取当前用户订阅状态

    支持已登录和未登录用户：
    - 已登录：使用 user_id 获取订阅配置和配额
    - 未登录：返回游客免费订阅（user_id=0），配额基于 device_id 统计
    - 既没有 token 也没有 device_id：返回 401 错误
    """

    if current_user.user_id > 0:
        u_id = str(current_user.user_id)
    else:
        u_id = current_user.validated_device_id()

    data = await subscription_status_service.build_status_data(
        user_id=current_user.user_id,
        quota_u_id=u_id,
        device_id=current_user.device_id,
    )
    return ResponseUtils.ok(data)
