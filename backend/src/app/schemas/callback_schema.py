from pydantic import BaseModel, Field


class TestPayCallBack(BaseModel):
    """发送邮箱验证码请求"""

    channel_order_no: str = Field(..., description="渠道订单号")
    order_no: str = Field(..., description="我们系统的订单号")
    status: int = Field(..., description="是否已支付，1=已支付，0=未支付")
