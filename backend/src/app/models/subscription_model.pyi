"""类型存根 - UserSubscriptionModel"""

from app.models.base import BaseDBModel

class UserSubscriptionModel(BaseDBModel):
    """用户订阅表类型存根"""

    user_id: int
    product_id: str | None
    product_price_id: int | None
    auto_renew: bool | None
    period: str | None
    payment_method: str | None
    original_order_no: str | None
    channel_subscription_id: str | None
    channel_uid: str | None
    start_at: int | None
    cancelled_at: int | None
    expires_at: int | None
    created_at: int
    updated_at: int

    def __init__(
        self,
        user_id: int,
        product_id: str | None = None,
        product_price_id: int | None = None,
        auto_renew: bool | None = None,
        period: str | None = None,
        payment_method: str | None = None,
        original_order_no: str | None = None,
        channel_subscription_id: str | None = None,
        channel_uid: str | None = None,
        start_at: int | None = None,
        cancelled_at: int | None = None,
        expires_at: int | None = None,
        created_at: int | None = None,
        updated_at: int | None = None,
    ) -> None: ...
