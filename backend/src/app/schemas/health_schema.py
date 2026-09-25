from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """验证码响应"""

    msg: str = Field(..., description="消息")
