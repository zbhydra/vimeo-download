"""签到服务轻量测试。

覆盖不依赖数据库的业务口径：配置解析、奖励档位、campaign 状态、纽约日切时间和请求体契约。
真实 Credits 读写与事务回滚由 real 集成测试覆盖。
"""

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_checkin_campaign_model import UserCheckinCampaignModel
from app.schemas.checkin_schema import CheckinClaimRequest
from app.services.user_checkin_service import (
    CheckinCampaignConfig,
    user_checkin_service,
)
from app.services.user_service import user_service
from app.utils.time import get_day_end_timestamp, get_day_start_timestamp


_BACKEND_SRC_DIR = Path(__file__).resolve().parents[3] / "src"


def _config() -> CheckinCampaignConfig:
    """构造测试用签到配置。"""
    return CheckinCampaignConfig.model_validate(
        {
            "campaign_days": 14,
            "reward_rules": [
                {"start_day": 1, "end_day": 7, "credits": 6},
                {"start_day": 8, "end_day": 14, "credits": 3},
            ],
        }
    )


def _day_start_at(ymd: str) -> int:
    """返回纽约时区某天 00:00 毫秒时间戳。"""
    return get_day_start_timestamp(ymd)


def _day_end_at(ymd: str) -> int:
    """返回纽约时区某天 23:59:59.999 毫秒时间戳。"""
    return get_day_end_timestamp(ymd)


def _campaign(start_ymd: str, end_ymd: str) -> UserCheckinCampaignModel:
    """构造测试用签到活动记录。"""
    return UserCheckinCampaignModel(  # type: ignore[call-arg]
        id=11,
        user_id=1001,
        start_at=_day_start_at(start_ymd),
        end_at=_day_end_at(end_ymd),
        last_claim_at=0,
        total_claim_days=0,
        created_at=1,
        updated_at=1,
    )


def test_checkin_reward_uses_activity_day_not_claim_count() -> None:
    """奖励按活动自然日分段，而不是按累计签到次数。"""
    checkin_config = _config()

    assert (
        user_checkin_service._reward_for_day_index(1, checkin_config)
        == 6  # noqa: SLF001
    )
    assert (
        user_checkin_service._reward_for_day_index(7, checkin_config)
        == 6  # noqa: SLF001
    )
    assert (
        user_checkin_service._reward_for_day_index(8, checkin_config)
        == 3  # noqa: SLF001
    )
    assert (
        user_checkin_service._reward_for_day_index(14, checkin_config)
        == 3  # noqa: SLF001
    )
    assert (
        user_checkin_service._reward_for_day_index(15, checkin_config)
        == 0  # noqa: SLF001
    )


def test_checkin_config_rejects_invalid_reward_range() -> None:
    """签到配置必须由 BaseModel 拦截非法奖励区间。"""
    with pytest.raises(ValidationError):
        CheckinCampaignConfig.model_validate(
            {
                "campaign_days": 14,
                "reward_rules": [{"start_day": 8, "end_day": 7, "credits": 6}],
            }
        )


@pytest.mark.parametrize(
    "raw_config",
    [
        {
            "campaign_days": 15,
            "reward_rules": [
                {"start_day": 1, "end_day": 7, "credits": 6},
                {"start_day": 8, "end_day": 15, "credits": 3},
            ],
        },
        {
            "campaign_days": 14,
            "reward_rules": [
                {"start_day": 1, "end_day": 7, "credits": 6},
                {"start_day": 9, "end_day": 14, "credits": 3},
            ],
        },
        {
            "campaign_days": 14,
            "reward_rules": [
                {"start_day": 1, "end_day": 8, "credits": 6},
                {"start_day": 8, "end_day": 14, "credits": 3},
            ],
        },
        {
            "campaign_days": 14,
            "reward_rules": [
                {"start_day": 1, "end_day": 7, "credits": 6},
                {"start_day": 8, "end_day": 14, "credits": 0},
            ],
        },
    ],
)
def test_checkin_config_requires_exact_positive_14_day_coverage(
    raw_config: dict[str, object],
) -> None:
    """活动固定 14 天，奖励规则不得缺日、重叠或配置零奖励。"""

    with pytest.raises(ValidationError):
        CheckinCampaignConfig.model_validate(raw_config)


