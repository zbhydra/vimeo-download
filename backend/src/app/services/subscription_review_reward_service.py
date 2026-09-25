"""好评赠送订阅的两维度领取事实与跨服务编排。

领取事实落在 ``user_review_reward`` 一张表上：账号、设备各占一行，uid 由
`app.utils.uid` 的构造 helper 统一生成。判定是一次 ``WHERE uid IN (...)`` 等值读，
未命中才按本次可用维度插入 1-2 行（单事务）；冲突由主键唯一性兜底，不看受影响行数。
"""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_review_reward_model import UserReviewRewardModel
from app.services.config_public_service import config_public_service
from app.services.subscription_service import subscription_service
from app.utils.logger import logger
from app.utils.redis_lock import RedisLock
from app.utils.time import get_current_ymd, timestamp_now
from app.utils.uid import build_device_scope, build_user_scope

# 好评赠送活动在 config_public 中的布尔开关键。
SUBSCRIPTION_REVIEW_REWARD_CONFIG_KEY = "subscription_review_reward"
_REVIEW_REWARD_DURATION_DAYS = 7
_REVIEW_REWARD_LOCK_TTL_SECONDS = 5
_REVIEW_REWARD_LOCK_TIMEOUT_SECONDS = 1
_review_reward_lock = RedisLock()


@dataclass(frozen=True, slots=True)
class SubscriptionReviewRewardClaimResult:
    """一次领取请求的稳定业务结果。"""

    result: Literal["granted", "already_claimed"]
    review_reward_claimed_count: int


