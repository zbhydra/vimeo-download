"""统一每日额度服务。

本服务只负责按服务器本地自然日统计额度：
1. 调用方传入用户 ID 或设备 ID 字符串。
2. 服务按 quota:{type}:{u_id}:{YYYYMMDD} 读写 Redis。
3. 消耗额度时用 Redis Lua 原子完成校验、扣减和过期时间设置。
4. 插件下载额度额外支持首日免费：作用域首次下载当天不限次，事实落 MySQL
   user_first_day（判定一次等值读，登记只插缺失维度）。首日是尽力而为的增强，
   判定或登记失败一律降级走正常额度，不阻断下载。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeGuard

from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

from app.constants.quota import (
    ALL_QUOTA_TYPES,
    QuotaTypeEnum,
    normalize_quota_type,
)
from app.constants.subscription import SubscriptionProductMetadata
from app.core.database import get_async_session
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_first_day_model import UserFirstDayModel
from app.services.config_public_service import config_public_service
from app.services.subscription_service import subscription_service
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key
from app.utils.time import (
    get_current_ymd,
    get_today_date,
    get_tomorrow_start_timestamp,
    timestamp_now,
)
from app.utils.uid import build_device_scope, build_user_scope


_QUOTA_SET_SCRIPT = """
local key = KEYS[1]
local number = tonumber(ARGV[1])
local daily_limit = tonumber(ARGV[2])
local expire_at = tonumber(ARGV[3])

local current = tonumber(redis.call('GET', key)) or 0
if current + number > daily_limit then
    return {0, current, 0}
end