def test_checkin_config_ignores_extra_public_config_fields() -> None:
    """config_public 允许加未来字段，签到只校验自己消费的字段。"""
    checkin_config = CheckinCampaignConfig.model_validate(
        {
            "campaign_days": 14,
            "timezone": "America/New_York",
            "reward_rules": [
                {
                    "start_day": 1,
                    "end_day": 7,
                    "credits": 6,
                    "label": "future field",
                },
                {"start_day": 8, "end_day": 14, "credits": 3},
            ],
        }
    )

    assert checkin_config.campaign_days == 14
    assert checkin_config.reward_rules[0].credits == 6


def test_backend_pydantic_models_do_not_forbid_extra_fields() -> None:
    """后端 Pydantic 模型不能用 extra=forbid，避免配置和请求扩展时炸接口。"""
    forbidden_patterns = [
        'extra="forbid"',
        "extra='forbid'",
        '"extra": "forbid"',
        "'extra': 'forbid'",
    ]

    offenders: list[str] = []
    for path in _BACKEND_SRC_DIR.rglob("*.py"):
        content = path.read_text(encoding="utf-8")
        if any(pattern in content for pattern in forbidden_patterns):
            offenders.append(str(path.relative_to(_BACKEND_SRC_DIR)))

    assert offenders == []


@pytest.mark.asyncio
async def test_checkin_load_config_reports_config_error(monkeypatch) -> None:
    """config_public 缺失或结构异常时不发奖，直接报签到配置异常。"""

    async def fake_get(_c_key: str):
        return {"campaign_days": 14, "reward_rules": []}

    monkeypatch.setattr(
        "app.services.user_checkin_service.config_public_service.get",
        fake_get,
    )

    with pytest.raises(AppCommonException) as exc_info:
        await user_checkin_service._load_checkin_config()  # noqa: SLF001

    assert exc_info.value.code == CommonCode.CHECKIN_CONFIG_INVALID


def test_checkin_entry_response_uses_campaign_last_claim_at() -> None:
    """今天是否已领取只看 campaign.last_claim_at。"""
    campaign = _campaign("2026-06-10", "2026-06-23")
    campaign.last_claim_at = _day_start_at("2026-06-13")

    response = user_checkin_service._build_entry_response(  # noqa: SLF001
        checkin_config=_config(),
        campaign=campaign,
        today_ymd="2026-06-13",
        today_start_at=_day_start_at("2026-06-13"),
        credits_balance=18,
    )

    assert response.today_claimed is True
    assert response.day_index == 4
    assert response.today_reward_credits == 6
    assert response.total_claim_days == 0
    assert response.credits_balance == 18


def test_checkin_entry_response_marks_campaign_ended() -> None:
    """活动结束后不再返回今日奖励。"""
    response = user_checkin_service._build_entry_response(  # noqa: SLF001
        checkin_config=_config(),
        campaign=_campaign("2026-06-10", "2026-06-23"),
        today_ymd="2026-06-24",
        today_start_at=_day_start_at("2026-06-24"),
        credits_balance=18,
    )

    assert response.campaign_ended is True
    assert response.day_index == 14
    assert response.today_claimed is False
    assert response.today_reward_credits == 0
    assert response.next_claim_at is None
    assert response.next_claim_at_ts is None


def test_checkin_entry_caps_corrupt_15_day_campaign_at_14_days() -> None:
    """错误存量 end_at 不得把 14 天活动扩展出第 15 个可领取日。"""

    response = user_checkin_service._build_entry_response(  # noqa: SLF001
        checkin_config=_config(),
        campaign=_campaign("2026-07-02", "2026-07-16"),
        today_ymd="2026-07-16",
        today_start_at=_day_start_at("2026-07-16"),
        credits_balance=3997,
    )

    assert response.campaign_ended is True
    assert response.start_date == "2026-07-02"
    assert response.end_date == "2026-07-15"
    assert response.end_at == _day_end_at("2026-07-15")
    assert response.day_index == 14
    assert response.today_reward_credits == 0
    assert response.next_claim_at is None
    assert response.next_claim_at_ts is None