class SubscriptionReviewRewardService:
    """用领取事实表做账号与设备两维度互斥，并在独立事务中延长订阅。"""

    async def is_enabled(self) -> bool:
        """读取活动开关；只有 JSON 布尔值 true 表示开启。"""

        raw_config = await config_public_service.get(
            SUBSCRIPTION_REVIEW_REWARD_CONFIG_KEY
        )
        return raw_config is True

    async def claimed_count_for_display(
        self,
        *,
        user_id: int,
        device_id: str | None,
    ) -> int:
        """按领取事实推导展示口径的资格状态位：0 可领，1 不可领。

        与 claim 共用同一份判定来源，因此不存在「展示可领、点下去却已领取」的错位。
        「不可领」包含两种情形——任一维度已有领取事实，以及本方法推导失败；
        推导失败时按已领取返回（入口隐藏）并记日志：本接口同时承载商品与渠道配置，
        不能因资格判定失败整体失败；且判定失败时 claim 必然失败，显示可领只会让用户
        白点一次。
        """

        try:
            scopes = self._build_claim_scopes(user_id, device_id=device_id)
            claimed = await self._has_claimed_scope(scopes)
        except Exception as exc:
            logger.error(
                "subscription_review_reward_claimed_count_failed: "
                f"user_id={user_id}, device_id={device_id}, "
                f"error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            return 1
        return 1 if claimed else 0

    async def claim(
        self,
        *,
        user_id: int,
        device_id: str,
    ) -> SubscriptionReviewRewardClaimResult:
        """领取一次 7 天订阅，任一维度已领取按成功幂等返回。"""

        if not await self.is_enabled():
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "subscription_review_reward_claim: campaign disabled: "
                    f"user_id={user_id}, c_key={SUBSCRIPTION_REVIEW_REWARD_CONFIG_KEY}"
                ),
            )

        lock_key = f"subscription_review_reward:{user_id}"
        try:
            lock_value = await _review_reward_lock.acquire(
                lock_key,
                ttl=_REVIEW_REWARD_LOCK_TTL_SECONDS,
                timeout=_REVIEW_REWARD_LOCK_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            # 互斥底座不可用时必须 fail-closed，避免多个请求同时赠送。
            logger.error(
                "subscription_review_reward_claim: Redis lock acquire failed: "
                f"user_id={user_id}, lock_key={lock_key}, error={exc}",
                exc_info=True,
            )
            raise self._busy_error(
                user_id, lock_key, reason="redis_unavailable"
            ) from exc

        if lock_value is None:
            raise self._busy_error(user_id, lock_key, reason="lock_timeout")

        try:
            scopes = self._build_claim_scopes(user_id, device_id=device_id)
            if await self._has_claimed_scope(scopes):
                # 命中时一行都不写：补记缺失维度会掩盖「同一浏览器第二个账号」的重复领取。
                return SubscriptionReviewRewardClaimResult(
                    result="already_claimed",
                    review_reward_claimed_count=1,
                )

            if not await self._insert_claim_scopes(scopes):
                # 唯一键冲突：并发请求已写入同一维度的领取事实，按已领取返回且不加时。
                return SubscriptionReviewRewardClaimResult(
                    result="already_claimed",
                    review_reward_claimed_count=1,
                )

            # 事实插入与订阅加时是两个独立事务，顺序固定为事实先、订阅后。
            await subscription_service.extend_subscription_days(
                user_id=user_id,
                duration_days=_REVIEW_REWARD_DURATION_DAYS,
            )
            return SubscriptionReviewRewardClaimResult(
                result="granted",
                review_reward_claimed_count=1,
            )
        finally:
            await _review_reward_lock.release(lock_key, lock_value)

    def _build_claim_scopes(
        self,
        user_id: int,
        *,
        device_id: str | None,
    ) -> list[tuple[str, str]]:
        """列出本次请求可参与判定的维度：账号必选，设备按可用性追加。

        设备标识由 claim 入口强制要求，展示侧可能缺失；缺失时只剩账号维度，
        领取照常进行。
        """

        scopes = [build_user_scope(user_id)]
        if device_id:
            scopes.append(build_device_scope(device_id))
        return scopes

    async def _has_claimed_scope(self, scopes: list[tuple[str, str]]) -> bool:
        """一次等值读完成判定：任一维度已有领取事实即视为已领取。"""

        stmt = select(UserReviewRewardModel.uid).where(
            UserReviewRewardModel.uid.in_([uid for uid, _ in scopes])
        )
        async with get_async_session() as db:
            rows = list(await db.execute(stmt))
        return bool(rows)

    async def _insert_claim_scopes(self, scopes: list[tuple[str, str]]) -> bool:
        """单事务写入本次可用的 1-2 行领取事实，返回是否全部写入。

        冲突判定用普通 INSERT + 捕获 ``IntegrityError``，不得用受影响行数：MySQL 的
        affected-rows 语义受连接上 ``CLIENT_FOUND_ROWS`` 影响，no-op 插入可能被报成
        1 行，把「行已存在」当成「插入成功」，给已领取过的账号再加 7 天。
        """

        now_ms = timestamp_now()
        ymd = get_current_ymd()
        try:
            async with get_async_session() as db:
                await db.execute(
                    insert(UserReviewRewardModel).values(
                        [
                            {
                                "uid": uid,
                                "ymd": ymd,
                                "value": value,
                                "created_at": now_ms,
                            }
                            for uid, value in scopes
                        ]
                    )
                )
                await db.commit()
        except IntegrityError:
            # 主键冲突：本次任一维度已被并发请求写入，整批回滚由 session 上下文负责。
            return False
        return True

    def _busy_error(
        self,
        user_id: int,
        lock_key: str,
        *,
        reason: str,
    ) -> AppCommonException:
        """构造领取互斥失败的统一可重试错误。"""

        return AppCommonException(
            CommonCode.SUBSCRIPTION_REVIEW_REWARD_BUSY,
            ext_msg=(
                "subscription_review_reward_claim: account lock unavailable: "
                f"user_id={user_id}, lock_key={lock_key}, reason={reason}"
            ),
        )


subscription_review_reward_service = SubscriptionReviewRewardService()
