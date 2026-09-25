"""Website 签到活动编排服务。

流程：
1. 进入签到系统时先读取用户最新 campaign，已存在则直接使用。
2. 只有创建正常活动或计算未结束活动奖励时，才读取签到活动配置。
3. 领取时用 campaign 主键和 last_claim_at 做 CAS，再发 Credits 并写审计。
"""

from datetime import timedelta
from typing import Any, cast

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)
from sqlalchemy import Select, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_checkin_campaign_model import UserCheckinCampaignModel
from app.models.user_checkin_record_model import UserCheckinRecordModel
from app.schemas.checkin_schema import (
    CheckinClaimResponse,
    CheckinEntryResponse,
)
from app.services.config_public_service import config_public_service
from app.services.user_credit_service import user_credit_service
from app.utils.logger import logger
from app.utils.time import (
    get_day_end_timestamp,
    get_day_start_timestamp,
    get_today_date,
    get_today_start_timestamp,
    get_tomorrow_start_timestamp,
    timestamp_now,
    timestamp_to_datetime,
    timestamp_to_ymd,
)

CHECKIN_CONFIG_KEY = "website_checkin_campaign"
CHECKIN_CREDIT_REASON = "checkin_reward"
CHECKIN_CAMPAIGN_DAYS = 14


class CheckinRewardRuleConfig(BaseModel):
    """签到奖励规则配置。"""

    model_config = ConfigDict(extra="ignore")

    start_day: int = Field(..., ge=1)
    end_day: int = Field(..., ge=1)
    credits: int = Field(..., gt=0)

    @field_validator("end_day")
    @classmethod
    def end_day_must_cover_start_day(cls, value: int, info: ValidationInfo) -> int:
        """奖励区间结束日不能早于开始日。"""

        start_day = info.data.get("start_day")
        if isinstance(start_day, int) and value < start_day:
            raise ValueError("end_day must be greater than or equal to start_day")
        return value


class CheckinCampaignConfig(BaseModel):
    """config_public 中的签到活动配置。"""

    model_config = ConfigDict(extra="ignore")

    campaign_days: int = Field(
        ...,
        ge=CHECKIN_CAMPAIGN_DAYS,
        le=CHECKIN_CAMPAIGN_DAYS,
    )
    reward_rules: list[CheckinRewardRuleConfig] = Field(..., min_length=1)

    @model_validator(mode="after")
    def reward_rules_must_cover_campaign_once(self) -> "CheckinCampaignConfig":
        """奖励规则必须无遗漏、无重叠地覆盖完整 14 天。"""

        covered_days: set[int] = set()
        for rule in self.reward_rules:
            if rule.end_day > self.campaign_days:
                raise ValueError(
                    "reward rule exceeds campaign_days: "
                    f"start_day={rule.start_day}, end_day={rule.end_day}, "
                    f"campaign_days={self.campaign_days}"
                )

            rule_days = set(range(rule.start_day, rule.end_day + 1))
            overlapping_days = sorted(covered_days & rule_days)
            if overlapping_days:
                raise ValueError(
                    "reward rules overlap: " f"overlapping_days={overlapping_days}"
                )
            covered_days.update(rule_days)

        expected_days = set(range(1, self.campaign_days + 1))
        missing_days = sorted(expected_days - covered_days)
        if missing_days:
            raise ValueError(
                "reward rules do not cover campaign: " f"missing_days={missing_days}"
            )
        return self