local new_used = redis.call('INCRBY', key, number)
redis.call('EXPIREAT', key, expire_at)
return {1, new_used, daily_limit - new_used}
"""


@dataclass(frozen=True, slots=True)
class QuotaSetResult:
    """每日额度消耗结果。"""

    allowed: bool
    used: int
    remaining: int
    reset_at: int


@dataclass(frozen=True, slots=True)
class FirstDayDecision:
    """首日判定结果：一次查询命中的作用域 uid 集合与是否仍处于首日。"""

    existing_uids: frozenset[str]
    is_first_day: bool


class QuotaService:
    """统一每日额度读写服务。"""

    async def get(self, u_id: str, quota_type: int | QuotaTypeEnum) -> int:
        """读取指定作用域当天指定类型的已用额度。"""
        normalized_type = normalize_quota_type(quota_type)
        key = self.build_quota_key(u_id, normalized_type)
        try:
            redis = await redis_client.get_client()
            value = await redis.get(key)
        except Exception as exc:
            logger.error(
                "quota_service_get_failed: "
                f"u_id={u_id}, quota_type={int(normalized_type)}, "
                f"key={key}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.QUOTA_INVALID_REQUEST,
                ext_msg=(
                    "quota_service.get: Redis quota read failed, "
                    f"u_id={u_id}, quota_type={int(normalized_type)}, "
                    f"key={key}, error={type(exc).__name__}: {exc}"
                ),
            ) from exc
        return _parse_redis_int(value)

    async def get_lists(self, u_id: str) -> dict[int, int]:
        """一次读取指定作用域当天所有额度类型的已用次数。"""
        self._validate_u_id(u_id)
        keys = [
            self.build_quota_key(u_id, quota_type) for quota_type in ALL_QUOTA_TYPES
        ]
        try:
            redis = await redis_client.get_client()
            values = await redis.mget(keys)
        except Exception as exc:
            logger.error(
                "quota_service_get_lists_failed: "
                f"u_id={u_id}, keys={keys}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.QUOTA_INVALID_REQUEST,
                ext_msg=(
                    "quota_service.get_lists: Redis quota list read failed, "
                    f"u_id={u_id}, keys={keys}, error={type(exc).__name__}: {exc}"
                ),
            ) from exc

        return {
            int(quota_type): _parse_redis_int(values[index])
            for index, quota_type in enumerate(ALL_QUOTA_TYPES)
        }

    async def set(
        self,
        u_id: str,
        quota_type: int | QuotaTypeEnum,
        number: int,
        *,
        device_id: str | None = None,
    ) -> QuotaSetResult:
        """尝试消耗指定数量的当天额度。

        Args:
            u_id: 额度作用域，数字为账号 ID，否则是匿名设备标识。
            quota_type: 额度类型。
            number: 本次消耗数量。
            device_id: 已校验的设备标识，登录用户传入后才能登记设备维度。
        """
        normalized_type = normalize_quota_type(quota_type)
        self._validate_u_id(u_id)
        self._validate_number(number)

        reset_at = self.next_reset_at()

        # 首日必须在类型分派之后、任何订阅与上限解析之前判定：命中即不限次，既不写当日额度
        # key，也不该被订阅查询或商品配置异常连累——首日是独立于档位的免费额度。
        if normalized_type == QuotaTypeEnum.EXTENSION_DOWNLOAD:
            if await self._register_first_day(u_id, device_id=device_id):
                return QuotaSetResult(
                    allowed=True,
                    used=0,
                    remaining=-1,
                    reset_at=reset_at,
                )

        daily_limit = await self.resolve_quota_limit(u_id, normalized_type)
        if daily_limit == -1:
            return QuotaSetResult(
                allowed=True,
                used=0,
                remaining=-1,
                reset_at=reset_at,
            )

        key = self.build_quota_key(u_id, normalized_type)
        expire_at = reset_at // 1000
        try:
            redis = await redis_client.get_client()
            raw_result = await redis.eval(  # type: ignore[misc]
                _QUOTA_SET_SCRIPT,
                1,
                key,
                number,
                daily_limit,
                expire_at,
            )
        except Exception as exc:
            logger.error(
                "quota_service_set_failed: "
                f"u_id={u_id}, quota_type={int(normalized_type)}, number={number}, "
                f"limit={daily_limit}, key={key}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.QUOTA_INVALID_REQUEST,
                ext_msg=(
                    "quota_service.set: Redis quota consume failed, "
                    f"u_id={u_id}, quota_type={int(normalized_type)}, "
                    f"number={number}, error={type(exc).__name__}: {exc}"
                ),
            ) from exc

        if not isinstance(raw_result, list) or len(raw_result) != 3:
            raise AppCommonException(
                CommonCode.QUOTA_INVALID_REQUEST,
                ext_msg=(
                    "quota_service.set: invalid Redis Lua result, "
                    f"u_id={u_id}, quota_type={int(normalized_type)}, "
                    f"result={raw_result!r}"
                ),
            )

        allowed_value, used_value, remaining_value = raw_result
        if not all(
            _is_redis_int_value(value)
            for value in (allowed_value, used_value, remaining_value)
        ):
            raise AppCommonException(
                CommonCode.QUOTA_INVALID_REQUEST,
                ext_msg=(
                    "quota_service.set: Redis Lua result contains non-integer values, "
                    f"u_id={u_id}, quota_type={int(normalized_type)}, "
                    f"result={raw_result!r}"
                ),
            )

        return QuotaSetResult(
            allowed=int(allowed_value) == 1,
            used=int(used_value),
            remaining=int(remaining_value),
            reset_at=reset_at,
        )

    def build_quota_key(
        self,
        u_id: str,
        quota_type: int | QuotaTypeEnum,
    ) -> str:
        """构建当天每日额度 Redis key。"""
        self._validate_u_id(u_id)
        normalized_type = normalize_quota_type(quota_type)
        ymd = get_today_date().replace("-", "")
        return build_redis_key(f"quota:{int(normalized_type)}:{u_id}:{ymd}")

    async def resolve_quota_limit(
        self,
        u_id: str,
        quota_type: QuotaTypeEnum,
    ) -> int:
        """按作用域和额度类型解析当前每日额度上限。"""
        self._validate_u_id(u_id)
        user_id = int(u_id) if u_id.isdigit() and int(u_id) > 0 else 0
        if quota_type in (QuotaTypeEnum.WEB_DOWNLOAD, QuotaTypeEnum.WEB_PLAY):
            return 0
        if quota_type == QuotaTypeEnum.EXTENSION_DOWNLOAD:
            _subscription, config = (
                await subscription_service.get_user_subscription_config(user_id)
            )
            metadata = SubscriptionProductMetadata.from_metadata(
                config.metadata,
                product_id=config.product_id,
            )
            return metadata.daily_limit

        raise ValueError(f"Unsupported quota_type: {quota_type!r}")

    async def is_first_day(self, u_id: str, *, device_id: str | None = None) -> bool:
        """判断作用域当天是否处于首日。

        展示侧专用：只读判定、不写事实行——没有下载就不该产生首日事实，
        否则只登录过的用户会在次日被自己的"首日"挡住。读表失败按非首日降级，
        调用方继续按档位上限展示。
        """
        scopes = self._build_first_day_scopes(u_id, device_id)
        try:
            decision = await self._load_first_day_decision(scopes)
        except Exception as exc:
            _log_first_day_failure("quota_service.is_first_day", u_id, device_id, exc)
            return False
        return decision.is_first_day

    async def _register_first_day(self, u_id: str, *, device_id: str | None) -> bool:
        """下载链路专用：判定首日并幂等补登记缺失维度，返回是否处于首日。

        判定结果同时决定"是否首日"与"要补哪些维度"，登记只消费这一次查询结果，
        不再为补登记二次读表。读表或登记失败按非首日降级，让本次下载继续走正常额度。
        """
        scopes = self._build_first_day_scopes(u_id, device_id)
        try:
            decision = await self._load_first_day_decision(scopes)
            await self._backfill_first_day_scopes(scopes, decision.existing_uids)
        except Exception as exc:
            _log_first_day_failure("quota_service.set", u_id, device_id, exc)
            return False
        return decision.is_first_day

    def _build_first_day_scopes(
        self,
        u_id: str,
        device_id: str | None,
    ) -> list[tuple[str, str]]:
        """列出本次请求可参与首日判定的维度。

        账号与设备分别登记；任一维度的旧记录都可结束首日。登录用户本身已在账号
        维度内，不再附加其他身份维度——同一事实重复登记只会扩大清除成本。
        """
        if u_id.isdigit() and int(u_id) > 0:
            scopes = [build_user_scope(int(u_id))]
            if device_id:
                scopes.append(build_device_scope(device_id))
        else:
            scopes = [build_device_scope(device_id or u_id)]
        return scopes

    async def _load_first_day_decision(
        self,
        scopes: list[tuple[str, str]],
    ) -> FirstDayDecision:
        """一次等值读完成首日判定，返回命中的作用域与是否首日。

        判据按业务日期而非记录是否存在：无记录是首日尚未开始，记录 ymd 等于今天
        是首日，任一记录早于今天即非首日——后者正是"退出登录或换设备不重获首日"的依据。
        """
        today_ymd = get_current_ymd()
        stmt = select(UserFirstDayModel.uid, UserFirstDayModel.ymd).where(
            UserFirstDayModel.uid.in_([uid for uid, _ in scopes])
        )
        async with get_async_session() as db:
            rows = list(await db.execute(stmt))

        config = await config_public_service.get_lists()
        # 缺项保持原有权益；关闭仅停止优惠，下载仍补登记首次日期。
        enabled = config.get("extension_first_day_free_enabled", True) is True
        return FirstDayDecision(
            existing_uids=frozenset(str(uid) for uid, _ in rows),
            is_first_day=enabled and all(int(ymd) == today_ymd for _, ymd in rows),
        )

    async def _backfill_first_day_scopes(
        self,
        scopes: list[tuple[str, str]],
        existing_uids: frozenset[str],
    ) -> None:
        """把缺失维度按今天的业务日期补登记为事实行。

        每次下载都补，不是只补命中首日的那次：老账号在新设备、新账号在老设备
        都靠这一步补齐另一维度。已存在的维度不覆盖，ymd 保持首次日期。
        """
        missing = [(uid, value) for uid, value in scopes if uid not in existing_uids]
        if not missing:
            return

        now_ms = timestamp_now()
        ymd = get_current_ymd()
        for uid, value in missing:
            try:
                async with get_async_session() as db:
                    await db.execute(
                        insert(UserFirstDayModel).values(
                            uid=uid,
                            ymd=ymd,
                            value=value,
                            created_at=now_ms,
                        )
                    )
                    await db.commit()
            except IntegrityError:
                # uid 主键冲突：并发请求已登记同一维度，目标状态已达成，不算失败。
                continue

    @staticmethod
    def seconds_at_next_local_midnight() -> int:
        """返回当前服务器本地时间距离次日 00:00 的秒数。"""
        remaining_ms = get_tomorrow_start_timestamp() - timestamp_now()
        return max(1, (remaining_ms + 999) // 1000)

    @staticmethod
    def next_reset_at() -> int:
        """返回每日额度下一次刷新的毫秒时间戳。"""
        return get_tomorrow_start_timestamp()

    @staticmethod
    def _validate_u_id(u_id: str) -> None:
        """校验额度作用域 ID。"""
        if not isinstance(u_id, str):
            raise ValueError(f"u_id must be string, type={type(u_id).__name__}")
        if not u_id:
            raise ValueError("u_id must not be empty")
        if ":" in u_id:
            raise ValueError(f"u_id must not contain ':', value={u_id!r}")

    @staticmethod
    def _validate_number(number: int) -> None:
        """校验单次额度消耗数量。"""
        if isinstance(number, bool) or not isinstance(number, int):
            raise ValueError(
                f"quota number must be integer, type={type(number).__name__}"
            )
        if number <= 0:
            raise ValueError(f"quota number must be positive, value={number}")
        if number > 10000:
            raise ValueError(f"quota number too large, value={number}, max=10000")


def _log_first_day_failure(
    operation: str,
    u_id: str,
    device_id: str | None,
    exc: Exception,
) -> None:
    """记录首日判定或登记失败，供下次下载自愈定位。"""
    logger.error(
        "quota_service_first_day_failed: "
        f"operation={operation}, u_id={u_id}, device_id={device_id}, "
        f"error={type(exc).__name__}: {exc}",
        exc_info=True,
    )


def _parse_redis_int(value: object) -> int:
    """把 Redis 字符串值解析成整数；缺失或异常值按 0 展示。"""
    if value is None:
        return 0
    try:
        if _is_redis_int_value(value):
            return int(value)
        return 0
    except (TypeError, ValueError):
        return 0


def _is_redis_int_value(
    value: object,
) -> TypeGuard[str | bytes | bytearray | int | float]:
    """收窄 Redis 中可按整数读取的标量类型。"""
    return isinstance(value, (str, bytes, bytearray, int, float))


quota_service = QuotaService()
