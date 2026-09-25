#!/usr/bin/env python3
"""
Website 真实回归专用的用户种子脚本。

用途
----
website 端真实回归需要可重复准备不同业务状态。本脚本按显式场景负责：

- ``parse-download``：幂等创建固定解析下载账号，写入远未来 Unlimited 到期时间，
  重置媒体下载 Credits/下载记录并补足余额。
- ``pricing-review-reward``：幂等创建独立 Pricing 账号，删除其订阅记录与账号/设备
  两个维度的领取事实行，并从真实 MySQL 回读确认账号无有效订阅且仍未领取。
- ``seed``：按所选场景准备业务状态，用后端同源 ``JwtUnit`` 签发 access token，
  并把该 token 写入 Redis（``store_token``），
  最后把 ``{token, user_id, email, device_id, scenario}`` 以单行 JSON 打到 stdout 供
  Playwright globalSetup 读取。
- ``cleanup``：按场景固定 email 软删用户、删订阅、撤销该用户全部 token、清该用户
  当日配额 Redis key，并删除媒体下载 Credits/下载记录，让回归账号不残留脏数据。

设计取舍
--------
- 复用现有 service（``user_service`` / ``subscription_service`` /
  ``user_token_service``）与 ``JwtUnit``，不手插表、不引入依赖注入（遵守项目规范）。
- token 用后端 ``settings.auth.jwt_secret_key`` 签名。**仅签名不够**：前端下载
  走 ``/api/client/media/direct-download-intent`` → ``get_current_user`` →
  ``check_strict`` → ``user_token_service.verify_token``，后者校验 token 的
  md5 是否在 Redis ``access_token:{user_id}`` ZSet 中；故 seed 必须额外
  ``store_token`` 把 token 注册进 Redis，否则下载会 401。
- stdout 只输出最终结果 JSON；日志与诊断走 stderr，避免污染 globalSetup 解析。

流程
----
seed:    确保场景用户存在 → 准备并验证场景状态 → 签 token → store 进 Redis → 打印 JSON
cleanup: 查用户 → 清配额/限流 → 撤销 token → 删订阅 → 删 Credits/下载记录 → 软删用户
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from sqlalchemy import delete

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.constants.auth import TokenType  # noqa: E402
from app.constants.client_product import ClientProductEnum  # noqa: E402
from app.constants.quota import QuotaTypeEnum  # noqa: E402
from app.core.database import (
    check_db_connection,
    close_engine,
    get_async_session,
)  # noqa: E402
from app.core.redis import redis_client  # noqa: E402
from app.models.subscription_model import UserSubscriptionModel  # noqa: E402
from app.models.user_credit_account_model import UserCreditAccountModel  # noqa: E402
from app.models.user_credit_log_model import UserCreditLogModel  # noqa: E402
from app.models.user_download_record_model import UserDownloadRecordModel  # noqa: E402
from app.models.user_review_reward_model import (  # noqa: E402
    UserReviewRewardModel,
)
from app.services.quota_service import quota_service  # noqa: E402
from app.services.subscription_review_reward_service import (  # noqa: E402
    subscription_review_reward_service,
)
from app.services.subscription_service import subscription_service  # noqa: E402
from app.services.user_credit_service import user_credit_service  # noqa: E402
from app.services.user_service import user_service  # noqa: E402
from app.services.user_token_service import user_token_service  # noqa: E402
from app.utils.jwt import JwtData, JwtUnit  # noqa: E402
from app.utils.redis_fixed_limiter import RedisFixedLimiter  # noqa: E402
from app.utils.time import timestamp_now  # noqa: E402
from app.utils.uid import build_device_scope, build_user_scope  # noqa: E402


class SeedScenario(str, Enum):
    """可由真实 smoke 显式选择的用户业务状态。"""

    PARSE_DOWNLOAD = "parse-download"
    PRICING_REVIEW_REWARD = "pricing-review-reward"


@dataclass(frozen=True, slots=True)
class SeedScenarioConfig:
    """一个 seed 场景的独立账号身份。"""

    email: str
    password: str
    full_name: str


# 每个真实 smoke 使用独立固定账号，既保证单场景幂等，也避免不同 smoke 互相改状态。
# .test 顶级域不会真实存在，避免误发邮件或撞上真实用户。
SEED_SCENARIO_CONFIGS: dict[SeedScenario, SeedScenarioConfig] = {
    SeedScenario.PARSE_DOWNLOAD: SeedScenarioConfig(
        email="e2e-parse-smoke@example.com",
        password="E2eParseSmoke!2026",
        full_name="E2E Parse Smoke",
    ),
    SeedScenario.PRICING_REVIEW_REWARD: SeedScenarioConfig(
        email="e2e-pricing-review-reward-smoke@example.com",
        password="E2ePricingReviewRewardSmoke!2026",
        full_name="E2E Pricing Review Reward Smoke",
    ),
}
# 注入前端 localStorage 的 device_id；需同时满足前端当前 UUID 校验与后端请求校验。
E2E_DEVICE_ID = "123e4567-e89b-42d3-a456-426614174000"
# Unlimited 订阅 expires_at（毫秒）：user_subscriptions 只保存 Unlimited 到期时间，
# expires_at > now 时代表 Unlimited，None/过期一律降级 Free。
# 真实 smoke 只需要稳定登录态和足够 Credits，远未来时间避免订阅态波动。
SUBSCRIPTION_EXPIRES_MS_AHEAD = 100 * 365 * 24 * 60 * 60 * 1000
# 发布前真实下载会按媒体大小扣 Credits；seed 每轮重置后补到固定余额，避免余额
# 随重复运行无限增长，也避免历史下载记录触发 6 小时免扣导致回归不真实。
E2E_CREDITS_TARGET_BALANCE = 200
E2E_CREDITS_SEED_REASON = "e2e_parse_smoke_seed"
# 真实 smoke 会连续跑多平台；seed 时清理固定 e2e 用户的当前限流窗口，避免历史运行污染。
E2E_FIXED_LIMITERS: tuple[tuple[str, int], ...] = (
    ("tiktok_parse", 10),
    ("tiktok_download", 60),
    ("vimeo_parse", 10),
    ("vimeo_direct_intent", 60),
    ("x_parse", 10),
    ("x_direct_intent", 60),
    ("instagram_parse", 10),
    ("instagram_direct_intent", 60),
    ("threads_parse", 10),
    ("threads_direct_intent", 60),
    ("reddit_parse", 10),
    ("reddit_direct_intent", 60),
    ("reddit_client_mux_intent", 60),
)


async def _ensure_user_id(config: SeedScenarioConfig) -> int:
    """确保 e2e 用户存在且处于激活态并返回 user_id。

    幂等要点：cleanup 是软删（is_del=True），故复用已存在用户时若其处于软删态
    必须重新激活，否则 seed 出的账号会带 is_del=True，登录态校验/查询会异常。
    """

    existing = await user_service.get_user_by_email(config.email)
    if existing is not None:
        if existing.is_del:
            await user_service.update(existing.user_id, is_del=False)
        return existing.user_id

    created = await user_service.create_user(
        email=config.email,
        password=config.password,
        full_name=config.full_name,
        register_source=ClientProductEnum.WEB,
    )
    return created.user_id


async def _seed(scenario: SeedScenario) -> dict[str, object]:
    """按场景准备账号状态并签 token，返回供前端注入的上下文。"""

    config = SEED_SCENARIO_CONFIGS[scenario]
    user_id = await _ensure_user_id(config)

    if scenario == SeedScenario.PARSE_DOWNLOAD:
        await _seed_parse_download_state(user_id)
    else:
        await _seed_pricing_review_reward_state(user_id)

    token, expire = JwtUnit.create_access_token(
        JwtData(user_id=user_id, email=config.email),
    )

    # 关键：仅签名不够。下载链路 /direct-download-intent 走 get_current_user，
    # check_strict() 会校验 token md5 是否在 Redis access_token:{user_id} ZSet 中；
    # 不 store 则下载 401。expire 为 Unix 秒级过期戳，作为 ZSet score。
    await user_token_service.store_token(
        token,
        user_id,
        TokenType.USER_ACCESS,
        expire,
    )

    # 重置当日下载配额，保证每次发版回归都从 0 配额起跑，不受历史运行累积影响。
    await _delete_quota_keys(user_id)
    await _reset_fixed_limiters(user_id)

    return {
        "token": token,
        "user_id": user_id,
        "email": config.email,
        "device_id": E2E_DEVICE_ID,
        "scenario": scenario.value,
    }


async def _seed_parse_download_state(user_id: int) -> None:
    """保持解析下载 smoke 的 Unlimited 与 Credits seed 行为。"""

    await subscription_service.update_user_subscription(
        user_id,
        timestamp_now() + SUBSCRIPTION_EXPIRES_MS_AHEAD,
    )
    await _reset_media_credit_data(user_id)
    await _ensure_credits(user_id)


async def _seed_pricing_review_reward_state(user_id: int) -> None:
    """清空 Pricing 好评领取前置状态，并从真实 MySQL 回读验证。

    账号与固定设备都是长期复用的固定身份，而领取事实行是永久行：只删订阅不删事实行
    会让这个账号在第一轮领取之后永远判为已领取，「可领」场景再也回不来。
    """

    async with get_async_session() as db:
        await db.execute(
            delete(UserSubscriptionModel).where(
                UserSubscriptionModel.user_id == user_id  # type: ignore[arg-type]
            )
        )
        await db.execute(
            delete(UserReviewRewardModel).where(
                UserReviewRewardModel.uid.in_(_review_reward_fact_uids(user_id))
            )
        )
        await db.commit()

    subscription = await subscription_service.get_user_subscription(user_id)
    claimed_count = await subscription_review_reward_service.claimed_count_for_display(
        user_id=user_id,
        device_id=E2E_DEVICE_ID,
    )
    if subscription.expires_at is not None or claimed_count != 0:
        raise RuntimeError(
            "e2e_seed_user pricing-review-reward verification failed: "
            f"user_id={user_id}, expires_at={subscription.expires_at}, "
            f"review_reward_claimed_count={claimed_count}"
        )


def _review_reward_fact_uids(user_id: int) -> list[str]:
    """列出该 e2e 账号可能写入的领取事实 uid：账号维度与固定设备维度。"""

    return [build_user_scope(user_id)[0], build_device_scope(E2E_DEVICE_ID)[0]]


async def _reset_media_credit_data(user_id: int) -> None:
    """删除固定 e2e 用户的媒体下载 Credits 状态，保证每轮真实 smoke 独立。"""

    async with get_async_session() as db:
        await db.execute(
            delete(UserDownloadRecordModel).where(
                UserDownloadRecordModel.user_id == user_id
            )
        )
        await db.execute(
            delete(UserCreditLogModel).where(UserCreditLogModel.user_id == user_id)
        )
        await db.execute(
            delete(UserCreditAccountModel).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
        await db.commit()


async def _ensure_credits(user_id: int) -> None:
    """把固定 e2e 用户 Credits 余额补到真实 smoke 所需目标值。"""

    balance = await user_credit_service.get_balance(user_id)
    if balance >= E2E_CREDITS_TARGET_BALANCE:
        return

    await user_credit_service.add_balance(
        user_id=user_id,
        amount=E2E_CREDITS_TARGET_BALANCE - balance,
        reason=E2E_CREDITS_SEED_REASON,
    )


async def _delete_quota_keys(user_id: int) -> None:
    """删除该用户当日 Web 配额 key，保证下次从 0 开始。"""

    # 回归仅经由 web 端，故只清 WEB 下载/播放维度的配额 key。
    user_key = str(user_id)
    keys = [
        quota_service.build_quota_key(user_key, QuotaTypeEnum.WEB_DOWNLOAD),
        quota_service.build_quota_key(user_key, QuotaTypeEnum.WEB_PLAY),
    ]
    redis = await redis_client.get_client()
    await redis.delete(*keys)


async def _reset_fixed_limiters(user_id: int) -> None:
    """清理 e2e 用户在真实 smoke 相关平台中的当前固定窗口限流 key。"""

    user_key = str(user_id)
    for key_prefix, window in E2E_FIXED_LIMITERS:
        await RedisFixedLimiter(key_prefix=key_prefix).reset(user_key, window)


async def _delete_review_reward_facts(user_id: int) -> None:
    """删除 Pricing 场景账号与其固定设备的领取事实行。"""

    async with get_async_session() as db:
        await db.execute(
            delete(UserReviewRewardModel).where(
                UserReviewRewardModel.uid.in_(_review_reward_fact_uids(user_id))
            )
        )
        await db.commit()


async def _cleanup(scenario: SeedScenario) -> dict[str, object]:
    """软删 e2e 用户 + 删订阅 + 清配额 key；不存在则视为已干净。"""

    config = SEED_SCENARIO_CONFIGS[scenario]
    existing = await user_service.get_user_by_email(config.email)
    if existing is None:
        return {
            "cleaned": False,
            "reason": "user_not_found",
            "email": config.email,
            "scenario": scenario.value,
        }

    user_id = existing.user_id

    # 先清配额 key（依赖 user_id），再撤销 token，删订阅，最后软删用户。
    await _delete_quota_keys(user_id)
    await _reset_fixed_limiters(user_id)
    await user_token_service.revoke_all_user_tokens(user_id)
    await subscription_service.delete(user_id)
    if scenario == SeedScenario.PRICING_REVIEW_REWARD:
        await _delete_review_reward_facts(user_id)
    await _reset_media_credit_data(user_id)
    await user_service.update(user_id, is_del=True)

    return {
        "cleaned": True,
        "user_id": user_id,
        "email": config.email,
        "scenario": scenario.value,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Website 真实回归用户种子脚本（seed / cleanup）",
    )
    parser.add_argument(
        "--action",
        choices=["seed", "cleanup"],
        default="seed",
        help="seed：按场景准备账号并签 token（默认）；cleanup：清理场景账号状态",
    )
    parser.add_argument(
        "--scenario",
        choices=[scenario.value for scenario in SeedScenario],
        default=SeedScenario.PARSE_DOWNLOAD.value,
        help="账号场景；默认 parse-download 保持既有解析下载 smoke 行为",
    )
    return parser.parse_args()


async def _run(action: str, scenario: SeedScenario) -> dict[str, object]:
    if not await check_db_connection():
        raise RuntimeError(
            "e2e_seed_user: 数据库不可用，无法 seed/cleanup。"
            "请确认本地 MySQL 已启动且 backend/config.yaml 配置正确。"
        )

    try:
        if action == "seed":
            return await _seed(scenario)
        return await _cleanup(scenario)
    finally:
        await close_engine()


def main() -> None:
    args = _parse_args()
    try:
        result = asyncio.run(_run(args.action, SeedScenario(args.scenario)))
    except Exception as exc:  # noqa: BLE001
        # 失败详情走 stderr，stdout 只承载成功 JSON，便于上游精确解析。
        print(f"e2e_seed_user failed: {exc}", file=sys.stderr)
        sys.exit(1)

    # 单行 JSON：Playwright globalSetup 取最后一行 parse。
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
