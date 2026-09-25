"""Website 签到 API 的请求和响应结构。"""

from pydantic import BaseModel, ConfigDict, Field


class CheckinClaimRequest(BaseModel):
    """签到领取请求体；额外字段忽略，领取日期和奖励以后端计算为准。"""

    model_config = ConfigDict(extra="ignore")


class CheckinEntryResponse(BaseModel):
    """进入签到系统返回的完整状态。"""

    campaign_ended: bool = Field(..., description="活动是否已结束")
    start_date: str = Field(..., description="活动开始日期 YYYY-MM-DD")
    end_date: str = Field(..., description="活动结束日期 YYYY-MM-DD")
    start_at: int = Field(..., description="活动开始时间毫秒时间戳")
    end_at: int = Field(..., description="活动结束时间毫秒时间戳")
    today: str = Field(..., description="服务器 America/New_York 今日日期")
    day_index: int = Field(..., ge=1, le=14, description="今天对应活动日，最大为 14")
    today_reward_credits: int = Field(..., description="今天可领取 Credits，结束后为 0")
    today_claimed: bool = Field(..., description="今天是否已领取")
    total_claim_days: int = Field(..., description="累计成功签到天数")
    credits_balance: int = Field(..., description="当前 Credits 余额")
    next_claim_at: str | None = Field(
        None,
        description="下一次可领取时间，当前可领时为 null",
    )
    next_claim_at_ts: int | None = Field(
        None,
        description="下一次可领取时间毫秒时间戳，当前可领时为 null",
    )


class CheckinClaimResponse(BaseModel):
    """签到领取成功后的返回结构。"""

    claim_date: str = Field(..., description="本次签到日期 YYYY-MM-DD")
    day_index: int = Field(..., description="本次签到活动日")
    reward_credits: int = Field(..., description="本次发放 Credits")
    credits_balance: int = Field(..., description="发放后最新 Credits 余额")
    today_claimed: bool = Field(..., description="固定为 true")
    campaign_ended: bool = Field(..., description="固定为 false")
    next_claim_at: str | None = Field(
        None,
        description="下一次可领取时间 ISO8601，第 14 天领取后为 null",
    )
    next_claim_at_ts: int | None = Field(
        None,
        description="下一次可领取时间毫秒时间戳，第 14 天领取后为 null",
    )
