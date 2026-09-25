"""配额相关数据模型"""

from typing import Literal

from pydantic import BaseModel, Field


class CheckQuotaRequest(BaseModel):
    """配额检查请求"""

    count: int = Field(default=1, ge=1, le=10000, description="请求的下载次数")


class CheckQuotaResponse(BaseModel):
    """配额检查响应"""

    allowed: bool = Field(..., description="是否允许下载")
    count: int = Field(..., description="请求的下载次数")
    used: int = Field(..., description="当日已用次数")
    remaining: int = Field(..., description="剩余配额")
    status: Literal[1, 0] = Field(..., description="业务状态：1-OK，0-配额不足")
    reset_at: int = Field(..., description="下次额度刷新时间（毫秒时间戳）")