def test_checkin_entry_final_day_has_reward_without_future_claim_time() -> None:
    """第 14 天仍可领取，但领取后不再宣称次日还有奖励。"""

    campaign = _campaign("2026-07-03", "2026-07-16")
    campaign.last_claim_at = _day_start_at("2026-07-16")
    response = user_checkin_service._build_entry_response(  # noqa: SLF001
        checkin_config=_config(),
        campaign=campaign,
        today_ymd="2026-07-16",
        today_start_at=_day_start_at("2026-07-16"),
        credits_balance=4003,
    )

    assert response.campaign_ended is False
    assert response.day_index == 14
    assert response.today_claimed is True
    assert response.today_reward_credits == 3
    assert response.next_claim_at is None
    assert response.next_claim_at_ts is None


def test_checkin_next_claim_at_uses_new_york_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """已签到后的下一次领取时间固定为纽约时区明天 00:00。"""

    monkeypatch.setattr(
        "app.services.user_checkin_service.get_tomorrow_start_timestamp",
        lambda: int(
            datetime(2026, 6, 19, tzinfo=ZoneInfo("America/New_York")).timestamp()
            * 1000
        ),
    )
    next_claim_at, next_claim_at_ts = (
        user_checkin_service._next_claim_at_after_claim()  # noqa: SLF001
    )
    expected = datetime(2026, 6, 19, tzinfo=ZoneInfo("America/New_York"))

    assert next_claim_at == "2026-06-19T00:00:00-04:00"
    assert next_claim_at_ts == int(expected.timestamp() * 1000)


def test_checkin_next_claim_at_handles_new_york_dst_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """夏令时开始当天，下一次领取仍指向纽约本地明天 00:00。"""

    monkeypatch.setattr(
        "app.services.user_checkin_service.get_tomorrow_start_timestamp",
        lambda: int(
            datetime(2026, 3, 9, tzinfo=ZoneInfo("America/New_York")).timestamp() * 1000
        ),
    )
    next_claim_at, next_claim_at_ts = (
        user_checkin_service._next_claim_at_after_claim()  # noqa: SLF001
    )
    expected = datetime(2026, 3, 9, tzinfo=ZoneInfo("America/New_York"))

    assert next_claim_at == "2026-03-09T00:00:00-04:00"
    assert next_claim_at_ts == int(expected.timestamp() * 1000)


def test_checkin_next_claim_at_handles_new_york_dst_end(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """夏令时结束当天，下一次领取仍指向纽约本地明天 00:00。"""

    monkeypatch.setattr(
        "app.services.user_checkin_service.get_tomorrow_start_timestamp",
        lambda: int(
            datetime(2026, 11, 2, tzinfo=ZoneInfo("America/New_York")).timestamp()
            * 1000
        ),
    )
    next_claim_at, next_claim_at_ts = (
        user_checkin_service._next_claim_at_after_claim()  # noqa: SLF001
    )
    expected = datetime(2026, 11, 2, tzinfo=ZoneInfo("America/New_York"))

    assert next_claim_at == "2026-11-02T00:00:00-05:00"
    assert next_claim_at_ts == int(expected.timestamp() * 1000)


def test_checkin_claim_request_ignores_extra_client_fields() -> None:
    """领取接口忽略前端传入日期、奖励或 day_index。"""
    request = CheckinClaimRequest(day_index=1)  # type: ignore[call-arg]

    assert request.model_dump() == {}


@pytest.mark.asyncio
async def test_checkin_expired_campaign_ignores_invalid_config(
    make_test_email,
    monkeypatch,
) -> None:
    """已有过期 campaign 时，入口和领取都不应被非法配置绕过。"""

    user = await user_service.create_user_without_password(
        email=make_test_email("checkin-expired-invalid-config"),
    )
    await user_checkin_service.create_expired_campaign(user.user_id)

    async def invalid_get(_c_key: str, *, force_refresh: bool = False):
        return {"campaign_days": 14, "reward_rules": []}

    monkeypatch.setattr(
        "app.services.user_checkin_service.config_public_service.get",
        invalid_get,
    )

    entry = await user_checkin_service.enter_checkin_campaign(user.user_id)
    assert entry.campaign_ended is True
    assert entry.today_reward_credits == 0

    with pytest.raises(AppCommonException) as exc_info:
        await user_checkin_service.claim_daily_checkin(user.user_id)
    assert exc_info.value.code == CommonCode.CHECKIN_CAMPAIGN_ENDED