class UserCheckinService:
    """Website 用户签到活动编排服务。"""

    async def create_expired_campaign(
        self,
        user_id: int,
    ) -> UserCheckinCampaignModel:
        """为风控命中的注册用户创建一条已过期签到活动。"""

        if user_id <= 0:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "user_checkin_service.create_expired_campaign: invalid "
                    f"user_id={user_id}"
                ),
            )

        today_start_at = get_today_start_timestamp()
        expired_date = timestamp_to_datetime(today_start_at).date() - timedelta(days=1)
        now_ms = timestamp_now()
        campaign = UserCheckinCampaignModel(  # type: ignore[call-arg]
            user_id=user_id,
            start_at=get_day_start_timestamp(expired_date),
            end_at=get_day_end_timestamp(expired_date),
            last_claim_at=0,
            total_claim_days=0,
            created_at=now_ms,
            updated_at=now_ms,
        )
        async with get_async_session() as db:
            db.add(campaign)
            await db.commit()
            await db.refresh(campaign)
            return campaign

    async def enter_checkin_campaign(self, user_id: int) -> CheckinEntryResponse:
        """进入签到系统；没有 campaign 时创建并返回完整状态。"""
        if user_id <= 0:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "user_checkin_service.enter_checkin_campaign: invalid "
                    f"user_id={user_id}"
                ),
            )

        today_ymd = self._today_ymd()
        today_start_at = get_today_start_timestamp()

        async with get_async_session() as db:
            campaign = await self._get_latest_campaign(db, user_id=user_id)

        if campaign is not None:
            credits_balance = await self._get_current_credits_balance(
                user_id=user_id,
            )
            if self._is_campaign_ended(campaign.end_at, today_start_at):
                return self._build_ended_entry_response(
                    campaign=campaign,
                    today_ymd=today_ymd,
                    today_start_at=today_start_at,
                    credits_balance=credits_balance,
                )

            checkin_config = await self._load_checkin_config()
            return self._build_entry_response(
                checkin_config=checkin_config,
                campaign=campaign,
                today_ymd=today_ymd,
                today_start_at=today_start_at,
                credits_balance=credits_balance,
            )

        checkin_config = await self._load_checkin_config()
        async with get_async_session() as db:
            async with db.begin():
                campaign = await self._get_or_create_campaign(
                    db,
                    checkin_config=checkin_config,
                    user_id=user_id,
                    today_start_at=today_start_at,
                )
        credits_balance = await self._get_current_credits_balance(
            user_id=user_id,
        )
        if self._is_campaign_ended(campaign.end_at, today_start_at):
            return self._build_ended_entry_response(
                campaign=campaign,
                today_ymd=today_ymd,
                today_start_at=today_start_at,
                credits_balance=credits_balance,
            )
        return self._build_entry_response(
            checkin_config=checkin_config,
            campaign=campaign,
            today_ymd=today_ymd,
            today_start_at=today_start_at,
            credits_balance=credits_balance,
        )

    async def claim_daily_checkin(self, user_id: int) -> CheckinClaimResponse:
        """领取今天签到奖励；先抢占领取权，再发放 Credits。"""
        if user_id <= 0:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "user_checkin_service.claim_daily_checkin: invalid "
                    f"user_id={user_id}"
                ),
            )

        today_ymd = self._today_ymd()
        today_start_at = get_today_start_timestamp()
        now_ms = timestamp_now()
        day_index, reward_credits, has_next_claim_day = await self._reserve_daily_claim(
            user_id=user_id,
            today_ymd=today_ymd,
            today_start_at=today_start_at,
            now_ms=now_ms,
        )

        credits_balance = await self._grant_checkin_credits(
            user_id=user_id,
            reward_credits=reward_credits,
            claim_date=today_ymd,
            day_index=day_index,
        )
        try:
            await self._write_claim_audit(
                user_id=user_id,
                claimed_at=now_ms,
                day_index=day_index,
                reward_credits=reward_credits,
            )
        except Exception:
            logger.exception(
                "user_checkin_service.claim_daily_checkin: audit insert failed, "
                "user_id=%s, day_index=%s, claimed_at=%s",
                user_id,
                day_index,
                now_ms,
            )

        next_claim_at: str | None = None
        next_claim_at_ts: int | None = None
        if has_next_claim_day:
            next_claim_at, next_claim_at_ts = self._next_claim_at_after_claim()
        return CheckinClaimResponse(
            claim_date=today_ymd,
            day_index=day_index,
            reward_credits=reward_credits,
            credits_balance=credits_balance,
            today_claimed=True,
            campaign_ended=False,
            next_claim_at=next_claim_at,
            next_claim_at_ts=next_claim_at_ts,
        )

    async def _reserve_daily_claim(
        self,
        *,
        user_id: int,
        today_ymd: str,
        today_start_at: int,
        now_ms: int,
    ) -> tuple[int, int, bool]:
        """在 campaign 表中抢占今天的领取权。"""

        async with get_async_session() as db:
            latest_campaign = await self._get_latest_campaign(db, user_id=user_id)

        if latest_campaign is not None and self._is_campaign_ended(
            latest_campaign.end_at,
            today_start_at,
        ):
            day_index = self._calculate_day_index(
                latest_campaign.start_at,
                today_start_at,
            )
            self._raise_campaign_ended(
                user_id=user_id,
                today_ymd=today_ymd,
                today_start_at=today_start_at,
                campaign=latest_campaign,
                day_index=day_index,
            )

        checkin_config = await self._load_checkin_config()
        async with get_async_session() as db:
            async with db.begin():
                campaign = await self._get_or_create_campaign(
                    db,
                    checkin_config=checkin_config,
                    user_id=user_id,
                    today_start_at=today_start_at,
                )
                day_index = self._calculate_day_index(
                    campaign.start_at,
                    today_start_at,
                )
                effective_end_at = self._effective_campaign_end_at(
                    campaign,
                    checkin_config,
                )
                if self._is_campaign_ended(effective_end_at, today_start_at):
                    self._raise_campaign_ended(
                        user_id=user_id,
                        today_ymd=today_ymd,
                        today_start_at=today_start_at,
                        campaign=campaign,
                        day_index=day_index,
                    )

                if campaign.last_claim_at >= today_start_at:
                    raise AppCommonException(
                        CommonCode.CHECKIN_ALREADY_CLAIMED,
                        ext_msg=(
                            "user_checkin_service.claim_daily_checkin: already "
                            f"claimed, user_id={user_id}, today_start_at={today_start_at}, "
                            f"campaign_id={campaign.id}, "
                            f"last_claim_at={campaign.last_claim_at}"
                        ),
                    )

                reward_credits = self._reward_for_day_index(
                    day_index,
                    checkin_config,
                )
                claimed = await self._claim_campaign_once(
                    db,
                    campaign_id=campaign.id,
                    today_start_at=today_start_at,
                    now_ms=now_ms,
                )
                if not claimed:
                    raise AppCommonException(
                        CommonCode.CHECKIN_ALREADY_CLAIMED,
                        ext_msg=(
                            "user_checkin_service.claim_daily_checkin: claim CAS "
                            f"failed, user_id={user_id}, campaign_id={campaign.id}, "
                            f"today_start_at={today_start_at}"
                        ),
                    )

                return (
                    day_index,
                    reward_credits,
                    day_index < checkin_config.campaign_days,
                )

    async def _load_checkin_config(self) -> CheckinCampaignConfig:
        """读取并校验签到活动配置，配置缺失或异常时直接报错。"""

        raw_config = await config_public_service.get(CHECKIN_CONFIG_KEY)
        try:
            return CheckinCampaignConfig.model_validate(raw_config)
        except ValidationError as exc:
            raise AppCommonException(
                CommonCode.CHECKIN_CONFIG_INVALID,
                ext_msg=(
                    "user_checkin_service._load_checkin_config: 配置异常, "
                    f"c_key={CHECKIN_CONFIG_KEY}, errors={exc.errors()}"
                ),
            ) from exc

    def _today_ymd(self) -> str:
        """返回后端默认业务时区的今日日期字符串。"""

        return get_today_date()

    def _build_campaign_times(
        self,
        today_start_at: int,
        checkin_config: CheckinCampaignConfig,
    ) -> tuple[int, int]:
        """根据首次触发日生成活动起止毫秒时间戳。"""

        start_dt = timestamp_to_datetime(today_start_at)
        end_date = start_dt.date() + timedelta(days=checkin_config.campaign_days - 1)
        end_at = get_day_end_timestamp(end_date)
        return today_start_at, end_at

    def _effective_campaign_end_at(
        self,
        campaign: UserCheckinCampaignModel,
        checkin_config: CheckinCampaignConfig,
    ) -> int:
        """返回有效结束时间，错误存量数据不得把活动扩展到第 15 天。"""

        _, configured_end_at = self._build_campaign_times(
            campaign.start_at,
            checkin_config,
        )
        return min(campaign.end_at, configured_end_at)

    def _calculate_day_index(
        self,
        start_at: int,
        today_start_at: int,
    ) -> int:
        """计算今天是活动第几天。"""
        start_date = timestamp_to_datetime(start_at).date()
        today_date = timestamp_to_datetime(today_start_at).date()
        return (today_date - start_date).days + 1

    def _campaign_day_count(self, start_at: int, end_at: int) -> int:
        """按业务时区计算一条落库活动实际包含的自然日数。"""

        start_date = timestamp_to_datetime(start_at).date()
        end_date = timestamp_to_datetime(end_at).date()
        return max(1, (end_date - start_date).days + 1)

    def _reward_for_day_index(
        self,
        day_index: int,
        checkin_config: CheckinCampaignConfig,
    ) -> int:
        """按配置的活动自然日奖励规则返回当天奖励。"""

        for rule in checkin_config.reward_rules:
            if rule.start_day <= day_index <= rule.end_day:
                return rule.credits
        return 0

    async def _get_current_credits_balance(
        self,
        *,
        user_id: int,
    ) -> int:
        """读取用户当前 Credits 余额。"""

        return await user_credit_service.get_balance(user_id)

    async def _grant_checkin_credits(
        self,
        *,
        user_id: int,
        reward_credits: int,
        claim_date: str,
        day_index: int,
    ) -> int:
        """给签到领取发放 Credits。"""

        result = await user_credit_service.add_balance(
            user_id=user_id,
            amount=reward_credits,
            reason=CHECKIN_CREDIT_REASON,
            metadata_json=(
                '{"source":"checkin","claim_date":"'
                f'{claim_date}","day_index":{day_index}'
                "}"
            ),
        )
        return result.balance

    async def _write_claim_audit(
        self,
        *,
        user_id: int,
        claimed_at: int,
        day_index: int,
        reward_credits: int,
    ) -> None:
        """写签到领取审计记录，不参与领取状态判断。"""

        async with get_async_session() as db:
            record = UserCheckinRecordModel(  # type: ignore[call-arg]
                user_id=user_id,
                claimed_at=claimed_at,
                day_index=day_index,
                reward_credits=reward_credits,
                created_at=claimed_at,
            )
            db.add(record)
            await db.commit()

    def _is_campaign_ended(self, end_at: int, today_start_at: int) -> bool:
        """判断活动是否已进入结束日之后。"""
        return today_start_at > end_at

    def _raise_campaign_ended(
        self,
        *,
        user_id: int,
        today_ymd: str,
        today_start_at: int,
        campaign: UserCheckinCampaignModel,
        day_index: int,
    ) -> None:
        """抛出活动已结束异常；不依赖签到配置。"""

        raise AppCommonException(
            CommonCode.CHECKIN_CAMPAIGN_ENDED,
            ext_msg=(
                "user_checkin_service.claim_daily_checkin: campaign "
                f"ended, user_id={user_id}, today={today_ymd}, "
                f"today_start_at={today_start_at}, "
                f"start_at={campaign.start_at}, "
                f"end_at={campaign.end_at}, day_index={day_index}"
            ),
        )

    async def _get_or_create_campaign(
        self,
        db: AsyncSession,
        *,
        checkin_config: CheckinCampaignConfig,
        user_id: int,
        today_start_at: int,
    ) -> UserCheckinCampaignModel:
        """读取用户最新 campaign；完全不存在时才在当前事务中创建。"""
        campaign = await self._get_latest_campaign(
            db,
            user_id=user_id,
        )
        if campaign is not None:
            return campaign

        start_at, end_at = self._build_campaign_times(
            today_start_at,
            checkin_config,
        )
        now_ms = timestamp_now()
        campaign = UserCheckinCampaignModel(  # type: ignore[call-arg]
            user_id=user_id,
            start_at=start_at,
            end_at=end_at,
            last_claim_at=0,
            total_claim_days=0,
            created_at=now_ms,
            updated_at=now_ms,
        )
        db.add(campaign)
        await db.flush()
        return campaign

    async def _get_latest_campaign(
        self,
        db: AsyncSession,
        *,
        user_id: int,
    ) -> UserCheckinCampaignModel | None:
        """按用户 ID 读取最新一条 campaign，过期也返回。"""
        stmt: Select[tuple[UserCheckinCampaignModel]] = select(
            UserCheckinCampaignModel
        ).where(UserCheckinCampaignModel.user_id == user_id)
        stmt = stmt.order_by(UserCheckinCampaignModel.id.desc()).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def _claim_campaign_once(
        self,
        db: AsyncSession,
        *,
        campaign_id: int,
        today_start_at: int,
        now_ms: int,
    ) -> bool:
        """用 campaign 主键和 last_claim_at 做当天领取 CAS。"""
        result = cast(
            CursorResult[Any],
            await db.execute(
                update(UserCheckinCampaignModel)
                .where(
                    UserCheckinCampaignModel.id == campaign_id,
                    UserCheckinCampaignModel.last_claim_at < today_start_at,
                )
                .values(
                    last_claim_at=now_ms,
                    total_claim_days=UserCheckinCampaignModel.total_claim_days + 1,
                    updated_at=now_ms,
                )
            ),
        )
        return result.rowcount == 1

    def _build_entry_response(
        self,
        *,
        checkin_config: CheckinCampaignConfig,
        campaign: UserCheckinCampaignModel,
        today_ymd: str,
        today_start_at: int,
        credits_balance: int,
    ) -> CheckinEntryResponse:
        """把 campaign、记录和余额组装成入口响应。"""
        actual_day_index = self._calculate_day_index(
            campaign.start_at,
            today_start_at,
        )
        effective_end_at = self._effective_campaign_end_at(
            campaign,
            checkin_config,
        )
        campaign_ended = self._is_campaign_ended(effective_end_at, today_start_at)
        day_index = min(actual_day_index, checkin_config.campaign_days)
        today_claimed = campaign.last_claim_at >= today_start_at
        today_reward_credits = (
            0
            if campaign_ended
            else self._reward_for_day_index(day_index, checkin_config)
        )
        next_claim_at, next_claim_at_ts = self._next_claim_at(
            today_claimed=today_claimed,
            campaign_ended=campaign_ended,
            has_next_claim_day=actual_day_index < checkin_config.campaign_days,
        )
        return CheckinEntryResponse(
            campaign_ended=campaign_ended,
            start_date=timestamp_to_ymd(campaign.start_at),
            end_date=timestamp_to_ymd(effective_end_at),
            start_at=campaign.start_at,
            end_at=effective_end_at,
            today=today_ymd,
            day_index=day_index,
            today_reward_credits=today_reward_credits,
            today_claimed=today_claimed,
            total_claim_days=campaign.total_claim_days,
            credits_balance=credits_balance,
            next_claim_at=next_claim_at,
            next_claim_at_ts=next_claim_at_ts,
        )

    def _build_ended_entry_response(
        self,
        *,
        campaign: UserCheckinCampaignModel,
        today_ymd: str,
        today_start_at: int,
        credits_balance: int,
    ) -> CheckinEntryResponse:
        """构造已结束活动响应；风控封禁活动不能被异常配置绕过。"""

        actual_day_index = self._calculate_day_index(
            campaign.start_at,
            today_start_at,
        )
        campaign_days = self._campaign_day_count(campaign.start_at, campaign.end_at)
        day_index = min(
            actual_day_index,
            campaign_days,
            CHECKIN_CAMPAIGN_DAYS,
        )
        return CheckinEntryResponse(
            campaign_ended=True,
            start_date=timestamp_to_ymd(campaign.start_at),
            end_date=timestamp_to_ymd(campaign.end_at),
            start_at=campaign.start_at,
            end_at=campaign.end_at,
            today=today_ymd,
            day_index=day_index,
            today_reward_credits=0,
            today_claimed=campaign.last_claim_at >= today_start_at,
            total_claim_days=campaign.total_claim_days,
            credits_balance=credits_balance,
            next_claim_at=None,
            next_claim_at_ts=None,
        )

    def _next_claim_at(
        self,
        *,
        today_claimed: bool,
        campaign_ended: bool,
        has_next_claim_day: bool,
    ) -> tuple[str | None, int | None]:
        """返回下次可领取时间；当前可领或已结束时为 null。"""
        if campaign_ended or not today_claimed or not has_next_claim_day:
            return None, None
        return self._next_claim_at_after_claim()

    def _next_claim_at_after_claim(self) -> tuple[str, int]:
        """签到成功后返回默认业务时区明天 00:00。"""

        next_claim_at_ts = get_tomorrow_start_timestamp()
        next_dt = timestamp_to_datetime(next_claim_at_ts)
        return next_dt.isoformat(), next_claim_at_ts


user_checkin_service = UserCheckinService()
